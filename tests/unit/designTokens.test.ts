/**
 * Design Tokens 结构完整性测试
 * 确保 tokens 配置项不被意外破坏（作为 API 契约）
 */
import { describe, expect, it } from 'vitest'
import { colors, designTokens, fonts, motion, radius, shadow, spacing, tokens } from '../../src/design/tokens'

describe('Design Tokens', () => {
  it('颜色层级完整', () => {
    expect(colors.bg).toHaveProperty('0')
    expect(colors.bg).toHaveProperty('3')
    expect(colors.fg).toHaveProperty('1')
    expect(colors.fg).toHaveProperty('4')
    expect(colors.brand).toHaveProperty('amber')
    expect(colors.brand).toHaveProperty('cyanDeep')
    expect(colors.score).toHaveProperty('surpass')
    expect(colors.score).toHaveProperty('far')
  })

  it('颜色值格式合法（hex 或 rgba）', () => {
    const isColor = (v: string) =>
      /^#[0-9a-fA-F]{3,8}$/.test(v) || v.startsWith('rgba(') || v.startsWith('rgb(')
    expect(isColor(colors.bg[0])).toBe(true)
    expect(isColor(colors.brand.amber)).toBe(true)
    expect(isColor(colors.score.surpass)).toBe(true)
  })

  it('字体栈非空', () => {
    expect(fonts.body).toContain('Inter')
    expect(fonts.display).toContain('Fraunces')
    expect(fonts.mono).toContain('JetBrains Mono')
    expect(fonts.numeric).toContain('IBM Plex Mono')
  })

  it('间距为 8px 网格', () => {
    expect(spacing[2]).toBe('8px')
    expect(spacing[4]).toBe('16px')
    expect(spacing[8]).toBe('32px')
  })

  it('圆角梯度递增', () => {
    const parse = (r: string) => Number.parseInt(r, 10)
    expect(parse(radius.xs)).toBeLessThan(parse(radius.sm))
    expect(parse(radius.sm)).toBeLessThan(parse(radius.md))
    expect(parse(radius.md)).toBeLessThan(parse(radius.lg))
  })

  it('阴影含 glow 高光态', () => {
    expect(shadow.glow).toContain('232, 185, 97')
  })

  it('motion duration 递增', () => {
    expect(motion.duration.instant).toBeLessThan(motion.duration.fast)
    expect(motion.duration.fast).toBeLessThan(motion.duration.base)
    expect(motion.duration.base).toBeLessThan(motion.duration.slow)
  })

  it('tokens 组装器包含语义 token', () => {
    expect(tokens.button.primary).toBeDefined()
    expect(tokens.card).toBeDefined()
    expect(tokens.slider).toBeDefined()
    expect(tokens.histogram.r).toContain('#')
  })

  it('designTokens 聚合对象包含所有子集', () => {
    expect(designTokens.colors).toBe(colors)
    expect(designTokens.motion).toBe(motion)
  })
})
