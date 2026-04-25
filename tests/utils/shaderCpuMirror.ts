/**
 * Shader 像素级测试的 CPU 镜像实现
 *
 * 定位：
 * - 不走真 WebGL（Node vitest 没有 GL 上下文）；改用 TypeScript 重写 shader 的数学等价形式
 * - 用途：pipeline 算法的「意图快照」—— 当 shader GLSL 被无意改坏时，只要 CPU 镜像没同步，
 *   baseline 就会对不上，从而保护核心算法
 * - 约束：CPU 镜像与 GLSL 必须保持数学等价；shader 改动时同步改这里（约 30-80 行/shader）
 *
 * 限制：
 * - 不测 WebGL 驱动差异、精度差异、纹理过滤器差异（那是集成测试层的事）
 * - 不测 pipeline 串联后的 ping-pong 缓冲行为（交给 integration e2e）
 * - 不测 sampler3D / readPixels 硬件一致性（留给 M3-b 的 Playwright GPU 测试）
 */
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

// ========== 基础工具 ==========

/** RGBA 像素缓冲，[r,g,b,a,r,g,b,a,...] 0..255 */
export type RGBA = Uint8ClampedArray

export function createCanvas(w: number, h: number): RGBA {
  return new Uint8ClampedArray(w * h * 4)
}

export function toPNG(buf: RGBA, w: number, h: number): Buffer {
  const png = new PNG({ width: w, height: h })
  png.data = Buffer.from(buf.buffer)
  return PNG.sync.write(png)
}

export function fromPNG(buf: Buffer): { data: RGBA; width: number; height: number } {
  const png = PNG.sync.read(buf)
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height }
}

/** 标准测试图：100×100 · 水平亮度梯度 + 垂直色相带 */
export function makeStandardInput(w = 100, h = 100): RGBA {
  const out = createCanvas(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const luminance = x / (w - 1) // 0..1 左→右
      // 垂直把画面分 4 带：灰度 / 红 / 绿 / 蓝
      const band = Math.floor((y / h) * 4)
      if (band === 0) {
        out[i] = out[i + 1] = out[i + 2] = Math.round(luminance * 255)
      } else if (band === 1) {
        out[i] = Math.round(luminance * 255)
        out[i + 1] = 0
        out[i + 2] = 0
      } else if (band === 2) {
        out[i] = 0
        out[i + 1] = Math.round(luminance * 255)
        out[i + 2] = 0
      } else {
        out[i] = 0
        out[i + 1] = 0
        out[i + 2] = Math.round(luminance * 255)
      }
      out[i + 3] = 255
    }
  }
  return out
}

// ========== 颜色空间工具 ==========

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
export function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/** Rec.709 luma */
export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// ========== CPU 镜像：每个 shader 一个函数 ==========
// 约定：输入输出均为 0..255 RGBA；像素级独立（可并行但这里串行即可）

/**
 * tone shader 镜像（shaders/tone.ts）
 * 顺序：exposure（线性乘）→ contrast（中点 0.5）→ highlights / shadows（smoothstep 蒙版）→
 *       whites / blacks（端点提亮 / 压暗）
 * UI 范围 -100..100；exposure 映射到 EV -2..2
 */
export interface ToneParams {
  exposure?: number
  contrast?: number
  highlights?: number
  shadows?: number
  whites?: number
  blacks?: number
}

