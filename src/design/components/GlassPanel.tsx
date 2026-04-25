/**
 * GlassPanel — 液态玻璃面板 primitive
 *
 * 统一提供玻璃效果，供 Sidebar / TopBar / RightPanel / Modal 等直接复用。
 *
 * 三档 elevation：
 *   - surface  （sidebar 之类的常驻面板）
 *   - elevated （卡片 / toolbar）
 *   - overlay  （模态 / 下拉菜单）
 *
 * 兼容 forwardRef + polymorphic as（`as="aside"` 等常见元素）。
 */
import { type ElementType, type HTMLAttributes, forwardRef } from 'react'
import { cn } from '../utils'

type Elevation = 'surface' | 'elevated' | 'overlay'

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation
  as?: ElementType
  /** 隐藏内高光（用于嵌套玻璃避免反光过度） */
  noInsetHighlight?: boolean
  /** 圆角档位，默认 lg */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
}

const ELEV_CLASS: Record<Elevation, string> = {
  surface: 'glass-surface',
  elevated: 'glass-elevated',
  overlay: 'glass-overlay',
}

const ROUND_CLASS = {
  none: '',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
} as const

export const GlassPanel = forwardRef<HTMLElement, GlassPanelProps>(function GlassPanel(
  {
    elevation = 'surface',
    as: Component = 'div',
    className,
    rounded = 'lg',
    noInsetHighlight,
    style,
    ...rest
  },
  ref,
) {
  const Tag = Component as ElementType
  return (
    <Tag
      ref={ref}
      className={cn(ELEV_CLASS[elevation], ROUND_CLASS[rounded], className)}
      style={noInsetHighlight ? { ...style, boxShadow: 'none' } : style}
      {...rest}
    />
  )
})
