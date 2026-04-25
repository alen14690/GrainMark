/**
 * editStore — 当前编辑态
 *
 * 职责：
 *   - 承载 Editor 正在修改的 pipeline（以某个 preset 为起点，用户手动叠加调整）
 *   - currentPhotoId 切换 / activeFilterId 切换时重置为"滤镜预设 pipeline"
 *   - 每次 Slider 拖动只改本 store，不落盘（撤销栈留给 M4）
 *
 * 设计要点：
 *   - patch 粒度到单通道（setTone / setWhiteBalance / setVignette / setClarity 等）
 *   - 合并策略：per-channel shallow merge；传 null 表示"移除该通道"
 *   - hasDirtyEdits：当前 pipeline 与 baselinePreset 是否有差异（用于 UI 提示"有未保存修改"）
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

interface EditState {
  /** 当前编辑 pipeline；null 表示"显示原图" */
  currentPipeline: FilterPipeline | null
  /** 当前基准（从 FilterPreset 拷贝来，用于脏检测与 reset） */
  baselinePipeline: FilterPipeline | null
  /** 基准 preset id；切换时同步更新 */
  baselineFilterId: string | null

  // ---- actions ----
  /** 初始化：从 preset 加载基准；传 null 表示"原图" */
  loadFromPreset: (preset: FilterPreset | null) => void
  /** 重置：currentPipeline = baselinePipeline 的深拷贝 */
  resetToBaseline: () => void
  /** 清空编辑态（卸载 Editor 时调用） */
  clear: () => void

  // per-channel patch
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
}

function deepClonePipeline(p: FilterPipeline | null | undefined): FilterPipeline | null {
  if (!p) return null
  // 使用 JSON round-trip 而非 structuredClone —— immer 在 reducer 内部传入的是 draft Proxy，
  // structuredClone 对 Proxy 会报 DataCloneError。pipeline 是纯 JSON 结构（数字/字符串/数组/对象），
  // JSON 克隆安全且成本可忽略。
  return JSON.parse(JSON.stringify(p)) as FilterPipeline
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

    loadFromPreset(preset) {
      set((s) => {
        s.baselineFilterId = preset?.id ?? null
        s.baselinePipeline = preset ? deepClonePipeline(preset.pipeline) : null
        s.currentPipeline = preset ? deepClonePipeline(preset.pipeline) : null
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
  })),
)
