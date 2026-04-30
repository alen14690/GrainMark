/**
 * 参考图风格提取（M5 完整实现）
 *
 * 算法流程：
 *   1. 将参考图缩放到工作尺寸，提取 raw RGBA 像素
 *   2. RGB → LAB 色彩空间转换
 *   3. 按亮度 L 分三区域（暗/中/亮），统计每区域 L/a/b 均值和标准差
 *   4. 全图 Reinhard 色彩统计 → 映射为 FilterPipeline 参数
 *   5. 分区色偏 → colorGrading (shadows/midtones/highlights)
 *   6. 高频能量估计 → grain 参数
 *   7. 生成 FilterPreset 并保存
 *
 * 数学保证：
 *   - RGB→LAB 使用 D65 标准光源，与 CIE 1976 一致
 *   - Reinhard 统计仅用均值/标准差（不做像素级迁移，避免伪影）
 *   - 最终参数 clamp 到 UI 安全范围内
 */
import { nanoid } from 'nanoid'
import sharp from 'sharp'
import type { FilterPipeline, FilterPreset } from '../../../shared/types.js'
import { logger } from '../logger/logger.js'
import { saveFilter } from '../storage/filterStore.js'

// ============ 色彩空间转换 ============

/** sRGB → Linear (去 gamma) */
function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Linear RGB → XYZ (D65) */
function linearRgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
  const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
  const z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b
  return [x, y, z]
}

/** D65 白点 */
const D65_X = 0.95047
const D65_Y = 1.00000
const D65_Z = 1.08883

/** XYZ → LAB */
function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const fx = labF(x / D65_X)
  const fy = labF(y / D65_Y)
  const fz = labF(z / D65_Z)
  const L = 116 * fy - 16
  const a = 500 * (fx - fy)
  const b = 200 * (fy - fz)
  return [L, a, b]
}

function labF(t: number): number {
  return t > 0.008856 ? t ** (1 / 3) : (903.3 * t + 16) / 116
}

/** RGB (0-255) → LAB */
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const [x, y, z] = linearRgbToXyz(lr, lg, lb)
  return xyzToLab(x, y, z)
}

/** LAB a/b → Hue 角度 (0-360) */
function labToHue(a: number, b: number): number {
  const h = Math.atan2(b, a) * (180 / Math.PI)
  return h < 0 ? h + 360 : h
}

// ============ 统计工具 ============

interface ZoneStats {
  count: number
  meanL: number
  meanA: number
  meanB: number
  stdL: number
  stdA: number
  stdB: number
}

function computeStats(pixels: Array<[number, number, number]>): ZoneStats {
  const n = pixels.length
  if (n === 0) return { count: 0, meanL: 50, meanA: 0, meanB: 0, stdL: 10, stdA: 10, stdB: 10 }

  let sumL = 0, sumA = 0, sumB = 0
  for (const [L, a, b] of pixels) {
    sumL += L; sumA += a; sumB += b
  }
  const meanL = sumL / n
  const meanA = sumA / n
  const meanB = sumB / n

  let varL = 0, varA = 0, varB = 0
  for (const [L, a, b] of pixels) {
    varL += (L - meanL) ** 2
    varA += (a - meanA) ** 2
    varB += (b - meanB) ** 2
  }
  const stdL = Math.sqrt(varL / n)
  const stdA = Math.sqrt(varA / n)
  const stdB = Math.sqrt(varB / n)

  return { count: n, meanL, meanA, meanB, stdL, stdA, stdB }
}

// ============ 颗粒频谱估计（简化版）============

/**
 * 估计图片的颗粒/噪点水平
 * 方法：计算相邻像素亮度差的标准差（Laplacian proxy）
 * 高频能量越高 → grain 越强
 */
