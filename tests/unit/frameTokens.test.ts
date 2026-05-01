/**
 * frame-tokens 契约测试
 *
 * 为什么需要(AGENTS.md 第 4 条"测试价值优先"):
 *   - 这些 token 会被 16 个 layout 组件和 16 个 Sharp generator 共同消费
 *   - 任何一个数值漂移(哪怕只是从 0.22 → 0.20)都会让 Polaroid 底边视觉变化
 *   - 单测在这里的真实价值是「防止低风险但影响广的改动被无意引入」
 *
 * 非目标(遵循 AGENTS.md 反模式清单):
 *   - 不测 `COLOR.paperWhite === '#F8F5EE'` —— 改值不是 bug
 *   - 不测 `typeof FONT_SIZE.mainTitle === 'number'` —— TS 已保证
 *
 * 实际测试(真实契约):
 *   - classifyOrientation 在边界值 / 退化值 / 典型宽高比下的正确分类
 *   - scaleByMinEdge 的返回值始终是整数(Sharp SVG 要求)且对称(竖图同公式)
 *   - BORDER / FONT_SIZE 值全部落在合理范围(防误输入负数或 > 0.5 等荒唐值)
 */
import { describe, expect, it } from 'vitest'
import {
  BORDER,
  FONT_SIZE,
  ORIENTATION,
  classifyOrientation,
  scaleByMinEdge,
} from '../../shared/frame-tokens'

describe('classifyOrientation · 横竖朝向分类单源', () => {
  it('横图(>1.05)分到 landscape', () => {
    expect(classifyOrientation(4000, 3000)).toBe('landscape') // 4:3
    expect(classifyOrientation(1920, 1080)).toBe('landscape') // 16:9
    expect(classifyOrientation(6000, 4000)).toBe('landscape') // 3:2
  })

  it('竖图(<0.95)分到 portrait', () => {
    expect(classifyOrientation(3000, 4000)).toBe('portrait')
    expect(classifyOrientation(1080, 1920)).toBe('portrait')
  })

  it('准方图(0.95..1.05)分到 square', () => {
    expect(classifyOrientation(1000, 1000)).toBe('square')
    expect(classifyOrientation(2000, 1999)).toBe('square')
    expect(classifyOrientation(1999, 2000)).toBe('square')
  })

  it('边界临界处行为稳定(1.05 / 0.95 本身不抖)', () => {
    // 1.05 刚好等于阈值 → 走 square(> 严格大于才是 landscape)
    expect(classifyOrientation(1050, 1000)).toBe('square')
    // 略大于 1.05 → landscape
    expect(classifyOrientation(1051, 1000)).toBe('landscape')
    // 0.95 刚好等于阈值 → square
    expect(classifyOrientation(950, 1000)).toBe('square')
    // 略小于 0.95 → portrait
    expect(classifyOrientation(949, 1000)).toBe('portrait')
  })

  it('退化输入不崩,默认 landscape', () => {
    expect(classifyOrientation(0, 0)).toBe('landscape')
    expect(classifyOrientation(-1, 100)).toBe('landscape')
    expect(classifyOrientation(100, 0)).toBe('landscape')
  })
})

describe('scaleByMinEdge · 像素换算', () => {
  it('横图用短边(高度)算', () => {
    // Polaroid 底边 0.22 × minEdge(3000) = 660
    expect(scaleByMinEdge(0.22, 4000, 3000)).toBe(660)
  })

  it('竖图用短边(宽度)算', () => {
    // Hairline inset 0.015 × minEdge(3000) = 45
    expect(scaleByMinEdge(0.015, 3000, 4000)).toBe(45)
  })

  it('方图两边一致', () => {
    expect(scaleByMinEdge(0.1, 2000, 2000)).toBe(200)
  })

  it('返回整数(Sharp SVG 不接受小数像素)', () => {
    const result = scaleByMinEdge(0.0333, 1234, 5678)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('比例为 0 返回 0(用于"无边框"风格)', () => {
    expect(scaleByMinEdge(0, 4000, 3000)).toBe(0)
  })
})

describe('BORDER / FONT_SIZE 数值合理性', () => {
  it('所有 BORDER 比例都在 [0, 0.3] 之间(避免外框大于图片本体的荒唐情况)', () => {
    function collectRatios(obj: Record<string, unknown>, acc: number[]): number[] {
      for (const v of Object.values(obj)) {
        if (typeof v === 'number') acc.push(v)
        else if (v && typeof v === 'object') collectRatios(v as Record<string, unknown>, acc)
      }
      return acc
    }
    const ratios = collectRatios(BORDER as unknown as Record<string, unknown>, [])
    expect(ratios.length).toBeGreaterThan(0)
    for (const r of ratios) {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(0.3)
    }
  })

  it('所有 FONT_SIZE 都在 [0.01, 0.05] 之间(极端字号会在高分辨率图上破相)', () => {
    for (const [k, v] of Object.entries(FONT_SIZE)) {
      expect(v, `${k} 字号越界`).toBeGreaterThan(0.01)
      expect(v, `${k} 字号越界`).toBeLessThan(0.05)
    }
  })
})

describe('ORIENTATION 阈值与 classifyOrientation 一致', () => {
  it('landscapeThreshold 就是分界值', () => {
    expect(ORIENTATION.landscapeThreshold).toBe(1.05)
    expect(ORIENTATION.portraitThreshold).toBe(0.95)
  })
})
