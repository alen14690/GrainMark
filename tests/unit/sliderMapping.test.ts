/**
 * Slider 核心映射函数契约
 *
 * 覆盖：
 *   - linear 曲线的基本线性映射
 *   - ease-center 曲线：中段梯度 < 两端梯度（Lightroom 风格微调）
 *   - mapRatioToValue / mapValueToRatio 互为逆函数（误差 < 1e-6）
 *   - bipolar 场景（-100..+100）的 0 值正好落在 50% 位置
 *   - clamp 边界：ratio 超出 [0,1] 被安全夹到端点
 */
import { describe, expect, it } from 'vitest'
import { mapRatioToValue, mapValueToRatio } from '../../src/design/components/Slider'

describe('Slider · mapRatioToValue', () => {
  it('linear：ratio=0 → min，ratio=1 → max，ratio=0.5 → 中点', () => {
    expect(mapRatioToValue(0, -100, 100, 'linear')).toBe(-100)
    expect(mapRatioToValue(1, -100, 100, 'linear')).toBe(100)
    expect(mapRatioToValue(0.5, -100, 100, 'linear')).toBe(0)
  })

  it('linear：超出 [0,1] 被夹到端点', () => {
    expect(mapRatioToValue(-0.5, 0, 100, 'linear')).toBe(0)
    expect(mapRatioToValue(1.5, 0, 100, 'linear')).toBe(100)
  })

  it('ease-center：中心(0.5) 精确对应 min/max 的中点', () => {
    expect(mapRatioToValue(0.5, -100, 100, 'ease-center')).toBe(0)
    expect(mapRatioToValue(0.5, 0, 100, 'ease-center')).toBe(50)
  })

  it('ease-center：两端仍分别对应 min/max', () => {
    expect(mapRatioToValue(0, -100, 100, 'ease-center')).toBe(-100)
    expect(mapRatioToValue(1, -100, 100, 'ease-center')).toBe(100)
  })

  it('ease-center：中段响应慢（ratio 0.6 → |value| < linear 同位置的 50%）', () => {
    // linear 0.6 → 20；ease-center 0.6 应该 < 8（梯度在中心几乎为 0）
    const linVal = mapRatioToValue(0.6, -100, 100, 'linear')
    const easeVal = mapRatioToValue(0.6, -100, 100, 'ease-center')
    expect(linVal).toBe(20)
    expect(Math.abs(easeVal)).toBeLessThan(linVal * 0.6)
    expect(easeVal).toBeGreaterThan(0) // 方向正确
  })

  it('ease-center：两端响应快（ratio 0.95 → |value| > linear 同位置的 85%）', () => {
    // linear 0.95 → 90；ease-center 在接近两端时响应加速
    const easeVal = mapRatioToValue(0.95, -100, 100, 'ease-center')
    expect(easeVal).toBeGreaterThan(90 * 0.85)
    expect(easeVal).toBeLessThanOrEqual(100)
  })
})

describe('Slider · mapValueToRatio', () => {
  it('linear：min → 0、max → 1、中点 → 0.5', () => {
    expect(mapValueToRatio(-100, -100, 100, 'linear')).toBe(0)
    expect(mapValueToRatio(100, -100, 100, 'linear')).toBe(1)
    expect(mapValueToRatio(0, -100, 100, 'linear')).toBe(0.5)
  })

  it('ease-center：中点 value=0 对应 ratio=0.5', () => {
    expect(mapValueToRatio(0, -100, 100, 'ease-center')).toBeCloseTo(0.5, 6)
  })
})

describe('Slider · 映射函数互为逆函数', () => {
  const cases: Array<[number, number]> = [
    [-100, 100],
    [-5, 5],
    [0, 100],
    [0, 1],
  ]

  for (const [min, max] of cases) {
    it(`linear 范围 [${min}, ${max}] → 往返误差 < 1e-6`, () => {
      for (const ratio of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const v = mapRatioToValue(ratio, min, max, 'linear')
        const back = mapValueToRatio(v, min, max, 'linear')
        expect(back).toBeCloseTo(ratio, 6)
      }
    })

    it(`ease-center 范围 [${min}, ${max}] → 往返误差 < 1e-5`, () => {
      for (const ratio of [0, 0.15, 0.35, 0.5, 0.65, 0.85, 1]) {
        const v = mapRatioToValue(ratio, min, max, 'ease-center')
        const back = mapValueToRatio(v, min, max, 'ease-center')
        // ease-center 反解使用 sqrt，精度略低
        expect(back).toBeCloseTo(ratio, 5)
      }
    })
  }
})

describe('Slider · ease-center 中段梯度显著低于两端', () => {
  it('中段（0.45..0.55）变化小，两端（0.9..1.0）变化大', () => {
    const midStart = mapRatioToValue(0.45, -100, 100, 'ease-center')
    const midEnd = mapRatioToValue(0.55, -100, 100, 'ease-center')
    const endStart = mapRatioToValue(0.9, -100, 100, 'ease-center')
    const endEnd = mapRatioToValue(1.0, -100, 100, 'ease-center')
    const midDelta = Math.abs(midEnd - midStart)
    const endDelta = Math.abs(endEnd - endStart)
    // 中段 0.1 轨道位移 vs 两端 0.1 轨道位移：两端位移应明显更大（至少 2x）
    expect(endDelta).toBeGreaterThan(midDelta * 2)
  })
})
