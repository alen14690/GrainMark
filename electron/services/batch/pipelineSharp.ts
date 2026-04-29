/**
 * pipelineSharp —— 批处理 CPU 侧管线（F2/F3 修复版）
 *
 * 历史：原实现用 sharp.modulate/linear 近似 6 个通道，但：
 *   - exposure 单位混乱（把 EV 值当 UI -100..100 处理）→ F3
 *   - 仅覆盖 6/10 通道，curves/hsl/colorGrading/grain/halation/lut 全丢 → F2
 *   - WB 用 hue 偏移 5° 模拟，与 GPU 的 R/B 乘法完全不同语义
 *
 * 本版方案：
 *   - 用 `applyPipelineToRGBA` 完成"像素级 9 通道"（LUT 留给 GPU 路径）
 *   - sharp 只负责：解码 / rotate / resize / raw 进出 / 格式编码 / EXIF metadata
 *   - 与 preview.ts 共享同一套 CPU pipeline，三条路径数学一致
 *   - `detectIgnoredChannels` 从"批处理不支持"改为"CPU 不支持（目前只有 LUT）"
 */
import sharp, { type Sharp } from 'sharp'
import type { BatchJobConfig, FilterPipeline } from '../../../shared/types.js'
import { applyPipelineToRGBA, detectCpuOnlyLimitations } from '../filter-engine/cpuPipeline.js'
import { orientImage } from '../raw/index.js'

export interface ApplyPipelineOptions {
  /** 原始 RGBA / JPEG / etc. buffer */
  input: Buffer
  /** Pipeline；null 表示不应用滤镜，仅做格式 / resize / EXIF 处理 */
  pipeline: FilterPipeline | null
  /** 源文件 EXIF orientation（走 RAW 时由 resolvePreviewBuffer 提供；非 RAW 可为 undefined） */
  sourceOrientation?: number
  /** 输出格式与质量 */
  format: BatchJobConfig['format']
  quality: number
  /** 是否保留 EXIF（sharp 默认会剥） */
  keepExif: boolean
  /** 可选 resize */
  resize?: BatchJobConfig['resize']
}

export interface ApplyPipelineResult {
  buffer: Buffer
  info: { width: number; height: number; channels: number; format: string }
}

/**
 * CPU 路径不支持的通道（F2 修复后仅剩 LUT）。
 *
 * 用于 UI 提示「批处理会忽略这些通道」或让 batch dispatcher 决定走 GPU 路径。
 */
export const UNSUPPORTED_CHANNELS_IN_CPU = ['lut'] as const
export type UnsupportedChannel = (typeof UNSUPPORTED_CHANNELS_IN_CPU)[number]

/**
 * 检查 pipeline 中哪些通道在 CPU 批处理中会被忽略（UI 用）。
 *
 * 这是 `detectCpuOnlyLimitations` 的类型收窄包装，保留原 API 兼容。
 */
export function detectIgnoredChannels(pipeline: FilterPipeline | null): UnsupportedChannel[] {
  return detectCpuOnlyLimitations(pipeline) as UnsupportedChannel[]
}

/**
 * 主入口：应用 pipeline 后按指定格式输出。
 *
 * 流程：
 *   1. sharp 打开 input（自动 EXIF 旋转或显式 rotate）
 *   2. 可选 resize
 *   3. 若有 pipeline：取 raw RGBA → applyPipelineToRGBA → 再用 sharp 从 raw 编码
 *   4. 否则直接编码
 */
export async function applyPipeline(opts: ApplyPipelineOptions): Promise<ApplyPipelineResult> {
  const { input, pipeline, format, quality, keepExif, resize, sourceOrientation } = opts

  let img: Sharp

  // 统一 orientation 处理（Single Source of Truth：orientImage）
  if (sourceOrientation !== undefined) {
    // RAW 路径（有 sourceOrientation）：走 orientImage 显式处理
    img = orientImage(input, sourceOrientation)
  } else {
    // 非 RAW 路径：走 orientImage（内部 sharp.rotate() 自动读 EXIF）
    img = orientImage(input, undefined)
  }

  // Resize（先 resize 后跑 CPU pipeline —— 节约大量像素）
  if (resize && resize.mode !== 'none' && resize.value > 0) {
    switch (resize.mode) {
      case 'long-edge':
        img = img.resize({
          width: resize.value,
          height: resize.value,
          fit: 'inside',
          withoutEnlargement: true,
        })
        break
      case 'short-edge':
        img = img.resize({
          width: resize.value,
          height: resize.value,
          fit: 'outside',
          withoutEnlargement: true,
        })
        break
      case 'width':
        img = img.resize({ width: resize.value, withoutEnlargement: true })
        break
      case 'height':
        img = img.resize({ height: resize.value, withoutEnlargement: true })
        break
      case 'percentage': {
        const meta = await sharp(input).metadata()
        if (meta.width && meta.height) {
          const w = Math.round((meta.width * resize.value) / 100)
          img = img.resize({ width: w, withoutEnlargement: true })
        }
        break
      }
    }
  }

  // F2+F3：用 CPU pipeline 完成像素级滤镜（数学与 GPU 等价）
  let finalImg: Sharp
  if (pipeline) {
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const rgba = applyPipelineToRGBA(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      info.width,
      info.height,
      pipeline,
    )
    finalImg = sharp(Buffer.from(rgba), {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
  } else {
    finalImg = img
  }

  // EXIF 保留
  if (keepExif) {
    finalImg = finalImg.withMetadata()
  }

  // 编码
  switch (format) {
    case 'jpg':
      finalImg = finalImg.jpeg({ quality: Math.max(1, Math.min(100, quality)), mozjpeg: true })
      break
    case 'png':
      finalImg = finalImg.png({ compressionLevel: 9 })
      break
    case 'tiff':
      finalImg = finalImg.tiff({ quality: Math.max(1, Math.min(100, quality)), compression: 'lzw' })
      break
    case 'webp':
      finalImg = finalImg.webp({ quality: Math.max(1, Math.min(100, quality)) })
      break
    case 'avif':
      finalImg = finalImg.avif({ quality: Math.max(1, Math.min(100, quality)) })
      break
  }

  const { data, info } = await finalImg.toBuffer({ resolveWithObject: true })
  return {
    buffer: data,
    info: {
      width: info.width,
      height: info.height,
      channels: info.channels,
      format: info.format,
    },
  }
}
