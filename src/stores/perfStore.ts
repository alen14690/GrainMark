/**
 * perfStore — GPU 帧耗时 + histogram 的外部 store（P0-1 修复的修复）
 *
 * 背景：P0-1 加了 FramePerf 返回给 useWebGLPreview，但通过 useState 每帧
 * 触发 Editor 整棵树 re-render —— 性能工具自己成了性能问题。
 *
 * 本 store 用 zustand 实现 subscribe-only 模式：写入全局但**只有显式订阅
 * 的组件才会重渲**。Editor 主体不订阅 → 拖滑块时 Editor 零 re-render。
 * Dev 诊断面板 + Histogram 是独立 memo 组件订阅本 store，自己重绘。
 */
import { create } from 'zustand'
import type { HistogramBins } from '../lib/histogram'

export interface FramePerf {
  setStepsMs: number
  pipelineRunMs: number
  readPixelsMs: number
  histogramMs: number
  totalMs: number
}

interface PerfState {
  perf: FramePerf | null
  histogram: HistogramBins | null
}

/**
 * 性能诊断 store。**不要在非 dev 诊断 / 非 Histogram 组件里订阅**，否则恢复 P0-1 回归。
 */
export const usePerfStore = create<PerfState>(() => ({
  perf: null,
  histogram: null,
}))

/**
 * 直接写入（无 hook 开销，useWebGLPreview.renderNow 每帧调用）
 */
export function writePerf(p: FramePerf): void {
  usePerfStore.setState({ perf: p })
}

export function writeHistogram(h: HistogramBins | null): void {
  usePerfStore.setState({ histogram: h })
}

// E2E 测试钩子
if (typeof window !== 'undefined') {
  ;(window as unknown as { __grainPerfStore?: unknown }).__grainPerfStore = usePerfStore
}
