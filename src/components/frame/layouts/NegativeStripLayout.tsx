/**
 * NegativeStripLayout · 胶片负片条 CSS 预览(阶段 3 · 2026-05-01)
 *
 * 与 generators/negativeStrip.ts 对齐:
 *   - 横图:上下黑边 ledger(无齿孔) + 白字文字 + 左上角橙红 "24 →" 帧号戳
 *   - 竖图:左右黑边 ledger + 竖排文字 + 左上角橙红 "24 →"
 *
 * 实现策略:
 *   - 边框几何走 layout 数据(与 FilmFullBorder 相同的 paddingTop/Bottom/Left/Right)
 *   - 文字 slot 走 layout.slots(top/bottom/left/right 4 area)
 *   - overlay 帧号 "24 →" 固定字符 · 画面左上角 overlay
 *
 * 与 FilmFullBorderLayout 的差异:
 *   - FilmFullBorder:齿孔图案(backgroundImage SVG data URL)
 *   - NegativeStrip:纯黑边 · 但有帧号戳
 *   - 结构相似但装饰不同,分别各一个组件(AGENTS.md 第 8 条阈值=2 · 装饰差异 > 2 种
 *     时再提基类,本阶段 2 个装饰不值得抽象)
 */
import { COLOR, FONT_STACK, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import type { FrameContentSlot } from '../../../../shared/types'
import { thumbSrc } from '../../../lib/grainUrl'
import type { FrameLayoutProps } from '../FrameStyleRegistry'

const FRAME_NUMBER_LABEL = '24 →'

export function NegativeStripLayout({
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
  // params 行不用 buildFrameParamLine(那是 electron 路径);前端简化用 exif 直接拼
  const paramParts: string[] = []
  if (photo.exif.focalLength) paramParts.push(`${photo.exif.focalLength}mm`)
  if (photo.exif.fNumber) paramParts.push(`f/${photo.exif.fNumber}`)
  if (photo.exif.exposureTime) paramParts.push(photo.exif.exposureTime)
  if (photo.exif.iso) paramParts.push(`ISO ${photo.exif.iso}`)
  const paramLine = paramParts.join(' · ')

  // 帧号戳定位:overlay 在图像区左上角
  // 图像区 = 除去四边边框的内部矩形
  const imgAreaLeft = borderLeft
  const imgAreaTop = borderTop
  const imgAreaW = containerWidth - borderLeft - borderRight
  const imgAreaH = containerHeight - borderTop - borderBottom
  const frameLabelFontPx = scaleByMinEdge(0.024, containerWidth, containerHeight)
  const anchorX = orientation === 'portrait' ? 0.08 : 0.04
  const anchorY = orientation === 'portrait' ? 0.04 : 0.07
  const frameLabelLeft = imgAreaLeft + anchorX * imgAreaW
  const frameLabelTop = imgAreaTop + anchorY * imgAreaH

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

      {/* 文字 slot · 与 FilmFullBorderLayout 同构 */}
      {layout.slots.map((slot) => {
        const text = pickText(slot, { modelLine, paramLine, dateLine })
        if (!text) return null
        return (
          <StripSlot
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

      {/* 帧号戳 "24 →" · 橙红 · Courier 粗体 · 左上 */}
      <div
        style={{
          position: 'absolute',
          top: `${frameLabelTop}px`,
          left: `${frameLabelLeft}px`,
          color: COLOR.dateStampOrange,
          fontSize: `${frameLabelFontPx}px`,
          fontFamily: FONT_STACK.courier.css,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          lineHeight: 1,
        }}
      >
        {FRAME_NUMBER_LABEL}
      </div>
    </div>
  )
}

function pickText(
  slot: FrameContentSlot,
  texts: { modelLine: string; paramLine: string; dateLine: string },
): string {
  if (slot.id === 'model') return texts.modelLine
  if (slot.id === 'params') return texts.paramLine
  if (slot.id === 'date') return texts.dateLine
  return ''
}

function StripSlot({
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
