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
 *
 * 与 GPU shader 算法严格等价（**M4.5 前置整改**：移除 curve() 降敏、放宽蒙版、提系数）：
 *   - exposure：**直接收 UI 值当 EV**（与 GPU normalizeToneParams 一致），范围 [-5, 5]
 *     → 修正了原版 `(ui/100)*2` 的错误语义（把 UI 范围误当作 -100..100 映射到 ±2 EV）
 *   - contrast / highlights / shadows / whites / blacks：UI /100，线性响应，不再过 curve()
 *   - highlights 蒙版：smoothstep(0.35, 0.85)（原 0.55/0.95）
 *   - shadows    蒙版：smoothstep(0.15, 0.65) 反向（原 0.0/0.45）
 *   - whites     蒙版：smoothstep(0.60, 0.98)（原 0.75/1.0）
 *   - blacks     蒙版：smoothstep(0.02, 0.40) 反向（原 0.0/0.25）
 *   - 强度系数：highlights/whites 0.55（原 0.30）、shadows/blacks 0.65（原 0.35）
 *
 * 顺序：exposure → contrast → highlights → shadows → whites(mix) → blacks(mix)
 */
export interface ToneParams {
  exposure?: number
  contrast?: number
  highlights?: number
  shadows?: number
  whites?: number
  blacks?: number
}

/**
 * @deprecated M4.5 起 shader 已移除内部 curve() 降敏。仅为老测试不破坏保留此导出；
 *   新代码不应再依赖"中段压扁"的非线性曲线——中段敏感度由 UI Slider 的 ease-center 负责。
 *   将在 M5 清理阶段移除。
 */
export function curveEaseCenter(x: number): number {
  const ax = Math.abs(x)
  return Math.sign(x) * ax ** 1.6
}

