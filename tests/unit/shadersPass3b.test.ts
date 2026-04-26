/**
 * Pass 3b 新增 7 个 shader 的纯函数测试
 *
 * 范围：
 *   - normalize* 参数边界归一化（clamp、默认值、除零保护）
 *   - is*Identity 对"恒等 pipeline"的识别（fast-path skip pass 的契约）
 *   - pipelineToSteps 的 Lightroom 执行顺序 + LUT3D 路径
 *
 * 不测：
 *   - Shader 源码字面值（例如 `frag.toContain('u_image')`） —— 若 shader 少 uniform，
 *     运行时 WebGL 编译会报错，`webglEngine.test.ts` 和 `perceptibility.test.ts` 会立即抓到，
 *     字面值断言是"早产哨兵"，价值密度低；
 *   - Shader 源码不含 `#version` / `precision` —— 这是引擎拼接契约，由 `webglEngine.ts` 自身保证。
 */
import { describe, expect, it } from 'vitest'
import {
  HSL_CHANNELS,
  curvePointsToLut,
  identityCurveLut,
  isAdjustmentsIdentity,
  isColorGradingIdentity,
  isCurvesIdentity,
  isGrainIdentity,
  isHslIdentity,
  normalizeAdjustmentsParams,
  normalizeColorGradingParams,
  normalizeCurvesParams,
  normalizeGrainParams,
  normalizeHalationParams,
  normalizeHslParams,
  normalizeWhiteBalanceParams,
} from '../../src/engine/webgl'
import { pipelineToSteps } from '../../src/lib/useWebGLPreview'

// ========== normalize* 参数边界 ==========

describe('normalizeWhiteBalanceParams', () => {
  it('默认 0 / ±100 → ±1 / 越界 clamp', () => {
    expect(normalizeWhiteBalanceParams({}).u_temp).toBe(0)
    expect(normalizeWhiteBalanceParams({ temp: 100 }).u_temp).toBe(1)
    expect(normalizeWhiteBalanceParams({ temp: -100 }).u_tint).toBe(0)
    expect(normalizeWhiteBalanceParams({ temp: 500 }).u_temp).toBe(1)
    expect(normalizeWhiteBalanceParams({ temp: -500 }).u_temp).toBe(-1)
  })
})

describe('normalizeHslParams', () => {
  it('空对象 → 24 float 全 0', () => {
    const u = normalizeHslParams({})
    expect(u.u_hsl).toBeInstanceOf(Float32Array)
    expect(u.u_hsl.length).toBe(24)
    for (const v of u.u_hsl) expect(v).toBe(0)
  })

  it('red=(50, -100, 25) → arr[0..2] = (0.5, -1, 0.25)，其它槽保持 0', () => {
    const u = normalizeHslParams({ red: { h: 50, s: -100, l: 25 } })
    expect(u.u_hsl[0]).toBeCloseTo(0.5)
    expect(u.u_hsl[1]).toBe(-1)
    expect(u.u_hsl[2]).toBeCloseTo(0.25)
    for (let i = 3; i < 24; i++) expect(u.u_hsl[i]).toBe(0)
  })

  it('HSL_CHANNELS 顺序稳定（red, orange, ..., magenta）— shader 硬依赖此顺序', () => {
    expect(HSL_CHANNELS).toEqual(['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'])
  })
})

describe('normalizeColorGradingParams', () => {
  it('默认 blending=0.5 balance=0，三 zone 全 0', () => {
    const u = normalizeColorGradingParams({})
    expect(u.u_blending).toBe(0.5)
    expect(u.u_balance).toBe(0)
    expect(u.u_shadows).toEqual([0, 0, 0])
    expect(u.u_highlights).toEqual([0, 0, 0])
  })

  it('hue clamp 到 0..360、s/l clamp 到 [-1, 1]', () => {
    const u = normalizeColorGradingParams({ shadows: { h: 500, s: 50, l: -50 } })
    expect(u.u_shadows[0]).toBe(360)
    expect(u.u_shadows[1]).toBeCloseTo(0.5)
    expect(u.u_shadows[2]).toBeCloseTo(-0.5)
  })
})

