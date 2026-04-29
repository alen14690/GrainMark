/**
 * LLM 照片分析（M5-LLM-B）
 *
 * 职责：把一张照片喂给 OpenRouter 的 vision 模型，拿回"主体识别 + 光影建议 + 参数调整"。
 *
 * 流程：
 *   1. 校验前置条件（有 apiKey + 模型选了 + 用户勾了 opt-in）
 *   2. sharp 降采样原图到 768px JPEG，编成 base64 data URL
 *   3. 发 OpenRouter /chat/completions（OpenAI-compatible）
 *      - 走 structured output（response_format: json_object）
 *      - 30s 超时
 *   4. Zod 严校验 + clamp（所有数值调整 ±40 上限）
 *   5. 返回 AIAnalysisResult；任一环节失败都给分类错误
 *
 * 安全约束：
 *   - opt-in 未勾选直接拒绝（用户未同意上传）
 *   - 域名白名单硬编码 openrouter.ai
 *   - apiKey 只从 SecureVault 读，绝不落 log
 *   - 图片降到 768px（防隐私信息 OCR 泄漏 + 控制上传流量）
 *   - LLM 输出**不可信任**：clamp 所有数值、schema 拒绝未知字段
 */
import path from 'node:path'
import { z } from 'zod'
import type { AIAnalysisResult, AISuggestedAdjustments } from '../../../shared/types.js'
import { logger } from '../logger/logger.js'
import { orientImage, resolvePreviewBuffer } from '../raw/index.js'
import { getApiKeyForInternalUse, getPublicConfig } from './configStore.js'

// ---- 硬编码常量 ----

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const CHAT_ENDPOINT = `${OPENROUTER_BASE}/chat/completions`

const ANALYZE_TIMEOUT_MS = 30_000
/** 降采样边长；768 足够让 vision 模型识别主体，又不会上传大量数据 */
const DOWNSAMPLE_SIDE = 768
/** JPEG 质量（65 是 vision 模型能很清楚解读的下限，再低会糊） */
const DOWNSAMPLE_QUALITY = 65

// ---- clamp 硬约束（不信任 LLM 输出）----

/** tone.* 字段上下限（和 editStore / slider 的实际范围一致） */
const TONE_RANGE = 40
/** whiteBalance.* 字段上下限 */
const WB_RANGE = 30
/** clarity / saturation / vibrance 字段上下限 */
const AUX_RANGE = 40
/** colorGrading.*.h 范围 0~360；s,l 范围 ±40 */
const CG_SL_RANGE = 40
/** HSL 通道 h/s/l 上下限 */
const HSL_RANGE = 40

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(min, Math.min(max, v))
}

/** 合法 HSL 通道名（白名单，防 LLM 塞非法 key） */
const VALID_HSL_CHANNELS = new Set([
  'red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta',
])

