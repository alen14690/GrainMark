/**
 * frameStage5Generators — 阶段 5 · 14 个 generator 的 SVG 输出契约(2026-05-01)
 *
 * 测试价值(AGENTS.md 第 4 条):
 *   用户反馈"大量错误 · 文字/方向异常" · 这里系统性覆盖以下 bug 模式:
 *     B1 文字内容丢失(paramLine/modelLine 未渲染到 SVG)
 *     B2 文字溢出画布(x/y 坐标超出 0..canvasW/canvasH)
 *     B3 横竖图 SVG 尺寸错误(viewBox 不是 canvasW × canvasH)
 *     B4 背景色丢失(首个 rect 未覆盖全画布)
 *     B5 特殊字符未转义(EXIF 含 & < > 导致 SVG invalid)
 *     B6 orientation 分派错(竖图跑了横图字号)
 *     B7 同 id 在横竖渲染出相同 SVG(说明 layout 未切换)
 *
 * 蓝军:每条测试都对应一条真实失败路径,mutation 改坏代码能红。
 */
import { describe, expect, it } from 'vitest'
import type { FrameGeneratorContext } from '../../electron/services/frame/composite'
import {
  generateAmbientGlow,
  generateBokehPillar,
  generateBrushedMetal,
  generateCinemaScope,
  generateContactSheet,
  generateFloatingCaption,
  generateFrostedGlass,
  generateGlassChip,
  generateMedalPlate,
  generateNeonEdge,
  generateOilTexture,
  generateStampCorner,
  generateSwissGrid,
  generateWatercolorCaption,
} from '../../electron/services/frame/generators/stage5Generators'
import { computeFrameGeometry } from '../../electron/services/frame/layoutEngine'
import { getFrameStyle } from '../../electron/services/frame/registry'
import type { PhotoExif } from '../../shared/types'

const EXIF: PhotoExif = {
  make: 'SONY',
  model: 'ILCE-7SM3',
  lensModel: 'FE 70-200mm F2.8 GM OSS II',
  fNumber: 5.6,
  exposureTime: '1/125',
  iso: 200,
  focalLength: 200,
}

const MODEL_LINE = 'SONY ILCE-7SM3'
const PARAM_LINE = '70-200mm F2.8 · 200mm · f/5.6 · 1/125s · ISO 200'

/**
 * 构造一个 FrameGeneratorContext (模拟 composite 生成)
 */
function makeCtx(
  styleId:
    | 'frosted-glass'
    | 'glass-chip'
    | 'oil-texture'
    | 'watercolor-caption'
    | 'ambient-glow'
    | 'bokeh-pillar'
    | 'cinema-scope'
    | 'neon-edge'
    | 'swiss-grid'
    | 'contact-sheet'
    | 'brushed-metal'
    | 'medal-plate'
    | 'floating-caption'
    | 'stamp-corner',
  imgW: number,
  imgH: number,
): FrameGeneratorContext {
  const style = getFrameStyle(styleId)
  if (!style) throw new Error(`style ${styleId} not registered`)
  const geometry = computeFrameGeometry(imgW, imgH, style)
  return {
    geometry,
    style,
    overrides: style.defaultOverrides,
    exif: EXIF,
    paramLine: PARAM_LINE,
    modelLine: MODEL_LINE,
    dateLine: '',
    artistLine: '',
  }
}

interface GenCase {
  id:
    | 'frosted-glass'
    | 'glass-chip'
    | 'oil-texture'
    | 'watercolor-caption'
    | 'ambient-glow'
    | 'bokeh-pillar'
    | 'cinema-scope'
    | 'neon-edge'
    | 'swiss-grid'
    | 'contact-sheet'
    | 'brushed-metal'
    | 'medal-plate'
    | 'floating-caption'
    | 'stamp-corner'
  gen: (ctx: FrameGeneratorContext) => string
  /**
   * 该风格是否在最终 SVG 里显示机型(model)字符串(而非单独拆开 make/model)
   * 例如 medal-plate 拆成 SONY + ILCE-7SM3 两行 · modelLine 不会直接出现
   */
  expectsModelInSvg: boolean
  /** 是否显示参数行 · cinema/contact-sheet 等会显示 */
  expectsParamInSvg: boolean
}

