/**
 * SpineEditionLayout · 书脊式 CSS 预览
 *
 * 横图:底部胶片黑带 + 左右水平文字
 * 竖图:右侧胶片黑带 + 竖排文字(rotate)
 *
 * 结构与 FilmFullBorderLayout 相似,但只有单边带(非双边)和简化 slot(无齿孔)。
 */
import { FONT_STACK, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import type { FrameContentSlot } from '../../../../shared/types'
import { thumbSrc } from '../../../lib/grainUrl'
import type { FrameLayoutProps } from '../FrameStyleRegistry'

export function SpineEditionLayout({
  photo,
  style,
  overrides: _overrides,
  containerWidth,
  containerHeight,
}: FrameLayoutProps) {
  const orientation = classifyOrientation(photo.width, photo.height)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  const borderTop = scaleByMinEdge(layout.borderTop, containerWidth, containerHeight)
  const borderBottom = scaleByMinEdge(layout.borderBottom, containerWidth, containerHeight)
  const borderLeft = scaleByMinEdge(layout.borderLeft, containerWidth, containerHeight)
  const borderRight = scaleByMinEdge(layout.borderRight, containerWidth, containerHeight)

  const modelLine = [photo.exif.make, photo.exif.model].filter(Boolean).join(' ')
  const dateLine = photo.exif.dateTimeOriginal ?? ''

  return (
    <div
      className="relative w-full h-full"
      style={{
        backgroundColor: layout.backgroundColor,
        paddingTop: `${borderTop}px`,
        paddingBottom: `${borderBottom}px`,
        paddingLeft: `${borderLeft}px`,
        paddingRight: `${borderRight}px`,
        boxSizing: 'border-box',
      }}
      data-frame-style-id={style.id}
      data-frame-orientation={orientation}
    >
      {photo.thumbPath && (
        <img
          src={thumbSrc(photo)}
          alt=""
          className="w-full h-full object-contain"
          style={{ backgroundColor: '#000' }}
        />
      )}
      {layout.slots.map((slot) => {
        const text = slot.id === 'model' ? modelLine : slot.id === 'date' ? dateLine : ''
        if (!text) return null
        return (
          <SpineSlot
            key={`${slot.id}-${slot.area}`}
            slot={slot}
            text={text}
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            borderBottom={borderBottom}
            borderRight={borderRight}
            layoutTextColor={layout.textColor}
          />
        )
      })}
    </div>
  )
}

function SpineSlot({
  slot,
  text,
  containerWidth,
  containerHeight,
  borderBottom,
  borderRight,
  layoutTextColor,
}: {
  slot: FrameContentSlot
  text: string
  containerWidth: number
  containerHeight: number
  borderBottom: number
  borderRight: number
  layoutTextColor: string
}) {
  const fontPx = scaleByMinEdge(slot.fontSize, containerWidth, containerHeight)
  const color = slot.colorOverride ?? layoutTextColor
  const common = {
    position: 'absolute' as const,
    color,
    fontSize: `${fontPx}px`,
    fontFamily: FONT_STACK[slot.fontFamily].css,
    whiteSpace: 'nowrap' as const,
    lineHeight: 1.2,
    fontStyle: slot.fontFamily === 'georgia' ? 'italic' : 'normal',
  }

  if (slot.area === 'bottom') {
    const top = containerHeight - borderBottom + slot.anchor.y * borderBottom - fontPx * 0.5
    const left = slot.anchor.x * containerWidth
    const translateX = slot.align === 'center' ? '-50%' : slot.align === 'right' ? '-100%' : '0'
    return (
      <div style={{ ...common, top: `${top}px`, left: `${left}px`, transform: `translateX(${translateX})` }}>
        {text}
      </div>
    )
  }
  if (slot.area === 'right') {
    const anchorX = containerWidth - borderRight + slot.anchor.x * borderRight
    const anchorY = slot.anchor.y * containerHeight
    return (
      <div
        style={{
          ...common,
          top: `${anchorY}px`,
          left: `${anchorX}px`,
          transform: 'rotate(-90deg)', // CSS rotate 方向与 SVG 一致(书脊从下向上读)
          transformOrigin: '0 0',
        }}
      >
        {text}
      </div>
    )
  }
  return null
}
