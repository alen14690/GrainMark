/**
 * computeHistogramFromRgba / emptyHistogram 单测
 */
import { describe, expect, it } from 'vitest'
import { computeHistogramFromRgba, emptyHistogram } from '../../src/lib/histogram'

describe('emptyHistogram', () => {
  it('4 通道各 256 bin，全 0，total=0', () => {
    const h = emptyHistogram()
    expect(h.r).toHaveLength(256)
    expect(h.g).toHaveLength(256)
    expect(h.b).toHaveLength(256)
    expect(h.luma).toHaveLength(256)
    expect(h.total).toBe(0)
    expect(h.r.every((v) => v === 0)).toBe(true)
  })
})

describe('computeHistogramFromRgba · 基本统计', () => {
  it('4 个纯红像素 → r[255]=4, g[0]=4, b[0]=4, luma[~54]=4', () => {
    const pixels = new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255])
    const h = computeHistogramFromRgba(pixels)
    expect(h.total).toBe(4)
    expect(h.r[255]).toBe(4)
    expect(h.g[0]).toBe(4)
    expect(h.b[0]).toBe(4)
    // luma = 0.2126 * 255 ≈ 54.2 → round → 54
    expect(h.luma[54]).toBe(4)
  })

  it('纯白 + 纯黑混合', () => {
    const pixels = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255])
    const h = computeHistogramFromRgba(pixels)
    expect(h.total).toBe(2)
    expect(h.r[0]).toBe(1)
    expect(h.r[255]).toBe(1)
    expect(h.g[0]).toBe(1)
    expect(h.g[255]).toBe(1)
    expect(h.luma[0]).toBe(1)
    expect(h.luma[255]).toBe(1)
  })

  it('luma clamp 不越界（即使浮点累加超过 255）', () => {
    const pixels = new Uint8Array([255, 255, 255, 255])
    const h = computeHistogramFromRgba(pixels)
    // 0.2126+0.7152+0.0722 = 1.0 * 255 = 255
    expect(h.luma[255]).toBe(1)
    // 其它 bin 均为 0
    for (let i = 0; i < 255; i++) expect(h.luma[i]).toBe(0)
  })

  it('alpha 通道被忽略', () => {
    const pixels = new Uint8Array([
      128,
      128,
      128,
      0, // alpha=0 但仍参与统计
      128,
      128,
      128,
      255,
    ])
    const h = computeHistogramFromRgba(pixels)
    expect(h.total).toBe(2)
    expect(h.r[128]).toBe(2)
  })

  it('stride=2 跳采 → 总数减半', () => {
    const pixels = new Uint8Array(10 * 4)
    for (let i = 0; i < 10; i++) pixels[i * 4] = 100
    const h1 = computeHistogramFromRgba(pixels, 1)
    const h2 = computeHistogramFromRgba(pixels, 2)
    expect(h1.total).toBe(10)
    expect(h2.total).toBe(5)
  })

  it('stride < 1 自动视为 1（防御）', () => {
    const pixels = new Uint8Array([255, 0, 0, 255])
    const h = computeHistogramFromRgba(pixels, 0)
    expect(h.total).toBe(1)
    const h2 = computeHistogramFromRgba(pixels, -5)
    expect(h2.total).toBe(1)
  })

  it('空像素 → total=0，bins 全 0', () => {
    const h = computeHistogramFromRgba(new Uint8Array(0))
    expect(h.total).toBe(0)
    expect(h.r.every((v) => v === 0)).toBe(true)
  })

  it('Uint8ClampedArray 也能正确处理（canvas ctx.getImageData 的返回类型）', () => {
    const data = new Uint8ClampedArray([100, 100, 100, 255])
    const h = computeHistogramFromRgba(data)
    expect(h.total).toBe(1)
    expect(h.r[100]).toBe(1)
  })

  it('大图 1000×1000 跳采（性能烟雾测试）', () => {
    const pixels = new Uint8Array(1000 * 1000 * 4)
    for (let i = 0; i < 1000 * 1000; i++) {
      pixels[i * 4 + 0] = (i * 7) & 0xff
      pixels[i * 4 + 1] = (i * 11) & 0xff
      pixels[i * 4 + 2] = (i * 13) & 0xff
      pixels[i * 4 + 3] = 255
    }
    const stride = Math.ceil((1000 * 1000) / 65536)
    const h = computeHistogramFromRgba(pixels, stride)
    expect(h.total).toBeGreaterThan(60000)
    expect(h.total).toBeLessThan(70000)
    const totalR = h.r.reduce((a, v) => a + v, 0)
    expect(totalR).toBe(h.total)
  })
})
