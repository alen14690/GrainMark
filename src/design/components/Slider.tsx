/**
 * Slider — 专业参数滑块（参照 Lightroom Develop 模块的交互规范）
 *
 * 核心特性：
 *   - 拖动节流：pointermove 高频触发只在 rAF 内聚合一次 onChange，避免 120Hz
 *     屏幕下每秒 120+ 次 setState 把 React 重渲堆爆
 *   - 双击复位：滑块轨道 + 标签文字 双击都会回到默认值（Lightroom 惯例）
 *   - 键盘方向键 ±step；Shift = 10×；Alt = 0.1×；Home/End 到端点
 *   - 非线性响应（可选）：传 curve='ease-center' 让中段（near 0）响应慢、
 *     两端响应快，避免用户"轻轻一动就爆"；传 'linear' 保持原线性
 *   - 双向（bipolar）从中心填色，适合 ±100 参数
 *   - 等宽数字显示，tabular-nums 对齐
 *
 * 性能保证：
 *   - onChange 每帧至多一次（rAF 合并）
 *   - onChangeEnd（松手 / 键盘操作 / 双击复位）始终触发，用于记录历史栈
 */
import { type KeyboardEvent, type PointerEvent, memo, useCallback, useEffect, useRef, useState } from 'react'
import { clamp, cn, fmtSigned } from '../utils'

/**
 * 滑块的显示 → 实际值的响应曲线
 *
 * - 'linear'：线性映射，简单直观（默认，兼容老行为）
 * - 'ease-center'：中段平缓（|x| < 20% 区间响应减半），两端加速 —— 适合
 *   tone/whites/blacks 等容易"推过度"的参数。视觉上和 Lightroom 的 s 曲线
 *   滑块响应感类似
 */
export type SliderCurve = 'linear' | 'ease-center'

export interface SliderProps {
  label?: string
  value: number
  onChange: (v: number) => void
  onChangeEnd?: (v: number) => void
  min: number
  max: number
  step?: number
  defaultValue?: number
  /** 双极（从中心填色，如 -100..+100） */
  bipolar?: boolean
  /** 显示值的小数位 */
  precision?: number
  /** 单位后缀（如 " EV" " %"） */
  suffix?: string
  disabled?: boolean
  compact?: boolean
  className?: string
  /** 响应曲线（见 SliderCurve）。默认 'linear' */
  curve?: SliderCurve
}

/**
 * 把轨道位置 [0..1] 映射到 [min..max] 值空间，可选非线性
 *
 * ease-center 实现：
 *   - 以中心为 0.5 的轨道比例作 s 曲线：f(x) = 0.5 + (x - 0.5) * |x - 0.5| * 2
 *   - 在 x = 0.5 附近梯度 ≈ 0（平缓），|x - 0.5| > 0.3 后梯度快速上升
 *   - 这使得用户在"中性位置附近"微调更容易；极端效果在两端更快达到
 */
export function mapRatioToValue(ratio: number, min: number, max: number, curve: SliderCurve): number {
  const r = clamp(ratio, 0, 1)
  if (curve === 'linear') return min + r * (max - min)
  // ease-center: 在 [0, 1] 上以 0.5 为中心做 s 形重映射
  const d = r - 0.5
  const warped = 0.5 + d * Math.abs(d) * 2 // 中心平缓，两端加速
  return min + clamp(warped, 0, 1) * (max - min)
}

/** 反向映射（value → ratio），用于把 value 准确画到轨道位置 */
export function mapValueToRatio(value: number, min: number, max: number, curve: SliderCurve): number {
  const range = max - min
  if (range <= 0) return 0
  const linearRatio = clamp((value - min) / range, 0, 1)
  if (curve === 'linear') return linearRatio
  // 反解 ease-center：solve warped(d) = linearRatio, where d = r - 0.5
  //   warped = 0.5 + d * |d| * 2  → d * |d| = (linearRatio - 0.5) / 2
  const t = (linearRatio - 0.5) / 2
  const sign = t >= 0 ? 1 : -1
  const d = sign * Math.sqrt(Math.abs(t))
  return clamp(d + 0.5, 0, 1)
}

/**
 * P0-3：用 memo 包一层，使 props 引用稳定时不重渲染。
 *
 * 调用方规范（AdjustmentsPanel / 其它面板）：
 *   - onChange / onChangeEnd 必须用稳定引用（从 store.getState() 取或 useCallback 包）
 *   - 否则每次父组件 render 都会制造新函数引用 → memo 失效
 *
 * 这样当"曝光滑块"的 value 变化时，其它 20+ slider 即便被父组件 re-render 也会在
 * memo 层被剪枝，只有 value 真正变的那一个 slider 重绘。
 */
