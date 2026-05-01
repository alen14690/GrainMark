/**
 * SX-70 Square · 方形宝丽来 SVG 生成器(阶段 3 · 2026-05-01)
 *
 * 设计(artifact/design/frame-system-2026-05-01.md · 组 C2):
 *   - 1:1 正方形专用的宝丽来变体 —— 真实 SX-70 相纸就是 3.1×3.1 inch 方形
 *   - 四边等白 8% + 底部额外加厚到 20%(标准 SX-70 比例)
 *   - 非方形输入走"居中裁成方形"策略:把短边作为正方形边,两侧留 filmBlack 填充带
 *     · 宝丽来相纸的"画面区"固定方形,老照片非方形时商家会直接挂裱
 *     · 技术上:geometry 已经给了 imgW/imgH,generator 计算 squareSide = min(imgW, imgH),
 *       在 canvas 上画两条黑条填满非方形的那一边
 *   - 底部 Courier Prime 老打字机字,居中(非 Polaroid Classic 的 Georgia 手写感)
 *
 * 与 Polaroid Classic 的差异:
 *   - Polaroid Classic:长方形,四边比例不一 ;SX-70:本质是正方形,四边 8% 等白 + 加底边
 *   - Polaroid Classic:Georgia italic 手写;SX-70:Courier Prime 老打字机
 *   - Polaroid Classic:日期橙红角戳;SX-70:日期居中 softGray(老照片风格)
 *
 * 实现上与 polaroidClassic.ts 共用底部 <text> 写法,slot.id 仍是 model/params/date,
 * 不新增 slot 类型。非方形填充作为 generator 内部行为(不体现在 FrameLayout 数据里,
 * 因为 layout 是"纯边框几何",画面裁切是 generator 的视觉兜底)。
 */
import { COLOR, scaleByMinEdge } from '../../../../shared/frame-tokens.js'
import type { FrameContentSlot, FrameLayout } from '../../../../shared/types.js'
import type { FrameSvgGenerator } from '../composite.js'
import type { FrameGeometry } from '../layoutEngine.js'
import { alignToSvgAnchor, escSvgText, resolveSvgFontStack } from '../typography.js'

export const generateSx70Square: FrameSvgGenerator = ({
  geometry,
  paramLine,
  modelLine,
  dateLine,
  style,
}) => {
  const { canvasW, canvasH, imgOffsetY, imgH, imgW, imgOffsetX, borderBottomPx, layout } = geometry

  const bgFill = escSvgText(layout.backgroundColor)
  const fillerFill = escSvgText(COLOR.filmBlack) // 非方形时两侧填充

  // 计算 squareSide:原图 min(imgW, imgH)。非方形时在 canvas 的图像区内左右/上下留黑带
  const isSquare = imgW === imgH
  const squareSide = Math.min(imgW, imgH)
  // 非方形时:把"画面"方框居中放在 imgOffset 区内,其余填 filmBlack
  // 横向填充:imgW > imgH 时,左右各留 (imgW - squareSide)/2 的黑条
  // 纵向填充:imgH > imgW 时,上下各留 (imgH - squareSide)/2 的黑条
  const fillerRects: string[] = []
  if (!isSquare) {
    if (imgW > imgH) {
      // 左右黑带
      const sideBand = Math.round((imgW - squareSide) / 2)
      fillerRects.push(
        `<rect x="${imgOffsetX}" y="${imgOffsetY}" width="${sideBand}" height="${imgH}" fill="${fillerFill}"/>`,
        `<rect x="${imgOffsetX + imgW - sideBand}" y="${imgOffsetY}" width="${sideBand}" height="${imgH}" fill="${fillerFill}"/>`,
      )
    } else {
      // 上下黑带
      const topBand = Math.round((imgH - squareSide) / 2)
      fillerRects.push(
        `<rect x="${imgOffsetX}" y="${imgOffsetY}" width="${imgW}" height="${topBand}" fill="${fillerFill}"/>`,
        `<rect x="${imgOffsetX}" y="${imgOffsetY + imgH - topBand}" width="${imgW}" height="${topBand}" fill="${fillerFill}"/>`,
      )
    }
  }

  // 底部文字:三行堆叠(与 Polaroid Classic 相似,但 Courier + softGray)
  const barTop = imgOffsetY + imgH
  const barH = borderBottomPx

  const textParts: string[] = []
  for (const slot of layout.slots) {
    const text = pickSlotText(slot, { modelLine, paramLine, dateLine })
    if (!text) continue
    textParts.push(renderSlotText(slot, text, barTop, barH, canvasW, geometry, layout))
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} isSquare=${isSquare} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${bgFill}"/>
  ${fillerRects.join('\n  ')}
  ${textParts.join('\n  ')}
</svg>`
}

function pickSlotText(
  slot: FrameContentSlot,
  texts: { modelLine: string; paramLine: string; dateLine: string },
): string {
  if (slot.id === 'model') return texts.modelLine
  if (slot.id === 'params') return texts.paramLine
  if (slot.id === 'date') return texts.dateLine
  return ''
}

/**
 * 与 polaroidClassic 的 renderSlotText 结构同构(但本 generator 无 italic 分支)。
 *
 * 为什么不复用 slotPlacement.renderSlotTextGeneric:
 *   - generic 版处理 5 种 area,SX-70 只用 bottom,走 generic 反而绕
 *   - 未来若 SX-70 需加 overlay 日期等,再复用 generic 也不迟(当前散布阈值=1)
 */
function renderSlotText(
  slot: FrameContentSlot,
  text: string,
  barTop: number,
  barH: number,
  canvasW: number,
  g: FrameGeometry,
  layout: FrameLayout,
): string {
  const fontPx = scaleByMinEdge(slot.fontSize, g.imgW, g.imgH)
  const baselineY = barTop + Math.round(slot.anchor.y * barH + fontPx * 0.35)
  const x = Math.round(slot.anchor.x * canvasW)
  const color = escSvgText(slot.colorOverride ?? layout.textColor)
  const fontStack = escSvgText(resolveSvgFontStack(slot.fontFamily))
  return `<text x="${x}" y="${baselineY}" font-family="${fontStack}" font-size="${fontPx}" fill="${color}" text-anchor="${alignToSvgAnchor(slot.align)}">${escSvgText(text)}</text>`
}
