/**
 * 颜色科学 matcher + 直方图工具单元测试
 */
import { describe, expect, it } from 'vitest'
import { histogram, histogramStats, rgbToLab } from '../utils/colorMatchers'

describe('color utilities', () => {
  it('RGB to LAB: white → L≈100, a≈0, b≈0', () => {
    const lab = rgbToLab({ r: 255, g: 255, b: 255 })
    expect(lab.L).toBeGreaterThan(95)
    expect(Math.abs(lab.a)).toBeLessThan(3)
    expect(Math.abs(lab.b)).toBeLessThan(3)
  })

  it('RGB to LAB: pure red has positive a', () => {
    const lab = rgbToLab({ r: 255, g: 0, b: 0 })
    expect(lab.a).toBeGreaterThan(50)
  })

  it('histogram counts pixels correctly', () => {
    const pixels = new Uint8Array([0, 0, 0, 255, 255, 255, 128, 128, 128])
    const hist = histogram(pixels, 3)
    expect(hist.r[0]).toBe(1)
    expect(hist.r[255]).toBe(1)
    expect(hist.r[128]).toBe(1)
    // 总和应等于像素数
    expect(hist.r.reduce((s, v) => s + v, 0)).toBe(3)
  })

  it('histogramStats computes mean', () => {
    const hist: number[] = new Array(256).fill(0)
    hist[100] = 10
    const { mean, total } = histogramStats(hist)
    expect(total).toBe(10)
    expect(mean).toBe(100)
  })
})

describe('custom matchers', () => {
  it('toBeInRgbRange passes for in-range', () => {
    expect({ r: 100, g: 100, b: 100 }).toBeInRgbRange({ r: [50, 150] })
  })

  it('toBeInLabRange for near-white', () => {
    expect({ r: 250, g: 250, b: 250 }).toBeInLabRange({ L: [90, 100] })
  })

  it('toHaveHistogramMeanBetween', () => {
    const hist: number[] = new Array(256).fill(0)
    hist[128] = 100
    expect(hist).toHaveHistogramMeanBetween(120, 130)
  })
})
