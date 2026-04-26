/**
 * llmCatalog 单元测试 — M5-LLM-A
 *
 * 防的真实 bug 模式：
 *   - 兜底列表里出现已下架 / 虚构的模型名（本轮从"硬编码过时模型"中学到的教训）
 *   - 推荐挑选把免费模型当旗舰（摄影顾问需要稳定延迟，免费限速大）
 *   - 推荐 flagship/balanced/cheap 三个全指向同一模型（无意义）
 *   - 推荐 reason 文案破坏（formatPrice NaN / Infinity）
 *   - 未配置 apiKey 时意外发起网络请求
 *
 * 不测：
 *   - 真实 fetch HTTP（那是集成测试的事，CI 不跑云端）
 *   - 模型列表里每一条字段 shape（会和 OpenRouter 格式变化强耦合）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Vault / KV mock（复用 llmConfigStore.test 的模式）
class MockVault {
  private store = new Map<string, string>()
  isAvailable() {
    return true
  }
  get(k: string): string | null {
    return this.store.get(k) ?? null
  }
  set(k: string, v: string) {
    this.store.set(k, v)
  }
  remove(k: string) {
    return this.store.delete(k)
  }
  keys() {
    return [...this.store.keys()]
  }
}
const kvStore = new Map<string, unknown>()
const kvMock = {
  get: <T>(key: string) => (kvStore.get(key) as T | undefined) ?? null,
  set: (key: string, value: unknown) => {
    kvStore.set(key, value)
    return Promise.resolve()
  },
  all: () => Object.fromEntries(kvStore),
}
vi.mock('../../electron/services/storage/init.js', () => ({
  getSettingsKV: () => kvMock,
}))
vi.mock('../../electron/services/logger/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

let catalog: typeof import('../../electron/services/llm/catalog')
let cs: typeof import('../../electron/services/llm/configStore')

beforeEach(async () => {
  kvStore.clear()
  vi.resetModules()
  catalog = await import('../../electron/services/llm/catalog')
  cs = await import('../../electron/services/llm/configStore')
  cs.setLLMVault(new MockVault() as never)
})

describe('FALLBACK_MODELS · 内置兜底列表质量', () => {
  it('列表非空，且每条都有合法 id / supportsVision=true / createdAt 有值', () => {
    const fallback = catalog._getFallbackModelsForTest()
    expect(fallback.length).toBeGreaterThanOrEqual(3)
    for (const m of fallback) {
      expect(m.id, 'missing id').toMatch(/^[a-z0-9][a-z0-9._:/\-]+$/)
      expect(m.supportsVision, `${m.id} 必须支持 vision`).toBe(true)
      expect(m.contextLength, `${m.id} contextLength 必须 > 0`).toBeGreaterThan(0)
      // 兜底列表都是付费模型（我们不把免费模型放兜底，避免限速延迟）
      expect(m.isFree, `${m.id} 不应是免费模型`).toBe(false)
    }
  })

  it('必须包含 2026-04 已确认存在的旗舰（Claude Opus 4.7 / GPT-5.5 / Gemini 3.1 Pro Preview）', () => {
    const fallback = catalog._getFallbackModelsForTest()
    const ids = fallback.map((m) => m.id)
    // 这些是拉 OpenRouter /models 时确实返回的 id（2026-04-26）
    expect(ids).toContain('anthropic/claude-opus-4.7')
    expect(ids).toContain('openai/gpt-5.5-pro')
    expect(ids).toContain('google/gemini-3.1-pro-preview')
  })

  it('绝不出现已下架的旧模型名（本次修复的直接验证）', () => {
    const fallback = catalog._getFallbackModelsForTest()
    const ids = fallback.map((m) => m.id)
    // 这些是我上一版错误硬编码的旧模型，已从 OpenRouter 当前 catalog 下架
    expect(ids).not.toContain('openai/gpt-4o-mini')
    expect(ids).not.toContain('openai/gpt-4o')
    expect(ids).not.toContain('google/gemini-2.0-flash-exp')
    expect(ids).not.toContain('anthropic/claude-3.5-sonnet')
  })
})

describe('listModels · 未配置 apiKey 时快速返回兜底，不发起网络', () => {
  it('无 apiKey → fallback=no-config，且 fetch 未被调用', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('should not call'))
    const cat = await catalog.listModels()
    expect(cat.fallback).toBe('no-config')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(cat.models.length).toBeGreaterThan(0) // 兜底非空
    expect(cat.recommended.length).toBeGreaterThan(0)
    fetchSpy.mockRestore()
  })

  // UI 契约（2026-04-26 视觉 bug 修复回归）：
  // LLMConfigCard 挂载时无条件调用 listModels；此时绝大多数用户还未保存 apiKey。
  // 若返回的 models 为空，下拉框就是空的 —— 正是截图里的 bug 表现。
  // 本测试锁死"首次访问（无 apiKey）也必须有可选模型"，防止退化。
  it('挂载首次调用契约：即便 no-config 也必须返回至少 3 个 vision 模型供下拉展示', async () => {
    const cat = await catalog.listModels()
    expect(cat.models.length).toBeGreaterThanOrEqual(3)
    // 每一个兜底模型都必须支持 vision（否则 UI 下拉显示了也没意义）
    for (const m of cat.models) {
      expect(m.supportsVision, `${m.id} must support vision`).toBe(true)
    }
    // 推荐三档至少有 2 条（flagship + cheap 必出现）
    expect(cat.recommended.length).toBeGreaterThanOrEqual(2)
  })
})

describe('listModels · 成功路径的智能筛选与推荐', () => {
  it('过滤掉非 vision 模型（input_modalities 不含 image 的）', async () => {
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-xxxxxxxxxxxxxxxx' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            // 仅文本模型 —— 应被过滤
            {
              id: 'text-only/llm',
              name: 'Text Only',
              context_length: 128000,
              pricing: { prompt: '0.000001', completion: '0.000002' },
              architecture: { input_modalities: ['text'] },
              created: 1_770_000_000,
            },
            // vision 模型 —— 应保留
            {
              id: 'vision/model',
              name: 'Vision Model',
              context_length: 200000,
              pricing: { prompt: '0.000002', completion: '0.00001' },
              architecture: { input_modalities: ['text', 'image'] },
              created: 1_776_000_000,
            },
          ],
        }),
        { status: 200 },
      ),
    )

    const cat = await catalog.listModels()
    expect(cat.fallback).toBeUndefined()
    expect(cat.models.map((m) => m.id)).toEqual(['vision/model'])
  })

  it('按 createdAt 降序排（最新在前）', async () => {
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-xxxxxxxxxxxxxxxx' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            mkModel('old/v', 1_770_000_000),
            mkModel('new/v', 1_777_000_000),
            mkModel('mid/v', 1_773_000_000),
          ],
        }),
        { status: 200 },
      ),
    )
    const cat = await catalog.listModels()
    expect(cat.models.map((m) => m.id)).toEqual(['new/v', 'mid/v', 'old/v'])
  })

  it('推荐三档：flagship/balanced/cheap 指向不同模型（不重复）', async () => {
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-xxxxxxxxxxxxxxxx' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            // flagship：$30/M
            mkModel('pro/flagship', 1_777_000_000, 0.00003, 0.00018),
            // balanced：$3/M
            mkModel('pro/balanced', 1_776_000_000, 0.000003, 0.000015),
            // cheap：$0.25/M
            mkModel('pro/cheap', 1_775_000_000, 0.00000025, 0.0000015),
          ],
        }),
        { status: 200 },
      ),
    )
    const cat = await catalog.listModels()
    const tiers = cat.recommended.reduce<Record<string, string>>((acc, r) => {
      acc[r.tier] = r.model.id
      return acc
    }, {})
    expect(tiers.flagship).toBe('pro/flagship')
    expect(tiers.balanced).toBe('pro/balanced')
    expect(tiers.cheap).toBe('pro/cheap')
    // 不重复
    expect(new Set(Object.values(tiers)).size).toBe(3)
  })

  it('推荐只挑付费模型（免费模型限速大，不适合摄影顾问）', async () => {
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-xxxxxxxxxxxxxxxx' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            // 免费但最便宜 —— 不应成为 cheap 推荐
            mkModel('free/v', 1_777_000_000, 0, 0),
            // 付费但便宜
            mkModel('paid/cheap', 1_776_000_000, 0.00000025, 0.0000015),
            // 付费旗舰
            mkModel('paid/flagship', 1_775_000_000, 0.00003, 0.00018),
          ],
        }),
        { status: 200 },
      ),
    )
    const cat = await catalog.listModels()
    const recommendedIds = cat.recommended.map((r) => r.model.id)
    expect(recommendedIds).not.toContain('free/v')
    // 但 free 仍然应该出现在完整 models 列表里，由用户手动选
    expect(cat.models.map((m) => m.id)).toContain('free/v')
  })

  it('价格字段从每 token 美元（OpenRouter 返回）正确换算为每 M-token 美元', async () => {
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-xxxxxxxxxxxxxxxx' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [mkModel('px/test', 1_777_000_000, 0.000005, 0.000025)], // $5/M prompt, $25/M completion
        }),
        { status: 200 },
      ),
    )
    const cat = await catalog.listModels()
    expect(cat.models[0]!.pricePromptPerMTok).toBeCloseTo(5)
    expect(cat.models[0]!.priceCompletionPerMTok).toBeCloseTo(25)
  })
})

describe('listModels · 网络失败时降级路径', () => {
  it('HTTP 401 → fallback=invalid-key，返回兜底列表', async () => {
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-xxxxxxxxxxxxxxxx' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unauthorized', { status: 401 }))
    const cat = await catalog.listModels()
    expect(cat.fallback).toBe('invalid-key')
    expect(cat.models.length).toBeGreaterThan(0)
    expect(cat.fetchedAt).toBeNull()
  })

  it('HTTP 429 → fallback=rate-limit', async () => {
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-xxxxxxxxxxxxxxxx' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }))
    const cat = await catalog.listModels()
    expect(cat.fallback).toBe('rate-limit')
  })

  it('网络抛错 → fallback=network，兜底列表仍可用', async () => {
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-xxxxxxxxxxxxxxxx' })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND'))
    const cat = await catalog.listModels()
    expect(cat.fallback).toBe('network')
    expect(cat.models.length).toBeGreaterThan(0)
    // 推荐也非空（对 FALLBACK_MODELS 做推荐挑选）
    expect(cat.recommended.length).toBeGreaterThan(0)
  })

  it('返回非法 JSON → 走 catch 分支，不崩', async () => {
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-xxxxxxxxxxxxxxxx' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 200 }))
    const cat = await catalog.listModels()
    // 即便 200 但 body 非法，也应该被空列表消化（不崩）
    expect(Array.isArray(cat.models)).toBe(true)
  })
})

// ============== helper ==============

function mkModel(id: string, created: number, prompt = 0.000001, completion = 0.000005) {
  return {
    id,
    name: id,
    context_length: 128000,
    pricing: { prompt: String(prompt), completion: String(completion) },
    architecture: { input_modalities: ['text', 'image'] },
    created,
  }
}
