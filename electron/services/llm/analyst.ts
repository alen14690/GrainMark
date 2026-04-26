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
import sharp from 'sharp'
import { z } from 'zod'
import type { AIAnalysisResult, AISuggestedAdjustments } from '../../../shared/types.js'
import { logger } from '../logger/logger.js'
import { orientationToRotationDegrees, resolvePreviewBuffer } from '../raw/index.js'
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

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(min, Math.min(max, v))
}

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

// ---- Prompt 设计 ----

const SYSTEM_PROMPT = `你是资深摄影后期顾问。用户会给你一张照片原图，你必须：

1. 识别主体（谁/什么是这张照片的视觉主角）
2. 识别环境（次要信息，什么在干扰或衬托主体）
3. 诊断光影问题（主体够不够亮/立体？背景是否抢戏？色温是否偏移？）
4. 给出"全局参数"调整建议：tone(曝光/对比度/高光/阴影/白阶/黑阶) + whiteBalance(色温/色调) + clarity/saturation/vibrance + colorGrading(阴影/高光色调分离)

**硬约束**（违反视为错误输出）：
- 数值范围：tone/clarity/saturation/vibrance 取 -40 ~ +40；whiteBalance 取 -30 ~ +30；colorGrading.h 取 0~360，s/l 取 -40 ~ +40
- 原则："微调而非重塑"——强化主体光影层次，压低环境抢戏元素
- 诊断必须对用户可见（"主体面部偏暗"而不是"直方图 30~60 区段不足"）
- 不需要的字段直接不输出（不要给 0 或 null）

**输出格式**：严格 JSON，不含任何注释或解释性前后文。结构：
{
  "analysis": { "summary": string, "subject": string, "environment": string, "diagnosis": [string, ...] },
  "adjustments": {
    "tone": { "exposure": number, ... } ,
    "whiteBalance": { "temp": number, "tint": number } ,
    "clarity": number, "saturation": number, "vibrance": number,
    "colorGrading": { "shadows": {...}, "highlights": {...}, "blending": number },
    "reasons": { "shadows": "string 一句话解释为什么提阴影", ... }
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

  // 对 RAW：用 sourceOrientation 显式旋转；对普通 JPEG：sharp.rotate() 会自动读 EXIF
  const rotateDeg = orientationToRotationDegrees(sourceOrientation)

  let img = sharp(buffer, { failOn: 'none' })
  if (rotateDeg) {
    img = img.rotate(rotateDeg)
  } else {
    img = img.rotate() // 让 sharp 读 EXIF 自动旋
  }

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
