/**
 * Minimal Bar · 极简底栏 SVG 生成器
 *
 * 设计语言(artifact/design/frame-system-2026-05-01.md · 组 A1):
 *   - 纸白底栏 `#F8F5EE`,深灰等宽字 `#2A2A2A`
 *   - 横图:底栏 8% · 左参数 + 右日期(一行二元素)
 *   - 竖图(2026-05-01 专业重设计):底栏 20% · 三行堆叠(model + params + date)
 *
 * 纯函数契约:
 *   - 只接收 FrameGeneratorContext(无 Sharp / fs / ipc 依赖)
 *   - 输出完整 SVG 字符串,宽高 = geometry.canvasW × geometry.canvasH
 *   - 通用 slot 遍历:本 generator 不硬编 "params + date",完全由 layout.slots 驱动
 *     → 横竖差异由 registry 的 portrait 数据表达,不在 generator 写 if(imgW > imgH)
 *
 * 架构升级原因(2026-05-01):
 *   原 generator 硬编 `paramsSlot + dateSlot` 两个 slot 的排版方式,竖图新增 model
 *   slot 后无法展示。改为通用 slot 遍历(与 filmFullBorder/spineEdition 共享逻辑),
 *   让数据驱动所有横竖差异。
 */
import { scaleByMinEdge } from '../../../../shared/frame-tokens.js'
import type { FrameContentSlot } from '../../../../shared/types.js'
import type { FrameSvgGenerator } from '../composite.js'
import { alignToSvgAnchor, escSvgText, resolveSvgFontStack } from '../typography.js'

export const generateMinimalBar: FrameSvgGenerator = ({
  geometry,
  paramLine,
  modelLine,
  dateLine,
  style,
}) => {
  const { canvasW, canvasH, imgOffsetY, imgH, borderBottomPx, layout, imgW } = geometry

  const barTop = imgOffsetY + imgH
  const barH = borderBottomPx

  // 兼容性护栏:必须有 params slot(Minimal Bar 核心)
  const paramsSlot = layout.slots.find((s) => s.id === 'params')
  if (!paramsSlot) {
    throw new Error('[minimalBar] layout 缺少 params slot —— registry 数据定义有误')
  }

  const textParts: string[] = []
  for (const slot of layout.slots) {
    const text = pickSlotText(slot, { modelLine, paramLine, dateLine })
    if (!text) continue
    textParts.push(renderSlotInBar(slot, text, barTop, barH, canvasW, imgW, imgH, layout.textColor))
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} -->
  <rect x="0" y="${barTop}" width="${canvasW}" height="${barH}" fill="${escSvgText(layout.backgroundColor)}"/>
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
 * 在底栏 bar 区内按 slot.anchor 渲染单个 <text>。
 *
 * anchor.y 归一化到 bar 高(0=上沿 / 1=下沿) · 视觉居中加字号 0.35 补偿
 * anchor.x 归一化到 canvas 宽
 */
function renderSlotInBar(
  slot: FrameContentSlot,
  text: string,
  barTop: number,
  barH: number,
  canvasW: number,
  imgW: number,
  imgH: number,
  defaultColor: string,
): string {
  const fontPx = scaleByMinEdge(slot.fontSize, imgW, imgH)
  const baselineY = barTop + Math.round(slot.anchor.y * barH + fontPx * 0.35)
  const x = Math.round(slot.anchor.x * canvasW)
  const color = escSvgText(slot.colorOverride ?? defaultColor)
  const fontStack = escSvgText(resolveSvgFontStack(slot.fontFamily))
  return `<text x="${x}" y="${baselineY}" font-family="${fontStack}" font-size="${fontPx}" fill="${color}" text-anchor="${alignToSvgAnchor(slot.align)}">${escSvgText(text)}</text>`
}
