/**
 * Motion 预设单元测试
 */
import { describe, expect, it } from 'vitest'
import { presets, transition } from '../../src/design/motion'

describe('transition', () => {
  it('单属性', () => {
    const t = transition('opacity', 'base', 'standard')
    expect(t).toBe('opacity 250ms cubic-bezier(0.4, 0.0, 0.2, 1)')
  })
  it('多属性', () => {
    const t = transition(['opacity', 'transform'], 'fast', 'decelerate')
    expect(t).toContain('opacity 150ms')
    expect(t).toContain('transform 150ms')
    // 两段 transition 由 ", " 连接（cubic-bezier 内部的逗号不含空格或含空格都可能），
    // 检验包含两个缓动函数定义即可
    expect((t.match(/cubic-bezier/g) ?? []).length).toBe(2)
  })
  it('使用默认时长/缓动', () => {
    const t = transition('color')
    expect(t).toContain('250ms')
    expect(t).toContain('cubic-bezier(0.4, 0.0, 0.2, 1)')
  })
})

describe('presets', () => {
  it('定义了 5 个预设', () => {
    expect(presets.hover).toBeTruthy()
    expect(presets.press).toBeTruthy()
    expect(presets.reveal).toBeTruthy()
    expect(presets.modal).toBeTruthy()
    expect(presets.filmic).toBeTruthy()
  })
  it('预设内容为合法 CSS transition', () => {
    for (const value of Object.values(presets)) {
      expect(value).toMatch(/\d+ms.*cubic-bezier/)
    }
  })
})
