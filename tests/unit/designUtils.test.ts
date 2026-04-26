/**
 * Design utils 边界测试
 *
 * 只测 edge case（NaN/Infinity/退化区间），不测"1+1=2"类恒等行为。
 * cn/gradeToColor 属于 TS 类型已经保证的简单映射，不展开测。
 */
import { describe, expect, it } from 'vitest'
import { clamp, fmtSigned, mapRange } from '../../src/design/utils'

describe('design utils · 边界', () => {
  it('clamp：在范围内返回原值，越界夹到端点', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(999, 0, 10)).toBe(10)
  })

  it('fmtSigned：0 不加符号、正数加 +、负数保留 -、支持 digits', () => {
    expect(fmtSigned(0)).toBe('0')
    expect(fmtSigned(5)).toBe('+5')
    expect(fmtSigned(-5)).toBe('-5')
    expect(fmtSigned(1.23456, 2)).toBe('+1.23')
  })

  it('mapRange：正常线性映射', () => {
    expect(mapRange(50, 0, 100, 0, 1)).toBe(0.5)
    expect(mapRange(0, 0, 100, -1, 1)).toBe(-1)
  })

  it('mapRange：退化区间（min=max）返回 outMin 而非 NaN（防除零）', () => {
    expect(mapRange(5, 10, 10, 0, 100)).toBe(0)
  })
})
