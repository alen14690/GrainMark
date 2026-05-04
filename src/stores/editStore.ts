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
  CropParams,
  CurvesParams,
  FilterPipeline,
  FilterPreset,
  FrameStyleId,
  FrameStyleOverrides,
  GrainParams,
  HSLParams,
  HalationParams,
  ToneParams,
  TransformParams,
  VignetteParams,
  WatermarkStyle,
  WhiteBalanceParams,
} from '../../shared/types'

/** 边框工作流配置 */
export interface FrameConfig {
  styleId: FrameStyleId
  overrides: FrameStyleOverrides
}

/** 水印工作流配置 */
export type WatermarkConfig = WatermarkStyle

/** 历史栈条目 — 包含完整工作流快照 */
export interface HistoryEntry {
  /** pipeline 的深拷贝快照（独立对象，不会被后续修改污染） */
  pipeline: FilterPipeline | null
  /** 边框配置快照 */
  frameConfig: FrameConfig | null
  /** 水印配置快照 */
  watermarkConfig: WatermarkConfig | null
  /** commit 时间戳（ms） */
  timestamp: number
  /** 可选：用于 UI 显示（如 "曝光调整"） */
  label?: string
}

/** 历史栈上限（AGENTS: 50 步，约等于 Lightroom 默认） */
export const HISTORY_LIMIT = 50

/** 单张照片的完整编辑状态快照（多图切换时保存/恢复） */
export interface PhotoEditState {
  pipeline: FilterPipeline | null
  baselinePipeline: FilterPipeline | null
  baselineFilterId: string | null
  frameConfig: FrameConfig | null
  watermarkConfig: WatermarkConfig | null
  history: HistoryEntry[]
  future: HistoryEntry[]
  dirty: boolean
}

/** 参数同步选项 */
export interface SyncOptions {
  whiteBalance: boolean
  tone: boolean
  colorGrading: boolean
  saturation: boolean
  vibrance: boolean
  clarity: boolean
  hsl: boolean
  curves: boolean
  grain: boolean
  halation: boolean
  vignette: boolean
  crop: boolean
  frame: boolean
  watermark: boolean
}

interface EditState {
  /** 当前编辑 pipeline；null 表示"显示原图" */
  currentPipeline: FilterPipeline | null
  /** 当前基准（从 FilterPreset 拷贝来，用于脏检测与 reset） */
  baselinePipeline: FilterPipeline | null
  /** 基准 preset id；切换时同步更新 */
  baselineFilterId: string | null

  /** 边框配置（工作流一等公民，纳入历史栈） */
  frameConfig: FrameConfig | null
  /** 水印配置（工作流一等公民，纳入历史栈） */
  watermarkConfig: WatermarkConfig | null

  /**
   * P2 优化：脏标记。set* action 触发时标为 true，loadFromPreset / resetToBaseline 重置为 false。
   * Editor 的 hasDirtyEdits() 读此值做 O(1) 快速判断，避免每帧 JSON.stringify 深比较。
   * commitHistory / undo / redo 不改此标记——脏标记描述的是"与 baseline 是否有差异"。
   */
  _dirty: boolean

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
  setCrop: (patch: CropParams | null) => void
  setTransform: (patch: TransformParams | null) => void
  setClarity: (v: number) => void
  setSaturation: (v: number) => void
  setVibrance: (v: number) => void
  setLut: (lut: string | null, intensity?: number) => void

  // 工作流级 setter（watermark / frame）
  setFrameConfig: (config: FrameConfig | null) => void
  setWatermarkConfig: (config: WatermarkConfig | null) => void

  // ---- 多图编辑会话（Lightroom 风格胶片条）----
  /** 当前会话中的照片 ID 列表（胶片条内容）；单图模式 = [photoId] */
  sessionPhotoIds: string[]
  /** 当前正在编辑的照片 ID */
  activePhotoId: string | null
  /** 胶片条中被选中的照片 ID（用于同步/批量导出）；不含 activePhotoId */
  selectedPhotoIds: string[]
  /** 每张照片的独立编辑状态缓存（切换照片时保存/恢复） */
  photoStates: Record<string, PhotoEditState>

