/**
 * 预览渲染（M2 填入完整 pipeline）
 *
 * RAW 支持（Pass 2.8）：对 RAW 文件先走 resolvePreviewBuffer 抽取内嵌 JPEG，
 * 再交由 sharp 处理。对 UI 完全透明。
 *
 * Orientation 修正（Pass 3b）：RAW 用 sourceOrientation 显式 rotate；非 RAW 走 .rotate() 自动。
 *
 * 滤镜应用策略：
 *   - GPU 端支持的通道（tone/vignette）在 WebGL 渲染，这里的 `pipeline` 可传 null；
 *   - GPU 未实现的通道（LUT/HSL/curves/colorGrading/grain/halation/wb）仍走 sharp CPU 路径
 *     作为"过渡期 CPU 兜底"。
 *
 * 返回形式（M3-c 修复）：
 *   - 早期实现返回 base64 data URL；对大 RAW（内嵌 JPEG ≥ 8MB）在 Chromium 里
 *     fetch(data:...) 偶发失败 / 超时 → 渲染进程拿不到 bitmap，表现为"切滤镜无响应"
 *   - 现在改为写到 userData/preview-cache/<hash>.jpg，返回 grain://preview-tmp/<file> URL，
 *     走 net.fetch 流式传输，对大图更稳
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { FilterPipeline } from '../../../shared/types.js'
import { logger } from '../logger/logger.js'
import { orientationToRotationDegrees, resolvePreviewBuffer } from '../raw/index.js'
import { getFilter } from '../storage/filterStore.js'
import { getPreviewCacheDir } from '../storage/init.js'

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

  const { buffer, sourceOrientation } = await resolvePreviewBuffer(photoPath)
  const rotationDeg = sourceOrientation !== undefined ? orientationToRotationDegrees(sourceOrientation) : null

  let img = sharp(buffer, { failOn: 'none' })
  if (rotationDeg !== null) {
    // RAW：用原文件 EXIF orientation 显式旋转；sharp 默认不写输出 EXIF，
    // 所以最终 JPEG 的 orientation tag 自然是 1（无需 .withMetadata）
    img = img.rotate(rotationDeg)
  } else {
    img = img.rotate() // 非 RAW：读 buffer 自带 EXIF 自动转正
  }
  img = img.resize({
    width: PREVIEW_MAX_DIM,
    height: PREVIEW_MAX_DIM,
    fit: 'inside',
    withoutEnlargement: true,
  })

  if (pipeline) {
    img = applyPipelineSharp(img, pipeline)
  }

  const out = await img.jpeg({ quality: 85 }).toBuffer()

  // 小图走 data URL（零 IO 开销）；大图写临时文件 + grain 协议
  if (out.length <= getDataUrlThreshold()) {
    return `data:image/jpeg;base64,${out.toString('base64')}`
  }

  // 哈希基于"源路径 + filterId + 输出字节数"，相同输入复用缓存文件
  const hash = crypto
    .createHash('md5')
    .update(`${photoPath}:${filterId ?? 'none'}:${out.length}`)
    .digest('hex')
  const fileName = `${hash}.jpg`
  const outPath = path.join(getPreviewCacheDir(), fileName)
  try {
    fs.writeFileSync(outPath, out)
  } catch (err) {
    logger.warn('preview.cache.write.failed', {
      path: outPath,
      err: (err as Error).message,
    })
    // 写失败回退到 data URL（再大也比完全失败好）
    return `data:image/jpeg;base64,${out.toString('base64')}`
  }
  return `grain://preview-tmp/${encodeURIComponent(fileName)}`
}

/** M2 会扩展此函数以覆盖完整 pipeline */
function applyPipelineSharp(img: sharp.Sharp, pipeline: FilterPipeline): sharp.Sharp {
  let out = img

  // 基础 tone
  if (pipeline.tone) {
    const {
      exposure = 0,
      contrast = 0,
      saturation,
    } = pipeline.tone as unknown as {
      exposure?: number
      contrast?: number
      saturation?: number
    }
    const brightnessFactor = 2 ** exposure // EV → 线性
    const saturationFactor = 1 + (pipeline.saturation ?? saturation ?? 0) / 100
    const contrastLinear = 1 + (contrast ?? 0) / 100
    out = out
      .modulate({
        brightness: brightnessFactor,
        saturation: Math.max(0, saturationFactor),
      })
      .linear(contrastLinear, -(128 * (contrastLinear - 1)))
  } else if (pipeline.saturation !== undefined) {
    out = out.modulate({ saturation: Math.max(0, 1 + pipeline.saturation / 100) })
  }

  return out
}
