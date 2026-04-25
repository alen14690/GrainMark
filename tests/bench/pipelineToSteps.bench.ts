/**
 * pipelineToSteps benchmark
 *
 * 覆盖：
 *   - null pipeline（passthrough 起点）
 *   - 单通道（tone only）
 *   - 稀疏 pipeline（一部分 identity）
 *   - 全 10 通道开
 *
 * pipelineToSteps 在滑块高频拖动时会被反复调用（每次 renderNow）→
 * 必须足够快，不能成为主线程 jank 源。
 *
 * 期望：单次调用 < 0.05ms（远低于 16.67ms 的 60fps 预算）
 */
import { bench, describe } from 'vitest'
import type { FilterPipeline, HSLParams } from '../../shared/types'
import { pipelineToSteps } from '../../src/lib/useWebGLPreview'

const resolution: [number, number] = [1600, 1067]
const buildCtx = { resolution, lutTexture: null, lutSize: 0 }

const toneOnly: FilterPipeline = {
  tone: { exposure: 20, contrast: 15, highlights: 0, shadows: 0 },
}

function makeHsl(overrides: Partial<Record<string, { h: number; s: number; l: number }>> = {}): HSLParams {
  const zero = { h: 0, s: 0, l: 0 }
  const base: HSLParams = {
    red: zero,
    orange: zero,
    yellow: zero,
    green: zero,
    aqua: zero,
    blue: zero,
    purple: zero,
    magenta: zero,
  }
  return { ...base, ...overrides }
}

// 稀疏 pipeline：tone + vignette + hsl，其他通道 identity
const sparsePipeline: FilterPipeline = {
  tone: { exposure: 10, contrast: 0, highlights: 0, shadows: 0 },
  vignette: { amount: -30, midpoint: 50, feather: 50, roundness: 0 },
  hsl: makeHsl({ red: { h: 0, s: -20, l: 0 } }),
}

// 全 10 通道开
const fullPipeline: FilterPipeline = {
  tone: { exposure: 10, contrast: 15, highlights: -20, shadows: 30 },
  whiteBalance: { temp: 15, tint: -10 },
  saturation: 20,
  vibrance: 30,
  clarity: 25,
  vignette: { amount: -30, midpoint: 50, feather: 50, roundness: 0 },
  curves: {
    rgb: [
      { x: 0, y: 0 },
      { x: 128, y: 140 },
      { x: 255, y: 255 },
    ],
  },
  hsl: makeHsl({
    red: { h: 5, s: -20, l: 0 },
    yellow: { h: 0, s: 10, l: 5 },
    blue: { h: -5, s: 10, l: 0 },
  }),
  colorGrading: {
    shadows: { h: 200, s: 20, l: 0 },
    midtones: { h: 0, s: 0, l: 0 },
    highlights: { h: 40, s: 15, l: 0 },
    blending: 50,
    balance: 0,
  },
  grain: { amount: 20, size: 2, roughness: 50 },
  halation: { amount: 30, threshold: 200, radius: 5 },
}

describe('pipelineToSteps', () => {
  bench('null pipeline → 空 steps', () => {
    pipelineToSteps(null, buildCtx)
  })
  bench('tone 单通道', () => {
    pipelineToSteps(toneOnly, buildCtx)
  })
  bench('稀疏 pipeline（3 个非 identity）', () => {
    pipelineToSteps(sparsePipeline, buildCtx)
  })
  bench('全 10 通道（LUT 除外）', () => {
    pipelineToSteps(fullPipeline, buildCtx)
  })
})
