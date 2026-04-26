/**
 * AdjustmentsPanel — Editor 右栏的手动参数滑块面板
 *
 * 范围（M2 + M3.5 优化）：
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
 * 所有修改走 editStore actions；useWebGLPreview 会自动重渲染（rAF 合并节流）
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

export function AdjustmentsPanel() {
  const pipeline = useEditStore((s) => s.currentPipeline)
  const setTone = useEditStore((s) => s.setTone)
  const setWB = useEditStore((s) => s.setWhiteBalance)
  const setVignette = useEditStore((s) => s.setVignette)
  const setClarity = useEditStore((s) => s.setClarity)
  const setSaturation = useEditStore((s) => s.setSaturation)
  const setVibrance = useEditStore((s) => s.setVibrance)
  const commitHistory = useEditStore((s) => s.commitHistory)

  const tone = pipeline?.tone
  const wb = pipeline?.whiteBalance
  const vignette = pipeline?.vignette

  /**
   * Slider 交互结束（松手 / 键盘 / 双击复位）时把当前状态入栈。
   * 所有 Slider 共用此 helper：入栈语义对所有参数一致，label 提供 UI 可读性。
   * 注意：commitHistory 本身幂等去重，同值不会重复入栈。
   */
  const commit = (label: string) => () => commitHistory(label)

  /**
   * Section 分组重置：先 commit 当前态 → 执行重置动作 → 再 commit 重置后的态，
   * 保证撤销/重做能精确回退到 "重置前" 和 "重置后" 两个状态。
   */
  const resetWithHistory = (label: string, action: () => void) => () => {
    commitHistory(`${label}前`)
    action()
    commitHistory(`${label}`)
  }

  return (
    <div className="flex flex-col">
      {/* ============ Basic（Tone）============ */}
      <Section title="Basic" onReset={resetWithHistory('重置 Basic', () => setTone(null))}>
        <Slider
          label="曝光"
          value={tone?.exposure ?? 0}
          min={-5}
          max={5}
          step={0.01}
          precision={2}
          suffix=" EV"
          bipolar
          compact
          onChange={(v) => setTone({ exposure: v })}
          onChangeEnd={commit('曝光')}
        />
        <Slider
          label="对比度"
          value={tone?.contrast ?? 0}
          min={-100}
          max={100}
          step={1}
          bipolar
          compact
          curve="ease-center"
          onChange={(v) => setTone({ contrast: v })}
          onChangeEnd={commit('对比度')}
        />
        <Slider
          label="高光"
          value={tone?.highlights ?? 0}
          min={-100}
          max={100}
          step={1}
          bipolar
          compact
          curve="ease-center"
          onChange={(v) => setTone({ highlights: v })}
          onChangeEnd={commit('高光')}
        />
        <Slider
          label="阴影"
          value={tone?.shadows ?? 0}
          min={-100}
          max={100}
          step={1}
          bipolar
          compact
          curve="ease-center"
          onChange={(v) => setTone({ shadows: v })}
          onChangeEnd={commit('阴影')}
        />
        <Slider
          label="白色"
          value={tone?.whites ?? 0}
          min={-100}
          max={100}
          step={1}
          bipolar
          compact
          curve="ease-center"
          onChange={(v) => setTone({ whites: v })}
          onChangeEnd={commit('白色')}
        />
        <Slider
          label="黑色"
          value={tone?.blacks ?? 0}
          min={-100}
          max={100}
          step={1}
          bipolar
          compact
          curve="ease-center"
          onChange={(v) => setTone({ blacks: v })}
          onChangeEnd={commit('黑色')}
        />
      </Section>

      {/* ============ White Balance ============ */}
      <Section title="White Balance" onReset={resetWithHistory('重置 White Balance', () => setWB(null))}>
        <Slider
          label="色温"
          value={wb?.temp ?? 0}
          min={-100}
          max={100}
          step={1}
          bipolar
          compact
          curve="ease-center"
          onChange={(v) => setWB({ temp: v })}
          onChangeEnd={commit('色温')}
        />
        <Slider
          label="色调"
          value={wb?.tint ?? 0}
          min={-100}
          max={100}
          step={1}
          bipolar
          compact
          curve="ease-center"
          onChange={(v) => setWB({ tint: v })}
          onChangeEnd={commit('色调')}
        />
      </Section>

      {/* ============ Presence ============ */}
      <Section
        title="Presence"
        onReset={resetWithHistory('重置 Presence', () => {
          setClarity(0)
          setSaturation(0)
          setVibrance(0)
        })}
      >
        <Slider
          label="清晰度"
          value={pipeline?.clarity ?? 0}
          min={-100}
          max={100}
          step={1}
          bipolar
          compact
          curve="ease-center"
          onChange={setClarity}
          onChangeEnd={commit('清晰度')}
        />
        <Slider
          label="自然饱和度"
          value={pipeline?.vibrance ?? 0}
          min={-100}
          max={100}
          step={1}
          bipolar
          compact
          curve="ease-center"
          onChange={setVibrance}
          onChangeEnd={commit('自然饱和度')}
        />
        <Slider
          label="饱和度"
          value={pipeline?.saturation ?? 0}
          min={-100}
          max={100}
          step={1}
          bipolar
          compact
          curve="ease-center"
          onChange={setSaturation}
          onChangeEnd={commit('饱和度')}
        />
      </Section>

      {/* ============ Vignette ============ */}
      <Section
        title="Vignette"
        defaultOpen={false}
        onReset={resetWithHistory('重置 Vignette', () => setVignette(null))}
      >
        <Slider
          label="强度"
          value={vignette?.amount ?? 0}
          min={-100}
          max={100}
          step={1}
          bipolar
          compact
          curve="ease-center"
          onChange={(v) => setVignette({ amount: v })}
          onChangeEnd={commit('暗角强度')}
        />
        <Slider
          label="中心"
          value={vignette?.midpoint ?? 50}
          min={0}
          max={100}
          step={1}
          compact
          onChange={(v) => setVignette({ midpoint: v })}
          onChangeEnd={commit('暗角中心')}
        />
        <Slider
          label="圆度"
          value={vignette?.roundness ?? 0}
          min={-100}
          max={100}
          step={1}
          bipolar
          compact
          curve="ease-center"
          onChange={(v) => setVignette({ roundness: v })}
          onChangeEnd={commit('暗角圆度')}
        />
        <Slider
          label="羽化"
          value={vignette?.feather ?? 50}
          min={0}
          max={100}
          step={1}
          compact
          onChange={(v) => setVignette({ feather: v })}
          onChangeEnd={commit('暗角羽化')}
        />
      </Section>
    </div>
  )
}

/** 仅导出 Section 供测试/其它编辑面板复用 */
export { Section as AdjustmentsSection }

/** 仅供测试：把 cn 工具也导出以便外层链 className */
export { cn }
