/**
 * bottomTextGenerator — 通用"四周纯色边 + 底部文字多行"风格工厂
 *
 * 适用风格(阶段 2):
 *   - Polaroid Classic(之前单独实现,未来重构可并到这里)
 *   - Gallery Black
 *   - Gallery White
 *   - Editorial Caption(底部外接 caption 卡,结构同)
 *
 * 为什么做工厂而非每个风格各写 generator:
 *   - AGENTS.md 第 8 条 · 散布阈值 = 2。Polaroid 已经写了一份底部多 slot
 *     渲染逻辑,Gallery Black 再写就是散布 —— 必须提取
 *   - 工厂产出的 generator 仍是 FrameSvgGenerator 类型,外部透明
 *
 * 契约:
 *   - 只渲染 area='bottom' 的 slot(忽略 top/left/right/overlay)
 *   - slot 的 anchor.y 相对于 borderBottomPx 归一化(0=贴图 / 1=贴底)
 *   - 可选 italicForFont:Georgia 默认 italic(Polaroid/Gallery 都需要)
 *
 * Gallery 与 Polaroid 的区别只是:
 *   - layout 数据里的 slot 数量和位置不同
 *   - backgroundColor / textColor 不同
 *   这些都由调用方传入的 style 决定,generator 本身无风格倾向。
 */
import { scaleByMinEdge } from '../../../../shared/frame-tokens.js'
import type { FrameContentSlot, FrameLayout } from '../../../../shared/types.js'
import type { FrameSvgGenerator } from '../composite.js'
import type { FrameGeneratorContext } from '../composite.js'
import type { FrameGeometry } from '../layoutEngine.js'
import { alignToSvgAnchor, escSvgText, resolveSvgFontStack } from '../typography.js'

export interface BottomTextGeneratorOptions {
  /** 哪些字体族默认带 italic(Georgia 等衬线字的手写感) */
  italicFontFamilies?: Array<'georgia' | 'typewriter'>
  /**
   * 在 bottom 区域的顶部画一根分隔线(Editorial 风格用,杂志版式的视觉标志)。
   * - 颜色:走 layout.textColor(纸白底黑字风格线会是黑的,反之亦然)
   * - 线宽:minEdge × 0.001(~2-4px,极细) · 不受 scale 影响
   */
  topSeparator?: boolean
}

export function createBottomTextGenerator(options: BottomTextGeneratorOptions = {}): FrameSvgGenerator {
  const italicSet = new Set<'georgia' | 'typewriter'>(options.italicFontFamilies ?? ['georgia'])
  const withSeparator = options.topSeparator === true

  return (ctx: FrameGeneratorContext) => {
    const { geometry, paramLine, modelLine, dateLine, artistLine, style } = ctx
    const { canvasW, canvasH, imgOffsetY, imgH, borderBottomPx, layout } = geometry

    const barTop = imgOffsetY + imgH
    const barH = borderBottomPx
    const bgFill = escSvgText(layout.backgroundColor)

    // 分隔线(Editorial 风格专用) · 粗度按 minEdge × 0.001,最小 1px
    const separatorParts: string[] = []
    if (withSeparator && barH > 0) {
      const sepStroke = Math.max(scaleByMinEdge(0.001, geometry.imgW, geometry.imgH), 1)
      const sepColor = escSvgText(layout.textColor)
      separatorParts.push(
        `<line x1="${Math.round(canvasW * 0.05)}" y1="${barTop + Math.round(barH * 0.08)}" x2="${Math.round(canvasW * 0.95)}" y2="${barTop + Math.round(barH * 0.08)}" stroke="${sepColor}" stroke-width="${sepStroke}" opacity="0.3"/>`,
      )
    }

    const textParts: string[] = []
    for (const slot of layout.slots) {
      if (slot.area !== 'bottom') continue
      const text = pickTextForSlot(slot, { modelLine, paramLine, dateLine, artistLine })
      if (!text) continue
      textParts.push(renderBottomSlotText(slot, text, barTop, barH, canvasW, geometry, layout, italicSet))
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${escSvgText(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${bgFill}"/>
  ${separatorParts.join('\n  ')}
  ${textParts.join('\n  ')}
</svg>`
  }
}

/** slot.id → 对应文本字段(集中映射,避免散布 switch) */
function pickTextForSlot(
  slot: FrameContentSlot,
  texts: { modelLine: string; paramLine: string; dateLine: string; artistLine: string },
): string {
  if (slot.id === 'model') return texts.modelLine
  if (slot.id === 'params') return texts.paramLine
  if (slot.id === 'date') return texts.dateLine
  if (slot.id === 'artist') return texts.artistLine
  return '' // logo slot 不走文字
}

function renderBottomSlotText(
  slot: FrameContentSlot,
  text: string,
  barTop: number,
  barH: number,
  canvasW: number,
  geometry: FrameGeometry,
  layout: FrameLayout,
  italicSet: Set<'georgia' | 'typewriter'>,
): string {
  const fontPx = scaleByMinEdge(slot.fontSize, geometry.imgW, geometry.imgH)
  const baselineY = barTop + Math.round(slot.anchor.y * barH + fontPx * 0.35)
  const x = Math.round(slot.anchor.x * canvasW)
  const color = escSvgText(slot.colorOverride ?? layout.textColor)
  const fontStack = escSvgText(resolveSvgFontStack(slot.fontFamily))
  const fontStyle = italicSet.has(slot.fontFamily as 'georgia' | 'typewriter') ? ' font-style="italic"' : ''
  return `<text x="${x}" y="${baselineY}" font-family="${fontStack}" font-size="${fontPx}" fill="${color}" text-anchor="${alignToSvgAnchor(slot.align)}"${fontStyle}>${escSvgText(text)}</text>`
}

// ============================================================================
// Gallery generator 实例(Black / White 共用,layout 数据决定配色)
// ============================================================================

/**
 * Gallery Black / White 共用的 generator。
 *
 * Gallery 只用衬线字做斜体(Georgia model / Georgia artist);
 * date slot 的 fontFamily 是 mono,不走 italic。
 */
export const generateGallery: FrameSvgGenerator = createBottomTextGenerator({
  italicFontFamilies: ['georgia'],
})

/**
 * Editorial Caption 的 generator。
 *
 * 与 Gallery 的差异:开启 topSeparator 在 caption 顶部画一根极细黑线
 * (杂志版式的标志性视觉元素)。
 */
export const generateEditorialCaption: FrameSvgGenerator = createBottomTextGenerator({
  italicFontFamilies: [], // Editorial 用 Inter 粗体,不 italic
  topSeparator: true,
})