export const Slider = memo(function SliderInner({
  label,
  value,
  onChange,
  onChangeEnd,
  min,
  max,
  step = 1,
  defaultValue,
  bipolar = false,
  precision = 0,
  suffix,
  disabled = false,
  compact = false,
  className,
  curve = 'linear',
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  // 轨道视觉上的位置百分比（考虑 curve）
  const pct = mapValueToRatio(value, min, max, curve) * 100
  const centerPct = bipolar ? mapValueToRatio(0, min, max, curve) * 100 : 0

  // 填充条起止（双极时从 0 位置到 value）
  const fillStart = bipolar ? Math.min(pct, centerPct) : 0
  const fillEnd = bipolar ? Math.max(pct, centerPct) : pct

  // rAF 合并：pointermove 高频触发时，只在下一帧调一次 onChange
  const rafPendingRef = useRef<number | null>(null)
  const nextValueRef = useRef<number | null>(null)
  useEffect(() => {
    // 卸载时清掉未消费的 rAF，避免在卸载后调用 onChange
    return () => {
      if (rafPendingRef.current !== null) {
        cancelAnimationFrame(rafPendingRef.current)
        rafPendingRef.current = null
      }
    }
  }, [])

  const scheduleChange = useCallback(
    (next: number) => {
      nextValueRef.current = next
      if (rafPendingRef.current !== null) return
      rafPendingRef.current = requestAnimationFrame(() => {
        rafPendingRef.current = null
        const v = nextValueRef.current
        if (v !== null) {
          onChange(v)
          nextValueRef.current = null
        }
      })
    },
    [onChange],
  )

  /** 把 clientX 映射到"吸附 step + clamp 的值"；考虑 curve */
  const xToValue = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return value
      const rect = trackRef.current.getBoundingClientRect()
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
      const raw = mapRatioToValue(ratio, min, max, curve)
      const snapped = Math.round(raw / step) * step
      return clamp(Number(snapped.toFixed(6)), min, max)
    },
    [min, max, step, curve, value],
  )

  const applyDelta = useCallback(
    (clientX: number) => {
      const next = xToValue(clientX)
      if (next !== value) scheduleChange(next)
    },
    [xToValue, value, scheduleChange],
  )

  const flushPending = useCallback(() => {
    // 松手 / 键盘操作前：立刻 flush 挂起的 rAF（避免丢最后一次）
    if (rafPendingRef.current !== null) {
      cancelAnimationFrame(rafPendingRef.current)
      rafPendingRef.current = null
      const v = nextValueRef.current
      if (v !== null) {
        onChange(v)
        nextValueRef.current = null
      }
    }
  }, [onChange])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(true)
    applyDelta(e.clientX)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || disabled) return
    applyDelta(e.clientX)
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    setDragging(false)
    flushPending()
    // 松手：用当前 state value（onChange 已 flush 过）报 end
    onChangeEnd?.(nextValueRef.current ?? value)
  }
  const resetToDefault = useCallback(() => {
    if (disabled) return
    const target = defaultValue ?? (bipolar ? 0 : min)
    flushPending()
    onChange(target)
    onChangeEnd?.(target)
  }, [disabled, defaultValue, bipolar, min, onChange, onChangeEnd, flushPending])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const multi = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      flushPending()
      const next = clamp(value - step * multi, min, max)
      onChange(next)
      onChangeEnd?.(next)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      flushPending()
      const next = clamp(value + step * multi, min, max)
      onChange(next)
      onChangeEnd?.(next)
    } else if (e.key === 'Home') {
      e.preventDefault()
      flushPending()
      onChange(min)
      onChangeEnd?.(min)
    } else if (e.key === 'End') {
      e.preventDefault()
      flushPending()
      onChange(max)
      onChangeEnd?.(max)
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Lightroom：聚焦 slider 时按 Enter/Space 重置
      e.preventDefault()
      resetToDefault()
    }
  }

  const displayValue = bipolar ? fmtSigned(value, precision) : value.toFixed(precision)

  return (
    <div className={cn('group w-full', compact ? 'space-y-1' : 'space-y-1.5', className)}>
      {/* 标签 + 值 —— 双击 label 复位（Lightroom 惯例） */}
      <div className="flex items-center justify-between">
        {label && (
          <button
            type="button"
            onDoubleClick={resetToDefault}
            title="双击复位"
            className={cn(
              'text-fg-2 hover:text-fg-1 transition-colors select-none cursor-pointer',
              'text-left truncate',
              compact ? 'text-xxs' : 'text-xs',
              disabled && 'opacity-40 cursor-not-allowed',
            )}
          >
            {label}
          </button>
        )}
        <span
          className={cn(
            'font-numeric tabular-nums',
            compact ? 'text-xxs' : 'text-xs',
            dragging ? 'text-brand-violet' : 'text-fg-1',
          )}
        >
          {displayValue}
          {suffix}
        </span>
      </div>

      {/* 轨道 */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={resetToDefault}
        onKeyDown={onKey}
        className={cn(
          'relative h-1 rounded-full cursor-pointer select-none',
          'bg-white/8 transition-shadow duration-fast',
          disabled && 'opacity-40 cursor-not-allowed',
          dragging && 'shadow-glow-violet',
        )}
      >
        {/* 中心点（双极） */}
        {bipolar && (
          <span
            aria-hidden
            className="absolute top-1/2 -translate-y-1/2 w-px h-2 bg-fg-3/60"
            style={{ left: `${centerPct}%` }}
          />
        )}
        {/* 填充（Aurora 青→紫渐变） */}
        <span
          className="absolute top-0 h-full rounded-full bg-aurora-fill"
          style={{ left: `${fillStart}%`, width: `${fillEnd - fillStart}%` }}
        />
        {/* 拇指（白 + 紫辉环） */}
        <span
          className={cn(
            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
            'w-3.5 h-3.5 rounded-full bg-fg-1',
            'ring-0 transition-all duration-instant',
            dragging
              ? 'scale-110 shadow-[0_0_0_4px_rgba(181,137,255,0.3),0_2px_6px_rgba(0,0,0,0.5)]'
              : 'shadow-[0_0_0_2px_rgba(181,137,255,0.2),0_2px_4px_rgba(0,0,0,0.4)]',
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  )
})
