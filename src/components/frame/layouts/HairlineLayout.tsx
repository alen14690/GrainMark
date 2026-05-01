import { DEFAULT_FRAME_SHOW_FIELDS, buildFrameParamLine } from '../../../../shared/frame-text'
/**
 * HairlineLayout · 画廊细线 CSS 预览
 *
 * 在 BottomTextLayout 结构的基础上:
 *   - 容器背景纸白 + 4 根 1.5% 距图片的细线
 *   - 右下角 overlay 小字(absolute 定位在 img 右下)
 *
 * 线用 4 个 div border 实现,够简单 · 和 SVG generator 对齐。
 */
import { FONT_STACK, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import { COLOR } from '../../../../shared/frame-tokens'
import { thumbSrc } from '../../../lib/grainUrl'
import type { FrameLayoutProps } from '../FrameStyleRegistry'

export function HairlineLayout({
  photo,
  style,
  overrides,
  containerWidth,
  containerHeight,
}: FrameLayoutProps) {
  const orientation = classifyOrientation(photo.width, photo.height)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  const pad = scaleByMinEdge(layout.borderTop, containerWidth, containerHeight) // 四边等薄
  const lineInset = scaleByMinEdge(0.015, containerWidth, containerHeight)
  const lineStroke = Math.max(scaleByMinEdge(0.0006, containerWidth, containerHeight), 1)

  const showFields = overrides.showFields ?? DEFAULT_FRAME_SHOW_FIELDS
  const paramLine = buildFrameParamLine(photo.exif, showFields)

  const paramsSlot = layout.slots.find((s) => s.id === 'params')
  const paramsFontPx = paramsSlot ? scaleByMinEdge(paramsSlot.fontSize, containerWidth, containerHeight) : 10

  // 图片外接矩形(在 padding 内)
  const imgBox = {
    top: pad,
    left: pad,
    right: pad,
    bottom: pad,
  }

  // 细线矩形(在图片外 lineInset 像素处)
  const lineBox = {
    top: imgBox.top - lineInset,
    left: imgBox.left - lineInset,
    right: imgBox.right - lineInset,
    bottom: imgBox.bottom - lineInset,
  }

  return (
    <div
      className="relative w-full h-full"
      style={{
        backgroundColor: layout.backgroundColor,
        padding: `${pad}px`,
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

      {/* 4 根细线(在图片外 lineInset 处) · 用 absolute + 1px border 简单实现 */}
      <div
        style={{
          position: 'absolute',
          top: `${lineBox.top}px`,
          left: `${lineBox.left}px`,
          right: `${lineBox.right}px`,
          bottom: `${lineBox.bottom}px`,
          border: `${lineStroke}px solid ${COLOR.hairlineStroke}`,
          pointerEvents: 'none',
        }}
      />

      {/* 右下角小字(overlay 在原图内) */}
      {paramsSlot && paramLine && (
        <div
          style={{
            position: 'absolute',
            bottom: `${pad + (1 - paramsSlot.anchor.y) * (containerHeight - pad * 2)}px`,
            right: `${pad + (1 - paramsSlot.anchor.x) * (containerWidth - pad * 2)}px`,
            color: paramsSlot.colorOverride ?? layout.textColor,
            fontSize: `${paramsFontPx}px`,
            fontFamily: FONT_STACK[paramsSlot.fontFamily].css,
            whiteSpace: 'nowrap',
            lineHeight: 1.2,
          }}
        >
          {paramLine}
        </div>
      )}
    </div>
  )
}
