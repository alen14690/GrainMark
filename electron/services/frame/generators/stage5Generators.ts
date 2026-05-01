/**
 * stage5Generators — 阶段 5 的 14 个高级质感风格 SVG 生成器集合(2026-05-01)
 *
 * 设计原则:
 *   后端 SVG 产出必须与前端 GenericOverlayLayout 的视觉 1:1 对齐
 *   - 前端 = CSS 装饰 + 内嵌文字(装饰组件自己排版文字)
 *   - 后端 = SVG 装饰几何 + SVG <text>(坐标跟装饰几何严格匹配)
 *
 * 为什么不继续用 slotPlacement + anchor:
 *   阶段 5 的装饰(玻璃条 / 金章 / 浮卡 / 霓虹边)都是"几何整体",
 *   文字是该几何的组成部分而非独立浮动 · 用 anchor 会让装饰和文字坐标分离。
 *
 * 14 风格分派:
 *   glass:     frosted-glass · glass-chip
 *   oil:       oil-texture · watercolor-caption
 *   ambient:   ambient-glow · bokeh-pillar
 *   cinema:    cinema-scope · neon-edge
 *   editorial: swiss-grid · contact-sheet
 *   metal:     brushed-metal · medal-plate
 *   floating:  floating-caption · stamp-corner
 *
 * 共享工具:
 *   - drawText:SVG <text> 基础生成,自动 baseline 偏移 0.35·fontSize
 *   - truncateByWidth:按给定最大像素宽度智能截断文字
 *   - ESC:XML 转义
 */
import type { FrameGeneratorContext, FrameSvgGenerator } from '../composite.js'
import { escSvgText, resolveSvgFontStack } from '../typography.js'

// ============================================================================
// 共享工具
// ============================================================================

const ESC = escSvgText

interface DrawTextOpts {
  x: number
  y: number
  text: string
  fontSizePx: number
  fontFamily: 'inter' | 'mono' | 'georgia' | 'courier' | 'typewriter'
  color: string
  italic?: boolean
  weight?: number
  align?: 'left' | 'center' | 'right'
  letterSpacing?: number
  textShadow?: string
}

/**
 * 生成 SVG `<text>` 元素 · 自动基线补偿 · color/align/weight 可选
 */
function drawText(opts: DrawTextOpts): string {
  if (!opts.text) return ''
  const anchor = opts.align === 'center' ? 'middle' : opts.align === 'right' ? 'end' : 'start'
  const fontFamily = ESC(resolveSvgFontStack(opts.fontFamily))
  // SVG baseline 对齐 · 多数 generator 里约定 y 为字顶 · 用 0.78 基线补偿
  const y = Math.round(opts.y + opts.fontSizePx * 0.78)
  const weight = opts.weight != null ? ` font-weight="${opts.weight}"` : ''
  const italic = opts.italic ? ' font-style="italic"' : ''
  const ls = opts.letterSpacing != null ? ` letter-spacing="${opts.letterSpacing}"` : ''
  const filter = opts.textShadow ? ` style="filter:${ESC(opts.textShadow)}"` : ''
  return `<text x="${Math.round(opts.x)}" y="${y}" font-family="${fontFamily}" font-size="${opts.fontSizePx}" fill="${ESC(opts.color)}" text-anchor="${anchor}"${weight}${italic}${ls}${filter}>${ESC(opts.text)}</text>`
}

/**
 * 简单按字符宽度估算截断
 *
 * SVG 没法真实测量字宽 · 用保守的 charWidthRatio × fontSize 做近似
 *   - 0.62 适合 Inter/system-ui(比例字体平均)
 *   - monospace(Courier/JetBrains Mono)字宽约 0.6 · 但 letter-spacing 会额外加宽
 *   - letterSpacing 参数:SVG letter-spacing 是在每字符后追加的像素值
 *
 * 宁可多截一字也不能溢出!
 */
function truncateByWidth(text: string, maxPx: number, fontSizePx: number, letterSpacing = 0): string {
  if (!text) return ''
  // 每字符实际占宽 = 字形宽(0.62 × fontSize) + letter-spacing
  const charW = fontSizePx * 0.62 + letterSpacing
  const maxChars = Math.floor(maxPx / charW)
  if (text.length <= maxChars) return text
  if (maxChars <= 3) return text.slice(0, Math.max(1, maxChars))
  return `${text.slice(0, maxChars - 1)}…`
}

/** 按 minEdge 计算 · 与前端 scale() 对齐 · 保证前后端字号一致 */
function minEdge(g: FrameGeneratorContext['geometry']): number {
  return Math.min(g.imgW, g.imgH)
}

// ============================================================================
// GLASS
// ============================================================================

