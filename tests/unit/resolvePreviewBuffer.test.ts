/**
 * resolvePreviewBuffer 集成测试
 *
 * 覆盖：
 *   - 非 RAW：透传 fs.readFile
 *   - RAW 未命中缓存 → extractEmbeddedJpeg → 返回 buffer + 写入缓存
 *   - RAW 命中缓存 → 直接返回，不再调 extract
 *   - RAW 抽取失败 → 抛出 UnsupportedRawError
 *   - mtime 变化 → 缓存自动失效
 */
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-resolve-'))

vi.mock('electron', () => ({
  app: {
    getPath: (_k: string) => tmpRoot,
    getName: () => 'GrainMark',
  },
}))

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 10, 20, 30, 40])

// 必须用 vi.hoisted 提升变量，否则 factory 访问外层变量会报错
const hoisted = vi.hoisted(() => {
  return {
    extractSpy: vi.fn<(file: string) => Promise<{ buffer: Buffer; tag: string }>>(),
    readExifSpy: vi.fn<(file: string) => Promise<{ orientation?: number }>>(),
  }
})

vi.mock('../../electron/services/raw/rawDecoder', async () => {
  const actual = await vi.importActual<typeof import('../../electron/services/raw/rawDecoder')>(
    '../../electron/services/raw/rawDecoder',
  )
  return {
    ...actual,
    extractEmbeddedJpeg: (file: string) => hoisted.extractSpy(file),
  }
})

vi.mock('../../electron/services/exif/reader', () => ({
  readExif: (file: string) => hoisted.readExifSpy(file),
  shutdownExiftool: vi.fn(async () => undefined),
}))

let mod: typeof import('../../electron/services/raw/index')
let cache: typeof import('../../electron/services/raw/rawCache')

