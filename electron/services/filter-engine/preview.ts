/**
 * 预览渲染（F2/F3 修复版 —— 使用 cpuPipeline 完整 10 通道实现）
 *
 * RAW 支持（Pass 2.8）：对 RAW 文件先走 resolvePreviewBuffer 抽取内嵌 JPEG，
 * 再交由 sharp 处理。对 UI 完全透明。
 *
 * Orientation 修正（Pass 3b）：RAW 用 sourceOrientation 显式 rotate；非 RAW 走 .rotate() 自动。
 *
 * 滤镜应用策略（F2 修复后）：
 *   - GPU 路径：pipeline=null，渲染进程 WebGL 实时应用
 *   - CPU 兜底：通过 `applyPipelineToRGBA` 对 raw 像素 buffer 应用完整 pipeline
 *     （覆盖 WB / tone / curves / HSL / colorGrading / saturation / vibrance /
 *      clarity / halation / grain / vignette），与 GPU 数学等价
 *   - LUT 通道 CPU 不支持，通过 detectCpuOnlyLimitations 上报
 *
 * 返回形式（M3-c 修复）：
 *   - 早期实现返回 base64 data URL；对大 RAW（内嵌 JPEG ≥ 8MB）在 Chromium 里
 *     fetch(data:...) 偶发失败 / 超时 → 渲染进程拿不到 bitmap
 *   - 现在改为写到 userData/preview-cache/<hash>.jpg，返回 grain://preview-tmp/<file> URL
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { FilterPipeline } from '../../../shared/types.js'
import { logger } from '../logger/logger.js'
import { orientationToRotationDegrees, resolvePreviewBuffer } from '../raw/index.js'
import { getFilter } from '../storage/filterStore.js'
import { getPhotosTable, getPreviewCacheDir } from '../storage/init.js'
import { applyPipelineToRGBA, detectCpuOnlyLimitations } from './cpuPipeline.js'

const PREVIEW_MAX_DIM = 1600
/**
 * 大于此阈值的 JPEG 走临时文件路径（避免大 data URL 在渲染进程 fetch 失败）。
 * 可通过环境变量 GRAINMARK_PREVIEW_DATAURL_MAX 注入（字节数），测试下调小用。
 */
const DEFAULT_DATA_URL_THRESHOLD = 2 * 1024 * 1024
function getDataUrlThreshold(): number {
  const env = process.env.GRAINMARK_PREVIEW_DATAURL_MAX
  if (env) {
    const n = Number(env)
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_DATA_URL_THRESHOLD
}

export async function renderPreview(
  photoPath: string,
  filterId: string | null,
  pipelineOverride?: FilterPipeline,
): Promise<string> {
  let pipeline: FilterPipeline | undefined = pipelineOverride
  if (!pipeline && filterId) {
    const preset = getFilter(filterId)
    pipeline = preset?.pipeline
  }

  // P0 热路径优化：从 photo 记录拿预先读好的 orientation，省掉 readExif 30-80ms
  //   导入时就已经读取并存入 photo.exif.orientation（photoStore.importPhotos）
  //   这里只在 photo 记录中没有 orientation 时才让 resolvePreviewBuffer 去读
  //   防御：storage 未初始化（测试环境或早期启动）时 try/catch 静默降级
  let knownOrientation: number | undefined
  try {
    knownOrientation = getPhotosTable()
      .all()
      .find((p) => p.path === photoPath)?.exif?.orientation
  } catch {
    // storage 未初始化 — 走旧路径让 resolvePreviewBuffer 自己 readExif
  }

  const { buffer, sourceOrientation } = await resolvePreviewBuffer(photoPath, knownOrientation)
  const rotationDeg = sourceOrientation !== undefined ? orientationToRotationDegrees(sourceOrientation) : null

  // Step 1：用 sharp 完成旋转 + resize，得到标准 RGB raw buffer
  let base = sharp(buffer, { failOn: 'none' })
  if (rotationDeg !== null) {
    base = base.rotate(rotationDeg)
  } else {
    base = base.rotate() // 非 RAW：读 buffer 自带 EXIF 自动转正
  }
  base = base.resize({
    width: PREVIEW_MAX_DIM,
    height: PREVIEW_MAX_DIM,
    fit: 'inside',
    withoutEnlargement: true,
  })

  // Step 2：CPU pipeline（若有 pipeline）—— F2：全通道、F3：与 GPU 数学严格一致
  let outBuffer: Buffer
  if (pipeline) {
    // 提取 RGBA raw
    const { data, info } = await base.ensureAlpha().raw().toBuffer({ resolveWithObject: true })

    const limitations = detectCpuOnlyLimitations(pipeline)
    if (limitations.length > 0) {
      logger.info('preview.cpu.limited', {
        path: photoPath,
        ignored: limitations,
      })
    }

    const rgba = applyPipelineToRGBA(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      info.width,
      info.height,
      pipeline,
    )

    outBuffer = await sharp(Buffer.from(rgba), {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .jpeg({ quality: 85 })
      .toBuffer()
  } else {
    outBuffer = await base.jpeg({ quality: 85 }).toBuffer()
  }

  // 小图走 data URL（零 IO 开销）；大图写临时文件 + grain 协议
  if (outBuffer.length <= getDataUrlThreshold()) {
    return `data:image/jpeg;base64,${outBuffer.toString('base64')}`
  }

  // 哈希基于"源路径 + filterId + pipeline stringify + 输出字节数"，相同输入复用缓存文件
  const pipelineKey = pipeline ? JSON.stringify(pipeline) : 'none'
  const hash = crypto
    .createHash('md5')
    .update(`${photoPath}:${filterId ?? 'none'}:${pipelineKey}:${outBuffer.length}`)
    .digest('hex')
  const fileName = `${hash}.jpg`
  const outPath = path.join(getPreviewCacheDir(), fileName)
  try {
    fs.writeFileSync(outPath, outBuffer)
  } catch (err) {
    logger.warn('preview.cache.write.failed', {
      path: outPath,
      err: (err as Error).message,
    })
    // 写失败回退到 data URL（再大也比完全失败好）
    return `data:image/jpeg;base64,${outBuffer.toString('base64')}`
  }
  return `grain://preview-tmp/${encodeURIComponent(fileName)}`
}
