/**
 * Shader 像素级 Snapshot 测试（AGENTS.md 测试金字塔 Image Snapshot 层）
 *
 * 10 个 shader × 100×100 baseline PNG（本轮 M4.1 起含 HSL 完整 8 通道）
 *
 * 机制（F4 修复后）：
 * - 使用 tests/utils/shaderCpuMirror.ts 的 CPU 镜像函数渲染
 * - **基线缺失时必须显式 bless（npm run snapshot:update 或设 GRAINMARK_BLESS_BASELINES=1）**
 *   —— 修复了原来"首次运行自动写基线"导致"损坏态被固化为 baseline"的漏洞
 * - 后续运行比对 diffPercent ≤ 0.5%
 * - 算法语义改动（shader + CPU 镜像未同步）会在这里被抓到
 * - M4.1 更新：tone / whiteBalance / hsl baseline 需重生（GPU shader 引入
 *   ease-center curve 后 CPU 镜像同步）
 */
import { describe, it } from 'vitest'
import { comparePNG } from '../utils/imageMatcher'
import {
  applyClarityCpu,
  applyColorGradingCpu,
  applyCurvesRgbCpu,
  applyGrainCpu,
  applyHalationCpu,
  applyHslFullCpu,
  applyLut3dCpu,
  applySaturationCpu,
  applyToneCpu,
  applyVibranceCpu,
  applyVignetteCpu,
  applyWhiteBalanceCpu,
  makeStandardInput,
  readBaseline,
  toPNG,
  writeBaseline,
} from '../utils/shaderCpuMirror'

const W = 100
const H = 100

/** 是否允许写入新 baseline（仅显式 bless 模式） */
function isBlessMode(): boolean {
  return (
    process.env.GRAINMARK_BLESS_BASELINES === '1' ||
    process.env.UPDATE_SNAPSHOTS === '1' ||
    process.argv.includes('-u') ||
    process.argv.includes('--update')
  )
}

/**
 * 断言 actual PNG 匹配 baseline 文件。
 *
 * F4 修复：基线缺失不再自动写，必须显式 bless。这样保证首次运行不会把
 * "当前实现的任意输出"固化成 baseline 形成零防护。
 */
function expectMatchBaseline(actual: Buffer, baselineName: string, threshold = 0.005): void {
  const baseline = readBaseline(baselineName)
  if (!baseline) {
    if (isBlessMode()) {
      writeBaseline(baselineName, actual)
      // eslint-disable-next-line no-console
      console.log(`[bless] wrote baseline: ${baselineName}`)
      return
    }
    throw new Error(
      `Baseline missing: ${baselineName}. Run "GRAINMARK_BLESS_BASELINES=1 npm test" or "npm run snapshot:update" after manual review.`,
    )
  }
  const { diffPercent, diffPixels, width, height } = comparePNG(actual, baseline, { threshold: 0.1 })
  if (diffPercent > threshold) {
    if (isBlessMode()) {
      writeBaseline(baselineName, actual)
      // eslint-disable-next-line no-console
      console.log(`[bless] updated baseline: ${baselineName} (was diff ${(diffPercent * 100).toFixed(3)}%)`)
      return
    }
    throw new Error(
      `Baseline ${baselineName} diff=${(diffPercent * 100).toFixed(3)}% (${diffPixels}/${width * height}px)`,
    )
  }
}

