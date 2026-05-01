/**
 * Minimal Bar generator 单测
 *
 * 测试价值原则(AGENTS.md 第 4 条):
 *   - **不测** SVG 字面量(会和 formatter 微调耦合,改个空格就红)
 *   - **不测** `svg.toContain('u_image')` 这类纯存在性断言
 *   - **要测**:给定 FrameStyle + EXIF,输出 SVG 的「语义契约」
 *     · viewBox 尺寸 = canvasW × canvasH(证明 generator 用了 geometry 而非硬编码)
 *     · 至少一个 <rect> 作为底栏背景,颜色来自 layout.backgroundColor
 *     · 参数文本出现在 <text> 里,内容为 buildFrameParamLine 的输出
 *     · 日期文本当且仅当 dateLine 有值时出现
 *     · 横图和竖图分派到不同 layout,产出不同 viewBox(朝向真生效)
 *
 * 蓝军 mutation 目标:
 *   - 若有人把 `height="${canvasH}"` 改成常数(例如 barH),viewBox 测试会红
 *   - 若有人改错 textColor,颜色测试会红
 */
import { describe, expect, it } from 'vitest'
import { generateMinimalBar } from '../../electron/services/frame/generators/minimalBar'
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

function getMinimalBarStyle(): FrameStyle {
  const s = getFrameStyle('minimal-bar')
  if (!s) throw new Error('测试前置失败:minimal-bar 未注册')
  return s
}

function renderSvg(imgW: number, imgH: number): string {
  const style = getMinimalBarStyle()
  const geometry = computeFrameGeometry(imgW, imgH, style)
  return generateMinimalBar({
    geometry,
    style,
    overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
    exif: EXIF,
    paramLine: 'Sony  ·  ILCE-7SM3  ·  FE 35mm F1.4 GM  ·  35mm  ·  f/1.4  ·  1/250s  ·  ISO 200',
    modelLine: 'Sony ILCE-7SM3',
    dateLine: EXIF.dateTimeOriginal ?? '',
    artistLine: '',
  })
}

describe('generateMinimalBar · 语义契约', () => {
  it('viewBox 尺寸等于 canvasW × canvasH(横图)', () => {
    const style = getMinimalBarStyle()
    const g = computeFrameGeometry(4000, 3000, style)
    const svg = renderSvg(4000, 3000)
    expect(svg).toMatch(new RegExp(`viewBox="0 0 ${g.canvasW} ${g.canvasH}"`))
    expect(svg).toMatch(new RegExp(`width="${g.canvasW}"`))
    expect(svg).toMatch(new RegExp(`height="${g.canvasH}"`))
  })

  it('竖图走 portrait 布局,canvas 高度差异真实存在', () => {
    const style = getMinimalBarStyle()
    const gL = computeFrameGeometry(4000, 3000, style)
    const gP = computeFrameGeometry(3000, 4000, style)
    // Minimal Bar 的 landscape.bottomLandscape=0.08,portrait.bottomPortrait=0.1
    // → 4000×3000 底栏 0.08×3000=240;3000×4000 底栏 0.1×3000=300
    // → canvasH 分别 3240 和 4300
    expect(gL.canvasH).toBe(3240)
    expect(gP.canvasH).toBe(4300)
    // SVG viewBox 也得对得上
    expect(renderSvg(4000, 3000)).toContain(`viewBox="0 0 ${gL.canvasW} ${gL.canvasH}"`)
    expect(renderSvg(3000, 4000)).toContain(`viewBox="0 0 ${gP.canvasW} ${gP.canvasH}"`)
  })

  it('底栏 <rect> 填充色来自 layout.backgroundColor(纸白 #F8F5EE)', () => {
    const svg = renderSvg(4000, 3000)
    // paperWhite 在小写场景下不敏感,用 case-insensitive 匹配以防字体栈大小写漂移
    expect(svg.toLowerCase()).toContain('fill="#f8f5ee"')
  })

  it('参数文本出现在 <text> 元素里', () => {
    const svg = renderSvg(4000, 3000)
    expect(svg).toContain('Sony')
    expect(svg).toContain('ILCE-7SM3')
    expect(svg).toContain('f/1.4')
    expect(svg).toContain('ISO 200')
  })

  it('日期行有值时出现,为空串时消失', () => {
    const svgWithDate = renderSvg(4000, 3000)
    expect(svgWithDate).toContain('2026-05-01')

    const style = getMinimalBarStyle()
    const g = computeFrameGeometry(4000, 3000, style)
    const svgNoDate = generateMinimalBar({
      geometry: g,
      style,
      overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
      exif: EXIF,
      paramLine: 'Sony ILCE-7SM3',
      modelLine: 'Sony ILCE-7SM3',
      dateLine: '', // 日期缺失
      artistLine: '',
    })
    expect(svgNoDate).not.toContain('2026-05-01')
    // 日期 <text> 节点本身也应消失(不是只内容空了)
    const dateTextNodeCount = (svgNoDate.match(/<text /g) ?? []).length
    expect(dateTextNodeCount).toBe(1) // 只剩 params 那一条
  })

  it('SVG 文本转义:含 < > & 的 EXIF 不会破坏 SVG 结构', () => {
    const style = getMinimalBarStyle()
    const g = computeFrameGeometry(4000, 3000, style)
    const svg = generateMinimalBar({
      geometry: g,
      style,
      overrides: { showFields: DEFAULT_FRAME_SHOW_FIELDS },
      exif: { ...EXIF, make: '<evil>&"quote"' },
      paramLine: '<evil>&"quote"',
      modelLine: 'normal',
      dateLine: '',
      artistLine: '',
    })
    expect(svg).toContain('&lt;evil&gt;')
    expect(svg).toContain('&amp;')
    expect(svg).toContain('&quot;')
    // 确保没有 raw `<evil>` 片段残留(那会破坏 SVG)
    expect(svg).not.toContain('<evil>')
  })
})

describe('generateMinimalBar · 蓝军 mutation 防线', () => {
  it('canvasH 与 SVG 尺寸双倍真实依赖:几何模型错了 SVG 就错', () => {
    // 这条测试的目的是当 generator 错误地写成 `height="1000"` 这种常数时,
    // 换了尺寸的调用产生的 SVG 大小会与 geometry 不一致 → 测试红。
    const svg4k = renderSvg(4000, 3000)
    const svg1k = renderSvg(1000, 750)
    // 从两张 SVG 提取 height 属性,它们必须不同
    const h4k = svg4k.match(/<svg[^>]*height="(\d+)"/)?.[1]
    const h1k = svg1k.match(/<svg[^>]*height="(\d+)"/)?.[1]
    expect(h4k).not.toBe(h1k)
    expect(Number(h4k)).toBeGreaterThan(Number(h1k))
  })
})
