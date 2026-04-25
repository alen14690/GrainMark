/**
 * rawDecoder 单元测试（mock exiftool 不依赖真 RAW 文件）
 */
import { describe, expect, it, vi } from 'vitest'
import {
  RAW_EXTENSIONS,
  UnsupportedRawError,
  extractEmbeddedJpeg,
  isRawFormat,
} from '../../electron/services/raw/rawDecoder'

// ========== isRawFormat ==========
describe('isRawFormat', () => {
  it('识别主流 RAW 扩展名', () => {
    for (const ext of ['nef', 'cr2', 'cr3', 'arw', 'dng', 'raf', 'orf', 'rw2']) {
      expect(isRawFormat(`/tmp/test.${ext}`)).toBe(true)
    }
  })
  it('大小写无关', () => {
    expect(isRawFormat('photo.NEF')).toBe(true)
    expect(isRawFormat('photo.Cr3')).toBe(true)
  })
  it('只传扩展名也能识别（带 . 与不带 .）', () => {
    expect(isRawFormat('nef')).toBe(true)
    expect(isRawFormat('.nef')).toBe(true)
  })
  it('非 RAW 返回 false', () => {
    expect(isRawFormat('photo.jpg')).toBe(false)
    expect(isRawFormat('photo.png')).toBe(false)
    expect(isRawFormat('photo.tif')).toBe(false)
    expect(isRawFormat('photo.heic')).toBe(false)
  })
  it('空或无扩展名返回 false', () => {
    expect(isRawFormat('noext')).toBe(false)
    expect(isRawFormat('')).toBe(false)
  })
  it('白名单非空且覆盖至少 20 种', () => {
    expect(RAW_EXTENSIONS.size).toBeGreaterThanOrEqual(20)
  })
})

// ========== extractEmbeddedJpeg ==========
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const NON_JPEG_HEADER = Buffer.from([0x4d, 0x4d, 0x00, 0x2a]) // TIFF header

describe('extractEmbeddedJpeg · 降级链', () => {
  it('JpgFromRaw 成功 → 直接返回', async () => {
    const spy = vi.fn(async (tag: string) => {
      if (tag === 'JpgFromRaw') return Buffer.concat([JPEG_HEADER, Buffer.alloc(100)])
      throw new Error('should not be called')
    })
    const r = await extractEmbeddedJpeg('/tmp/test.nef', { exiftool: { extractBinaryTagToBuffer: spy } })
    expect(r.tag).toBe('JpgFromRaw')
    expect(r.buffer.length).toBe(104)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('JpgFromRaw 缺失 → 降级 PreviewImage', async () => {
    const spy = vi.fn(async (tag: string) => {
      if (tag === 'JpgFromRaw') throw new Error('tag not found')
      if (tag === 'PreviewImage') return Buffer.concat([JPEG_HEADER, Buffer.alloc(50)])
      throw new Error('n/a')
    })
    const r = await extractEmbeddedJpeg('/tmp/test.nef', { exiftool: { extractBinaryTagToBuffer: spy } })
    expect(r.tag).toBe('PreviewImage')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('JpgFromRaw + PreviewImage 缺失 → 降级 ThumbnailImage', async () => {
    const spy = vi.fn(async (tag: string) => {
      if (tag === 'ThumbnailImage') return Buffer.concat([JPEG_HEADER, Buffer.alloc(20)])
      throw new Error('tag not found')
    })
    const r = await extractEmbeddedJpeg('/tmp/test.nef', { exiftool: { extractBinaryTagToBuffer: spy } })
    expect(r.tag).toBe('ThumbnailImage')
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('所有 tag 均失败 → UnsupportedRawError(no-embedded-jpeg)', async () => {
    const spy = vi.fn(async () => {
      throw new Error('tag not found')
    })
    await expect(
      extractEmbeddedJpeg('/tmp/x.cr3', { exiftool: { extractBinaryTagToBuffer: spy } }),
    ).rejects.toMatchObject({
      name: 'UnsupportedRawError',
      reason: 'no-embedded-jpeg',
      filePath: '/tmp/x.cr3',
    })
  })

  it('返回 undefined / 空 buffer → 视为缺失继续降级', async () => {
    const seq: Array<Buffer | undefined> = [
      undefined,
      Buffer.alloc(0),
      Buffer.concat([JPEG_HEADER, Buffer.alloc(10)]),
    ]
    let i = 0
    const spy = vi.fn(async () => seq[i++])
    const r = await extractEmbeddedJpeg('/tmp/x.arw', { exiftool: { extractBinaryTagToBuffer: spy } })
    expect(r.tag).toBe('ThumbnailImage')
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('返回非 JPEG 魔数（TIFF）→ 跳过并降级', async () => {
    let calls = 0
    const spy = vi.fn(async () => {
      calls++
      if (calls < 3) return Buffer.concat([NON_JPEG_HEADER, Buffer.alloc(20)])
      return Buffer.concat([JPEG_HEADER, Buffer.alloc(20)])
    })
    const r = await extractEmbeddedJpeg('/tmp/x.dng', { exiftool: { extractBinaryTagToBuffer: spy } })
    expect(r.tag).toBe('ThumbnailImage')
  })

  it('exiftool 抛 timeout → UnsupportedRawError(timeout)', async () => {
    const spy = vi.fn(async () => {
      throw new Error('timeout: extract JpgFromRaw > 8000ms')
    })
    await expect(
      extractEmbeddedJpeg('/tmp/x.raf', { exiftool: { extractBinaryTagToBuffer: spy } }),
    ).rejects.toMatchObject({
      name: 'UnsupportedRawError',
      reason: 'timeout',
    })
  })

  it('UnsupportedRawError 可通过 instanceof 判定', async () => {
    const spy = vi.fn(async () => {
      throw new Error('x')
    })
    try {
      await extractEmbeddedJpeg('/tmp/x.nef', { exiftool: { extractBinaryTagToBuffer: spy } })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedRawError)
      expect(err).toBeInstanceOf(Error)
    }
  })
})