export function applyToneCpu(src: RGBA, w: number, h: number, p: ToneParams): RGBA {
  const out = createCanvas(w, h)
  const ev = ((p.exposure ?? 0) / 100) * 2
  const exp = 2 ** ev
  const contrastAmt = (p.contrast ?? 0) / 100
  const hi = (p.highlights ?? 0) / 100
  const sh = (p.shadows ?? 0) / 100
  const wh = (p.whites ?? 0) / 100
  const bk = (p.blacks ?? 0) / 100

  for (let i = 0; i < src.length; i += 4) {
    let r = (src[i]! / 255) * exp
    let g = (src[i + 1]! / 255) * exp
    let b = (src[i + 2]! / 255) * exp

    // contrast: (x - 0.5) * (1 + c) + 0.5
    const cm = 1 + contrastAmt
    r = (r - 0.5) * cm + 0.5
    g = (g - 0.5) * cm + 0.5
    b = (b - 0.5) * cm + 0.5

    // highlights mask（smoothstep(0.5, 1.0, luma)）
    const L = luma(r, g, b)
    const hiMask = clamp01((L - 0.5) / 0.5)
    const hiS = hiMask * hiMask * (3 - 2 * hiMask)
    r += hi * hiS * 0.3
    g += hi * hiS * 0.3
    b += hi * hiS * 0.3

    // shadows mask（smoothstep(0.5, 0.0, luma) 反向）
    const shMask = clamp01((0.5 - L) / 0.5)
    const shS = shMask * shMask * (3 - 2 * shMask)
    r += sh * shS * 0.3
    g += sh * shS * 0.3
    b += sh * shS * 0.3

    // whites / blacks 线性端点
    r += wh * 0.15 * clamp01(L * 2 - 1) + bk * 0.15 * clamp01(1 - L * 2)
    g += wh * 0.15 * clamp01(L * 2 - 1) + bk * 0.15 * clamp01(1 - L * 2)
    b += wh * 0.15 * clamp01(L * 2 - 1) + bk * 0.15 * clamp01(1 - L * 2)

    out[i] = Math.round(clamp01(r) * 255)
    out[i + 1] = Math.round(clamp01(g) * 255)
    out[i + 2] = Math.round(clamp01(b) * 255)
    out[i + 3] = src[i + 3]!
  }
  return out
}

/**
 * vignette shader 镜像
 * amount 负 = 暗角，正 = 亮角；基于中心距离 + smoothstep 羽化 + roundness 圆度 + aspect
 */
export interface VignetteParams {
  amount?: number
  midpoint?: number // 0..100
  roundness?: number // -100..100
  feather?: number // 0..100
  aspect?: number // w/h
}

export function applyVignetteCpu(src: RGBA, w: number, h: number, p: VignetteParams): RGBA {
  const out = createCanvas(w, h)
  const amount = (p.amount ?? 0) / 100
  if (amount === 0) {
    out.set(src)
    return out
  }
  const midpoint = (p.midpoint ?? 50) / 100 // 0..1
  const roundness = (p.roundness ?? 0) / 100 // -1..1
  const feather = (p.feather ?? 50) / 100 // 0..1
  const aspect = p.aspect ?? w / h

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      // 中心化坐标 -1..1
      let dx = (x / w) * 2 - 1
      let dy = (y / h) * 2 - 1
      // aspect 补偿
      if (aspect > 1) dx *= aspect
      else dy /= aspect
      // roundness 控制椭圆 vs 圆（简化：roundness=0 圆，1 向正方形）
      const power = 2 - Math.abs(roundness) // 2=圆, 1=菱形
      const dist = (Math.abs(dx) ** power + Math.abs(dy) ** power) ** (1 / power)
      const inner = 1 - midpoint
      const outer = inner + feather + 0.01
      const mask = clamp01((dist - inner) / (outer - inner))
      const s = mask * mask * (3 - 2 * mask)
      const factor = 1 + amount * s * (amount < 0 ? 0.5 : 0.3)

      out[i] = Math.round(clamp255(src[i]! * factor))
      out[i + 1] = Math.round(clamp255(src[i + 1]! * factor))
      out[i + 2] = Math.round(clamp255(src[i + 2]! * factor))
      out[i + 3] = src[i + 3]!
    }
  }
  return out
}

/** whiteBalance shader 镜像：temp 偏移 R/B，tint 偏移 G/M */
export interface WBParams {
  temp?: number
  tint?: number
}

