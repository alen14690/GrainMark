import fs from 'node:fs'
import path from 'node:path'
/**
 * SecureVault — 凭证/密钥加密存储
 *
 * 使用 Electron safeStorage（macOS Keychain / Windows DPAPI / Linux libsecret）
 * 所有需要持久化的 token、API Key、OAuth credential 都必须走此处
 */
import { safeStorage } from 'electron'
import { SecurityError } from './pathGuard.js'

interface VaultFile {
  version: 1
  entries: Record<string, string> // value 为 base64(encrypt(plain))
}

export class SecureVault {
  private filePath: string
  private cache: VaultFile | null = null

  constructor(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.filePath = path.join(dir, 'vault.json')
  }

  private load(): VaultFile {
    if (this.cache) return this.cache
    if (!fs.existsSync(this.filePath)) {
      this.cache = { version: 1, entries: {} }
      return this.cache
    }
    try {
      this.cache = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as VaultFile
      if (this.cache.version !== 1) throw new Error('Unknown vault version')
      return this.cache
    } catch (e) {
      throw new SecurityError(`Vault corrupt: ${(e as Error).message}`, 'VAULT_CORRUPT')
    }
  }

  private save(): void {
    if (!this.cache) return
    // 原子写：先写临时再 rename
    const tmp = `${this.filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.cache, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, this.filePath)
  }

  /** 检查系统加密是否可用 */
  isAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  /** 保存凭证（plain 字符串） */
  set(key: string, plain: string): void {
    if (!this.isAvailable()) {
      throw new SecurityError('System encryption unavailable', 'NO_ENCRYPTION')
    }
    if (typeof key !== 'string' || !/^[a-zA-Z0-9._:-]+$/.test(key)) {
      throw new SecurityError('Invalid key', 'BAD_KEY')
    }
    const encrypted = safeStorage.encryptString(plain)
    const vault = this.load()
    vault.entries[key] = encrypted.toString('base64')
    this.save()
  }

  /** 读取凭证 */
  get(key: string): string | null {
    if (!this.isAvailable()) return null
    const vault = this.load()
    const b64 = vault.entries[key]
    if (!b64) return null
    try {
      return safeStorage.decryptString(Buffer.from(b64, 'base64'))
    } catch {
      return null
    }
  }

  /** 删除凭证 */
  remove(key: string): boolean {
    const vault = this.load()
    if (!(key in vault.entries)) return false
    delete vault.entries[key]
    this.save()
    return true
  }

  /** 列出所有 key（不返回值） */
  keys(): string[] {
    return Object.keys(this.load().entries)
  }

  /** 清空（测试用，谨慎） */
  clear(): void {
    this.cache = { version: 1, entries: {} }
    this.save()
  }
}
