/**
 * LLM 模型目录拉取（M5-LLM-A · OpenRouter only）
 *
 * 职责：
 *   1. 拉 https://openrouter.ai/api/v1/models 的实时列表
 *   2. 过滤出支持 image 输入的 vision 模型（input_modalities 含 'image'）
 *   3. 按 createdAt 降序（最新在前），同时产出 'flagship/balanced/cheap' 三档推荐
 *   4. 网络失败时返回兜底列表（使用 2026-04 真实存在的模型作为最后防线）
 *
 * 为什么拆独立模块（不放 client.ts）：
 *   - client.ts 的职责是"发起 LLM 业务调用"（B 阶段要做图像分析）
 *   - 本模块职责是"目录维护"，生命周期不同，测试点也不同
 *
 * 安全：
 *   - /models 端点是 OpenRouter 免费公开元数据（不传 apiKey 也能拉），
 *     但我们传 Bearer 以便 OpenRouter 侧做用户级限额 / 记账（符合 OR 推荐用法）
 *   - 5s 超时（比 testConnection 更短 —— 下拉框应该不让用户等太久）
 *   - 返回数据经过 shape 白名单过滤，**不透传** OpenRouter 返回的任意字段到 renderer，
 *     避免未来 OR 加了什么字段被意外消费到
 */
import type { LLMModelCatalog, LLMModelEntry, LLMTestResult } from '../../../shared/types.js'
import { logger } from '../logger/logger.js'
import { getApiKeyForInternalUse, getPublicConfig } from './configStore.js'

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const LIST_TIMEOUT_MS = 5_000

/**
 * 2026-04-26 的真实旗舰兜底列表（API 拉不通时使用）。
 * 维护规则：这些模型必须是我在真实 OpenRouter catalog 里亲眼确认存在的。
 * 若 OR 删除/改名，本地测试也会暴露（连接失败），届时再手动同步。
 */
const FALLBACK_MODELS: LLMModelEntry[] = [
  {
    id: 'openai/gpt-5.5-pro',
    name: 'OpenAI: GPT-5.5 Pro',
    contextLength: 1_050_000,
    pricePromptPerMTok: 30,
    priceCompletionPerMTok: 180,
    supportsVision: true,
    isFree: false,
    createdAt: 1_777_051_896,
  },
  {
    id: 'openai/gpt-5.5',
    name: 'OpenAI: GPT-5.5',
    contextLength: 1_050_000,
    pricePromptPerMTok: 5,
    priceCompletionPerMTok: 30,
    supportsVision: true,
    isFree: false,
    createdAt: 1_777_051_893,
  },
  {
    id: 'anthropic/claude-opus-4.7',
    name: 'Anthropic: Claude Opus 4.7',
    contextLength: 1_000_000,
    pricePromptPerMTok: 5,
    priceCompletionPerMTok: 25,
    supportsVision: true,
    isFree: false,
    createdAt: 1_776_351_100,
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    name: 'Anthropic: Claude Sonnet 4.6',
    contextLength: 1_000_000,
    pricePromptPerMTok: 3,
    priceCompletionPerMTok: 15,
    supportsVision: true,
    isFree: false,
    createdAt: 1_771_342_990,
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    name: 'Google: Gemini 3.1 Pro Preview',
    contextLength: 1_048_576,
    pricePromptPerMTok: 2,
    priceCompletionPerMTok: 12,
    supportsVision: true,
    isFree: false,
    createdAt: 1_771_509_627,
  },
  {
    id: 'google/gemini-3.1-flash-lite-preview',
    name: 'Google: Gemini 3.1 Flash Lite Preview',
    contextLength: 1_048_576,
    pricePromptPerMTok: 0.25,
    priceCompletionPerMTok: 1.5,
    supportsVision: true,
    isFree: false,
    createdAt: 1_772_512_673,
  },
  {
    id: 'openai/gpt-5.4-mini',
    name: 'OpenAI: GPT-5.4 Mini',
    contextLength: 400_000,
    pricePromptPerMTok: 0.75,
    priceCompletionPerMTok: 4.5,
    supportsVision: true,
    isFree: false,
    createdAt: 1_773_748_178,
  },
]

/** OpenRouter /models 的单条原始结构（只声明我们消费的字段，不关心其它） */
interface RawModelRecord {
  id?: unknown
  name?: unknown
  context_length?: unknown
  created?: unknown
  pricing?: {
    prompt?: unknown
    completion?: unknown
  }
  architecture?: {
    input_modalities?: unknown
  }
}

/** 主入口：拿目录（成功 → 实时；失败 → 兜底） */
export async function listModels(): Promise<LLMModelCatalog> {
  const models = await fetchAndNormalize()
  if (!models.ok) {
    return {
      fetchedAt: null,
      models: FALLBACK_MODELS,
      recommended: pickRecommendations(FALLBACK_MODELS),
      fallback: models.errorKind,
    }
  }
  const sorted = models.data
    .filter((m) => m.supportsVision) // 只保留 vision 模型（摄影顾问必需）
    .sort(sortByNewest)
  return {
    fetchedAt: Date.now(),
    models: sorted,
    recommended: pickRecommendations(sorted),
  }
}

interface FetchOk {
  ok: true
  data: LLMModelEntry[]
}
interface FetchErr {
  ok: false
  errorKind: NonNullable<LLMTestResult['errorKind']>
}

