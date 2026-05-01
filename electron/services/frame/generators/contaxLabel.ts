/**
 * Contax Label · 相机品牌致敬条 SVG 生成器(阶段 3 · 2026-05-01 · 竖图优化)
 *
 * 设计(artifact/design/frame-system-2026-05-01.md · 组 E2):
 *   - 底部黑条(横 10% / 竖 14%)
 *   - 横图:左边大字机型(Inter 粗体) · 右边小字参数(mono) · 中间橙红竖线分隔
 *   - 竖图(2026-05-01 优化):两行堆叠 model + params 同左起点 · 中间短水平橙红线
 *     分隔两行(致敬 Leica 红标,视觉上与横图的竖线互为对应)
 *
 * 为什么竖图不强行用竖线:
 *   - 竖图窄,左右分端会让 model/params 撞车(中间只剩 < 30% 宽可供分隔)
 *   - 改两行堆叠 + 水平短线后,视觉节奏更安静,品牌感不减
 *   - 散布阈值:横竖只有"线方向"差异,generator 内部一个 if 按 orientation 分派是合理的
 *     (所有横竖区分逻辑都统一走 layout 数据 · 本处是"装饰几何"的衍生,不违反第 8 条)
 *
 * 不内置任何品牌 Logo(AGENTS.md 🔐 安全红线)
 */
import { COLOR, scaleByMinEdge } from '../../../../shared/frame-tokens.js'
import type { FrameContentSlot } from '../../../../shared/types.js'
import type { FrameSvgGenerator } from '../composite.js'
import { escSvgText } from '../typography.js'
import { renderSlotTextGeneric } from './slotPlacement.js'

export const generateContaxLabel: FrameSvgGenerator = ({ geometry, paramLine, modelLine, style }) => {
  const { canvasW, canvasH, imgOffsetY, imgH, borderBottomPx, layout, orientation } = geometry
  const bgFill = escSvgText(layout.backgroundColor)

  const textParts: string[] = []
  for (const slot of layout.slots) {
    const text = pickSlotText(slot, { modelLine, paramLine })
    if (!text) continue
    textParts.push(renderSlotTextGeneric(slot, text, geometry, layout))
  }

  const lineColor = escSvgText(COLOR.dateStampOrange)
  const lineStroke = Math.max(scaleByMinEdge(0.003, geometry.imgW, geometry.imgH), 2)
  const barTop = imgOffsetY + imgH

  let accentLine = ''
  if (borderBottomPx > 0) {
    if (orientation === 'portrait') {
      // 竖图专业装饰(2026-05-01 · 专业重设计):
      //   左侧粗橙红竖线 · 贯穿两行文字形成视觉轴
      //   位置:canvasW × 0.05(左侧) · 从 model 上沿到 params 下沿
      //   粗度:比横图稍粗(0.005 vs 0.003) · 作为视觉主角
      const lineX = Math.round(canvasW * 0.05)
      const lineY0 = barTop + Math.round(borderBottomPx * 0.22) // 从 model 上沿
      const lineY1 = barTop + Math.round(borderBottomPx * 0.8) // 到 params 下沿
      const lineStrokePortrait = Math.max(scaleByMinEdge(0.005, geometry.imgW, geometry.imgH), 3)
      accentLine = `<line x1="${lineX}" y1="${lineY0}" x2="${lineX}" y2="${lineY1}" stroke="${lineColor}" stroke-width="${lineStrokePortrait}" stroke-linecap="round"/>`
    } else {
      // 横图:橙红竖线 · 分隔左 model 和右 params · 位置 canvasW×0.5 · 高度占底条 50%
      const lineX = Math.round(canvasW * 0.5)
      const lineH = Math.round(borderBottomPx * 0.5)
      const lineY0 = barTop + Math.round((borderBottomPx - lineH) / 2)
      const lineY1 = lineY0 + lineH
      accentLine = `<line x1="${lineX}" y1="${lineY0}" x2="${lineX}" y2="${lineY1}" stroke="${lineColor}" stroke-width="${lineStroke}" stroke-linecap="round"/>`
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} orientation=${orientation} -->
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
