import { DEFAULT_FRAME_SHOW_FIELDS, buildFrameParamLine } from '../../../../shared/frame-text'
/**
 * FilmFullBorderLayout · 135 全齿孔 CSS 预览
 *
 * 与 generators/filmFullBorder.ts 对应:
 *   - 横图:上下黑边 + 齿孔
 *   - 竖图:左右黑边 + 齿孔(方向切换,由 FrameLayout 数据驱动)
 *   - 齿孔 CSS 实现:用 linear-gradient 做 "白块-黑-白块-黑" 的重复图案
 *     · 比 SVG 背景简单,且能和 Sharp 端的 SVG pattern 视觉对齐
 */
import { FONT_STACK, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import type { FrameContentSlot } from '../../../../shared/types'
import { thumbSrc } from '../../../lib/grainUrl'
import type { FrameLayoutProps } from '../FrameStyleRegistry'

export function FilmFullBorderLayout({
  photo,
  style,
  overrides,
  containerWidth,
  containerHeight,
  photoSrcOverride,
}: FrameLayoutProps) {
  const orientation = classifyOrientation(photo.width, photo.height)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  const borderTop = scaleByMinEdge(layout.borderTop, containerWidth, containerHeight)
  const borderBottom = scaleByMinEdge(layout.borderBottom, containerWidth, containerHeight)
  const borderLeft = scaleByMinEdge(layout.borderLeft, containerWidth, containerHeight)
  const borderRight = scaleByMinEdge(layout.borderRight, containerWidth, containerHeight)

  const perfUnit = Math.max(scaleByMinEdge(0.02, containerWidth, containerHeight), 4)
  const perfH = Math.round(perfUnit * 0.5)

  // 齿孔图案:水平(横图)或竖直(竖图)方向排列
  //   横图上下边的齿孔横向平铺 —— backgroundSize: `${perfUnit}px 100%`
  //   竖图左右边的齿孔纵向平铺 —— backgroundSize: `100% ${perfUnit}px`
  const isPortraitBorder = orientation === 'portrait'
  const perfBgH = isPortraitBorder ? `${perfUnit}px` : `${perfH}px`
  const perfBgW = isPortraitBorder ? `${perfH}px` : `${perfUnit}px`

  // 齿孔:白色小方块,在黑底上居中
  const perfSvg = `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${perfUnit}' height='${perfUnit}'><rect x='${Math.round(perfUnit * 0.15)}' y='${Math.round((perfUnit - perfH) / 2)}' width='${Math.round(perfUnit * 0.7)}' height='${perfH}' rx='${Math.round(perfH * 0.3)}' fill='${layout.textColor}' opacity='0.9'/></svg>`,
  )}")`

  const showFields = overrides.showFields ?? DEFAULT_FRAME_SHOW_FIELDS
  const hasModelSlot = layout.slots.some((s) => s.id === 'model')
  const modelLine = [photo.exif.make, photo.exif.model].filter(Boolean).join(' ')
  const paramLine = buildFrameParamLine(photo.exif, showFields, { excludeModelMake: hasModelSlot })
  const dateLine = showFields.dateTime ? (photo.exif.dateTimeOriginal ?? '') : ''

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
      {/* 照片 */}
      {(photoSrcOverride || photo.thumbPath) && (
        <img src={photoSrcOverride ?? thumbSrc(photo)} alt="" className="w-full h-full object-contain" />
      )}

      {/* 齿孔 · 横图上下;竖图左右 */}
      {borderTop > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${borderTop}px`,
            backgroundImage: perfSvg,
            backgroundRepeat: 'repeat-x',
            backgroundSize: `${perfBgW} ${perfBgH}`,
            backgroundPosition: 'center',
          }}
        />
      )}
      {borderBottom > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: `${borderBottom}px`,
            backgroundImage: perfSvg,
            backgroundRepeat: 'repeat-x',
            backgroundSize: `${perfBgW} ${perfBgH}`,
            backgroundPosition: 'center',
          }}
        />
      )}
      {borderLeft > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${borderLeft}px`,
            height: '100%',
            backgroundImage: perfSvg,
            backgroundRepeat: 'repeat-y',
            backgroundSize: `${perfBgW} ${perfBgH}`,
            backgroundPosition: 'center',
          }}
        />
      )}
      {borderRight > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: `${borderRight}px`,
            height: '100%',
            backgroundImage: perfSvg,
            backgroundRepeat: 'repeat-y',
            backgroundSize: `${perfBgW} ${perfBgH}`,
            backgroundPosition: 'center',
          }}
        />
      )}

      {/* 文字 slot · 横图走 top/bottom,竖图走 left/right(由 layout 数据决定) */}
      {layout.slots.map((slot) => {
        const text = pickSlotText(slot, { modelLine, paramLine, dateLine })
        if (!text) return null
        return (
          <SlotText
            key={`${slot.id}-${slot.area}`}
            slot={slot}
            text={text}
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            borderTop={borderTop}
            borderBottom={borderBottom}
            borderLeft={borderLeft}
            borderRight={borderRight}
            layoutTextColor={layout.textColor}
          />
        )
      })}
    </div>
  )
}

function pickSlotText(
  slot: FrameContentSlot,
  texts: { modelLine: string; paramLine: string; dateLine: string },
): string {
  if (slot.id === 'model') return texts.modelLine
  if (slot.id === 'params') return texts.paramLine
  if (slot.id === 'date') return texts.dateLine
  return ''
}

function SlotText({
  slot,
  text,
  containerWidth,
  containerHeight,
  borderTop,
  borderBottom,
  borderLeft,
  borderRight,
  layoutTextColor,
}: {
  slot: FrameContentSlot
  text: string
  containerWidth: number
  containerHeight: number
  borderTop: number
  borderBottom: number
  borderLeft: number
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
    // 在齿孔上面,但不挡图
    mixBlendMode: 'difference' as const,
  }

  if (slot.area === 'top') {
    const top = slot.anchor.y * borderTop - fontPx * 0.5
    const left = slot.anchor.x * containerWidth
    const translateX = slot.align === 'center' ? '-50%' : slot.align === 'right' ? '-100%' : '0'
    return (
      <div style={{ ...common, top: `${top}px`, left: `${left}px`, transform: `translateX(${translateX})` }}>
        {text}
      </div>
    )
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
  if (slot.area === 'left') {
    // 竖排:origin 在 (anchorX, anchorY),rotate(-90deg) 让字沿边
    const anchorX = slot.anchor.x * borderLeft
    const anchorY = slot.anchor.y * containerHeight
    return (
      <div
        style={{
          ...common,
          top: `${anchorY}px`,
          left: `${anchorX}px`,
          transform: 'rotate(-90deg)',
          transformOrigin: '0 0',
        }}
      >
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
          transform: 'rotate(90deg)',
          transformOrigin: '0 0',
        }}
      >
        {text}
      </div>
    )
  }
  return null
}
