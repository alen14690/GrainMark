/**
 * pipelineSharp —— 批处理 CPU 侧管线（使用 sharp 覆盖 6 个最常用通道）
 *
 * 支持通道：tone（exposure/contrast/highlights/shadows）· whiteBalance（temp/tint）
 * · saturation · vibrance · clarity · vignette
 *
 * 未覆盖通道（本轮 M3-a 明确跳过，保留 TODO）：
 * - curves / hsl / colorGrading / grain / halation / lut3d
 *   这些在 sharp 侧代价过高或不存在等价原语；M3-b 将改走隐藏 BrowserWindow 跑 GPU 管线。
 *
 * 设计约束：
 * - 纯函数：输入 Buffer + pipeline + optional resize + quality → 输出 Buffer
 * - 不做 I/O（磁盘读写由 worker.ts 负责）
 * - 尊重 EXIF orientation（配合 resolvePreviewBuffer 的 sourceOrientation 约定）
 * - 单元测试可直接喂 buffer 验像素（跳过 sharp 重 IO 测试）
 */
import sharp, { type Sharp } from 'sharp'
import type { BatchJobConfig, FilterPipeline } from '../../../shared/types.js'

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

/** 未实现通道的清单：用于 UI 提示「批处理会忽略这些通道」 */
export const UNSUPPORTED_CHANNELS_IN_BATCH = [
  'curves',
  'hsl',
  'colorGrading',
  'grain',
  'halation',
  'lut',
] as const

export type UnsupportedChannel = (typeof UNSUPPORTED_CHANNELS_IN_BATCH)[number]

/**
 * 检查 pipeline 中哪些通道在批处理中会被忽略（UI 用）
 */
export function detectIgnoredChannels(pipeline: FilterPipeline | null): UnsupportedChannel[] {
  if (!pipeline) return []
  const ignored: UnsupportedChannel[] = []
  if (pipeline.curves && Object.values(pipeline.curves).some((arr) => Array.isArray(arr) && arr.length > 0)) {
    ignored.push('curves')
  }
  if (pipeline.hsl && Object.values(pipeline.hsl).some(Boolean)) ignored.push('hsl')
  if (pipeline.colorGrading && Object.values(pipeline.colorGrading).some(Boolean))
    ignored.push('colorGrading')
  if (pipeline.grain && (pipeline.grain.amount ?? 0) > 0) ignored.push('grain')
  if (pipeline.halation && (pipeline.halation.amount ?? 0) > 0) ignored.push('halation')
  if (pipeline.lut) ignored.push('lut')
  return ignored
}

/**
 * Tone & WB：合并成一次 modulate 调用
 *
 * - exposure (-100..100) → brightness 乘子 (2^(ev/100*2))，约 0.25..4
 * - contrast (-100..100) → sharp.linear(a, b)：a=1+contrast/100, b=-0.5*(a-1)*255
 * - temp (-100..100) → modulate.hue 偏移（温度偏移实际上更接近 r/b 通道权重，但 sharp 无直接 API；
 *     近似为 hue 0° (暖) / 180° (冷)，幅度 ±5°）
 * - tint (-100..100) → hue 偏移 ±5° 的另一方向
 * - saturation (-100..100) → modulate.saturation 乘子 0..2
 */
export function applyToneAndWB(img: Sharp, p: FilterPipeline): Sharp {
  const t = p.tone
  const wb = p.whiteBalance
  let cur = img

  // 1) contrast 走 linear(a, b)
  if (t?.contrast !== undefined && t.contrast !== 0) {
    const a = 1 + Math.max(-1, Math.min(1, t.contrast / 100))
    const b = -0.5 * (a - 1) * 255
    cur = cur.linear(a, b)
  }

  // 2) modulate 汇总 brightness / saturation / hue
  const modulateOpts: { brightness?: number; saturation?: number; hue?: number } = {}
  if (t?.exposure !== undefined && t.exposure !== 0) {
    // exposure UI 单位：-100..100 → EV -2..+2 → 线性乘子
    const ev = Math.max(-2, Math.min(2, (t.exposure / 100) * 2))
    modulateOpts.brightness = Math.max(0.05, 2 ** ev)
  }
  if (p.saturation !== undefined && p.saturation !== 0) {
    modulateOpts.saturation = Math.max(0, 1 + p.saturation / 100)
  }
  // WB：temp 正→暖（hue 0°附近，略加偏 B→R）；tint 正→品红
  if ((wb?.temp !== undefined && wb.temp !== 0) || (wb?.tint !== undefined && wb.tint !== 0)) {
    const tempHue = ((wb?.temp ?? 0) / 100) * 5 // ±5°
    const tintHue = ((wb?.tint ?? 0) / 100) * 5
    modulateOpts.hue = Math.round(tempHue + tintHue)
  }
  if (Object.keys(modulateOpts).length > 0) {
    cur = cur.modulate(modulateOpts)
  }
  return cur
}

