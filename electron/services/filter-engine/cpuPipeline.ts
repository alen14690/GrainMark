/**
 * filter-engine/cpuPipeline —— CPU 路径下的完整 10 通道滤镜实现
 *
 * 背景（F2 + F3 修复）：
 *   - 原 `preview.ts:applyPipelineSharp` 只支持 tone.exposure/contrast/saturation 三个参数
 *   - 原 `pipelineSharp.ts:applyToneAndWB` 用 sharp.modulate 近似 6 个通道
 *   - GPU shader 10 个通道全部实现
 *   → 同一张照片在预览、批处理、GPU 三条路径得到截然不同的结果（F3）
 *
 * 本模块的价值：
 *   - 用原生 TypeScript 实现与 GPU shader 严格等价的 10 通道处理
 *   - 入口 `applyPipelineToRGBA(rgba, w, h, pipeline)` —— 纯函数，易测试
 *   - preview / batch 的 sharp 路径统一调这里，保证数学一致性
 *   - 与 `tests/utils/shaderCpuMirror.ts` 共享同一套数学（公式同步）
 *
 * 性能注意：
 *   - 完全在 CPU 跑 10 个通道，24MP 照片会很慢（全 N·M·10 扫）
 *   - 所以优先路径仍然是 GPU；CPU pipeline 只在 WebGL 不可用或批处理兜底时用
 *   - 每个通道内部有 identity 短路（amount=0 / 恒等参数 → 直接拷贝）
 *
 * 设计约束：
 *   - 纯函数，无外部 I/O，输入输出均为 RGBA8 Uint8Array
 *   - clarity/halation 需要邻域采样，不做逐像素"小循环"，单独封装
 *   - 顺序必须与 GPU pipelineToSteps 完全一致：
 *       wb → tone → curves → hsl → colorGrading → adjustments → lut → halation → grain → vignette
 */
import type {
  ColorGradingParams,
  CurvesParams,
  FilterPipeline,
  GrainParams,
  HSLParams,
  HalationParams,
  ToneParams,
  VignetteParams,
  WhiteBalanceParams,
} from '../../../shared/types.js'

type RGBA = Uint8Array

const LUMA_R = 0.2126
const LUMA_G = 0.7152
const LUMA_B = 0.0722

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
function luma(r: number, g: number, b: number): number {
  return LUMA_R * r + LUMA_G * g + LUMA_B * b
}
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

// ========== 各通道 ==========

/** White Balance —— 与 GPU shaders/whiteBalance.ts 严格等价 */
export function applyWhiteBalance(pixels: RGBA, p: WhiteBalanceParams): void {
  const temp = Math.max(-1, Math.min(1, (p.temp ?? 0) / 100))
  const tint = Math.max(-1, Math.min(1, (p.tint ?? 0) / 100))
  if (temp === 0 && tint === 0) return
  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i]! / 255
    let g = pixels[i + 1]! / 255
    let b = pixels[i + 2]! / 255
    r *= 1 + temp * 0.3
    b *= 1 - temp * 0.3
    g *= 1 - tint * 0.3
    r *= 1 + tint * 0.1
    b *= 1 + tint * 0.1
    pixels[i] = Math.round(clamp01(r) * 255)
    pixels[i + 1] = Math.round(clamp01(g) * 255)
    pixels[i + 2] = Math.round(clamp01(b) * 255)
  }
}

