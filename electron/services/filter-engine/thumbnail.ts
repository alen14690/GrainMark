import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { logger } from '../logger/logger.js'
import { orientationToRotationDegrees, resolvePreviewBuffer } from '../raw/index.js'
import { getThumbsDir } from '../storage/init.js'

/**
 * 生成缩略图，返回本地绝对路径。
 *
 * 流程：
 *   1. resolvePreviewBuffer 统一取"可渲染的 JPEG 字节流"（RAW 透明化）+ 原文件 orientation
 *   2. 非 RAW：sharp.rotate() 读 buffer 自带 EXIF 旋转（标准 JPEG/HEIC 这样 work 得很好）
 *      RAW：用 sourceOrientation 显式 rotate(angle)，因为内嵌 JPEG 的 EXIF 可能与原 RAW 不一致
 *   3. resize fit:'inside' + withoutEnlargement 保持比例、不超原图
 *   4. 生成失败会 throw；上层 photoStore 的 catch 继续把 photo 记录下来
 *
 * 缓存：按 `filePath:size` 的 md5 命名；源文件路径或尺寸变化会产生新 hash
 */
export async function makeThumbnail(filePath: string, size: number): Promise<string> {
  const hash = crypto.createHash('md5').update(`${filePath}:${size}`).digest('hex')
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

  const { buffer, source, sourceOrientation } = await resolvePreviewBuffer(filePath)
  logger.debug('thumb.source', { path: filePath, source, orientation: sourceOrientation })

  // 关键：RAW 必须用 sourceOrientation 显式旋转（内嵌 JPEG 的 EXIF 不可靠，Sony ARW 尤甚）
  // 非 RAW 走 sharp 自动 EXIF rotate（.rotate() 不传角度参数 = 自动读 buffer EXIF）
  const rotationDeg = sourceOrientation !== undefined ? orientationToRotationDegrees(sourceOrientation) : null

  let img = sharp(buffer, { failOn: 'none' })
  if (rotationDeg !== null) {
    // 先把 buffer 的 EXIF 信息丢弃（withMetadata 不带 orientation），再显式 rotate(angle)
    // 这样避免"sharp 看到嵌入 JPEG 的 EXIF orientation 错误地再转一次"的双旋转 bug
    img = img.rotate(rotationDeg).withMetadata({ orientation: 1 })
  } else {
    img = img.rotate() // 非 RAW：读 buffer EXIF 自动转正
  }

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
 *   - 对 RAW，优先以原文件 EXIF orientation 为准；sharp 探测的 orientation 仅作兜底
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
    const rotated = orientation >= 5 && orientation <= 8
    return rotated ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height }
  } catch (err) {
    logger.warn('thumb.detectDims.failed', { path: filePath, err: (err as Error).message })
    return null
  }
}
