/**
 * schemeGenerator — 从 ColorPalette 生成可应用的 ColorScheme
 *
 * 核心逻辑：
 *   1. 分析参考图的色彩特征
 *   2. 生成 HSL 偏移参数（让用户照片趋近参考图色调）
 *   3. 计算色温偏移/饱和度乘数/分离色调
 */
import type { ColorPalette, ColorScheme } from '../../../shared/types.js'

/**
 * 从参考图色彩特征生成配色方案
 */
export function generateSchemeFromPalette(
  palette: ColorPalette,
  refId: string,
  name: string,
): ColorScheme {
  // 中性基准：色温6500K、饱和度50、明度50
  const NEUTRAL_TEMP = 6500
  const NEUTRAL_BRIGHTNESS = 50

  // 色温偏移：参考图偏暖则让用户照片也偏暖
  const temperatureShift = (NEUTRAL_TEMP - palette.temperature) * 0.3

  // 饱和度乘数：参考图高饱和则提升
  const saturationMul = 0.6 + (palette.saturation / 100) * 0.8 // 范围 0.6-1.4

  // 明度偏移
  const brightnessShift = (palette.brightness - NEUTRAL_BRIGHTNESS) * 0.2

  // 分离色调：用主色和辅色
  const splitToning = {
    highlights: palette.secondary[0] ?? palette.dominant,
    shadows: palette.secondary[1] ?? palette.accent,
    balance: 50, // 中间平衡
  }

  // HSL 偏移：基于主色色相，对相近色相区域做偏移
  const dominantHSL = hexToHSL(palette.dominant)
  const hslShifts = generateHSLShifts(dominantHSL, palette)

  return {
    id: `scheme-${refId}`,
    name,
    sourceRefId: refId,
    palette,
    hslShifts,
    temperatureShift,
    saturationMul,
    brightnessShift,
    splitToning,
  }
}

/**
 * 生成 HSL 偏移数组
 * 将色相轮分为 6 个区间，根据参考图色彩倾向做微调
 */
function generateHSLShifts(
  dominantHSL: { h: number; s: number; l: number },
  _palette: ColorPalette,
): ColorScheme['hslShifts'] {
  const shifts: ColorScheme['hslShifts'] = []

  // 6 个色相区间 (每60度一个)
  const ranges: Array<[number, number]> = [
    [0, 60], // 红-黄
    [60, 120], // 黄-绿
    [120, 180], // 绿-青
    [180, 240], // 青-蓝
    [240, 300], // 蓝-紫
    [300, 360], // 紫-红
  ]

  // 找到主色所在区间，增强该区间的饱和度
  const dominantRange = Math.floor(dominantHSL.h / 60)

  for (let i = 0; i < ranges.length; i++) {
    const isInDominantRange = i === dominantRange
    shifts.push({
      hueRange: ranges[i],
      hShift: 0, // 默认不移动色相
      sShift: isInDominantRange ? 5 : -3, // 主色区间提饱和，其他降
      lShift: 0,
    })
  }

  return shifts
}

/**
 * hex → HSL
 */
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255

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
