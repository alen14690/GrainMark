/**
 * Contax Label · 相机品牌致敬条 SVG 生成器(阶段 3 · 2026-05-01)
 *
 * 设计(artifact/design/frame-system-2026-05-01.md · 组 E2):
 *   - 底部 10% 黑条,横竖一致(竖图压缩到 10% 的底边也不强制切到侧)
 *   - 左边:大字 Inter 粗体机型(白字);致敬 Contax/Leica 的排版力度
 *   - 右边:小字 mono 参数(白字);参数按优先级截断
 *   - 中间:一根橙红竖线 `|` 视觉分隔(致敬 Leica 红标 / Contax 红 T*)
 *   - **不内置任何品牌 Logo**(AGENTS.md 🔐 安全红线:不碰商标),Logo 位靠用户
 *     上传(overrides.logoPath);未设置则只显示文字
 *
 * 与 Editorial Caption 的区别:
 *   - Editorial Caption:纸白底条 + 细黑线分隔(杂志版式,优雅克制)
 *   - Contax Label:黑底条 + 橙红竖线分隔(品牌致敬,力度强烈)
 *   - Editorial 是"杂志 caption",Contax 是"机身铭牌"
 *
 * 实现:
 *   - 走 slotPlacement 通用渲染(area='bottom'),复用已有逻辑
 *   - 橙红竖线在文字之后手工画一条 <line>(位置固定在 canvas 水平 50%,高度占条的 50%)
 */
import { COLOR, scaleByMinEdge } from '../../../../shared/frame-tokens.js'
import type { FrameContentSlot } from '../../../../shared/types.js'
import type { FrameSvgGenerator } from '../composite.js'
import { escSvgText } from '../typography.js'
import { renderSlotTextGeneric } from './slotPlacement.js'

export const generateContaxLabel: FrameSvgGenerator = ({ geometry, paramLine, modelLine, style }) => {
  const { canvasW, canvasH, imgOffsetY, imgH, borderBottomPx, layout } = geometry
  const bgFill = escSvgText(layout.backgroundColor)

  const textParts: string[] = []
  for (const slot of layout.slots) {
    const text = pickSlotText(slot, { modelLine, paramLine })
    if (!text) continue
    textParts.push(renderSlotTextGeneric(slot, text, geometry, layout))
  }

  // 橙红竖线 · 固定在 canvas 水平 50% · 高度占底条 50% · 居中
  const lineX = Math.round(canvasW * 0.5)
  const lineH = Math.round(borderBottomPx * 0.5)
  const lineY0 = imgOffsetY + imgH + Math.round((borderBottomPx - lineH) / 2)
  const lineY1 = lineY0 + lineH
  const lineStroke = Math.max(scaleByMinEdge(0.003, geometry.imgW, geometry.imgH), 2)
  const lineColor = escSvgText(COLOR.dateStampOrange)
  const accentLine =
    borderBottomPx > 0
      ? `<line x1="${lineX}" y1="${lineY0}" x2="${lineX}" y2="${lineY1}" stroke="${lineColor}" stroke-width="${lineStroke}" stroke-linecap="round"/>`
      : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${bgFill}"/>
  ${accentLine}
  ${textParts.join('\n  ')}
</svg>`
}

function pickSlotText(slot: FrameContentSlot, texts: { modelLine: string; paramLine: string }): string {
  if (slot.id === 'model') return texts.modelLine
  if (slot.id === 'params') return texts.paramLine
  return ''
}