const generateFrostedGlass: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout } = geometry
  const me = minEdge(geometry)
  const padX = canvasW * 0.05
  const barBottom = canvasH * 0.05
  const barHText = me * 0.055 // 约 2 行文字 + padding
  const barTop = canvasH - barBottom - barHText
  const paddingH = me * 0.018
  const paddingV = me * 0.014
  const fontModel = me * 0.022
  const fontParam = me * 0.016

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${ESC(layout.backgroundColor)}"/>
  ${/* 磨砂玻璃条 · 半透明白 · 实色近似(SVG 无 backdrop-filter) */ ''}
  <rect x="${padX}" y="${barTop}" width="${canvasW - padX * 2}" height="${barHText}" rx="14" ry="14" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
  ${drawText({
    x: padX + paddingH,
    y: barTop + paddingV,
    text: truncateByWidth(modelLine, canvasW - padX * 2 - paddingH * 2, fontModel),
    fontSizePx: fontModel,
    fontFamily: 'inter',
    color: '#ffffff',
    weight: 600,
  })}
  ${drawText({
    x: padX + paddingH,
    y: barTop + paddingV + fontModel * 1.3,
    text: truncateByWidth(paramLine, canvasW - padX * 2 - paddingH * 2, fontParam),
    fontSizePx: fontParam,
    fontFamily: 'mono',
    color: 'rgba(255,255,255,0.88)',
  })}
</svg>`
}

const generateGlassChip: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout } = geometry
  const me = minEdge(geometry)
  const fontModel = me * 0.015
  const fontParam = me * 0.012
  const chipH = me * 0.055
  const chipMargin = me * 0.04
  const dotSize = me * 0.03
  const padL = chipMargin + dotSize + 10 // 10px 是 dot 和文字之间的 gap
  const maxChipW = canvasW * 0.6
  const modelTrunc = truncateByWidth(modelLine, maxChipW - padL - chipMargin, fontModel)
  const paramTrunc = truncateByWidth(paramLine, maxChipW - padL - chipMargin, fontParam)
  // 估算 chip 实际宽度(近似 · 以较长的字串决定)
  const textMaxW = Math.max(modelTrunc.length * fontModel * 0.55, paramTrunc.length * fontParam * 0.55)
  const chipW = Math.min(maxChipW, padL + textMaxW + me * 0.02)
  const chipX = canvasW - chipMargin - chipW
  const chipY = canvasH - chipMargin - chipH

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${ESC(layout.backgroundColor)}"/>
  <rect x="${chipX}" y="${chipY}" width="${chipW}" height="${chipH}" rx="${chipH / 2}" ry="${chipH / 2}" fill="rgba(20,20,20,0.7)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
  <defs>
    <linearGradient id="dot-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff8c42"/>
      <stop offset="1" stop-color="#ff3a3a"/>
    </linearGradient>
  </defs>
  <circle cx="${chipX + chipMargin / 2 + dotSize / 2}" cy="${chipY + chipH / 2}" r="${dotSize / 2}" fill="url(#dot-grad)" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
  ${drawText({
    x: chipX + padL,
    y: chipY + chipH * 0.15,
    text: modelTrunc,
    fontSizePx: fontModel,
    fontFamily: 'mono',
    color: '#ffffff',
    weight: 600,
  })}
  ${drawText({
    x: chipX + padL,
    y: chipY + chipH * 0.5,
    text: paramTrunc,
    fontSizePx: fontParam,
    fontFamily: 'mono',
    color: 'rgba(255,255,255,0.8)',
  })}
</svg>`
}

// ============================================================================
// OIL
// ============================================================================

const generateOilTexture: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout, orientation } = geometry
  const me = minEdge(geometry)
  const fontTitle = me * (orientation === 'portrait' ? 0.034 : 0.03)
  const fontSub = me * 0.015
  const captionBottom = canvasH * 0.04
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#F3ECE0"/>
  ${/* 油画纹理 · 用半透明 pattern 模拟 */ ''}
  <defs>
    <pattern id="oil-weave" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(33)">
      <line x1="0" y1="0" x2="0" y2="3" stroke="rgba(120,90,60,0.12)" stroke-width="1"/>
    </pattern>
    <radialGradient id="oil-warm1" cx="30%" cy="20%" r="50%">
      <stop offset="0" stop-color="rgba(200,170,120,0.2)"/>
      <stop offset="1" stop-color="rgba(200,170,120,0)"/>
    </radialGradient>
    <radialGradient id="oil-warm2" cx="70%" cy="80%" r="60%">
      <stop offset="0" stop-color="rgba(180,140,100,0.15)"/>
      <stop offset="1" stop-color="rgba(180,140,100,0)"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#oil-weave)"/>
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#oil-warm1)"/>
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#oil-warm2)"/>
  ${/* 底部标题 + 副标 */ ''}
  ${drawText({
    x: canvasW / 2,
    y: canvasH - captionBottom - fontSub * 1.5 - fontTitle,
    text: truncateByWidth(modelLine, canvasW * 0.85, fontTitle),
    fontSizePx: fontTitle,
    fontFamily: 'georgia',
    color: '#3A2E1E',
    italic: true,
    align: 'center',
  })}
  ${drawText({
    x: canvasW / 2,
    y: canvasH - captionBottom - fontSub,
    text: truncateByWidth(paramLine, canvasW * 0.85, fontSub, fontSub * 0.12),
    fontSizePx: fontSub,
    fontFamily: 'georgia',
    color: '#7D6C4E',
    align: 'center',
    letterSpacing: fontSub * 0.12,
  })}
  ${/* 引用 layout 避免未用警告 · 仅标记文档 · 不影响输出 */ ''}
  <!-- bg=${ESC(layout.backgroundColor)} -->