/** Tone —— 与 GPU shaders/tone.ts 严格等价（F3 核心：exposure 直接是 EV） */
export function applyTone(pixels: RGBA, p: ToneParams): void {
  // F3：exposure 是 EV（-5..+5），与 GPU normalizeToneParams 一致。批处理不再自行 / 100 * 2。
  const ev = Math.max(-5, Math.min(5, p.exposure ?? 0))
  const exp = 2 ** ev
  const contrast = Math.max(-1, Math.min(1, (p.contrast ?? 0) / 100))
  const hi = Math.max(-1, Math.min(1, (p.highlights ?? 0) / 100))
  const sh = Math.max(-1, Math.min(1, (p.shadows ?? 0) / 100))
  const wh = Math.max(-1, Math.min(1, (p.whites ?? 0) / 100))
  const bk = Math.max(-1, Math.min(1, (p.blacks ?? 0) / 100))

  for (let i = 0; i < pixels.length; i += 4) {
    let r = (pixels[i]! / 255) * exp
    let g = (pixels[i + 1]! / 255) * exp
    let b = (pixels[i + 2]! / 255) * exp

    // contrast
    const L0 = luma(r, g, b)
    const lumaAdj = clamp01((L0 - 0.5) * (1 + contrast) + 0.5)
    const scale = lumaAdj / Math.max(L0, 1e-4)
    r *= scale
    g *= scale
    b *= scale

    // highlights
    const L1 = luma(r, g, b)
    const hlS = smoothstep(0.35, 0.85, L1)
    const hlF = 1 + hi * 0.55 * hlS
    r *= hlF
    g *= hlF
    b *= hlF

    // shadows
    const L2 = luma(r, g, b)
    const shS = 1 - smoothstep(0.15, 0.65, L2)
    const shF = 1 + sh * 0.65 * shS
    r *= shF
    g *= shF
    b *= shF

    // whites（mix）
    const L3 = luma(r, g, b)
    const whS = smoothstep(0.6, 0.98, L3)
    const whF = 1 + wh * 0.55
    r = r * (1 - whS) + r * whF * whS
    g = g * (1 - whS) + g * whF * whS
    b = b * (1 - whS) + b * whF * whS

    // blacks（mix）
    const L4 = luma(r, g, b)
    const bkS = 1 - smoothstep(0.02, 0.4, L4)
    const bkF = 1 + bk * 0.65
    r = r * (1 - bkS) + r * bkF * bkS
    g = g * (1 - bkS) + g * bkF * bkS
    b = b * (1 - bkS) + b * bkF * bkS

    pixels[i] = Math.round(clamp01(r) * 255)
    pixels[i + 1] = Math.round(clamp01(g) * 255)
    pixels[i + 2] = Math.round(clamp01(b) * 255)
  }
}

/** Curves —— 把稀疏点转换为 256 LUT 后查表（monotonic Hermite，与 F9 修复后的 GPU 完全一致） */
function curvePointsToLut(points?: { x: number; y: number }[]): Float32Array | null {
  if (!points || points.length === 0) return null
  // 去重排序
  const sorted = [...points]
    .map((p) => ({
      x: Math.max(0, Math.min(255, Math.round(p.x))),
      y: Math.max(0, Math.min(255, p.y)),
    }))
    .sort((a, b) => a.x - b.x)
    .filter((p, i, a) => i === 0 || p.x !== a[i - 1]!.x)
  if (sorted.length === 0) return null
  if (sorted[0]!.x !== 0) sorted.unshift({ x: 0, y: sorted[0]!.y })
  if (sorted[sorted.length - 1]!.x !== 255) sorted.push({ x: 255, y: sorted[sorted.length - 1]!.y })

  // 判断是否恒等
  if (sorted.every((pt) => Math.abs(pt.x - pt.y) < 0.5)) return null

  const n = sorted.length
  const delta = new Float32Array(n - 1)
  for (let k = 0; k < n - 1; k++) {
    const dx = Math.max(1, sorted[k + 1]!.x - sorted[k]!.x)
    delta[k] = (sorted[k + 1]!.y - sorted[k]!.y) / dx
  }
  const m = new Float32Array(n)
  m[0] = delta[0] ?? 0
  m[n - 1] = delta[n - 2] ?? 0
  for (let k = 1; k < n - 1; k++) {
    const dP = delta[k - 1]!
    const dN = delta[k]!
    m[k] = dP * dN <= 0 ? 0 : (dP + dN) * 0.5
  }
  for (let k = 0; k < n - 1; k++) {
    const d = delta[k]!
    if (d === 0) {
      m[k] = 0
      m[k + 1] = 0
    } else {
      const a = m[k]! / d
      const b = m[k + 1]! / d
      const s = a * a + b * b
      if (s > 9) {
        const t = 3 / Math.sqrt(s)
        m[k] = t * a * d
        m[k + 1] = t * b * d
      }
    }
  }

  const lut = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    let j = 0
    while (j < n - 1 && sorted[j + 1]!.x < i) j++
    if (j >= n - 1) {
      lut[i] = sorted[n - 1]!.y / 255
      continue
    }
    const p0 = sorted[j]!
    const p1 = sorted[j + 1]!
    const span = Math.max(1, p1.x - p0.x)
    const t = (i - p0.x) / span
    const t2 = t * t
    const t3 = t2 * t
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + t
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2
    const y = h00 * p0.y + h10 * m[j]! * span + h01 * p1.y + h11 * m[j + 1]! * span
    lut[i] = clamp01(y / 255)
  }
  return lut
}

