/**
 * Spine Edition generator 单测
 *
 * 核心契约(本风格的横竖切换类似 Film Full Border,但更简单——单边带):
 *   - 横图:borderBottom > 0,border 左/右/上 = 0(仅底部带)
 *   - 竖图:borderRight > 0,border 上/下/左 = 0(仅右侧带)
 *   - 横图文字 area=bottom · 水平排
 *   - 竖图文字 area=right · 含 rotate(90) 变换(从 slotPlacement 共享)
 *   - 日期走 dateStampOrange 橙红色
 *   - Georgia model slot 带 italic
 */
import { describe, expect, it } from 'vitest'
import { generateSpineEdition } from '../../electron/services/frame/generators/spineEdition'
import { computeFrameGeometry } from '../../electron/services/frame/layoutEngine'
import { getFrameStyle } from '../../electron/services/frame/registry'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../shared/frame-text'
import type { PhotoExif } from '../../shared/types'

const EXIF: PhotoExif = {
  make: 'Hasselblad',
  model: 'X2D',
  dateTimeOriginal: '2026-05-01',
}

function renderSpine(imgW: number, imgH: number): string {
  const style = getFrameStyle('spine-edition')
  if (!style) throw new Error('前置失败:spine-edition 未注册')
  const g = computeFrameGeometry(imgW, imgH, style)
  return generateSpineEdition({
    geometry: g,
    style,
    overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
    exif: EXIF,
    paramLine: '',
    modelLine: 'Hasselblad X2D',
    dateLine: '2026-05-01',
    artistLine: '',
  })
}

describe('Spine Edition · 横图底带契约', () => {
  it('横图仅 borderBottom > 0,其他边 = 0', () => {
    const style = getFrameStyle('spine-edition')!
    const g = computeFrameGeometry(4000, 3000, style)
    expect(g.borderBottomPx).toBeGreaterThan(0)
    expect(g.borderTopPx).toBe(0)
    expect(g.borderLeftPx).toBe(0)
    expect(g.borderRightPx).toBe(0)
    expect(g.orientation).toBe('landscape')
  })

  it('横图文字不含 rotate(水平排)', () => {
    const svg = renderSpine(4000, 3000)
    expect(svg).not.toMatch(/rotate\(-?90\)/)
    expect(svg).toContain('Hasselblad X2D')
    expect(svg).toContain('2026-05-01')
  })

  it('横图 Georgia model slot 带 italic', () => {
    const svg = renderSpine(4000, 3000)
    expect(svg).toMatch(/<text[^>]+font-family="[^"]*Georgia[^"]*"[^>]+font-style="italic"/i)
  })

  it('日期走橙红色', () => {
    const svg = renderSpine(4000, 3000)
    expect(svg.toLowerCase()).toMatch(/fill="#ff6b00"[^>]*>2026-05-01/)
  })
})

describe('Spine Edition · 竖图右侧带契约(方向切换)', () => {
  it('竖图仅 borderRight > 0,其他边 = 0', () => {
    const style = getFrameStyle('spine-edition')!
    const g = computeFrameGeometry(3000, 4000, style)
    expect(g.borderRightPx).toBeGreaterThan(0)
    expect(g.borderTopPx).toBe(0)
    expect(g.borderBottomPx).toBe(0)
    expect(g.borderLeftPx).toBe(0)
    expect(g.orientation).toBe('portrait')
  })

  it('竖图文字含 rotate(竖排)', () => {
    const svg = renderSpine(3000, 4000)
    // Spine 竖图 slot.area='right' → slotPlacement 里走 rotate(-90)/(90)
    expect(svg).toMatch(/rotate\(-?90\)/)
  })

  it('Spine 竖图走 right area,layout.slots 元素都应有 transform', () => {
    const svg = renderSpine(3000, 4000)
    const transformCount = (svg.match(/transform="translate/g) ?? []).length
    // 两个 slot(model + date)都应有 transform
    expect(transformCount).toBe(2)
  })
})

describe('Spine Edition · 蓝军反例', () => {
  it('横图和竖图产出的 SVG 结构差异真实(rotate 在竖图有 / 横图无)', () => {
    const landscape = renderSpine(4000, 3000)
    const portrait = renderSpine(3000, 4000)
    expect(landscape.includes('rotate(-90)') || landscape.includes('rotate(90)')).toBe(false)
    expect(portrait.includes('rotate(-90)') || portrait.includes('rotate(90)')).toBe(true)
  })
})