function estimateGrainLevel(data: Buffer, width: number, height: number): { amount: number; size: number; roughness: number } {
  let diffSum = 0
  let diffCount = 0

  // 采样：每隔 2 行 2 列，计算与右/下邻居的亮度差
  for (let y = 0; y < height - 1; y += 2) {
    for (let x = 0; x < width - 1; x += 2) {
      const idx = (y * width + x) * 3
      const idxR = idx + 3
      const idxD = idx + width * 3

      // 当前像素亮度（简化：0.299R + 0.587G + 0.114B）
      const lum = 0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!
      const lumR = 0.299 * data[idxR]! + 0.587 * data[idxR + 1]! + 0.114 * data[idxR + 2]!
      const lumD = 0.299 * data[idxD]! + 0.587 * data[idxD + 1]! + 0.114 * data[idxD + 2]!

      diffSum += Math.abs(lum - lumR) + Math.abs(lum - lumD)
      diffCount += 2
    }
  }

  const avgDiff = diffCount > 0 ? diffSum / diffCount : 0
  // 映射到 grain 参数范围
  // avgDiff 典型值：低噪 2-5，中噪 5-12，高噪 12-25+
  const amount = Math.round(clamp(avgDiff * 2.5, 0, 50))
  const size = clamp(0.8 + avgDiff * 0.08, 0.5, 3)
  const roughness = clamp(0.3 + avgDiff * 0.03, 0.2, 0.9)

  return { amount, size: Math.round(size * 10) / 10, roughness: Math.round(roughness * 100) / 100 }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ============ 映射：LAB 统计 → FilterPipeline ============

function mapToFilterPipeline(
  global: ZoneStats,
  shadows: ZoneStats,
  midtones: ZoneStats,
  highlights: ZoneStats,
  grain: { amount: number; size: number; roughness: number },
): FilterPipeline {
  const pipeline: FilterPipeline = {}

  // ---- 白平衡：全局 a/b 偏移 → temp/tint ----
  // a+ = 偏品红, a- = 偏绿; b+ = 偏黄, b- = 偏蓝
  // temp 与 b 通道正相关（暖 = b+），tint 与 a 通道正相关
  const temp = Math.round(clamp(global.meanB * 1.5, -30, 30))
  const tint = Math.round(clamp(global.meanA * 1.2, -30, 30))
  if (temp !== 0 || tint !== 0) {
    pipeline.whiteBalance = { temp, tint }
  }

  // ---- 影调：L 通道统计 → tone 参数 ----
  // 标准中性图 meanL ≈ 50, stdL ≈ 20-25
  const exposureDelta = clamp((global.meanL - 50) * 0.04, -2, 2) // EV
  const contrastDelta = Math.round(clamp((global.stdL - 22) * 1.5, -30, 30))
  // 高光/阴影区域偏移
  const highlightsDelta = Math.round(clamp((highlights.meanL - 80) * -0.8, -30, 20))
  const shadowsDelta = Math.round(clamp((shadows.meanL - 20) * 0.8, -10, 30))

  const hasToне = Math.abs(exposureDelta) > 0.1 || contrastDelta !== 0 || highlightsDelta !== 0 || shadowsDelta !== 0
  if (hasToне) {
    pipeline.tone = {
      exposure: Math.abs(exposureDelta) > 0.1 ? Math.round(exposureDelta * 10) / 10 : 0,
      contrast: contrastDelta,
      highlights: highlightsDelta,
      shadows: shadowsDelta,
      whites: 0,
      blacks: 0,
    }
  }

  // ---- Color Grading：分区色偏 → HSL 色轮 ----
  const mapZoneToGrading = (zone: ZoneStats) => {
    const hue = Math.round(labToHue(zone.meanA, zone.meanB))
    const chroma = Math.sqrt(zone.meanA ** 2 + zone.meanB ** 2)
    const sat = Math.round(clamp(chroma * 2, 0, 40))
    const lum = Math.round(clamp((zone.meanL - 50) * 0.3, -20, 20))
    return { h: hue, s: sat, l: lum }
  }

  const shadowGrading = mapZoneToGrading(shadows)
  const midGrading = mapZoneToGrading(midtones)
  const highGrading = mapZoneToGrading(highlights)

  // 只有色偏明显时才输出 colorGrading
  const hasChroma = shadowGrading.s > 5 || midGrading.s > 5 || highGrading.s > 5
  if (hasChroma) {
    pipeline.colorGrading = {
      shadows: shadowGrading,
      midtones: midGrading,
      highlights: highGrading,
      blending: 55,
      balance: 0,
    }
  }

  // ---- 饱和度：全局色度 → saturation/vibrance ----
  const globalChroma = Math.sqrt(global.meanA ** 2 + global.meanB ** 2)
  // 中性图色度 ≈ 5-10，高饱和 ≈ 20+，低饱和 ≈ 2-4
  const satDelta = Math.round(clamp((globalChroma - 8) * 2, -25, 20))
  if (satDelta !== 0) pipeline.saturation = satDelta

  // stdA/stdB 高 → 色彩丰富 → vibrance+
  const colorVariety = (global.stdA + global.stdB) / 2
  const vibDelta = Math.round(clamp((colorVariety - 15) * 0.8, -15, 15))
  if (vibDelta !== 0) pipeline.vibrance = vibDelta

  // ---- 颗粒 ----
  if (grain.amount > 5) {
    pipeline.grain = grain
  }

  return pipeline
}

// ============ 主入口 ============

export async function extractFilterFromReference(
  refPath: string,
  _targetSamplePath?: string,
): Promise<FilterPreset> {
  const t0 = Date.now()

  // 1. 读取参考图像素（缩放到 512px 工作尺寸，平衡精度与性能）
  const { data, info } = await sharp(refPath, { failOn: 'none' })
    .rotate() // auto-orient
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  const pixelCount = width * height

  // 2. RGB → LAB 转换 + 三区域分离
  const allPixels: Array<[number, number, number]> = []
  const shadowPixels: Array<[number, number, number]> = []
  const midPixels: Array<[number, number, number]> = []
  const highlightPixels: Array<[number, number, number]> = []

  for (let i = 0; i < data.length; i += 3) {
    const [L, a, b] = rgbToLab(data[i]!, data[i + 1]!, data[i + 2]!)
    allPixels.push([L, a, b])

    // 三区域分离：L ∈ [0,33] 暗部 / [34,66] 中间调 / [67,100] 高光
    if (L < 33) shadowPixels.push([L, a, b])
    else if (L < 67) midPixels.push([L, a, b])
    else highlightPixels.push([L, a, b])
  }

  // 3. 统计
  const globalStats = computeStats(allPixels)
  const shadowStats = computeStats(shadowPixels)
  const midStats = computeStats(midPixels)
  const highlightStats = computeStats(highlightPixels)

  // 4. 颗粒频谱估计
  const grainEstimate = estimateGrainLevel(data, width, height)

  // 5. 映射到 FilterPipeline
  const pipeline = mapToFilterPipeline(globalStats, shadowStats, midStats, highlightStats, grainEstimate)

  // 6. 生成 Preset
  const id = `extracted-${nanoid(8)}`
  const preset: FilterPreset = {
    id,
    name: `参考提取 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
    category: 'extracted',
    author: 'User',
    version: '1.0',
    popularity: 0,
    source: 'extracted',
    description: `从参考图提取：LAB色彩迁移 + 分区色偏 + 颗粒估计（${pixelCount} 像素采样）`,
    tags: ['extracted', 'reference'],
    pipeline,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  await saveFilter(preset)

  logger.info('extract.reference.ok', {
    refPath,
    durationMs: Date.now() - t0,
    pixelCount,
    zones: {
      shadows: shadowPixels.length,
      midtones: midPixels.length,
      highlights: highlightPixels.length,
    },
    grainAmount: grainEstimate.amount,
  })

  return preset
}