beforeEach(async () => {
  vi.resetModules()
  hoisted.extractSpy.mockReset()
  hoisted.readExifSpy.mockReset()
  hoisted.readExifSpy.mockResolvedValue({}) // 默认无 orientation
  mod = await import('../../electron/services/raw/index')
  cache = await import('../../electron/services/raw/rawCache')
  await cache.clearRawCache()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('resolvePreviewBuffer · 非 RAW 直接透传', () => {
  it('读取普通 JPG 文件', async () => {
    const file = path.join(tmpRoot, 'test.jpg')
    fs.writeFileSync(file, JPEG_BYTES)
    const r = await mod.resolvePreviewBuffer(file)
    expect(r.source).toBe('passthrough')
    expect(r.buffer.equals(JPEG_BYTES)).toBe(true)
    expect(hoisted.extractSpy).not.toHaveBeenCalled()
  })
})

describe('resolvePreviewBuffer · RAW 首次 extract', () => {
  it('未命中 cache → 调用 extract → 返回 + 入缓存', async () => {
    const file = path.join(tmpRoot, 'shot.nef')
    fs.writeFileSync(file, Buffer.alloc(4096)) // RAW 本体（内容不重要，我们 mock 了 extract）
    hoisted.extractSpy.mockResolvedValueOnce({ buffer: JPEG_BYTES, tag: 'JpgFromRaw' })

    const r = await mod.resolvePreviewBuffer(file)

    expect(r.source).toBe('raw-extracted')
    expect(r.rawTag).toBe('JpgFromRaw')
    expect(r.buffer.equals(JPEG_BYTES)).toBe(true)
    expect(hoisted.extractSpy).toHaveBeenCalledTimes(1)

    // 等 putCached 异步写盘完成
    await new Promise((r) => setTimeout(r, 50))
    const stat = fs.statSync(file)
    const key = cache.makeCacheKey(file, stat.mtimeMs, stat.size)
    const hit = await cache.getCached(key)
    expect(hit?.equals(JPEG_BYTES)).toBe(true)
  })
})

describe('resolvePreviewBuffer · RAW 命中缓存', () => {
  it('第二次调用走 cache，不再调 extract', async () => {
    const file = path.join(tmpRoot, 'hit.cr3')
    fs.writeFileSync(file, Buffer.alloc(2048))
    hoisted.extractSpy.mockResolvedValueOnce({ buffer: JPEG_BYTES, tag: 'PreviewImage' })

    await mod.resolvePreviewBuffer(file) // 第一次：extract
    await new Promise((r) => setTimeout(r, 50)) // 等缓存落盘

    const r2 = await mod.resolvePreviewBuffer(file) // 第二次：应走 cache
    expect(r2.source).toBe('raw-cache-hit')
    expect(r2.buffer.equals(JPEG_BYTES)).toBe(true)
    expect(hoisted.extractSpy).toHaveBeenCalledTimes(1) // 只调了一次
  })
})

describe('resolvePreviewBuffer · mtime 变化缓存失效', () => {
  it('源文件 mtime 改变后，缓存 key 变化 → 重新 extract', async () => {
    const file = path.join(tmpRoot, 'chg.arw')
    fs.writeFileSync(file, Buffer.alloc(1024))
    hoisted.extractSpy.mockResolvedValue({ buffer: JPEG_BYTES, tag: 'JpgFromRaw' })

    await mod.resolvePreviewBuffer(file)
    await new Promise((r) => setTimeout(r, 50))

    // 改动源文件 → mtime 变
    const future = new Date(Date.now() + 60_000)
    fs.utimesSync(file, future, future)

    const r2 = await mod.resolvePreviewBuffer(file)
    expect(r2.source).toBe('raw-extracted') // 未命中旧缓存
    expect(hoisted.extractSpy).toHaveBeenCalledTimes(2)
  })
})

describe('resolvePreviewBuffer · extract 失败', () => {
  it('抽取失败 → 抛出原 UnsupportedRawError', async () => {
    const file = path.join(tmpRoot, 'bad.raf')
    fs.writeFileSync(file, Buffer.alloc(512))
    const { UnsupportedRawError } = await import('../../electron/services/raw/rawDecoder')
    hoisted.extractSpy.mockRejectedValueOnce(new UnsupportedRawError(file, 'no-embedded-jpeg'))

    await expect(mod.resolvePreviewBuffer(file)).rejects.toBeInstanceOf(UnsupportedRawError)
  })

  it('非 UnsupportedRawError 也会被透传', async () => {
    const file = path.join(tmpRoot, 'bad2.dng')
    fs.writeFileSync(file, Buffer.alloc(512))
    hoisted.extractSpy.mockRejectedValueOnce(new Error('boom'))
    await expect(mod.resolvePreviewBuffer(file)).rejects.toThrow('boom')
  })
})

describe('isRawFormat 重导出', () => {
  it('从 raw/index 重导出', () => {
    expect(mod.isRawFormat('x.nef')).toBe(true)
    expect(mod.isRawFormat('x.jpg')).toBe(false)
  })
})

describe('resolvePreviewBuffer · orientation 传递', () => {
  it('RAW：sourceOrientation 从 readExif 取得', async () => {
    const file = path.join(tmpRoot, 'portrait.arw')
    fs.writeFileSync(file, Buffer.alloc(4096))
    hoisted.readExifSpy.mockResolvedValueOnce({ orientation: 6 })
    hoisted.extractSpy.mockResolvedValueOnce({ buffer: JPEG_BYTES, tag: 'JpgFromRaw' })

    const r = await mod.resolvePreviewBuffer(file)
    expect(r.sourceOrientation).toBe(6)
  })

  it('RAW cache hit 也带 sourceOrientation', async () => {
    const file = path.join(tmpRoot, 'portrait2.arw')
    fs.writeFileSync(file, Buffer.alloc(1024))
    hoisted.readExifSpy.mockResolvedValue({ orientation: 8 })
    hoisted.extractSpy.mockResolvedValueOnce({ buffer: JPEG_BYTES, tag: 'JpgFromRaw' })

    await mod.resolvePreviewBuffer(file)
    await new Promise((r) => setTimeout(r, 50))
    const r2 = await mod.resolvePreviewBuffer(file)
    expect(r2.source).toBe('raw-cache-hit')
    expect(r2.sourceOrientation).toBe(8)
  })

  it('非 RAW 不返回 sourceOrientation', async () => {
    const file = path.join(tmpRoot, 'landscape.jpg')
    fs.writeFileSync(file, JPEG_BYTES)
    const r = await mod.resolvePreviewBuffer(file)
    expect(r.sourceOrientation).toBeUndefined()
    expect(hoisted.readExifSpy).not.toHaveBeenCalled()
  })

  it('readExif 抛错时 sourceOrientation=undefined 但仍正常返回 buffer', async () => {
    const file = path.join(tmpRoot, 'bad-exif.nef')
    fs.writeFileSync(file, Buffer.alloc(1024))
    hoisted.readExifSpy.mockRejectedValueOnce(new Error('exif boom'))
    hoisted.extractSpy.mockResolvedValueOnce({ buffer: JPEG_BYTES, tag: 'PreviewImage' })

    const r = await mod.resolvePreviewBuffer(file)
    expect(r.buffer.equals(JPEG_BYTES)).toBe(true)
    expect(r.sourceOrientation).toBeUndefined()
  })
})

describe('orientationToRotationDegrees', () => {
  it('1 / undefined → 0', () => {
    expect(mod.orientationToRotationDegrees(1)).toBe(0)
    expect(mod.orientationToRotationDegrees(undefined)).toBe(0)
  })
  it('3 → 180', () => {
    expect(mod.orientationToRotationDegrees(3)).toBe(180)
  })
  it('4 → 180（垂直翻转 = 旋转 180° + 水平翻转）', () => {
    expect(mod.orientationToRotationDegrees(4)).toBe(180)
  })
  it('6 → 90 顺时针', () => {
    expect(mod.orientationToRotationDegrees(6)).toBe(90)
  })
  it('8 → 270 顺时针 (= 90 逆时针)', () => {
    expect(mod.orientationToRotationDegrees(8)).toBe(270)
  })
  it('镜像方向 2/5/7 的旋转分量正确', () => {
    expect(mod.orientationToRotationDegrees(2)).toBe(0)   // 仅水平翻转，无旋转
    expect(mod.orientationToRotationDegrees(5)).toBe(90)  // 旋转 90° + 水平翻转
    expect(mod.orientationToRotationDegrees(7)).toBe(270) // 旋转 90° + 水平翻转（另一向）
  })
})

describe('orientationNeedsFlip', () => {
  it('非镜像方向返回 false', () => {
    expect(mod.orientationNeedsFlip(1)).toBe(false)
    expect(mod.orientationNeedsFlip(3)).toBe(false)
    expect(mod.orientationNeedsFlip(6)).toBe(false)
    expect(mod.orientationNeedsFlip(8)).toBe(false)
    expect(mod.orientationNeedsFlip(undefined)).toBe(false)
  })
  it('镜像方向 2/4/5/7 返回 true', () => {
    expect(mod.orientationNeedsFlip(2)).toBe(true)
    expect(mod.orientationNeedsFlip(4)).toBe(true)
    expect(mod.orientationNeedsFlip(5)).toBe(true)
    expect(mod.orientationNeedsFlip(7)).toBe(true)
  })
})
