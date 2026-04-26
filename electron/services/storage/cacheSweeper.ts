/**
 * cacheSweeper — 启动期异步磁盘 GC
 *
 * 两个职责：
 *   1. sweepPreviewCache()  — LRU 扫 preview-cache/，超 500MB 按 atime 删到 80% 水位
 *   2. sweepOrphanThumbs(inUsePaths) — 扫 thumbs/，删除不被任何 photo 记录引用的 .jpg
 *
 * 调用时机：initStorage() 末尾异步触发（void 不 await），不阻塞主窗口启动
 *
 * 安全契约：
 *   - 仅在 userData/preview-cache/ 和 userData/thumbs/ 内操作
 *   - 路径 resolve 后必须严格前缀匹配目录，防 `../` 穿越
 *   - 只删 .jpg / .jpeg 后缀（拒绝未知扩展名）
 *   - 所有 fs 操作 try/catch 静默失败（启动 GC 不能让应用崩溃）
 *
 * 为什么不复用 rawCache.ts：
 *   - rawCache 的 key 语义是 "源文件+mtime"，preview-cache 的 key 是 "源+filter+输出大小" hash
 *   - rawCache 的上限 2GB 太大，preview-cache 是临时渲染产物（典型 10~100KB/张）
 *   - 孤儿 thumb 的清理需要 "比对 photos.json" 逻辑，rawCache 不关心
 */
import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { logger } from '../logger/logger.js'
import { getPreviewCacheDir, getThumbsDir } from './init.js'

/** preview-cache 目录上限（默认 500MB），可通过 env 注入用于调试 */
const DEFAULT_PREVIEW_CACHE_MAX_BYTES = 500 * 1024 * 1024
function getPreviewCacheLimit(): number {
  const env = process.env.GRAINMARK_PREVIEW_CACHE_MAX
  if (env) {
    const n = Number(env)
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_PREVIEW_CACHE_MAX_BYTES
}

interface DiskEntry {
  file: string
  size: number
  atimeMs: number
}

/** 合法扩展名（只清理 JPEG） */
const LEGAL_EXT = /\.jpe?g$/i

/**
 * 扫描 preview-cache/，超出上限时按 atime LRU 删到 80% 水位
 * @returns 被删除的字节数（供日志和测试断言）
 */
export async function sweepPreviewCache(): Promise<{
  before: number
  after: number
  deleted: number
  limit: number
}> {
  const dir = getPreviewCacheDir()
  const limit = getPreviewCacheLimit()
  const entries = await scanDir(dir)
  const before = entries.reduce((sum, e) => sum + e.size, 0)

  if (before <= limit) {
    return { before, after: before, deleted: 0, limit }
  }

  // 降到 80% 水位（减少抖动）
  const target = Math.floor(limit * 0.8)
  const sorted = entries.sort((a, b) => a.atimeMs - b.atimeMs) // 最旧在前
  let total = before
  let deleted = 0
  for (const e of sorted) {
    if (total <= target) break
    // 双重校验：解析后路径必须仍在 dir 内
    if (!isInsideDir(e.file, dir)) continue
    try {
      await fsp.unlink(e.file)
      total -= e.size
      deleted += e.size
    } catch {
      // 已被其它进程删，忽略
    }
  }

  return { before, after: total, deleted, limit }
}

/**
 * 扫描 thumbs/，删除不被 inUsePaths 引用的 .jpg 孤儿
 * @param inUsePaths 当前 photos.json 中所有 photo.thumbPath 的集合（绝对路径）
 * @returns 被删除的孤儿数量和字节数
 */
export async function sweepOrphanThumbs(inUsePaths: Set<string>): Promise<{
  scanned: number
  deleted: number
  deletedBytes: number
}> {
  const dir = getThumbsDir()
  const names = await fsp.readdir(dir).catch(() => [])

  // 把 inUsePaths 里的路径全部 resolve 后做精确匹配（避免大小写 / 符号链接差异）
  const inUseResolved = new Set<string>()
  for (const p of inUsePaths) {
    try {
      inUseResolved.add(path.resolve(p))
    } catch {
      // 非法路径忽略
    }
  }

  let deleted = 0
  let deletedBytes = 0
  let scanned = 0

  for (const name of names) {
    if (!LEGAL_EXT.test(name)) continue // 只处理 JPEG
    scanned++
    const full = path.join(dir, name)
    if (!isInsideDir(full, dir)) continue

    const resolved = path.resolve(full)
    if (inUseResolved.has(resolved)) continue // 仍被引用

    try {
      const st = await fsp.stat(full)
      if (!st.isFile()) continue
      await fsp.unlink(full)
      deleted++
      deletedBytes += st.size
    } catch {
      // 忽略竞态删除
    }
  }

  return { scanned, deleted, deletedBytes }
}

/**
 * 启动期一次性 GC 入口：由 initStorage 异步 fire-and-forget 调用。
 * 不抛异常（任何失败都被内部 try/catch 吞掉并记 logger.warn）。
 */
export async function runStartupSweep(inUsePaths: Set<string>): Promise<void> {
  // 两项并行跑，任一失败不影响另一项
  const [previewResult, thumbResult] = await Promise.allSettled([
    sweepPreviewCache(),
    sweepOrphanThumbs(inUsePaths),
  ])

  if (previewResult.status === 'fulfilled' && previewResult.value.deleted > 0) {
    logger.info('sweep.previewCache.done', {
      beforeMB: Math.round(previewResult.value.before / 1024 / 1024),
      afterMB: Math.round(previewResult.value.after / 1024 / 1024),
      deletedMB: Math.round(previewResult.value.deleted / 1024 / 1024),
      limitMB: Math.round(previewResult.value.limit / 1024 / 1024),
    })
  } else if (previewResult.status === 'rejected') {
    logger.warn('sweep.previewCache.failed', { err: String(previewResult.reason) })
  }

  if (thumbResult.status === 'fulfilled' && thumbResult.value.deleted > 0) {
    logger.info('sweep.orphanThumbs.done', {
      scanned: thumbResult.value.scanned,
      deleted: thumbResult.value.deleted,
      deletedKB: Math.round(thumbResult.value.deletedBytes / 1024),
    })
  } else if (thumbResult.status === 'rejected') {
    logger.warn('sweep.orphanThumbs.failed', { err: String(thumbResult.reason) })
  }
}

// ============== 内部工具 ==============

async function scanDir(dir: string): Promise<DiskEntry[]> {
  if (!fs.existsSync(dir)) return []
  const names = await fsp.readdir(dir).catch(() => [])
  const entries: DiskEntry[] = []
  for (const name of names) {
    if (!LEGAL_EXT.test(name)) continue
    const full = path.join(dir, name)
    if (!isInsideDir(full, dir)) continue
    try {
      const st = await fsp.stat(full)
      if (!st.isFile()) continue
      entries.push({ file: full, size: st.size, atimeMs: st.atimeMs })
    } catch {
      // 文件刚被其它进程删，忽略
    }
  }
  return entries
}

/** 安全哨兵：目标路径 resolve 后必须在 baseDir 的前缀下 */
function isInsideDir(target: string, baseDir: string): boolean {
  const resolvedTarget = path.resolve(target)
  const resolvedBase = path.resolve(baseDir)
  const rel = path.relative(resolvedBase, resolvedTarget)
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}
