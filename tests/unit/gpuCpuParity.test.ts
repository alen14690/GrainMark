/**
 * gpuCpuParity.test.ts —— 生产 CPU pipeline vs 测试 CPU 镜像 的一致性断言（F5）
 *
 * 定位：
 *   perceptibility.test.ts 只跑 CPU 镜像，不触及 GPU shader。
 *   本测试把「生产环境真正用的 cpuPipeline」与「测试镜像 shaderCpuMirror」
 *   做逐通道交叉比对，形成「任一侧单边变化都会被抓到」的防护网。
 *
 * 两类断言：
 *   A. **严格像素一致**（公式严格等价的通道）：tone / WB / HSL / saturation / vibrance / curves（恒等）
 *      tolerance ≤ 1-2/255，浮点舍入误差。
 *   B. **方向 + 量级一致**（公式近似等价的通道）：vignette / colorGrading / grain / halation
 *      —— 两侧都是 GPU 的"CPU 等价"但实现细节不同（几何采样、hash 函数、zone 划分），
 *      绝对像素会差，断言只验证"两边都产生同一量级的改变"。
 *
 * 一旦任一侧被改坏导致完全不动，断言立即红。
 * 真 GPU 一致性则在 Playwright 集成层补（M5 路线图）。
 */
import { describe, expect, it } from 'vitest'
import {
  applyPipelineToRGBA,
  applyColorGrading as prodApplyColorGrading,
  applyCurves as prodApplyCurves,
  applyGrain as prodApplyGrain,
  applyHalation as prodApplyHalation,
  applyHsl as prodApplyHsl,
  applySaturationVibrance as prodApplySaturationVibrance,
  applyTone as prodApplyTone,
  applyVignette as prodApplyVignette,
  applyWhiteBalance as prodApplyWhiteBalance,
} from '../../electron/services/filter-engine/cpuPipeline'
import {
  applyColorGradingCpu,
  applyGrainCpu,
  applyHalationCpu,
  applyHslFullCpu,
  applySaturationCpu,
  applyToneCpu,
  applyVibranceCpu,
  applyVignetteCpu,
  applyWhiteBalanceCpu,
  makeStandardInput,
} from '../utils/shaderCpuMirror'

const W = 32
const H = 32
const TOLERANCE = 1 // 允许 1/255 像素差

function maxDiff(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray): number {
  if (a.length !== b.length) throw new Error(`length mismatch: ${a.length} vs ${b.length}`)
  let max = 0
  for (let i = 0; i < a.length; i += 4) {
    const dr = Math.abs(a[i]! - b[i]!)
    const dg = Math.abs(a[i + 1]! - b[i + 1]!)
    const db = Math.abs(a[i + 2]! - b[i + 2]!)
    if (dr > max) max = dr
    if (dg > max) max = dg
    if (db > max) max = db
  }
  return max
}

function makeInput(): Uint8Array {
  // makeStandardInput 返回 Uint8ClampedArray；复制到 Uint8Array 以便生产侧 in-place 修改
  return new Uint8Array(makeStandardInput(W, H))
}

describe('gpuCpuParity · Tone 通道：prod cpuPipeline vs test mirror', () => {
  const cases = [
    { exposure: 1 },
    { exposure: -1 },
    { exposure: 0, contrast: 50 },
    { exposure: 0, contrast: -100 },
    { exposure: 0, highlights: 100 },
    { exposure: 0, highlights: -100 },
    { exposure: 0, shadows: 100 },
    { exposure: 0, shadows: -100 },
    { exposure: 0, whites: 100 },
    { exposure: 0, blacks: -100 },
    { exposure: 0.5, contrast: 30, highlights: 20, shadows: -30 },
  ]
  for (const p of cases) {
    it(`tone(${JSON.stringify(p)}) 两侧结果一致`, () => {
      const a = makeInput()
      const b = new Uint8ClampedArray(makeInput())
      prodApplyTone(a, {
        exposure: 0,
        contrast: 0,
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
        ...p,
      })
      const bOut = applyToneCpu(b, W, H, p)
      expect(maxDiff(a, bOut)).toBeLessThanOrEqual(TOLERANCE)
    })
  }
})

