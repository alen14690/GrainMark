/**
 * AdjustmentsPanel — Editor 右栏的手动参数滑块面板（P0-3 重构）
 *
 * 范围：
 *   - Basic：曝光 / 对比度 / 高光 / 阴影 / 白色 / 黑色
 *   - White Balance：色温 / 色调
 *   - Presence：清晰度 / 饱和度 / 自然饱和度
 *   - Vignette：强度 / 中心 / 圆度 / 羽化
 *
 * Lightroom 对齐：
 *   - 标签名可双击复位（Slider 内置支持）
 *   - 所有滑块采用 ease-center 曲线：中段微调更精细，两端快速达到极端
 *   - step 值细化：曝光 0.01 EV、其它 0.1..1（Shift 加速 10×，Alt 精细 0.1×）
 *
 * **P0-3 性能设计（核心）**：
 *   - 每个滑块是独立 memo 组件，**只订阅自己关心的单字段**（如 `pipeline.tone.exposure`）
 *   - 这样拖"曝光"滑块时，其它 19 个滑块不会因 currentPipeline 顶层引用变化而重渲染
 *   - setter 直接从 `useEditStore.getState()` 取（引用稳定，不触发 memo 失效）
 *   - commitHistory 也从 getState 拿
 *
 * 修复前行为（性能审判报告 F8-perf）：
 *   整个 panel 订阅 `currentPipeline` → immer 每次 set → 顶层对象变 →
 *   20+ 个 Slider 全量 re-render + 每个 Slider 的 inline onChange 新引用 →
 *   React fiber 协调 ~5ms/frame
 *
 * 修复后行为：
 *   拖曝光滑块 → 只有"曝光 Slider"和"相关 ValueBadge/顶栏 dirty 标"重渲 → <1ms
 */
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import { cn } from '../design'
import { Slider } from '../design/components/Slider'
import { useEditStore } from '../stores/editStore'

// -----------------------------------------------------------------------------
// store 取 action 的 helper —— 引用稳定（zustand action 在 store 生命周期内恒定）
// 定义在 module 顶层，让所有 Slider 子组件共享同一个闭包，避免每次重渲染重分配
// -----------------------------------------------------------------------------

const getSetTone = () => useEditStore.getState().setTone
const getSetWB = () => useEditStore.getState().setWhiteBalance
const getSetVignette = () => useEditStore.getState().setVignette
const getSetClarity = () => useEditStore.getState().setClarity
const getSetSaturation = () => useEditStore.getState().setSaturation
const getSetVibrance = () => useEditStore.getState().setVibrance
const getCommitHistory = () => useEditStore.getState().commitHistory

// -----------------------------------------------------------------------------
// 子组件：每个 Slider 一个 memo 函数，单字段订阅
// -----------------------------------------------------------------------------

interface ToneFieldSliderProps {
  label: string
  field: 'exposure' | 'contrast' | 'highlights' | 'shadows' | 'whites' | 'blacks'
  min: number
  max: number
  step: number
  precision?: number
  suffix?: string
  curve?: 'linear' | 'ease-center'
}

const ToneFieldSlider = memo(function ToneFieldSlider({
  label,
  field,
  min,
  max,
  step,
  precision,
  suffix,
  curve,
}: ToneFieldSliderProps) {
  // 关键：只订阅单字段，不依赖 currentPipeline 顶层
  const value = useEditStore((s) => s.currentPipeline?.tone?.[field] ?? 0)
  const onChange = useCallback(
    (v: number) => {
      getSetTone()({ [field]: v })
    },
    [field],
  )
  const onChangeEnd = useCallback(() => {
    getCommitHistory()(label)
  }, [label])
  return (
    <Slider
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      precision={precision}
      suffix={suffix}
      bipolar
      compact
      curve={curve}
      onChange={onChange}
      onChangeEnd={onChangeEnd}
    />
  )
})

