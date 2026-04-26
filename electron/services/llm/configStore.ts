import type { LLMConfigInput, LLMConfigPublic, LLMProvider } from '../../../shared/types.js'
import type { SecureVault } from '../security/secureVault.js'
/**
 * LLM 配置持久化（M5-LLM-A · OpenRouter only）
 *
 * 安全分层：
 *   - apiKey 明文：绝对只走 SecureVault（macOS Keychain / Windows DPAPI / Linux libsecret）
 *   - 非敏感字段（provider / model / optIn / updatedAt）：走 settingsKV 即可
 *
 * 为什么拆两层：
 *   - settingsKV 是纯 JSON 文件；apiKey 若落这里 = 明文入仓，违反 AGENTS.md 安全红线
 *   - SecureVault 的 key 必须符合 `[a-zA-Z0-9._:-]+` 正则，我们用固定前缀避免拼接漏洞
 *
 * 单例模式：
 *   - vault 由 main.ts 注入，避免本模块依赖 electron app 生命周期
 *   - 测试可用 mock 注入
 */
import { getSettingsKV } from '../storage/init.js'

/** 固定的 vault key（正则白名单合规）—— 不允许用户控制此字段防注入 */
const VAULT_KEY_API_KEY = 'llm.openrouter.apiKey'

/** 非敏感字段的 settings 存储 key */
const SETTINGS_KEY = 'llm.config.v1'

/** 非敏感字段的内部结构（落 settingsKV JSON） */
interface StoredMeta {
  provider: LLMProvider | null
  model: string | null
  optInUploadImages: boolean
  updatedAt: number | null
}

function defaultMeta(): StoredMeta {
  return { provider: null, model: null, optInUploadImages: false, updatedAt: null }
}

let vaultRef: SecureVault | null = null

/** 由 main.ts 在 SecureVault 初始化后注入；测试用 mock 直接喂实现 */
export function setLLMVault(v: SecureVault | null): void {
  vaultRef = v
}

/** 内部：从 settingsKV 读取 meta（带默认值兜底） */
function readMeta(): StoredMeta {
  const kv = getSettingsKV()
  const stored = kv.get<StoredMeta>(SETTINGS_KEY)
  if (!stored) return defaultMeta()
  return {
    provider: stored.provider ?? null,
    model: stored.model ?? null,
    optInUploadImages: !!stored.optInUploadImages,
    updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : null,
  }
}

function writeMeta(meta: StoredMeta): void {
  const kv = getSettingsKV()
  void kv.set(SETTINGS_KEY, meta)
}

/**
 * 只给 renderer 看"能看的"部分 —— 绝不含 apiKey 明文。
 * apiKeyMasked 仅在 vault 可读且命中时存在，示意"已配置"。
 */
export function getPublicConfig(): LLMConfigPublic {
  const meta = readMeta()
  const apiKey = vaultRef ? vaultRef.get(VAULT_KEY_API_KEY) : null
  return {
    provider: meta.provider,
    model: meta.model,
    hasApiKey: !!apiKey,
    apiKeyMasked: apiKey ? maskApiKey(apiKey) : null,
    optInUploadImages: meta.optInUploadImages,
    updatedAt: meta.updatedAt,
  }
}

/**
 * 仅供 main-process 内部的 llmClient 使用。
 * 不得暴露给 IPC / renderer。
 */
export function getApiKeyForInternalUse(): string | null {
  if (!vaultRef) return null
  return vaultRef.get(VAULT_KEY_API_KEY)
}

/**
 * 应用 patch 语义：
 *   - apiKey: string  → 加密写入 vault
 *   - apiKey: null    → 从 vault 删除
 *   - apiKey: undefined → 保留原值
 *   - 其它字段 undefined 则不变，有值则覆盖
 */
export function applyConfigPatch(patch: LLMConfigInput): LLMConfigPublic {
  // 先处理 apiKey（需要 vault，失败则早抛）
  if (patch.apiKey !== undefined) {
    if (!vaultRef) {
      throw new Error('SecureVault unavailable; cannot persist apiKey')
    }
    if (patch.apiKey === null) {
      vaultRef.remove(VAULT_KEY_API_KEY)
    } else {
      vaultRef.set(VAULT_KEY_API_KEY, patch.apiKey)
    }
  }

  const current = readMeta()
  const next: StoredMeta = {
    provider: patch.provider ?? current.provider,
    model: patch.model ?? current.model,
    optInUploadImages:
      patch.optInUploadImages !== undefined ? patch.optInUploadImages : current.optInUploadImages,
    updatedAt: Date.now(),
  }
  writeMeta(next)
  return getPublicConfig()
}

/** 清空全部配置（apiKey + meta） */
export function clearConfig(): LLMConfigPublic {
  if (vaultRef) vaultRef.remove(VAULT_KEY_API_KEY)
  writeMeta(defaultMeta())
  return getPublicConfig()
}

/**
 * 脱敏显示：保留前 4 位（sk-o）+ 后 4 位，中间换星号。
 * 对 <12 字符的极短 key 全部打码（虽然 schema 强制 ≥16，兜底防御）。
 */
export function maskApiKey(plain: string): string {
  if (plain.length < 12) return '*'.repeat(plain.length)
  const head = plain.slice(0, 4)
  const tail = plain.slice(-4)
  return `${head}...${tail}`
}