export function applyWhiteBalanceCpu(src: RGBA, w: number, h: number, p: WBParams): RGBA {
  const out = createCanvas(w, h)
  const temp = (p.temp ?? 0) / 100 // -1..1
  const tint = (p.tint ?? 0) / 100
  const tempR = 1 + temp * 0.3
  const tempB = 1 - temp * 0.3
  const tintG = 1 - tint * 0.3
  const tintM = 1 + tint * 0.3 // 影响 R 和 B 反向补偿

  for (let i = 0; i < src.length; i += 4) {
    const r = (src[i]! / 255) * tempR * Math.sqrt(tintM)
    const g = (src[i + 1]! / 255) * tintG
    const b = (src[i + 2]! / 255) * tempB * Math.sqrt(tintM)
    out[i] = Math.round(clamp01(r) * 255)
    out[i + 1] = Math.round(clamp01(g) * 255)
    out[i + 2] = Math.round(clamp01(b) * 255)
    out[i + 3] = src[i + 3]!
  }
  return out
}

/** saturation 简化版（整体饱和度乘子，围绕 luma） */
export function applySaturationCpu(src: RGBA, w: number, h: number, amount: number): RGBA {
  const out = createCanvas(w, h)
  const s = 1 + amount / 100
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]! / 255
    const g = src[i + 1]! / 255
    const b = src[i + 2]! / 255
    const L = luma(r, g, b)
    out[i] = Math.round(clamp01(L + (r - L) * s) * 255)
    out[i + 1] = Math.round(clamp01(L + (g - L) * s) * 255)
    out[i + 2] = Math.round(clamp01(L + (b - L) * s) * 255)
    out[i + 3] = src[i + 3]!
  }
  return out
}

/** vibrance 低饱和加权 saturation */
export function applyVibranceCpu(src: RGBA, w: number, h: number, amount: number): RGBA {
  const out = createCanvas(w, h)
  const v = amount / 100
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]! / 255
    const g = src[i + 1]! / 255
    const b = src[i + 2]! / 255
    const L = luma(r, g, b)
    const maxC = Math.max(r, g, b)
    const minC = Math.min(r, g, b)
    const curSat = maxC - minC
    const weight = 1 - curSat // 越低饱和权重越大
    const s = 1 + v * weight
    out[i] = Math.round(clamp01(L + (r - L) * s) * 255)
    out[i + 1] = Math.round(clamp01(L + (g - L) * s) * 255)
    out[i + 2] = Math.round(clamp01(L + (b - L) * s) * 255)
    out[i + 3] = src[i + 3]!
  }
  return out
}

/** clarity 简化：中频增强 近似 = (1+c)*src - c*blurred，blurred 用 3x3 box */
export function applyClarityCpu(src: RGBA, w: number, h: number, amount: number): RGBA {
  const out = createCanvas(w, h)
  const c = amount / 100
  // 3x3 box blur
  const blur = createCanvas(w, h)
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
      const i = (y * w + x) * 4
      blur[i] = r / cnt
      blur[i + 1] = g / cnt
      blur[i + 2] = b / cnt
      blur[i + 3] = 255
    }
  }
  for (let i = 0; i < src.length; i += 4) {
    out[i] = Math.round(clamp255((1 + c) * src[i]! - c * blur[i]!))
    out[i + 1] = Math.round(clamp255((1 + c) * src[i + 1]! - c * blur[i + 1]!))
    out[i + 2] = Math.round(clamp255((1 + c) * src[i + 2]! - c * blur[i + 2]!))
    out[i + 3] = src[i + 3]!
  }
  return out
}

/** 简单 RGB 曲线（只处理 rgb 通道，不单独 r/g/b），LUT 线性插值 */
export function applyCurvesRgbCpu(src: RGBA, w: number, h: number, lut: number[]): RGBA {
  const out = createCanvas(w, h)
  if (lut.length !== 256) {
    out.set(src)
    return out
  }
  for (let i = 0; i < src.length; i += 4) {
    out[i] = Math.round(clamp255(lut[src[i]!]! * 255))
    out[i + 1] = Math.round(clamp255(lut[src[i + 1]!]! * 255))
    out[i + 2] = Math.round(clamp255(lut[src[i + 2]!]! * 255))
    out[i + 3] = src[i + 3]!
  }
  return out
}