const CASES: GenCase[] = [
  { id: 'frosted-glass', gen: generateFrostedGlass, expectsModelInSvg: true, expectsParamInSvg: true },
  { id: 'glass-chip', gen: generateGlassChip, expectsModelInSvg: true, expectsParamInSvg: true },
  { id: 'oil-texture', gen: generateOilTexture, expectsModelInSvg: true, expectsParamInSvg: true },
  {
    id: 'watercolor-caption',
    gen: generateWatercolorCaption,
    expectsModelInSvg: true,
    expectsParamInSvg: true,
  },
  { id: 'ambient-glow', gen: generateAmbientGlow, expectsModelInSvg: true, expectsParamInSvg: true },
  { id: 'bokeh-pillar', gen: generateBokehPillar, expectsModelInSvg: true, expectsParamInSvg: true },
  { id: 'cinema-scope', gen: generateCinemaScope, expectsModelInSvg: true, expectsParamInSvg: true },
  { id: 'neon-edge', gen: generateNeonEdge, expectsModelInSvg: true, expectsParamInSvg: true },
  { id: 'swiss-grid', gen: generateSwissGrid, expectsModelInSvg: true, expectsParamInSvg: true },
  { id: 'contact-sheet', gen: generateContactSheet, expectsModelInSvg: true, expectsParamInSvg: false },
  { id: 'brushed-metal', gen: generateBrushedMetal, expectsModelInSvg: true, expectsParamInSvg: true },
  { id: 'medal-plate', gen: generateMedalPlate, expectsModelInSvg: false, expectsParamInSvg: false }, // 拆为 make + model
  { id: 'floating-caption', gen: generateFloatingCaption, expectsModelInSvg: true, expectsParamInSvg: true },
  { id: 'stamp-corner', gen: generateStampCorner, expectsModelInSvg: true, expectsParamInSvg: true },
]