</svg>`
}

const generateWatercolorCaption: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout, orientation } = geometry
  const me = minEdge(geometry)
  const fontTitle = me * (orientation === 'portrait' ? 0.036 : 0.032)
  const fontSub = me * 0.016
  const padL = canvasW * 0.06
  const captionBottom = canvasH * 0.04
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} bg=${ESC(layout.backgroundColor)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#FDFAF4"/>
  ${drawText({
    x: padL,
    y: canvasH - captionBottom - fontSub * 1.5 - fontTitle,
    text: truncateByWidth(modelLine, canvasW - padL * 2, fontTitle),
    fontSizePx: fontTitle,
    fontFamily: 'georgia',
    color: '#3A2E1E',
    italic: true,
  })}
  ${drawText({
    x: padL,
    y: canvasH - captionBottom - fontSub,
    text: truncateByWidth(paramLine, canvasW - padL * 2, fontSub),
    fontSizePx: fontSub,
    fontFamily: 'georgia',
    color: '#7D6C4E',
    italic: true,
  })}
</svg>`
}

// ============================================================================
// AMBIENT
// ============================================================================
//
// 注:ambient-glow / bokeh-pillar 需要照片自身高斯模糊作底 · SVG 可用 filter
//     但 Sharp 环境下 <filter> 执行代价高 · 本实现用半透明暗色叠加近似
//     用户看到的 CSS 预览有真实 blur · 实渲 SVG 退化为暗底 + 暗幕

const generateAmbientGlow: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout, orientation } = geometry
  const me = minEdge(geometry)
  const fontTitle = me * (orientation === 'portrait' ? 0.028 : 0.022)
  const fontSub = me * 0.016
  const captionBottom = canvasH * 0.05
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} bg=${ESC(layout.backgroundColor)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#0A0A0A"/>
  ${/* 深色渐变 · 模拟 blur 氛围 */ ''}
  <defs>
    <radialGradient id="glow-grad" cx="50%" cy="50%" r="70%">
      <stop offset="0" stop-color="rgba(100,80,60,0.3)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.6)"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#glow-grad)"/>
  ${drawText({
    x: canvasW / 2,
    y: canvasH - captionBottom - fontSub * 1.5 - fontTitle,
    text: truncateByWidth(modelLine, canvasW * 0.84, fontTitle),
    fontSizePx: fontTitle,
    fontFamily: 'inter',
    color: 'rgba(255,255,255,0.95)',
    weight: 500,
    align: 'center',
    letterSpacing: fontTitle * 0.05,
  })}
  ${drawText({
    x: canvasW / 2,
    y: canvasH - captionBottom - fontSub,
    text: truncateByWidth(paramLine, canvasW * 0.84, fontSub),
    fontSizePx: fontSub,
    fontFamily: 'mono',
    color: 'rgba(255,255,255,0.8)',
    align: 'center',
    letterSpacing: fontSub * 0.06,
  })}
</svg>`
}

const generateBokehPillar: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout } = geometry
  const me = minEdge(geometry)
  const fontPx = me * 0.014
  const pad = canvasW * 0.04
  const modelTrunc = truncateByWidth(modelLine, canvasW * 0.4, fontPx, fontPx * 0.08)
  const paramTrunc = truncateByWidth(paramLine, canvasW * 0.4, fontPx, fontPx * 0.08)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} bg=${ESC(layout.backgroundColor)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#050505"/>
  <defs>
    <radialGradient id="bokeh" cx="50%" cy="50%" r="80%">
      <stop offset="0" stop-color="rgba(80,60,40,0.4)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.75)"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#bokeh)"/>
  ${drawText({
    x: pad,
    y: canvasH - pad - fontPx,
    text: modelTrunc,
    fontSizePx: fontPx,
    fontFamily: 'mono',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: fontPx * 0.08,
  })}
  ${drawText({
    x: canvasW - pad,
    y: canvasH - pad - fontPx,
    text: paramTrunc,
    fontSizePx: fontPx,
    fontFamily: 'mono',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: fontPx * 0.08,
    align: 'right',
  })}
</svg>`
}

// ============================================================================
// CINEMA
// ============================================================================

