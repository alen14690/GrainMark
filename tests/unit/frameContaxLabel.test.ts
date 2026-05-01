/**
 * Contax Label generator 单测
 *
 * 契约:
 *   - 底边 = 10% · 四边其它 = 0(横竖一致,不切侧)
 *   - 左:Inter 粗体机型(白字) · 右:mono 参数(白字)
 *   - 中间有橙红 <line> 竖线分隔(位置 canvasW × 0.5 · 长度 borderBottom × 0.5)
 *   - 无 italic(本风格不走 Georgia)
 *   - 蓝军:横竖图橙红分隔线位置随 canvasW 变化(真的读取 geometry 而非固定 px)
 */
import { describe, expect, it } from 'vitest'
import { generateContaxLabel } from '../../electron/services/frame/generators/contaxLabel'
import { computeFrameGeometry } from '../../electron/services/frame/layoutEngine'
import { getFrameStyle } from '../../electron/services/frame/registry'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../shared/frame-text'
import type { FrameStyle, PhotoExif } from '../../shared/types'

const EXIF: PhotoExif = {
  make: 'Contax',
  model: 'T2',
  fNumber: 2.8,
  exposureTime: '1/250',
  iso: 100,
  focalLength: 38,
}

function getStyle(): FrameStyle {
  const s = getFrameStyle('contax-label')
  if (!s) throw new Error('前置失败:contax-label 未注册')
  return s
}

function renderSvg(imgW: number, imgH: number): string {
  const style = getStyle()
  const g = computeFrameGeometry(imgW, imgH, style)
  return generateContaxLabel({
    geometry: g,
    style,
    overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
    exif: EXIF,
    paramLine: '38mm  ·  f/2.8  ·  1/250s  ·  ISO 100',
    modelLine: 'Contax T2',
    dateLine: '',
    artistLine: '',
  })
}

describe('Contax Label · 几何契约', () => {
  it('横图底边 10% · 竖图底边 14%(2026-05-01 竖图加厚以容纳两行堆叠)', () => {
    const style = getStyle()
    const gL = computeFrameGeometry(4000, 3000, style)
    const gP = computeFrameGeometry(3000, 4000, style)
    // minEdge=3000
    expect(gL.borderBottomPx).toBe(300) // 0.10 × 3000
    expect(gP.borderBottomPx).toBe(420) // 0.14 × 3000
    expect(gL.borderTopPx).toBe(0)
    expect(gL.borderLeftPx).toBe(0)
    expect(gL.borderRightPx).toBe(0)
    expect(gP.borderTopPx).toBe(0)
    expect(gP.borderLeftPx).toBe(0)
    expect(gP.borderRightPx).toBe(0)
  })
})

describe('Contax Label · 文字契约', () => {
  it('model 和 params 都渲染 · model 是 Inter 字族', () => {
    const svg = renderSvg(4000, 3000)
    expect(svg).toContain('Contax T2')
    expect(svg).toContain('f/2.8')
    expect(svg.toLowerCase()).toMatch(/<text[^>]+font-family="[^"]*inter[^"]*"[^>]*>contax t2/i)
  })

  it('不含 italic(本风格不走 Georgia)', () => {
    const svg = renderSvg(4000, 3000)
    expect(svg).not.toMatch(/font-style="italic"/)
  })
})

describe('Contax Label · 橙红分隔线', () => {
  it('SVG 含一条 <line> · 颜色 = dateStampOrange #FF6B00', () => {
    const svg = renderSvg(4000, 3000)
    const lineCount = (svg.match(/<line /g) ?? []).length
    expect(lineCount).toBe(1)
    expect(svg.toLowerCase()).toMatch(/<line[^>]+stroke="#ff6b00"/)
  })

  it('横图:橙红竖线 x1==x2(canvasW×0.5),y1!=y2', () => {
    const svgL = renderSvg(4000, 3000)
    // SVG 属性顺序:x1 y1 x2 y2(生成器里就是这个顺序)
    const match = svgL.match(/<line x1="(\d+)" y1="(\d+)" x2="(\d+)" y2="(\d+)"/)
    expect(match).toBeTruthy()
    if (match) {
      const [, x1, y1, x2, y2] = match
      expect(x1).toBe('2000')
      expect(x2).toBe('2000')
      expect(y1).not.toBe(y2) // 竖线:y 不同
    }
  })

  it('竖图:橙红水平短线 y1==y2,x1!=x2 · 位置在底条左侧(2026-05-01 竖图优化)', () => {
    const svgP = renderSvg(3000, 4000)
    const match = svgP.match(/<line x1="(\d+)" y1="(\d+)" x2="(\d+)" y2="(\d+)"/)
    expect(match).toBeTruthy()
    if (match) {
      const [, x1, y1, x2, y2] = match
      // 水平线:y 相同
      expect(y1).toBe(y2)
      // x1 ≠ x2 · x1 应 ≈ canvasW × 0.06 = 3000 × 0.06 = 180
      expect(Number(x1)).toBeLessThan(Number(x2))
      expect(Number(x1)).toBeGreaterThan(100)
      expect(Number(x1)).toBeLessThan(300)
    }
  })
})

describe('Contax Label · 蓝军反例', () => {
  it('若 borderBottom=0 就不画分隔线', () => {
    // 构造一个假的 layout(borderBottom=0)验证 accentLine 退化为空
    // 只需要改 style 数据的 borderBottom,不需要改 registry
    const style = getStyle()
    const brokenStyle: FrameStyle = {
      ...style,
      landscape: { ...style.landscape, borderBottom: 0 },
    }
    const g = computeFrameGeometry(4000, 3000, brokenStyle)
    const svg = generateContaxLabel({
      geometry: g,
      style: brokenStyle,
      overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
      exif: EXIF,
      paramLine: 'p',
      modelLine: 'm',
      dateLine: '',
      artistLine: '',
    })
    const lineCount = (svg.match(/<line /g) ?? []).length
    expect(lineCount).toBe(0)
  })
})