function sampleCurve(lut: Float32Array | null, v: number): number {
  if (!lut) return v
  const idx = Math.max(0, Math.min(1, v)) * 255
  const i0 = Math.floor(idx)
  const i1 = Math.min(i0 + 1, 255)
  const t = idx - i0
  return lut[i0]! * (1 - t) + lut[i1]! * t
}

export function applyCurves(pixels: RGBA, p: CurvesParams): void {
  const lrgb = curvePointsToLut(p.rgb)
  const lr = curvePointsToLut(p.r)
  const lg = curvePointsToLut(p.g)
  const lb = curvePointsToLut(p.b)
  if (!lrgb && !lr && !lg && !lb) return
  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i]! / 255
    let g = pixels[i + 1]! / 255
    let b = pixels[i + 2]! / 255
    r = sampleCurve(lrgb, r)
    g = sampleCurve(lrgb, g)
    b = sampleCurve(lrgb, b)
    r = sampleCurve(lr, r)
    g = sampleCurve(lg, g)
    b = sampleCurve(lb, b)
    pixels[i] = Math.round(clamp01(r) * 255)
    pixels[i + 1] = Math.round(clamp01(g) * 255)
    pixels[i + 2] = Math.round(clamp01(b) * 255)
  }
}

/** RGB → HSL（与 GPU hsl2rgb 一致） */
function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) * 0.5
  const d = mx - mn
  let h = 0
  let s = 0
  if (d > 1e-5) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return [h, s, l]
}

function hue2rgb(p: number, q: number, tIn: number): number {
  let t = tIn
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 0.5) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  if (s < 1e-5) return [l, l, l]
  const hu = h / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hue2rgb(p, q, hu + 1 / 3), hue2rgb(p, q, hu), hue2rgb(p, q, hu - 1 / 3)]
}

const HSL_CHANNELS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const
const HSL_HUES = [0, 30, 60, 120, 180, 240, 270, 300]

function isHslIdentity(p: HSLParams): boolean {
  for (const ch of HSL_CHANNELS) {
    const v = p[ch]
    if (!v) continue
    if ((v.h ?? 0) !== 0 || (v.s ?? 0) !== 0 || (v.l ?? 0) !== 0) return false
  }
  return true
}

