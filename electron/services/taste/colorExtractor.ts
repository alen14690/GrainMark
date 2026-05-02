/**
 * colorExtractor — 从图片提取色彩特征
 *
 * 算法：
 *   1. 将图片缩小到 100x100（降低计算量）
 *   2. 提取所有像素的 RGB
 *   3. K-means 聚类为 5 个主色
 *   4. 按像素占比排序 → dominant / secondary / accent
 *   5. 计算整体色温 / 饱和度 / 明度 / 对比度
 *
 * 依赖：sharp（已有）
 */
import sharp from 'sharp'
import type { ColorPalette } from '../../../shared/types.js'

/** RGB 颜色 */
interface RGB {
  r: number
  g: number
  b: number
}

/**
 * 从图片路径提取色彩特征
 */
export async function extractColorPalette(imagePath: string): Promise<ColorPalette> {
  // 缩小到 64x64 提取像素
  const { data } = await sharp(imagePath)
    .resize(64, 64, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels: RGB[] = []
  for (let i = 0; i < data.length; i += 3) {
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }

  // K-means 聚类 5 个主色
  const clusters = kMeans(pixels, 5, 20)
  clusters.sort((a, b) => b.count - a.count)

  const dominant = rgbToHex(clusters[0].center)
  const secondary = clusters.slice(1, 4).map((c) => rgbToHex(c.center))
  const accent = clusters.length > 4 ? rgbToHex(clusters[4].center) : secondary[secondary.length - 1]

  // 整体统计
  const allHSL = pixels.map(rgbToHSL)
  const avgSaturation = allHSL.reduce((sum, hsl) => sum + hsl.s, 0) / allHSL.length
  const avgLightness = allHSL.reduce((sum, hsl) => sum + hsl.l, 0) / allHSL.length

  // 对比度：明度标准差
  const lightnessValues = allHSL.map((hsl) => hsl.l)
  const meanL = avgLightness
  const variance = lightnessValues.reduce((sum, l) => sum + (l - meanL) ** 2, 0) / lightnessValues.length
  const contrast = Math.min(100, Math.sqrt(variance) * 3)

  // 色温估算（基于主色的红蓝比）
  const temperature = estimateColorTemperature(clusters[0].center)

  return {
    dominant,
    secondary,
    accent,
    temperature: Math.round(temperature),
    saturation: Math.round(avgSaturation),
    brightness: Math.round(avgLightness),
    contrast: Math.round(contrast),
  }
}

/**
 * 从 Buffer 提取色彩（用于 Unsplash 下载的图片）
 */
export async function extractColorPaletteFromBuffer(buffer: Buffer): Promise<ColorPalette> {
  const { data } = await sharp(buffer)
    .resize(64, 64, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels: RGB[] = []
  for (let i = 0; i < data.length; i += 3) {
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }

  const clusters = kMeans(pixels, 5, 20)
  clusters.sort((a, b) => b.count - a.count)

  const dominant = rgbToHex(clusters[0].center)
  const secondary = clusters.slice(1, 4).map((c) => rgbToHex(c.center))
  const accent = clusters.length > 4 ? rgbToHex(clusters[4].center) : secondary[secondary.length - 1]

  const allHSL = pixels.map(rgbToHSL)
  const avgSaturation = allHSL.reduce((sum, hsl) => sum + hsl.s, 0) / allHSL.length
  const avgLightness = allHSL.reduce((sum, hsl) => sum + hsl.l, 0) / allHSL.length
  const lightnessValues = allHSL.map((hsl) => hsl.l)
  const variance = lightnessValues.reduce((sum, l) => sum + (l - avgLightness) ** 2, 0) / lightnessValues.length
  const contrast = Math.min(100, Math.sqrt(variance) * 3)
  const temperature = estimateColorTemperature(clusters[0].center)

  return {
    dominant,
    secondary,
    accent,
    temperature: Math.round(temperature),
    saturation: Math.round(avgSaturation),
    brightness: Math.round(avgLightness),
    contrast: Math.round(contrast),
  }
}

// ============================================================================
// K-means 实现
// ============================================================================

interface Cluster {
  center: RGB
  count: number
}

function kMeans(pixels: RGB[], k: number, maxIter: number): Cluster[] {
  // 初始化：从像素中随机选 k 个作为初始中心
  const centers: RGB[] = []
  const step = Math.floor(pixels.length / k)
  for (let i = 0; i < k; i++) {
    centers.push({ ...pixels[i * step] })
  }

  let assignments = new Uint16Array(pixels.length)

  for (let iter = 0; iter < maxIter; iter++) {
    // 分配每个像素到最近中心
    let changed = false
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity
      let minIdx = 0
      for (let j = 0; j < k; j++) {
        const d = colorDist(pixels[i], centers[j])
        if (d < minDist) {
          minDist = d
          minIdx = j
        }
      }
      if (assignments[i] !== minIdx) {
        assignments[i] = minIdx
        changed = true
      }
    }
    if (!changed) break

    // 更新中心
    const sums = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, count: 0 }))
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i]
      sums[c].r += pixels[i].r
      sums[c].g += pixels[i].g
      sums[c].b += pixels[i].b
      sums[c].count++
    }
    for (let j = 0; j < k; j++) {
      if (sums[j].count > 0) {
        centers[j] = {
          r: Math.round(sums[j].r / sums[j].count),
          g: Math.round(sums[j].g / sums[j].count),
          b: Math.round(sums[j].b / sums[j].count),
        }
      }
    }
  }

  // 统计每个聚类的像素数
  const counts = new Array(k).fill(0)
  for (let i = 0; i < pixels.length; i++) {
    counts[assignments[i]]++
  }

  return centers.map((center, i) => ({ center, count: counts[i] }))
}

function colorDist(a: RGB, b: RGB): number {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2
}

// ============================================================================
// 颜色工具
// ============================================================================

function rgbToHex(rgb: RGB): string {
  return `#${[rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

interface HSL {
  h: number // 0-360
  s: number // 0-100
  l: number // 0-100
}

function rgbToHSL(rgb: RGB): HSL {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

/**
 * 估算色温（简化模型）
 * 基于 RGB 比例推断暖冷:
 *   - R > B → 暖色调 → 高色温(实际是低色温光源但摄影中"暖"习惯说法)
 *   - B > R → 冷色调
 */
function estimateColorTemperature(rgb: RGB): number {
  const ratio = (rgb.r + 1) / (rgb.b + 1)
  // ratio > 1 = 暖, < 1 = 冷
  // 映射到 3000K-9000K 范围
  const temp = 6500 - (ratio - 1) * 2000
  return Math.max(2500, Math.min(10000, temp))
}
