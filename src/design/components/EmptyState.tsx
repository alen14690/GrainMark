/**
 * EmptyState — 通用空状态组件
 * 暗房风格：居中、克制、带颗粒装饰
 */
import type { ReactNode } from 'react'
import { cn } from '../utils'
import { GrainOverlay } from './GrainOverlay'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string | ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center text-center',
        compact ? 'py-10' : 'py-20',
        className,
      )}
    >
      <GrainOverlay opacity={0.02} />
      {icon && (
        <div
          className={cn(
            'mx-auto rounded-xl bg-gradient-to-br from-bg-2 to-bg-1 border border-fg-4',
            'flex items-center justify-center relative grain-local',
            compact ? 'w-16 h-16' : 'w-24 h-24',
          )}
        >
          <div className="text-fg-3">{icon}</div>
        </div>
      )}
      <h2 className={cn('mt-5 font-display-serif tracking-tight text-fg-1', compact ? 'text-lg' : 'text-xl')}>
        {title}
      </h2>
      {description && (
        <div className={cn('mt-2 max-w-md text-fg-2 leading-relaxed', compact ? 'text-xs' : 'text-sm')}>
          {description}
        </div>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