const generateCinemaScope: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout } = geometry
  const me = minEdge(geometry)
  const barH = geometry.borderTopPx
  const fontTop = me * 0.013
  const fontBot = me * 0.02
  const padX = canvasW * 0.05
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} bg=${ESC(layout.backgroundColor)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#000000"/>
  ${/* 顶部 REC 红点 + 机型 · 左对齐 */ ''}
  <circle cx="${padX}" cy="${barH * 0.5}" r="${me * 0.006}" fill="#FF6B00"/>
  ${drawText({
    x: padX + me * 0.025,
    y: barH * 0.5 - fontTop * 0.5,
    text: truncateByWidth(`REC · ${modelLine}`, canvasW - padX * 2 - me * 0.025, fontTop, fontTop * 0.15),
    fontSizePx: fontTop,
    fontFamily: 'courier',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: fontTop * 0.15,
  })}
  ${/* 底部参数居中大字 */ ''}
  ${drawText({
    x: canvasW / 2,
    y: canvasH - barH * 0.5 - fontBot * 0.5,
    text: truncateByWidth(paramLine, canvasW - padX * 2, fontBot, fontBot * 0.3),
    fontSizePx: fontBot,
    fontFamily: 'courier',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: fontBot * 0.3,
    weight: 600,
    align: 'center',
  })}
</svg>`
}

const generateNeonEdge: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout, imgOffsetX, imgOffsetY, imgW, imgH } = geometry
  const me = minEdge(geometry)
  const fontModel = me * 0.022
  const fontParam = me * 0.016
  const cornerPadX = canvasW * 0.02
  const cornerPadY = canvasH * 0.03
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} bg=${ESC(layout.backgroundColor)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#0A0612"/>
  ${/* 霓虹辉光边 · 多层描边叠加 */ ''}
  <rect x="${imgOffsetX - 4}" y="${imgOffsetY - 4}" width="${imgW + 8}" height="${imgH + 8}" fill="none" stroke="#7C5FE8" stroke-width="2" opacity="0.5"/>
  <rect x="${imgOffsetX - 2}" y="${imgOffsetY - 2}" width="${imgW + 4}" height="${imgH + 4}" fill="none" stroke="#E8B86D" stroke-width="2" opacity="0.8"/>
  ${/* 右下角字 · 落在图像内部边缘 */ ''}
  ${drawText({
    x: imgOffsetX + imgW - cornerPadX,
    y: imgOffsetY + imgH - cornerPadY - fontModel - fontParam * 1.3,
    text: truncateByWidth(modelLine, imgW * 0.55, fontModel, fontModel * 0.05),
    fontSizePx: fontModel,
    fontFamily: 'mono',
    color: '#ffffff',
    align: 'right',
    letterSpacing: fontModel * 0.05,
  })}
  ${drawText({
    x: imgOffsetX + imgW - cornerPadX,
    y: imgOffsetY + imgH - cornerPadY - fontParam * 0.5,
    text: truncateByWidth(paramLine, imgW * 0.55, fontParam, fontParam * 0.08),
    fontSizePx: fontParam,
    fontFamily: 'mono',
    color: '#E8B86D',
    align: 'right',
    letterSpacing: fontParam * 0.08,
  })}
</svg>`
}

// ============================================================================
// EDITORIAL
// ============================================================================

const generateSwissGrid: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, exif, style } = ctx
  const { canvasW, canvasH, layout, orientation } = geometry
  const me = minEdge(geometry)
  const fontTitle = me * (orientation === 'portrait' ? 0.034 : 0.028)
  const fontLens = me * 0.014
  const fontParam = me * 0.014
  const pad = canvasW * 0.05
  const captionBottom = canvasH * 0.04
  const lensText = (exif.lensModel ?? '').toUpperCase() || '—'
  const lineY = canvasH - captionBottom - fontTitle - fontLens * 1.2 - 8
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} bg=${ESC(layout.backgroundColor)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#F5F2EA"/>
  ${/* 分割线 */ ''}
  <line x1="${pad}" y1="${lineY}" x2="${canvasW - pad}" y2="${lineY}" stroke="rgba(26,26,26,0.25)" stroke-width="1"/>
  ${/* 左侧:机型 + 镜头(小字) */ ''}
  ${drawText({
    x: pad,
    y: canvasH - captionBottom - fontLens * 1.2 - fontTitle,
    text: truncateByWidth(modelLine, canvasW * 0.6 - pad, fontTitle),
    fontSizePx: fontTitle,
    fontFamily: 'inter',
    color: '#1A1A1A',
    weight: 700,
  })}
  ${drawText({
    x: pad,
    y: canvasH - captionBottom - fontLens,
    text: truncateByWidth(lensText, canvasW * 0.6 - pad, fontLens, fontLens * 0.14),
    fontSizePx: fontLens,
    fontFamily: 'inter',
    color: '#666666',
    letterSpacing: fontLens * 0.14,
  })}
  ${/* 右侧:参数 mono */ ''}
  ${drawText({
    x: canvasW - pad,
    y: canvasH - captionBottom - fontParam,
    text: truncateByWidth(paramLine, canvasW * 0.38, fontParam, fontParam * 0.06),
    fontSizePx: fontParam,
    fontFamily: 'mono',
    color: '#444444',
    align: 'right',
    letterSpacing: fontParam * 0.06,
  })}
</svg>`
}

const generateContactSheet: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, exif, style } = ctx
  const { canvasW, canvasH, layout, orientation } = geometry
  const me = minEdge(geometry)
  const kodakBandH = canvasH * 0.03
  const captionBottom = canvasH * 0.03
  const fontKodak = Math.max(me * 0.01, 10)
  const fontGrid = me * 0.013
  const fontGridLabel = me * 0.01
  const pad = canvasW * 0.04
  const cols = orientation === 'portrait' ? 2 : 3

  // 短镜头
  const shortLens = (lens?: string) => {
    if (!lens) return '—'
    const m = lens.match(/(\d+(?:-\d+)?mm(?:\s*F[\d.]+)?)/i)
    return m?.[1] ?? lens.slice(0, 20)
  }
  const items: Array<{ label: string; value: string }> = [
    { label: 'CAMERA', value: exif.model || '—' },
    { label: 'LENS', value: shortLens(exif.lensModel) },
    { label: 'FOCAL', value: exif.focalLength ? `${exif.focalLength}mm` : '—' },
    { label: 'APERTURE', value: exif.fNumber ? `f/${exif.fNumber}` : '—' },
    { label: 'SHUTTER', value: exif.exposureTime || '—' },
    { label: 'ISO', value: exif.iso ? `${exif.iso}` : '—' },
  ]
  const cellW = (canvasW - pad * 2) / cols
  const rowH = fontGridLabel + fontGrid + 8 // 小字 + 大字 + gap
  const gridItems = items
    .map((item, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = pad + col * cellW
      const y = canvasH - captionBottom - (Math.ceil(items.length / cols) - row) * (rowH + 6)
      return `${drawText({
        x,
        y,
        text: item.label,
        fontSizePx: fontGridLabel,
        fontFamily: 'courier',
        color: 'rgba(42,42,42,0.55)',
        weight: 700,
        letterSpacing: fontGridLabel * 0.15,
      })}
  ${drawText({
    x,
    y: y + fontGridLabel + 2,
    text: truncateByWidth(item.value, cellW - 8, fontGrid),
    fontSizePx: fontGrid,
    fontFamily: 'courier',
    color: '#2A2A2A',
  })}`
    })
    .join('\n  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} bg=${ESC(layout.backgroundColor)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#EDE8D9"/>
  ${/* KODAK 橙带 */ ''}
  <rect x="0" y="0" width="${canvasW}" height="${kodakBandH}" fill="#D4A017"/>
  ${drawText({
    x: canvasW / 2,
    y: kodakBandH * 0.5 - fontKodak * 0.5,
    text: truncateByWidth(`KODAK GOLD 200 · ${modelLine}`, canvasW * 0.85, fontKodak, fontKodak * 0.3),
    fontSizePx: fontKodak,
    fontFamily: 'courier',
    color: '#3A2A00',
    weight: 700,
    align: 'center',
    letterSpacing: fontKodak * 0.3,
  })}
  ${gridItems}
</svg>`
}

