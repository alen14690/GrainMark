/**
 * Design Tokens 结构完整性测试
 *
 * 只测 "结构/聚合对象契约"，不测具体颜色/间距/圆角数值。
 * 理由：数值属于设计选择，改值不是 bug；但"子集聚合"和"语义 token 存在性"
 * 决定了 Slider/Histogram/ScoreBar 等组件能否正确引用。
 */
import { describe, expect, it } from 'vitest'
import { colors, designTokens, glassBlur, motion, tokens } from '../../src/design/tokens'

describe('design tokens · 结构契约', () => {
  it('designTokens 聚合对象包含所有子集（子集被组件按名索引）', () => {
    expect(designTokens.colors).toBe(colors)
    expect(designTokens.motion).toBe(motion)
    expect(designTokens.glassBlur).toBe(glassBlur)
  })

  it('语义 token 覆盖所有使用方（button / card / slider / histogram）', () => {
    expect(tokens.button.primary).toBeDefined()
    expect(tokens.card).toBeDefined()
    expect(tokens.slider).toBeDefined()
    expect(tokens.histogram.r).toMatch(/^#/)
    // Slider 的 track fill 使用线性渐变（UI 组件硬依赖这个 key 存在）
    expect(tokens.slider.trackFillGradient).toContain('linear-gradient')
  })

  it('score 分级命名空间完整（ScoreBar 按 surpass/reach/near/below/far 索引）', () => {
    for (const key of ['surpass', 'reach', 'near', 'below', 'far']) {
      expect(colors.score).toHaveProperty(key)
    }
  })
})
