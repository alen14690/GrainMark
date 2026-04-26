/**
 * photoStore.removePhotoRecords 单元测试
 *
 * 安全契约覆盖：
 *   1. 删除记录 → JsonTable 里对应条目消失
 *   2. userData/thumbs/ 下的孤儿 thumb 被清理
 *   3. 还被其他 photo 引用的 thumb 不动
 *   4. thumbPath 在 userData/thumbs/ 外（越权）→ 跳过不删，只删记录
 *   5. 不存在的 id → 返回 { removed: 0, ... } 不抛错
 *   6. **永远不会碰 photo.path（硬盘原图）** —— 用 fs spy 验证
 *   7. 空 ids → early return
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Photo } from '../../shared/types'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-remove-'))

vi.mock('electron', () => ({
  app: {
    getPath: (_k: string) => tmpRoot,
    getName: () => 'GrainMark',
  },
}))

// thumbnail 模块的 makeThumbnail 在 removePhotoRecords 不会被调用，但 photoStore import 链路会拉进来
const hoisted = vi.hoisted(() => ({
  makeThumbnail: vi.fn<(path: string, size: number) => Promise<string>>(),
  detectDisplayDimensions: vi.fn<(path: string) => Promise<{ width: number; height: number } | null>>(),
}))

vi.mock('../../electron/services/filter-engine/thumbnail', () => ({
  makeThumbnail: (p: string, s: number) => hoisted.makeThumbnail(p, s),
  detectDisplayDimensions: (p: string) => hoisted.detectDisplayDimensions(p),
}))

let mod: typeof import('../../electron/services/storage/photoStore')
let init: typeof import('../../electron/services/storage/init')

beforeEach(async () => {
  vi.resetModules()
  hoisted.makeThumbnail.mockReset()
  hoisted.detectDisplayDimensions.mockReset()
  init = await import('../../electron/services/storage/init')
  await init.initStorage()
  mod = await import('../../electron/services/storage/photoStore')
  // 清空 photos table
  const table = init.getPhotosTable()
  for (const p of table.all()) table.delete(p.id)
})

afterEach(() => {
  vi.clearAllMocks()
})

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  const srcPath = path.join(tmpRoot, `${overrides.id ?? 'id1'}.jpg`)
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

describe('removePhotoRecords', () => {
  it('空 ids → { removed: 0 }，不动表', () => {
    const before = makePhoto({ id: 'keep-me' })
    init.getPhotosTable().upsert(before)
    const res = mod.removePhotoRecords([])
    expect(res).toEqual({ removed: 0, orphanedThumbs: 0 })
    expect(init.getPhotosTable().count()).toBe(1)
  })

  it('不存在的 id → 静默返回 0，不抛', () => {
    const res = mod.removePhotoRecords(['nonexistent-xyz'])
    expect(res).toEqual({ removed: 0, orphanedThumbs: 0 })
  })

  it('删除单张 → 记录消失，thumb 在受控目录下一并清理', () => {
    // 在 userData/thumbs/ 下造一个真实 thumb 文件
    const thumbsDir = init.getThumbsDir()
    const thumbPath = path.join(thumbsDir, 'abc-thumb.jpg')
    fs.writeFileSync(thumbPath, 'fake jpg')
    expect(fs.existsSync(thumbPath)).toBe(true)

    const photo = makePhoto({ id: 'to-delete', thumbPath })
    init.getPhotosTable().upsert(photo)

    const res = mod.removePhotoRecords(['to-delete'])
    expect(res).toEqual({ removed: 1, orphanedThumbs: 1 })
    expect(init.getPhotosTable().get('to-delete')).toBeUndefined()
    // thumb 被清理
    expect(fs.existsSync(thumbPath)).toBe(false)
    // **原图文件纹丝不动**
    expect(fs.existsSync(photo.path)).toBe(true)
  })

  it('thumb 仍被另一条 photo 引用 → 不删 thumb 文件', () => {
    const thumbsDir = init.getThumbsDir()
    const sharedThumb = path.join(thumbsDir, 'shared.jpg')
    fs.writeFileSync(sharedThumb, 'shared')

    const a = makePhoto({ id: 'a', thumbPath: sharedThumb })
    const b = makePhoto({ id: 'b', thumbPath: sharedThumb })
    init.getPhotosTable().upsert(a)
    init.getPhotosTable().upsert(b)

    // 只删 a → b 仍在用 shared → thumb 保留
    const res = mod.removePhotoRecords(['a'])
    expect(res).toEqual({ removed: 1, orphanedThumbs: 0 })
    expect(fs.existsSync(sharedThumb)).toBe(true)
    expect(init.getPhotosTable().get('b')).toBeTruthy()
  })

  it('thumbPath 在 userData/thumbs 目录之外 → 跳过不删，只删记录（安全兜底）', () => {
    // 构造一个位于 tmpRoot 根下的文件（不在 thumbs/ 子目录内）
    const outsideThumb = path.join(tmpRoot, 'outside.jpg')
    fs.writeFileSync(outsideThumb, 'outside')

    const photo = makePhoto({ id: 'outside', thumbPath: outsideThumb })
    init.getPhotosTable().upsert(photo)

    const res = mod.removePhotoRecords(['outside'])
    expect(res).toEqual({ removed: 1, orphanedThumbs: 0 })
    expect(init.getPhotosTable().get('outside')).toBeUndefined()
    // 受控目录之外的文件必须保留
    expect(fs.existsSync(outsideThumb)).toBe(true)
  })

  it('批量删除多张，一次返回正确计数', () => {
    const thumbsDir = init.getThumbsDir()
    const thumbs: string[] = []
    for (let i = 0; i < 3; i++) {
      const tp = path.join(thumbsDir, `batch-${i}.jpg`)
      fs.writeFileSync(tp, `t${i}`)
      thumbs.push(tp)
      init.getPhotosTable().upsert(makePhoto({ id: `bid-${i}`, thumbPath: tp }))
    }

    const res = mod.removePhotoRecords(['bid-0', 'bid-1', 'bid-2'])
    expect(res).toEqual({ removed: 3, orphanedThumbs: 3 })
    for (const t of thumbs) expect(fs.existsSync(t)).toBe(false)
    expect(init.getPhotosTable().count()).toBe(0)
  })

  it('永远不删除 photo.path 指向的硬盘原图文件', () => {
    const photo = makePhoto({ id: 'safe' })
    init.getPhotosTable().upsert(photo)
    // spy fs.unlinkSync，断言没有任何调用是针对 photo.path 的
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync')
    try {
      mod.removePhotoRecords(['safe'])
      for (const call of unlinkSpy.mock.calls) {
        const p = call[0] as string
        expect(p).not.toBe(photo.path)
      }
      // 原图还在
      expect(fs.existsSync(photo.path)).toBe(true)
    } finally {
      unlinkSpy.mockRestore()
    }
  })

  it('thumbPath 试图 ../ 越权 → resolve 后仍不在 thumbsDir 内 → 跳过', () => {
    // ../../etc/passwd 风格的路径攻击
    const evilPath = path.join(init.getThumbsDir(), '..', '..', 'evil.jpg')
    fs.writeFileSync(evilPath, 'evil')

    const photo = makePhoto({ id: 'evil', thumbPath: evilPath })
    init.getPhotosTable().upsert(photo)

    const res = mod.removePhotoRecords(['evil'])
    expect(res.removed).toBe(1)
    expect(res.orphanedThumbs).toBe(0)
    // 即便路径看起来带 thumbsDir 的前缀，resolve 之后跳出了 → 必须跳过
    expect(fs.existsSync(evilPath)).toBe(true)
    // 清理
    fs.unlinkSync(evilPath)
  })
})
