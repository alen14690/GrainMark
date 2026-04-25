/**
 * PhotoCard.clampAspect 纯函数单元测试
 *
 * 职责：把用户真实照片的 width/height 比例归一到适合网格展示的区间，
 * 避免极端值（例如全景 5:1）撑爆网格高度或挤扁竖拍图。
 */
import { describe, expect, it } from 'vitest'
import { clampAspect } from '../../src/design/components/PhotoCard'

describe('clampAspect', () => {
  it('undefined / 0 / 负数 → 默认 4/3', () => {
    expect(clampAspect(undefined)).toBeCloseTo(4 / 3)
    expect(clampAspect(0)).toBeCloseTo(4 / 3)
    expect(clampAspect(-1)).toBeCloseTo(4 / 3)
  })
  it('NaN / Infinity → 默认 4/3', () => {
    expect(clampAspect(Number.NaN)).toBeCloseTo(4 / 3)
    expect(clampAspect(Number.POSITIVE_INFINITY)).toBeCloseTo(4 / 3)
  })
  it('横拍 3/2 ≈ 1.5 在范围内 → 原值', () => {
    expect(clampAspect(1.5)).toBe(1.5)
  })
  it('竖拍 2/3 ≈ 0.667 在范围内 → 原值', () => {
    expect(clampAspect(2 / 3)).toBeCloseTo(2 / 3)
  })
  it('方形 1:1 → 原值', () => {
    expect(clampAspect(1)).toBe(1)
  })
  it('超竖 1:3 → 下限 0.5（显示 letterbox 而不是挤扁）', () => {
    expect(clampAspect(1 / 3)).toBe(0.5)
  })
  it('超宽全景 5:1 → 上限 2.2', () => {
    expect(clampAspect(5)).toBe(2.2)
  })
  it('恰好在边界：0.5 / 2.2 → 不变', () => {
    expect(clampAspect(0.5)).toBe(0.5)
    expect(clampAspect(2.2)).toBe(2.2)
  })
  it('微小偏移：0.49 → 0.5, 2.21 → 2.2', () => {
    expect(clampAspect(0.49)).toBe(0.5)
    expect(clampAspect(2.21)).toBe(2.2)
  })
})