describe('curvePointsToLut · 边界', () => {
  it('undefined / empty → 返回恒等 LUT（256 长度）', () => {
    const lut1 = curvePointsToLut(undefined)
    expect(lut1.length).toBe(256)
    expect(lut1[0]).toBe(0)
    expect(lut1[255]).toBeCloseTo(1, 3)
    expect(lut1[128]).toBeCloseTo(128 / 255, 3)
    expect(curvePointsToLut([])).toEqual(identityCurveLut())
  })

  it('y = x 三点 → 输出基本等同恒等 LUT（Hermite 插值容忍 1 位精度）', () => {
    const ident = curvePointsToLut([
      { x: 0, y: 0 },
      { x: 128, y: 128 },
      { x: 255, y: 255 },
    ])
    for (let i = 0; i < 256; i++) expect(ident[i]).toBeCloseTo(i / 255, 1)
  })

  it('S 曲线输出都在 [0, 1]（防上下溢）', () => {
    const lut = curvePointsToLut([
      { x: 0, y: 0 },
      { x: 128, y: 255 },
      { x: 255, y: 128 },
    ])
    for (const v of lut) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('单点输入 → 端点外推为该点 y', () => {
    const lut = curvePointsToLut([{ x: 50, y: 100 }])
    expect(lut[0]).toBeCloseTo(100 / 255, 2)
    expect(lut[255]).toBeCloseTo(100 / 255, 2)
  })
})

describe('normalizeCurvesParams', () => {
  it('总是返回 4 条 256-长度 LUT（RGB + R + G + B）', () => {
    const u = normalizeCurvesParams({})
    expect(u.u_curve_rgb.length).toBe(256)
    expect(u.u_curve_r.length).toBe(256)
    expect(u.u_curve_g.length).toBe(256)
    expect(u.u_curve_b.length).toBe(256)
  })
})

describe('normalizeGrainParams · 边界', () => {
  it('默认值与 size clamp 到 [0.5, 4]', () => {
    const u = normalizeGrainParams({}, [1920, 1080])
    expect(u.u_amount).toBe(0)
    expect(u.u_size).toBe(1)
    expect(u.u_roughness).toBe(0.5)
    expect(u.u_resolution).toEqual([1920, 1080])
    expect(normalizeGrainParams({ size: 10 }, [1, 1]).u_size).toBe(4)
    expect(normalizeGrainParams({ size: 0.1 }, [1, 1]).u_size).toBe(0.5)
  })
})

describe('normalizeHalationParams · 边界', () => {
  it('texelSize = 1/resolution，threshold 和 radius 归一化', () => {
    const u = normalizeHalationParams({}, [1000, 500])
    expect(u.u_texelSize[0]).toBeCloseTo(1 / 1000)
    expect(u.u_texelSize[1]).toBeCloseTo(1 / 500)
    expect(normalizeHalationParams({ threshold: 255 }, [1, 1]).u_threshold).toBe(1)
    expect(normalizeHalationParams({ radius: 99 }, [1, 1]).u_radius).toBe(30)
    expect(normalizeHalationParams({ radius: 0.5 }, [1, 1]).u_radius).toBe(1)
  })

  it('resolution=0 时 texelSize 不是 Infinity/NaN（防除零）', () => {
    const u = normalizeHalationParams({}, [0, 0])
    expect(Number.isFinite(u.u_texelSize[0])).toBe(true)
    expect(Number.isFinite(u.u_texelSize[1])).toBe(true)
  })
})

describe('normalizeAdjustmentsParams · 边界', () => {
  it('默认 0，±100 → ±1', () => {
    const u = normalizeAdjustmentsParams({}, [100, 100])
    expect(u.u_clarity).toBe(0)
    expect(u.u_saturation).toBe(0)
    expect(u.u_vibrance).toBe(0)
    expect(normalizeAdjustmentsParams({ clarity: 100 }, [1, 1]).u_clarity).toBe(1)
    expect(normalizeAdjustmentsParams({ saturation: -100 }, [1, 1]).u_saturation).toBe(-1)
  })
})

// ========== is*Identity 契约（fast-path 跳过整个 pass） ==========

describe('is*Identity · fast-path 契约', () => {
  it('isHslIdentity：全零 true / 任一非零 false', () => {
    expect(isHslIdentity({})).toBe(true)
    expect(isHslIdentity({ red: { h: 0, s: 0, l: 0 } })).toBe(true)
    expect(isHslIdentity({ red: { h: 10 } })).toBe(false)
  })

  it('isColorGradingIdentity：三 zone l=0 → true（shader 中 sOff = hueToRgb(h, s) * l）', () => {
    // 设计契约：l=0 时 shader 输出恒等于输入，即便 h/s 非零也应视为 identity 以免白占一个 pass。
    // 若未来改了 shader 使 l=0 时 h/s 仍有效果，这条测试必须同步调整。
    expect(
      isColorGradingIdentity({
        shadows: { l: 0 },
        midtones: { l: 0 },
        highlights: { l: 0 },
      }),
    ).toBe(true)
    expect(isColorGradingIdentity({ shadows: { l: 5 } })).toBe(false)
  })

  it('isCurvesIdentity：空数组或 y≈x 全恒等 → true，任一点 |x-y|>0.5 → false', () => {
    expect(isCurvesIdentity({})).toBe(true)
    expect(isCurvesIdentity({ rgb: [] })).toBe(true)
    expect(
      isCurvesIdentity({
        rgb: [
          { x: 0, y: 0 },
          { x: 128, y: 128 },
          { x: 255, y: 255 },
        ],
      }),
    ).toBe(true)
    expect(isCurvesIdentity({ rgb: [{ x: 0, y: 5 }] })).toBe(false)
  })

  it('isGrainIdentity：amount 缺省或 0 → true，正数 → false', () => {
    expect(isGrainIdentity({})).toBe(true)
    expect(isGrainIdentity({ amount: 0 })).toBe(true)
    expect(isGrainIdentity({ amount: 1 })).toBe(false)
  })

  it('isAdjustmentsIdentity：全 0 true / 任一非零 false', () => {
    expect(isAdjustmentsIdentity({})).toBe(true)
    expect(isAdjustmentsIdentity({ vibrance: 5 })).toBe(false)
  })
})

// ========== pipelineToSteps 顺序契约（Lightroom 管线核心） ==========

describe('pipelineToSteps · Lightroom 顺序契约', () => {
  const resolution: [number, number] = [1920, 1080]
  const build = { resolution, lutTexture: null, lutSize: 0 } as const

  it('null pipeline → []', () => {
    expect(pipelineToSteps(null, build)).toEqual([])
  })

  it('完整 pipeline（无 LUT）→ 9 步按固定顺序：wb→tone→curves→hsl→colorGrading→adjustments→halation→grain→vignette', () => {
    const steps = pipelineToSteps(
      {
        whiteBalance: { temp: 10, tint: 5 },
        tone: { exposure: 0.5, contrast: 10, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
        curves: { rgb: [{ x: 0, y: 10 }] },
        hsl: { red: { h: 10, s: 0, l: 0 } },
        colorGrading: { shadows: { h: 0, s: 0, l: 10 }, midtones: {}, highlights: {} },
        clarity: 15,
        halation: { amount: 20, threshold: 200, radius: 10 },
        grain: { amount: 5, size: 1, roughness: 0.5 },
        vignette: { amount: -30, midpoint: 50, roundness: 0, feather: 50 },
      },
      build,
    )
    expect(steps.map((s) => s.id)).toEqual([
      'wb',
      'tone',
      'curves',
      'hsl',
      'colorGrading',
      'adjustments',
      'halation',
      'grain',
      'vignette',
    ])
  })

  it('恒等 HSL / curves / colorGrading / grain / halation 被跳过（不浪费一个 GPU pass）', () => {
    const steps = pipelineToSteps(
      {
        tone: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
        hsl: { red: { h: 0, s: 0, l: 0 } },
        curves: { rgb: [] },
        colorGrading: { shadows: { l: 0 }, midtones: { l: 0 }, highlights: { l: 0 } },
        grain: { amount: 0 },
        halation: { amount: 0 },
      },
      build,
    )
    expect(steps.map((s) => s.id)).toEqual(['tone']) // tone 不检测恒等，总是产生
  })

  it('whiteBalance 全零不产生 step', () => {
    expect(pipelineToSteps({ whiteBalance: { temp: 0, tint: 0 } }, build)).toEqual([])
  })

  it('仅 clarity 非零 → 只产生 1 个 adjustments step', () => {
    const steps = pipelineToSteps({ clarity: 20 }, build)
    expect(steps).toHaveLength(1)
    expect(steps[0]!.id).toBe('adjustments')
  })
})

// ========== LUT3D 集成（Pass 3b-2 契约） ==========

describe('pipelineToSteps · LUT3D 集成', () => {
  const resolution: [number, number] = [1920, 1080]
  const fakeLutTexture = { target: '3D', width: 33, height: 33, depth: 33 } as never

  it('含 LUT + lutTexture ready → 产生 lut step（位于 Lightroom 顺序第 7 位），u_intensity 正确归一化', () => {
    const steps = pipelineToSteps(
      {
        tone: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
        lut: 'fuji-chrome.cube',
        lutIntensity: 80,
        vignette: { amount: -10, midpoint: 50, roundness: 0, feather: 50 },
      },
      { resolution, lutTexture: fakeLutTexture, lutSize: 33 },
    )
    expect(steps.map((s) => s.id)).toEqual(['tone', 'lut', 'vignette'])
    const lutStep = steps[1]!
    expect(lutStep.extraInputs).toHaveLength(1)
    expect(lutStep.extraInputs![0]!.name).toBe('u_lut')
    expect((lutStep.uniforms as Record<string, number>).u_intensity).toBeCloseTo(0.8)
    expect((lutStep.uniforms as Record<string, number>).u_lutSize).toBe(33)
  })

  it('LUT 未加载完（lutTexture=null / lutSize<2 / 缺 pipe.lut）→ 跳过 LUT step', () => {
    const b = { resolution, lutTexture: null, lutSize: 0 }
    const b2 = { resolution, lutTexture: fakeLutTexture, lutSize: 1 }
    const b3 = { resolution, lutTexture: fakeLutTexture, lutSize: 33 }
    expect(
      pipelineToSteps(
        {
          tone: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
          lut: 'x.cube',
        },
        b,
      ).map((s) => s.id),
    ).toEqual(['tone'])
    expect(pipelineToSteps({ lut: 'bad.cube' }, b2)).toEqual([])
    expect(
      pipelineToSteps(
        { tone: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 } },
        b3,
      ).map((s) => s.id),
    ).toEqual(['tone']) // 没 pipe.lut 不产生 LUT step
  })

  it('默认 intensity=100 → u_intensity=1.0', () => {
    const steps = pipelineToSteps({ lut: 'x.cube' }, { resolution, lutTexture: fakeLutTexture, lutSize: 17 })
    expect(steps).toHaveLength(1)
    expect((steps[0]!.uniforms as Record<string, number>).u_intensity).toBe(1)
  })
})
