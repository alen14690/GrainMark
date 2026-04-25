/**
 * AdjustmentsPanel — Editor 右栏的手动参数滑块面板
 *
 * 范围（M2）：
 *   - Basic：曝光 / 对比度 / 高光 / 阴影 / 白色 / 黑色
 *   - White Balance：色温 / 色调
 *   - Presence：清晰度 / 饱和度 / 自然饱和度
 *   - Vignette：强度 / 中心 / 圆度 / 羽化
 *
 * 所有修改走 editStore actions；useWebGLPreview 会自动重渲染。
 * HSL / Curves / Color Grading / Grain / Halation 的 UI 留给 M4（需要色环、曲线画布等复杂控件）。
 */
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../design'
import { Slider } from '../design/components/Slider'
import { useEditStore } from '../stores/editStore'

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
          className="flex items-center gap-1.5 text-xxs font-mono uppercase tracking-wider text-fg-3 hover:text-fg-1 transition-colors"
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

export function AdjustmentsPanel() {
  const pipeline = useEditStore((s) => s.currentPipeline)
  const setTone = useEditStore((s) => s.setTone)
  const setWB = useEditStore((s) => s.setWhiteBalance)
  const setVignette = useEditStore((s) => s.setVignette)
  const setClarity = useEditStore((s) => s.setClarity)
  const setSaturation = useEditStore((s) => s.setSaturation)
  const setVibrance = useEditStore((s) => s.setVibrance)

  const tone = pipeline?.tone
  const wb = pipeline?.whiteBalance
  const vignette = pipeline?.vignette

  return (
    <div className="flex flex-col">
      {/* ============ Basic（Tone）============ */}
      <Section title="Basic" onReset={() => setTone(null)}>
        <Slider
          label="曝光"
          value={tone?.exposure ?? 0}
          min={-5}
          max={5}
          step={0.05}
          precision={2}
          suffix=" EV"
          bipolar
          compact
          onChange={(v) => setTone({ exposure: v })}
        />
        <Slider
          label="对比度"
          value={tone?.contrast ?? 0}
          min={-100}
          max={100}
          bipolar
          compact
          onChange={(v) => setTone({ contrast: v })}
        />
        <Slider
          label="高光"
          value={tone?.highlights ?? 0}
          min={-100}
          max={100}
          bipolar
          compact
          onChange={(v) => setTone({ highlights: v })}
        />
        <Slider
          label="阴影"
          value={tone?.shadows ?? 0}
          min={-100}
          max={100}
          bipolar
          compact
          onChange={(v) => setTone({ shadows: v })}
        />
        <Slider
          label="白色"
          value={tone?.whites ?? 0}
          min={-100}
          max={100}
          bipolar
          compact
          onChange={(v) => setTone({ whites: v })}
        />
        <Slider
          label="黑色"
          value={tone?.blacks ?? 0}
          min={-100}
          max={100}
          bipolar
          compact
          onChange={(v) => setTone({ blacks: v })}
        />
      </Section>

      {/* ============ White Balance ============ */}
      <Section title="White Balance" onReset={() => setWB(null)}>
        <Slider
          label="色温"
          value={wb?.temp ?? 0}
          min={-100}
          max={100}
          bipolar
          compact
          onChange={(v) => setWB({ temp: v })}
        />
        <Slider
          label="色调"
          value={wb?.tint ?? 0}
          min={-100}
          max={100}
          bipolar
          compact
          onChange={(v) => setWB({ tint: v })}
        />
      </Section>

      {/* ============ Presence ============ */}
      <Section
        title="Presence"
        onReset={() => {
          setClarity(0)
          setSaturation(0)
          setVibrance(0)
        }}
      >
        <Slider
          label="清晰度"
          value={pipeline?.clarity ?? 0}
          min={-100}
          max={100}
          bipolar
          compact
          onChange={setClarity}
        />
        <Slider
          label="自然饱和度"
          value={pipeline?.vibrance ?? 0}
          min={-100}
          max={100}
          bipolar
          compact
          onChange={setVibrance}
        />
        <Slider
          label="饱和度"
          value={pipeline?.saturation ?? 0}
          min={-100}
          max={100}
          bipolar
          compact
          onChange={setSaturation}
        />
      </Section>

      {/* ============ Vignette ============ */}
      <Section title="Vignette" defaultOpen={false} onReset={() => setVignette(null)}>
        <Slider
          label="强度"
          value={vignette?.amount ?? 0}
          min={-100}
          max={100}
          bipolar
          compact
          onChange={(v) => setVignette({ amount: v })}
        />
        <Slider
          label="中心"
          value={vignette?.midpoint ?? 50}
          min={0}
          max={100}
          compact
          onChange={(v) => setVignette({ midpoint: v })}
        />
        <Slider
          label="圆度"
          value={vignette?.roundness ?? 0}
          min={-100}
          max={100}
          bipolar
          compact
          onChange={(v) => setVignette({ roundness: v })}
        />
        <Slider
          label="羽化"
          value={vignette?.feather ?? 50}
          min={0}
          max={100}
          compact
          onChange={(v) => setVignette({ feather: v })}
        />
      </Section>
    </div>
  )
}

/** 仅导出 Section 供测试/其它编辑面板复用 */
export { Section as AdjustmentsSection }

/** 仅供测试：把 cn 工具也导出以便外层链 className */
export { cn }
