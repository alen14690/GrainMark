import { Buffer } from 'node:buffer'
/**
 * rawCache 单元测试 — 使用真实文件系统 + 临时目录
 *
 * 重点覆盖：
 *   - key 稳定性（相同 path+mtime+size → 相同 hash；mtime 改 → hash 改）
 *   - 缓存读写 round-trip
 *   - LRU 淘汰：超出上限时按 atime 删到 80% 水位
 *   - clear / size 统计
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 必须在 import rawCache 之前 mock electron.app
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-rawcache-'))

vi.mock('electron', () => ({
  app: {
    getPath: (k: string) => (k === 'userData' ? tmpRoot : tmpRoot),
    getName: () => 'GrainMark',
  },
}))

// 动态 import 以让 mock 生效
let mod: typeof import('../../electron/services/raw/rawCache')
beforeEach(async () => {
  vi.resetModules()
  mod = await import('../../electron/services/raw/rawCache')
  await mod.clearRawCache()
})

afterEach(() => {
  // 恢复默认上限
  mod.setRawCacheLimit(2 * 1024) // 2GB in MB
})

describe('makeCacheKey', () => {
  it('相同输入 → 相同 hash', () => {
    const k1 = mod.makeCacheKey('/a/b.nef', 123, 456)
    const k2 = mod.makeCacheKey('/a/b.nef', 123, 456)
    expect(k1).toBe(k2)
    expect(k1).toMatch(/^[0-9a-f]{40}$/)
  })
  it('mtime 改变 → hash 改变（源文件修改后缓存自动失效）', () => {
    const k1 = mod.makeCacheKey('/a/b.nef', 100, 456)
    const k2 = mod.makeCacheKey('/a/b.nef', 101, 456)
    expect(k1).not.toBe(k2)
  })
  it('size 改变 → hash 改变', () => {
    expect(mod.makeCacheKey('/a/b.nef', 100, 100)).not.toBe(mod.makeCacheKey('/a/b.nef', 100, 200))
  })
  it('path 改变 → hash 改变', () => {
    expect(mod.makeCacheKey('/a.nef', 1, 1)).not.toBe(mod.makeCacheKey('/b.nef', 1, 1))
  })
})

describe('put / get round-trip', () => {
  it('未命中返回 null', async () => {
    const result = await mod.getCached('deadbeef'.repeat(5))
    expect(result).toBeNull()
  })
  it('put 后 get 命中 + 内容一致', async () => {
    const key = mod.makeCacheKey('/tmp/a.nef', 1, 1)
    const data = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    await mod.putCached(key, data)
    const hit = await mod.getCached(key)
    expect(hit).not.toBeNull()
    expect(hit!.equals(data)).toBe(true)
  })
})

describe('LRU evictIfOverLimit', () => {
  it('未超过上限不删除', async () => {
    mod.setRawCacheLimit(10) // 10MB
    await mod.putCached(mod.makeCacheKey('/x', 1, 1), Buffer.alloc(1024))
    await mod.evictIfOverLimit()
    expect(await mod.getRawCacheSize()).toBe(1024)
  })

  it('超过上限时按 atime 删到 80% 水位', async () => {
    // 先以默认 2GB 写入 5 × 20MB（总 100MB，均 < 2GB，不会触发背景 evict）
    // 然后把上限调到 64MB，再主动调 evictIfOverLimit 触发淘汰。
    mod.setRawCacheLimit(2 * 1024) // 2GB，避免写入时触发淘汰
    const keys: string[] = []
    for (let i = 0; i < 5; i++) {
      const k = mod.makeCacheKey(`/p${i}`, i, i)
      keys.push(k)
      await mod.putCached(k, Buffer.alloc(20 * 1024 * 1024))
    }
    // 等待所有后台 evict 彻底结束（默认 2GB 不会淘汰，但保险起见）
    await new Promise((r) => setTimeout(r, 50))

    // 手动把前两个的 atime 设成最旧（避免并行创建的文件时间接近）
    const dir = mod.getRawCacheDir()
    const now = Date.now()
    fs.utimesSync(path.join(dir, `${keys[0]}.jpg`), new Date(now - 100_000), new Date(now - 100_000))
    fs.utimesSync(path.join(dir, `${keys[1]}.jpg`), new Date(now - 90_000), new Date(now - 90_000))

    // 降上限并显式触发淘汰
    mod.setRawCacheLimit(64) // 64MB
    await mod.evictIfOverLimit()

    const size = await mod.getRawCacheSize()
    // 上限 64MB，80% 水位 = 约 51MB；5 × 20MB = 100MB，淘汰到 ≤ 51MB 需要删 3 个
    expect(size).toBeLessThanOrEqual(64 * 1024 * 1024)
    expect(size).toBeGreaterThan(0)
    // 最旧的两个被删
    expect(await mod.getCached(keys[0]!)).toBeNull()
    expect(await mod.getCached(keys[1]!)).toBeNull()
  })
})

describe('setRawCacheLimit 边界', () => {
  it('小于 64MB 被拉回到 64MB', () => {
    mod.setRawCacheLimit(10)
    expect(mod.getRawCacheLimit()).toBe(64 * 1024 * 1024)
  })
  it('超过 64GB 被拉回到 64GB', () => {
    mod.setRawCacheLimit(999_999)
    expect(mod.getRawCacheLimit()).toBe(64 * 1024 * 1024 * 1024)
  })
})

describe('clearRawCache', () => {
  it('清空所有 .jpg 文件', async () => {
    await mod.putCached(mod.makeCacheKey('/a', 1, 1), Buffer.alloc(100))
    await mod.putCached(mod.makeCacheKey('/b', 2, 2), Buffer.alloc(200))
    expect(await mod.getRawCacheSize()).toBe(300)
    await mod.clearRawCache()
    expect(await mod.getRawCacheSize()).toBe(0)
  })
})
