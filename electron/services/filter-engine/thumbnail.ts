import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { logger } from '../logger/logger.js'
import { orientImage, resolvePreviewBuffer } from '../raw/index.js'
import { getThumbsDir } from '../storage/init.js'

/**
 * 缩略图生成版本号 —— 每次 RAW 方向处理 / resize 逻辑有语义变化就 bump。
 * 版本号会进入 cache key 的 hash，老 thumb 自动失效让 listPhotos 后台懒补重建。
 *
 *   v1（隐式）—— Pass 2.8 前：RAW 无 sourceOrientation 修正，竖拍 thumb 是横的
 *   v2 —— RAW 用 sourceOrientation 显式 rotate，且强制 source 文件 size 进 key
 *   v3 —— 修复前端 double-flip（imageOrientation 'from-image' → 'none'）；
 *          主进程旋转逻辑不变，bump 版本号强制重建旧缩略图
 */
const THUMB_ALGO_VERSION = 3

/**
 * 生成缩略图，返回本地绝对路径。
 *
 * 流程：
 *   1. resolvePreviewBuffer 统一取"可渲染的 JPEG 字节流"（RAW 透明化）+ 原文件 orientation
 *   2. RAW：内嵌 JPEG 通常无 EXIF orientation（Sony 实测 undefined），用 sourceOrientation 显式旋转
 *      非 RAW：JPEG/HEIC 自带 EXIF → sharp.rotate() autoOrient
 *   3. resize fit:'inside' + withoutEnlargement 保持比例、不超原图
 *   4. 生成失败会 throw；上层 photoStore 的 catch 继续把 photo 记录下来
 *
 * 缓存：key = md5(filePath : size : mtime : algoVersion)。
 * - algoVersion 保证改了 orientation 算法后老缓存失效
 * - mtime 保证用户替换文件后缩略图跟着更新
 *
 * **P0 优化**：支持 `knownOrientation` 避免重复调用 exiftool（导入时已读好存到 photo 记录）。
 */
export async function makeThumbnail(
  filePath: string,
  size: number,
  knownOrientation?: number,
): Promise<string> {
  // mtime/size 让替换源文件后 thumb 自动重建；algoVersion 让算法升级强制 rebuild 全量老数据
  let keySuffix = ''
  try {
    const st = fs.statSync(filePath)
    keySuffix = `:${st.size}:${Math.floor(st.mtimeMs)}`
  } catch {
    // 源文件不存在就退化到只用 path，让失败在 resolvePreviewBuffer 阶段报更清楚的错
  }
  const hash = crypto
    .createHash('md5')
    .update(`${filePath}:${size}:v${THUMB_ALGO_VERSION}${keySuffix}`)
    .digest('hex')
  const outPath = path.join(getThumbsDir(), `${hash}.jpg`)
  if (fs.existsSync(outPath)) {
    // 额外校验：文件不为空，避免上次写到一半崩溃的残留
    try {
      const st = fs.statSync(outPath)
      if (st.size > 0) return outPath
    } catch {
      /* 继续重新生成 */
    }
  }

  const { buffer, source, sourceOrientation } = await resolvePreviewBuffer(filePath, knownOrientation)
  logger.debug('thumb.source', { path: filePath, source, orientation: sourceOrientation })

  // 统一 orientation 处理（Single Source of Truth：orientImage）
  let img = orientImage(buffer, sourceOrientation)

  await img
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(outPath)

  return outPath
}

/**
 * 探测"呈现尺寸"（按 EXIF orientation 旋正后的宽高）。
 *
 * 为什么需要这个：
 *   - 竖拍图的原始传感器数据通常是横着的（width > height），配合 EXIF orientation=6/8
 *   - UI 布局和 Library 卡片比例需要知道"显示出来的宽高"，而不是传感器宽高
 *   - 对 RAW，优先以 sourceOrientation（原文件 EXIF）为准——内嵌 JPEG 通常无 orientation tag
 *   - 对非 RAW，直接从 sharp 元数据读（sharp 已考虑 buffer 的 EXIF）
 *
 * 失败返回 null（让调用方降级到 EXIF 声明尺寸）
 */
export async function detectDisplayDimensions(
  filePath: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const { buffer, sourceOrientation } = await resolvePreviewBuffer(filePath)
    const meta = await sharp(buffer, { failOn: 'none' }).metadata()
    if (!meta.width || !meta.height) return null
    // RAW：以 sourceOrientation（原文件 EXIF）为主，嵌入 JPEG 的 metadata.orientation 只做兜底
    const orientation = sourceOrientation ?? meta.orientation ?? 1
    // orientation 5..8 表示宽高需要互换（旋转 90°/270° 类）
    const rotated = orientation >= 5 && orientation <= 8
    return rotated ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height }
  } catch (err) {
    logger.warn('thumb.detectDims.failed', { path: filePath, err: (err as Error).message })
    return null
  }
}
