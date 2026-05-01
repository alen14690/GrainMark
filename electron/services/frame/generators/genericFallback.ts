/**
 * genericFallback — 通用 fallback generator(阶段 5 · 2026-05-01)
 *
 * 用途:
 *   阶段 5 的 14 个新风格(glass / oil / ambient / cinema / editorial / metal / floating)
 *   先用此 generator 跑通"数据层 FrameLayout → 可渲染 SVG"的基础契约,
 *   装饰细节(玻璃磨砂 · 霓虹辉光 · 金属拉丝 · 圆形徽章 · 浮卡阴影)由阶段 5b 单独实装。
 *
 * 能力:
 *   - 渲染 4 周纯色边(borderTop/Bottom/Left/Right)按 style.landscape/portrait 数据
 *   - 遍历 layout.slots 按 area(top/bottom/left/right/overlay)自动渲染
 *   - model / params / date / artist slot 自动映射文字内容
 *   - overlay slot 直接叠在原图上(glass-chip / stamp-corner / medal-plate 等用)
 *
 * 不实现:
 *   - 装饰几何(svg filter blur / 金属拉丝 pattern / 霓虹多层光晕) —— 阶段 5b 补
 *
 * 设计原则(AGENTS.md 第 8 条):
 *   - 纯 data-driven · 与现有 bottomTextGenerator / slotPlacement 相同思路
 *   - 任意 style 只要 FrameLayout 数据正确,都能跑通
 */
import type { FrameContentSlot } from '../../../../shared/types.js'
import type { FrameGeneratorContext, FrameSvgGenerator } from '../composite.js'
import { escSvgText } from '../typography.js'
import { renderSlotTextGeneric } from './slotPlacement.js'

const ITALIC_FAMILIES: ReadonlySet<'georgia' | 'typewriter'> = new Set(['georgia', 'typewriter'])

/**
 * 通用 fallback generator · 纯数据驱动
 *
 * 契约:
 *   - 根据 layout 数据画 4 周背景
 *   - 遍历 layout.slots · 按 area 分派到 slotPlacement · 拼接 SVG
 *   - slot.colorOverride 若包含 rgba() · 透明度会保留(layout 层已决定)
 */
export const generateGenericFallback: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, paramLine, modelLine, dateLine, artistLine, style } = ctx
  const { canvasW, canvasH, layout } = geometry
  const bgFill = escSvgText(layout.backgroundColor)

  // 文字 slot 渲染 · 自动跳过空文本(composite 已处理去重与空值)
  const textParts: string[] = []
  for (const slot of layout.slots) {
    const text = pickSlotText(slot, { modelLine, paramLine, dateLine, artistLine })
    if (!text) continue
    const svg = renderSlotTextGeneric(slot, text, geometry, layout, ITALIC_FAMILIES)
    if (svg) textParts.push(svg)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} generator=genericFallback -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${bgFill}"/>
  ${textParts.join('\n  ')}
</svg>`
}

function pickSlotText(
  slot: FrameContentSlot,
  texts: { modelLine: string; paramLine: string; dateLine: string; artistLine: string },
): string {
  switch (slot.id) {
    case 'model':
      return texts.modelLine
    case 'params':
      return texts.paramLine
    case 'date':
      return texts.dateLine
    case 'artist':
      return texts.artistLine
    default:
      return ''
  }
}
