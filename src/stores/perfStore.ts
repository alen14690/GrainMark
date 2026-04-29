/**
 * perfStore — GPU 帧耗时 + histogram 的外部 store（P0-1 修复的修复）
 *
 * 背景：P0-1 加了 FramePerf 返回给 useWebGLPreview，但通过 useState 每帧
 * 触发 Editor 整棵树 re-render —— 性能工具自己成了性能问题。
 *
 * 本 store 用 zustand 实现 subscribe-only 模式：写入全局但**只有显式订阅
 * 的组件才会重渲**。Editor 主体不订阅 → 拖滑块时 Editor 零 re-render。
 * Dev 诊断面板 + Histogram 是独立 memo 组件订阅本 store，自己重绘。
 *
 * **2026-04-26 新增磁盘沉淀**：所有 perf 事件异步上报到主进程
 *   userData/logs/perf.ndjson；上报走 requestIdleCallback / microtask 队列，
 *   不阻塞热路径。这是给 AI Agent 用来事后分析性能瓶颈用的——
 *   不是给用户看的 UI，但同样是产品的一部分（可观测性即工程）。
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

// ============================================================================
// IPC 上报层（主进程磁盘沉淀）
// ============================================================================

type PerfEvent = {
  kind: 'frame' | 'user' | 'marker'
  name: string
  durationMs?: number
  tsMs: number
  data?: Record<string, string | number | boolean | null>
}

/** 节流队列 + flush 节奏（避免每帧 IPC 开销）*/
const eventQueue: PerfEvent[] = []
let flushScheduled = false

function scheduleFlush() {
  if (flushScheduled) return
  flushScheduled = true
  // 优先 requestIdleCallback；老 Electron 兜底到 setTimeout
  const schedule =
    typeof (globalThis as unknown as { requestIdleCallback?: unknown }).requestIdleCallback === 'function'
      ? (
          globalThis as unknown as {
            requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number
          }
        ).requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 200) as unknown as number

  schedule(
    () => {
      flushScheduled = false
      if (eventQueue.length === 0) return
      const batch = eventQueue.splice(0, eventQueue.length)
      const invoke = (
        window as unknown as {
          grain?: { invoke?: (channel: string, ...args: unknown[]) => Promise<unknown> }
        }
      ).grain?.invoke
      if (!invoke) return
      for (const ev of batch) {
        // 上报失败静默（诊断数据丢了不算灾难）
        invoke('perf:log', ev).catch(() => {
          /* noop */
        })
      }
    },
    { timeout: 500 },
  )
}

/** 记录一个性能事件到本地磁盘（通过 IPC 上报到 main） */
export function reportPerfEvent(ev: Omit<PerfEvent, 'tsMs'> & { tsMs?: number }): void {
  eventQueue.push({ ...ev, tsMs: ev.tsMs ?? performance.now() })
  scheduleFlush()
}

/**
 * 直接写入 store（无 hook 开销，useWebGLPreview.renderNow 每帧调用）。
 *
 * 同时上报一个 frame 事件到磁盘，便于事后分析"哪一帧卡了"。
 */
export function writePerf(p: FramePerf): void {
  usePerfStore.setState({ perf: p })
  // 异步上报到磁盘（requestIdleCallback 批处理，不阻塞 renderNow）
  reportPerfEvent({
    kind: 'frame',
    name: 'renderNow',
    durationMs: p.totalMs,
    data: {
      setStepsMs: round2(p.setStepsMs),
      pipelineRunMs: round2(p.pipelineRunMs),
      readPixelsMs: round2(p.readPixelsMs),
      histogramMs: round2(p.histogramMs),
    },
  })
}

export function writeHistogram(h: HistogramBins | null): void {
  usePerfStore.setState({ histogram: h })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// E2E 测试钩子：仅在 development / test 模式下注入，生产环境不暴露
if (typeof window !== 'undefined' && (import.meta.env.DEV || import.meta.env.MODE === 'test')) {
  ;(window as unknown as { __grainPerfStore?: unknown }).__grainPerfStore = usePerfStore
}
