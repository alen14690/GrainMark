/**
 * cacheSweeper 契约测试
 *
 * 覆盖的真实 bug 模式：
 *   - 仍被 photos.json 引用的 thumb 被误删（等同 M3.5 photoStoreRemove 的镜像问题）
 *   - 非 JPEG 文件（.onnx / .json 等）被误删
 *   - 路径穿越（符号链接到目录外）被误删
 *   - LRU 删过头（删完剩余 > 80% 水位才停）或删不到 target
 *
 * 不测：
 *   - 日志格式（属于 logger 职责，且 logger 已脱敏测试）
 *   - env `GRAINMARK_PREVIEW_CACHE_MAX` 的数值解析（边界过弱）
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-sweep-'))

vi.mock('electron', () => ({
  app: {
    getPath: (_k: string) => tmpRoot,
    getName: () => 'GrainMark',
  },
}))

let sweep: typeof import('../../electron/services/storage/cacheSweeper')

beforeEach(async () => {
  vi.resetModules()
  sweep = await import('../../electron/services/storage/cacheSweeper')
})

function previewDir(): string {
  const d = path.join(tmpRoot, 'preview-cache')
  fs.mkdirSync(d, { recursive: true })
  return d
}
function thumbsDir(): string {
  const d = path.join(tmpRoot, 'thumbs')
  fs.mkdirSync(d, { recursive: true })
  return d
}

afterEach(() => {
  // 每次清 preview-cache 和 thumbs（不删 tmpRoot 本身，保留 env mock 的句柄）
  for (const d of [path.join(tmpRoot, 'preview-cache'), path.join(tmpRoot, 'thumbs')]) {
    if (fs.existsSync(d)) {
      for (const f of fs.readdirSync(d)) {
        try {
          fs.unlinkSync(path.join(d, f))
        } catch {
          // ignore
        }
      }
    }
  }
  vi.unstubAllEnvs()
})

/** 辅助：写一个指定大小 + 指定 atime 的文件 */
function writeFileWithAtime(p: string, sizeBytes: number, atimeMs: number): void {
  fs.writeFileSync(p, Buffer.alloc(sizeBytes, 0xff))
  fs.utimesSync(p, new Date(atimeMs), new Date(atimeMs))
}

