/**
 * Design utils 单元测试
 */
import { describe, expect, it } from 'vitest'
import { clamp, cn, fmtSigned, gradeToColor, mapRange } from '../../src/design/utils'

describe('cn', () => {
  it('合并类名', () => {
    expect(cn('a', 'b')).toBe('a b')
  })
  it('处理 falsy 值', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b')
  })
  it('处理条件类名', () => {
    expect(cn('a', { b: true, c: false })).toBe('a b')
  })
})

describe('fmtSigned', () => {
  it('正数加 +', () => {
    expect(fmtSigned(5)).toBe('+5')
    expect(fmtSigned(0.5, 1)).toBe('+0.5')
  })
  it('负数保留 -', () => {
    expect(fmtSigned(-5)).toBe('-5')
  })
  it('0 不加 +', () => {
    expect(fmtSigned(0)).toBe('0')
  })
  it('指定 digits', () => {
    expect(fmtSigned(1.23456, 2)).toBe('+1.23')
  })
})

describe('gradeToColor', () => {
  it.each([
    ['surpass', 'score-surpass'],
    ['reach', 'score-reach'],
    ['near', 'score-near'],
    ['below', 'score-below'],
    ['far', 'score-far'],
  ] as const)('%s → %s', (grade, expected) => {
    expect(gradeToColor(grade)).toBe(expected)
  })
})

describe('clamp', () => {
  it('在范围内', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })
  it('高于 max', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })
  it('低于 min', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })
  it('边界', () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})

describe('mapRange', () => {
  it('线性映射', () => {
    expect(mapRange(50, 0, 100, 0, 1)).toBe(0.5)
    expect(mapRange(0, 0, 100, -1, 1)).toBe(-1)
    expect(mapRange(100, 0, 100, -1, 1)).toBe(1)
  })
  it('退化情况（min=max）返回 outMin', () => {
    expect(mapRange(5, 10, 10, 0, 100)).toBe(0)
  })
})
