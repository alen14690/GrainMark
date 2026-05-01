/**
 * Hairline · 画廊细线 SVG 生成器
 *
 * 设计(artifact/design/frame-system-2026-05-01.md · 组 A2):
 *   - 纸白底 + 图片周围 1.5% 处一根发丝线(hairlineStroke)
 *   - 右下角 softGray 小字参数
 *
 * 实现:
 *   - 外边框 2%,线画在 imgOffset + 1.5%×imgMinEdge 位置(4 个 <line>)
 *   - 小字 slot area='overlay',走 slotPlacement 的 overlay 分支
 */
import { COLOR, scaleByMinEdge } from '../../../../shared/frame-tokens.js'
import type { FrameContentSlot } from '../../../../shared/types.js'
import type { FrameSvgGenerator } from '../composite.js'
import { escSvgText } from '../typography.js'
import { renderSlotTextGeneric } from './slotPlacement.js'

export const generateHairline: FrameSvgGenerator = ({ geometry, paramLine, style }) => {
  const { canvasW, canvasH, imgOffsetX, imgOffsetY, imgH, layout } = geometry
  const bgFill = escSvgText(layout.backgroundColor)

  // 线距图片的偏移 · minEdge × 0.015(~45px on 3000 短边)
  const lineInset = scaleByMinEdge(0.015, geometry.imgW, geometry.imgH)
  const lineStroke = Math.max(scaleByMinEdge(0.0006, geometry.imgW, geometry.imgH), 1) // 极细 ~1-2px
  const lineColor = escSvgText(COLOR.hairlineStroke)

  // 四根线:上下左右各一根,距离图片 lineInset 像素
  const lineLeft = imgOffsetX - lineInset
  const lineRight = imgOffsetX + geometry.imgW + lineInset
  const lineTop = imgOffsetY - lineInset
  const lineBottom = imgOffsetY + imgH + lineInset

  const lines = [
    // top
    `<line x1="${lineLeft}" y1="${lineTop}" x2="${lineRight}" y2="${lineTop}" stroke="${lineColor}" stroke-width="${lineStroke}"/>`,
    // bottom
    `<line x1="${lineLeft}" y1="${lineBottom}" x2="${lineRight}" y2="${lineBottom}" stroke="${lineColor}" stroke-width="${lineStroke}"/>`,
    // left
    `<line x1="${lineLeft}" y1="${lineTop}" x2="${lineLeft}" y2="${lineBottom}" stroke="${lineColor}" stroke-width="${lineStroke}"/>`,
    // right
    `<line x1="${lineRight}" y1="${lineTop}" x2="${lineRight}" y2="${lineBottom}" stroke="${lineColor}" stroke-width="${lineStroke}"/>`,
  ]

  // 右下角小字(走 slotPlacement 的 overlay area)
  const textParts: string[] = []
  for (const slot of layout.slots) {
    const text = pickHairlineText(slot, { paramLine })
    if (!text) continue
    textParts.push(renderSlotTextGeneric(slot, text, geometry, layout))
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${bgFill}"/>
  ${lines.join('\n  ')}
  ${textParts.join('\n  ')}
</svg>`
}

function pickHairlineText(slot: FrameContentSlot, texts: { paramLine: string }): string {
  if (slot.id === 'params') return texts.paramLine
  return ''
}