/** 把 LLM 输出的对象做"硬安全 clamp"后返回 */
function clampAdjustments(raw: AISuggestedAdjustments): AISuggestedAdjustments {
  const out: AISuggestedAdjustments = {}
  if (raw.tone) {
    const t = raw.tone
    const tone: NonNullable<AISuggestedAdjustments['tone']> = {}
    const pairs: Array<[keyof NonNullable<AISuggestedAdjustments['tone']>, number | undefined]> = [
      ['exposure', t.exposure],
      ['contrast', t.contrast],
      ['highlights', t.highlights],
      ['shadows', t.shadows],
      ['whites', t.whites],
      ['blacks', t.blacks],
    ]
    for (const [k, src] of pairs) {
      if (typeof src === 'number') {
        const v = clamp(src, -TONE_RANGE, TONE_RANGE)
        if (v !== 0) tone[k] = v
      }
    }
    if (Object.keys(tone).length > 0) out.tone = tone
  }
  if (raw.whiteBalance) {
    const wb = raw.whiteBalance
    const temp = clamp(wb.temp ?? 0, -WB_RANGE, WB_RANGE)
    const tint = clamp(wb.tint ?? 0, -WB_RANGE, WB_RANGE)
    if (temp !== 0 || tint !== 0) out.whiteBalance = { temp, tint }
  }
  if (typeof raw.clarity === 'number') {
    const v = clamp(raw.clarity, -AUX_RANGE, AUX_RANGE)
    if (v !== 0) out.clarity = v
  }
  if (typeof raw.saturation === 'number') {
    const v = clamp(raw.saturation, -AUX_RANGE, AUX_RANGE)
    if (v !== 0) out.saturation = v
  }
  if (typeof raw.vibrance === 'number') {
    const v = clamp(raw.vibrance, -AUX_RANGE, AUX_RANGE)
    if (v !== 0) out.vibrance = v
  }
  if (raw.colorGrading) {
    const cg = raw.colorGrading
    const shadows = cg.shadows
      ? {
          h: clamp(cg.shadows.h ?? 0, 0, 360),
          s: clamp(cg.shadows.s ?? 0, -CG_SL_RANGE, CG_SL_RANGE),
          l: clamp(cg.shadows.l ?? 0, -CG_SL_RANGE, CG_SL_RANGE),
        }
      : undefined
    const highlights = cg.highlights
      ? {
          h: clamp(cg.highlights.h ?? 0, 0, 360),
          s: clamp(cg.highlights.s ?? 0, -CG_SL_RANGE, CG_SL_RANGE),
          l: clamp(cg.highlights.l ?? 0, -CG_SL_RANGE, CG_SL_RANGE),
        }
      : undefined
    const blending = cg.blending !== undefined ? clamp(cg.blending, 0, 100) : undefined
    const hasAny =
      (shadows && (shadows.s !== 0 || shadows.l !== 0)) ||
      (highlights && (highlights.s !== 0 || highlights.l !== 0))
    if (hasAny) {
      out.colorGrading = {}
      if (shadows) out.colorGrading.shadows = shadows
      if (highlights) out.colorGrading.highlights = highlights
      if (blending !== undefined) out.colorGrading.blending = blending
    }
  }

  // ---- M5-LLM-C 新增字段 clamp ----

  // Curves：控制点 {x,y} ∈ [0,255]，每通道最多 8 个点
  if (raw.curves) {
    const clampPt = (p: { x: number; y: number }) => ({
      x: clamp(Math.round(p.x), 0, 255),
      y: clamp(Math.round(p.y), 0, 255),
    })
    const curves: NonNullable<AISuggestedAdjustments['curves']> = {}
    for (const ch of ['rgb', 'r', 'g', 'b'] as const) {
      const pts = raw.curves[ch]
      if (Array.isArray(pts) && pts.length >= 2) {
        curves[ch] = pts.slice(0, 8).map(clampPt)
      }
    }
    if (Object.keys(curves).length > 0) out.curves = curves
  }

  // HSL 8 通道：h/s/l ∈ ±40，只保留合法通道名
  if (raw.hsl && typeof raw.hsl === 'object') {
    const hsl: Record<string, { h?: number; s?: number; l?: number }> = {}
    for (const [ch, adj] of Object.entries(raw.hsl)) {
      if (!VALID_HSL_CHANNELS.has(ch) || !adj) continue
      const entry: { h?: number; s?: number; l?: number } = {}
      if (typeof adj.h === 'number') { const v = clamp(adj.h, -HSL_RANGE, HSL_RANGE); if (v !== 0) entry.h = v }
      if (typeof adj.s === 'number') { const v = clamp(adj.s, -HSL_RANGE, HSL_RANGE); if (v !== 0) entry.s = v }
      if (typeof adj.l === 'number') { const v = clamp(adj.l, -HSL_RANGE, HSL_RANGE); if (v !== 0) entry.l = v }
      if (Object.keys(entry).length > 0) hsl[ch] = entry
    }
    if (Object.keys(hsl).length > 0) out.hsl = hsl as AISuggestedAdjustments['hsl']
  }

  // Grain：amount [0,50]、size [0.5,3]、roughness [0,1]
  if (raw.grain) {
    const grain: NonNullable<AISuggestedAdjustments['grain']> = {}
    if (typeof raw.grain.amount === 'number') grain.amount = clamp(raw.grain.amount, 0, 50)
    if (typeof raw.grain.size === 'number') grain.size = clamp(raw.grain.size, 0.5, 3)
    if (typeof raw.grain.roughness === 'number') grain.roughness = clamp(raw.grain.roughness, 0, 1)
    if (Object.keys(grain).length > 0) out.grain = grain
  }

  // Halation：amount [0,40]、threshold [150,255]、radius [1,20]
  if (raw.halation) {
    const halation: NonNullable<AISuggestedAdjustments['halation']> = {}
    if (typeof raw.halation.amount === 'number') halation.amount = clamp(raw.halation.amount, 0, 40)
    if (typeof raw.halation.threshold === 'number') halation.threshold = clamp(raw.halation.threshold, 150, 255)
    if (typeof raw.halation.radius === 'number') halation.radius = clamp(raw.halation.radius, 1, 20)
    if (Object.keys(halation).length > 0) out.halation = halation
  }

  // Vignette：amount [-60,+30]、midpoint [20,80]、roundness [-50,+50]、feather [20,80]
  if (raw.vignette) {
    const vig: NonNullable<AISuggestedAdjustments['vignette']> = {}
    if (typeof raw.vignette.amount === 'number') vig.amount = clamp(raw.vignette.amount, -60, 30)
    if (typeof raw.vignette.midpoint === 'number') vig.midpoint = clamp(raw.vignette.midpoint, 20, 80)
    if (typeof raw.vignette.roundness === 'number') vig.roundness = clamp(raw.vignette.roundness, -50, 50)
    if (typeof raw.vignette.feather === 'number') vig.feather = clamp(raw.vignette.feather, 20, 80)
    if (Object.keys(vig).length > 0) out.vignette = vig
  }

  // 理由只按需保留（已 clamp 掉的字段不留理由，用户看了会困惑）
  if (raw.reasons) out.reasons = raw.reasons
  return out
}

