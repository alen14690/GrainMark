import { DEFAULT_FRAME_SHOW_FIELDS, buildFrameParamLine } from '../../../../shared/frame-text'
/**
 * PolaroidClassicLayout · 经典宝丽来 CSS 预览
 *
 * 与 generators/polaroidClassic.ts 对应。
 *   - 四周纸白边框(CSS padding 来表达)
 *   - 底部三行文字堆叠:model 居中粗 + params 居中细 + date 右下橙红
 *   - Georgia 斜体 / JetBrains Mono / Courier New 三种字体呼应 SVG 端
 */
import { FONT_STACK, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import type { FrameContentSlot } from '../../../../shared/types'
import { thumbSrc } from '../../../lib/grainUrl'
import type { FrameLayoutProps } from '../FrameStyleRegistry'

export function PolaroidClassicLayout({
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
  const hasModelSlot = layout.slots.some((s) => s.id === 'model')
  const modelLine = [photo.exif.make, photo.exif.model].filter(Boolean).join(' ')
  const paramLine = buildFrameParamLine(photo.exif, showFields, { excludeModelMake: hasModelSlot })
  const dateLine = showFields.dateTime ? (photo.exif.dateTimeOriginal ?? '') : ''

  const modelSlot = layout.slots.find((s) => s.id === 'model')
  const paramsSlot = layout.slots.find((s) => s.id === 'params')
  const dateSlot = layout.slots.find((s) => s.id === 'date')

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
      {/* 照片本体 · 在白边之内 */}
      {photo.thumbPath && (
        <img
          src={thumbSrc(photo)}
          alt=""
          className="w-full h-full object-contain"
          style={{ backgroundColor: '#000' }}
        />
      )}
      {/* 底部三行文字 · absolute 到 padding 区域 */}
      {modelSlot && modelLine && (
        <SlotText
          slot={modelSlot}
          text={modelLine}
          layoutTextColor={layout.textColor}
          barTopPx={containerHeight - borderBottom}
          barHPx={borderBottom}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          italic={modelSlot.fontFamily === 'georgia'}
        />
      )}
      {paramsSlot && paramLine && (
        <SlotText
          slot={paramsSlot}
          text={paramLine}
          layoutTextColor={layout.textColor}
          barTopPx={containerHeight - borderBottom}
          barHPx={borderBottom}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
        />
      )}
      {dateSlot && dateLine && (
        <SlotText
          slot={dateSlot}
          text={dateLine}
          layoutTextColor={layout.textColor}
          barTopPx={containerHeight - borderBottom}
          barHPx={borderBottom}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
        />
      )}
    </div>
  )
}

/**
 * 渲染单个 slot 为绝对定位文字
 * —— 与 generator 端的 `renderSlotText` 语义对齐(anchor 相对 bar,
 * baselineY 加字号 0.35 补偿视觉居中)。
 */
function SlotText({
  slot,
  text,
  layoutTextColor,
  barTopPx,
  barHPx,
  containerWidth,
  containerHeight,
  italic,
}: {
  slot: FrameContentSlot
  text: string
  layoutTextColor: string
  barTopPx: number
  barHPx: number
  containerWidth: number
  containerHeight: number
  italic?: boolean
}) {
  const fontPx = scaleByMinEdge(slot.fontSize, containerWidth, containerHeight)
  const color = slot.colorOverride ?? layoutTextColor
  // anchor.y 归一化到 bar 区;CSS top 定位到 bar 内的 y 坐标(减去 0.5 倍字号做视觉居中)
  const top = barTopPx + slot.anchor.y * barHPx - fontPx * 0.5
  // anchor.x × containerWidth 得到字体基线 x;配合 transform 按 align 做水平对齐
  const left = slot.anchor.x * containerWidth
  const translateX = slot.align === 'center' ? '-50%' : slot.align === 'right' ? '-100%' : '0'
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
