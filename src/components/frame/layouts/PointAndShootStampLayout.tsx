/**
 * PointAndShootStampLayout · 傻瓜机日期戳 CSS 预览(阶段 3 · 2026-05-01)
 *
 * 与 generators/pointAndShootStamp.ts 对齐:
 *   - 图片零边框 · 占满容器
 *   - 右下角 overlay 橙红 Courier 粗体日期戳
 *   - 通过 textShadow 模拟 SVG 双层 <text> 的"发光"效果(CSS 等价实现)
 *
 * 无边框风格最简单:
 *   - 不需要 padding(四边 0)
 *   - 不需要 slot 遍历(只有一个 date slot,直接取)
 *   - 不需要复杂分支(无横竖差异)
 */
import { COLOR, FONT_STACK, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import { thumbSrc } from '../../../lib/grainUrl'
import type { FrameLayoutProps } from '../FrameStyleRegistry'

/** 无 EXIF 日期时的复古占位 —— '98 11 24 风 */
function buildFallbackStamp(): string {
  const d = new Date()
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `'${yy} ${mm} ${dd}`
}

export function PointAndShootStampLayout({
  photo,
  style,
  overrides,
  containerWidth,
  containerHeight,
}: FrameLayoutProps) {
  const orientation = classifyOrientation(photo.width, photo.height)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  const dateSlot = layout.slots.find((s) => s.id === 'date')
  const showDate = overrides.showFields?.dateTime !== false
  const rawDate = photo.exif.dateTimeOriginal ?? ''
  const stampText = showDate ? rawDate || buildFallbackStamp() : ''

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor: '#000' }}
      data-frame-style-id={style.id}
      data-frame-orientation={orientation}
    >
      {photo.thumbPath && <img src={thumbSrc(photo)} alt="" className="w-full h-full object-contain" />}
      {dateSlot && stampText && (
        <div
          style={{
            position: 'absolute',
            right: `${(1 - dateSlot.anchor.x) * containerWidth}px`,
            bottom: `${(1 - dateSlot.anchor.y) * containerHeight}px`,
            color: dateSlot.colorOverride ?? COLOR.dateStampOrange,
            fontSize: `${scaleByMinEdge(dateSlot.fontSize, containerWidth, containerHeight)}px`,
            fontFamily: FONT_STACK.courier.css,
            fontWeight: 700,
            // 发光:CSS textShadow 模拟 SVG 的两层 text 叠加
            textShadow: `0 0 4px ${COLOR.dateStampOrange}99, 0 0 8px ${COLOR.dateStampOrange}55`,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            lineHeight: 1,
          }}
        >
          {stampText}
        </div>
      )}
    </div>
  )
}