const WbTempSlider = memo(function WbTempSlider() {
  const value = useEditStore((s) => s.currentPipeline?.whiteBalance?.temp ?? 0)
  const onChange = useCallback((v: number) => {
    getSetWB()({ temp: v })
  }, [])
  const onChangeEnd = useCallback(() => getCommitHistory()('色温'), [])
  return (
    <Slider
      label="色温"
      value={value}
      min={-100}
      max={100}
      step={1}
      bipolar
      compact
      curve="ease-center"
      onChange={onChange}
      onChangeEnd={onChangeEnd}
    />
  )
})

const WbTintSlider = memo(function WbTintSlider() {
  const value = useEditStore((s) => s.currentPipeline?.whiteBalance?.tint ?? 0)
  const onChange = useCallback((v: number) => {
    getSetWB()({ tint: v })
  }, [])
  const onChangeEnd = useCallback(() => getCommitHistory()('色调'), [])
  return (
    <Slider
      label="色调"
      value={value}
      min={-100}
      max={100}
      step={1}
      bipolar
      compact
      curve="ease-center"
      onChange={onChange}
      onChangeEnd={onChangeEnd}
    />
  )
})

const ClaritySlider = memo(function ClaritySlider() {
  const value = useEditStore((s) => s.currentPipeline?.clarity ?? 0)
  const onChange = useCallback((v: number) => {
    getSetClarity()(v)
  }, [])
  const onChangeEnd = useCallback(() => getCommitHistory()('清晰度'), [])
  return (
    <Slider
      label="清晰度"
      value={value}
      min={-100}
      max={100}
      step={1}
      bipolar
      compact
      curve="ease-center"
      onChange={onChange}
      onChangeEnd={onChangeEnd}
    />
  )
})

const VibranceSlider = memo(function VibranceSlider() {
  const value = useEditStore((s) => s.currentPipeline?.vibrance ?? 0)
  const onChange = useCallback((v: number) => {
    getSetVibrance()(v)
  }, [])
  const onChangeEnd = useCallback(() => getCommitHistory()('自然饱和度'), [])
  return (
    <Slider
      label="自然饱和度"
      value={value}
      min={-100}
      max={100}
      step={1}
      bipolar
      compact
      curve="ease-center"
      onChange={onChange}
      onChangeEnd={onChangeEnd}
    />
  )
})

const SaturationSlider = memo(function SaturationSlider() {
  const value = useEditStore((s) => s.currentPipeline?.saturation ?? 0)
  const onChange = useCallback((v: number) => {
    getSetSaturation()(v)
  }, [])
  const onChangeEnd = useCallback(() => getCommitHistory()('饱和度'), [])
  return (
    <Slider
      label="饱和度"
      value={value}
      min={-100}
      max={100}
      step={1}
      bipolar
      compact
      curve="ease-center"
      onChange={onChange}
      onChangeEnd={onChangeEnd}
    />
  )
})

interface VignetteFieldSliderProps {
  label: string
  field: 'amount' | 'midpoint' | 'roundness' | 'feather'
  min: number
  max: number
  bipolar: boolean
  curve?: 'linear' | 'ease-center'
  commitLabel: string
  defaultValue: number
}

const VignetteFieldSlider = memo(function VignetteFieldSlider({
  label,
  field,
  min,
  max,
  bipolar,
  curve,
  commitLabel,
  defaultValue,
}: VignetteFieldSliderProps) {
  const value = useEditStore((s) => s.currentPipeline?.vignette?.[field] ?? defaultValue)
  const onChange = useCallback(
    (v: number) => {
      getSetVignette()({ [field]: v })
    },
    [field],
  )
  const onChangeEnd = useCallback(() => getCommitHistory()(commitLabel), [commitLabel])
  return (
    <Slider
      label={label}
      value={value}
      min={min}
      max={max}
      step={1}
      bipolar={bipolar}
      compact
      curve={curve}
      onChange={onChange}
      onChangeEnd={onChangeEnd}
    />
  )
})

// -----------------------------------------------------------------------------
// Section 折叠容器
// -----------------------------------------------------------------------------

interface SectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  onReset?: () => void
}

