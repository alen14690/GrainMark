/**
 * Gallery Black / White generator 单测
 *
 * 契约:
 *   - 两个风格用同一 generator(`generateGallery` / `createBottomTextGenerator`)
 *   - Gallery Black 背景胶片黑 / 文字纸白;Gallery White 反之
 *   - 底部 3 行堆叠:model(Georgia italic)/ artist(Georgia italic)/ date(mono)
 *   - 横图 14% 底边,竖图 12% 底边
 *   - 蓝军反例:白版和黑版视觉真差异(背景色不同)
 */
import { describe, expect, it } from 'vitest'
import { generateGallery } from '../../electron/services/frame/generators/bottomTextGenerator'
import { computeFrameGeometry } from '../../electron/services/frame/layoutEngine'
import { getFrameStyle } from '../../electron/services/frame/registry'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../shared/frame-text'
import type { FrameStyle, FrameStyleId, PhotoExif } from '../../shared/types'

const EXIF: PhotoExif = {
  make: 'Fujifilm',
  model: 'X-T5',
  lensModel: 'XF 56mm F1.2 R',
  fNumber: 1.2,
  exposureTime: '1/125',
  iso: 320,
  focalLength: 56,
  dateTimeOriginal: '2026-05-01',
  artist: 'John Doe',
}

function renderSvgFor(id: FrameStyleId, imgW: number, imgH: number): { svg: string; style: FrameStyle } {
  const style = getFrameStyle(id)
  if (!style) throw new Error(`前置失败:${id} 未注册`)
  const geometry = computeFrameGeometry(imgW, imgH, style)
  const svg = generateGallery({
    geometry,
    style,
    overrides: { showFields: { ...DEFAULT_FRAME_SHOW_FIELDS, artist: true } },
    exif: EXIF,
    paramLine: '56mm  ·  f/1.2',
    modelLine: 'Fujifilm X-T5',
    dateLine: '2026-05-01',
    artistLine: 'John Doe',
  })
  return { svg, style }
}

describe('Gallery 兄弟风格 · Black 版契约', () => {
  it('背景胶片黑 #0A0A0A,文字纸白 #F8F5EE', () => {
    const { svg } = renderSvgFor('gallery-black', 4000, 3000)
    // 整 canvas 的背景 rect(属性顺序:x y width height fill)
    expect(svg.toLowerCase()).toMatch(/<rect[^>]+fill="#0a0a0a"/)
    // 至少一个 <text> fill="#F8F5EE"(model 和 artist 都是纸白)
    expect(svg.toLowerCase()).toMatch(/<text[^>]+fill="#f8f5ee"/)
  })

  it('横 14% / 竖 12% 底边 · borderTop=side=6%', () => {
    const styleL = getFrameStyle('gallery-black')!
    const gL = computeFrameGeometry(4000, 3000, styleL)
    const gP = computeFrameGeometry(3000, 4000, styleL)
    expect(gL.borderBottomPx).toBe(420) // 0.14 × 3000
    expect(gP.borderBottomPx).toBe(360) // 0.12 × 3000
    expect(gL.borderTopPx).toBe(180) // 0.06 × 3000
  })

  it('三个 slot 全显示(model / artist / date)', () => {
    const { svg } = renderSvgFor('gallery-black', 4000, 3000)
    expect(svg).toContain('Fujifilm X-T5')
    expect(svg).toContain('John Doe')
    expect(svg).toContain('2026-05-01')
  })

  it('Georgia slot 带 italic · mono slot 不带', () => {
    const { svg } = renderSvgFor('gallery-black', 4000, 3000)
    const italicCount = (svg.match(/font-style="italic"/g) ?? []).length
    // model + artist 两个 Georgia slot 都带 italic
    expect(italicCount).toBe(2)
  })
})

describe('Gallery 兄弟风格 · White 版契约', () => {
  it('背景纸白 / 文字深灰(与 Black 完全反转)', () => {
    const { svg } = renderSvgFor('gallery-white', 4000, 3000)
    expect(svg.toLowerCase()).toMatch(/<rect[^>]+fill="#f8f5ee"/)
    // model + artist 走 textColor = inkGray(#2A2A2A)
    expect(svg.toLowerCase()).toMatch(/<text[^>]+fill="#2a2a2a"/)
  })

  it('Black 和 White 共用相同 slot 数量与 geometry,只背景不同', () => {
    const black = renderSvgFor('gallery-black', 4000, 3000)
    const white = renderSvgFor('gallery-white', 4000, 3000)
    // 相同的 <text> 数量(都是 3 个 slot:model / artist / date)
    const blackTextCount = (black.svg.match(/<text /g) ?? []).length
    const whiteTextCount = (white.svg.match(/<text /g) ?? []).length
    expect(blackTextCount).toBe(whiteTextCount)
    expect(blackTextCount).toBe(3)
    // 但背景色必须不同(蓝军反例:如果错误共用 backgroundColor,本条会红)
    expect(black.svg.toLowerCase()).not.toBe(white.svg.toLowerCase())
  })
})
