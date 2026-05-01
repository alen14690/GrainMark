/**
 * FramePreviewHost — 边框预览主机组件
 *
 * 职责:
 *   - 从 FrameStyleRegistry 按 style.id 取 layout 组件
 *   - 未注册时显示友好 fallback(不崩)
 *   - 用 ResizeObserver 测量预览容器尺寸
 *   - **按"带边框照片 aspect"在容器内做 contain-fit**(2026-05-01 下午重做)
 *     · 竖图照片 → 计算出的盒子窄 → 边框也只在窄盒子内 · 不再横跨整个容器
 *     · 横图照片 → 盒子宽 → 边框贴照片宽度
 *
 * 用户反馈根治点(2026-05-01 下午):
 *   "竖形的图片,仅在竖形的图片大小范围内生成边框" →
 *   老版直接把容器尺寸传给 layout · 边框填满整个容器 · 竖图底栏两侧露出大片空白
 *   新版传入"照片+边框盒子"的真实 CSS 尺寸 · layout 组件零改动自动贴合照片宽度
 *
 * 与后端渲染的关系:
 *   - 本组件只做 CSS 预览(快,实时反馈参数变化)
 *   - 用户点"高保真"按钮时,才调 IPC `frame:render` 取 Sharp 实渲结果
 *   - 两条路径的尺寸/颜色/字体必须对齐(靠共享 frame-tokens + framePreviewFit 保证)
 */
import { useEffect, useRef, useState } from 'react'
import { computeFramePreviewFit } from '../../../shared/framePreviewFit'
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

  // 算"带边框照片盒子"在预览容器里的居中 fit 矩形 · layout 组件按此盒子绘制
  const fit = computeFramePreviewFit(size.w, size.h, photo.width, photo.height, style)

  return (
    <div ref={rootRef} className="relative w-full h-full overflow-hidden rounded-lg bg-bg-0">
      {fit.boxW > 0 && fit.boxH > 0 && (
        <div
          // data-frame-photo-box · E2E 可验证"盒子宽度 <= 容器宽度"(竖图盒子应当窄)
          data-frame-photo-box="true"
          data-frame-orientation={fit.orientation}
          style={{
            position: 'absolute',
            left: `${fit.offsetX}px`,
            top: `${fit.offsetY}px`,
            width: `${fit.boxW}px`,
            height: `${fit.boxH}px`,
          }}
        >
          <Layout
            photo={photo}
            style={style}
            overrides={overrides}
            containerWidth={fit.boxW}
            containerHeight={fit.boxH}
          />
        </div>
      )}
    </div>
  )
}