export function applyHsl(pixels: RGBA, p: HSLParams): void {
  if (isHslIdentity(p)) return
  const params = HSL_CHANNELS.map((ch) => {
    const v = p[ch] ?? { h: 0, s: 0, l: 0 }
    return [
      Math.max(-1, Math.min(1, (v.h ?? 0) / 100)),
      Math.max(-1, Math.min(1, (v.s ?? 0) / 100)),
      Math.max(-1, Math.min(1, (v.l ?? 0) / 100)),
    ] as [number, number, number]
  })
  const SIGMA2 = 1800
  for (let i = 0; i < pixels.length; i += 4) {
    const [h, s, l] = rgb2hsl(pixels[i]! / 255, pixels[i + 1]! / 255, pixels[i + 2]! / 255)
    const weights = new Array<number>(8)
    let total = 0
    for (let k = 0; k < 8; k++) {
      const d0 = Math.abs(h - HSL_HUES[k]!)
      const d = Math.min(d0, 360 - d0)
      weights[k] = Math.exp((-d * d) / SIGMA2)
      total += weights[k]!
    }
    let dH = 0
    let dS = 0
    let dL = 0
    for (let k = 0; k < 8; k++) {
      const w = weights[k]! / Math.max(total, 1e-4)
      dH += w * params[k]![0] * 30
      dS += w * params[k]![1]
      dL += w * params[k]![2] * 0.5
    }
    const satGate = smoothstep(0.05, 0.25, s)
    dH *= satGate
    dS *= satGate
    const nh = (h + dH + 360) % 360
    const ns = Math.max(0, Math.min(1, s * (1 + dS)))
    const nl = Math.max(0, Math.min(1, l + dL * (1 - Math.abs(l - 0.5) * 2)))
    const [rr, gg, bb] = hsl2rgb(nh, ns, nl)
    pixels[i] = Math.round(clamp01(rr) * 255)
    pixels[i + 1] = Math.round(clamp01(gg) * 255)
    pixels[i + 2] = Math.round(clamp01(bb) * 255)
  }
}

/** Color grading —— 三向色轮 */
function isColorGradingIdentity(p: ColorGradingParams): boolean {
  return (p.shadows?.l ?? 0) === 0 && (p.midtones?.l ?? 0) === 0 && (p.highlights?.l ?? 0) === 0
}

function hueVectorCG(h: number, s: number): [number, number, number] {
  const hp = (((h % 360) + 360) % 360) / 60
  const x = s * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) {
    r = s
    g = x
  } else if (hp < 2) {
    r = x
    g = s
  } else if (hp < 3) {
    g = s
    b = x
  } else if (hp < 4) {
    g = x
    b = s
  } else if (hp < 5) {
    r = x
    b = s
  } else {
    r = s
    b = x
  }
  const lumaVal = luma(r, g, b)
  return [r - lumaVal, g - lumaVal, b - lumaVal]
}

export function applyColorGrading(pixels: RGBA, p: ColorGradingParams): void {
  if (isColorGradingIdentity(p)) return
  const bal = Math.max(-1, Math.min(1, (p.balance ?? 0) / 100)) * 0.25
  const blend = 0.15 + Math.max(0, Math.min(1, (p.blending ?? 50) / 100)) * 0.3
  const sh = p.shadows ?? { h: 0, s: 0, l: 0 }
  const mi = p.midtones ?? { h: 0, s: 0, l: 0 }
  const hi = p.highlights ?? { h: 0, s: 0, l: 0 }
  const shOff = hueVectorCG(sh.h, Math.max(0, Math.min(1, (sh.s ?? 0) / 100)))
  const miOff = hueVectorCG(mi.h, Math.max(0, Math.min(1, (mi.s ?? 0) / 100)))
  const hiOff = hueVectorCG(hi.h, Math.max(0, Math.min(1, (hi.s ?? 0) / 100)))
  const shLift = Math.max(-1, Math.min(1, (sh.l ?? 0) / 100))
  const miLift = Math.max(-1, Math.min(1, (mi.l ?? 0) / 100))
  const hiLift = Math.max(-1, Math.min(1, (hi.l ?? 0) / 100))

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]! / 255
    const g = pixels[i + 1]! / 255
    const b = pixels[i + 2]! / 255
    const lumaVal = luma(r, g, b)
    const wShadow = 1 - smoothstep(0.1 + bal, 0.4 + bal + blend, lumaVal)
    const wHigh = smoothstep(0.6 + bal - blend, 0.9 + bal, lumaVal)
    const wMid = Math.max(0, 1 - wShadow - wHigh)
    const nr = r + shOff[0] * shLift * wShadow + miOff[0] * miLift * wMid + hiOff[0] * hiLift * wHigh
    const ng = g + shOff[1] * shLift * wShadow + miOff[1] * miLift * wMid + hiOff[1] * hiLift * wHigh
    const nb = b + shOff[2] * shLift * wShadow + miOff[2] * miLift * wMid + hiOff[2] * hiLift * wHigh
    pixels[i] = Math.round(clamp01(nr) * 255)
    pixels[i + 1] = Math.round(clamp01(ng) * 255)
    pixels[i + 2] = Math.round(clamp01(nb) * 255)
  }
}