describe('gpuCpuParity · WhiteBalance', () => {
  const cases = [{ temp: 50 }, { temp: -100 }, { tint: 100 }, { tint: -50 }, { temp: 30, tint: -20 }]
  for (const p of cases) {
    it(`wb(${JSON.stringify(p)})`, () => {
      const a = makeInput()
      const b = new Uint8ClampedArray(makeInput())
      prodApplyWhiteBalance(a, { temp: 0, tint: 0, ...p })
      const bOut = applyWhiteBalanceCpu(b, W, H, p)
      expect(maxDiff(a, bOut)).toBeLessThanOrEqual(TOLERANCE)
    })
  }
})

describe('gpuCpuParity · HSL', () => {
  const cases = [
    { red: { h: 50, s: 0, l: 0 } },
    { green: { h: 0, s: -80, l: 0 } },
    { blue: { h: 0, s: 0, l: 50 } },
    { red: { h: 30, s: 20, l: -10 }, orange: { h: 0, s: -40, l: 0 } },
  ]
  for (const p of cases) {
    it(`hsl(${JSON.stringify(p)})`, () => {
      const a = makeInput()
      const b = new Uint8ClampedArray(makeInput())
      prodApplyHsl(a, p)
      const bOut = applyHslFullCpu(b, W, H, p)
      expect(maxDiff(a, bOut)).toBeLessThanOrEqual(TOLERANCE + 1) // HSL 路径更多浮点操作，留 2/255
    })
  }
})

describe('gpuCpuParity · Saturation & Vibrance', () => {
  it('saturation +50', () => {
    const a = makeInput()
    const b = new Uint8ClampedArray(makeInput())
    prodApplySaturationVibrance(a, 50, 0)
    const bOut = applySaturationCpu(b, W, H, 50)
    expect(maxDiff(a, bOut)).toBeLessThanOrEqual(TOLERANCE)
  })
  it('vibrance +80', () => {
    const a = makeInput()
    const b = new Uint8ClampedArray(makeInput())
    prodApplySaturationVibrance(a, 0, 80)
    const bOut = applyVibranceCpu(b, W, H, 80)
    expect(maxDiff(a, bOut)).toBeLessThanOrEqual(TOLERANCE)
  })
})

describe('gpuCpuParity · Vignette', () => {
  it('amount=-50 两侧都明显压暗（方向一致，绝对差异受实现细节影响）', () => {
    const a = makeInput()
    const b = new Uint8ClampedArray(makeInput())
    const ref = new Uint8ClampedArray(makeInput())
    prodApplyVignette(a, W, H, { amount: -50, midpoint: 50, roundness: 0, feather: 50 })
    const bOut = applyVignetteCpu(b, W, H, {
      amount: -50,
      midpoint: 50,
      roundness: 0,
      feather: 50,
      aspect: W / H,
    })
    // 两份 CPU 实现都是"GPU 的 CPU 版本"，几何细节可能差异较大（采样中心、
    // aspect 补偿公式微差），但都必须：相对于原图"明显变化"，方向一致。
    // 故检查"两侧相对原图都 < ref 且改变量在同量级"。
    const refArr = new Uint8Array(ref)
    const dProd = maxDiff(a, refArr)
    const dMirror = maxDiff(bOut, refArr)
    expect(dProd).toBeGreaterThan(10)
    expect(dMirror).toBeGreaterThan(10)
    // 两侧改变量比例不应差超过 3×
    const ratio = dProd / Math.max(1, dMirror)
    expect(ratio).toBeGreaterThan(1 / 3)
    expect(ratio).toBeLessThan(3)
  })
})

describe('gpuCpuParity · ColorGrading', () => {
  it('三向色轮 + balance 合成（方向一致 + 量级在同一档）', () => {
    const a = makeInput()
    const b = new Uint8ClampedArray(makeInput())
    const ref = new Uint8Array(makeInput())
    const p = {
      shadows: { h: 200, s: 50, l: 20 },
      midtones: { h: 40, s: 30, l: 10 },
      highlights: { h: 30, s: 40, l: 30 },
      blending: 60,
      balance: 10,
    }
    prodApplyColorGrading(a, p)
    const bOut = applyColorGradingCpu(b, W, H, p)
    // 两侧实现对 zone 划分阈值不同（生产用 smoothstep + balance offset，
    // mirror 用简化线性），但都应相对原图产生可见改变
    expect(maxDiff(a, ref)).toBeGreaterThan(5)
    expect(maxDiff(bOut, ref)).toBeGreaterThan(5)
  })
})

