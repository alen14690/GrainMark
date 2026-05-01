/**
 * Point-and-Shoot Stamp generator 单测
 *
 * 契约(本风格零边框 · overlay 日期戳):
 *   - 四边边框 = 0 · canvas = 原图尺寸
 *   - dateLine 非空时有 2 个 <text>(glow 发光 + core 实字);dateLine='' 时无 <text>
 *   - 戳颜色 = dateStampOrange (#FF6B00)
 *   - 文字 Courier 字体 + font-weight="bold"
 *   - 蓝军:关闭日期字段 → 退化成"仅背景矩形",SVG 无日期节点
 */
import { describe, expect, it } from 'vitest'
import { generatePointAndShootStamp } from '../../electron/services/frame/generators/pointAndShootStamp'
import { computeFrameGeometry } from '../../electron/services/frame/layoutEngine'
import { getFrameStyle } from '../../electron/services/frame/registry'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../shared/frame-text'
import type { FrameStyle, PhotoExif } from '../../shared/types'

const EXIF: PhotoExif = {
  make: 'Konica',
  model: 'Big Mini BM-301',
  dateTimeOriginal: '1998-11-24',
}

function getStyle(): FrameStyle {
  const s = getFrameStyle('point-and-shoot-stamp')
  if (!s) throw new Error('前置失败:point-and-shoot-stamp 未注册')
  return s
}

function renderSvg(imgW: number, imgH: number, dateLine = '1998-11-24'): string {
  const style = getStyle()
  const g = computeFrameGeometry(imgW, imgH, style)
  return generatePointAndShootStamp({
    geometry: g,
    style,
    overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
    exif: EXIF,
    paramLine: '',
    modelLine: '',
    dateLine,
    artistLine: '',
  })
}

describe('Point-and-Shoot Stamp · 几何契约', () => {
  it('四边边框全 0,canvas = 原图', () => {
    const style = getStyle()
    const g = computeFrameGeometry(4000, 3000, style)
    expect(g.borderTopPx).toBe(0)
    expect(g.borderBottomPx).toBe(0)
    expect(g.borderLeftPx).toBe(0)
    expect(g.borderRightPx).toBe(0)
    expect(g.canvasW).toBe(4000)
    expect(g.canvasH).toBe(3000)
  })
})

describe('Point-and-Shoot Stamp · 日期戳渲染', () => {
  it('dateLine 非空时渲染 2 个 <text>(glow + core 双层)', () => {
    const svg = renderSvg(4000, 3000, '1998-11-24')
    const textCount = (svg.match(/<text /g) ?? []).length
    expect(textCount).toBe(2)
    expect(svg).toContain('1998-11-24')
  })

  it('戳颜色 = 橙红 #FF6B00', () => {
    const svg = renderSvg(4000, 3000, '1998-11-24')
    expect(svg.toLowerCase()).toMatch(/fill="#ff6b00"[^>]*>1998-11-24/)
  })

  it('字体是 Courier 家族 + font-weight="bold"', () => {
    const svg = renderSvg(4000, 3000, '1998-11-24')
    expect(svg.toLowerCase()).toMatch(/font-family="[^"]*courier[^"]*"[^>]+font-weight="bold"/)
  })

  it('发光层用 stroke + opacity <= 0.5', () => {
    const svg = renderSvg(4000, 3000, '1998-11-24')
    // glow 层:fill="none" · stroke="#FF6B00" · opacity 值 < 1
    expect(svg.toLowerCase()).toMatch(/fill="none"[^>]+stroke="#ff6b00"[^>]+opacity="0\.4/)
  })
})

describe('Point-and-Shoot Stamp · 蓝军反例', () => {
  it('dateLine 空字符串 → SVG 不含任何 <text>(完全退化成背景)', () => {
    const svg = renderSvg(4000, 3000, '')
    const textCount = (svg.match(/<text /g) ?? []).length
    expect(textCount).toBe(0)
    // 但 canvas rect 还在
    expect(svg).toContain('<rect x="0" y="0"')
  })
})