/** Saturation + Vibrance + Clarity（3x3 unsharp 近似） */
export function applySaturationVibrance(pixels: RGBA, saturation?: number, vibrance?: number): void {
  const sat = Math.max(-1, Math.min(1, (saturation ?? 0) / 100))
  const vib = Math.max(-1, Math.min(1, (vibrance ?? 0) / 100))
  if (sat === 0 && vib === 0) return
  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i]! / 255
    let g = pixels[i + 1]! / 255
    let b = pixels[i + 2]! / 255
    const gray = luma(r, g, b)
    if (sat !== 0) {
      r = gray + (r - gray) * (1 + sat)
      g = gray + (g - gray) * (1 + sat)
      b = gray + (b - gray) * (1 + sat)
    }
    if (vib !== 0) {
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      const factor = vib * (1 - smoothstep(0.1, 0.6, mx - mn))
      const gray2 = luma(r, g, b)
      r = gray2 + (r - gray2) * (1 + factor)
      g = gray2 + (g - gray2) * (1 + factor)
      b = gray2 + (b - gray2) * (1 + factor)
    }
    pixels[i] = Math.round(clamp01(r) * 255)
    pixels[i + 1] = Math.round(clamp01(g) * 255)
    pixels[i + 2] = Math.round(clamp01(b) * 255)
  }
}

export function applyClarity(src: RGBA, w: number, h: number, clarity?: number): RGBA {
  const c = Math.max(-1, Math.min(1, (clarity ?? 0) / 100))
  if (c === 0) return src
  // 3x3 box blur
  const blur = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      let cnt = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy
          const nx = x + dx
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
          const ni = (ny * w + nx) * 4
          r += src[ni]!
          g += src[ni + 1]!
          b += src[ni + 2]!
          cnt++
        }
      }
      const bi = (y * w + x) * 3
      blur[bi] = r / cnt
      blur[bi + 1] = g / cnt
      blur[bi + 2] = b / cnt
    }
  }
  const out = new Uint8Array(src.length)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4
      const bi = (py * w + px) * 3
      // high-freq = src - blur; adjusted = src + high-freq * c * midMask * 1.5
      const r = src[i]! / 255
      const g = src[i + 1]! / 255
      const b = src[i + 2]! / 255
      const br = blur[bi]! / 255
      const bg = blur[bi + 1]! / 255
      const bb = blur[bi + 2]! / 255
      const L = luma(r, g, b)
      let mid = 1 - Math.abs(L - 0.5) * 2
      if (mid < 0.2) mid = 0.2
      const factor = c * mid * 1.5
      out[i] = Math.round(clamp01(r + (r - br) * factor) * 255)
      out[i + 1] = Math.round(clamp01(g + (g - bg) * factor) * 255)
      out[i + 2] = Math.round(clamp01(b + (b - bb) * factor) * 255)
      out[i + 3] = src[i + 3]!
    }
  }
  return out
}

/** Halation —— 单 pass 9-tap 近似（与 GPU 一致） */
const S = Math.SQRT1_2 // √(1/2) ≈ 0.7071
const HALATION_TAPS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [S, S],
  [-S, S],
  [S, -S],
  [-S, -S],
]
const HALATION_WEIGHTS = [0.2, 0.12, 0.12, 0.12, 0.12, 0.08, 0.08, 0.08, 0.08]

