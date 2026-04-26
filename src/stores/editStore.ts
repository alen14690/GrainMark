/**
 * editStore — 当前编辑态 + 历史栈
 *
 * 职责：
 *   - 承载 Editor 正在修改的 pipeline（以某个 preset 为起点，用户手动叠加调整）
 *   - currentPhotoId 切换 / activeFilterId 切换时重置为"滤镜预设 pipeline"
 *   - 维护撤销/重做历史栈（最多 50 步，commit 模式：交互结束时才入栈）
 *
 * 设计要点：
 *   - patch 粒度到单通道（setTone / setWhiteBalance / setVignette / setClarity 等）
 *   - 合并策略：per-channel shallow merge；传 null 表示"移除该通道"
 *   - hasDirtyEdits：当前 pipeline 与 baselinePreset 是否有差异（用于 UI 提示"有未保存修改"）
 *
 * 历史栈（M4.2 引入）：
 *   - 每个 set* action 只改 currentPipeline，不立即入栈
 *   - 交互结束时（Slider onChangeEnd / 键盘 / 双击复位）调 commitHistory() 入栈
 *   - commit 幂等去重：若新值与栈顶值深相等，不重复推入
 *   - 新 commit 清空 future（经典 undo/redo）
 *   - loadFromPreset / clear 会清空历史
 *   - 栈容量 50；超出从栈底切（保留最新 50 步）
 */
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  ColorGradingParams,
  CurvesParams,
  FilterPipeline,
  FilterPreset,
  GrainParams,
  HSLParams,
  HalationParams,
  ToneParams,
  VignetteParams,
  WhiteBalanceParams,
} from '../../shared/types'

/** 历史栈条目 */
export interface HistoryEntry {
  /** pipeline 的深拷贝快照（独立对象，不会被后续修改污染） */
  pipeline: FilterPipeline | null
  /** commit 时间戳（ms） */
  timestamp: number
  /** 可选：用于 UI 显示（如 "曝光调整"） */
  label?: string
}

/** 历史栈上限（AGENTS: 50 步，约等于 Lightroom 默认） */
export const HISTORY_LIMIT = 50

interface EditState {
  /** 当前编辑 pipeline；null 表示"显示原图" */
  currentPipeline: FilterPipeline | null
  /** 当前基准（从 FilterPreset 拷贝来，用于脏检测与 reset） */
  baselinePipeline: FilterPipeline | null
  /** 基准 preset id；切换时同步更新 */
  baselineFilterId: string | null

  /** 过去的栈（最旧在前，最新在后；不含当前 pipeline） */
  history: HistoryEntry[]
  /** 重做栈（撤销时被推入） */
  future: HistoryEntry[]

  // ---- actions ----
  /** 初始化：从 preset 加载基准；传 null 表示"原图"。同时清空历史 */
  loadFromPreset: (preset: FilterPreset | null) => void
  /** 重置：currentPipeline = baselinePipeline 的深拷贝（不自动入栈，由调用方决定） */
  resetToBaseline: () => void
  /** 清空编辑态（卸载 Editor 时调用） */
  clear: () => void

  // per-channel patch（只改 current，不入栈）
  setTone: (patch: Partial<ToneParams> | null) => void
  setWhiteBalance: (patch: Partial<WhiteBalanceParams> | null) => void
  setVignette: (patch: Partial<VignetteParams> | null) => void
  setHsl: (patch: HSLParams | null) => void
  setColorGrading: (patch: Partial<ColorGradingParams> | null) => void
  setCurves: (patch: CurvesParams | null) => void
  setGrain: (patch: Partial<GrainParams> | null) => void
  setHalation: (patch: Partial<HalationParams> | null) => void
  setClarity: (v: number) => void
  setSaturation: (v: number) => void
  setVibrance: (v: number) => void
  setLut: (lut: string | null, intensity?: number) => void

  // ---- 历史栈 actions（M4.2）----
  /**
   * 把当前 pipeline 快照推入 history。
   *   - 幂等去重：若深相等于栈顶 → no-op
   *   - 清空 future（新改动后"重做"应失效）
   *   - 超过 HISTORY_LIMIT 则从栈底切
   *   - 调用时机：Slider onChangeEnd / 键盘操作 / 双击复位 / resetToBaseline 等
   *     "一次交互完成"的边界
   */
  commitHistory: (label?: string) => void
  /** 撤销：history 栈顶 → current，原 current 推入 future */
  undo: () => void
  /** 重做：future 栈顶 → current，原 current 推入 history */
  redo: () => void
}

