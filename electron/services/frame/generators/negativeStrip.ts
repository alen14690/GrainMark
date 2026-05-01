/**
 * Negative Strip · 胶片负片条 SVG 生成器(阶段 3 · 2026-05-01)
 *
 * 设计(artifact/design/frame-system-2026-05-01.md · 组 B3):
 *   - 图片上下各加 8% 胶片黑 ledger(模仿 35mm 负片裁切后的黑边)
 *   - 黑边上:等宽白字机型 · 下:等宽白字参数
 *   - 左上角橙红"24 →"模拟胶片帧号(固定字符,不是动态计数)
 *   - 竖图关键:黑边切到左右,参数 slot area='right',垂直排列
 *
 * 与 Film Full Border 的区别:
 *   - Film Full Border:齿孔图案(pattern 填充) + 左右/上下双边带
 *   - Negative Strip:没齿孔,纯黑带,但有固定帧号戳(帧号是本风格的标志性元素)
 *
 * 帧号设计:
 *   - "24 →" 固定字符,位于画面左上角(area='overlay') · 橙红色 dateStampOrange
 *   - "24" 是胶卷最经典的"倒数第二张"暗示(36 张胶卷的 24 帧),有摄影文化梗
 *   - 用户可通过自定义 artistName overrides 替换(未来扩展,本期固定)
 *
 * 复用:
 *   - renderSlotTextGeneric 处理 top/bottom/left/right 4 个 area
 *   - overlay 帧号用 overlay area · 走同一个通用函数
 */
import { COLOR, scaleByMinEdge } from '../../../../shared/frame-tokens.js'
import type { FrameContentSlot } from '../../../../shared/types.js'
import type { FrameSvgGenerator } from '../composite.js'
import { escSvgText } from '../typography.js'
import { renderSlotTextGeneric } from './slotPlacement.js'

/** 固定帧号字符 —— 胶卷文化梗,"24 →" 意味倒数第二帧的悬念 */
const FRAME_NUMBER_LABEL = '24 →'

export const generateNegativeStrip: FrameSvgGenerator = ({
  geometry,
  paramLine,
  modelLine,
  dateLine,
  style,
}) => {
  const { canvasW, canvasH, layout, orientation, imgOffsetX, imgOffsetY, imgH, imgW } = geometry
  const bgFill = escSvgText(layout.backgroundColor)

  // 所有文字 slot 走通用 placement(支持 top/bottom/left/right + overlay 帧号)
  const textParts: string[] = []
  for (const slot of layout.slots) {
    const text = pickSlotText(slot, { modelLine, paramLine, dateLine })
    if (!text) continue
    textParts.push(renderSlotTextGeneric(slot, text, geometry, layout))
  }

  // 帧号 "24 →":橙红 · 老打字机字体 · 位于画面左上角 overlay
  //   横图:overlay.anchor.x = 0.04,y = 0.07(左上角稍里边 · 避免压到画面主体)
  //   竖图:overlay.anchor.x = 0.08,y = 0.04(竖图左上更上提一点,否则会挡到照片主要视觉区)
  const frameLabelFontPx = scaleByMinEdge(0.024, imgW, imgH)
  const anchorX = orientation === 'portrait' ? 0.08 : 0.04
  const anchorY = orientation === 'portrait' ? 0.04 : 0.07
  const frameLabelX = imgOffsetX + Math.round(anchorX * imgW)
  const frameLabelY = imgOffsetY + Math.round(anchorY * imgH + frameLabelFontPx * 0.35)
  const frameLabel = `<text x="${frameLabelX}" y="${frameLabelY}" font-family="'Courier New', Courier, monospace" font-size="${frameLabelFontPx}" fill="${escSvgText(COLOR.dateStampOrange)}" text-anchor="start" font-weight="bold">${escSvgText(FRAME_NUMBER_LABEL)}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} orientation=${orientation} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${bgFill}"/>
  ${textParts.join('\n  ')}
  ${frameLabel}
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
