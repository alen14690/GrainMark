/**
 * photoStore.repairPhotoRecord 单元测试
 *
 * 覆盖：
 *   - thumbPath 缺失 → 调用 makeThumbnail 并写回
 *   - thumbPath 指向的文件不存在 → 也视为缺失
 *   - width/height 为 0 → 调用 detectDisplayDimensions 并写回（处理竖拍方向）
 *   - 源文件不存在 → 不做重建（避免无限 warn）
 *   - 全部字段都已存在 → 返回原引用，不触发任何修复
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Photo } from '../../shared/types'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-photostore-'))

vi.mock('electron', () => ({
  app: {
    getPath: (_k: string) => tmpRoot,
    getName: () => 'GrainMark',
  },
}))

// 提升 mock spies（filter-engine/thumbnail）
const hoisted = vi.hoisted(() => ({
  makeThumbnail: vi.fn<(path: string, size: number) => Promise<string>>(),
  detectDisplayDimensions: vi.fn<(path: string) => Promise<{ width: number; height: number } | null>>(),
}))

vi.mock('../../electron/services/filter-engine/thumbnail', () => ({
  makeThumbnail: (p: string, s: number) => hoisted.makeThumbnail(p, s),
  detectDisplayDimensions: (p: string) => hoisted.detectDisplayDimensions(p),
}))

let mod: typeof import('../../electron/services/storage/photoStore')

beforeEach(async () => {
  vi.resetModules()
  hoisted.makeThumbnail.mockReset()
  hoisted.detectDisplayDimensions.mockReset()
  // 每次都重新 import 以拿到干净的 electron mock 句柄
  mod = await import('../../electron/services/storage/photoStore')
})

afterEach(() => {
  vi.clearAllMocks()
})

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  const srcPath = path.join(tmpRoot, 'src.jpg')
  if (!fs.existsSync(srcPath)) fs.writeFileSync(srcPath, Buffer.from([0xff, 0xd8, 0xff]))
  return {
    id: 'id1',
    path: srcPath,
    name: 'src.jpg',
    format: 'jpg',
    sizeBytes: 3,
    width: 100,
    height: 200,
    thumbPath: undefined,
    exif: { width: 100, height: 200 },
    starred: false,
    rating: 0,
    tags: [],
    importedAt: Date.now(),
    ...overrides,
  }
}

describe('repairPhotoRecord', () => {
  it('thumbPath 缺失且源文件存在 → 调用 makeThumbnail + 返回新对象', async () => {
    hoisted.makeThumbnail.mockResolvedValueOnce('/tmp/thumb-abc.jpg')
    const before = makePhoto({ thumbPath: undefined })
    const after = await mod.repairPhotoRecord(before)
    expect(after).not.toBe(before)
    expect(after.thumbPath).toBe('/tmp/thumb-abc.jpg')
    expect(hoisted.makeThumbnail).toHaveBeenCalledWith(before.path, 360)
  })

  it('thumbPath 指向不存在的文件 → 重建', async () => {
    hoisted.makeThumbnail.mockResolvedValueOnce('/tmp/thumb-new.jpg')
    const before = makePhoto({ thumbPath: '/nonexistent/thumb.jpg' })
    const after = await mod.repairPhotoRecord(before)
    expect(after.thumbPath).toBe('/tmp/thumb-new.jpg')
    expect(hoisted.makeThumbnail).toHaveBeenCalled()
  })

  it('源文件不存在 → 不调 makeThumbnail，返回原引用', async () => {
    const before = makePhoto({ path: '/no/such/file.jpg', thumbPath: undefined })
    const after = await mod.repairPhotoRecord(before)
    expect(after).toBe(before)
    expect(hoisted.makeThumbnail).not.toHaveBeenCalled()
  })

  it('width 为 0 → 调 detectDisplayDimensions 写回竖拍尺寸', async () => {
    hoisted.detectDisplayDimensions.mockResolvedValueOnce({ width: 3000, height: 4500 })
    const before = makePhoto({ width: 0, height: 0, thumbPath: '/ok.jpg' })
    // 让 thumbPath 校验通过：写入真实文件
    fs.writeFileSync(path.join(tmpRoot, 'ok.jpg'), 'x')
    const b2 = { ...before, thumbPath: path.join(tmpRoot, 'ok.jpg') }
    const after = await mod.repairPhotoRecord(b2)
    expect(after.width).toBe(3000)
    expect(after.height).toBe(4500)
    expect(hoisted.detectDisplayDimensions).toHaveBeenCalledWith(before.path)
  })

  it('完整记录 + thumb 已是当前算法 → 返回原引用，不触发数据改动', async () => {
    const thumbFile = path.join(tmpRoot, 'have-thumb.jpg')
    fs.writeFileSync(thumbFile, 'x')
    const before = makePhoto({ width: 6000, height: 4000, thumbPath: thumbFile })
    // 模拟当前算法生成的 thumb 路径 == 现有 thumbPath → 算法版本一致，不升级
    hoisted.makeThumbnail.mockResolvedValue(thumbFile)

    const after = await mod.repairPhotoRecord(before)

    // makeThumbnail 会被调一次以"核对算法版本"
    expect(hoisted.makeThumbnail).toHaveBeenCalledWith(before.path, 360)
    // 但结果路径相同，所以 photo 记录不改
    expect(after.width).toBe(6000)
    expect(after.height).toBe(4000)
    expect(after.thumbPath).toBe(thumbFile)
    // detectDisplayDimensions 不应被调（尺寸没缺）
    expect(hoisted.detectDisplayDimensions).not.toHaveBeenCalled()
    // 方向校对 step 3 会读实际 thumb 文件，但我们写入的是 "x" 不是有效图像 →
    // 校对会 catch 并静默，最终 next === photo 时 changed=false，返回原引用
    expect(after).toBe(before)
  })

  it('完整记录 + thumb 是旧算法产物 → 升级到新 thumb path', async () => {
    const oldThumb = path.join(tmpRoot, 'old-thumb.jpg')
    const newThumb = path.join(tmpRoot, 'new-algo-thumb.jpg')
    fs.writeFileSync(oldThumb, 'x')
    fs.writeFileSync(newThumb, 'x')
    const before = makePhoto({ width: 6000, height: 4000, thumbPath: oldThumb })
    // makeThumbnail 返回新路径 → repair 检测到差异 → 替换
    hoisted.makeThumbnail.mockResolvedValue(newThumb)

    const after = await mod.repairPhotoRecord(before)

    expect(after).not.toBe(before)
    expect(after.thumbPath).toBe(newThumb)
  })

  it('makeThumbnail 抛错 → 捕获并返回原引用（不影响主流程）', async () => {
    hoisted.makeThumbnail.mockRejectedValueOnce(new Error('sharp crashed'))
    const before = makePhoto({ thumbPath: undefined })
    const after = await mod.repairPhotoRecord(before)
    expect(after).toBe(before)
    expect(after.thumbPath).toBeUndefined()
  })

  it('detect 返回 null → 降级到 EXIF 尺寸', async () => {
    hoisted.detectDisplayDimensions.mockResolvedValueOnce(null)
    const thumbFile = path.join(tmpRoot, 'th.jpg')
    fs.writeFileSync(thumbFile, 'x')
    // makePhoto 默认 exif: { width: 100, height: 200 }；orientation 未设 → 不旋转
    const before = makePhoto({ width: 0, height: 0, thumbPath: thumbFile })
    const after = await mod.repairPhotoRecord(before)
    expect(after.width).toBe(100)
    expect(after.height).toBe(200)
  })

  it('detect 返回 null + EXIF orientation=6（竖拍）→ 降级时交换宽高', async () => {
    hoisted.detectDisplayDimensions.mockResolvedValueOnce(null)
    const thumbFile = path.join(tmpRoot, 'th2.jpg')
    fs.writeFileSync(thumbFile, 'x')
    const before = makePhoto({
      width: 0,
      height: 0,
      thumbPath: thumbFile,
      exif: { width: 6000, height: 4000, orientation: 6 }, // 传感器 6000×4000 竖拍 → 呈现 4000×6000
    })
    const after = await mod.repairPhotoRecord(before)
    expect(after.width).toBe(4000)
    expect(after.height).toBe(6000)
  })

  it('detect 返回 null + EXIF 也无尺寸 → 保持 0', async () => {
    hoisted.detectDisplayDimensions.mockResolvedValueOnce(null)
    const thumbFile = path.join(tmpRoot, 'th3.jpg')
    fs.writeFileSync(thumbFile, 'x')
    const before = makePhoto({
      width: 0,
      height: 0,
      thumbPath: thumbFile,
      exif: {}, // 没有任何尺寸信息
    })
    const after = await mod.repairPhotoRecord(before)
    expect(after.width).toBe(0)
    expect(after.height).toBe(0)
  })
})

describe('listPhotos · 后台 repair 串行化（避免 race）', () => {
  // photoStore.listPhotos 依赖 getPhotosTable()，需先 initStorage
  beforeEach(async () => {
    const init = await import('../../electron/services/storage/init')
    await init.initStorage()
  })

  it('并发 10 次 listPhotos → 只启动 1 个 repair batch', async () => {
    // 准备一条需要修复的记录，让 repair batch 实际会启动
    // makeThumbnail 人为慢一点（50ms）以模拟 IO 时间，便于并发抓住 repairInFlight
    let callCount = 0
    hoisted.makeThumbnail.mockImplementation(async (_p: string, _s: number) => {
      callCount++
      await new Promise((r) => setTimeout(r, 50))
      return path.join(tmpRoot, `slow-${callCount}.jpg`)
    })

    // 通过 photoStore 内部的 table 直接 upsert 一条缺 thumb 的记录
    const table = (await import('../../electron/services/storage/init')).getPhotosTable()
    const srcPath = path.join(tmpRoot, 'src.jpg')
    if (!fs.existsSync(srcPath)) fs.writeFileSync(srcPath, Buffer.from([0xff, 0xd8, 0xff]))
    table.upsert({
      id: 'race-test-1',
      path: srcPath,
      name: 'src.jpg',
      format: 'jpg',
      sizeBytes: 3,
      width: 100,
      height: 200,
      thumbPath: undefined,
      exif: { width: 100, height: 200 },
      starred: false,
      rating: 0,
      tags: [],
      importedAt: Date.now(),
    })

    // 并发 10 次 listPhotos
    const snapshots = Array.from({ length: 10 }, () => mod.listPhotos())
    expect(snapshots).toHaveLength(10)
    // 等所有 repair 落盘
    await mod._waitRepairIdle()

    // 串行化保证 makeThumbnail 只被 batch 触发 1 次（对同一条缺 thumb 的记录）
    expect(callCount).toBe(1)
  })

  it('_waitRepairIdle 在无 batch 时立刻 resolve', async () => {
    // 前置：上一个 it 已经把 batch 跑完，这里应当 idle
    await expect(mod._waitRepairIdle()).resolves.toBeUndefined()
  })
})