// ============================================================================
// GLASS 扩展
// ============================================================================

const generateGlassGradient: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout } = geometry
  const me = minEdge(geometry)
  const padX = canvasW * 0.05
  const barBottom = canvasH * 0.05
  const barH = me * 0.055
  const barTop = canvasH - barBottom - barH
  const paddingH = me * 0.018
  const paddingV = me * 0.014
  const fontModel = me * 0.022
  const fontParam = me * 0.016

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${ESC(layout.backgroundColor)}"/>
  <defs>
    <linearGradient id="glass-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="rgba(120,80,220,0.25)"/>
      <stop offset="0.5" stop-color="rgba(80,180,220,0.2)"/>
      <stop offset="1" stop-color="rgba(220,120,80,0.25)"/>
    </linearGradient>
  </defs>
  <rect x="${padX}" y="${barTop}" width="${canvasW - padX * 2}" height="${barH}" rx="14" ry="14" fill="url(#glass-grad)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
  ${drawText({ x: padX + paddingH, y: barTop + paddingV, text: truncateByWidth(modelLine, canvasW - padX * 2 - paddingH * 2, fontModel), fontSizePx: fontModel, fontFamily: 'inter', color: '#ffffff', weight: 600 })}
  ${drawText({ x: padX + paddingH, y: barTop + paddingV + fontModel * 1.3, text: truncateByWidth(paramLine, canvasW - padX * 2 - paddingH * 2, fontParam), fontSizePx: fontParam, fontFamily: 'mono', color: 'rgba(255,255,255,0.88)' })}
</svg>`
}

const generateGlassMinimal: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout } = geometry
  const me = minEdge(geometry)
  const padX = canvasW * 0.04
  const padY = canvasH * 0.04
  const fontModel = me * 0.013
  const fontParam = me * 0.011
  const tagW = Math.min(
    canvasW * 0.4,
    Math.max(modelLine.length, paramLine.length) * fontModel * 0.55 + me * 0.03,
  )
  const tagH = fontModel + fontParam + me * 0.02
  const tagX = padX
  const tagY = canvasH - padY - tagH

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${ESC(layout.backgroundColor)}"/>
  <rect x="${tagX}" y="${tagY}" width="${tagW}" height="${tagH}" rx="6" ry="6" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" stroke-width="0.5"/>
  ${drawText({ x: tagX + me * 0.01, y: tagY + me * 0.008, text: truncateByWidth(modelLine, tagW - me * 0.02, fontModel), fontSizePx: fontModel, fontFamily: 'mono', color: 'rgba(255,255,255,0.9)' })}
  ${drawText({ x: tagX + me * 0.01, y: tagY + me * 0.008 + fontModel * 1.3, text: truncateByWidth(paramLine, tagW - me * 0.02, fontParam), fontSizePx: fontParam, fontFamily: 'mono', color: 'rgba(255,255,255,0.7)' })}
</svg>`
}

// ============================================================================
// OIL 扩展
// ============================================================================