  // ---- 多图 actions ----
  /** 初始化编辑会话（从 Library 进入时调用） */
  initSession: (photoIds: string[], activeId?: string) => void
  /** 切换当前编辑照片（自动保存旧照片状态、恢复新照片状态） */
  switchPhoto: (photoId: string) => void
  /** 切换胶片条选中状态（Cmd+Click） */
  toggleSelected: (photoId: string) => void
  /** 全选/全不选 */
  selectAll: () => void
  deselectAll: () => void
  /** 同步当前照片的参数到选中照片（按字段） */
  syncToSelected: (options: SyncOptions) => void

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

/**
 * 判断是否与基准有差异——用于 UI 脏提示。
 *
 * P2 优化：优先读 store 内部的 _dirty 快速标记（O(1)）。
 * _dirty 由 set* action 自动置 true，loadFromPreset / resetToBaseline 重置为 false。
 * 仅在 _dirty=true 时降级到 JSON.stringify 精确比对（确认真的有差异还是只是标记了）。
 */
export function hasDirtyEdits(
  current: FilterPipeline | null,
  baseline: FilterPipeline | null,
  dirty?: boolean,
): boolean {
  // 快速路径：_dirty 为 false 说明没有任何 set* 触发过
  if (dirty === false) return false
  if (current === baseline) return false
  if (current === null && baseline === null) return false
  if (current === null || baseline === null) return true
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

/** 确保 currentPipeline 为对象（null → {}），标记 dirty，返回可变引用 */
function ensurePipe(s: EditState): FilterPipeline {
  if (!s.currentPipeline) s.currentPipeline = {}
  s._dirty = true
  return s.currentPipeline
}

/** 通用深拷贝（JSON round-trip，适用于纯数据结构） */
function deepClone<T>(v: T | null | undefined): T | null {
  if (v == null) return null
  return JSON.parse(JSON.stringify(v)) as T
}

export const useEditStore = create<EditState>()(
  immer((set) => ({
    currentPipeline: null,
    baselinePipeline: null,
    baselineFilterId: null,
    frameConfig: null,
    watermarkConfig: null,
    _dirty: false,
    history: [],
    future: [],
    // 多图会话
    sessionPhotoIds: [],
    activePhotoId: null,
    selectedPhotoIds: [],
    photoStates: {},

    loadFromPreset(preset) {
      set((s) => {
        s.baselineFilterId = preset?.id ?? null
        s.baselinePipeline = preset ? deepClonePipeline(preset.pipeline) : null
        s.currentPipeline = preset ? deepClonePipeline(preset.pipeline) : null
        s._dirty = false
        // 切滤镜时清空历史（不跨滤镜撤销）
        s.history = []
        s.future = []
      })
    },

    resetToBaseline() {
      set((s) => {
        s.currentPipeline = deepClonePipeline(s.baselinePipeline)
        s._dirty = false
      })
    },

    clear() {
      set((s) => {
        s.currentPipeline = null
        s.baselinePipeline = null
        s.baselineFilterId = null
        s.frameConfig = null
        s.watermarkConfig = null
        s._dirty = false
        s.history = []
        s.future = []
      })
    },

    setTone(patch) {
      set((s) => {
        if (patch === null) {
          if (s.currentPipeline?.tone) {
            s.currentPipeline.tone = undefined
            s._dirty = true
          }
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
          if (s.currentPipeline?.whiteBalance) {
            s.currentPipeline.whiteBalance = undefined
            s._dirty = true
          }
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
          if (s.currentPipeline?.vignette) {
            s.currentPipeline.vignette = undefined
            s._dirty = true
          }
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

    setColorGrading(patch) {
      set((s) => {
        if (patch === null) {
          if (s.currentPipeline?.colorGrading) {
            s.currentPipeline.colorGrading = undefined
            s._dirty = true
          }
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

    setGrain(patch) {
      set((s) => {
        if (patch === null) {
          if (s.currentPipeline?.grain) {
            s.currentPipeline.grain = undefined
            s._dirty = true
          }
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
          if (s.currentPipeline?.halation) {
            s.currentPipeline.halation = undefined
            s._dirty = true
          }
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

    setCrop(patch) {
      set((s) => {
        if (patch === null) {
          if (s.currentPipeline?.crop) {
            s.currentPipeline.crop = undefined
            s._dirty = true
          }
          return
        }
        const pipe = ensurePipe(s)
        pipe.crop = patch
        s._dirty = true
      })
    },

    setTransform(patch) {
      set((s) => {
        if (patch === null) {
          if (s.currentPipeline?.transform) {
            s.currentPipeline.transform = undefined
            s._dirty = true
          }
          return
        }
        const pipe = ensurePipe(s)
        pipe.transform = patch
        s._dirty = true
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

    // 工作流级 setter
    setFrameConfig(config) {
      set((s) => {
        s.frameConfig = config ? deepClone(config) : null
        s._dirty = true
      })
    },
    setWatermarkConfig(config) {
      set((s) => {
        s.watermarkConfig = config ? deepClone(config) : null
        s._dirty = true
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
          frameConfig: deepClone(s.frameConfig),
          watermarkConfig: deepClone(s.watermarkConfig),
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
        if (pipelineEquals(s.currentPipeline, top.pipeline)) {
          // 场景 A
          const popped = s.history.pop()!
          s.future.push({
            pipeline: deepClonePipeline(popped.pipeline),
            frameConfig: deepClone(s.frameConfig),
            watermarkConfig: deepClone(s.watermarkConfig),
            timestamp: Date.now(),
            label: popped.label,
          })
          const newTop = s.history[s.history.length - 1]
          s.currentPipeline = newTop ? deepClonePipeline(newTop.pipeline) : null
          s.frameConfig = newTop ? deepClone(newTop.frameConfig) : null
          s.watermarkConfig = newTop ? deepClone(newTop.watermarkConfig) : null
        } else {
          // 场景 B
          s.future.push({
            pipeline: deepClonePipeline(s.currentPipeline),
            frameConfig: deepClone(s.frameConfig),
            watermarkConfig: deepClone(s.watermarkConfig),
            timestamp: Date.now(),
          })
          s.currentPipeline = deepClonePipeline(top.pipeline)
          s.frameConfig = deepClone(top.frameConfig)
          s.watermarkConfig = deepClone(top.watermarkConfig)
        }
      })
    },

    redo() {
      set((s) => {
        if (s.future.length === 0) return
        const next = s.future.pop()!
        s.history.push({
          pipeline: deepClonePipeline(next.pipeline),
          frameConfig: deepClone(s.frameConfig),
          watermarkConfig: deepClone(s.watermarkConfig),
          timestamp: Date.now(),
          label: next.label,
        })
        s.currentPipeline = deepClonePipeline(next.pipeline)
        s.frameConfig = deepClone(next.frameConfig)
        s.watermarkConfig = deepClone(next.watermarkConfig)
        // 守住上限
        if (s.history.length > HISTORY_LIMIT) {
          s.history = s.history.slice(s.history.length - HISTORY_LIMIT)
        }
      })
    },

    // ---- 多图会话 actions ----

    initSession(photoIds, activeId) {
      set((s) => {
        s.sessionPhotoIds = [...photoIds]
        s.activePhotoId = activeId ?? photoIds[0] ?? null
        s.selectedPhotoIds = []
        // 不清空 photoStates（草稿可以跨会话保留）
      })
    },

    switchPhoto(photoId) {
      set((s) => {
        if (s.activePhotoId === photoId) return
        // 保存当前照片的状态到 photoStates
        if (s.activePhotoId) {
          s.photoStates[s.activePhotoId] = {
            pipeline: deepClonePipeline(s.currentPipeline),
            baselinePipeline: deepClonePipeline(s.baselinePipeline),
            baselineFilterId: s.baselineFilterId,
            frameConfig: deepClone(s.frameConfig),
            watermarkConfig: deepClone(s.watermarkConfig),
            history: JSON.parse(JSON.stringify(s.history)),
            future: JSON.parse(JSON.stringify(s.future)),
            dirty: s._dirty,
          }
        }
        // 恢复目标照片的状态
        const saved = s.photoStates[photoId]
        if (saved) {
          s.currentPipeline = deepClonePipeline(saved.pipeline)
          s.baselinePipeline = deepClonePipeline(saved.baselinePipeline)
          s.baselineFilterId = saved.baselineFilterId
          s.frameConfig = deepClone(saved.frameConfig)
          s.watermarkConfig = deepClone(saved.watermarkConfig)
          s.history = JSON.parse(JSON.stringify(saved.history))
          s.future = JSON.parse(JSON.stringify(saved.future))
          s._dirty = saved.dirty
        } else {
          // 新照片：初始化为空状态
          s.currentPipeline = null
          s.baselinePipeline = null
          s.baselineFilterId = null
          s.frameConfig = null
          s.watermarkConfig = null
          s.history = []
          s.future = []
          s._dirty = false
        }
        s.activePhotoId = photoId
      })
    },

    toggleSelected(photoId) {
      set((s) => {
        const idx = s.selectedPhotoIds.indexOf(photoId)
        if (idx >= 0) {
          s.selectedPhotoIds.splice(idx, 1)
        } else {
          s.selectedPhotoIds.push(photoId)
        }
      })
    },

    selectAll() {
      set((s) => {
        // 选中所有（排除当前正在编辑的）
        s.selectedPhotoIds = s.sessionPhotoIds.filter((id) => id !== s.activePhotoId)
      })
    },

    deselectAll() {
      set((s) => {
        s.selectedPhotoIds = []
      })
    },

    syncToSelected(options) {
      set((s) => {
        if (!s.activePhotoId || s.selectedPhotoIds.length === 0) return
        // 先保存当前照片状态
        s.photoStates[s.activePhotoId] = {
          pipeline: deepClonePipeline(s.currentPipeline),
          baselinePipeline: deepClonePipeline(s.baselinePipeline),
          baselineFilterId: s.baselineFilterId,
          frameConfig: deepClone(s.frameConfig),
          watermarkConfig: deepClone(s.watermarkConfig),
          history: JSON.parse(JSON.stringify(s.history)),
          future: JSON.parse(JSON.stringify(s.future)),
          dirty: s._dirty,
        }

        const srcPipe = s.currentPipeline
        for (const targetId of s.selectedPhotoIds) {
          const target = s.photoStates[targetId] ?? {
            pipeline: null, baselinePipeline: null, baselineFilterId: null,
            frameConfig: null, watermarkConfig: null,
            history: [], future: [], dirty: false,
          }
          // 确保目标有 pipeline 对象
          if (!target.pipeline) target.pipeline = {}
          const tp = target.pipeline

          // 按字段合并
          if (options.whiteBalance && srcPipe?.whiteBalance) {
            tp.whiteBalance = JSON.parse(JSON.stringify(srcPipe.whiteBalance))
          }
          if (options.tone && srcPipe?.tone) {
            tp.tone = JSON.parse(JSON.stringify(srcPipe.tone))
          }
          if (options.colorGrading && srcPipe?.colorGrading) {
            tp.colorGrading = JSON.parse(JSON.stringify(srcPipe.colorGrading))
          }
          if (options.saturation && srcPipe?.saturation !== undefined) {
            tp.saturation = srcPipe.saturation
          }
          if (options.vibrance && srcPipe?.vibrance !== undefined) {
            tp.vibrance = srcPipe.vibrance
          }
          if (options.clarity && srcPipe?.clarity !== undefined) {
            tp.clarity = srcPipe.clarity
          }
          if (options.hsl && srcPipe?.hsl) {
            tp.hsl = JSON.parse(JSON.stringify(srcPipe.hsl))
          }
          if (options.curves && srcPipe?.curves) {
            tp.curves = JSON.parse(JSON.stringify(srcPipe.curves))
          }
          if (options.grain && srcPipe?.grain) {
            tp.grain = JSON.parse(JSON.stringify(srcPipe.grain))
          }
          if (options.halation && srcPipe?.halation) {
            tp.halation = JSON.parse(JSON.stringify(srcPipe.halation))
          }
          if (options.vignette && srcPipe?.vignette) {
            tp.vignette = JSON.parse(JSON.stringify(srcPipe.vignette))
          }
          if (options.crop && srcPipe?.crop) {
            tp.crop = JSON.parse(JSON.stringify(srcPipe.crop))
          }
          if (options.frame) {
            target.frameConfig = deepClone(s.frameConfig)
          }
          if (options.watermark) {
            target.watermarkConfig = deepClone(s.watermarkConfig)
          }

          target.dirty = true
          s.photoStates[targetId] = target
        }
      })
    },
  })),
)

// E2E 测试钩子:将 store 挂到 window 供 Playwright page.evaluate 访问
//
// 挂载条件(2026-05-01 修订):
//   - 优先走 preload 暴露的 `window.grain.testMode`——只有主进程启动时设置了
//     `GRAINMARK_TEST=1`(launchApp / packaged smoke 都会注入)才为 true
//   - 兜底保留 `import.meta.env.DEV` 走本地 vite dev server 调试
//
// 为什么不能只用 `import.meta.env.DEV || MODE === 'test'`:
//   - E2E 实际跑的是 `npm run build` 产出的 production 构建,DEV/MODE 都 false
//   - 旧条件会让 __grainEditStore 在 E2E 下恒不存在,"滤镜 pipeline 真生效"的断言
//     无法读 store 状态,只能退回纯 DOM 断言 —— 这正是 2026-05-01 E2E 审计
//     定位的"伪绿根因"
//
// 生产环境用户完全不会有 GRAINMARK_TEST 环境变量,这里不会暴露。
if (typeof window !== 'undefined') {
  const grain = (window as unknown as { grain?: { testMode?: boolean } }).grain
  const testModeByPreload = grain?.testMode === true
  const isDevBuild = import.meta.env.DEV || import.meta.env.MODE === 'test'
  if (testModeByPreload || isDevBuild) {
    ;(window as unknown as { __grainEditStore?: unknown }).__grainEditStore = useEditStore
  }
}
