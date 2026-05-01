/**
 * Polaroid Classic · 经典宝丽来 SVG 生成器
 *
 * 设计(artifact/design/frame-system-2026-05-01.md · 组 C1):
 *   - 四周纸白 #F8F5EE,左右上 4%,底部 22%(横)/ 18%(竖)
 *   - 底部三行堆叠:
 *     · model 居中大字(Georgia 衬线,致敬宝丽来手写感)
 *     · params 居中小字 softGray(参数二级信息)
 *     · date 右下角橙红色小字(CanoDate 风)
 *
 * 布局算法:
 *   - slot 的 anchor.y ∈ [0, 1] 相对于底部边框区域
 *   - 0.45 / 0.78 / 0.92 分别对应"垂直 45% / 78% / 92%"的视觉位置
 *   - SVG text 的 y 要在 anchor.y 基础上加字号的 0.35 倍(视觉居中补偿)
 */
import { scaleByMinEdge } from '../../../../shared/frame-tokens.js'
import type { FrameContentSlot, FrameLayout } from '../../../../shared/types.js'
import type { FrameSvgGenerator } from '../composite.js'
import type { FrameGeometry } from '../layoutEngine.js'
import { alignToSvgAnchor, escSvgText, resolveSvgFontStack } from '../typography.js'

export const generatePolaroidClassic: FrameSvgGenerator = ({
  geometry,
  paramLine,
  modelLine,
  dateLine,
  style,
}) => {
  const { canvasW, canvasH, imgOffsetY, imgH, borderBottomPx, layout } = geometry

  const barTop = imgOffsetY + imgH
  const barH = borderBottomPx

  const modelSlot = layout.slots.find((s) => s.id === 'model')
  const paramsSlot = layout.slots.find((s) => s.id === 'params')
  const dateSlot = layout.slots.find((s) => s.id === 'date')

  if (!modelSlot) {
    throw new Error('[polaroidClassic] layout 缺少 model slot —— registry 数据定义有误')
  }

  const bgFill = escSvgText(layout.backgroundColor)
  const textParts: string[] = []

  // 机型行(主视觉)
  textParts.push(renderSlotText(modelSlot, modelLine, barTop, barH, canvasW, geometry, layout))

  // 参数行(次要)
  if (paramsSlot && paramLine) {
    textParts.push(renderSlotText(paramsSlot, paramLine, barTop, barH, canvasW, geometry, layout))
  }

  // 日期行(橙红小字)
  if (dateSlot && dateLine) {
    textParts.push(renderSlotText(dateSlot, dateLine, barTop, barH, canvasW, geometry, layout))
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${bgFill}"/>
  ${textParts.join('\n  ')}
</svg>`
}

/**
 * 渲染单个文本 slot。
 *
 * 参数约束:slot.area 必须是 'bottom'(Polaroid 只在底部边框放文字)。
 * area=top/left/right/overlay 的情况由其它 generator 处理,不在这里分支。
 */
function renderSlotText(
  slot: FrameContentSlot,
  text: string,
  barTop: number,
  barH: number,
  canvasW: number,
  geometry: FrameGeometry,
  layout: FrameLayout,
): string {
  const fontPx = scaleByMinEdge(slot.fontSize, geometry.imgW, geometry.imgH)
  const baselineY = barTop + Math.round(slot.anchor.y * barH + fontPx * 0.35)
  const x = Math.round(slot.anchor.x * canvasW)
  const color = escSvgText(slot.colorOverride ?? layout.textColor)
  const fontStack = escSvgText(resolveSvgFontStack(slot.fontFamily))
  // Polaroid 的 Georgia 衬线字用 italic 增强手写感
  const fontStyle = slot.fontFamily === 'georgia' ? ' font-style="italic"' : ''
  return `<text x="${x}" y="${baselineY}" font-family="${fontStack}" font-size="${fontPx}" fill="${color}" text-anchor="${alignToSvgAnchor(slot.align)}"${fontStyle}>${escSvgText(text)}</text>`
}
