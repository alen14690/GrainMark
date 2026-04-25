/**
 * ValueBadge — 等宽数字徽章
 * 用于 EXIF 显示、评分、曝光值等需要仪表感的场景
 */
import { cn } from '../utils'

export interface ValueBadgeProps {
  label?: string
  value: string | number
  unit?: string
  variant?: 'default' | 'amber' | 'cyan' | 'red' | 'muted'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function ValueBadge({
  label,
  value,
  unit,
  variant = 'default',
  size = 'md',
  className,
}: ValueBadgeProps) {
  const sizeClasses = {
    sm: 'text-xxs gap-1 px-1.5 py-0.5',
    md: 'text-xs gap-1.5 px-2 py-1',
    lg: 'text-sm gap-2 px-2.5 py-1.5',
  }[size]

  const variantClasses = {
    default: 'bg-bg-1 border border-fg-4 text-fg-1',
    amber: 'bg-brand-amber/10 border border-brand-amber/30 text-brand-amber',
    cyan: 'bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan',
    red: 'bg-brand-red/10 border border-brand-red/30 text-brand-red',
    muted: 'bg-transparent border border-fg-4/60 text-fg-3',
  }[variant]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm shadow-badge',
        'font-numeric tabular-nums',
        sizeClasses,
        variantClasses,
        className,
      )}
    >
      {label && <span className="text-fg-3 tracking-wide uppercase">{label}</span>}
      <span className="text-fg-1">{value}</span>
      {unit && <span className="text-fg-3">{unit}</span>}
    </span>
  )
}