const generateOilClassic: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, borderBottomPx, imgOffsetY, imgH } = geometry
  const me = minEdge(geometry)
  const fontModel = me * 0.02
  const fontParam = me * 0.013
  const plateTop = imgOffsetY + imgH
  const centerY = plateTop + borderBottomPx / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#F5F0E6"/>
  <defs>
    <pattern id="oil-canvas" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(30)">
      <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(140,110,70,0.06)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#oil-canvas)"/>
  ${drawText({ x: canvasW / 2, y: centerY - fontModel * 0.8, text: truncateByWidth(modelLine, canvasW * 0.8, fontModel), fontSizePx: fontModel, fontFamily: 'georgia', color: '#3A2E1E', align: 'center', italic: true })}
  ${drawText({ x: canvasW / 2, y: centerY + fontParam * 0.5, text: truncateByWidth(paramLine, canvasW * 0.8, fontParam), fontSizePx: fontParam, fontFamily: 'georgia', color: '#7D6C4E', align: 'center' })}
</svg>`
}

// ============================================================================
// AMBIENT 扩展
// ============================================================================

const generateAmbientVinyl: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, borderBottomPx, imgOffsetY, imgH } = geometry
  const me = minEdge(geometry)
  const fontModel = me * 0.02
  const fontParam = me * 0.014
  const plateTop = imgOffsetY + imgH
  const centerY = plateTop + borderBottomPx / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#0A0A0A"/>
  <defs>
    <radialGradient id="vinyl-glow" cx="50%" cy="40%" r="60%">
      <stop offset="0" stop-color="rgba(120,80,180,0.2)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.6)"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#vinyl-glow)"/>
  ${drawText({ x: canvasW / 2, y: centerY - fontModel * 0.8, text: truncateByWidth(modelLine, canvasW * 0.8, fontModel), fontSizePx: fontModel, fontFamily: 'inter', color: 'rgba(255,255,255,0.95)', weight: 500, align: 'center' })}
  ${drawText({ x: canvasW / 2, y: centerY + fontParam * 0.5, text: truncateByWidth(paramLine, canvasW * 0.8, fontParam), fontSizePx: fontParam, fontFamily: 'mono', color: 'rgba(255,255,255,0.7)', align: 'center' })}
</svg>`
}

const generateAmbientAura: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, borderBottomPx, imgOffsetY, imgH } = geometry
  const me = minEdge(geometry)
  const fontModel = me * 0.02
  const fontParam = me * 0.014
  const plateTop = imgOffsetY + imgH
  const centerY = plateTop + borderBottomPx / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#0A0A0A"/>
  <defs>
    <radialGradient id="aura-top" cx="30%" cy="20%" r="50%">
      <stop offset="0" stop-color="rgba(200,100,50,0.2)"/>
      <stop offset="1" stop-color="transparent"/>
    </radialGradient>
    <radialGradient id="aura-bot" cx="70%" cy="80%" r="50%">
      <stop offset="0" stop-color="rgba(50,100,200,0.2)"/>
      <stop offset="1" stop-color="transparent"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#aura-top)"/>
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#aura-bot)"/>
  ${drawText({ x: canvasW / 2, y: centerY - fontModel * 0.8, text: truncateByWidth(modelLine, canvasW * 0.8, fontModel), fontSizePx: fontModel, fontFamily: 'inter', color: 'rgba(255,255,255,0.95)', weight: 500, align: 'center' })}
  ${drawText({ x: canvasW / 2, y: centerY + fontParam * 0.5, text: truncateByWidth(paramLine, canvasW * 0.8, fontParam), fontSizePx: fontParam, fontFamily: 'mono', color: 'rgba(255,255,255,0.75)', align: 'center' })}
</svg>`
}

const generateAmbientSoft: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, borderBottomPx, imgOffsetY, imgH } = geometry
  const me = minEdge(geometry)
  const fontModel = me * 0.018
  const fontParam = me * 0.013
  const plateTop = imgOffsetY + imgH
  const centerY = plateTop + borderBottomPx / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#F8F6F2"/>
  <defs>
    <radialGradient id="soft-glow" cx="50%" cy="40%" r="55%">
      <stop offset="0" stop-color="rgba(255,250,240,0)"/>
      <stop offset="1" stop-color="rgba(248,246,242,0.9)"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#soft-glow)"/>
  ${drawText({ x: canvasW / 2, y: centerY - fontModel * 0.8, text: truncateByWidth(modelLine, canvasW * 0.8, fontModel), fontSizePx: fontModel, fontFamily: 'inter', color: '#2A2A2A', weight: 500, align: 'center' })}
  ${drawText({ x: canvasW / 2, y: centerY + fontParam * 0.5, text: truncateByWidth(paramLine, canvasW * 0.8, fontParam), fontSizePx: fontParam, fontFamily: 'mono', color: '#888888', align: 'center' })}
</svg>`
}

