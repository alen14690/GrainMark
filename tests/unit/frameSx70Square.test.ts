/**
 * SX-70 Square generator 单测
 *
 * 契约:
 *   - 底边 = 20% · 四边等白(side/top 都是 8%)
 *   - 三个 slot 文字都渲染(model/params/date) · 全部 Courier 家族(非 Georgia italic)
 *   - **横纵方形自适应**:非方形图时 generator 内部画 filmBlack 填充带
 *     · 纯方形图(1000×1000)不应有填充 rect
 *     · 横图(4000×3000)应有左右 2 条 filmBlack 填充带
 *     · 竖图(3000×4000)应有上下 2 条 filmBlack 填充带
 *   - SVG viewBox 与 canvas 对齐
 *   - 注意整个风格横竖 landscape/portrait layout 数据相同(方形风格横竖一致)
 */
import { describe, expect, it } from 'vitest'
import { generateSx70Square } from '../../electron/services/frame/generators/sx70Square'
import { computeFrameGeometry } from '../../electron/services/frame/layoutEngine'
import { getFrameStyle } from '../../electron/services/frame/registry'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../shared/frame-text'
import type { FrameStyle, PhotoExif } from '../../shared/types'

const EXIF: PhotoExif = {
  make: 'Polaroid',
  model: 'SX-70',
  fNumber: 8.0,
  exposureTime: '1/125',
  iso: 100,
  focalLength: 116,
  dateTimeOriginal: '1974-11-28',
}

function getStyle(): FrameStyle {
  const s = getFrameStyle('sx70-square')
  if (!s) throw new Error('前置失败:sx70-square 未注册')
  return s
}

function renderSvg(imgW: number, imgH: number): string {
  const style = getStyle()
  const g = computeFrameGeometry(imgW, imgH, style)
  return generateSx70Square({
    geometry: g,
    style,
    overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
    exif: EXIF,
    paramLine: '116mm  ·  f/8.0  ·  1/125s  ·  ISO 100',
    modelLine: 'Polaroid SX-70',
    dateLine: '1974-11-28',
    artistLine: '',
  })
}

function countFillerRects(svg: string): number {
  // filler rects 用 filmBlack 填充色 #0A0A0A;背景也可能是 paperWhite(全白)
  // 方形输入不应有 filler · 非方形应有 2 条
  return (svg.match(/fill="#0A0A0A"/gi) ?? []).length
}

describe('SX-70 Square · 几何契约', () => {
  it('横竖图都有底边 = 20%(0.2 × minEdge)', () => {
    const style = getStyle()
    const gL = computeFrameGeometry(4000, 3000, style)
    const gP = computeFrameGeometry(3000, 4000, style)
    // minEdge 都是 3000
    expect(gL.borderBottomPx).toBe(600)
    expect(gP.borderBottomPx).toBe(600)
    // 四边等白 8% = 240
    expect(gL.borderTopPx).toBe(240)
    expect(gL.borderLeftPx).toBe(240)
    expect(gL.borderRightPx).toBe(240)
  })

  it('SVG viewBox 与 canvas 对齐', () => {
    const style = getStyle()
    const g = computeFrameGeometry(4000, 3000, style)
    const svg = renderSvg(4000, 3000)
    expect(svg).toContain(`viewBox="0 0 ${g.canvasW} ${g.canvasH}"`)
  })
})

describe('SX-70 Square · 方形自适应(本风格核心契约)', () => {
  it('方形图(1000×1000)不应有 filmBlack 填充 rect', () => {
    const svg = renderSvg(1000, 1000)
    expect(countFillerRects(svg)).toBe(0)
  })

  it('横图(4000×3000)有左右 2 条 filmBlack 填充带', () => {
    const svg = renderSvg(4000, 3000)
    expect(countFillerRects(svg)).toBe(2)
  })

  it('竖图(3000×4000)有上下 2 条 filmBlack 填充带', () => {
    const svg = renderSvg(3000, 4000)
    expect(countFillerRects(svg)).toBe(2)
  })
})

describe('SX-70 Square · 文字契约', () => {
  it('三个 slot 都渲染:model / params / date', () => {
    const svg = renderSvg(1000, 1000)
    expect(svg).toContain('Polaroid SX-70')
    expect(svg).toContain('f/8.0')
    expect(svg).toContain('1974-11-28')
  })

  it('所有 <text> 都用 Courier 或 JetBrains Mono 家族(不应出现 Georgia italic)', () => {
    const svg = renderSvg(1000, 1000)
    // 不应出现 italic(Georgia 风才有,SX-70 是 Courier 字体)
    expect(svg).not.toMatch(/font-style="italic"/)
    // 至少一个 Courier 字族的 text(model slot)
    expect(svg.toLowerCase()).toMatch(/<text[^>]+font-family="[^"]*courier[^"]*"/)
  })
})