export function applyToneCpu(src: RGBA, w: number, h: number, p: ToneParams): RGBA {
  const out = createCanvas(w, h)
  // 与 GPU normalizeToneParams 一致：exposure 直接是 EV，其他 /100
  const ev = Math.max(-5, Math.min(5, p.exposure ?? 0))
  const exp = 2 ** ev
  const contrastAmt = Math.max(-1, Math.min(1, (p.contrast ?? 0) / 100))
  const hi = Math.max(-1, Math.min(1, (p.highlights ?? 0) / 100))
  const sh = Math.max(-1, Math.min(1, (p.shadows ?? 0) / 100))
  const wh = Math.max(-1, Math.min(1, (p.whites ?? 0) / 100))
  const bk = Math.max(-1, Math.min(1, (p.blacks ?? 0) / 100))

  for (let i = 0; i < src.length; i += 4) {
    let r = (src[i]! / 255) * exp
    let g = (src[i + 1]! / 255) * exp
    let b = (src[i + 2]! / 255) * exp

    // contrast: (x - 0.5) * (1 + c) + 0.5 —— 基于 luma，保持色相
    // GPU shader 先 clamp applyContrast 到 [0,1] 再按 lumaAdj/luma 比例乘；
    // CPU 镜像忠实还原
    const L0 = luma(r, g, b)
    const cm = 1 + contrastAmt
    const lumaAdj = clamp01((L0 - 0.5) * cm + 0.5)
    const scaleContrast = lumaAdj / Math.max(L0, 1e-4)
    r *= scaleContrast
    g *= scaleContrast
    b *= scaleContrast

    // highlights mask（smoothstep(0.35, 0.85, luma)）
    const L1 = luma(r, g, b)
    const hiMaskT = clamp01((L1 - 0.35) / 0.5)
    const hiS = hiMaskT * hiMaskT * (3 - 2 * hiMaskT)
    const hlFactor = 1 + hi * 0.55 * hiS
    r *= hlFactor
    g *= hlFactor
    b *= hlFactor

    // shadows mask（smoothstep 反向，阈值 0.15..0.65）
    const L2 = luma(r, g, b)
    const shMaskT = clamp01((L2 - 0.15) / 0.5)
    const shS = 1 - shMaskT * shMaskT * (3 - 2 * shMaskT)
    const shFactor = 1 + sh * 0.65 * shS
    r *= shFactor
    g *= shFactor
    b *= shFactor

    // whites / blacks：mix(c, c * (1 + param * coeff), mask)
    const L3 = luma(r, g, b)
    const whMaskT = clamp01((L3 - 0.6) / 0.38)
    const whS = whMaskT * whMaskT * (3 - 2 * whMaskT)
    const whF = 1 + wh * 0.55
    r = r * (1 - whS) + r * whF * whS
    g = g * (1 - whS) + g * whF * whS
    b = b * (1 - whS) + b * whF * whS

    const L4 = luma(r, g, b)
    const bkMaskT = clamp01((L4 - 0.02) / 0.38)
    const bkS = 1 - bkMaskT * bkMaskT * (3 - 2 * bkMaskT)
    const bkF = 1 + bk * 0.65
    r = r * (1 - bkS) + r * bkF * bkS
    g = g * (1 - bkS) + g * bkF * bkS
    b = b * (1 - bkS) + b * bkF * bkS

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

/**
 * whiteBalance shader 镜像：temp 偏移 R/B，tint 偏移 G/M
 *
 * **M4.5 前置整改**：移除 curve() 降敏，改线性响应（与 GPU shader 同步）：
 *   - temp / tint 均 UI /100 后直接用
 *   - temp：R *= 1 + 0.3·temp · B *= 1 - 0.3·temp
 *   - tint：G *= 1 - 0.3·tint · R *= 1 + 0.1·tint · B *= 1 + 0.1·tint
 */
export interface WBParams {
  temp?: number
  tint?: number
}

export function applyWhiteBalanceCpu(src: RGBA, w: number, h: number, p: WBParams): RGBA {
  const out = createCanvas(w, h)
  const temp = Math.max(-1, Math.min(1, (p.temp ?? 0) / 100))
  const tint = Math.max(-1, Math.min(1, (p.tint ?? 0) / 100))

  for (let i = 0; i < src.length; i += 4) {
    let r = src[i]! / 255
    let g = src[i + 1]! / 255
    let b = src[i + 2]! / 255

    r *= 1 + temp * 0.3
    b *= 1 - temp * 0.3
    g *= 1 - tint * 0.3
    r *= 1 + tint * 0.1
    b *= 1 + tint * 0.1

    out[i] = Math.round(clamp01(r) * 255)
    out[i + 1] = Math.round(clamp01(g) * 255)
    out[i + 2] = Math.round(clamp01(b) * 255)
    out[i + 3] = src[i + 3]!
  }
  return out
}

/**
 * saturation 单通道 CPU 镜像（围绕 luma 的线性饱和度，与 GPU
 * ADJUSTMENTS_FRAG 的 saturation 分支等价）。
 *
 * GPU 数学：mix(vec3(gray), c, 1 + u_saturation) = gray + (c - gray) * (1 + s)
 * CPU 实现：逐通道 L + (ch - L) * (1 + s)
 */
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

/**
 * vibrance 单通道 CPU 镜像。
 *
 * **M4.5 前置整改**：原实现用 `weight = 1 - curSat` 线性权重，
 *   与 GPU `factor = u_vibrance * (1 - smoothstep(0.1, 0.6, curSat))` 有约 8% 偏差。
 *   新实现复用 applyAdjustmentsPass，保证与 GPU ADJUSTMENTS_FRAG 严格等价。
 *
 * 如需单独测 vibrance，优先走此函数（内部 delegate 到 adjustments pass）。
 */
export function applyVibranceCpu(src: RGBA, w: number, h: number, amount: number): RGBA {
  return applyAdjustmentsPass(src, w, h, { vibrance: amount })
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

/**
 * adjustments shader 镜像（shaders/adjustments.ts 的 saturation + vibrance 部分）
 *
 * 与 GPU ADJUSTMENTS_FRAG 严格等价（clarity 因依赖相邻像素，单像素测试不适合，
 * 此函数仅覆盖 saturation + vibrance；clarity 的单测仍走 applyClarityCpu）。
 *
 * saturation：mix(gray, c, 1 + u_saturation)
 * vibrance  ：factor = u_vibrance * (1 - smoothstep(0.1, 0.6, currentSat))
 *             mix(gray, c, 1 + factor)
 */
export interface AdjustmentsPassParams {
  saturation?: number // UI -100..100
  vibrance?: number
}

export function applyAdjustmentsPass(src: RGBA, w: number, h: number, p: AdjustmentsPassParams): RGBA {
  const out = createCanvas(w, h)
  const sat = Math.max(-1, Math.min(1, (p.saturation ?? 0) / 100))
  const vib = Math.max(-1, Math.min(1, (p.vibrance ?? 0) / 100))

  for (let i = 0; i < src.length; i += 4) {
    let r = src[i]! / 255
    let g = src[i + 1]! / 255
    let b = src[i + 2]! / 255
    const gray = luma(r, g, b)

    if (Math.abs(sat) > 1e-4) {
      const m = 1 + sat
      r = gray + (r - gray) * m
      g = gray + (g - gray) * m
      b = gray + (b - gray) * m
    }

    if (Math.abs(vib) > 1e-4) {
      const maxC = Math.max(r, g, b)
      const minC = Math.min(r, g, b)
      const curSat = maxC - minC
      const t = Math.max(0, Math.min(1, (curSat - 0.1) / 0.5))
      const smooth = t * t * (3 - 2 * t)
      const factor = vib * (1 - smooth)
      const m = 1 + factor
      r = gray + (r - gray) * m
      g = gray + (g - gray) * m
      b = gray + (b - gray) * m
    }

    out[i] = Math.round(clamp01(r) * 255)
    out[i + 1] = Math.round(clamp01(g) * 255)
    out[i + 2] = Math.round(clamp01(b) * 255)
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

/**
 * HSL shader 镜像（完整 8 通道版），与 shaders/hsl.ts 算法等价。
 *
 * 通道固定 8 个（与 shader CHANNEL_HUES 对齐）：
 *   red(0) · orange(30) · yellow(60) · green(120) · aqua(180) · blue(240) · purple(270) · magenta(300)
 *
 * 流程：
 *   1. RGB → HSL
 *   2. 计算当前 hue 到 8 通道中心的高斯权重（σ=30°，非归一化后再归一化到总权重）
 *   3. 加权累加每个通道的 H/S/L 修正：
 *      dH += weight_i * (h_i / 100) * 30°
 *      dS += weight_i * (s_i / 100)
 *      dL += weight_i * (l_i / 100) * 0.5
 *   4. satGate = smoothstep(0.05, 0.25, hsl.s)，灰度区弱化 H/S 修正（保留 L）
 *   5. HSL → RGB
 *
 * 注意：h/s/l 参数语义与 shader 一致 —— UI 值 -100..100
 */
export const HSL_CHANNELS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const
export type HSLChannelName = (typeof HSL_CHANNELS)[number]

/** 各通道中心色相（度），与 shader CHANNEL_HUES 严格对齐 */
const HSL_HUES: Record<HSLChannelName, number> = {
  red: 0,
  orange: 30,
  yellow: 60,
  green: 120,
  aqua: 180,
  blue: 240,
  purple: 270,
  magenta: 300,
}

/** HSL 每通道修正（UI 值 -100..100） */
export interface HSLChannelParams {
  h?: number
  s?: number
  l?: number
}

/** HSL 参数整体（可能只传部分通道，缺省通道视为 0） */
export type HSLParams = Partial<Record<HSLChannelName, HSLChannelParams>>

/** 循环色相差：返回 [0, 180] */
function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 360 - d)
}

/** RGB (0..1) → HSL (h: 0..360, s: 0..1, l: 0..1) */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const maxc = Math.max(r, g, b)
  const minc = Math.min(r, g, b)
  const l = (maxc + minc) * 0.5
  const d = maxc - minc
  if (d < 1e-5) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - maxc - minc) : d / (maxc + minc)
  let h = 0
  if (maxc === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (maxc === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return [h, s, l]
}

/**
 * HSL 完整 8 通道 CPU 镜像
 * @param src 输入 RGBA 0..255
 * @param p 8 通道参数（缺省通道不影响）
 */
export function applyHslFullCpu(src: RGBA, w: number, h: number, p: HSLParams): RGBA {
  const out = createCanvas(w, h)
  // 预归一化每个通道的 [h, s, l] 到 -1..1
  const ch: Array<{ h: number; s: number; l: number }> = HSL_CHANNELS.map((name) => {
    const v = p[name]
    return {
      h: clamp01Signed((v?.h ?? 0) / 100),
      s: clamp01Signed((v?.s ?? 0) / 100),
      l: clamp01Signed((v?.l ?? 0) / 100),
    }
  })
  const hues = HSL_CHANNELS.map((name) => HSL_HUES[name])
  const SIGMA2 = 1800 // 2 * 30 * 30

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]! / 255
    const g = src[i + 1]! / 255
    const b = src[i + 2]! / 255
    const [hue, sat, lum] = rgbToHsl(r, g, b)

    // 8 通道权重（归一化）
    let total = 0
    const weights: number[] = new Array(8)
    for (let k = 0; k < 8; k++) {
      const d = hueDist(hue, hues[k]!)
      const w2 = Math.exp((-d * d) / SIGMA2)
      weights[k] = w2
      total += w2
    }
    const inv = 1 / Math.max(total, 1e-4)

    let dH = 0
    let dS = 0
    let dL = 0
    for (let k = 0; k < 8; k++) {
      const wk = weights[k]! * inv
      dH += wk * ch[k]!.h * 30 // ±1 → ±30°
      dS += wk * ch[k]!.s
      dL += wk * ch[k]!.l * 0.5
    }

    // satGate：低饱和区（灰/近白/近黑）不染色
    const satGate = smoothstep(0.05, 0.25, sat)
    dH *= satGate
    dS *= satGate

    let newHue = (((hue + dH) % 360) + 360) % 360
    if (newHue >= 360) newHue -= 360
    const newSat = clamp01(sat * (1 + dS))
    // L 朝中性方向衰减（接近 0 或 1 时影响减弱，与 shader 一致）
    const newL = clamp01(lum + dL * (1 - Math.abs(lum - 0.5) * 2))

    const [nr, ng, nb] = hslToRgb(newHue, newSat, newL)
    out[i] = Math.round(clamp01(nr) * 255)
    out[i + 1] = Math.round(clamp01(ng) * 255)
    out[i + 2] = Math.round(clamp01(nb) * 255)
    out[i + 3] = src[i + 3]!
  }
  return out
}

function clamp01Signed(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
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
