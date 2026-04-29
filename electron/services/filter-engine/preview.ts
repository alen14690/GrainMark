/**
 * 预览渲染（GPU-only 架构）
 *
 * Orientation 策略（统一版）：
 *   所有路径统一调用 orientImage()（Single Source of Truth），不在此处独立实现旋转逻辑。
 *   orientImage 内部：
 *     - RAW（sourceOrientation 有值）→ 显式 rotate + flip
 *     - 非 RAW → sharp.rotate() auto-orient
 *   输出不写 withMetadata → JPEG 无 EXIF orientation tag
 *   前端 createImageBitmap({ imageOrientation: 'none' }) 直接使用旋正后的像素
 *
 * 缓存策略（P1 修复版）：
 *   - cache key 使用 path + mtime + size（而非 buffer.length），避免碰撞
 *   - 异步写入（fs.promises.writeFile）不阻塞主进程
 *   - 启动时 GC：由 cacheSweeper.runStartupSweep 统一处理（Single Source of Truth：AGENTS.md #8）
 */
import crypto from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { logger } from '../logger/logger.js'
import { orientImage, resolvePreviewBuffer } from '../raw/index.js'
import { getPhotosTable, getPreviewCacheDir } from '../storage/init.js'

const PREVIEW_MAX_DIM = 1600
const DEFAULT_DATA_URL_THRESHOLD = 2 * 1024 * 1024
function getDataUrlThreshold(): number {
  const env = process.env.GRAINMARK_PREVIEW_DATAURL_MAX
  if (env) {
    const n = Number(env)
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_DATA_URL_THRESHOLD
}

export async function renderPreview(photoPath: string): Promise<string> {
  let knownOrientation: number | undefined
  try {
    knownOrientation = getPhotosTable()
      .all()
      .find((p) => p.path === photoPath)?.exif?.orientation
  } catch {
    // storage 未初始化
  }

  const { buffer, sourceOrientation } = await resolvePreviewBuffer(photoPath, knownOrientation)

  // 统一 orientation 处理（Single Source of Truth：orientImage）
  const img = orientImage(buffer, sourceOrientation)

  const outBuffer = await img
    .resize({ width: PREVIEW_MAX_DIM, height: PREVIEW_MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()

  logger.debug('preview.rendered', { path: photoPath, knownOrientation, sourceOrientation })

  if (outBuffer.length <= getDataUrlThreshold()) {
    return `data:image/jpeg;base64,${outBuffer.toString('base64')}`
  }

  // P1 修复：cache key 使用 path + mtime + size（而非 buffer.length），避免碰撞
  let keySuffix = ''
  try {
    const st = await fsp.stat(photoPath)
    keySuffix = `:${Math.floor(st.mtimeMs)}:${st.size}`
  } catch {
    // stat 失败退化到只用 path
  }
  const hash = crypto.createHash('md5').update(`${photoPath}${keySuffix}`).digest('hex')
  const fileName = `${hash}.jpg`
  const outPath = path.join(getPreviewCacheDir(), fileName)

  // P1 修复：异步写入，不阻塞主进程事件循环
  try {
    await fsp.writeFile(outPath, outBuffer)
  } catch (err) {
    logger.warn('preview.cache.write.failed', { path: outPath, err: (err as Error).message })
    return `data:image/jpeg;base64,${outBuffer.toString('base64')}`
  }
  return `grain://preview-tmp/${encodeURIComponent(fileName)}`
}
