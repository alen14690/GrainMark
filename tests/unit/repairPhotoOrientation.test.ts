import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Photo } from '../../shared/types'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-repair-'))

vi.mock('electron', () => ({
  app: {
    getPath: (_k: string) => tmpRoot,
    getName: () => 'GrainMark',
  },
}))

// validateImageFile / validateImageDimensions 涉及网络 / 大量依赖，这里用测试不触发导入路径
vi.mock('../../electron/services/security/imageGuard', () => ({
  validateImageFile: vi.fn(async () => undefined),
  validateImageDimensions: vi.fn(() => undefined),
}))

async function makeThumb(aspectDir: 'wide' | 'tall', outPath: string): Promise<void> {
  const w = aspectDir === 'wide' ? 360 : 240
  const h = aspectDir === 'wide' ? 240 : 360
  await sharp({ create: { width: w, height: h, channels: 3, background: { r: 100, g: 150, b: 200 } } })
    .jpeg({ quality: 80 })
    .toFile(outPath)
}

describe('repairPhotoRecord: 尺寸方向一致性', () => {
  let thumbPath: string

  beforeEach(async () => {
    // 每次用独立 thumbs 目录
    const thumbsDir = path.join(tmpRoot, 'thumbs')
    fs.mkdirSync(thumbsDir, { recursive: true })
    thumbPath = path.join(thumbsDir, `thumb-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`)
  })

  afterEach(() => {
    // 清 thumb
    if (fs.existsSync(thumbPath)) {
      try {
        fs.unlinkSync(thumbPath)
      } catch {
        // ignore
      }
    }
  })

  it('photo 方向与 thumb 一致 → 不变（已校对 flag 设上）', async () => {
    await makeThumb('tall', thumbPath)
    const photo: Photo = {
      id: 't1',
      path: '/fake/unused.jpg',
      name: 'unused.jpg',
      format: 'jpg',
      sizeBytes: 1000,
      width: 600, // 竖
      height: 900,
      thumbPath,
      exif: {},
      starred: false,
      rating: 0,
      tags: [],
      importedAt: 1,
    }
    const { repairPhotoRecord } = await import('../../electron/services/storage/photoStore')
    const next = await repairPhotoRecord(photo)
    // 宽高不变
    expect(next.width).toBe(600)
    expect(next.height).toBe(900)
    // 引用可能相同或不同（取决于是否触发 thumb 修复 / orientation 检查未改）
    // 主要断言宽高没被误改即可
  })

  it('photo 宽高反了（存了横，thumb 是竖）→ 自动交换', async () => {
    await makeThumb('tall', thumbPath) // thumb 是 240×360（竖）
    const photo: Photo = {
      id: 't2',
      path: '/fake/unused.jpg',
      name: 'unused.jpg',
      format: 'nef',
      sizeBytes: 1000,
      width: 6000, // 存错了：说是横图
      height: 4000,
      thumbPath,
      exif: {},
      starred: false,
      rating: 0,
      tags: [],
      importedAt: 1,
    }
    const { repairPhotoRecord } = await import('../../electron/services/storage/photoStore')
    const next = await repairPhotoRecord(photo)
    // 交换后应为 4000×6000（竖）
    expect(next.width).toBe(4000)
    expect(next.height).toBe(6000)
  })

  it('photo 宽高反了（存了竖，thumb 是横）→ 自动交换', async () => {
    await makeThumb('wide', thumbPath) // thumb 是 360×240（横）
    const photo: Photo = {
      id: 't3',
      path: '/fake/unused.jpg',
      name: 'unused.jpg',
      format: 'arw',
      sizeBytes: 1000,
      width: 4000, // 存错了：说是竖图
      height: 6000,
      thumbPath,
      exif: {},
      starred: false,
      rating: 0,
      tags: [],
      importedAt: 1,
    }
    const { repairPhotoRecord } = await import('../../electron/services/storage/photoStore')
    const next = await repairPhotoRecord(photo)
    expect(next.width).toBe(6000)
    expect(next.height).toBe(4000)
  })

  it('方形照片（aspect ≈ 1）→ 不触发方向交换', async () => {
    // 构造方形 thumb
    await sharp({ create: { width: 360, height: 360, channels: 3, background: { r: 80, g: 80, b: 80 } } })
      .jpeg({ quality: 80 })
      .toFile(thumbPath)
    const photo: Photo = {
      id: 't4',
      path: '/fake/unused.jpg',
      name: 'unused.jpg',
      format: 'jpg',
      sizeBytes: 1000,
      width: 3000,
      height: 3000,
      thumbPath,
      exif: {},
      starred: false,
      rating: 0,
      tags: [],
      importedAt: 1,
    }
    const { repairPhotoRecord } = await import('../../electron/services/storage/photoStore')
    const next = await repairPhotoRecord(photo)
    expect(next.width).toBe(3000)
    expect(next.height).toBe(3000)
  })

  it('thumbPath 不存在 → 跳过方向检查（只修 thumb 缺失）', async () => {
    // 不创建 thumb 文件
    const photo: Photo = {
      id: 't5',
      path: '/fake/non-existent-source.jpg',
      name: 'unused.jpg',
      format: 'jpg',
      sizeBytes: 1000,
      width: 6000,
      height: 4000,
      thumbPath,
      exif: {},
      starred: false,
      rating: 0,
      tags: [],
      importedAt: 1,
    }
    const { repairPhotoRecord } = await import('../../electron/services/storage/photoStore')
    const next = await repairPhotoRecord(photo)
    // 尺寸保持不变（没有 thumb 可对比）
    expect(next.width).toBe(6000)
    expect(next.height).toBe(4000)
  })

  it('轻微偏差（< 5%）不触发交换', async () => {
    // thumb 360×240（aspect 1.5），photo 1490×1000（aspect 1.49，都是横）→ 不交换
    await makeThumb('wide', thumbPath)
    const photo: Photo = {
      id: 't6',
      path: '/fake/unused.jpg',
      name: 'unused.jpg',
      format: 'jpg',
      sizeBytes: 1000,
      width: 1490,
      height: 1000,
      thumbPath,
      exif: {},
      starred: false,
      rating: 0,
      tags: [],
      importedAt: 1,
    }
    const { repairPhotoRecord } = await import('../../electron/services/storage/photoStore')
    const next = await repairPhotoRecord(photo)
    expect(next.width).toBe(1490)
    expect(next.height).toBe(1000)
  })
})
