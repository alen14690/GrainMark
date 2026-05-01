/**
 * Polaroid Classic generator 单测
 *
 * 契约:
 *   - 整 canvas 用纸白填充(rect 覆盖 0,0 → canvasW,canvasH)
 *   - 横竖朝向 geometry 差异真实(横 22% 底边 / 竖 18% 底边)
 *   - 三个 slot 文字都出现(model/params/date),date 为 橙红色
 *   - Georgia 字体族的 slot 带 italic(斜体手写感)
 *   - SVG XML 转义
 */
import { describe, expect, it } from 'vitest'
import { generatePolaroidClassic } from '../../electron/services/frame/generators/polaroidClassic'
import { computeFrameGeometry } from '../../electron/services/frame/layoutEngine'
import { getFrameStyle } from '../../electron/services/frame/registry'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../shared/frame-text'
import type { FrameStyle, PhotoExif } from '../../shared/types'

const EXIF: PhotoExif = {
  make: 'Sony',
  model: 'ILCE-7SM3',
  lensModel: 'FE 35mm F1.4 GM',
  fNumber: 1.4,
  exposureTime: '1/250',
  iso: 200,
  focalLength: 35,
  dateTimeOriginal: '2026-05-01 16:00:00',
}

function getStyle(): FrameStyle {
  const s = getFrameStyle('polaroid-classic')
  if (!s) throw new Error('前置失败:polaroid-classic 未注册')
  return s
}

function renderSvg(imgW: number, imgH: number): string {
  const style = getStyle()
  const geometry = computeFrameGeometry(imgW, imgH, style)
  return generatePolaroidClassic({
    geometry,
    style,
    overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
    exif: EXIF,
    paramLine: '35mm  ·  f/1.4  ·  1/250s  ·  ISO 200',
    modelLine: 'Sony ILCE-7SM3',
    dateLine: EXIF.dateTimeOriginal ?? '',
    artistLine: '',
  })
}

describe('generatePolaroidClassic · 语义契约', () => {
  it('canvas viewBox 与 geometry 对齐(横图)', () => {
    const style = getStyle()
    const g = computeFrameGeometry(4000, 3000, style)
    const svg = renderSvg(4000, 3000)
    expect(svg).toContain(`viewBox="0 0 ${g.canvasW} ${g.canvasH}"`)
    // 纸白 rect 覆盖整 canvas
    expect(svg.toLowerCase()).toMatch(/<rect[^>]+fill="#f8f5ee"/)
  })

  it('横竖图都用 22% 底边(2026-05-01 专业重设计 · 统一 Polaroid 600 真实比例)', () => {
    const style = getStyle()
    const gL = computeFrameGeometry(4000, 3000, style)
    const gP = computeFrameGeometry(3000, 4000, style)
    // 横图:minEdge=3000,底边 0.22×3000=660
    // 竖图:minEdge=3000,底边 0.22×3000=660(2026-05-01 从 0.18 统一到 0.22)
    expect(gL.borderBottomPx).toBe(660)
    expect(gP.borderBottomPx).toBe(660)
    // 左右上都是 4% = 120
    expect(gL.borderLeftPx).toBe(120)
    expect(gL.borderRightPx).toBe(120)
    expect(gL.borderTopPx).toBe(120)
  })

  it('三个 slot 都渲染:model / params / date', () => {
    const svg = renderSvg(4000, 3000)
    expect(svg).toContain('Sony ILCE-7SM3')
    expect(svg).toContain('35mm')
    expect(svg).toContain('f/1.4')
    expect(svg).toContain('2026-05-01')
  })

  it('日期 slot 用橙红色 dateStampOrange (#FF6B00)', () => {
    const svg = renderSvg(4000, 3000)
    // 日期 <text> 的 fill 必须是 #FF6B00(大小写不敏感)
    expect(svg.toLowerCase()).toMatch(/<text[^>]+fill="#ff6b00"[^>]*>2026-05-01/)
  })

  it('Georgia 字体族的 slot 带 italic(斜体手写感)', () => {
    const svg = renderSvg(4000, 3000)
    // model slot 是 Georgia,必须有 font-style="italic"
    expect(svg).toMatch(/<text[^>]+font-family="[^"]*Georgia[^"]*"[^>]+font-style="italic"/i)
    // 非 Georgia 的 slot(params/date 分别是 mono/courier)不应带 italic
    // 这个间接断言:含 italic 的 <text> 应当只有 model 那一条
    const italicCount = (svg.match(/font-style="italic"/g) ?? []).length
    expect(italicCount).toBe(1)
  })

  it('缺 model 时退回(registry 里本应强制有 model slot,异常情况兜底)', () => {
    // 本测试证明 generator 对数据错误会抛清晰错 —— 间接保证 registry 数据有效
    const style = getStyle()
    const brokenStyle: FrameStyle = {
      ...style,
      landscape: {
        ...style.landscape,
        slots: style.landscape.slots.filter((s) => s.id !== 'model'),
      },
    }
    const g = computeFrameGeometry(4000, 3000, brokenStyle)
    expect(() =>
      generatePolaroidClassic({
        geometry: g,
        style: brokenStyle,
        overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
        exif: EXIF,
        paramLine: '',
        modelLine: 'x',
        dateLine: '',
        artistLine: '',
      }),
    ).toThrow(/model slot/)
  })

  it('蓝军反例:无 date 时 SVG 不包含日期节点(而非空 date 标签)', () => {
    const style = getStyle()
    const g = computeFrameGeometry(4000, 3000, style)
    const svg = generatePolaroidClassic({
      geometry: g,
      style,
      overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
      exif: EXIF,
      paramLine: 'p',
      modelLine: 'm',
      dateLine: '', // 关键
      artistLine: '',
    })
    // 日期 <text> 节点不应出现 —— Polaroid 只渲染 model + params 两个 <text>
    const textCount = (svg.match(/<text /g) ?? []).length
    expect(textCount).toBe(2)
  })
})
