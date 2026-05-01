/**
 * ContaxLabelLayout · 铭牌致敬条 CSS 预览(阶段 3 · 2026-05-01 · 竖图优化)
 *
 * 与 generators/contaxLabel.ts 对齐:
 *   - 横图:底部黑条 · 左 model 右 params · 中间橙红竖线
 *   - 竖图:底部黑条(14%) · 两行堆叠 model + params · 左侧短水平橙红线分隔
 *
 * 装饰几何按 orientation 分派(layout.slots 数据已处理文字位置,
 * 本组件只负责"橙红分隔线"这一条装饰线 · 与 generator 行为对齐)。
 */
import { COLOR, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import type { FrameLayoutProps } from '../FrameStyleRegistry'
import { BottomTextLayout } from './BottomTextLayout'

export function ContaxLabelLayout(props: FrameLayoutProps) {
  const { photo, style, containerWidth, containerHeight } = props
  const orientation = classifyOrientation(photo.width, photo.height)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  const borderBottom = scaleByMinEdge(layout.borderBottom, containerWidth, containerHeight)
  const lineStroke = Math.max(scaleByMinEdge(0.003, containerWidth, containerHeight), 2)

  return (
    <div className="relative w-full h-full">
      <BottomTextLayout {...props} />
      {borderBottom > 0 &&
        (orientation === 'portrait' ? (
          <PortraitAccentLine
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            borderBottom={borderBottom}
            lineStroke={lineStroke}
          />
        ) : (
          <LandscapeAccentLine
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            borderBottom={borderBottom}
            lineStroke={lineStroke}
          />
        ))}
    </div>
  )
}

/** 横图:橙红竖线 · canvas 水平 50% · 高度占底条 50% */
function LandscapeAccentLine({
  containerWidth,
  containerHeight,
  borderBottom,
  lineStroke,
}: {
  containerWidth: number
  containerHeight: number
  borderBottom: number
  lineStroke: number
}) {
  const lineX = containerWidth * 0.5
  const lineH = borderBottom * 0.5
  const lineY0 = containerHeight - borderBottom + (borderBottom - lineH) / 2
  return (
    <div
      style={{
        position: 'absolute',
        top: `${lineY0}px`,
        left: `${lineX - lineStroke / 2}px`,
        width: `${lineStroke}px`,
        height: `${lineH}px`,
        backgroundColor: COLOR.dateStampOrange,
        borderRadius: `${lineStroke}px`,
        pointerEvents: 'none',
      }}
    />
  )
}

/** 竖图:短水平橙红线 · 底条垂直中线 · x 起点 6%(与 model/params 对齐) · 宽 18% */
function PortraitAccentLine({
  containerWidth,
  containerHeight,
  borderBottom,
  lineStroke,
}: {
  containerWidth: number
  containerHeight: number
  borderBottom: number
  lineStroke: number
}) {
  const lineY = containerHeight - borderBottom + borderBottom * 0.5
  const lineX0 = containerWidth * 0.06
  const lineW = containerWidth * 0.18
  return (
    <div
      style={{
        position: 'absolute',
        top: `${lineY - lineStroke / 2}px`,
        left: `${lineX0}px`,
        width: `${lineW}px`,
        height: `${lineStroke}px`,
        backgroundColor: COLOR.dateStampOrange,
        borderRadius: `${lineStroke}px`,
        pointerEvents: 'none',
      }}
    />
  )
}
