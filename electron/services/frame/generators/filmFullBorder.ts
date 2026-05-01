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
import type { FrameContentSlot } from '../../../../shared/types.js'
import type { FrameSvgGenerator } from '../composite.js'
import { escSvgText } from '../typography.js'
import { renderSlotTextGeneric } from './slotPlacement.js'

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

  const perfPatternId = 'film-perforation'
  const patternDef = `<defs>
    <pattern id="${perfPatternId}" patternUnits="userSpaceOnUse" width="${perfW}" height="${perfW}">
      <rect x="${Math.round(perfW * 0.15)}" y="${Math.round((perfW - perfH) / 2)}" width="${Math.round(perfW * 0.7)}" height="${perfH}" rx="${perfRadius}" ry="${perfRadius}" fill="${escSvgText(layout.textColor)}" opacity="0.9"/>
    </pattern>
  </defs>`

  const bgFill = escSvgText(layout.backgroundColor)
  const perfRects: string[] = []

  if (orientation === 'portrait') {
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

  // 文字 slot · 复用 slotPlacement 的通用渲染(不再本文件内实现 renderSlotText)
  const textParts: string[] = []
  for (const slot of layout.slots) {
    const text = pickSlotText(slot, { modelLine, paramLine, dateLine })
    if (!text) continue
    textParts.push(renderSlotTextGeneric(slot, text, geometry, layout))
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