// ---- LLM 返回 JSON 的 Zod schema（strict，不让 LLM 塞未知字段）----

const HSLTripleSchema = z
  .object({
    h: z.number().optional(),
    s: z.number().optional(),
    l: z.number().optional(),
  })
  .strict()

const CurvePointSchema = z.object({ x: z.number(), y: z.number() }).strict()

const AdjustmentsSchema = z
  .object({
    tone: z
      .object({
        exposure: z.number().optional(),
        contrast: z.number().optional(),
        highlights: z.number().optional(),
        shadows: z.number().optional(),
        whites: z.number().optional(),
        blacks: z.number().optional(),
      })
      .strict()
      .optional(),
    whiteBalance: z.object({ temp: z.number().optional(), tint: z.number().optional() }).strict().optional(),
    clarity: z.number().optional(),
    saturation: z.number().optional(),
    vibrance: z.number().optional(),
    colorGrading: z
      .object({
        shadows: HSLTripleSchema.optional(),
        highlights: HSLTripleSchema.optional(),
        blending: z.number().optional(),
      })
      .strict()
      .optional(),
    // M5-LLM-C：曲线（RGB + 通道）
    curves: z
      .object({
        rgb: z.array(CurvePointSchema).max(8).optional(),
        r: z.array(CurvePointSchema).max(8).optional(),
        g: z.array(CurvePointSchema).max(8).optional(),
        b: z.array(CurvePointSchema).max(8).optional(),
      })
      .strict()
      .optional(),
    // M5-LLM-C：HSL 8 通道
    hsl: z
      .object({
        red: HSLTripleSchema.optional(),
        orange: HSLTripleSchema.optional(),
        yellow: HSLTripleSchema.optional(),
        green: HSLTripleSchema.optional(),
        aqua: HSLTripleSchema.optional(),
        blue: HSLTripleSchema.optional(),
        purple: HSLTripleSchema.optional(),
        magenta: HSLTripleSchema.optional(),
      })
      .strict()
      .optional(),
    // M5-LLM-C：胶片颗粒
    grain: z
      .object({
        amount: z.number().optional(),
        size: z.number().optional(),
        roughness: z.number().optional(),
      })
      .strict()
      .optional(),
    // M5-LLM-C：高光溢光
    halation: z
      .object({
        amount: z.number().optional(),
        threshold: z.number().optional(),
        radius: z.number().optional(),
      })
      .strict()
      .optional(),
    // M5-LLM-C：暗角 / 视觉引导
    vignette: z
      .object({
        amount: z.number().optional(),
        midpoint: z.number().optional(),
        roundness: z.number().optional(),
        feather: z.number().optional(),
      })
      .strict()
      .optional(),
    reasons: z.record(z.string(), z.string()).optional(),
  })
  .strict()

const AnalysisSchema = z
  .object({
    summary: z.string().min(5).max(600),
    subject: z.string().min(2).max(200),
    environment: z.string().min(2).max(300),
    diagnosis: z.array(z.string().min(2).max(200)).min(1).max(8),
  })
  .strict()

const LLMResponseSchema = z
  .object({
    analysis: AnalysisSchema,
    adjustments: AdjustmentsSchema,
  })
  .strict()

// ---- Prompt 设计（M5-LLM-C：5 维分析）----

