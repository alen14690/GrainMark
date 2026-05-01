/**
 * FramePreviewHost — 边框预览主机组件
 *
 * 职责:
 *   - 从 FrameStyleRegistry 按 style.id 取 layout 组件
 *   - 未注册时显示友好 fallback(不崩)
 *   - 用 ResizeObserver 测量容器尺寸,传给 layout(AGENTS.md 第 8 条:让布局按容器
 *     尺寸算 CSS 像素,而不是每个 layout 各自 getBoundingClientRect 散布 6 处)
 *
 * 阶段 1:只渲染 Placeholder,但切换 style.id 时 DOM 真的会重建 —— 这正是老
 * `WatermarkOverlay` 的致命伤(不读 templateId → 切换无效果)的彻底修复。
 *
 * 与后端渲染的关系:
 *   - 本组件只做 CSS 预览(快,实时反馈参数变化)
 *   - 用户点"高保真"按钮时,才调 IPC `frame:render` 取 Sharp 实渲结果
 *   - 两条路径的尺寸/颜色/字体必须对齐(靠共享 frame-tokens 保证)
 */
import { useEffect, useRef, useState } from 'react'
import type { FrameStyle, FrameStyleOverrides, Photo } from '../../../shared/types'
import { getFrameLayoutComponent } from './FrameStyleRegistry'

export interface FramePreviewHostProps {
  photo: Photo | null
  style: FrameStyle | null
  overrides: FrameStyleOverrides | null
}

export function FramePreviewHost({ photo, style, overrides }: FramePreviewHostProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!photo || !style || !overrides) {
    return (
      <div
        ref={rootRef}
        className="w-full h-full flex items-center justify-center text-fg-3 text-[12px] bg-bg-0 rounded-lg"
      >
        先到图库导入照片 · 再选一个边框风格
      </div>
    )
  }

  const Layout = getFrameLayoutComponent(style.id)
  if (!Layout) {
    return (
      <div
        ref={rootRef}
        className="w-full h-full flex flex-col items-center justify-center gap-2 text-fg-3 text-[12px] bg-bg-0 rounded-lg"
      >
        <div className="font-mono uppercase tracking-wider text-brand-amber">尚未实装</div>
        <div>FrameStyleId · {style.id}</div>
        <div className="text-[10.5px] text-fg-3">后续阶段会补全</div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="w-full h-full overflow-hidden rounded-lg bg-bg-0">
      <Layout
        photo={photo}
        style={style}
        overrides={overrides}
        containerWidth={size.w}
        containerHeight={size.h}
      />
    </div>
  )
}
