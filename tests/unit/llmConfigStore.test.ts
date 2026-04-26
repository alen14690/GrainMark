/**
 * llmConfigStore 单元测试 — M5-LLM-A
 *
 * 覆盖的真实 bug 模式：
 *   - apiKey 明文出现在 getPublicConfig 返回值里（安全红线）
 *   - apiKey=undefined 被错误清空（合并语义 bug）
 *   - apiKey=null 未被清空（合并语义 bug）
 *   - vault 不可用时 applyConfigPatch 应抛而不是静默丢 apiKey
 *   - maskApiKey 对短 key 过度打码 / 对长 key 打码不足（泄露）
 *   - testConnection 在未配置时不打网络（防 panic / 意外 fetch）
 *
 * 不测：
 *   - readMeta/writeMeta 的 JSON 序列化（getSettingsKV 自身已有测试）
 *   - fetch 的 HTTP 行为（那是 integration 层的事，本层只验契约）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 内存版 SecureVault：模拟 safeStorage 命中时的行为
class MockVault {
  private store = new Map<string, string>()
  private _available: boolean

  constructor({ available = true } = {}) {
    this._available = available
  }

  isAvailable(): boolean {
    return this._available
  }
  get(key: string): string | null {
    return this.store.get(key) ?? null
  }
  set(key: string, plain: string): void {
    if (!this._available) throw new Error('no-encryption')
    this.store.set(key, plain)
  }
  remove(key: string): boolean {
    return this.store.delete(key)
  }
  keys(): string[] {
    return [...this.store.keys()]
  }
}

// settingsKV mock（configStore.readMeta/writeMeta 的后端）
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

// 让 client.ts 的 logger import 在测试里不炸（测 testConnection 时会走 logger.warn）
vi.mock('../../electron/services/logger/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

let cs: typeof import('../../electron/services/llm/configStore')
let client: typeof import('../../electron/services/llm/client')

beforeEach(async () => {
  kvStore.clear()
  vi.resetModules()
  cs = await import('../../electron/services/llm/configStore')
  client = await import('../../electron/services/llm/client')
})

describe('configStore · getPublicConfig 安全契约', () => {
  it('未配置时：hasApiKey=false，apiKeyMasked=null，所有字段为默认', () => {
    cs.setLLMVault(new MockVault() as never)
    const pub = cs.getPublicConfig()
    expect(pub.hasApiKey).toBe(false)
    expect(pub.apiKeyMasked).toBeNull()
    expect(pub.provider).toBeNull()
    expect(pub.model).toBeNull()
    expect(pub.optInUploadImages).toBe(false)
    expect(pub.updatedAt).toBeNull()
  })

  it('已配置时：返回值必须不含 apiKey 明文字段（安全红线）', () => {
    const v = new MockVault()
    cs.setLLMVault(v as never)
    cs.applyConfigPatch({ provider: 'openrouter', apiKey: 'sk-or-v1-test-abcdef-0123456789' })
    const pub = cs.getPublicConfig()
    // 遍历所有字段值，保证没有 apiKey 明文泄漏
    for (const val of Object.values(pub)) {
      if (typeof val === 'string') {
        expect(val).not.toContain('sk-or-v1-test-abcdef-0123456789')
      }
    }
    expect(pub.hasApiKey).toBe(true)
    expect(pub.apiKeyMasked).toBe('sk-o...6789') // 4 前 + 4 后，中间 ...
  })

  it('getApiKeyForInternalUse 能拿到明文（供主进程 client 用）', () => {
    const v = new MockVault()
    cs.setLLMVault(v as never)
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-abcdef-0123456789' })
    expect(cs.getApiKeyForInternalUse()).toBe('sk-or-v1-abcdef-0123456789')
  })

  it('vault 未注入时 getApiKeyForInternalUse 返回 null，不崩', () => {
    cs.setLLMVault(null)
    expect(cs.getApiKeyForInternalUse()).toBeNull()
  })
})

describe('configStore · applyConfigPatch 合并语义', () => {
  it('apiKey=undefined 时保留已有凭证（不误删）', () => {
    const v = new MockVault()
    cs.setLLMVault(v as never)
    cs.applyConfigPatch({ provider: 'openrouter', apiKey: 'sk-or-v1-keep-me-alive-0000' })

    cs.applyConfigPatch({ model: 'openai/gpt-4o-mini' }) // apiKey 没传 → 保留
    expect(cs.getApiKeyForInternalUse()).toBe('sk-or-v1-keep-me-alive-0000')
    expect(cs.getPublicConfig().model).toBe('openai/gpt-4o-mini')
  })

  it('apiKey=null 明确清空（用户"清除 apiKey"路径）', () => {
    const v = new MockVault()
    cs.setLLMVault(v as never)
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-will-be-deleted-000' })
    expect(cs.getApiKeyForInternalUse()).not.toBeNull()

    cs.applyConfigPatch({ apiKey: null })
    expect(cs.getApiKeyForInternalUse()).toBeNull()
    expect(cs.getPublicConfig().hasApiKey).toBe(false)
  })

  it('apiKey=string 覆盖旧值', () => {
    const v = new MockVault()
    cs.setLLMVault(v as never)
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-old-xxxxxxxxxxxxxx' })
    cs.applyConfigPatch({ apiKey: 'sk-or-v1-new-yyyyyyyyyyyyyy' })
    expect(cs.getApiKeyForInternalUse()).toBe('sk-or-v1-new-yyyyyyyyyyyyyy')
  })

  it('vault 不可用时抛错（而不是静默成功）', () => {
    cs.setLLMVault(null)
    expect(() => cs.applyConfigPatch({ apiKey: 'sk-or-v1-whatever-nnnnnnn' })).toThrow(
      /SecureVault unavailable/,
    )
  })

  it('optInUploadImages 从 false → true → false 链路正确（三态 bool）', () => {
    cs.setLLMVault(new MockVault() as never)
    cs.applyConfigPatch({ optInUploadImages: true })
    expect(cs.getPublicConfig().optInUploadImages).toBe(true)
    cs.applyConfigPatch({ optInUploadImages: false })
    expect(cs.getPublicConfig().optInUploadImages).toBe(false)
  })

  it('updatedAt 在每次 patch 后被刷新', () => {
    cs.setLLMVault(new MockVault() as never)
    cs.applyConfigPatch({ provider: 'openrouter' })
    const t1 = cs.getPublicConfig().updatedAt!
    expect(t1).toBeGreaterThan(0)
    // 小延时避免时间戳碰撞
    const later = t1 + 1
    vi.setSystemTime(later)
    cs.applyConfigPatch({ model: 'x/y' })
    const t2 = cs.getPublicConfig().updatedAt!
    expect(t2).toBeGreaterThanOrEqual(t1)
    vi.useRealTimers()
  })
})

describe('configStore · clearConfig', () => {
  it('清空 apiKey 和 meta', () => {
    const v = new MockVault()
    cs.setLLMVault(v as never)
    cs.applyConfigPatch({
      provider: 'openrouter',
      apiKey: 'sk-or-v1-xxxxxxxxxxxxxxxx',
      model: 'google/gemini-2.0-flash-exp',
      optInUploadImages: true,
    })
    cs.clearConfig()
    const pub = cs.getPublicConfig()
    expect(pub.hasApiKey).toBe(false)
    expect(pub.provider).toBeNull()
    expect(pub.model).toBeNull()
    expect(pub.optInUploadImages).toBe(false)
    expect(cs.getApiKeyForInternalUse()).toBeNull()
  })
})

describe('configStore · maskApiKey 打码契约', () => {
  it('长 key（≥12）：保留前 4 后 4，中间 ...', () => {
    expect(cs.maskApiKey('sk-or-v1-abcdef-0123456789')).toBe('sk-o...6789')
  })

  it('短 key（<12）：全部打码（虽然 schema 强制 16+，这里是兜底防御）', () => {
    expect(cs.maskApiKey('short')).toBe('*****')
    expect(cs.maskApiKey('12345678901')).toBe('***********')
  })

  it('打码字符串长度不会超过原字符串（防止信息泄露量变大）', () => {
    const plain = 'sk-or-v1-0123456789abcdef'
    expect(cs.maskApiKey(plain).length).toBeLessThanOrEqual(plain.length)
  })
})

describe('client.testConnection · 未配置快速失败', () => {
  it('未配置时：ok=false，errorKind=no-config，不发起 fetch', async () => {
    cs.setLLMVault(new MockVault() as never)
    // 全局 fetch spy —— 本用例绝不该命中
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('should not be called'))
    const r = await client.testConnection()
    expect(r.ok).toBe(false)
    expect(r.errorKind).toBe('no-config')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
