import { DEFAULT_FRAME_SHOW_FIELDS, buildFrameParamLine } from '../../../../shared/frame-text'
import { FONT_STACK, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
/**
 * MinimalBarLayout · 极简底栏 CSS 预览
 *
 * 设计与 generators/minimalBar.ts 严格对应 —— 同一份 FrameLayout 数据驱动,
 * 同一套 scaleByMinEdge 比例计算。前端预览必须与 Sharp 实渲像素级对齐,
 * 否则用户在预览里看到的和导出的会不一致(AGENTS.md 第 7 条 UI 证据链)。
 *
 * 2026-05-01 专业竖图重设计:
 *   - 横图:params + date 左右分置(一行)
 *   - 竖图:**三行堆叠** —— model 独占第 1 行(大字左对齐) · params + date 同第 2 行左右分置
 *     这是为了给竖图底栏 20% 足够视觉分量,不再像"压条"
 *   - 通过 layout.slots 的 model/params/date 存在性分派渲染模式,不散布 if(imgW > imgH)
 */
import type { FrameContentSlot } from '../../../../shared/types'
import { thumbSrc } from '../../../lib/grainUrl'
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

  const barH = scaleByMinEdge(layout.borderBottom, containerWidth, containerHeight)

  // slots 按 id 查找(由 layout 数据驱动 · 横竖差异仅在 slots 构成不同)
  const modelSlot = layout.slots.find((s) => s.id === 'model')
  const paramsSlot = layout.slots.find((s) => s.id === 'params')
  const dateSlot = layout.slots.find((s) => s.id === 'date')

  // 文本内容 · 统一走 shared/frame-text 的单源
  // 去重:有 model slot(竖图)→ 参数行跳过 make/model · 横图单行 params 不受影响
  const showFields = overrides.showFields ?? DEFAULT_FRAME_SHOW_FIELDS
  const hasModelSlot = layout.slots.some((s) => s.id === 'model')
  const modelLine = [photo.exif.make, photo.exif.model].filter(Boolean).join(' ')
  const paramLine = buildFrameParamLine(photo.exif, showFields, { excludeModelMake: hasModelSlot })
  const dateLine = showFields.dateTime ? (photo.exif.dateTimeOriginal ?? '') : ''

  const bg = layout.backgroundColor

  return (
    <div
      className="relative w-full h-full flex flex-col"
      data-frame-style-id={style.id}
      data-frame-orientation={orientation}
    >
      {/* 照片本体 · 占据上部 · flex-1 让底栏贴底 */}
      {photo.thumbPath && (
        <img src={thumbSrc(photo)} alt="" className="flex-1 min-h-0 w-full object-contain bg-bg-0" />
      )}
      {/* 底栏容器 */}
      <div
        className="relative flex-shrink-0"
        style={{
          height: `${barH}px`,
          backgroundColor: bg,
        }}
      >
        {/* 渲染所有 slot · 按 slot.anchor 在底栏区内绝对定位 */}
        {modelSlot && modelLine && (
          <AbsSlot
            slot={modelSlot}
            text={modelLine}
            layoutTextColor={layout.textColor}
            barH={barH}
            containerWidth={containerWidth}
            containerHeight={containerHeight}
          />
        )}
        {paramsSlot && paramLine && (
          <AbsSlot
            slot={paramsSlot}
            text={paramLine}
            layoutTextColor={layout.textColor}
            barH={barH}
            containerWidth={containerWidth}
            containerHeight={containerHeight}
          />
        )}
        {dateSlot && dateLine && (
          <AbsSlot
            slot={dateSlot}
            text={dateLine}
            layoutTextColor={layout.textColor}
            barH={barH}
            containerWidth={containerWidth}
            containerHeight={containerHeight}
          />
        )}
      </div>
    </div>
  )
}

/**
 * 在底栏区内按 slot.anchor 绝对定位文字。
 *
 * slot.anchor 归一化:x 相对底栏宽 · y 相对底栏高
 * align:left=起点对齐 / center=-50% / right=-100%
 * 视觉居中补偿:top 减去字号的 0.5 倍
 */
function AbsSlot({
  slot,
  text,
  layoutTextColor,
  barH,
  containerWidth,
  containerHeight,
}: {
  slot: FrameContentSlot
  text: string
  layoutTextColor: string
  barH: number
  containerWidth: number
  containerHeight: number
}) {
  const fontPx = scaleByMinEdge(slot.fontSize, containerWidth, containerHeight)
  const color = slot.colorOverride ?? layoutTextColor
  const top = slot.anchor.y * barH - fontPx * 0.5
  const left = slot.anchor.x * containerWidth
  const translateX = slot.align === 'center' ? '-50%' : slot.align === 'right' ? '-100%' : '0'

  // 按 align 计算"从 anchor 到盒子边"的可用宽度 · 留 4% 安全边距
  //   left:从 anchor.x 到右边;right:从左边到 anchor.x;center:左右较短的 2 倍
  const safety = containerWidth * 0.04
  let maxW: number
  if (slot.align === 'left') {
    maxW = containerWidth - left - safety
  } else if (slot.align === 'right') {
    maxW = left - safety
  } else {
    maxW = Math.min(left, containerWidth - left) * 2 - safety
  }
  maxW = Math.max(maxW, 40)

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
