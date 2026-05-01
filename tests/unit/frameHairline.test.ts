/**
 * Hairline generator 单测
 *
 * 契约:
 *   - SVG 含 4 条 <line>(上/下/左/右)
 *   - 线颜色 = COLOR.hairlineStroke = #202020
 *   - 线粗极细(>=1px · <= minEdge*0.001)
 *   - 参数文本走 overlay area · 出现在 <text> 里(不在边框区)
 *   - 横竖图结构一致(Hairline 不走强朝向切换)
 */
import { describe, expect, it } from 'vitest'
import { generateHairline } from '../../electron/services/frame/generators/hairline'
import { computeFrameGeometry } from '../../electron/services/frame/layoutEngine'
import { getFrameStyle } from '../../electron/services/frame/registry'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../shared/frame-text'
import type { PhotoExif } from '../../shared/types'

const EXIF: PhotoExif = {
  make: 'Canon',
  model: 'EOS R5',
  fNumber: 4.0,
  exposureTime: '1/60',
  iso: 100,
  focalLength: 24,
}

function renderHairline(imgW: number, imgH: number): string {
  const style = getFrameStyle('hairline')
  if (!style) throw new Error('前置失败:hairline 未注册')
  const g = computeFrameGeometry(imgW, imgH, style)
  return generateHairline({
    geometry: g,
    style,
    overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
    exif: EXIF,
    paramLine: '24mm  ·  f/4.0  ·  1/60s  ·  ISO 100',
    modelLine: 'Canon EOS R5',
    dateLine: '',
    artistLine: '',
  })
}

describe('Hairline · 细线契约', () => {
  it('SVG 含 4 条 <line>', () => {
    const svg = renderHairline(4000, 3000)
    const lineCount = (svg.match(/<line /g) ?? []).length
    expect(lineCount).toBe(4)
  })

  it('线颜色 = #202020(hairlineStroke)', () => {
    const svg = renderHairline(4000, 3000)
    expect(svg.toLowerCase()).toMatch(/<line[^>]+stroke="#202020"/)
  })

  it('线粗为 1-3px 级别(极细)', () => {
    const svg = renderHairline(4000, 3000)
    const strokeMatches = Array.from(svg.matchAll(/<line[^>]+stroke-width="(\d+)"/g))
    expect(strokeMatches.length).toBe(4)
    for (const m of strokeMatches) {
      const w = Number(m[1])
      expect(w).toBeGreaterThanOrEqual(1)
      expect(w).toBeLessThanOrEqual(3)
    }
  })

  it('参数 overlay 文本出现(在图片内右下,不在边框区)', () => {
    const svg = renderHairline(4000, 3000)
    expect(svg).toContain('f/4.0')
    expect(svg).toContain('ISO 100')
  })

  it('横竖图都产出相同结构(4 线 + 1 overlay 文本)', () => {
    const svgL = renderHairline(4000, 3000)
    const svgP = renderHairline(3000, 4000)
    expect((svgL.match(/<line /g) ?? []).length).toBe(4)
    expect((svgP.match(/<line /g) ?? []).length).toBe(4)
    expect((svgL.match(/<text /g) ?? []).length).toBe(1)
    expect((svgP.match(/<text /g) ?? []).length).toBe(1)
  })
})