export function applyHalation(src: RGBA, w: number, h: number, p: HalationParams): RGBA {
  const amount = Math.max(0, Math.min(1, (p.amount ?? 0) / 100))
  if (amount === 0) return src
  const threshold = Math.max(0, Math.min(1, (p.threshold ?? 220) / 255))
  const radius = Math.max(1, Math.min(30, p.radius ?? 10))
  const texelX = 1 / Math.max(1, w)
  const texelY = 1 / Math.max(1, h)
  const out = new Uint8Array(src.length)

  // sample helper with clamp-to-edge
  const sampleR = (x: number, y: number): [number, number, number] => {
    const xi = Math.max(0, Math.min(w - 1, Math.round(x)))
    const yi = Math.max(0, Math.min(h - 1, Math.round(y)))
    const idx = (yi * w + xi) * 4
    return [src[idx]! / 255, src[idx + 1]! / 255, src[idx + 2]! / 255]
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r0 = src[i]! / 255
      const g0 = src[i + 1]! / 255
      const b0 = src[i + 2]! / 255
      const L0 = luma(r0, g0, b0)
      const gate = smoothstep(threshold, Math.min(threshold + 0.15, 1), L0)
      let haloR = 0
      for (let k = 0; k < 9; k++) {
        const tap = HALATION_TAPS[k]!
        const sx = x + tap[0] * texelX * w * radius
        const sy = y + tap[1] * texelY * h * radius
        const [sr, sg, sb] = sampleR(sx, sy)
        const sL = luma(sr, sg, sb)
        const sGate = smoothstep(threshold, Math.min(threshold + 0.15, 1), sL)
        haloR += sr * sGate * HALATION_WEIGHTS[k]!
      }
      let or = r0 + haloR * amount
      let og = g0
      let ob = b0 + haloR * amount * 0.15
      or = or * (1 - gate * 0.2) + r0 * (gate * 0.2)
      og = og * (1 - gate * 0.2) + g0 * (gate * 0.2)
      ob = ob * (1 - gate * 0.2) + b0 * (gate * 0.2)
      out[i] = Math.round(clamp01(or) * 255)
      out[i + 1] = Math.round(clamp01(og) * 255)
      out[i + 2] = Math.round(clamp01(ob) * 255)
      out[i + 3] = src[i + 3]!
    }
  }
  return out
}

/** Grain —— 单 pass 带 midMask 的像素噪声 */
function hash21(px: number, py: number): number {
  let fx = (px * 123.34) % 1
  let fy = (py * 456.21) % 1
  fx = fx < 0 ? fx + 1 : fx
  fy = fy < 0 ? fy + 1 : fy
  const dot = fx * (fx + 45.32) + fy * (fy + 45.32)
  const p1 = (fx + dot) % 1
  const p2 = (fy + dot) % 1
  const prod = p1 * p2
  return prod - Math.floor(prod)
}

export function applyGrain(pixels: RGBA, w: number, h: number, p: GrainParams): void {
  const amount = Math.max(0, Math.min(1, (p.amount ?? 0) / 100))
  if (amount === 0) return
  const size = Math.max(0.5, Math.min(4, p.size ?? 1))
  const roughness = Math.max(0, Math.min(1, p.roughness ?? 0.5))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const px = Math.floor(x / size)
      const py = Math.floor(y / size)
      const n1 = hash21(px, py)
      const n2 = hash21(px + 37, py + 17)
      const noise = n1 * (1 - roughness) + n2 * roughness - 0.5
      const r = pixels[i]! / 255
      const g = pixels[i + 1]! / 255
      const b = pixels[i + 2]! / 255
      const L = luma(r, g, b)
      let midMask = 1 - Math.abs(L - 0.5) * 2
      if (midMask < 0.15) midMask = 0.15
      const delta = noise * amount * 0.18 * midMask
      pixels[i] = Math.round(clamp01(r + delta) * 255)
      pixels[i + 1] = Math.round(clamp01(g + delta) * 255)
      pixels[i + 2] = Math.round(clamp01(b + delta) * 255)
    }
  }
}

