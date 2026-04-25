import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { logger } from '../logger/logger.js'
import { resolvePreviewBuffer } from '../raw/index.js'
import { getThumbsDir } from '../storage/init.js'

/**
 * 生成缩略图，返回本地绝对路径。
 *
 * 流程：
 *   1. resolvePreviewBuffer 统一取"可渲染的 JPEG 字节流"（RAW 透明化）
 *   2. sharp.rotate() 自动应用 Buffer 里的 EXIF orientation（竖拍图会转正）
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

  const { buffer, source } = await resolvePreviewBuffer(filePath)
  logger.debug('thumb.source', { path: filePath, source })

  await sharp(buffer, { failOn: 'none' })
    .rotate() // 依据 Buffer 自带 EXIF orientation 旋转；无 EXIF 则 no-op
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
 *   - 对 RAW，这里基于内嵌 JPEG 做探测；对 JPG/PNG 等直接从文件元数据读
 *
 * 失败返回 null（让调用方降级到 EXIF 声明尺寸）
 */
export async function detectDisplayDimensions(
  filePath: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const { buffer } = await resolvePreviewBuffer(filePath)
    const meta = await sharp(buffer, { failOn: 'none' }).metadata()
    if (!meta.width || !meta.height) return null
    // sharp.metadata() 返回的是传感器方向下的宽高；结合 orientation 推算呈现方向
    const orientation = meta.orientation ?? 1
    const rotated = orientation >= 5 && orientation <= 8
    return rotated ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height }
  } catch (err) {
    logger.warn('thumb.detectDims.failed', { path: filePath, err: (err as Error).message })
    return null
  }
}
