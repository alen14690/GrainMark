/**
 * Design Tokens 结构完整性测试（Aurora Glass · Pass 2.5）
 * 确保 tokens 配置项不被意外破坏（作为 API 契约）
 */
import { describe, expect, it } from 'vitest'
import {
  colors,
  designTokens,
  fonts,
  glassBlur,
  motion,
  radius,
  shadow,
  spacing,
  tokens,
} from '../../src/design/tokens'

describe('Design Tokens · Aurora Glass', () => {
  it('颜色层级完整', () => {
    expect(colors.bg).toHaveProperty('0')
    expect(colors.bg).toHaveProperty('3')
    expect(colors.fg).toHaveProperty('1')
    expect(colors.fg).toHaveProperty('4')
    expect(colors.brand).toHaveProperty('amber')
    expect(colors.brand).toHaveProperty('violet')
    expect(colors.brand).toHaveProperty('cyan')
    // 兼容旧命名（Slider/Histogram 仍引用）
    expect(colors.brand).toHaveProperty('cyanDeep')
    expect(colors.score).toHaveProperty('surpass')
    expect(colors.score).toHaveProperty('far')
  })

  it('Aurora 色板：bg[0] 是深空蓝紫、brand.violet 存在、brand.red 保留为错误专用', () => {
    expect(colors.bg[0]).toBe('#05060E')
    expect(colors.brand.violet).toBe('#B589FF')
    expect(colors.brand.red).toBe('#C8302A') // Q4-B 保留仅 error 专用
  })

  it('Aurora 玻璃命名空间存在', () => {
    expect(colors.glass).toHaveProperty('surface')
    expect(colors.glass).toHaveProperty('elevated')
    expect(colors.glass).toHaveProperty('overlay')
    expect(colors.glass).toHaveProperty('border')
    expect(colors.glass.surface).toMatch(/^rgba\(/)
  })

  it('Aurora 光源色板存在（AuroraBackdrop 使用）', () => {
    expect(colors.aurora).toHaveProperty('violet')
    expect(colors.aurora).toHaveProperty('cyan')
    expect(colors.aurora).toHaveProperty('magenta')
  })

  it('颜色值格式合法（hex 或 rgba）', () => {
    const isColor = (v: string) =>
      /^#[0-9a-fA-F]{3,8}$/.test(v) || v.startsWith('rgba(') || v.startsWith('rgb(')
    expect(isColor(colors.bg[0])).toBe(true)
    expect(isColor(colors.brand.amber)).toBe(true)
    expect(isColor(colors.brand.violet)).toBe(true)
    expect(isColor(colors.score.surpass)).toBe(true)
  })

  it('字体栈：Instrument Serif + Inter + JetBrains Mono', () => {
    expect(fonts.body).toContain('Inter')
    expect(fonts.display).toContain('Instrument Serif')
    expect(fonts.mono).toContain('JetBrains Mono')
    expect(fonts.numeric).toContain('JetBrains Mono')
  })

  it('间距为 8px 网格', () => {
    expect(spacing[2]).toBe('8px')
    expect(spacing[4]).toBe('16px')
    expect(spacing[8]).toBe('32px')
  })

  it('圆角梯度递增（Aurora 默认放大一档）', () => {
    const parse = (r: string) => Number.parseInt(r, 10)
    expect(parse(radius.xs)).toBeLessThan(parse(radius.sm))
    expect(parse(radius.sm)).toBeLessThan(parse(radius.md))
    expect(parse(radius.md)).toBeLessThan(parse(radius.lg))
    // Aurora 默认圆角 lg=14 (原 12)
    expect(parse(radius.lg)).toBeGreaterThanOrEqual(12)
  })

  it('阴影含金辉 glow 与紫辉 glowViolet 与青辉 glowCyan', () => {
    expect(shadow.glow).toContain('212, 184, 138')
    expect(shadow.glowViolet).toContain('181, 137, 255')
    expect(shadow.glowCyan).toContain('94, 205, 247')
    // 玻璃顶部内高光
    expect(shadow.glassInset).toContain('inset')
  })

  it('motion duration 递增 + aurora 60s 漂移周期存在', () => {
    expect(motion.duration.instant).toBeLessThan(motion.duration.fast)
    expect(motion.duration.fast).toBeLessThan(motion.duration.base)
    expect(motion.duration.base).toBeLessThan(motion.duration.slow)
    // Q2-B：60s 漂移周期
    expect(motion.duration.aurora).toBe(60_000)
  })

  it('motion.easing 包含液态 / 胶片 两组曲线', () => {
    expect(motion.easing.liquid).toMatch(/cubic-bezier/)
    expect(motion.easing.filmic).toMatch(/cubic-bezier/)
  })

  it('glassBlur 四档存在', () => {
    expect(glassBlur.sm).toBe('12px')
    expect(glassBlur.md).toBe('20px')
    expect(glassBlur.lg).toBe('28px')
    expect(glassBlur.xl).toBe('40px')
  })

  it('tokens 组装器包含语义 token', () => {
    expect(tokens.button.primary).toBeDefined()
    expect(tokens.card).toBeDefined()
    expect(tokens.slider).toBeDefined()
    expect(tokens.histogram.r).toMatch(/^#/)
    // Slider 的 track fill 使用 violet 或 Aurora 渐变
    expect(tokens.slider.trackFillGradient).toContain('linear-gradient')
  })

  it('designTokens 聚合对象包含所有子集（含新增 glassBlur）', () => {
    expect(designTokens.colors).toBe(colors)
    expect(designTokens.motion).toBe(motion)
    expect(designTokens.glassBlur).toBe(glassBlur)
  })
})
