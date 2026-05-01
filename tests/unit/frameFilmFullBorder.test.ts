/**
 * Film Full Border generator 单测
 *
 * 核心契约(本风格最独特):**齿孔方向随横竖切换**
 *   - 横图:borderTop / borderBottom > 0,borderLeft / borderRight = 0
 *   - 竖图:borderTop / borderBottom = 0,borderLeft / borderRight > 0
 *   - SVG 输出的齿孔 rect 必须对应正确方向
 *
 * 这是整个边框系统里最容易翻车的契约(AGENTS.md 第 8 条踩坑:orientation 散布
 * 导致 3 次修复失败),本测试给它重点防护。
 */
import { describe, expect, it } from 'vitest'
import { generateFilmFullBorder } from '../../electron/services/frame/generators/filmFullBorder'
import { computeFrameGeometry } from '../../electron/services/frame/layoutEngine'
import { getFrameStyle } from '../../electron/services/frame/registry'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../shared/frame-text'
import type { FrameStyle, PhotoExif } from '../../shared/types'

const EXIF: PhotoExif = {
  make: 'Leica',
  model: 'M11',
  lensModel: 'Summilux 35',
  fNumber: 2.0,
  exposureTime: '1/500',
  iso: 400,
  focalLength: 35,
  dateTimeOriginal: '2026-05-01',
}

function getStyle(): FrameStyle {
  const s = getFrameStyle('film-full-border')
  if (!s) throw new Error('前置失败:film-full-border 未注册')
  return s
}

function renderSvg(imgW: number, imgH: number): string {
  const style = getStyle()
  const geometry = computeFrameGeometry(imgW, imgH, style)
  return generateFilmFullBorder({
    geometry,
    style,
    overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
    exif: EXIF,
    paramLine: '35mm  ·  f/2.0  ·  1/500s  ·  ISO 400',
    modelLine: 'Leica M11',
    dateLine: '2026-05-01',
    artistLine: '',
  })
}

describe('generateFilmFullBorder · 横图齿孔契约', () => {
  it('横图:borderTop/Bottom > 0,borderLeft/Right = 0', () => {
    const style = getStyle()
    const g = computeFrameGeometry(4000, 3000, style)
    expect(g.borderTopPx).toBeGreaterThan(0)
    expect(g.borderBottomPx).toBeGreaterThan(0)
    expect(g.borderLeftPx).toBe(0)
    expect(g.borderRightPx).toBe(0)
    expect(g.orientation).toBe('landscape')
  })

  it('横图 SVG 齿孔 rect 在顶部和底部,覆盖全 canvas 宽', () => {
    const style = getStyle()
    const g = computeFrameGeometry(4000, 3000, style)
    const svg = renderSvg(4000, 3000)
    // 顶部齿孔:<rect x="0" y="0" width="<canvasW>" height="<borderTopPx>"
    expect(svg).toMatch(
      new RegExp(
        `<rect x="0" y="0" width="${g.canvasW}" height="${g.borderTopPx}"[^>]+fill="url\\(#film-perforation\\)"`,
      ),
    )
    // 底部齿孔:bottom y = canvasH - borderBottomPx
    const bottomY = g.canvasH - g.borderBottomPx
    expect(svg).toMatch(
      new RegExp(
        `<rect x="0" y="${bottomY}" width="${g.canvasW}" height="${g.borderBottomPx}"[^>]+fill="url\\(#film-perforation\\)"`,
      ),
    )
  })
})

describe('generateFilmFullBorder · 竖图齿孔方向切换(本风格核心契约)', () => {
  it('竖图:borderTop/Bottom = 0,borderLeft/Right > 0', () => {
    const style = getStyle()
    const g = computeFrameGeometry(3000, 4000, style)
    expect(g.borderTopPx).toBe(0)
    expect(g.borderBottomPx).toBe(0)
    expect(g.borderLeftPx).toBeGreaterThan(0)
    expect(g.borderRightPx).toBeGreaterThan(0)
    expect(g.orientation).toBe('portrait')
  })

  it('竖图 SVG 齿孔 rect 在左右边,覆盖全 canvas 高', () => {
    const style = getStyle()
    const g = computeFrameGeometry(3000, 4000, style)
    const svg = renderSvg(3000, 4000)
    // 左边:<rect x="0" y="0" width="<borderLeftPx>" height="<canvasH>"
    expect(svg).toMatch(
      new RegExp(
        `<rect x="0" y="0" width="${g.borderLeftPx}" height="${g.canvasH}"[^>]+fill="url\\(#film-perforation\\)"`,
      ),
    )
    // 右边:rightX = canvasW - borderRightPx
    const rightX = g.canvasW - g.borderRightPx
    expect(svg).toMatch(
      new RegExp(
        `<rect x="${rightX}" y="0" width="${g.borderRightPx}" height="${g.canvasH}"[^>]+fill="url\\(#film-perforation\\)"`,
      ),
    )
  })

  it('竖图文字走 left/right area(SVG 含 rotate 变换)', () => {
    const svg = renderSvg(3000, 4000)
    // 竖排字必须用 transform rotate 处理(-90 或 90)
    expect(svg).toMatch(/rotate\(-?90\)/)
  })

  it('横图文字不带 rotate 变换', () => {
    const svg = renderSvg(4000, 3000)
    expect(svg).not.toMatch(/rotate\(-?90\)/)
  })
})

describe('generateFilmFullBorder · 蓝军 mutation 防线', () => {
  it('若 generator 错误使用同一 area 不管横竖,竖图会没齿孔 —— 测试会红', () => {
    // 这条测试通过对比横图和竖图的 "url(#film-perforation)" 出现次数防护:
    // 正确实装下:每种朝向都有 2 个齿孔 rect(双边)
    // 若错误实装(例如 generator 永远用 top/bottom),竖图的齿孔会消失 → 测试红
    const svgH = renderSvg(4000, 3000)
    const svgV = renderSvg(3000, 4000)
    const perfCountH = (svgH.match(/fill="url\(#film-perforation\)"/g) ?? []).length
    const perfCountV = (svgV.match(/fill="url\(#film-perforation\)"/g) ?? []).length
    expect(perfCountH).toBe(2)
    expect(perfCountV).toBe(2)
  })

  it('日期文字保持橙红色(即使在竖图变到左边 rotate 后)', () => {
    const svgV = renderSvg(3000, 4000)
    // 日期 slot colorOverride = dateStampOrange
    expect(svgV.toLowerCase()).toMatch(/fill="#ff6b00"[^>]*[^<]*2026-05-01/)
  })
})
