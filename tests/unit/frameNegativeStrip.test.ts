/**
 * Negative Strip generator 单测
 *
 * 核心契约(横竖方向切换 + 固定帧号戳):
 *   - 横图:borderTop/Bottom > 0 · borderLeft/Right = 0 · 文字 area=top/bottom 水平排
 *   - 竖图:borderTop/Bottom = 0 · borderLeft/Right > 0 · 文字 area=left/right 含 rotate
 *   - 橙红帧号 "24 →" overlay 在画面左上角,两种朝向都必须存在且是橙红
 *   - 参数文本走 mono 字体(非 Georgia italic)
 *   - 蓝军:方向切换真实(横图不含 rotate · 竖图含)
 */
import { describe, expect, it } from 'vitest'
import { generateNegativeStrip } from '../../electron/services/frame/generators/negativeStrip'
import { computeFrameGeometry } from '../../electron/services/frame/layoutEngine'
import { getFrameStyle } from '../../electron/services/frame/registry'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../shared/frame-text'
import type { FrameStyle, PhotoExif } from '../../shared/types'

const EXIF: PhotoExif = {
  make: 'Nikon',
  model: 'FM2',
  lensModel: 'AI-S 50mm F1.4',
  fNumber: 1.4,
  exposureTime: '1/60',
  iso: 400,
  focalLength: 50,
  dateTimeOriginal: '2026-05-01',
}

function getStyle(): FrameStyle {
  const s = getFrameStyle('negative-strip')
  if (!s) throw new Error('前置失败:negative-strip 未注册')
  return s
}

function renderSvg(imgW: number, imgH: number): string {
  const style = getStyle()
  const g = computeFrameGeometry(imgW, imgH, style)
  return generateNegativeStrip({
    geometry: g,
    style,
    overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
    exif: EXIF,
    paramLine: '50mm  ·  f/1.4  ·  1/60s  ·  ISO 400',
    modelLine: 'Nikon FM2',
    dateLine: '2026-05-01',
    artistLine: '',
  })
}

describe('Negative Strip · 横图契约', () => {
  it('横图:borderTop/Bottom > 0,borderLeft/Right = 0', () => {
    const style = getStyle()
    const g = computeFrameGeometry(4000, 3000, style)
    expect(g.borderTopPx).toBeGreaterThan(0)
    expect(g.borderBottomPx).toBeGreaterThan(0)
    expect(g.borderLeftPx).toBe(0)
    expect(g.borderRightPx).toBe(0)
    expect(g.orientation).toBe('landscape')
  })

  it('横图文字不含 rotate · 包含 Nikon/参数/日期', () => {
    const svg = renderSvg(4000, 3000)
    expect(svg).not.toMatch(/rotate\(-?90\)/)
    expect(svg).toContain('Nikon FM2')
    expect(svg).toContain('50mm')
    expect(svg).toContain('2026-05-01')
  })
})

describe('Negative Strip · 竖图方向切换(核心契约)', () => {
  it('竖图:borderLeft/Right > 0,borderTop/Bottom = 0', () => {
    const style = getStyle()
    const g = computeFrameGeometry(3000, 4000, style)
    expect(g.borderLeftPx).toBeGreaterThan(0)
    expect(g.borderRightPx).toBeGreaterThan(0)
    expect(g.borderTopPx).toBe(0)
    expect(g.borderBottomPx).toBe(0)
    expect(g.orientation).toBe('portrait')
  })

  it('竖图文字含 rotate(竖排)', () => {
    const svg = renderSvg(3000, 4000)
    expect(svg).toMatch(/rotate\(-?90\)/)
  })

  it('竖图三个 slot 都应有 transform(rotate)', () => {
    const svg = renderSvg(3000, 4000)
    const transformCount = (svg.match(/transform="translate/g) ?? []).length
    // 竖图 model/date/params 三个 slot 都是 left/right area → 三个 rotate transform
    expect(transformCount).toBe(3)
  })
})

describe('Negative Strip · 帧号戳 "24 →"', () => {
  it('横图画面左上角有橙红 "24 →" 帧号戳', () => {
    const svg = renderSvg(4000, 3000)
    expect(svg).toContain('24 →')
    // 橙红色(dateStampOrange = #FF6B00)
    expect(svg.toLowerCase()).toMatch(/fill="#ff6b00"[^>]*>24 →/)
  })

  it('竖图画面左上角也有帧号戳(overlay 不受朝向切换影响)', () => {
    const svg = renderSvg(3000, 4000)
    expect(svg).toContain('24 →')
    expect(svg.toLowerCase()).toMatch(/fill="#ff6b00"[^>]*>24 →/)
  })
})

describe('Negative Strip · 蓝军反例', () => {
  it('横图和竖图产出的 SVG 结构差异真实(rotate 只在竖图)', () => {
    const landscape = renderSvg(4000, 3000)
    const portrait = renderSvg(3000, 4000)
    const hasRotateL = landscape.includes('rotate(-90)') || landscape.includes('rotate(90)')
    const hasRotateP = portrait.includes('rotate(-90)') || portrait.includes('rotate(90)')
    expect(hasRotateL).toBe(false)
    expect(hasRotateP).toBe(true)
  })

  it('文字颜色是 paperWhite(#F8F5EE),仅帧号戳是橙红', () => {
    const svg = renderSvg(4000, 3000)
    // 参数文字用 paperWhite · 至少有一条 text 的 fill 是 #F8F5EE
    expect(svg.toLowerCase()).toMatch(/<text[^>]+fill="#f8f5ee"/)
  })
})