describe('shader snapshots · 10 shader × 100×100', () => {
  const src = makeStandardInput(W, H)

  it('标准输入图本身也有一份 baseline（作为锚点）', () => {
    const png = toPNG(src, W, H)
    expectMatchBaseline(png, 'standard-input.png')
  })

  it('tone · exposure+30 contrast+20', () => {
    const out = applyToneCpu(src, W, H, { exposure: 30, contrast: 20 })
    expectMatchBaseline(toPNG(out, W, H), 'tone-exposure30-contrast20.png')
  })

  it('vignette · amount-50 midpoint50 feather50', () => {
    const out = applyVignetteCpu(src, W, H, {
      amount: -50,
      midpoint: 50,
      feather: 50,
      roundness: 0,
    })
    expectMatchBaseline(toPNG(out, W, H), 'vignette-minus50.png')
  })

  it('whiteBalance · temp+40 tint-20', () => {
    const out = applyWhiteBalanceCpu(src, W, H, { temp: 40, tint: -20 })
    expectMatchBaseline(toPNG(out, W, H), 'wb-temp40-tint-20.png')
  })

  it('saturation · +50', () => {
    const out = applySaturationCpu(src, W, H, 50)
    expectMatchBaseline(toPNG(out, W, H), 'saturation-plus50.png')
  })

  it('vibrance · +50', () => {
    const out = applyVibranceCpu(src, W, H, 50)
    expectMatchBaseline(toPNG(out, W, H), 'vibrance-plus50.png')
  })

  it('clarity · +50', () => {
    const out = applyClarityCpu(src, W, H, 50)
    expectMatchBaseline(toPNG(out, W, H), 'clarity-plus50.png')
  })

  it('curves · S 曲线（rgb 通道）', () => {
    // S 曲线 LUT：0→0, 0.25→0.15, 0.5→0.5, 0.75→0.85, 1→1
    const lut: number[] = new Array(256)
    for (let i = 0; i < 256; i++) {
      const x = i / 255
      // 平滑 S 曲线近似：3x²-2x³ 变形
      const y = 0.5 + Math.sin((x - 0.5) * Math.PI) * 0.5
      lut[i] = y
    }
    const out = applyCurvesRgbCpu(src, W, H, lut)
    expectMatchBaseline(toPNG(out, W, H), 'curves-s-shape.png')
  })

  it('colorGrading · shadows 冷蓝 highlights 暖橙', () => {
    const out = applyColorGradingCpu(src, W, H, {
      shadows: { h: 220, s: 50, l: -10 }, // 蓝
      midtones: {},
      highlights: { h: 30, s: 50, l: 10 }, // 橙
      balance: 0,
      blending: 50,
    })
    expectMatchBaseline(toPNG(out, W, H), 'colorGrading-teal-orange.png')
  })

  it('hsl · red 通道饱和 -50（去红）— 走 full 完整版', () => {
    const out = applyHslFullCpu(src, W, H, { red: { h: 0, s: -50, l: 0 } })
    expectMatchBaseline(toPNG(out, W, H), 'hsl-red-desat50.png')
  })

  it('hsl · full 8 通道多色同时调整（覆盖 shader 的加权融合）', () => {
    const out = applyHslFullCpu(src, W, H, {
      red: { h: 10, s: -30, l: 0 },
      green: { h: 0, s: 40, l: 10 },
      blue: { h: -20, s: 20, l: -10 },
      orange: { h: 0, s: -20, l: 0 },
    })
    expectMatchBaseline(toPNG(out, W, H), 'hsl-full-multi-channel.png')
  })

  it('hsl · full satGate 行为：灰度带不应被染色', () => {
    // red h+50 s+80：标准输入第 0 带是灰度，satGate 应让该带几乎不变
    const out = applyHslFullCpu(src, W, H, { red: { h: 50, s: 80, l: 0 } })
    expectMatchBaseline(toPNG(out, W, H), 'hsl-full-satgate-red.png')
  })

  it('grain · amount 30 size 2（seed 42 固定）', () => {
    const out = applyGrainCpu(src, W, H, { amount: 30, size: 2, roughness: 0.5 }, 42)
    expectMatchBaseline(toPNG(out, W, H), 'grain-amount30-size2.png')
  })

  it('halation · amount 40 threshold 180 radius 5', () => {
    const out = applyHalationCpu(src, W, H, { amount: 40, threshold: 180, radius: 5 })
    expectMatchBaseline(toPNG(out, W, H), 'halation-amount40.png')
  })

  it('lut3d · 17³ 恒等 LUT（输出应等于输入）', () => {
    const N = 17
    const lut = new Uint8Array(N * N * N * 4)
    for (let z = 0; z < N; z++) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = (z * N * N + y * N + x) * 4
          lut[i] = Math.round((x / (N - 1)) * 255)
          lut[i + 1] = Math.round((y / (N - 1)) * 255)
          lut[i + 2] = Math.round((z / (N - 1)) * 255)
          lut[i + 3] = 255
        }
      }
    }
    const out = applyLut3dCpu(src, W, H, lut, N, 1)
    expectMatchBaseline(toPNG(out, W, H), 'lut3d-identity17.png')
  })

  it('lut3d · 17³ 反色 LUT', () => {
    const N = 17
    const lut = new Uint8Array(N * N * N * 4)
    for (let z = 0; z < N; z++) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = (z * N * N + y * N + x) * 4
          lut[i] = Math.round((1 - x / (N - 1)) * 255)
          lut[i + 1] = Math.round((1 - y / (N - 1)) * 255)
          lut[i + 2] = Math.round((1 - z / (N - 1)) * 255)
          lut[i + 3] = 255
        }
      }
    }
    const out = applyLut3dCpu(src, W, H, lut, N, 1)
    expectMatchBaseline(toPNG(out, W, H), 'lut3d-invert17.png')
  })
})