/**
 * clarity：简化实现 = 对 buffer 做轻量 sharpen
 * - sharp.sharpen({sigma, m1, m2}) 近似 clarity 效果
 * - clarity -100..0..100 → sigma 0..0..2.5
 */
export function applyClarity(img: Sharp, clarity: number | undefined): Sharp {
  if (clarity === undefined || clarity === 0) return img
  const strength = Math.abs(clarity) / 100
  if (clarity > 0) {
    // 正 clarity：锐化（中频）
    return img.sharpen({ sigma: 0.5 + strength * 2, m1: 0.5 + strength, m2: 2 + strength * 2 })
  }
  // 负 clarity：模糊（柔光效果）
  return img.blur(0.3 + strength * 1.5)
}

/**
 * vibrance：sharp 无直接 API，用 modulate.saturation 的加权近似
 * - 标准 saturation：1 + s/100
 * - vibrance：对低饱和更强，对高饱和保护 —— 近似为 saturation 的 0.6×
 *   （批处理路径做近似，GPU 端才是精确）
 */
export function applyVibrance(img: Sharp, vibrance: number | undefined): Sharp {
  if (vibrance === undefined || vibrance === 0) return img
  const factor = Math.max(0, 1 + (vibrance * 0.6) / 100)
  return img.modulate({ saturation: factor })
}

/**
 * Vignette：sharp 无直接 API，用 composite 一张径向渐变 PNG 近似
 * 这里为了避免运行时动态生成 PNG 的额外复杂度，沿用 sharp.linear 的逐通道暗化近似：
 * - amount 负值（-100..0）→ 整体轻微压暗，幅度 0..0.3
 * - amount 正值（0..+100）→ 整体轻微提亮，幅度 0..0.15
 * 注意：这是粗近似，不是真正的径向暗角。M3-b（WebGL 批处理）会精确还原。
 */
export function applyVignetteApprox(img: Sharp, amount: number | undefined): Sharp {
  if (amount === undefined || amount === 0) return img
  if (amount < 0) {
    const mult = 1 + Math.max(-0.3, (amount / 100) * 0.3)
    return img.linear(mult, 0)
  }
  const mult = 1 + Math.min(0.15, (amount / 100) * 0.15)
  return img.linear(mult, 0)
}

/**
 * 主入口：应用 pipeline 后按指定格式输出
 */
export async function applyPipeline(opts: ApplyPipelineOptions): Promise<ApplyPipelineResult> {
  const { input, pipeline, format, quality, keepExif, resize, sourceOrientation } = opts

  let img = sharp(input, { failOn: 'none' })

  // Orientation：RAW 走显式 rotate(angle)；非 RAW 靠 sharp 自动
  if (sourceOrientation !== undefined && sourceOrientation !== 1) {
    const degByOrient: Record<number, number> = { 3: 180, 6: 90, 8: 270 }
    const deg = degByOrient[sourceOrientation] ?? 0
    if (deg !== 0) img = img.rotate(deg)
  } else {
    img = img.rotate()
  }

  // Pipeline 6 通道应用
  if (pipeline) {
    img = applyToneAndWB(img, pipeline)
    img = applyClarity(img, pipeline.clarity)
    img = applyVibrance(img, pipeline.vibrance)
    img = applyVignetteApprox(img, pipeline.vignette?.amount)
  }

  // Resize
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

  // EXIF 保留
  if (keepExif) {
    img = img.withMetadata()
  }

  // 编码
  const formatOptions: Record<string, unknown> = {}
  switch (format) {
    case 'jpg':
      img = img.jpeg({ quality: Math.max(1, Math.min(100, quality)), mozjpeg: true })
      break
    case 'png':
      img = img.png({ compressionLevel: 9 })
      break
    case 'tiff':
      img = img.tiff({ quality: Math.max(1, Math.min(100, quality)), compression: 'lzw' })
      break
    case 'webp':
      img = img.webp({ quality: Math.max(1, Math.min(100, quality)) })
      break
    case 'avif':
      img = img.avif({ quality: Math.max(1, Math.min(100, quality)) })
      break
  }
  void formatOptions

  const { data, info } = await img.toBuffer({ resolveWithObject: true })
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