const generateAmbientDark: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, borderBottomPx, imgOffsetY, imgH } = geometry
  const me = minEdge(geometry)
  const fontModel = me * 0.016
  const fontParam = me * 0.012
  const plateTop = imgOffsetY + imgH
  const centerY = plateTop + borderBottomPx / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#050505"/>
  <defs>
    <radialGradient id="dark-fog" cx="50%" cy="35%" r="65%">
      <stop offset="0" stop-color="rgba(40,35,30,0.3)"/>
      <stop offset="1" stop-color="rgba(5,5,5,0.8)"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#dark-fog)"/>
  ${drawText({ x: canvasW / 2, y: centerY - fontModel * 0.8, text: truncateByWidth(modelLine, canvasW * 0.8, fontModel), fontSizePx: fontModel, fontFamily: 'inter', color: 'rgba(255,255,255,0.85)', weight: 400, align: 'center' })}
  ${drawText({ x: canvasW / 2, y: centerY + fontParam * 0.5, text: truncateByWidth(paramLine, canvasW * 0.8, fontParam), fontSizePx: fontParam, fontFamily: 'mono', color: 'rgba(255,255,255,0.5)', align: 'center' })}
</svg>`
}

const generateAmbientGradient: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, borderBottomPx, imgOffsetY, imgH } = geometry
  const me = minEdge(geometry)
  const fontModel = me * 0.018
  const fontParam = me * 0.013
  const plateTop = imgOffsetY + imgH
  const centerY = plateTop + borderBottomPx / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#1A0F08"/>
  <defs>
    <linearGradient id="warm-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(200,120,50,0.15)"/>
      <stop offset="0.5" stop-color="rgba(180,80,30,0.25)"/>
      <stop offset="1" stop-color="rgba(26,15,8,0.8)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="url(#warm-grad)"/>
  ${drawText({ x: canvasW / 2, y: centerY - fontModel * 0.8, text: truncateByWidth(modelLine, canvasW * 0.8, fontModel), fontSizePx: fontModel, fontFamily: 'inter', color: 'rgba(255,255,255,0.92)', weight: 500, align: 'center' })}
  ${drawText({ x: canvasW / 2, y: centerY + fontParam * 0.5, text: truncateByWidth(paramLine, canvasW * 0.8, fontParam), fontSizePx: fontParam, fontFamily: 'mono', color: 'rgba(255,220,180,0.75)', align: 'center' })}
</svg>`
}

// ============================================================================
// CINEMA 扩展
// ============================================================================

const generateCinemaLetterbox: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, borderBottomPx } = geometry
  const me = minEdge(geometry)
  const fontModel = me * 0.016
  const fontParam = me * 0.012
  const centerBot = canvasH - borderBottomPx / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#000000"/>
  ${drawText({ x: canvasW / 2, y: centerBot - fontModel * 0.8, text: truncateByWidth(modelLine, canvasW * 0.8, fontModel, fontModel * 0.1), fontSizePx: fontModel, fontFamily: 'courier', color: 'rgba(255,255,255,0.85)', align: 'center', letterSpacing: fontModel * 0.1 })}
  ${drawText({ x: canvasW / 2, y: centerBot + fontParam * 0.3, text: truncateByWidth(paramLine, canvasW * 0.8, fontParam, fontParam * 0.08), fontSizePx: fontParam, fontFamily: 'courier', color: 'rgba(255,255,255,0.6)', align: 'center', letterSpacing: fontParam * 0.08 })}
</svg>`
}

const generateCinemaTimestamp: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout } = geometry
  const me = minEdge(geometry)
  const fontModel = me * 0.014
  const fontParam = me * 0.011
  const padX = canvasW * 0.03
  const padY = canvasH * 0.04

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="${ESC(layout.backgroundColor)}"/>
  ${drawText({ x: padX, y: canvasH - padY - fontParam * 1.4 - fontModel, text: truncateByWidth(modelLine, canvasW * 0.6, fontModel, fontModel * 0.08), fontSizePx: fontModel, fontFamily: 'courier', color: '#00FF66', letterSpacing: fontModel * 0.08 })}
  ${drawText({ x: padX, y: canvasH - padY - fontParam * 0.2, text: truncateByWidth(paramLine, canvasW * 0.6, fontParam, fontParam * 0.06), fontSizePx: fontParam, fontFamily: 'courier', color: 'rgba(0,255,102,0.7)', letterSpacing: fontParam * 0.06 })}
</svg>`
}

// ============================================================================
// EDITORIAL 扩展
// ============================================================================

const generateEditorialMinimal: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, borderBottomPx, imgOffsetY, imgH } = geometry
  const me = minEdge(geometry)
  const fontModel = me * 0.014
  const fontParam = me * 0.011
  const plateTop = imgOffsetY + imgH
  const centerY = plateTop + borderBottomPx / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#FFFFFF"/>
  ${drawText({ x: canvasW / 2, y: centerY - fontModel * 0.8, text: truncateByWidth(modelLine, canvasW * 0.8, fontModel), fontSizePx: fontModel, fontFamily: 'inter', color: '#1A1A1A', align: 'center' })}
  ${drawText({ x: canvasW / 2, y: centerY + fontParam * 0.5, text: truncateByWidth(paramLine, canvasW * 0.8, fontParam), fontSizePx: fontParam, fontFamily: 'mono', color: '#888888', align: 'center' })}
