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
 * 2026-05-01 修订:
 *   - 参数行去重:有 model slot → buildFrameParamLine 的 excludeModelMake=true
 *     避免 "SONY · ILCE-7SM3 · FE 70-200mm..."(model 和主标题重复)
 *   - 默认关闭 dateTime slot(用户反馈"拍摄时间不要了")
 *   - 加 max-width + text-overflow:ellipsis · 防参数过长溢出盒子(截图反馈场景)
 *
 * Polaroid Classic 有单独组件,本组件不接管;Gallery / Editorial 共享本组件。
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
  photoSrcOverride,
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
      {(photoSrcOverride || photo.thumbPath) && (
        <img
          src={photoSrcOverride ?? thumbSrc(photo)}
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

  // 计算可用宽度(从 anchor 点到盒子边,按 align 方向;留 4% 安全边距避免贴边)
  //   align=left:从 anchor.x 到盒子右边
  //   align=right:从盒子左边到 anchor.x
  //   align=center:取左右较短距离的 2 倍(对称可用宽度)
  const safetyMargin = containerWidth * 0.04
  let maxW: number
  if (slot.align === 'left') {
    maxW = containerWidth - left - safetyMargin
  } else if (slot.align === 'right') {
    maxW = left - safetyMargin
  } else {
    maxW = Math.min(left, containerWidth - left) * 2 - safetyMargin
  }
  maxW = Math.max(maxW, 40) // 至少 40px 避免退化为 0

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
        maxWidth: `${maxW}px`,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {text}
    </div>
  )
}
