/**
 * Minimal Bar · 极简底栏 SVG 生成器
 *
 * 设计语言(artifact/design/frame-system-2026-05-01.md · 组 A1):
 *   - 纸白底栏 `#F8F5EE`,深灰等宽字 `#2A2A2A`
 *   - 底栏高 8%(横)/ 10%(竖)· 不加四周边框
 *   - 左:参数一行;右:日期(次要色 softGray)
 *
 * 与旧 `watermark/renderer.ts` 的差异:
 *   - 老版黑底白字(style.bgColor='#000000', style.color='#ffffff')→ 粗糙
 *   - 新版按 frame-tokens 走 paperWhite / inkGray · 纸质感更强
 *   - 新版字号按 `scaleByMinEdge(FONT_SIZE.params, w, h)` 线性缩放 · 24MP 图不糊
 *
 * 纯函数契约:
 *   - 只接收 FrameGeneratorContext(无 Sharp / fs / ipc 依赖)
 *   - 输出完整 SVG 字符串,宽高 = geometry.canvasW × geometry.canvasH
 *   - 可单测:给定输入,验证 SVG 含预期 `<text>` / `<rect>` 元素和颜色
 */
import { scaleByMinEdge } from '../../../../shared/frame-tokens.js'
import type { FrameSvgGenerator } from '../composite.js'
import { escSvgText, resolveSvgFontStack } from '../typography.js'

export const generateMinimalBar: FrameSvgGenerator = ({ geometry, paramLine, dateLine, style }) => {
  const { canvasW, canvasH, imgOffsetY, imgH, borderBottomPx, layout, imgW } = geometry

  // 底栏区域(y 从 imgOffsetY+imgH 到 canvasH)
  const barTop = imgOffsetY + imgH
  const barH = borderBottomPx

  // 字号:FrameLayout.slots 里每个 slot 定义了自己的 fontSize 比例,
  // 这里按 scaleByMinEdge(fontSize, imgW, imgH) 换算为像素。
  // 不把 FONT_SIZE.params 直接写死 —— 让 slots 数据做单源(AGENTS.md 第 8 条)。
  const paramsSlot = layout.slots.find((s) => s.id === 'params')
  const dateSlot = layout.slots.find((s) => s.id === 'date')

  if (!paramsSlot) {
    throw new Error('[minimalBar] layout 缺少 params slot —— registry 数据定义有误')
  }

  const paramsFontPx = scaleByMinEdge(paramsSlot.fontSize, imgW, imgH)
  const dateFontPx = dateSlot ? scaleByMinEdge(dateSlot.fontSize, imgW, imgH) : paramsFontPx

  // 竖向中线(SVG text 的 y 是字体基线位置,要加字号的 0.35 倍做视觉居中)
  const textBaselineY = barTop + Math.round(barH / 2 + paramsFontPx * 0.35)

  // 水平位置:anchor.x × canvasW
  const paramsX = Math.round(paramsSlot.anchor.x * canvasW)
  const dateX = dateSlot ? Math.round(dateSlot.anchor.x * canvasW) : canvasW - paramsX

  const paramsFontStack = escSvgText(resolveSvgFontStack(paramsSlot.fontFamily))
  const dateFontStack = dateSlot ? escSvgText(resolveSvgFontStack(dateSlot.fontFamily)) : paramsFontStack

  const textColor = escSvgText(layout.textColor)
  const dateColor = dateSlot?.colorOverride ? escSvgText(dateSlot.colorOverride) : textColor

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} -->
  <rect x="0" y="${barTop}" width="${canvasW}" height="${barH}" fill="${escSvgText(layout.backgroundColor)}"/>
  <text x="${paramsX}" y="${textBaselineY}" font-family="${paramsFontStack}" font-size="${paramsFontPx}" fill="${textColor}" text-anchor="${alignToAnchor(paramsSlot.align)}">${escSvgText(paramLine)}</text>
  ${
    dateLine && dateSlot
      ? `<text x="${dateX}" y="${textBaselineY}" font-family="${dateFontStack}" font-size="${dateFontPx}" fill="${dateColor}" text-anchor="${alignToAnchor(dateSlot.align)}">${escSvgText(dateLine)}</text>`
      : ''
  }
</svg>`
}

/** SVG text-anchor 只有 start/middle/end,对应 layout.slot.align 的 left/center/right */
function alignToAnchor(align: 'left' | 'center' | 'right'): 'start' | 'middle' | 'end' {
  if (align === 'left') return 'start'
  if (align === 'right') return 'end'
  return 'middle'
}