</svg>`
}

// ============================================================================
// FLOATING
// ============================================================================

const generateFloatingCaption: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout, orientation } = geometry
  const me = minEdge(geometry)
  const fontModel = me * (orientation === 'portrait' ? 0.022 : 0.02)
  const fontParam = me * 0.014
  const cardPadX = me * 0.02
  const cardPadY = me * 0.014
  const barW = 3
  const maxCardW = canvasW * (orientation === 'portrait' ? 0.7 : 0.5)
  const modelTrunc = truncateByWidth(modelLine, maxCardW - cardPadX * 2 - barW - 8, fontModel)
  const paramTrunc = truncateByWidth(paramLine, maxCardW - cardPadX * 2 - barW - 8, fontParam)
  const textLen = Math.max(modelTrunc.length * fontModel * 0.55, paramTrunc.length * fontParam * 0.55)
  const cardW = Math.min(maxCardW, textLen + cardPadX * 2 + barW + 8)
  const cardH = cardPadY * 2 + fontModel + fontParam + 4
  const cardX = canvasW - canvasW * 0.04 - cardW
  const cardY = canvasH - canvasH * 0.04 - cardH
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} bg=${ESC(layout.backgroundColor)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#0A0A0A"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="#ffffff" rx="3" ry="3"/>
  <rect x="${cardX}" y="${cardY}" width="${barW}" height="${cardH}" fill="#FF6B00"/>
  ${drawText({
    x: cardX + barW + cardPadX,
    y: cardY + cardPadY,
    text: modelTrunc,
    fontSizePx: fontModel,
    fontFamily: 'inter',
    color: '#1A1A1A',
    weight: 700,
  })}
  ${drawText({
    x: cardX + barW + cardPadX,
    y: cardY + cardPadY + fontModel + 4,
    text: paramTrunc,
    fontSizePx: fontParam,
    fontFamily: 'mono',
    color: '#444444',
    letterSpacing: fontParam * 0.04,
  })}
</svg>`
}

const generateStampCorner: FrameSvgGenerator = (ctx: FrameGeneratorContext) => {
  const { geometry, modelLine, paramLine, style } = ctx
  const { canvasW, canvasH, layout } = geometry
  const me = minEdge(geometry)
  const fontModel = me * 0.03
  const fontParam = me * 0.014
  const padX = canvasW * 0.04
  const padY = canvasH * 0.04
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <!-- style=${ESC(style.id)} bg=${ESC(layout.backgroundColor)} -->
  <rect x="0" y="0" width="${canvasW}" height="${canvasH}" fill="#0A0A0A"/>
  ${drawText({
    x: canvasW - padX,
    y: canvasH - padY - fontParam * 1.4 - fontModel,
    text: truncateByWidth(modelLine, canvasW * 0.6, fontModel, fontModel * 0.05),
    fontSizePx: fontModel,
    fontFamily: 'courier',
    color: '#FF6B00',
    weight: 700,
    align: 'right',
    letterSpacing: fontModel * 0.05,
  })}
  ${drawText({
    x: canvasW - padX,
    y: canvasH - padY - fontParam * 0.2,
    text: truncateByWidth(paramLine, canvasW * 0.6, fontParam, fontParam * 0.1),
    fontSizePx: fontParam,
    fontFamily: 'courier',
    color: '#FF6B00',
    weight: 700,
    align: 'right',
    letterSpacing: fontParam * 0.1,
  })}
</svg>`
}

// ============================================================================
// 统一导出 map(供 renderer.ts 挂载)
// ============================================================================

export const STAGE5_GENERATORS = {
  'frosted-glass': generateFrostedGlass,
  'glass-chip': generateGlassChip,
  'glass-gradient': generateGlassGradient,
  'glass-minimal': generateGlassMinimal,
  'oil-texture': generateOilTexture,
  'watercolor-caption': generateWatercolorCaption,
  'oil-classic': generateOilClassic,
  'ambient-glow': generateAmbientGlow,
  'bokeh-pillar': generateBokehPillar,
  'ambient-vinyl': generateAmbientVinyl,
  'ambient-aura': generateAmbientAura,
  'ambient-soft': generateAmbientSoft,
  'ambient-dark': generateAmbientDark,
  'ambient-gradient': generateAmbientGradient,
  'cinema-scope': generateCinemaScope,
  'neon-edge': generateNeonEdge,
  'cinema-letterbox': generateCinemaLetterbox,
  'cinema-timestamp': generateCinemaTimestamp,
  'swiss-grid': generateSwissGrid,
  'contact-sheet': generateContactSheet,
  'editorial-minimal': generateEditorialMinimal,
  'floating-caption': generateFloatingCaption,
  'stamp-corner': generateStampCorner,
} as const satisfies Record<string, FrameSvgGenerator>

export {
  generateFrostedGlass,
  generateGlassChip,
  generateGlassGradient,
  generateGlassMinimal,
  generateOilTexture,
  generateWatercolorCaption,
  generateOilClassic,
  generateAmbientGlow,
  generateBokehPillar,
  generateAmbientVinyl,
  generateAmbientAura,
  generateAmbientSoft,
  generateAmbientDark,
  generateAmbientGradient,
  generateCinemaScope,
  generateNeonEdge,
  generateCinemaLetterbox,
  generateCinemaTimestamp,
  generateSwissGrid,
  generateContactSheet,
  generateEditorialMinimal,
  generateFloatingCaption,
  generateStampCorner,
}