const SYSTEM_PROMPT = `你是资深摄影后期顾问，专精胶片美学与光影叙事。用户会给你一张照片原图，你必须完成以下 5 项分析并给出参数建议：

### 1. 主体与构图
- 识别视觉主角（人/物/景/抽象）及其在画面中的位置
- 判断环境元素是衬托还是干扰主体
- 若需要收拢视线到主体，给出 vignette 暗角建议

### 2. 光影与明暗
- 诊断高光/阴影区域的细节丢失（高光死白？暗部死黑？）
- 判断整体曝光偏向
- 给出 tone（曝光/对比度/高光/阴影/白阶/黑阶）
- 若需要精细控制明暗层次，给出 curves 曲线控制点
  - curves 格式：每条曲线 2~5 个 {x,y} 控制点（x=输入亮度 0~255，y=输出亮度 0~255）
  - 可调通道：rgb（主曲线）/ r / g / b，只输出需要调的通道

### 3. 色彩与白平衡
- 判断色温偏移方向（偏冷/偏暖/混合光源）
- 识别主要色彩（占画面 >15% 的色相）
- 给出 whiteBalance（色温/色调）
- 给出 hsl 通道建议：8 个通道 red/orange/yellow/green/aqua/blue/purple/magenta
  - 每通道可调 h(色相偏移)/s(饱和度)/l(明度)，只输出需要调整的通道和维度
- 给出 colorGrading 色调分离（阴影/高光冷暖色偏）

### 4. 质感与氛围
- 评估画面噪点水平、锐度、胶片感需求
- 给出 clarity（清晰度/中间调对比）+ saturation + vibrance
- 若照片适合胶片氛围，给出：
  - grain（颗粒：amount 强度 0~50，size 尺寸 0.5~3，roughness 粗糙度 0~1）
  - halation（高光溢光：amount 0~40，threshold 触发亮度 150~255，radius 扩散 1~20）

### 5. 综合配方
- summary 字段：1~2 句话概括修图方向（如"提亮主体面部 + 压暗杂乱背景 + 暖调胶片氛围"）
- diagnosis 数组：2~6 条用户可读的诊断

**硬约束**（违反视为错误输出）：
- tone/clarity/saturation/vibrance：-40 ~ +40
- whiteBalance：-30 ~ +30
- hsl 各通道 h/s/l：-40 ~ +40
- colorGrading.h：0~360，s/l：-40 ~ +40
- curves 控制点 x/y：0~255，每通道 2~5 个点
- grain.amount：0~50，grain.size：0.5~3，grain.roughness：0~1
- halation.amount：0~40，halation.threshold：150~255，halation.radius：1~20
- vignette.amount：-60~+30，midpoint：20~80，roundness：-50~+50，feather：20~80
- 原则："微调而非重塑"——强化主体光影层次，压低环境抢戏元素
- 诊断必须对用户可见（"主体面部偏暗"而非"直方图 30~60 区段不足"）
- 不需要的字段直接不输出（不要给 0 或 null）

**输出格式**：严格 JSON，不含任何注释或解释性前后文。结构：
{
  "analysis": { "summary": "string", "subject": "string", "environment": "string", "diagnosis": ["string", ...] },
  "adjustments": {
    "tone": { "exposure": N, "contrast": N, ... },
    "whiteBalance": { "temp": N, "tint": N },
    "curves": { "rgb": [{"x":0,"y":0}, {"x":128,"y":140}, {"x":255,"y":250}], "r": [...] },
    "hsl": { "orange": {"h":5, "s":10}, "blue": {"s":-15, "l":-5} },
    "clarity": N, "saturation": N, "vibrance": N,
    "colorGrading": { "shadows": {"h":N,"s":N,"l":N}, "highlights": {...}, "blending": N },
    "grain": { "amount": N, "size": N, "roughness": N },
    "halation": { "amount": N, "threshold": N, "radius": N },
    "vignette": { "amount": N, "midpoint": N, "roundness": N, "feather": N },
    "reasons": { "tone.shadows": "恢复暗部细节", "hsl.orange": "肤色更健康", ... }
  }
}

语言：所有字符串用简体中文。`

// ---- 主入口 ----