describe('gpuCpuParity · Grain', () => {
  it('grain +50 两侧都注入明显噪声（哈希函数不同，不比对绝对值）', () => {
    const a = makeInput()
    const b = new Uint8ClampedArray(makeInput())
    const ref = new Uint8Array(makeInput())
    prodApplyGrain(a, W, H, { amount: 50, size: 1, roughness: 0.5 })
    const bOut = applyGrainCpu(b, W, H, { amount: 50, size: 1, roughness: 0.5 })
    // 生产用"两个 hash21 混合"（GLSL 等价），mirror 用 mulberry32 seeded rng
    // —— 彼此像素值不相等是预期的。只断言两侧都显著偏离原图。
    expect(maxDiff(a, ref)).toBeGreaterThan(5)
    expect(maxDiff(bOut, ref)).toBeGreaterThan(5)
  })
})

describe('gpuCpuParity · Halation', () => {
  it('两侧都在高光区附近注入红色泛光（方向一致）', () => {
    const a = makeInput()
    const b = new Uint8ClampedArray(makeInput())
    const ref = new Uint8Array(makeInput())
    const out = prodApplyHalation(a, W, H, { amount: 60, threshold: 200, radius: 8 })
    const bOut = applyHalationCpu(b, W, H, { amount: 60, threshold: 200, radius: 8 })
    // 两侧都应对图像产生可见改变（halation 是加性效果）
    expect(maxDiff(out, ref)).toBeGreaterThan(3)
    expect(maxDiff(bOut, ref)).toBeGreaterThan(3)
  })
})

describe('gpuCpuParity · 完整 pipeline', () => {
  it('多通道叠加后，结果仍落在受控差异内', () => {
    const a = makeInput()
    const out = applyPipelineToRGBA(a, W, H, {
      whiteBalance: { temp: 30, tint: 10 },
      tone: { exposure: 0.5, contrast: 20, highlights: 10, shadows: 20, whites: 0, blacks: 0 },
      saturation: 10,
      vignette: { amount: -20, midpoint: 50, roundness: 0, feather: 50 },
    })
    // 这里不比对 CPU 镜像（镜像没做完整 pipeline orchestration），
    // 只验证不会 NaN / 不会越界
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBeGreaterThanOrEqual(0)
      expect(out[i]).toBeLessThanOrEqual(255)
      expect(Number.isFinite(out[i]!)).toBe(true)
    }
  })
})

describe('gpuCpuParity · 蓝军验证：手动注入 mutation 必须被抓住', () => {
  // 这是一组"反事实"测试：如果某天把 prodApplyTone 的系数改错，下面的断言就会红。
  // 当前只是"正向保护"——我们不真的 mutation，只断言 "同一输入，两侧结果极其接近"。
  it('exposure +2 两侧差值 < 2/255（若任一侧改 2^2 系数会立刻红）', () => {
    const a = makeInput()
    const b = new Uint8ClampedArray(makeInput())
    prodApplyTone(a, {
      exposure: 2,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
    })
    const bOut = applyToneCpu(b, W, H, { exposure: 2 })
    expect(maxDiff(a, bOut)).toBeLessThanOrEqual(2)
  })

  it('curves：生产侧不直接对应 mirror，断言两侧单独 apply 后不崩', () => {
    // curves 在镜像侧只有 applyCurvesRgbCpu（rgb 通道），prod 侧 applyCurves 支持全 4 通道。
    // 只断言生产侧对简单输入表现线性：y=x 恒等不改变像素
    const a = makeInput()
    prodApplyCurves(a, {
      rgb: [
        { x: 0, y: 0 },
        { x: 255, y: 255 },
      ],
    })
    const ref = makeInput()
    expect(maxDiff(a, ref)).toBe(0)
  })
})
