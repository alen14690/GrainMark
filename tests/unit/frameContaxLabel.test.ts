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
  it('横竖图都是底边 10% · 其它边 0', () => {
    const style = getStyle()
    const gL = computeFrameGeometry(4000, 3000, style)
    const gP = computeFrameGeometry(3000, 4000, style)
    // minEdge=3000 · 0.1 × 3000 = 300
    expect(gL.borderBottomPx).toBe(300)
    expect(gP.borderBottomPx).toBe(300)
    expect(gL.borderTopPx).toBe(0)
    expect(gL.borderLeftPx).toBe(0)
    expect(gL.borderRightPx).toBe(0)
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

  it('分隔线 x 位置随 canvasW 动态计算(横竖不同)', () => {
    const svgL = renderSvg(4000, 3000)
    const svgP = renderSvg(3000, 4000)
    // 横图 canvasW=4000,x1 应是 2000;竖图 canvasW=3000,x1 应是 1500
    expect(svgL).toMatch(/<line x1="2000"/)
    expect(svgP).toMatch(/<line x1="1500"/)
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
