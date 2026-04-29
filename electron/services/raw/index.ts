/**
 * RAW 透明化入口（对外统一使用的唯一方法）
 *
 * 所有需要"把照片字节流喂给 sharp/浏览器"的地方都应走 resolvePreviewBuffer：
 *   - 非 RAW：fs.readFile 原文件
 *   - RAW：命中 rawCache → 直接返回；否则 extractEmbeddedJpeg + 入缓存 + 返回
 *
 * 这样 thumbnail / preview / grain:// 协议三处改动都可以压到"一行替换"。
 *
 * Orientation 契约（Single Source of Truth）：
 *   - resolvePreviewBuffer 返回 buffer + sourceOrientation
 *   - **所有调用方必须用 orientImage(buffer, sourceOrientation) 做方向处理**
 *   - 禁止自行实现 rotate/flip 逻辑（AGENTS.md 第 8 条：禁止散布式逻辑）
 */
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { Sharp } from 'sharp'
import sharp from 'sharp'
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

/**
 * EXIF orientation → 顺时针旋转角度（度）。
 * 2/4/5/7 含镜像维度，旋转角度仅描述旋转部分（镜像由 needsFlip 判定）。
 *
 * 完整 EXIF orientation 含义：
 *   1 — 正常
 *   2 — 水平翻转
 *   3 — 旋转 180°
 *   4 — 垂直翻转（= 旋转 180° + 水平翻转）
 *   5 — 旋转 270° + 水平翻转
 *   6 — 旋转 90°
 *   7 — 旋转 90° + 水平翻转
 *   8 — 旋转 270°
 */
export function orientationToRotationDegrees(orientation?: number): number {
  switch (orientation) {
    case 3:
    case 4:
      return 180
    case 5:
    case 6:
      return 90
    case 7:
    case 8:
      return 270
    default:
      return 0
  }
}

/** EXIF orientation 是否需要水平翻转（镜像）。orientation 2/4/5/7 含镜像维度 */
export function orientationNeedsFlip(orientation?: number): boolean {
  return orientation === 2 || orientation === 4 || orientation === 5 || orientation === 7
}

/**
 * 统一图像方向处理——**所有需要旋转/翻转的路径必须且仅可通过此函数**。
 *
 * 策略：
 *   - RAW（sourceOrientation 有值且 ≠ undefined）：
 *     用原 RAW 文件头的 EXIF orientation 显式 rotate + flip
 *     因为内嵌 JPEG 的 EXIF orientation 常与 RAW 不一致（Sony ARW 常见）
 *   - 非 RAW（sourceOrientation === undefined）：
 *     JPEG/HEIC/PNG 自带可靠的 EXIF → sharp.rotate() auto-orient
 *
 * 为什么必须统一：
 *   M3.5 踩坑三次证明——orientation 逻辑散布在多处导致反复误修。
 *   把判断、旋转、翻转三步集中在一个函数中：
 *   1. 不可能有"这处改了那处忘了"
 *   2. 镜像 orientation (2/4/5/7) 只需在这一处处理
 *   3. 单测只需覆盖此函数，消除 N 倍测试冗余
 *
 * @param buffer 图像字节流（可以是内嵌 JPEG、原始 JPEG、HEIC 等 sharp 可处理的格式）
 * @param sourceOrientation RAW 原文件 EXIF 的 Orientation (1..8)；非 RAW 传 undefined
 * @returns 已应用 orientation 的 sharp 实例（后续可继续链式 resize/encode）
 */
export function orientImage(buffer: Buffer, sourceOrientation?: number): Sharp {
  let img = sharp(buffer, { failOn: 'none' })

  if (sourceOrientation !== undefined) {
    // RAW 路径：显式处理旋转 + 镜像
    const deg = orientationToRotationDegrees(sourceOrientation)
    const flip = orientationNeedsFlip(sourceOrientation)

    if (flip) {
      logger.debug('orient.flip', { orientation: sourceOrientation })
      img = img.flop() // 水平翻转
    }
    if (deg !== 0) {
      img = img.rotate(deg)
    }
    // orientation=1 或 undefined（readExif 失败）时：不旋转也不翻转，直接返回
  } else {
    // 非 RAW 路径：trust buffer 自带的 EXIF，sharp 自动处理
    img = img.rotate()
  }

  return img
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
 * **P0 热路径优化**：支持 `knownOrientation` 参数——导入时已读到 orientation 并存入
 *   photo.exif.orientation，preview:render / thumbnail 无需再次调用 readExif
 *   （每次省 30-80ms exiftool 子进程 RPC）
 *
 * @throws Error 读取原文件失败
 * @throws UnsupportedRawError RAW 无内嵌 JPEG（M7 前无法渲染）
 */
export async function resolvePreviewBuffer(
  filePath: string,
  knownOrientation?: number,
): Promise<ResolvedPreview> {
  const absPath = path.resolve(filePath)
  if (!isRawFormat(absPath)) {
    const buffer = await fsp.readFile(absPath)
    return { buffer, source: 'passthrough' }
  }

  // RAW 分支
  const stat = await fsp.stat(absPath)
  const key = makeCacheKey(absPath, stat.mtimeMs, stat.size)

  // P0 优化：若调用方已经从 photo 记录拿到了 orientation，直接用，不再调 exiftool
  const orientation = knownOrientation !== undefined ? knownOrientation : await readRawOrientation(absPath)

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