/** colorGrading 三色轮简化：luma 蒙版 + 每区独立 H/S/L shift */
export interface ColorGradingWheel {
  h?: number // -180..180
  s?: number // 0..100
  l?: number // -100..100
}
export interface ColorGradingParams {
  shadows?: ColorGradingWheel
  midtones?: ColorGradingWheel
  highlights?: ColorGradingWheel
  balance?: number // -100..100
  blending?: number // 0..100
}

/** HSL → RGB */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const C = (1 - Math.abs(2 * l - 1)) * s
  const Hp = h / 60
  const X = C * (1 - Math.abs((Hp % 2) - 1))
  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (Hp >= 0 && Hp < 1) {
    r1 = C
    g1 = X
  } else if (Hp < 2) {
    r1 = X
    g1 = C
  } else if (Hp < 3) {
    g1 = C
    b1 = X
  } else if (Hp < 4) {
    g1 = X
    b1 = C
  } else if (Hp < 5) {
    r1 = X
    b1 = C
  } else {
    r1 = C
    b1 = X
  }
  const m = l - C / 2
  return [r1 + m, g1 + m, b1 + m]
}

export function applyColorGradingCpu(src: RGBA, w: number, h: number, p: ColorGradingParams): RGBA {
  const out = createCanvas(w, h)
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]! / 255
    const g = src[i + 1]! / 255
    const b = src[i + 2]! / 255
    const L = luma(r, g, b)

    // 三区 smoothstep 权重
    const wShadow = Math.max(0, 1 - L * 3)
    const wHighlight = Math.max(0, (L - 0.66) * 3)
    const wMid = Math.max(0, 1 - wShadow - wHighlight)

    // 每区 color offset（h, s, l 映射到一个 RGB 偏移向量）
    function wheelOffset(wh: ColorGradingWheel | undefined): [number, number, number] {
      if (!wh) return [0, 0, 0]
      const h01 = ((wh.h ?? 0) + 360) % 360
      const s01 = (wh.s ?? 0) / 100
      const l01 = (wh.l ?? 0) / 100
      if (s01 === 0 && l01 === 0) return [0, 0, 0]
      const [tr, tg, tb] = hslToRgb(h01, s01, 0.5 + l01 * 0.5)
      return [(tr - 0.5) * 0.3 + l01 * 0.1, (tg - 0.5) * 0.3 + l01 * 0.1, (tb - 0.5) * 0.3 + l01 * 0.1]
    }
    const sh = wheelOffset(p.shadows)
    const md = wheelOffset(p.midtones)
    const hi = wheelOffset(p.highlights)

    const dr = sh[0] * wShadow + md[0] * wMid + hi[0] * wHighlight
    const dg = sh[1] * wShadow + md[1] * wMid + hi[1] * wHighlight
    const db = sh[2] * wShadow + md[2] * wMid + hi[2] * wHighlight

    out[i] = Math.round(clamp01(r + dr) * 255)
    out[i + 1] = Math.round(clamp01(g + dg) * 255)
    out[i + 2] = Math.round(clamp01(b + db) * 255)
    out[i + 3] = src[i + 3]!
  }
  return out
}

/**
 * grain shader 镜像：hash21 伪随机
 * 注意：GLSL 的 hash21 与 JS Math.random 不同；这里用固定种子的 mulberry32 产生等价「可重复随机」
 */