function deepClonePipeline(p: FilterPipeline | null | undefined): FilterPipeline | null {
  if (!p) return null
  // 使用 JSON round-trip 而非 structuredClone —— immer 在 reducer 内部传入的是 draft Proxy，
  // structuredClone 对 Proxy 会报 DataCloneError。pipeline 是纯 JSON 结构（数字/字符串/数组/对象），
  // JSON 克隆安全且成本可忽略。
  return JSON.parse(JSON.stringify(p)) as FilterPipeline
}

/** 深相等（结构化 JSON 比较；pipeline 是纯数据） */
function pipelineEquals(a: FilterPipeline | null, b: FilterPipeline | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/** 判断是否与基准有差异（引用或值不同）——用于 UI 脏提示 */
export function hasDirtyEdits(current: FilterPipeline | null, baseline: FilterPipeline | null): boolean {
  if (current === baseline) return false
  // 快速 stringify 比对（pipeline 是纯 JSON 结构，不大）
  try {
    return JSON.stringify(current) !== JSON.stringify(baseline)
  } catch {
    return true
  }
}

/** 历史栈可撤销（无状态查询，使用时从 store state 传入） */
export function canUndo(history: readonly HistoryEntry[]): boolean {
  return history.length > 0
}

/** 历史栈可重做 */
export function canRedo(future: readonly HistoryEntry[]): boolean {
  return future.length > 0
}

/** 确保 currentPipeline 为对象（null → {}），返回可变引用 */
function ensurePipe(s: EditState): FilterPipeline {
  if (!s.currentPipeline) s.currentPipeline = {}
  return s.currentPipeline
}

export const useEditStore = create<EditState>()(
  immer((set) => ({
    currentPipeline: null,
    baselinePipeline: null,
    baselineFilterId: null,
    history: [],
    future: [],

    loadFromPreset(preset) {
      set((s) => {
        s.baselineFilterId = preset?.id ?? null
        s.baselinePipeline = preset ? deepClonePipeline(preset.pipeline) : null
        s.currentPipeline = preset ? deepClonePipeline(preset.pipeline) : null
        // 切滤镜时清空历史（不跨滤镜撤销）
        s.history = []
        s.future = []
      })
    },

    resetToBaseline() {
      set((s) => {
        s.currentPipeline = deepClonePipeline(s.baselinePipeline)
      })
    },

    clear() {
      set((s) => {
        s.currentPipeline = null
        s.baselinePipeline = null
        s.baselineFilterId = null
        s.history = []
        s.future = []
      })
    },

    setTone(patch) {
      set((s) => {
        if (patch === null) {
          if (s.currentPipeline?.tone) s.currentPipeline.tone = undefined
          return
        }
        const pipe = ensurePipe(s)
        pipe.tone = {
          exposure: pipe.tone?.exposure ?? 0,
          contrast: pipe.tone?.contrast ?? 0,
          highlights: pipe.tone?.highlights ?? 0,
          shadows: pipe.tone?.shadows ?? 0,
          whites: pipe.tone?.whites ?? 0,
          blacks: pipe.tone?.blacks ?? 0,
          ...patch,
        }
      })
    },

    setWhiteBalance(patch) {
      set((s) => {
        if (patch === null) {
          if (s.currentPipeline?.whiteBalance) s.currentPipeline.whiteBalance = undefined
          return
        }
        const pipe = ensurePipe(s)
        pipe.whiteBalance = {
          temp: pipe.whiteBalance?.temp ?? 0,
          tint: pipe.whiteBalance?.tint ?? 0,
          ...patch,
        }
      })
    },

    setVignette(patch) {
      set((s) => {
        if (patch === null) {
          if (s.currentPipeline?.vignette) s.currentPipeline.vignette = undefined
          return
        }
        const pipe = ensurePipe(s)
        pipe.vignette = {
          amount: pipe.vignette?.amount ?? 0,
          midpoint: pipe.vignette?.midpoint ?? 50,
          roundness: pipe.vignette?.roundness ?? 0,
          feather: pipe.vignette?.feather ?? 50,
          ...patch,
        }
      })
    },

    setHsl(patch) {
      set((s) => {
        const pipe = ensurePipe(s)
        if (patch === null) {
          pipe.hsl = undefined
        } else {
          pipe.hsl = patch
        }
      })
    },

    setColorGrading(patch) {
      set((s) => {
        if (patch === null) {
          if (s.currentPipeline?.colorGrading) s.currentPipeline.colorGrading = undefined
          return
        }
        const pipe = ensurePipe(s)
        pipe.colorGrading = {
          shadows: pipe.colorGrading?.shadows ?? { h: 0, s: 0, l: 0 },
          midtones: pipe.colorGrading?.midtones ?? { h: 0, s: 0, l: 0 },
          highlights: pipe.colorGrading?.highlights ?? { h: 0, s: 0, l: 0 },
          blending: pipe.colorGrading?.blending ?? 50,
          balance: pipe.colorGrading?.balance ?? 0,
          ...patch,
        }
      })
    },

    setCurves(patch) {
      set((s) => {
        const pipe = ensurePipe(s)
        if (patch === null) {
          pipe.curves = undefined
        } else {
          pipe.curves = patch
        }
      })
    },

    setGrain(patch) {
      set((s) => {
        if (patch === null) {
          if (s.currentPipeline?.grain) s.currentPipeline.grain = undefined
          return
        }
        const pipe = ensurePipe(s)
        pipe.grain = {
          amount: pipe.grain?.amount ?? 0,
          size: pipe.grain?.size ?? 1,
          roughness: pipe.grain?.roughness ?? 0.5,
          ...patch,
        }
      })
    },

    setHalation(patch) {
      set((s) => {
        if (patch === null) {
          if (s.currentPipeline?.halation) s.currentPipeline.halation = undefined
          return
        }
        const pipe = ensurePipe(s)
        pipe.halation = {
          amount: pipe.halation?.amount ?? 0,
          threshold: pipe.halation?.threshold ?? 220,
          radius: pipe.halation?.radius ?? 10,
          ...patch,
        }
      })
    },

    setClarity(v) {
      set((s) => {
        ensurePipe(s).clarity = v
      })
    },
    setSaturation(v) {
      set((s) => {
        ensurePipe(s).saturation = v
      })
    },
    setVibrance(v) {
      set((s) => {
        ensurePipe(s).vibrance = v
      })
    },
    setLut(lut, intensity) {
      set((s) => {
        const pipe = ensurePipe(s)
        if (lut === null) {
          pipe.lut = null
        } else {
          pipe.lut = lut
          if (intensity !== undefined) pipe.lutIntensity = intensity
        }
      })
    },

    // ---- 历史栈 ----

    commitHistory(label) {
      set((s) => {
        const snap = deepClonePipeline(s.currentPipeline)
        const top = s.history[s.history.length - 1]
        // 幂等：值未变不入栈
        if (top && pipelineEquals(top.pipeline, snap)) return
        s.history.push({
          pipeline: snap,
          timestamp: Date.now(),
          label,
        })
        // 超上限 → 从栈底切
        if (s.history.length > HISTORY_LIMIT) {
          s.history = s.history.slice(s.history.length - HISTORY_LIMIT)
        }
        // 新改动清空 redo
        s.future = []
      })
    },

    undo() {
      set((s) => {
        if (s.history.length === 0) return
        const top = s.history[s.history.length - 1]!
        // 场景 A：current 与栈顶已对齐（常规情况，刚 commit 完）
        //   → pop 栈顶入 future，current 回到新栈顶（没有时回到 null）
        // 场景 B：current 领先栈顶（用户 commit 后又 setTone 未 commit）
        //   → 不 pop，只把 current 回退到栈顶（丢弃未 commit 的变化）
        //     同时把 "current 的那份未 commit 变化" 推入 future 以便 redo 恢复
        if (pipelineEquals(s.currentPipeline, top.pipeline)) {
          // 场景 A
          const popped = s.history.pop()!
          s.future.push({
            pipeline: deepClonePipeline(popped.pipeline),
            timestamp: Date.now(),
            label: popped.label,
          })
          const newTop = s.history[s.history.length - 1]
          s.currentPipeline = newTop ? deepClonePipeline(newTop.pipeline) : null
        } else {
          // 场景 B：把未 commit 的变化推入 future，current 回到 top
          s.future.push({
            pipeline: deepClonePipeline(s.currentPipeline),
            timestamp: Date.now(),
          })
          s.currentPipeline = deepClonePipeline(top.pipeline)
        }
      })
    },

    redo() {
      set((s) => {
        if (s.future.length === 0) return
        const next = s.future.pop()!
        // redo：future 顶推入 history（恢复为最新 commit）+ current 设为它
        // 注意：这会让 "刚才推入 future 的未 commit 变化" 变成新的栈顶 commit。
        // 这是刻意的：一旦 redo，相当于用户明确接受那次变化作为 commit
        s.history.push({
          pipeline: deepClonePipeline(next.pipeline),
          timestamp: Date.now(),
          label: next.label,
        })
        s.currentPipeline = deepClonePipeline(next.pipeline)
        // 守住上限
        if (s.history.length > HISTORY_LIMIT) {
          s.history = s.history.slice(s.history.length - HISTORY_LIMIT)
        }
      })
    },
  })),
)
