/**
 * 颜色科学断言 matcher
 * 用于验证滤镜输出的像素色值是否落在期望的色彩范围内
 */

export interface Rgb {
  r: number
  g: number
  b: number
}
export interface Lab {
  L: number
  a: number
  b: number
}

/** sRGB (0..255) → linear */
function srgbToLinear(v: number): number {
  const x = v / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

/** sRGB → XYZ (D65) */
function rgbToXyz(rgb: Rgb): { x: number; y: number; z: number } {
  const r = srgbToLinear(rgb.r)
  const g = srgbToLinear(rgb.g)
  const b = srgbToLinear(rgb.b)
  return {
    x: r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    y: r * 0.2126729 + g * 0.7151522 + b * 0.072175,
    z: r * 0.0193339 + g * 0.119192 + b * 0.9503041,
  }
}

function xyzToLab(xyz: { x: number; y: number; z: number }): Lab {
  // D65 白点
  const xn = 0.95047
  const yn = 1.0
  const zn = 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(xyz.x / xn)
  const fy = f(xyz.y / yn)
  const fz = f(xyz.z / zn)
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

export function rgbToLab(rgb: Rgb): Lab {
  return xyzToLab(rgbToXyz(rgb))
}

export interface RgbHistogram {
  r: number[] // length 256
  g: number[]
  b: number[]
  luminance: number[]
}

export function histogram(pixels: Uint8Array | Uint8ClampedArray, channels = 3): RgbHistogram {
  const r = new Array(256).fill(0)
  const g = new Array(256).fill(0)
  const b = new Array(256).fill(0)
  const l = new Array(256).fill(0)
  for (let i = 0; i < pixels.length; i += channels) {
    const R = pixels[i] ?? 0
    const G = pixels[i + 1] ?? 0
    const B = pixels[i + 2] ?? 0
    r[R]++
    g[G]++
    b[B]++
    const lum = Math.round(0.2126 * R + 0.7152 * G + 0.0722 * B)
    l[Math.min(255, lum)]++
  }
  return { r, g, b, luminance: l }
}

export function histogramStats(hist: number[]): { mean: number; std: number; total: number } {
  let total = 0
  let sum = 0
  for (let i = 0; i < hist.length; i++) {
    total += hist[i]!
    sum += i * hist[i]!
  }
  const mean = total === 0 ? 0 : sum / total
  let variance = 0
  for (let i = 0; i < hist.length; i++) {
    variance += hist[i]! * (i - mean) ** 2
  }
  const std = total === 0 ? 0 : Math.sqrt(variance / total)
  return { mean, std, total }
}

/** Vitest matcher 扩展 */
export const colorMatchers = {
  toBeInRgbRange(received: Rgb, range: { r?: [number, number]; g?: [number, number]; b?: [number, number] }) {
    const check = (v: number, rng?: [number, number]) => !rng || (v >= rng[0] && v <= rng[1])
    const ok = check(received.r, range.r) && check(received.g, range.g) && check(received.b, range.b)
    return {
      pass: ok,
      message: () =>
        `Expected RGB(${received.r},${received.g},${received.b}) to be in range ${JSON.stringify(range)}`,
    }
  },

  toBeInLabRange(received: Rgb, range: { L?: [number, number]; a?: [number, number]; b?: [number, number] }) {
    const lab = rgbToLab(received)
    const check = (v: number, rng?: [number, number]) => !rng || (v >= rng[0] && v <= rng[1])
    const ok = check(lab.L, range.L) && check(lab.a, range.a) && check(lab.b, range.b)
    return {
      pass: ok,
      message: () =>
        `Expected Lab(${lab.L.toFixed(1)},${lab.a.toFixed(1)},${lab.b.toFixed(1)}) to be in range ${JSON.stringify(range)}`,
    }
  },

  toHaveHistogramMeanBetween(received: number[], min: number, max: number) {
    const { mean } = histogramStats(received)
    return {
      pass: mean >= min && mean <= max,
      message: () => `Expected histogram mean ${mean.toFixed(2)} to be in [${min}, ${max}]`,
    }
  },
}
