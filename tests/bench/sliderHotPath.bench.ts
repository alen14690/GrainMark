/**
 * sliderHotPath benchmark —— P0 优化前基线 + 后续回归基线
 *
 * 目标：量化"拖曝光滑块一帧"在 React/store 层的总开销（不含 GPU draw）。
 *
 * 覆盖的路径（按 Editor 实际调用顺序）：
 *   1. editStore.setTone({ exposure: v })        —— immer draft + deepClone 语义
 *   2. hasDirtyEdits(current, baseline)          —— 脏检测（Editor / 顶栏每帧读）
 *   3. JSON.stringify(pipeline)                   —— pipelineKey useMemo 的代价
 *   4. pipelineToSteps(pipeline, buildCtx)        —— renderNow 每帧重建 step 数组
 *
 * 红线（来自性能审判报告 §4 P0）：
 *   - 单次 setTone < 0.05ms（immer overhead）
 *   - hasDirtyEdits < 0.1ms（当前 JSON.stringify × 2 估 ~20-100μs，是 P0-7 要砍的）
 *   - pipelineKey stringify < 0.1ms
 *   - pipelineToSteps 全通道 < 0.1ms
 *
 * 滑块卡顿的累计预算：以上 4 步相加应远低于 React 预算（1 帧 16.6ms 内 React 应 < 5ms）。
 * 若实测超标，说明代码层瓶颈；反之则瓶颈在 WebGL / 合成器层（P0-1/P0-2/P0-3）。
 */
import { bench, describe } from 'vitest'
import type { FilterPipeline } from '../../shared/types'
import { pipelineToSteps } from '../../src/lib/useWebGLPreview'
import { hasDirtyEdits, useEditStore } from '../../src/stores/editStore'

const resolution: [number, number] = [1600, 1067]
const buildCtx = { resolution, lutTexture: null, lutSize: 0 }

/** 典型 Editor session 的 pipeline：用户已经叠了几项调整 */
const typicalPipeline: FilterPipeline = {
  tone: { exposure: 10, contrast: 15, highlights: -20, shadows: 30, whites: 0, blacks: 0 },
  whiteBalance: { temp: 15, tint: -10 },
  saturation: 20,
  vibrance: 30,
  clarity: 25,
  vignette: { amount: -30, midpoint: 50, feather: 50, roundness: 0 },
}

const baseline: FilterPipeline = {
  tone: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
}

describe('sliderHotPath · editStore.setTone', () => {
  // 先载入一次基准，模拟 Editor mount 后的状态
  useEditStore.setState({
    baselinePipeline: baseline,
    currentPipeline: typicalPipeline,
    baselineFilterId: 'bench',
    history: [],
    future: [],
  })
  const setTone = useEditStore.getState().setTone

  let v = 0
  bench('setTone({ exposure: v }) —— immer single-field patch', () => {
    v = (v + 0.1) % 5
    setTone({ exposure: v })
  })
})

describe('sliderHotPath · hasDirtyEdits', () => {
  // 与 baseline 不等（典型编辑态）
  bench('hasDirtyEdits(typical, baseline) —— 当前 JSON.stringify × 2', () => {
    hasDirtyEdits(typicalPipeline, baseline)
  })
  // 恒等（回到 baseline）—— 走 a===b 短路
  bench('hasDirtyEdits(baseline, baseline) —— 引用相等短路', () => {
    hasDirtyEdits(baseline, baseline)
  })
})

describe('sliderHotPath · pipelineKey JSON.stringify', () => {
  bench('JSON.stringify(typicalPipeline) —— useMemo 每帧跑', () => {
    JSON.stringify(typicalPipeline)
  })
})

describe('sliderHotPath · pipelineToSteps 典型编辑态', () => {
  bench('typicalPipeline → steps', () => {
    pipelineToSteps(typicalPipeline, buildCtx)
  })
})
