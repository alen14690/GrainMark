/**
 * RAW 透明化入口（对外统一使用的唯一方法）
 *
 * 所有需要"把照片字节流喂给 sharp/浏览器"的地方都应走 resolvePreviewBuffer：
 *   - 非 RAW：fs.readFile 原文件
 *   - RAW：命中 rawCache → 直接返回；否则 extractEmbeddedJpeg + 入缓存 + 返回
 *
 * 这样 thumbnail / preview / grain:// 协议三处改动都可以压到"一行替换"。
 *
 * Orientation 契约：
 *   - 除了 buffer，还返回 `sourceOrientation`（来自 RAW 原文件 EXIF 的 Orientation 标签，1..8）
 *   - 上层（thumbnail / preview）不要依赖 sharp 对 buffer 自带 EXIF 的自动 rotate，
 *     因为 RAW 内嵌 JPEG 的 EXIF orientation 有时与原 RAW 不一致（Sony ARW 常见）
 *   - 正确做法：用 sourceOrientation 显式 .rotate(angle) 旋转
 */
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { readExif } from '../exif/reader.js'
import { logger } from '../logger/logger.js'
import { getCached, makeCacheKey, putCached } from './rawCache.js'
import { UnsupportedRawError, extractEmbeddedJpeg, isRawFormat } from './rawDecoder.js'

/** 结果来源枚举（便于日志与指标） */
export type PreviewSource = 'passthrough' | 'raw-cache-hit' | 'raw-extracted' | 'raw-failed'

export interface ResolvedPreview {
  buffer: Buffer
  source: PreviewSource
  /** 如为 RAW 且命中 tag，返回 JpgFromRaw / PreviewImage / ThumbnailImage */
  rawTag?: string
  /**
   * RAW 原文件 EXIF 的 Orientation 标签（1..8）。
   * - 1 / undefined：无需旋转
   * - 3：180°
   * - 6：顺时针 90°（竖拍机身）
   * - 8：逆时针 90°（竖拍机身另一向）
   * 注意：非 RAW 文件（JPG/PNG/HEIC）不返回此值；上层 sharp(buffer).rotate()
   * 对它们自己的 EXIF 已能正确处理。
   */
  sourceOrientation?: number
}

/** EXIF orientation → 顺时针旋转角度（度）。2/4/5/7 含镜像，暂不处理（相机罕见） */
export function orientationToRotationDegrees(orientation?: number): number {
  switch (orientation) {
    case 3:
      return 180
    case 6:
      return 90
    case 8:
      return 270
    default:
      return 0
  }
}

/**
 * 统一取到"可渲染的 JPEG 字节流"。
 *
 * 对于非 RAW 文件，直接透传 fs.readFile。
 * 对于 RAW 文件：
 *   1. 查询 rawCache（基于 path+mtime+size 的 hash），命中直接返回
 *   2. 未命中 → extractEmbeddedJpeg → 写入 cache → 返回
 *   3. 抽取失败 → 抛出 UnsupportedRawError，调用方自行决定降级（显示占位图/跳过 etc.）
 *
 * @throws Error 读取原文件失败
 * @throws UnsupportedRawError RAW 无内嵌 JPEG（M7 前无法渲染）
 */
export async function resolvePreviewBuffer(filePath: string): Promise<ResolvedPreview> {
  const absPath = path.resolve(filePath)
  if (!isRawFormat(absPath)) {
    const buffer = await fsp.readFile(absPath)
    return { buffer, source: 'passthrough' }
  }

  // RAW 分支
  const stat = await fsp.stat(absPath)
  const key = makeCacheKey(absPath, stat.mtimeMs, stat.size)

  // 先把原文件 orientation 拿到（用于后续显式旋转）
  // readExif 对 RAW 耗时 ~30-80ms，但 exiftool 复用进程，后续很快
  const orientation = await readRawOrientation(absPath)

  const cached = await getCached(key)
  if (cached) {
    return { buffer: cached, source: 'raw-cache-hit', sourceOrientation: orientation }
  }

  try {
    const { buffer, tag } = await extractEmbeddedJpeg(absPath)
    // 异步入缓存，不阻塞调用方
    void putCached(key, buffer)
    logger.info('raw.extracted', { path: absPath, tag, size: buffer.length, orientation })
    return { buffer, source: 'raw-extracted', rawTag: tag, sourceOrientation: orientation }
  } catch (err) {
    if (err instanceof UnsupportedRawError) {
      logger.warn('raw.unsupported', { path: absPath, reason: err.reason })
    }
    throw err
  }
}

/** 读取 RAW 原文件的 Orientation；读 EXIF 失败时返回 undefined（调用方按不旋转处理） */
async function readRawOrientation(filePath: string): Promise<number | undefined> {
  try {
    const exif = await readExif(filePath)
    return exif.orientation
  } catch {
    return undefined
  }
}

/** 同步友好的 "是否为 RAW" 便捷函数（供 UI / 日志） */
export { isRawFormat } from './rawDecoder.js'