export async function analyzePhoto(photoPath: string): Promise<AIAnalysisResult> {
  const pub = getPublicConfig()

  // ---- 前置校验 ----
  if (!pub.hasApiKey || pub.provider !== 'openrouter') {
    return {
      ok: false,
      errorKind: 'no-config',
      message: '未配置 OpenRouter apiKey，请先到 Settings → AI 配置',
    }
  }
  if (!pub.optInUploadImages) {
    return {
      ok: false,
      errorKind: 'not-opted-in',
      message: '尚未同意上传照片到云端；请到 Settings → AI 勾选同意项',
    }
  }
  const model = pub.model?.trim()
  if (!model) {
    return { ok: false, errorKind: 'no-config', message: '未选择模型' }
  }

  const apiKey = getApiKeyForInternalUse()
  if (!apiKey) {
    return { ok: false, errorKind: 'invalid-key', message: '凭证读取失败（系统加密不可用？）' }
  }

  // ---- 1. 降采样原图 ----
  let imageDataUrl: string
  try {
    imageDataUrl = await buildImageDataUrl(photoPath)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('llm.analyze.image-prep-failed', { path: path.basename(photoPath), err: msg })
    return { ok: false, errorKind: 'image-prep-failed', message: `原图处理失败：${msg}` }
  }

  // ---- 2. 调 LLM ----
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS)
  const t0 = Date.now()
  let latencyMs = 0
  try {
    const resp = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://grainmark.app',
        'X-Title': 'GrainMark',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        temperature: 0.3, // 微调风格适合低温
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: '请分析这张照片并给出建议。' },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    })
    latencyMs = Date.now() - t0

    if (!resp.ok) {
      const kind = classifyHttpError(resp.status)
      logger.warn('llm.analyze.http-failed', { status: resp.status, latencyMs, kind })
      return {
        ok: false,
        errorKind: kind,
        message: `OpenRouter 返回 ${resp.status}（${humanizeHttpError(resp.status)}）`,
      }
    }

    // ---- 3. 解析 ----
    const raw = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const content = raw.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      return {
        ok: false,
        errorKind: 'invalid-response',
        message: 'LLM 返回为空或格式错误',
      }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(stripJsonFence(content))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, errorKind: 'invalid-response', message: `JSON 解析失败：${msg}` }
    }

    const check = LLMResponseSchema.safeParse(parsed)
    if (!check.success) {
      logger.warn('llm.analyze.schema-failed', { issueCount: check.error.issues.length })
      return {
        ok: false,
        errorKind: 'invalid-response',
        message: `响应 schema 不符：${check.error.issues[0]?.message ?? 'unknown'}`,
      }
    }

    // ---- 4. clamp + 返回 ----
    const adjustments = clampAdjustments(check.data.adjustments)

    logger.info('llm.analyze.ok', {
      model,
      latencyMs,
      hasAdjustments: Object.keys(adjustments).length > 0,
      diagnosisCount: check.data.analysis.diagnosis.length,
    })

    return {
      ok: true,
      analysis: check.data.analysis,
      adjustments,
      meta: {
        model,
        latencyMs,
        promptTokens: raw.usage?.prompt_tokens,
        completionTokens: raw.usage?.completion_tokens,
      },
    }
  } catch (err) {
    latencyMs = Date.now() - t0
    const msg = err instanceof Error ? err.message : String(err)
    // AbortError 代表超时；其它当作 network
    if (controller.signal.aborted) {
      return { ok: false, errorKind: 'timeout', message: `请求超时（${ANALYZE_TIMEOUT_MS / 1000}s）` }
    }
    logger.warn('llm.analyze.fetch-failed', { latencyMs, err: msg })
    return { ok: false, errorKind: 'network', message: `网络错误：${msg}` }
  } finally {
    clearTimeout(timer)
  }
}

// ---- 内部工具 ----

/** 从原图路径读取 → sharp 降采样到 768px JPEG → base64 data URL */
async function buildImageDataUrl(photoPath: string): Promise<string> {
  // resolvePreviewBuffer 统一处理 RAW/HEIC/JPEG，返回可直接喂 sharp 的 buffer + 原始方向
  const { buffer, sourceOrientation } = await resolvePreviewBuffer(photoPath)

  // 统一 orientation 处理（Single Source of Truth：orientImage）
  const img = orientImage(buffer, sourceOrientation)

  const jpegBuffer = await img
    .resize({
      width: DOWNSAMPLE_SIDE,
      height: DOWNSAMPLE_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: DOWNSAMPLE_QUALITY, mozjpeg: true })
    .toBuffer()

  return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`
}

/** 如果 LLM 在 JSON 前后夹了 ```json ... ``` 围栏，剥掉 */
function stripJsonFence(s: string): string {
  const trimmed = s.trim()
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
  }
  return trimmed
}

function classifyHttpError(status: number): 'invalid-key' | 'rate-limit' | 'unknown' {
  if (status === 401 || status === 403) return 'invalid-key'
  if (status === 429) return 'rate-limit'
  return 'unknown'
}

function humanizeHttpError(status: number): string {
  if (status === 401 || status === 403) return 'apiKey 无效或被拒'
  if (status === 429) return '触发速率限制'
  if (status >= 500) return '服务器错误'
  return '未知错误'
}

// ---- 对测试暴露：clamp 函数（注入 LLM 胡编数据验证护栏）----
export const __test__ = { clampAdjustments, LLMResponseSchema }
