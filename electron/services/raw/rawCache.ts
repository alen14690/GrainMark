/**
 * RAW Preview Cache — 磁盘 LRU（Q2-C）
 *
 * 职责：
 *   - 为每个 RAW 源文件缓存一份"解出来的 JPEG 预览"（来自 extractEmbeddedJpeg）
 *   - 默认上限 2 GB；超出时按 atime 最旧的先删
 *   - 路径 hash 命名：sha1(absPath + '::' + mtimeMs) 保证源文件修改后自动失效
 *
 * 为什么不用 sharp 里的 cache：sharp 的内存 cache 是进程级且粒度不对（我们缓存的是"中间态原始内嵌 JPEG"）
 *
 * 安全：
 *   - 缓存文件命名只用 hex，不接受用户输入，路径穿越不可能
 *   - 读写均限定在 getCacheDir()/raw-preview/ 子目录下
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { logger } from '../logger/logger.js'
import { getCacheDir } from '../storage/init.js'

/** 缓存上限：默认 2 GB，可通过 setRawCacheLimit 热调（响应 Settings 变更） */
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024
let maxBytes: number = DEFAULT_MAX_BYTES

export function setRawCacheLimit(mb: number): void {
  const v = Math.max(64, Math.min(64 * 1024, Math.floor(mb))) // 64MB..64GB
  maxBytes = v * 1024 * 1024
}

export function getRawCacheLimit(): number {
  return maxBytes
}

/** 缓存子目录（位于 userData/cache/raw-preview） */
export function getRawCacheDir(): string {
  const dir = path.join(getCacheDir(), 'raw-preview')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** 生成缓存键：sha1(absPath + mtimeMs + size)，mtime 改动即缓存失效 */
export function makeCacheKey(absPath: string, mtimeMs: number, sizeBytes: number): string {
  return crypto.createHash('sha1').update(`${absPath}::${mtimeMs}::${sizeBytes}`).digest('hex')
}

function cacheFilePath(key: string): string {
  return path.join(getRawCacheDir(), `${key}.jpg`)
}

/** 查询命中；同时刷新 atime 以支持 LRU（未命中返回 null） */
export async function getCached(key: string): Promise<Buffer | null> {
  const p = cacheFilePath(key)
  try {
    const buf = await fsp.readFile(p)
    // 轻量 touch：用当前时间设置 atime，不 await 也不阻塞主流程
    const now = new Date()
    void fsp.utimes(p, now, now).catch(() => undefined)
    return buf
  } catch {
    return null
  }
}

/** 写入缓存；写入后异步触发 evict，不阻塞调用方 */
export async function putCached(key: string, data: Buffer): Promise<void> {
  const p = cacheFilePath(key)
  try {
    await fsp.writeFile(p, data)
    // 异步 evict，失败静默（下次写入再试）
    void evictIfOverLimit().catch((err) => {
      logger.warn('rawCache.evict.failed', { err: (err as Error).message })
    })
  } catch (err) {
    logger.warn('rawCache.put.failed', { err: (err as Error).message })
  }
}

interface CacheEntry {
  file: string
  size: number
  atimeMs: number
}

/** LRU 淘汰：超过上限时按 atime 从旧到新删，直到回到 80% 水位以减少抖动 */
export async function evictIfOverLimit(): Promise<void> {
  const dir = getRawCacheDir()
  let entries: CacheEntry[] = []
  const names = await fsp.readdir(dir).catch(() => [])
  for (const name of names) {
    if (!name.endsWith('.jpg')) continue
    const full = path.join(dir, name)
    try {
      const st = await fsp.stat(full)
      if (!st.isFile()) continue
      entries.push({ file: full, size: st.size, atimeMs: st.atimeMs })
    } catch {
      // 文件刚被别的进程删了，忽略
    }
  }
  let total = entries.reduce((sum, e) => sum + e.size, 0)
  if (total <= maxBytes) return

  // 降到 80% 水位停止
  const target = Math.floor(maxBytes * 0.8)
  entries = entries.sort((a, b) => a.atimeMs - b.atimeMs) // 最旧在前
  for (const e of entries) {
    if (total <= target) break
    try {
      await fsp.unlink(e.file)
      total -= e.size
    } catch {
      // 已被其它进程清理
    }
  }
}

/** 测试用：清空整个缓存目录 */
export async function clearRawCache(): Promise<void> {
  const dir = getRawCacheDir()
  const names = await fsp.readdir(dir).catch(() => [])
  await Promise.all(
    names.filter((n) => n.endsWith('.jpg')).map((n) => fsp.unlink(path.join(dir, n)).catch(() => undefined)),
  )
}

/** 测试用：当前缓存占用字节数 */
export async function getRawCacheSize(): Promise<number> {
  const dir = getRawCacheDir()
  const names = await fsp.readdir(dir).catch(() => [])
  let total = 0
  for (const n of names) {
    if (!n.endsWith('.jpg')) continue
    const st = await fsp.stat(path.join(dir, n)).catch(() => null)
    if (st?.isFile()) total += st.size
  }
  return total
}
