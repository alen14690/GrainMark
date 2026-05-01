/**
 * Editorial Caption generator 单测
 *
 * 契约:
 *   - generateEditorialCaption === createBottomTextGenerator({ topSeparator: true })
 *   - 产出 SVG 必须含一条 <line> 分隔线(Gallery/Polaroid 等同工厂实例没有)
 *   - model 走 Inter(无 italic)· params 走 mono · date 走 mono softGray
 *   - 分隔线颜色跟 textColor · 粗细 scaleByMinEdge(0.001)
 *   - 蓝军反例:与 Gallery(同工厂)SVG 比对,Editorial 必须多一条 <line>
 */
import { describe, expect, it } from 'vitest'
import {
  generateEditorialCaption,
  generateGallery,
} from '../../electron/services/frame/generators/bottomTextGenerator'
import { computeFrameGeometry } from '../../electron/services/frame/layoutEngine'
import { getFrameStyle } from '../../electron/services/frame/registry'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../shared/frame-text'
import type { PhotoExif } from '../../shared/types'

const EXIF: PhotoExif = {
  make: 'Nikon',
  model: 'Z8',
  focalLength: 85,
  fNumber: 1.8,
  exposureTime: '1/200',
  iso: 400,
  dateTimeOriginal: '2026-05-01',
}

function renderEditorial(imgW: number, imgH: number): string {
  const style = getFrameStyle('editorial-caption')
  if (!style) throw new Error('前置失败:editorial-caption 未注册')
  const geometry = computeFrameGeometry(imgW, imgH, style)
  return generateEditorialCaption({
    geometry,
    style,
    overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
    exif: EXIF,
    paramLine: '85mm  ·  f/1.8  ·  1/200s  ·  ISO 400',
    modelLine: 'Nikon Z8',
    dateLine: '2026-05-01',
    artistLine: '',
  })
}

describe('generateEditorialCaption · 分隔线契约', () => {
  it('SVG 含一条 <line> 分隔线', () => {
    const svg = renderEditorial(4000, 3000)
    const lineCount = (svg.match(/<line /g) ?? []).length
    expect(lineCount).toBe(1)
  })

  it('分隔线颜色 = layout.textColor(纸白背景 → 深灰线)', () => {
    const svg = renderEditorial(4000, 3000)
    // Editorial 是 paperWhite 背景 + inkGray 文字,线也是 inkGray
    expect(svg.toLowerCase()).toMatch(/<line[^>]+stroke="#2a2a2a"/)
  })

  it('分隔线粗度按 scaleByMinEdge(0.001) · 4k 短边 3000 → 至少 3px', () => {
    const svg = renderEditorial(4000, 3000)
    const strokeMatch = svg.match(/<line[^>]+stroke-width="(\d+)"/)
    expect(strokeMatch).not.toBeNull()
    expect(Number(strokeMatch?.[1])).toBeGreaterThanOrEqual(3)
  })

  it('model / params / date 三个 slot 都渲染', () => {
    const svg = renderEditorial(4000, 3000)
    expect(svg).toContain('Nikon Z8')
    expect(svg).toContain('85mm')
    expect(svg).toContain('2026-05-01')
  })

  it('Inter 字体族不加 italic(Editorial 粗体大字,非手写感)', () => {
    const svg = renderEditorial(4000, 3000)
    // 所有 <text> 都不应含 font-style="italic"(Editorial 只用 Inter/mono)
    expect(svg).not.toMatch(/font-style="italic"/)
  })
})

describe('Editorial vs Gallery · 蓝军反例(同工厂不同配置)', () => {
  it('Editorial 比 Gallery 多一条 <line>(topSeparator 真生效)', () => {
    const styleG = getFrameStyle('gallery-black')
    const styleE = getFrameStyle('editorial-caption')
    if (!styleG || !styleE) throw new Error('前置失败')
    const gG = computeFrameGeometry(4000, 3000, styleG)
    const gE = computeFrameGeometry(4000, 3000, styleE)
    const galleryCommonCtx = {
      overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
      exif: EXIF,
      paramLine: 'p',
      modelLine: 'm',
      dateLine: 'd',
      artistLine: '',
    }
    const svgG = generateGallery({ geometry: gG, style: styleG, ...galleryCommonCtx })
    const svgE = generateEditorialCaption({ geometry: gE, style: styleE, ...galleryCommonCtx })

    const lineG = (svgG.match(/<line /g) ?? []).length
    const lineE = (svgE.match(/<line /g) ?? []).length
    expect(lineG).toBe(0)
    expect(lineE).toBe(1)
  })
})
