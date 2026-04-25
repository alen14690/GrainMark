/**
 * Pass 3b-1 新增 7 个 shader 的纯函数单测
 *
 * 覆盖：
 *   - 各 shader 源码包含必需 uniform / 不自带 #version·precision
 *   - normalize* 参数边界归一化（clamp、默认值）
 *   - is*Identity 对 "恒等 pipeline" 的快速识别（用于 fast-path skip pass）
 *   - pipelineToSteps 的执行顺序（WB → Tone → Curves → HSL → CG → Adj → Halation → Grain → Vignette）
 *   - GPU 未实现通道判定（Pass 3b-1 之后仅 LUT 返回 true）
 */
import { describe, expect, it } from 'vitest'
import {
  ADJUSTMENTS_FRAG,
  COLOR_GRADING_FRAG,
  CURVES_FRAG,
  GRAIN_FRAG,
  HALATION_FRAG,
  HSL_CHANNELS,
  HSL_FRAG,
  WHITE_BALANCE_FRAG,
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

// ========== Shader 源码契约 ==========
describe('Shader 源码契约（Pass 3b-1）', () => {
  const cases: Array<[string, string, string[]]> = [
    ['white balance', WHITE_BALANCE_FRAG, ['u_image', 'u_temp', 'u_tint']],
    ['hsl', HSL_FRAG, ['u_image', 'u_hsl']],
    [
      'color grading',
      COLOR_GRADING_FRAG,
      ['u_image', 'u_shadows', 'u_midtones', 'u_highlights', 'u_blending', 'u_balance'],
    ],
    ['curves', CURVES_FRAG, ['u_image', 'u_curve_rgb', 'u_curve_r', 'u_curve_g', 'u_curve_b']],
    ['grain', GRAIN_FRAG, ['u_image', 'u_amount', 'u_size', 'u_roughness', 'u_resolution']],
    ['halation', HALATION_FRAG, ['u_image', 'u_amount', 'u_threshold', 'u_radius', 'u_texelSize']],
    ['adjustments', ADJUSTMENTS_FRAG, ['u_image', 'u_clarity', 'u_saturation', 'u_vibrance', 'u_texelSize']],
  ]

  for (const [name, frag, uniforms] of cases) {
    it(`${name} 含所有必需 uniform`, () => {
      for (const u of uniforms) expect(frag).toContain(u)
    })
    it(`${name} 不自带 #version / precision`, () => {
      expect(frag).not.toContain('#version')
      expect(frag).not.toContain('precision ')
    })
    it(`${name} 使用 GLSL ES 3.00 in/out`, () => {
      expect(frag).toContain('in vec2 v_uv')
      expect(frag).toContain('out vec4 fragColor')
    })
  }
})

// ========== normalizeWhiteBalanceParams ==========
describe('normalizeWhiteBalanceParams', () => {
  it('默认 0', () => {
    const u = normalizeWhiteBalanceParams({})
    expect(u.u_temp).toBe(0)
    expect(u.u_tint).toBe(0)
  })
  it('±100 → ±1', () => {
    expect(normalizeWhiteBalanceParams({ temp: 100 }).u_temp).toBe(1)
    expect(normalizeWhiteBalanceParams({ tint: -100 }).u_tint).toBe(-1)
  })
  it('超出范围 clamp', () => {
    expect(normalizeWhiteBalanceParams({ temp: 500 }).u_temp).toBe(1)
    expect(normalizeWhiteBalanceParams({ temp: -500 }).u_temp).toBe(-1)
  })
})

// ========== normalizeHslParams / isHslIdentity ==========
describe('normalizeHslParams', () => {
  it('空对象 → 24 float 全 0', () => {
    const u = normalizeHslParams({})
    expect(u.u_hsl).toBeInstanceOf(Float32Array)
    expect(u.u_hsl.length).toBe(24)
    for (const v of u.u_hsl) expect(v).toBe(0)
  })
  it('red=(50, -100, 25) → arr[0..2] = (0.5, -1, 0.25)', () => {
    const u = normalizeHslParams({ red: { h: 50, s: -100, l: 25 } })
    expect(u.u_hsl[0]).toBeCloseTo(0.5)
    expect(u.u_hsl[1]).toBe(-1)
    expect(u.u_hsl[2]).toBeCloseTo(0.25)
    // 其他通道保持 0
    for (let i = 3; i < 24; i++) expect(u.u_hsl[i]).toBe(0)
  })
  it('HSL_CHANNELS 顺序稳定（red, orange, ..., magenta）', () => {
    expect(HSL_CHANNELS).toEqual(['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'])
  })
})

describe('isHslIdentity', () => {
  it('空对象 → true', () => expect(isHslIdentity({})).toBe(true))
  it('所有 h/s/l = 0 → true', () => {
    expect(isHslIdentity({ red: { h: 0, s: 0, l: 0 } })).toBe(true)
  })
  it('只要有一通道非零 → false', () => {
    expect(isHslIdentity({ red: { h: 10 } })).toBe(false)
  })
})

// ========== normalizeColorGradingParams / isColorGradingIdentity ==========
describe('normalizeColorGradingParams', () => {
  it('默认 blending=0.5, balance=0', () => {
    const u = normalizeColorGradingParams({})
    expect(u.u_blending).toBe(0.5)
    expect(u.u_balance).toBe(0)
    expect(u.u_shadows).toEqual([0, 0, 0])
    expect(u.u_highlights).toEqual([0, 0, 0])
  })
  it('hue clamp 0..360', () => {
    const u = normalizeColorGradingParams({ shadows: { h: 500, s: 50, l: -50 } })
    expect(u.u_shadows[0]).toBe(360)
    expect(u.u_shadows[1]).toBeCloseTo(0.5)
    expect(u.u_shadows[2]).toBeCloseTo(-0.5)
  })
})

describe('isColorGradingIdentity', () => {
  it('三 zone l 都是 0 → true', () => {
    expect(
      isColorGradingIdentity({
        shadows: { l: 0 },
        midtones: { l: 0 },
        highlights: { l: 0 },
      }),
    ).toBe(true)
  })
  it('任一 l 非零 → false', () => {
    expect(isColorGradingIdentity({ shadows: { l: 5 } })).toBe(false)
  })
})

// ========== curvePointsToLut / isCurvesIdentity ==========
describe('curvePointsToLut', () => {
  it('undefined / empty → 返回恒等 LUT', () => {
    const lut1 = curvePointsToLut(undefined)
    expect(lut1.length).toBe(256)
    expect(lut1[0]).toBe(0)
    expect(lut1[255]).toBeCloseTo(1, 3)
    expect(lut1[128]).toBeCloseTo(128 / 255, 3)

    expect(curvePointsToLut([])).toEqual(identityCurveLut())
  })
  it('识别恒等函数 y=x 应与 identity LUT 基本一致（允许插值误差）', () => {
    const ident = curvePointsToLut([
      { x: 0, y: 0 },
      { x: 128, y: 128 },
      { x: 255, y: 255 },
    ])
    for (let i = 0; i < 256; i++) {
      expect(ident[i]).toBeCloseTo(i / 255, 1) // Hermite + 切线=0 有 1 位精度误差容忍
    }
  })
  it('输出值都在 [0, 1]', () => {
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
  it('端点外推到 0/255', () => {
    const lut = curvePointsToLut([{ x: 50, y: 100 }])
    // 只有一个点时，前后外推为该点 y
    expect(lut[0]).toBeCloseTo(100 / 255, 2)
    expect(lut[255]).toBeCloseTo(100 / 255, 2)
  })
})

describe('isCurvesIdentity', () => {
  it('undefined 或 空数组 → true', () => {
    expect(isCurvesIdentity({})).toBe(true)
    expect(isCurvesIdentity({ rgb: [] })).toBe(true)
  })
  it('所有点 y ≈ x → true', () => {
    expect(
      isCurvesIdentity({
        rgb: [
          { x: 0, y: 0 },
          { x: 128, y: 128 },
          { x: 255, y: 255 },
        ],
      }),
    ).toBe(true)
  })
  it('有点 |x - y| > 0.5 → false', () => {
    expect(isCurvesIdentity({ rgb: [{ x: 0, y: 5 }] })).toBe(false)
  })
})

describe('normalizeCurvesParams', () => {
  it('总是返回 4 条 256-长度 LUT', () => {
    const u = normalizeCurvesParams({})
    expect(u.u_curve_rgb.length).toBe(256)
    expect(u.u_curve_r.length).toBe(256)
    expect(u.u_curve_g.length).toBe(256)
    expect(u.u_curve_b.length).toBe(256)
  })
})

// ========== normalizeGrainParams / isGrainIdentity ==========
describe('normalizeGrainParams', () => {
  it('默认', () => {
    const u = normalizeGrainParams({}, [1920, 1080])
    expect(u.u_amount).toBe(0)
    expect(u.u_size).toBe(1)
    expect(u.u_roughness).toBe(0.5)
    expect(u.u_resolution).toEqual([1920, 1080])
  })
  it('size clamp 到 [0.5, 4]', () => {
    expect(normalizeGrainParams({ size: 10 }, [1, 1]).u_size).toBe(4)
    expect(normalizeGrainParams({ size: 0.1 }, [1, 1]).u_size).toBe(0.5)
  })
})

describe('isGrainIdentity', () => {
  it('amount=0 或缺省 → true', () => {
    expect(isGrainIdentity({})).toBe(true)
    expect(isGrainIdentity({ amount: 0 })).toBe(true)
  })
  it('amount>0 → false', () => expect(isGrainIdentity({ amount: 1 })).toBe(false))
})

// ========== normalizeHalationParams / isHalationIdentity ==========
describe('normalizeHalationParams', () => {
  it('texelSize = 1/resolution', () => {
    const u = normalizeHalationParams({}, [1000, 500])
    expect(u.u_texelSize[0]).toBeCloseTo(1 / 1000)
    expect(u.u_texelSize[1]).toBeCloseTo(1 / 500)
  })
  it('threshold 0..255 → 0..1', () => {
    expect(normalizeHalationParams({ threshold: 255 }, [1, 1]).u_threshold).toBe(1)
    expect(normalizeHalationParams({ threshold: 0 }, [1, 1]).u_threshold).toBe(0)
  })
  it('radius clamp 1..30', () => {
    expect(normalizeHalationParams({ radius: 99 }, [1, 1]).u_radius).toBe(30)
    expect(normalizeHalationParams({ radius: 0.5 }, [1, 1]).u_radius).toBe(1)
  })
  it('resolution=0 不会除零（texelSize 不是 Infinity/NaN）', () => {
    const u = normalizeHalationParams({}, [0, 0])
    expect(Number.isFinite(u.u_texelSize[0])).toBe(true)
    expect(Number.isFinite(u.u_texelSize[1])).toBe(true)
  })
})

// ========== normalizeAdjustmentsParams / isAdjustmentsIdentity ==========
describe('normalizeAdjustmentsParams', () => {
  it('默认 0', () => {
    const u = normalizeAdjustmentsParams({}, [100, 100])
    expect(u.u_clarity).toBe(0)
    expect(u.u_saturation).toBe(0)
    expect(u.u_vibrance).toBe(0)
  })
  it('±100 → ±1', () => {
    expect(normalizeAdjustmentsParams({ clarity: 100 }, [1, 1]).u_clarity).toBe(1)
    expect(normalizeAdjustmentsParams({ saturation: -100 }, [1, 1]).u_saturation).toBe(-1)
  })
})

describe('isAdjustmentsIdentity', () => {
  it('都是 0 或缺省 → true', () => {
    expect(isAdjustmentsIdentity({})).toBe(true)
  })
  it('任一非零 → false', () => {
    expect(isAdjustmentsIdentity({ vibrance: 5 })).toBe(false)
  })
})

// ========== pipelineToSteps 顺序 ==========
describe('pipelineToSteps · 顺序契约', () => {
  const resolution: [number, number] = [1920, 1080]

  it('null pipeline → []', () => {
    expect(pipelineToSteps(null, resolution)).toEqual([])
  })

  it('完整 pipeline → 9 步按 Lightroom 顺序', () => {
    const steps = pipelineToSteps(
      {
        whiteBalance: { temp: 10, tint: 5 },
        tone: { exposure: 0.5, contrast: 10, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
        curves: { rgb: [{ x: 0, y: 10 }] }, // 非恒等
        hsl: { red: { h: 10, s: 0, l: 0 } },
        colorGrading: { shadows: { h: 0, s: 0, l: 10 }, midtones: {}, highlights: {} },
        clarity: 15,
        halation: { amount: 20, threshold: 200, radius: 10 },
        grain: { amount: 5, size: 1, roughness: 0.5 },
        vignette: { amount: -30, midpoint: 50, roundness: 0, feather: 50 },
      },
      resolution,
    )
    const ids = steps.map((s) => s.id)
    expect(ids).toEqual([
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

  it('恒等 HSL / curves / colorGrading / grain / halation → 跳过该 step（避免浪费 GPU）', () => {
    const steps = pipelineToSteps(
      {
        tone: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
        hsl: { red: { h: 0, s: 0, l: 0 } },
        curves: { rgb: [] },
        colorGrading: { shadows: { l: 0 }, midtones: { l: 0 }, highlights: { l: 0 } },
        grain: { amount: 0 },
        halation: { amount: 0 },
      },
      resolution,
    )
    expect(steps.map((s) => s.id)).toEqual(['tone']) // tone 不检测恒等，总是产生
  })

  it('whiteBalance 全零 → 不产生 step', () => {
    expect(
      pipelineToSteps(
        {
          whiteBalance: { temp: 0, tint: 0 },
        },
        resolution,
      ),
    ).toEqual([])
  })

  it('只含 adjustments 的 pipeline（clarity 非零）→ 1 个 step', () => {
    const steps = pipelineToSteps({ clarity: 20 }, resolution)
    expect(steps).toHaveLength(1)
    expect(steps[0]!.id).toBe('adjustments')
  })

  it('只含 LUT → []（GPU 不实现，交 CPU 兜底）', () => {
    const steps = pipelineToSteps({ lut: 'some.cube', lutIntensity: 80 }, resolution)
    expect(steps).toEqual([])
  })
})
