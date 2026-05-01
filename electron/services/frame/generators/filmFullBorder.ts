/**
 * Film Full Border · 135 全齿孔 SVG 生成器
 *
 * 设计(artifact/design/frame-system-2026-05-01.md · 组 B1):
 *   - 胶片黑背景 + 白色齿孔圆角方块(真实 135 胶卷齿孔尺寸比例约 5mm × 4mm,
 *     约占胶片短边 8% × 6%,本风格按同比例 patternW=minEdge×0.02 · perfH=gap×0.5)
 *   - 齿孔沿"边框长向"均匀分布 · 个数由 canvasW / patternW(横图)或
 *     canvasH / patternW(竖图)动态计算
 *   - 横图:齿孔铺满上下边;竖图:齿孔铺满左右边
 *     · 这个"横竖方向切换"是本风格最核心的自适应契约,**不允许**在 generator
 *       内写 `if (imgW > imgH)` 散布横竖判定 —— 直接读 layout.slots 的 area 字段
 *       就是"朝向真值"的安全入口
 *   - 上/下(或左/右)边都放文字 slot,由 composite 统一控位
 *
 * 齿孔实现:用 SVG `<pattern>` + `<rect fill="url(#perforation)">`,可伸缩,
 * 不用手撸 for 循环画 100 个 `<rect>`(JSON 响应过大 + Sharp 解析慢)。
 */
import { scaleByMinEdge } from '../../../../shared/frame-tokens.js'
import type { FrameContentSlot, FrameLayout } from '../../../../shared/types.js'
import type { FrameSvgGenerator } from '../composite.js'
import type { FrameGeometry } from '../layoutEngine.js'
import { alignToSvgAnchor, escSvgText, resolveSvgFontStack } from '../typography.js'

export const generateFilmFullBorder: FrameSvgGenerator = ({
  geometry,
  paramLine,
  modelLine,
  dateLine,
  style,
}) => {
  const { canvasW, canvasH, borderTopPx, borderBottomPx, borderLeftPx, borderRightPx, layout, orientation } =
    geometry

  // 齿孔单元尺寸:按短边 2% 做 pattern size
  const perfUnit = scaleByMinEdge(0.02, geometry.imgW, geometry.imgH)
  const perfW = Math.max(perfUnit, 4) // 最小 4px 防止极小图时消失
  const perfH = Math.round(perfW * 0.5)
  const perfRadius = Math.round(perfH * 0.3)

  // 齿孔 <pattern> —— 一个 perfW×perfW 的 tile,中央一个 perfW×perfH 圆角白块
  //   - 水平密集排列靠 pattern 的 x 维;竖直居中靠 y=(perfW-perfH)/2
  const perfPatternId = 'film-perforation'
  const patternDef = `<defs>
    <pattern id="${perfPatternId}" patternUnits="userSpaceOnUse" width="${perfW}" height="${perfW}">
      <rect x="${Math.round(perfW * 0.15)}" y="${Math.round((perfW - perfH) / 2)}" width="${Math.round(perfW * 0.7)}" height="${perfH}" rx="${perfRadius}" ry="${perfRadius}" fill="${escSvgText(layout.textColor)}" opacity="0.9"/>
    </pattern>
  </defs>`

  // 黑边 + 齿孔覆盖区的 rect
  const bgFill = escSvgText(layout.backgroundColor)
  const perfRects: string[] = []

  if (orientation === 'portrait') {
    // 竖图:齿孔在左右边
    if (borderLeftPx > 0) {
      perfRects.push(
        `<rect x="0" y="0" width="${borderLeftPx}" height="${canvasH}" fill="${bgFill}"/>`,
        `<rect x="0" y="0" width="${borderLeftPx}" height="${canvasH}" fill="url(#${perfPatternId})"/>`,
      )
    }
    if (borderRightPx > 0) {
      const rightX = canvasW - borderRightPx
      perfRects.push(
        `<rect x="${rightX}" y="0" width="${borderRightPx}" height="${canvasH}" fill="${bgFill}"/>`,
        `<rect x="${rightX}" y="0" width="${borderRightPx}" height="${canvasH}" fill="url(#${perfPatternId})"/>`,
      )
    }
  } else {
    // 横图 / 方图:齿孔在上下边
    if (borderTopPx > 0) {
      perfRects.push(
        `<rect x="0" y="0" width="${canvasW}" height="${borderTopPx}" fill="${bgFill}"/>`,
        `<rect x="0" y="0" width="${canvasW}" height="${borderTopPx}" fill="url(#${perfPatternId})"/>`,
      )
    }
    if (borderBottomPx > 0) {
      const bottomY = canvasH - borderBottomPx
      perfRects.push(
        `<rect x="0" y="${bottomY}" width="${canvasW}" height="${borderBottomPx}" fill="${bgFill}"/>`,
        `<rect x="0" y="${bottomY}" width="${canvasW}" height="${borderBottomPx}" fill="url(#${perfPatternId})"/>`,
      )
    }
  }

  // 文字 slot(area 从 layout 数据读,不 if 判断横竖)
  const textParts: string[] = []
  for (const slot of layout.slots) {
    const text = pickSlotText(slot, { modelLine, paramLine, dateLine })
    if (!text) continue
    textParts.push(renderSlotText(slot, text, geometry, layout))
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} orientation=${orientation} -->
  ${patternDef}
  ${perfRects.join('\n  ')}
  ${textParts.join('\n  ')}
</svg>`
}

/** slot.id → 对应文本字段(纯映射,避免 switch 散布) */
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
 * 按 slot.area 渲染文字 —— 与 Polaroid 的 renderSlotText 语义相同,
 * 但本 generator 支持 top/bottom/left/right 四种 area(Polaroid 只有 bottom)。
 *
 * 竖图的 left/right 区域:
 *   - anchor.x 是相对该边框条的宽度(0=贴外 1=贴图)
 *   - anchor.y 是相对 canvasH
 */
function renderSlotText(slot: FrameContentSlot, text: string, g: FrameGeometry, layout: FrameLayout): string {
  const fontPx = scaleByMinEdge(slot.fontSize, g.imgW, g.imgH)
  const color = escSvgText(slot.colorOverride ?? layout.textColor)
  const fontStack = escSvgText(resolveSvgFontStack(slot.fontFamily))

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
    // 竖图左边:文字垂直排列(用 SVG transform rotate -90 让字沿边走)
    // anchor.x 相对 borderLeftPx(0=外,1=贴图);anchor.y 相对 canvasH(顶→底)
    const anchorX = Math.round(slot.anchor.x * g.borderLeftPx)
    const anchorY = Math.round(slot.anchor.y * g.canvasH)
    x = 0
    y = 0
    transform = ` transform="translate(${anchorX},${anchorY}) rotate(-90)"`
  } else if (slot.area === 'right') {
    // 竖图右边:文字竖排,方向相反(rotate 90)
    const anchorX = g.imgOffsetX + g.imgW + Math.round(slot.anchor.x * g.borderRightPx)
    const anchorY = Math.round(slot.anchor.y * g.canvasH)
    x = 0
    y = 0
    transform = ` transform="translate(${anchorX},${anchorY}) rotate(90)"`
  } else {
    // overlay 或未知 —— 本 generator 不支持,留空(避免意外输出)
    return ''
  }

  return `<text x="${x}" y="${y}" font-family="${fontStack}" font-size="${fontPx}" fill="${color}" text-anchor="${alignToSvgAnchor(slot.align)}"${transform}>${escSvgText(text)}</text>`
}