/** Vignette */
export function applyVignette(pixels: RGBA, w: number, h: number, p: VignetteParams): void {
  const amount = Math.max(-1, Math.min(1, (p.amount ?? 0) / 100))
  if (amount === 0) return
  const midpoint = Math.max(0, Math.min(1, (p.midpoint ?? 50) / 100))
  const roundness = Math.max(-1, Math.min(1, (p.roundness ?? 0) / 100))
  const feather = Math.max(0.001, Math.min(1, (p.feather ?? 50) / 100))
  const aspect = w / Math.max(1, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      // GPU 公式：offset = uv - 0.5; offset.x *= mix(1.0, aspect, 0.5 - 0.5*roundness)
      const mixK = 0.5 - 0.5 * roundness
      const ox = (x / w - 0.5) * (1 * (1 - mixK) + aspect * mixK)
      const oy = y / h - 0.5
      const r2 = Math.sqrt(ox * ox + oy * oy) * 2
      const weight = smoothstep(midpoint, midpoint + feather, r2)
      const factor = 1 + amount * weight
      pixels[i] = Math.round(Math.max(0, Math.min(255, pixels[i]! * factor)))
      pixels[i + 1] = Math.round(Math.max(0, Math.min(255, pixels[i + 1]! * factor)))
      pixels[i + 2] = Math.round(Math.max(0, Math.min(255, pixels[i + 2]! * factor)))
    }
  }
}

// ========== 入口 ==========

/**
 * 把 pipeline 应用到 RGBA 像素缓冲（in-place 优化 + 必要时新缓冲）。
 *
 * 返回：可能是输入本身，也可能是新分配的缓冲（clarity/halation 必须新分配）
 *
 * 注意：本函数不处理 LUT —— LUT 由 GPU 或主进程独立处理（CPU 三线性插值在
 *   JS 里做 24MP 代价太高，且主要 CPU 使用场景是"老机器的兜底"，此时 LUT
 *   滤镜一般也用不上。后续可扩展为 dedicated CPU LUT pass）。
 */
export function applyPipelineToRGBA(
  input: Uint8Array,
  width: number,
  height: number,
  pipeline: FilterPipeline,
): Uint8Array {
  let buf = input
  // 1. White Balance
  if (pipeline.whiteBalance) applyWhiteBalance(buf, pipeline.whiteBalance)
  // 2. Tone
  if (pipeline.tone) applyTone(buf, pipeline.tone)
  // 3. Curves
  if (pipeline.curves) applyCurves(buf, pipeline.curves)
  // 4. HSL
  if (pipeline.hsl) applyHsl(buf, pipeline.hsl)
  // 5. Color Grading
  if (pipeline.colorGrading) applyColorGrading(buf, pipeline.colorGrading)
  // 6. Adjustments（saturation + vibrance + clarity）
  applySaturationVibrance(buf, pipeline.saturation, pipeline.vibrance)
  if (pipeline.clarity !== undefined && pipeline.clarity !== 0) {
    buf = applyClarity(buf, width, height, pipeline.clarity)
  }
  // 7. LUT —— CPU 不做（见注释）
  // 8. Halation
  if (pipeline.halation && (pipeline.halation.amount ?? 0) > 0) {
    buf = applyHalation(buf, width, height, pipeline.halation)
  }
  // 9. Grain
  if (pipeline.grain) applyGrain(buf, width, height, pipeline.grain)
  // 10. Vignette
  if (pipeline.vignette) applyVignette(buf, width, height, pipeline.vignette)
  return buf
}

/**
 * 检测 pipeline 里 CPU 路径**完全不支持**的通道（F2 用）。
 * 目前只有 LUT；其余 9 个通道 CPU 均等价 GPU。
 *
 * 用于 UI 显示提示、或批处理选择 GPU 路径的判据。
 */
export function detectCpuOnlyLimitations(pipeline: FilterPipeline | null): string[] {
  if (!pipeline) return []
  const limits: string[] = []
  if (pipeline.lut) limits.push('lut')
  return limits
}