export interface GrainParams {
  amount?: number
  size?: number
  roughness?: number
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s += 0x6d2b79f5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function applyGrainCpu(src: RGBA, w: number, h: number, p: GrainParams, seed = 42): RGBA {
  const out = createCanvas(w, h)
  const amount = (p.amount ?? 0) / 100
  if (amount === 0) {
    out.set(src)
    return out
  }
  const rng = mulberry32(seed)
  const size = Math.max(1, Math.floor(p.size ?? 1))

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      // 按 size 分块采样：同一块内 noise 相同
      const bx = Math.floor(x / size)
      const by = Math.floor(y / size)
      // 用 bx,by 作为独立种子避免全图共用一个 rng 序列
      const noise = ((bx * 73856093) ^ (by * 19349663) ^ (seed * 83492791)) >>> 0
      const n = (noise / 4294967296 - 0.5) * 2 // -1..1
      // 中间调蒙版（亮度越接近 0.5 越强）
      const L = luma(src[i]! / 255, src[i + 1]! / 255, src[i + 2]! / 255)
      const mask = 1 - Math.abs(L - 0.5) * 2
      const d = n * amount * mask * 30 // 30 是经验幅度

      out[i] = Math.round(clamp255(src[i]! + d))
      out[i + 1] = Math.round(clamp255(src[i + 1]! + d))
      out[i + 2] = Math.round(clamp255(src[i + 2]! + d))
      out[i + 3] = src[i + 3]!
      void rng // keep lint happy if unused in this branch
    }
  }
  return out
}

/** halation 简化镜像：对高光（threshold 以上）做径向模糊并叠加偏红 */
export interface HalationParams {
  amount?: number
  threshold?: number // 0..255
  radius?: number
}

export function applyHalationCpu(src: RGBA, w: number, h: number, p: HalationParams): RGBA {
  const out = createCanvas(w, h)
  out.set(src)
  const amount = (p.amount ?? 0) / 100
  if (amount === 0) return out
  const threshold = (p.threshold ?? 200) / 255
  const radius = Math.max(1, Math.round(p.radius ?? 10))

  // 提取高光 bloom
  const bloom = createCanvas(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const L = luma(src[i]! / 255, src[i + 1]! / 255, src[i + 2]! / 255)
      if (L > threshold) {
        const over = L - threshold
        bloom[i] = Math.round(over * 255)
        bloom[i + 1] = Math.round(over * 255 * 0.5) // 偏红
        bloom[i + 2] = Math.round(over * 255 * 0.3)
      }
    }
  }
  // 9-tap radial blur（8 方向 + 中心）
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let br = 0
      let bg = 0
      let bb = 0
      let cnt = 0
      for (let k = 0; k < 9; k++) {
        const dx = k % 3 === 0 ? -radius : k % 3 === 1 ? 0 : radius
        const dy = Math.floor(k / 3) === 0 ? -radius : Math.floor(k / 3) === 1 ? 0 : radius
        const nx = Math.max(0, Math.min(w - 1, x + dx))
        const ny = Math.max(0, Math.min(h - 1, y + dy))
        const ni = (ny * w + nx) * 4
        br += bloom[ni]!
        bg += bloom[ni + 1]!
        bb += bloom[ni + 2]!
        cnt++
      }
      br /= cnt
      bg /= cnt
      bb /= cnt
      out[i] = Math.round(clamp255(src[i]! + br * amount))
      out[i + 1] = Math.round(clamp255(src[i + 1]! + bg * amount))
      out[i + 2] = Math.round(clamp255(src[i + 2]! + bb * amount))
    }
  }
  return out
}

/**
 * LUT3D 镜像：用三线性插值查 N³ LUT（RGBA8 体数据）
 * 参数：lut = cubeToRgba8 的输出（size³ × 4 bytes）
 */
