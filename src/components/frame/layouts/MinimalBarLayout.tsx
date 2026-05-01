import { DEFAULT_FRAME_SHOW_FIELDS, buildFrameParamLine } from '../../../../shared/frame-text'
import { FONT_STACK, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import { thumbSrc } from '../../../lib/grainUrl'
/**
 * MinimalBarLayout · 极简底栏 CSS 预览
 *
 * 设计与 generators/minimalBar.ts 严格对应 —— 同一份 FrameLayout 数据驱动,
 * 同一套 scaleByMinEdge 比例计算。前端预览必须与 Sharp 实渲像素级对齐,
 * 否则用户在预览里看到的和导出的会不一致(AGENTS.md 第 7 条 UI 证据链)。
 *
 * 与旧 `WatermarkOverlay` 的核心区别:
 *   - 老版永远渲染 `absolute inset-x-0 bottom-0 bg-gradient-to-t` 一套死模板 →
 *     切换 templateId 不变化 → 用户骂"切换无效果"
 *   - 本组件读 style.id 数据,在 DOM 结构上根据 layout 定义动态布局,FramePreviewHost
 *     按 id 切换组件时,React 会真的卸载旧组件挂新组件 → 视觉立即变化
 */
import type { FrameLayoutProps } from '../FrameStyleRegistry'

export function MinimalBarLayout({
  photo,
  style,
  overrides,
  containerWidth,
  containerHeight,
}: FrameLayoutProps) {
  const orientation = classifyOrientation(photo.width, photo.height)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  // 换算到容器尺寸(让 CSS 像素比例与生产图上的比例一致)
  //   注意:预览容器 ≠ 原图尺寸,我们按"容器宽 × 容器高"作为虚拟图,
  //   用同样的 scaleByMinEdge 得到 CSS 像素 —— 这样改参的视觉反馈与 Sharp 实渲比例对齐
  const barH = scaleByMinEdge(layout.borderBottom, containerWidth, containerHeight)

  // 字号同理:用容器的 minEdge 算 CSS px(与 Sharp 的 minEdge=图片短边 比例一致)
  const paramsSlot = layout.slots.find((s) => s.id === 'params')
  const dateSlot = layout.slots.find((s) => s.id === 'date')
  const paramsFontPx = paramsSlot ? scaleByMinEdge(paramsSlot.fontSize, containerWidth, containerHeight) : 12
  const dateFontPx = dateSlot ? scaleByMinEdge(dateSlot.fontSize, containerWidth, containerHeight) : 10

  // 文本内容 —— 统一走 shared/frame-text 的单源
  const showFields = overrides.showFields ?? DEFAULT_FRAME_SHOW_FIELDS
  const paramLine = buildFrameParamLine(photo.exif, showFields)
  const dateLine = showFields.dateTime ? (photo.exif.dateTimeOriginal ?? '') : ''

  const bg = layout.backgroundColor
  const fg = layout.textColor
  const dateFg = dateSlot?.colorOverride ?? fg

  return (
    <div
      className="relative w-full h-full flex flex-col"
      data-frame-style-id={style.id}
      data-frame-orientation={orientation}
    >
      {/* 照片本体 · 占据上部,flex-1 让底栏贴底 */}
      {photo.thumbPath && (
        <img src={thumbSrc(photo)} alt="" className="flex-1 min-h-0 w-full object-contain bg-bg-0" />
      )}
      {/* 底栏 */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{
          height: `${barH}px`,
          backgroundColor: bg,
          paddingLeft: `${Math.round(containerWidth * (paramsSlot?.anchor.x ?? 0.04))}px`,
          paddingRight: `${Math.round(containerWidth * (1 - (dateSlot?.anchor.x ?? 0.96)))}px`,
        }}
      >
        <div
          style={{
            color: fg,
            fontSize: `${paramsFontPx}px`,
            fontFamily: paramsSlot ? FONT_STACK[paramsSlot.fontFamily].css : FONT_STACK.mono.css,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {paramLine || '—'}
        </div>
        {dateSlot && dateLine && (
          <div
            style={{
              color: dateFg,
              fontSize: `${dateFontPx}px`,
              fontFamily: FONT_STACK[dateSlot.fontFamily].css,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              marginLeft: `${Math.round(paramsFontPx * 0.8)}px`,
            }}
          >
            {dateLine}
          </div>
        )}
      </div>
    </div>
  )
}
