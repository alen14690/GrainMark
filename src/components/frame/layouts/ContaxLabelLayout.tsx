/**
 * ContaxLabelLayout · 铭牌致敬条 CSS 预览(阶段 3 · 2026-05-01)
 *
 * 与 generators/contaxLabel.ts 对齐:
 *   - 底部 10% 胶片黑条 · 左大字机型 · 右小字参数 · 中间橙红竖线
 *   - 通过 BottomTextLayout 复用底部文字布局(model + params 两 slot)
 *   - 叠加一根橙红竖线(canvasW × 0.5, borderBottom × 0.5 高)
 *
 * 与 EditorialCaptionLayout 的结构对称:
 *   - Editorial:BottomText + 水平细线
 *   - Contax:BottomText + 橙红竖线
 *
 * 装饰分散阈值(AGENTS.md 第 8 条):
 *   - 目前两个风格各自带一种装饰线(Editorial 横细线 · Contax 竖橙线)
 *   - 都走"BottomText + 独立装饰层"的组合模式,代码结构对齐,无需提取基类
 */
import { COLOR, classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import type { FrameLayoutProps } from '../FrameStyleRegistry'
import { BottomTextLayout } from './BottomTextLayout'

export function ContaxLabelLayout(props: FrameLayoutProps) {
  const { photo, style, containerWidth, containerHeight } = props
  const orientation = classifyOrientation(photo.width, photo.height)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  const borderBottom = scaleByMinEdge(layout.borderBottom, containerWidth, containerHeight)
  // 橙红竖线:x = containerW × 0.5,高度 = borderBottom × 0.5(视觉上约带 1/2)
  const lineX = containerWidth * 0.5
  const lineH = borderBottom * 0.5
  const lineY0 = containerHeight - borderBottom + (borderBottom - lineH) / 2
  const lineStroke = Math.max(scaleByMinEdge(0.003, containerWidth, containerHeight), 2)

  return (
    <div className="relative w-full h-full">
      <BottomTextLayout {...props} />
      {borderBottom > 0 && (
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
      )}
    </div>
  )
}
