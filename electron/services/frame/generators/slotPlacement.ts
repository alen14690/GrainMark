/**
 * slotPlacement — 通用 slot 文字定位/渲染工具
 *
 * 职责(AGENTS.md 第 8 条):
 *   Film Full Border / Spine Edition 等"多 area(top/bottom/left/right)"风格
 *   都要把 FrameContentSlot 按 anchor 换算到 SVG 坐标 + 处理竖排 rotate。
 *   这段逻辑首次出现在 filmFullBorder.ts 的 inner `renderSlotText`,本 commit
 *   Spine Edition 需要同样的逻辑 —— 散布阈值 = 2,必须提取。
 *
 * 覆盖 5 种 area:
 *   - 'top':x = anchor.x × canvasW,y = anchor.y × borderTopPx(加 0.35 基线补偿)
 *   - 'bottom':同理,y 偏移到图片底部
 *   - 'left':竖排文字,rotate(-90),transform-origin=(anchorX, anchorY)
 *   - 'right':竖排文字,rotate(90)
 *   - 'overlay':叠在原图上,overlay 区覆盖整个图片
 *
 * 纯函数 · 可单测(给定 slot + geometry 返回 SVG 字符串)
 */
import { scaleByMinEdge } from '../../../../shared/frame-tokens.js'
import type { FrameContentSlot, FrameLayout } from '../../../../shared/types.js'
import type { FrameGeometry } from '../layoutEngine.js'
import { alignToSvgAnchor, escSvgText, resolveSvgFontStack } from '../typography.js'

/**
 * 按 slot.area 渲染单个文本 slot 为 SVG `<text>` 字符串。
 *
 * @param italicFamilies 可选 —— 指定哪些字体族自动 italic(Georgia / Typewriter)
 * @returns 完整 `<text>...</text>` 字符串(若 area 不支持返回空串)
 */
export function renderSlotTextGeneric(
  slot: FrameContentSlot,
  text: string,
  g: FrameGeometry,
  layout: FrameLayout,
  italicFamilies: ReadonlySet<'georgia' | 'typewriter'> = new Set(),
): string {
  if (!text) return ''
  const fontPx = scaleByMinEdge(slot.fontSize, g.imgW, g.imgH)
  const color = escSvgText(slot.colorOverride ?? layout.textColor)
  const fontStack = escSvgText(resolveSvgFontStack(slot.fontFamily))
  const anchor = alignToSvgAnchor(slot.align)
  const fontStyle = italicFamilies.has(slot.fontFamily as 'georgia' | 'typewriter')
    ? ' font-style="italic"'
    : ''

  let x: number
  let y: number
  let transform = ''

  if (slot.area === 'top') {
    x = Math.round(slot.anchor.x * g.canvasW)
    y = Math.round(slot.anchor.y * g.borderTopPx + fontPx * 0.35)
  } else if (slot.area === 'bottom') {
    x = Math.round(slot.anchor.x * g.canvasW)
    y = g.imgOffsetY + g.imgH + Math.round(slot.anchor.y * g.borderBottomPx + fontPx * 0.35)
  } else if (slot.area === 'left') {
    const anchorX = Math.round(slot.anchor.x * g.borderLeftPx)
    const anchorY = Math.round(slot.anchor.y * g.canvasH)
    x = 0
    y = 0
    // left:rotate(-90) 让字从下向上读(书脊惯例)
    transform = ` transform="translate(${anchorX},${anchorY}) rotate(-90)"`
  } else if (slot.area === 'right') {
    const anchorX = g.imgOffsetX + g.imgW + Math.round(slot.anchor.x * g.borderRightPx)
    const anchorY = Math.round(slot.anchor.y * g.canvasH)
    x = 0
    y = 0
    // right:rotate(90) 让字从上向下读(与 left 形成对称,Film Full Border 惯例)
    transform = ` transform="translate(${anchorX},${anchorY}) rotate(90)"`
  } else if (slot.area === 'overlay') {
    // 叠在原图上:坐标从图片左上角算
    x = g.imgOffsetX + Math.round(slot.anchor.x * g.imgW)
    y = g.imgOffsetY + Math.round(slot.anchor.y * g.imgH + fontPx * 0.35)
  } else {
    return ''
  }

  return `<text x="${x}" y="${y}" font-family="${fontStack}" font-size="${fontPx}" fill="${color}" text-anchor="${anchor}"${transform}${fontStyle}>${escSvgText(text)}</text>`
}
