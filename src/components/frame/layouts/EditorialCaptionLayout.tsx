/**
 * EditorialCaptionLayout · 卡片新闻 CSS 预览
 *
 * 在 BottomTextLayout 的基础上加一条极细水平分隔线(bottom 区域顶部),
 * 对应 generators/bottomTextGenerator.ts 的 topSeparator:true 效果。
 *
 * 架构决策:
 *   - 没有在 BottomTextLayout 内部通过 style.id 硬判分派(那样散布)
 *   - 也没有给 FrameLayout 类型加 "separator" 字段(data model 耦合)
 *   - 而是用组件组合:EditorialCaptionLayout = BottomTextLayout + 一层分隔线装饰
 *   · 阶段 3 若出现 >2 种需要装饰的风格,再考虑数据层抽象
 */
import { classifyOrientation, scaleByMinEdge } from '../../../../shared/frame-tokens'
import type { FrameLayoutProps } from '../FrameStyleRegistry'
import { BottomTextLayout } from './BottomTextLayout'

export function EditorialCaptionLayout(props: FrameLayoutProps) {
  const { photo, style, containerWidth, containerHeight } = props
  const orientation = classifyOrientation(photo.width, photo.height)
  const layout = orientation === 'portrait' ? style.portrait : style.landscape

  const borderBottom = scaleByMinEdge(layout.borderBottom, containerWidth, containerHeight)
  // 分隔线粗度 · 与 generator 的 scaleByMinEdge(0.001) 完全对齐
  const sepStroke = Math.max(scaleByMinEdge(0.001, containerWidth, containerHeight), 1)
  // 分隔线 y 位置:bottom 区顶部加 8%(与 generator 的 barTop + barH*0.08 对齐)
  const sepY = containerHeight - borderBottom + borderBottom * 0.08
  const sepColor = layout.textColor

  return (
    <div className="relative w-full h-full">
      <BottomTextLayout {...props} />
      {/* 分隔线叠加层(pointer-events:none 不阻塞事件) */}
      {borderBottom > 0 && (
        <div
          style={{
            position: 'absolute',
            top: `${sepY}px`,
            left: `${containerWidth * 0.05}px`,
            width: `${containerWidth * 0.9}px`,
            height: `${sepStroke}px`,
            backgroundColor: sepColor,
            opacity: 0.3,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}