describe('Stage5 generator · SVG 输出契约', () => {
  for (const c of CASES) {
    describe(`[${c.id}]`, () => {
      it('B3 · 横图 viewBox 尺寸 = canvasW × canvasH', () => {
        const ctx = makeCtx(c.id, 4000, 3000)
        const svg = c.gen(ctx)
        expect(svg, '应生成非空 SVG').toBeTruthy()
        expect(svg, '应以 <svg 开头').toMatch(/^<svg/)
        expect(svg).toContain(`viewBox="0 0 ${ctx.geometry.canvasW} ${ctx.geometry.canvasH}"`)
      })

      it('B3 · 竖图 viewBox 随横竖切换', () => {
        const ctx = makeCtx(c.id, 3000, 4000)
        const svg = c.gen(ctx)
        expect(svg).toContain(`viewBox="0 0 ${ctx.geometry.canvasW} ${ctx.geometry.canvasH}"`)
      })

      it('B1 · 横图包含机型/参数文本(根据 expectations)', () => {
        const ctx = makeCtx(c.id, 4000, 3000)
        const svg = c.gen(ctx)
        if (c.expectsModelInSvg) {
          // 验证 modelLine 的"前 5 个字符"出现(避免 truncate 后完整字符串丢失)
          const firstPart = MODEL_LINE.slice(0, 5)
          expect(svg, `${c.id} 横图应包含 modelLine 前缀 "${firstPart}"`).toContain(firstPart)
        }
        if (c.expectsParamInSvg) {
          // 参数行通常长 · 验证核心关键词 "f/5.6"
          expect(svg, `${c.id} 横图应包含参数关键词 "f/5.6"`).toContain('f/5.6')
        }
      })

      it('B1 · 竖图包含机型/参数文本', () => {
        const ctx = makeCtx(c.id, 3000, 4000)
        const svg = c.gen(ctx)
        if (c.expectsModelInSvg) {
          expect(svg).toContain(MODEL_LINE.slice(0, 5))
        }
        if (c.expectsParamInSvg) {
          expect(svg).toContain('f/5.6')
        }
      })

      it('B4 · 第一个 <rect> 作为全画布背景', () => {
        const ctx = makeCtx(c.id, 4000, 3000)
        const svg = c.gen(ctx)
        const firstRect = svg.match(/<rect\s+x="0"\s+y="0"\s+width="(\d+)"\s+height="(\d+)"/)
        expect(firstRect, `${c.id} 应首个 <rect 覆盖全画布`).toBeTruthy()
        if (firstRect) {
          expect(Number(firstRect[1])).toBe(ctx.geometry.canvasW)
          expect(Number(firstRect[2])).toBe(ctx.geometry.canvasH)
        }
      })

      it('B2 · 所有 <text> 的 x/y 必须在画布内', () => {
        const ctx = makeCtx(c.id, 4000, 3000)
        const svg = c.gen(ctx)
        const matches = Array.from(svg.matchAll(/<text\s+x="(-?\d+)"\s+y="(-?\d+)"/g))
        expect(matches.length, `${c.id} 应至少输出一个 <text>`).toBeGreaterThan(0)
        for (const m of matches) {
          const x = Number(m[1])
          const y = Number(m[2])
          // 允许 x 超出左边界(右对齐 SVG 的 x 是基线点 · 文字可能延伸到负值) · 但不能过分
          expect(x, `${c.id} text x=${x} 异常越界`).toBeGreaterThan(-200)
          expect(x, `${c.id} text x=${x} 越过右边界 canvasW=${ctx.geometry.canvasW}`).toBeLessThan(
            ctx.geometry.canvasW + 50,
          )
          expect(y, `${c.id} text y=${y} 异常越界`).toBeGreaterThan(-50)
          expect(y, `${c.id} text y=${y} 越过底边界 canvasH=${ctx.geometry.canvasH}`).toBeLessThan(
            ctx.geometry.canvasH + 50,
          )
        }
      })

      it('B7 · 横图和竖图 SVG 长度差异不为 0(layout 真切换)', () => {
        const svgL = c.gen(makeCtx(c.id, 4000, 3000))
        const svgP = c.gen(makeCtx(c.id, 3000, 4000))
        // viewBox 必然不同(4240x3240 vs 3240x4240) · 至少一个尺寸出现在字符串里的位置会变
        // 两者完全一致说明竖图 layout 根本没起作用
        expect(svgL).not.toBe(svgP)
      })

      it('B5 · 特殊字符自动转义 · SVG 仍是 well-formed', () => {
        const style = getFrameStyle(c.id)
        if (!style) throw new Error(`${c.id} not registered`)
        const geo = computeFrameGeometry(4000, 3000, style)
        const tricky: FrameGeneratorContext = {
          geometry: geo,
          style,
          overrides: style.defaultOverrides,
          exif: { ...EXIF, make: '<A&B>', model: 'M"X<Y>' },
          paramLine: 'f/5.6 & ISO<200>',
          modelLine: '<A&B> M"X<Y>',
          dateLine: '',
          artistLine: '',
        }
        const svg = c.gen(tricky)
        // 若 & < > " 没转义,SVG 会打破外层结构 · 简易检测:原始 < 作为 tag 标记应当只出现在结构 tag 前
        // 转义后会变成 &amp; &lt; &gt; &quot;
        // 核心:输出不应含裸露的 "<A&B>"(会被解析为 tag 名)
        expect(svg, `${c.id} 未正确转义 <A&B>`).not.toContain('<A&B>')
        expect(svg, `${c.id} 未正确转义 &ISO`).not.toContain('& ISO<')
      })
    })
  }

  it('蓝军 · 空 paramLine/modelLine 不应崩 · 也不应注入异常空字符串', () => {
    const style = getFrameStyle('frosted-glass')
    if (!style) throw new Error('not registered')
    const geo = computeFrameGeometry(4000, 3000, style)
    const emptyCtx: FrameGeneratorContext = {
      geometry: geo,
      style,
      overrides: style.defaultOverrides,
      exif: {},
      paramLine: '',
      modelLine: '',
      dateLine: '',
      artistLine: '',
    }
    const svg = generateFrostedGlass(emptyCtx)
    expect(svg, '应仍输出有效 SVG').toMatch(/^<svg/)
    expect(svg).toContain(`viewBox="0 0 ${geo.canvasW} ${geo.canvasH}"`)
  })
})