export function applyLut3dCpu(
  src: RGBA,
  w: number,
  h: number,
  lut: Uint8Array,
  size: number,
  intensity = 1,
): RGBA {
  const out = createCanvas(w, h)
  const N = size

  function sample(r: number, g: number, b: number): [number, number, number] {
    // 半像素修正：coord = rgb*(N-1)/N + 0.5/N → 再乘 N 得到 rgb*(N-1) + 0.5
    const fx = r * (N - 1)
    const fy = g * (N - 1)
    const fz = b * (N - 1)
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const z0 = Math.floor(fz)
    const x1 = Math.min(N - 1, x0 + 1)
    const y1 = Math.min(N - 1, y0 + 1)
    const z1 = Math.min(N - 1, z0 + 1)
    const tx = fx - x0
    const ty = fy - y0
    const tz = fz - z0
    function at(xi: number, yi: number, zi: number): [number, number, number] {
      const idx = (zi * N * N + yi * N + xi) * 4
      return [lut[idx]!, lut[idx + 1]!, lut[idx + 2]!]
    }
    const c000 = at(x0, y0, z0)
    const c001 = at(x1, y0, z0)
    const c010 = at(x0, y1, z0)
    const c011 = at(x1, y1, z0)
    const c100 = at(x0, y0, z1)
    const c101 = at(x1, y0, z1)
    const c110 = at(x0, y1, z1)
    const c111 = at(x1, y1, z1)
    const out0 = [0, 1, 2].map((ch) => {
      const c00 = c000[ch]! * (1 - tx) + c001[ch]! * tx
      const c01 = c010[ch]! * (1 - tx) + c011[ch]! * tx
      const c10 = c100[ch]! * (1 - tx) + c101[ch]! * tx
      const c11 = c110[ch]! * (1 - tx) + c111[ch]! * tx
      const c0 = c00 * (1 - ty) + c01 * ty
      const c1 = c10 * (1 - ty) + c11 * ty
      return c0 * (1 - tz) + c1 * tz
    }) as [number, number, number]
    return out0
  }

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]! / 255
    const g = src[i + 1]! / 255
    const b = src[i + 2]! / 255
    const [gr, gg, gb] = sample(r, g, b)
    out[i] = Math.round(src[i]! * (1 - intensity) + gr * intensity)
    out[i + 1] = Math.round(src[i + 1]! * (1 - intensity) + gg * intensity)
    out[i + 2] = Math.round(src[i + 2]! * (1 - intensity) + gb * intensity)
    out[i + 3] = src[i + 3]!
  }
  return out
}

/** HSL 镜像（仅 red / orange 简化；8 通道完整版太冗长，保留为 TODO） */
export function applyHslSimpleCpu(
  src: RGBA,
  w: number,
  h: number,
  channel: 'red' | 'green' | 'blue',
  hShift: number, // -180..180
  sMul: number, // -100..100
  lMul: number, // -100..100
): RGBA {
  const out = createCanvas(w, h)
  const centerHue = channel === 'red' ? 0 : channel === 'green' ? 120 : 240
  const sigma = 30

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]! / 255
    const g = src[i + 1]! / 255
    const b = src[i + 2]! / 255
    const maxC = Math.max(r, g, b)
    const minC = Math.min(r, g, b)
    const L = (maxC + minC) / 2
    const d = maxC - minC
    let hue = 0
    let sat = 0
    if (d === 0) {
      hue = 0
      sat = 0
    } else {
      sat = L > 0.5 ? d / (2 - maxC - minC) : d / (maxC + minC)
      if (maxC === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60
      else if (maxC === g) hue = ((b - r) / d + 2) * 60
      else hue = ((r - g) / d + 4) * 60
    }

    // 高斯权重
    let dh = Math.abs(hue - centerHue)
    if (dh > 180) dh = 360 - dh
    const weight = Math.exp(-(dh * dh) / (2 * sigma * sigma))

    hue += hShift * weight
    sat = clamp01(sat * (1 + (sMul / 100) * weight))
    const newL = clamp01(L + (lMul / 100) * weight * 0.3)

    // HSL → RGB
    const [nr, ng, nb] = hslToRgb((hue + 360) % 360, sat, newL)
    out[i] = Math.round(clamp01(nr) * 255)
    out[i + 1] = Math.round(clamp01(ng) * 255)
    out[i + 2] = Math.round(clamp01(nb) * 255)
    out[i + 3] = src[i + 3]!
  }
  return out
}

// ========== Baseline IO ==========

export const BASELINE_DIR = 'tests/baselines/shaders'

export function writeBaseline(name: string, png: Buffer): void {
  const p = path.resolve(BASELINE_DIR, name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, png)
}

export function readBaseline(name: string): Buffer | null {
  const p = path.resolve(BASELINE_DIR, name)
  if (!fs.existsSync(p)) return null
  return fs.readFileSync(p)
}