async function fetchAndNormalize(): Promise<FetchOk | FetchErr> {
  const pub = getPublicConfig()
  // 未配置时也允许拉（/models 可匿名访问）—— 但我们主动返回兜底，避免制造无 key 状态下的网络流量
  if (!pub.hasApiKey) {
    return { ok: false, errorKind: 'no-config' }
  }
  const apiKey = getApiKeyForInternalUse()
  if (!apiKey) {
    return { ok: false, errorKind: 'invalid-key' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS)
  try {
    const resp = await fetch(OPENROUTER_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://grainmark.app',
        'X-Title': 'GrainMark',
        'User-Agent': 'GrainMark/0.1 (+llm-catalog)',
      },
      signal: controller.signal,
    })
    if (!resp.ok) {
      logger.warn('llm.catalog.http', { status: resp.status })
      return { ok: false, errorKind: classifyStatus(resp.status) }
    }
    const json = (await resp.json().catch(() => null)) as { data?: unknown[] } | null
    const raw = Array.isArray(json?.data) ? (json!.data as RawModelRecord[]) : []
    return { ok: true, data: raw.map(toEntry).filter(isSafeEntry) }
  } catch (err) {
    logger.warn('llm.catalog.failed', { err: (err as Error).message })
    return { ok: false, errorKind: isAbortError(err) ? 'network' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/** OpenRouter 返回的是每 token 美元价（字符串）；UI 习惯"美元/M-token" */
function toEntry(raw: RawModelRecord): LLMModelEntry | null {
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null
  const name = typeof raw.name === 'string' ? raw.name : raw.id
  const ctx = typeof raw.context_length === 'number' ? raw.context_length : 0
  const prompt = safeNum(raw.pricing?.prompt)
  const completion = safeNum(raw.pricing?.completion)
  const modalities = Array.isArray(raw.architecture?.input_modalities)
    ? (raw.architecture!.input_modalities! as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
  const supportsVision = modalities.includes('image')
  const created = typeof raw.created === 'number' && Number.isFinite(raw.created) ? raw.created : null
  return {
    id: raw.id,
    name,
    contextLength: ctx,
    pricePromptPerMTok: prompt * 1_000_000,
    priceCompletionPerMTok: completion * 1_000_000,
    supportsVision,
    isFree: prompt === 0 && completion === 0,
    createdAt: created,
  }
}

function safeNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** 白名单护栏：上面 toEntry 的返回可能是 null（字段缺失），这里统一兜底 */
function isSafeEntry(x: LLMModelEntry | null): x is LLMModelEntry {
  return x !== null && typeof x.id === 'string' && x.id.length > 0
}

function sortByNewest(a: LLMModelEntry, b: LLMModelEntry): number {
  const ca = a.createdAt ?? 0
  const cb = b.createdAt ?? 0
  return cb - ca
}

/**
 * 推荐逻辑（摄影顾问场景）：
 *   - flagship：按 pricePromptPerMTok 从高到低排（昂贵 ≈ 顶级），取第一条
 *   - balanced：pricePromptPerMTok 在 [1, 10] 美元/M-token 区间，且最新
 *   - cheap：非免费 + 最便宜 + 支持 vision
 *
 * 不选免费模型作为推荐：免费模型通常限速重，摄影顾问对延迟敏感；
 * 用户可手动从下拉框里挑。
 */
function pickRecommendations(models: LLMModelEntry[]): LLMModelCatalog['recommended'] {
  const paidVision = models.filter((m) => !m.isFree && m.supportsVision)
  if (paidVision.length === 0) return []

  const byPriceDesc = [...paidVision].sort((a, b) => b.pricePromptPerMTok - a.pricePromptPerMTok)
  const byPriceAsc = [...paidVision].sort((a, b) => a.pricePromptPerMTok - b.pricePromptPerMTok)

  const flagship = byPriceDesc[0]!
  const cheap = byPriceAsc[0]!
  // balanced：价格 [1, 10]，且 createdAt 尽量新；若无此区间，取 flagship 之后的第二名
  const balanced =
    paidVision.filter((m) => m.pricePromptPerMTok >= 1 && m.pricePromptPerMTok <= 10).sort(sortByNewest)[0] ??
    byPriceDesc[1] ??
    flagship

  const out: LLMModelCatalog['recommended'] = []
  out.push({
    tier: 'flagship',
    model: flagship,
    reason: `旗舰 · ${formatPrice(flagship.pricePromptPerMTok)}/M 输入 token`,
  })
  if (balanced.id !== flagship.id) {
    out.push({
      tier: 'balanced',
      model: balanced,
      reason: `推荐 · 质量与价格平衡（${formatPrice(balanced.pricePromptPerMTok)}/M）`,
    })
  }
  if (cheap.id !== flagship.id && cheap.id !== balanced.id) {
    out.push({
      tier: 'cheap',
      model: cheap,
      reason: `经济 · 最便宜的 vision 模型（${formatPrice(cheap.pricePromptPerMTok)}/M）`,
    })
  }
  return out
}

function formatPrice(usd: number): string {
  if (usd === 0) return '免费'
  if (usd < 1) return `$${usd.toFixed(2)}`
  if (usd < 10) return `$${usd.toFixed(1)}`
  return `$${usd.toFixed(0)}`
}

function classifyStatus(status: number): NonNullable<LLMTestResult['errorKind']> {
  if (status === 401 || status === 403) return 'invalid-key'
  if (status === 429) return 'rate-limit'
  return 'unknown'
}

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError'
}

/** 测试桩：外部可注入的兜底列表（测试用，不走 getPublicConfig / fetch） */
export function _getFallbackModelsForTest(): LLMModelEntry[] {
  return FALLBACK_MODELS
}
