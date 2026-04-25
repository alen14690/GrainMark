/**
 * 预览渲染（M2 填入完整 pipeline）
 * 目前占位：如果没有滤镜则返回原图 base64，有滤镜则简单 tone 调整
 *
 * RAW 支持（Pass 2.8）：对 RAW 文件先走 resolvePreviewBuffer 抽取内嵌 JPEG，
 * 再交由 sharp 处理。对 UI 完全透明。
 */
import sharp from 'sharp'
import type { FilterPipeline } from '../../../shared/types.js'
import { resolvePreviewBuffer } from '../raw/index.js'
import { getFilter } from '../storage/filterStore.js'

const PREVIEW_MAX_DIM = 1600

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

  const { buffer } = await resolvePreviewBuffer(photoPath)

  let img = sharp(buffer, { failOn: 'none' }).rotate().resize({
    width: PREVIEW_MAX_DIM,
    height: PREVIEW_MAX_DIM,
    fit: 'inside',
    withoutEnlargement: true,
  })

  if (pipeline) {
    img = applyPipelineSharp(img, pipeline)
  }

  const out = await img.jpeg({ quality: 85 }).toBuffer()
  return `data:image/jpeg;base64,${out.toString('base64')}`
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
