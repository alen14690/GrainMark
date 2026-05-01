/**
 * Sx70SquareLayout · 方宝丽来 CSS 预览(阶段 3 · 2026-05-01)
 *
 * 与 BottomTextLayout 结构一致(底部三行文字),但多了"非方形填充 filmBlack"
 * 的视觉兜底,与 generators/sx70Square.ts 一一对齐。
 *
 * 实现:
 *   - 先渲染 BottomTextLayout(自动拿到四边白框 + 底部文字)
 *   - 在图片区覆盖层上画 filmBlack 填充带(非方形时)
 *     · 横图:左右各填 (containerW - squareSide) / 2 宽的黑带
 *     · 竖图:上下各填 (containerH - squareSide) / 2 高的黑带
 *   - 这些填充带只覆盖 img 可视区(不遮白边),所以用 absolute 定位在 padding 内
 *
 * 与 Polaroid Classic 的差异(两者都是白底宝丽来):
 *   - Polaroid Classic:Georgia italic 手写感 · 长方形
 *   - SX-70 Square:Courier 老打字机 · 方形画面(非方形图也强制裁出方框)
 */
import { COLOR, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import type { FrameLayoutProps } from '../FrameStyleRegistry'
import { BottomTextLayout } from './BottomTextLayout'

export function Sx70SquareLayout(props: FrameLayoutProps) {
  const { photo, style, containerWidth, containerHeight } = props
  const orientation = classifyOrientation(photo.width, photo.height)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  const borderTop = scaleByMinEdge(layout.borderTop, containerWidth, containerHeight)
  const borderBottom = scaleByMinEdge(layout.borderBottom, containerWidth, containerHeight)
  const borderLeft = scaleByMinEdge(layout.borderLeft, containerWidth, containerHeight)
  const borderRight = scaleByMinEdge(layout.borderRight, containerWidth, containerHeight)

  // 图像可视区尺寸(在白边内)
  const imgAreaW = containerWidth - borderLeft - borderRight
  const imgAreaH = containerHeight - borderTop - borderBottom

  // 非方形:按照片真实 aspect 算"画面方框"在 img area 里应居中的黑带位置
  //   照片是 horizontal 时,object-contain 把照片塞到 img area 上下,左右留白(天然露出白底)
  //   但 SX-70 的视觉契约是"非方形 → 用 filmBlack 填充不足的那一边",不是白底
  //   所以在图像区用黑带覆盖 object-contain 本来会露白的区域
  const photoAspect = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1
  const areaAspect = imgAreaW > 0 && imgAreaH > 0 ? imgAreaW / imgAreaH : 1

  const fillerBands: Array<{
    top: number
    left: number
    width: number
    height: number
    key: string
  }> = []
  // object-contain 下,photo 会按自己的 aspect 适配进 imgArea;
  //   photoAspect > areaAspect:图横,上下留白
  //   photoAspect < areaAspect:图竖,左右留白
  if (Math.abs(photoAspect - areaAspect) > 0.01) {
    if (photoAspect > areaAspect) {
      // 上下留白 → 上下填 filmBlack
      const actualImgH = imgAreaW / photoAspect
      const band = Math.max((imgAreaH - actualImgH) / 2, 0)
      if (band > 0) {
        fillerBands.push(
          { top: borderTop, left: borderLeft, width: imgAreaW, height: band, key: 'fill-top' },
          {
            top: borderTop + imgAreaH - band,
            left: borderLeft,
            width: imgAreaW,
            height: band,
            key: 'fill-bottom',
          },
        )
      }
    } else {
      // 左右留白 → 左右填 filmBlack
      const actualImgW = imgAreaH * photoAspect
      const band = Math.max((imgAreaW - actualImgW) / 2, 0)
      if (band > 0) {
        fillerBands.push(
          { top: borderTop, left: borderLeft, width: band, height: imgAreaH, key: 'fill-left' },
          {
            top: borderTop,
            left: borderLeft + imgAreaW - band,
            width: band,
            height: imgAreaH,
            key: 'fill-right',
          },
        )
      }
    }
  }

  return (
    <div className="relative w-full h-full">
      <BottomTextLayout {...props} />
      {fillerBands.map((b) => (
        <div
          key={b.key}
          style={{
            position: 'absolute',
            top: `${b.top}px`,
            left: `${b.left}px`,
            width: `${b.width}px`,
            height: `${b.height}px`,
            backgroundColor: COLOR.filmBlack,
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  )
}
