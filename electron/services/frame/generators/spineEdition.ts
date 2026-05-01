/**
 * Spine Edition · 书脊式 SVG 生成器
 *
 * 设计(artifact/design/frame-system-2026-05-01.md · 组 D3):
 *   - 横图:底部胶片黑粗带 10%(area='bottom')
 *     · 左侧 Georgia 白字机型 · 右侧橙红日期
 *   - 竖图:右侧胶片黑粗带 8%(area='right')
 *     · 竖排文字 · 机型靠底 · 日期靠顶(书脊惯例)
 *
 * 架构:
 *   - 共享 slotPlacement 的 renderSlotTextGeneric
 *   - 不在 generator 内判横竖,完全由 layout 数据的 slot.area 驱动
 */
import type { FrameContentSlot } from '../../../../shared/types.js'
import type { FrameSvgGenerator } from '../composite.js'
import { escSvgText } from '../typography.js'
import { renderSlotTextGeneric } from './slotPlacement.js'

const SPINE_ITALIC_FAMILIES = new Set<'georgia' | 'typewriter'>(['georgia'])

export const generateSpineEdition: FrameSvgGenerator = ({ geometry, modelLine, dateLine, style }) => {
  const { canvasW, canvasH, layout, orientation } = geometry
  const bgFill = escSvgText(layout.backgroundColor)

  // 书脊带:就是 layout.border* 已经处理的黑边 —— canvas 背景本身是 filmBlack,
  // 无需额外画 rect。不过为了明确语义,我们还是覆盖一层背景 rect 确保带区
  // 在 SVG 渲染上独立可见(composite 层后续叠原图,原图会遮住图片区,留下带区)
  const textParts: string[] = []
  for (const slot of layout.slots) {
    const text = pickSpineSlotText(slot, { modelLine, dateLine })
    if (!text) continue
    textParts.push(renderSlotTextGeneric(slot, text, geometry, layout, SPINE_ITALIC_FAMILIES))
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} orientation=${orientation} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${bgFill}"/>
  ${textParts.join('\n  ')}
</svg>`
}

/** slot.id → 文本(Spine 只用 model / date 两个 slot) */
function pickSpineSlotText(slot: FrameContentSlot, texts: { modelLine: string; dateLine: string }): string {
  if (slot.id === 'model') return texts.modelLine
  if (slot.id === 'date') return texts.dateLine
  return ''
}
