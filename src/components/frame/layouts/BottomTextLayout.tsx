import { DEFAULT_FRAME_SHOW_FIELDS, buildFrameParamLine } from '../../../../shared/frame-text'
/**
 * BottomTextLayout · 通用底部多行文字风格前端预览
 *
 * 适用风格:Polaroid Classic / Gallery Black / Gallery White / Editorial Caption
 * 与 electron 侧 generators/bottomTextGenerator.ts 一一对应,保证双端视觉对齐。
 *
 * 前端 vs 后端共享点:
 *   - 都按 layout.slots(area='bottom')渲染文字
 *   - slot.anchor.y 归一化到 borderBottomPx
 *   - Georgia 字体族自动 italic
 *   - 字号 scaleByMinEdge(slot.fontSize, container)
 *
 * Polaroid Classic 之前已经有单独的 PolaroidClassicLayout.tsx,本组件不接管它
 * (本 commit 只加 Gallery/Editorial 用;Polaroid 的独立实现保持不动,避免
 * 回归风险;后续阶段可考虑统一)。
 */
import { FONT_STACK, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import type { FrameContentSlot } from '../../../../shared/types'
import { thumbSrc } from '../../../lib/grainUrl'
import type { FrameLayoutProps } from '../FrameStyleRegistry'

export function BottomTextLayout({
  photo,
  style,
  overrides,
  containerWidth,
  containerHeight,
}: FrameLayoutProps) {
  const orientation = classifyOrientation(photo.width, photo.height)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  const borderTop = scaleByMinEdge(layout.borderTop, containerWidth, containerHeight)
  const borderBottom = scaleByMinEdge(layout.borderBottom, containerWidth, containerHeight)
  const borderLeft = scaleByMinEdge(layout.borderLeft, containerWidth, containerHeight)
  const borderRight = scaleByMinEdge(layout.borderRight, containerWidth, containerHeight)

  const showFields = overrides.showFields ?? DEFAULT_FRAME_SHOW_FIELDS
  const modelLine = [photo.exif.make, photo.exif.model].filter(Boolean).join(' ')
  const paramLine = buildFrameParamLine(photo.exif, showFields)
  const dateLine = showFields.dateTime ? (photo.exif.dateTimeOriginal ?? '') : ''
  const artistLine = showFields.artist ? (overrides.artistName ?? photo.exif.artist ?? '') : ''

  const bottomSlots = layout.slots.filter((s) => s.area === 'bottom')

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
      {bottomSlots.map((slot) => {
        const text = pickText(slot, { modelLine, paramLine, dateLine, artistLine })
        if (!text) return null
        return (
          <SlotText
            key={`${slot.id}-${slot.area}`}
            slot={slot}
            text={text}
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            barTopPx={containerHeight - borderBottom}
            barHPx={borderBottom}
            layoutTextColor={layout.textColor}
          />
        )
      })}
    </div>
  )
}

function pickText(
  slot: FrameContentSlot,
  texts: { modelLine: string; paramLine: string; dateLine: string; artistLine: string },
): string {
  if (slot.id === 'model') return texts.modelLine
  if (slot.id === 'params') return texts.paramLine
  if (slot.id === 'date') return texts.dateLine
  if (slot.id === 'artist') return texts.artistLine
  return ''
}

function SlotText({
  slot,
  text,
  containerWidth,
  containerHeight,
  barTopPx,
  barHPx,
  layoutTextColor,
}: {
  slot: FrameContentSlot
  text: string
  containerWidth: number
  containerHeight: number
  barTopPx: number
  barHPx: number
  layoutTextColor: string
}) {
  const fontPx = scaleByMinEdge(slot.fontSize, containerWidth, containerHeight)
  const color = slot.colorOverride ?? layoutTextColor
  const top = barTopPx + slot.anchor.y * barHPx - fontPx * 0.5
  const left = slot.anchor.x * containerWidth
  const translateX = slot.align === 'center' ? '-50%' : slot.align === 'right' ? '-100%' : '0'
  const italic = slot.fontFamily === 'georgia' || slot.fontFamily === 'typewriter'
  return (
    <div
      style={{
        position: 'absolute',
        top: `${top}px`,
        left: `${left}px`,
        transform: `translateX(${translateX})`,
        color,
        fontSize: `${fontPx}px`,
        fontFamily: FONT_STACK[slot.fontFamily].css,
        fontStyle: italic ? 'italic' : 'normal',
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}
    >
      {text}
    </div>
  )
}