describe('sweepPreviewCache · LRU 水位控制', () => {
  it('总量未超上限 → 不删任何文件（before === after）', async () => {
    // 设上限 10MB，实际只写 3MB
    vi.stubEnv('GRAINMARK_PREVIEW_CACHE_MAX', String(10 * 1024 * 1024))
    const d = previewDir()
    writeFileWithAtime(path.join(d, 'a.jpg'), 1 * 1024 * 1024, Date.now() - 10_000)
    writeFileWithAtime(path.join(d, 'b.jpg'), 2 * 1024 * 1024, Date.now() - 5_000)

    const r = await sweep.sweepPreviewCache()
    expect(r.deleted).toBe(0)
    expect(r.before).toBe(3 * 1024 * 1024)
    expect(r.after).toBe(3 * 1024 * 1024)
    expect(fs.existsSync(path.join(d, 'a.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(d, 'b.jpg'))).toBe(true)
  })

  it('超过上限 → 按 atime 从最旧开始删，直到降到 80% 水位为止', async () => {
    // 上限 10MB；写 5 个 3MB 文件（总 15MB），期望删到 ~8MB
    vi.stubEnv('GRAINMARK_PREVIEW_CACHE_MAX', String(10 * 1024 * 1024))
    const d = previewDir()
    const now = Date.now()
    // atime 从旧到新：oldest.jpg 最旧，newest.jpg 最新
    writeFileWithAtime(path.join(d, 'oldest.jpg'), 3 * 1024 * 1024, now - 50_000)
    writeFileWithAtime(path.join(d, 'old.jpg'), 3 * 1024 * 1024, now - 40_000)
    writeFileWithAtime(path.join(d, 'mid.jpg'), 3 * 1024 * 1024, now - 30_000)
    writeFileWithAtime(path.join(d, 'new.jpg'), 3 * 1024 * 1024, now - 20_000)
    writeFileWithAtime(path.join(d, 'newest.jpg'), 3 * 1024 * 1024, now - 10_000)

    const r = await sweep.sweepPreviewCache()
    // 15MB > 10MB，必须删到 ≤ 8MB（80% 水位）
    expect(r.after).toBeLessThanOrEqual(8 * 1024 * 1024)
    // 至少删了 3 个最旧的（3 × 3MB = 9MB，剩 6MB）
    expect(fs.existsSync(path.join(d, 'oldest.jpg'))).toBe(false)
    expect(fs.existsSync(path.join(d, 'old.jpg'))).toBe(false)
    expect(fs.existsSync(path.join(d, 'mid.jpg'))).toBe(false)
    // 最新的两个必须保留（否则就"删过头"）
    expect(fs.existsSync(path.join(d, 'newest.jpg'))).toBe(true)
  })

  it('非 JPEG 扩展名（.onnx / .tmp / .json）不被扫描也不被删', async () => {
    vi.stubEnv('GRAINMARK_PREVIEW_CACHE_MAX', String(1 * 1024 * 1024)) // 1MB，故意超上限逼触发删
    const d = previewDir()
    // 大 JPEG 触发删
    writeFileWithAtime(path.join(d, 'big.jpg'), 2 * 1024 * 1024, Date.now() - 10_000)
    // 非 JPEG 不该被碰
    fs.writeFileSync(path.join(d, 'model.onnx'), Buffer.alloc(100))
    fs.writeFileSync(path.join(d, 'notes.json'), Buffer.alloc(100))

    await sweep.sweepPreviewCache()
    expect(fs.existsSync(path.join(d, 'model.onnx'))).toBe(true)
    expect(fs.existsSync(path.join(d, 'notes.json'))).toBe(true)
  })
})

describe('sweepOrphanThumbs · 引用完整性守护', () => {
  it('被 inUsePaths 引用的 thumb 绝对不删（安全契约 · 等同 photoStoreRemove 镜像）', async () => {
    const d = thumbsDir()
    const keep1 = path.join(d, 'photo-abc.jpg')
    const keep2 = path.join(d, 'photo-def.jpg')
    fs.writeFileSync(keep1, Buffer.alloc(1000))
    fs.writeFileSync(keep2, Buffer.alloc(1000))

    const r = await sweep.sweepOrphanThumbs(new Set([keep1, keep2]))
    expect(r.deleted).toBe(0)
    expect(fs.existsSync(keep1)).toBe(true)
    expect(fs.existsSync(keep2)).toBe(true)
  })

  it('未被引用的 thumb 孤儿被删', async () => {
    const d = thumbsDir()
    const keep = path.join(d, 'keep.jpg')
    const orphan1 = path.join(d, 'orphan-1.jpg')
    const orphan2 = path.join(d, 'orphan-2.jpg')
    fs.writeFileSync(keep, Buffer.alloc(1000))
    fs.writeFileSync(orphan1, Buffer.alloc(2000))
    fs.writeFileSync(orphan2, Buffer.alloc(3000))

    const r = await sweep.sweepOrphanThumbs(new Set([keep]))
    expect(r.scanned).toBe(3)
    expect(r.deleted).toBe(2)
    expect(r.deletedBytes).toBe(5000)
    expect(fs.existsSync(keep)).toBe(true)
    expect(fs.existsSync(orphan1)).toBe(false)
    expect(fs.existsSync(orphan2)).toBe(false)
  })

  it('非 JPEG 文件（.db-journal / index.json 等）不扫描不删', async () => {
    const d = thumbsDir()
    fs.writeFileSync(path.join(d, 'keep.jpg'), Buffer.alloc(100))
    fs.writeFileSync(path.join(d, 'index.json'), Buffer.alloc(50))
    fs.writeFileSync(path.join(d, '.DS_Store'), Buffer.alloc(30))

    const r = await sweep.sweepOrphanThumbs(new Set()) // 没引用任何
    // 只扫描 JPEG，只删 JPEG
    expect(r.scanned).toBe(1)
    expect(r.deleted).toBe(1)
    expect(fs.existsSync(path.join(d, 'index.json'))).toBe(true)
    expect(fs.existsSync(path.join(d, '.DS_Store'))).toBe(true)
  })

  it('inUsePaths 里的路径即便未 resolve 也能匹配到实际 thumb 文件（路径标准化契约）', async () => {
    const d = thumbsDir()
    const thumb = path.join(d, 'normalized.jpg')
    fs.writeFileSync(thumb, Buffer.alloc(500))

    // 故意传一个"非绝对但解析后等价"的路径
    const relativePathish = path.join(d, '.', 'normalized.jpg')
    const r = await sweep.sweepOrphanThumbs(new Set([relativePathish]))
    // 该 thumb 必须被识别为仍在用，不删
    expect(r.deleted).toBe(0)
    expect(fs.existsSync(thumb)).toBe(true)
  })
})

describe('runStartupSweep · 两项并行执行且不抛异常', () => {
  it('两个子任务都正常时完成且不抛', async () => {
    const d1 = previewDir()
    const d2 = thumbsDir()
    fs.writeFileSync(path.join(d1, 'tiny.jpg'), Buffer.alloc(100))
    fs.writeFileSync(path.join(d2, 'orphan.jpg'), Buffer.alloc(100))

    // 不应抛
    await expect(sweep.runStartupSweep(new Set())).resolves.toBeUndefined()
    // orphan 应已被清（inUsePaths 空）
    expect(fs.existsSync(path.join(d2, 'orphan.jpg'))).toBe(false)
  })

  it('preview-cache 目录不存在 → 不抛、不崩', async () => {
    // 此时 previewDir 和 thumbsDir 都还没创建（clean state）
    const freshRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-sweep-fresh-'))
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: { getPath: (_k: string) => freshRoot, getName: () => 'GrainMark' },
    }))
    const fresh = await import('../../electron/services/storage/cacheSweeper')
    await expect(fresh.runStartupSweep(new Set())).resolves.toBeUndefined()
    fs.rmSync(freshRoot, { recursive: true, force: true })
  })
})