function Section({ title, defaultOpen = true, children, onReset }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-fg-4/40 last:border-b-0">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          onDoubleClick={() => onReset?.()}
          title={onReset ? '双击复位本分组' : undefined}
          className="flex items-center gap-1.5 text-xxs font-mono uppercase tracking-wider text-fg-3 hover:text-fg-1 transition-colors select-none"
        >
          {open ? (
            <ChevronDown className="w-3 h-3" strokeWidth={2} />
          ) : (
            <ChevronRight className="w-3 h-3" strokeWidth={2} />
          )}
          {title}
        </button>
        {onReset && open && (
          <button
            type="button"
            onClick={onReset}
            className="text-fg-3 hover:text-fg-1 transition-colors"
            title="重置此分组"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  )
}

// -----------------------------------------------------------------------------
// 主面板 —— 不订阅 currentPipeline，只负责 layout + reset actions
// -----------------------------------------------------------------------------

export function AdjustmentsPanel() {
  // Section 的 reset helper：先 commit → 执行重置 → 再 commit
  const resetBasic = useCallback(() => {
    const st = useEditStore.getState()
    st.commitHistory('重置 Basic 前')
    st.setTone(null)
    st.commitHistory('重置 Basic')
  }, [])
  const resetWB = useCallback(() => {
    const st = useEditStore.getState()
    st.commitHistory('重置 WhiteBalance 前')
    st.setWhiteBalance(null)
    st.commitHistory('重置 WhiteBalance')
  }, [])
  const resetPresence = useCallback(() => {
    const st = useEditStore.getState()
    st.commitHistory('重置 Presence 前')
    st.setClarity(0)
    st.setSaturation(0)
    st.setVibrance(0)
    st.commitHistory('重置 Presence')
  }, [])
  const resetVignette = useCallback(() => {
    const st = useEditStore.getState()
    st.commitHistory('重置 Vignette 前')
    st.setVignette(null)
    st.commitHistory('重置 Vignette')
  }, [])

  return (
    <div className="flex flex-col">
      <Section title="Basic" onReset={resetBasic}>
        <ToneFieldSlider
          label="曝光"
          field="exposure"
          min={-5}
          max={5}
          step={0.01}
          precision={2}
          suffix=" EV"
        />
        <ToneFieldSlider label="对比度" field="contrast" min={-100} max={100} step={1} curve="ease-center" />
        <ToneFieldSlider label="高光" field="highlights" min={-100} max={100} step={1} curve="ease-center" />
        <ToneFieldSlider label="阴影" field="shadows" min={-100} max={100} step={1} curve="ease-center" />
        <ToneFieldSlider label="白色" field="whites" min={-100} max={100} step={1} curve="ease-center" />
        <ToneFieldSlider label="黑色" field="blacks" min={-100} max={100} step={1} curve="ease-center" />
      </Section>

      <Section title="White Balance" onReset={resetWB}>
        <WbTempSlider />
        <WbTintSlider />
      </Section>

      <Section title="Presence" onReset={resetPresence}>
        <ClaritySlider />
        <VibranceSlider />
        <SaturationSlider />
      </Section>

      <Section title="Vignette" defaultOpen={false} onReset={resetVignette}>
        <VignetteFieldSlider
          label="强度"
          field="amount"
          min={-100}
          max={100}
          bipolar
          curve="ease-center"
          commitLabel="暗角强度"
          defaultValue={0}
        />
        <VignetteFieldSlider
          label="中心"
          field="midpoint"
          min={0}
          max={100}
          bipolar={false}
          commitLabel="暗角中心"
          defaultValue={50}
        />
        <VignetteFieldSlider
          label="圆度"
          field="roundness"
          min={-100}
          max={100}
          bipolar
          curve="ease-center"
          commitLabel="暗角圆度"
          defaultValue={0}
        />
        <VignetteFieldSlider
          label="羽化"
          field="feather"
          min={0}
          max={100}
          bipolar={false}
          commitLabel="暗角羽化"
          defaultValue={50}
        />
      </Section>
    </div>
  )
}

/** 仅导出 Section 供测试/其它编辑面板复用 */
export { Section as AdjustmentsSection }

/** 仅供测试：把 cn 工具也导出以便外层链 className */
export { cn }
