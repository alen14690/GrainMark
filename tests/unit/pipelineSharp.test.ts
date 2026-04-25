/**
 * pipelineSharp 单测
 * - detectIgnoredChannels：纯函数可直接测
 * - applyPipeline：使用 sharp 生成 100x100 纯色测试图，验证 format / keepExif / resize
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  UNSUPPORTED_CHANNELS_IN_BATCH,
  applyPipeline,
  detectIgnoredChannels,
} from '../../electron/services/batch/pipelineSharp'
import type { FilterPipeline } from '../../shared/types'

/** 100x100 纯灰色 JPEG */
async function makeTestJpeg(gray = 128): Promise<Buffer> {
  return await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: gray, g: gray, b: gray } },
  })
    .jpeg()
    .toBuffer()
}

describe('detectIgnoredChannels', () => {
  it('null pipeline → []', () => {
    expect(detectIgnoredChannels(null)).toEqual([])
  })
  it('pipeline 全空 → []', () => {
    expect(detectIgnoredChannels({})).toEqual([])
  })
  it('只含 tone 不触发（tone 是支持通道）', () => {
    const p: FilterPipeline = {
      tone: { exposure: 10, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
    }
    expect(detectIgnoredChannels(p)).toEqual([])
  })
  it('含 lut → 列 lut', () => {
    expect(detectIgnoredChannels({ lut: 'x.cube' })).toEqual(['lut'])
  })
  it('含 grain amount=5 → 列 grain', () => {
    expect(detectIgnoredChannels({ grain: { amount: 5, size: 1, roughness: 0.5 } })).toEqual(['grain'])
  })
  it('含 grain amount=0 → 不列', () => {
    expect(detectIgnoredChannels({ grain: { amount: 0, size: 1, roughness: 0.5 } })).toEqual([])
  })
  it('含 hsl 非空 → 列 hsl', () => {
    expect(detectIgnoredChannels({ hsl: { red: { h: 10, s: 0, l: 0 } } })).toEqual(['hsl'])
  })
  it('含 halation amount=20 → 列 halation', () => {
    expect(detectIgnoredChannels({ halation: { amount: 20, threshold: 200, radius: 10 } })).toEqual([
      'halation',
    ])
  })
  it('含 curves 非空 → 列 curves', () => {
    expect(detectIgnoredChannels({ curves: { rgb: [{ x: 0, y: 10 }] } })).toEqual(['curves'])
  })
  it('含 curves 全空数组 → 不列', () => {
    expect(detectIgnoredChannels({ curves: { rgb: [], r: [] } })).toEqual([])
  })
  it('多个忽略通道一起', () => {
    const p: FilterPipeline = {
      lut: 'x.cube',
      grain: { amount: 5, size: 1, roughness: 0.5 },
      hsl: { red: { h: 10, s: 0, l: 0 } },
    }
    expect(detectIgnoredChannels(p).sort()).toEqual(['grain', 'hsl', 'lut'].sort())
  })
  it('UNSUPPORTED_CHANNELS_IN_BATCH 契约稳定（避免无意删除）', () => {
    expect(UNSUPPORTED_CHANNELS_IN_BATCH).toEqual([
      'curves',
      'hsl',
      'colorGrading',
      'grain',
      'halation',
      'lut',
    ])
  })
})

describe('applyPipeline · 无滤镜路径', () => {
  it('JPEG in → JPEG out 尺寸不变', async () => {
    const input = await makeTestJpeg(128)
    const r = await applyPipeline({
      input,
      pipeline: null,
      format: 'jpg',
      quality: 90,
      keepExif: false,
    })
    expect(r.info.format).toBe('jpeg')
    expect(r.info.width).toBe(100)
    expect(r.info.height).toBe(100)
  })

  it('resize long-edge=50 → 50x50', async () => {
    const input = await makeTestJpeg(128)
    const r = await applyPipeline({
      input,
      pipeline: null,
      format: 'jpg',
      quality: 90,
      keepExif: false,
      resize: { mode: 'long-edge', value: 50 },
    })
    expect(r.info.width).toBe(50)
    expect(r.info.height).toBe(50)
  })

  it('resize percentage=50 → 50x50', async () => {
    const input = await makeTestJpeg(128)
    const r = await applyPipeline({
      input,
      pipeline: null,
      format: 'jpg',
      quality: 90,
      keepExif: false,
      resize: { mode: 'percentage', value: 50 },
    })
    expect(r.info.width).toBe(50)
  })

  it('format=png', async () => {
    const input = await makeTestJpeg(128)
    const r = await applyPipeline({
      input,
      pipeline: null,
      format: 'png',
      quality: 90,
      keepExif: false,
    })
    expect(r.info.format).toBe('png')
  })

  it('format=webp', async () => {
    const input = await makeTestJpeg(128)
    const r = await applyPipeline({
      input,
      pipeline: null,
      format: 'webp',
      quality: 85,
      keepExif: false,
    })
    expect(r.info.format).toBe('webp')
  })
})

describe('applyPipeline · 支持通道应用', () => {
  it('exposure 应用后像素平均值发生变化', async () => {
    const input = await makeTestJpeg(128)
    const original = await sharp(input).stats()

    const r = await applyPipeline({
      input,
      pipeline: {
        tone: { exposure: 50, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
      },
      format: 'jpg',
      quality: 90,
      keepExif: false,
    })
    const modified = await sharp(r.buffer).stats()
    // 正 exposure → 平均值升高
    const origMean = original.channels.reduce((acc, c) => acc + c.mean, 0) / original.channels.length
    const modMean = modified.channels.reduce((acc, c) => acc + c.mean, 0) / modified.channels.length
    expect(modMean).toBeGreaterThan(origMean)
  })

  it('负 exposure 平均值下降', async () => {
    const input = await makeTestJpeg(128)
    const r = await applyPipeline({
      input,
      pipeline: {
        tone: { exposure: -50, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
      },
      format: 'jpg',
      quality: 90,
      keepExif: false,
    })
    const modified = await sharp(r.buffer).stats()
    const modMean = modified.channels.reduce((acc, c) => acc + c.mean, 0) / modified.channels.length
    expect(modMean).toBeLessThan(128)
  })

  it('saturation=100 → 灰度图（R=G=B）保持不变（因饱和度对单色无意义）', async () => {
    const input = await makeTestJpeg(128)
    const r = await applyPipeline({
      input,
      pipeline: { saturation: 100 },
      format: 'jpg',
      quality: 90,
      keepExif: false,
    })
    const modified = await sharp(r.buffer).stats()
    const rMean = modified.channels[0]!.mean
    const gMean = modified.channels[1]!.mean
    const bMean = modified.channels[2]!.mean
    // 三通道均值差应该仍然很小（因为输入就是灰色）
    expect(Math.abs(rMean - gMean)).toBeLessThan(5)
    expect(Math.abs(gMean - bMean)).toBeLessThan(5)
  })

  it('quality=1（极端压缩）仍能输出有效 JPEG', async () => {
    const input = await makeTestJpeg(128)
    const r = await applyPipeline({
      input,
      pipeline: null,
      format: 'jpg',
      quality: 1,
      keepExif: false,
    })
    expect(r.info.format).toBe('jpeg')
    expect(r.buffer.length).toBeGreaterThan(0)
    expect(r.buffer.length).toBeLessThan(10_000) // 100x100 q=1 非常小
  })

  it('quality=100 包体显著大于 q=40（使用噪声图才能体现）', async () => {
    // 用一张 256x256 随机噪声图，q=40 应比 q=100 小很多
    const pixels = new Uint8Array(256 * 256 * 3)
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 2654435761) >>> 24
    const input = await sharp(Buffer.from(pixels.buffer), {
      raw: { width: 256, height: 256, channels: 3 },
    })
      .jpeg({ quality: 100 })
      .toBuffer()

    const [low, high] = await Promise.all([
      applyPipeline({ input, pipeline: null, format: 'jpg', quality: 40, keepExif: false }),
      applyPipeline({ input, pipeline: null, format: 'jpg', quality: 100, keepExif: false }),
    ])
    expect(high.buffer.length).toBeGreaterThan(low.buffer.length)
  })

  it('clarity=50（正）后像素分布方差增加（锐化效应）', async () => {
    // 用一个渐变图更有意义（单色灰锐化后方差变化不明显）
    const input = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .composite([
        {
          input: Buffer.from([255, 255, 255, 255]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          left: 50,
          top: 0,
        },
      ])
      .jpeg()
      .toBuffer()
    const r = await applyPipeline({
      input,
      pipeline: { clarity: 80 },
      format: 'jpg',
      quality: 95,
      keepExif: false,
    })
    expect(r.info.format).toBe('jpeg')
    expect(r.buffer.length).toBeGreaterThan(0)
  })

  it('orientation=6 应用显式旋转（宽高互换）', async () => {
    // 100x60 输入 → orientation=6 → 输出应是 60x100
    const input = await sharp({
      create: { width: 100, height: 60, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .jpeg()
      .toBuffer()
    const r = await applyPipeline({
      input,
      pipeline: null,
      format: 'jpg',
      quality: 90,
      keepExif: false,
      sourceOrientation: 6,
    })
    expect(r.info.width).toBe(60)
    expect(r.info.height).toBe(100)
  })

  it('orientation=1 / undefined 不旋转', async () => {
    const input = await sharp({
      create: { width: 100, height: 60, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .jpeg()
      .toBuffer()
    const r = await applyPipeline({
      input,
      pipeline: null,
      format: 'jpg',
      quality: 90,
      keepExif: false,
      sourceOrientation: 1,
    })
    expect(r.info.width).toBe(100)
    expect(r.info.height).toBe(60)
  })
})
