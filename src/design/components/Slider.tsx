/**
 * Slider — 专业参数滑块
 *
 * 特性：
 *   - 双击复位到默认值
 *   - 拖动时显示 halo + 实时值
 *   - 键盘方向键 ±step；Shift = 10×；Alt = 0.1×
 *   - 支持双向（bipolar，从中间开始着色）
 *   - 等宽数字显示，模拟仪表
 */
import { type KeyboardEvent, type PointerEvent, useCallback, useRef, useState } from 'react'
import { clamp, cn, fmtSigned } from '../utils'

export interface SliderProps {
  label?: string
  value: number
  onChange: (v: number) => void
  onChangeEnd?: (v: number) => void
  min: number
  max: number
  step?: number
  defaultValue?: number
  /** 是否双极（从中心填色，如 -100..+100） */
  bipolar?: boolean
  /** 显示值的小数位 */
  precision?: number
  /** 单位后缀（如 "EV" "%"） */
  suffix?: string
  disabled?: boolean
  compact?: boolean
  className?: string
}

export function Slider({
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
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const range = max - min
  const pct = range === 0 ? 0 : ((value - min) / range) * 100
  const centerPct = bipolar ? ((0 - min) / range) * 100 : 0

  // 填充条起止（双极时从 0 位置到 value）
  const fillStart = bipolar ? Math.min(pct, centerPct) : 0
  const fillEnd = bipolar ? Math.max(pct, centerPct) : pct

  const applyDelta = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return
      const rect = trackRef.current.getBoundingClientRect()
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
      const raw = min + ratio * range
      // 吸附到 step
      const snapped = Math.round(raw / step) * step
      const next = clamp(Number(snapped.toFixed(6)), min, max)
      if (next !== value) onChange(next)
    },
    [min, max, range, step, onChange, value],
  )

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
    onChangeEnd?.(value)
  }
  const onDoubleClick = () => {
    if (disabled) return
    const target = defaultValue ?? (bipolar ? 0 : min)
    onChange(target)
    onChangeEnd?.(target)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const multi = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = clamp(value - step * multi, min, max)
      onChange(next)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = clamp(value + step * multi, min, max)
      onChange(next)
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(min)
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(max)
    }
  }

  const displayValue = bipolar ? fmtSigned(value, precision) : value.toFixed(precision)

  return (
    <div className={cn('group w-full', compact ? 'space-y-1' : 'space-y-1.5', className)}>
      {/* 标签 + 值 */}
      {(label || true) && (
        <div className="flex items-center justify-between">
          {label && <span className={cn('text-fg-2', compact ? 'text-xxs' : 'text-xs')}>{label}</span>}
          <span
            className={cn(
              'font-numeric tabular-nums',
              compact ? 'text-xxs' : 'text-xs',
              dragging ? 'text-brand-amber' : 'text-fg-1',
            )}
          >
            {displayValue}
            {suffix}
          </span>
        </div>
      )}

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
        onDoubleClick={onDoubleClick}
        onKeyDown={onKey}
        className={cn(
          'relative h-1 rounded-full bg-fg-4/60 cursor-pointer select-none',
          'transition-shadow duration-fast',
          disabled && 'opacity-40 cursor-not-allowed',
          dragging && 'shadow-[0_0_0_6px_rgba(74,138,158,0.18)]',
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
        {/* 填充 */}
        <span
          className="absolute top-0 h-full rounded-full bg-brand-cyan"
          style={{ left: `${fillStart}%`, width: `${fillEnd - fillStart}%` }}
        />
        {/* 拇指 */}
        <span
          className={cn(
            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
            'w-3 h-3 rounded-full bg-fg-1 shadow-soft-md',
            'ring-0 transition-transform duration-instant',
            dragging && 'scale-110',
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  )
}
