/**
 * filterStore 单测（M4.4）
 *
 * 覆盖 saveFilter → listFilters → getFilter 的往返 + source 分类：
 *   - builtin preset 存到 builtin 子目录
 *   - imported/extracted/community preset 存到 user 子目录
 *   - saveFilter 自动填充 createdAt/updatedAt
 *   - deleteFilter 删 user 滤镜 / 拒绝删 builtin
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilterPreset } from '../../shared/types'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-filterstore-'))

vi.mock('electron', () => ({
  app: {
    getPath: (_k: string) => tmpRoot,
    getName: () => 'GrainMark',
  },
}))

function makePreset(overrides: Partial<FilterPreset> = {}): FilterPreset {
  return {
    id: 'user-test-abc',
    name: 'Test Filter',
    category: 'custom',
    author: 'user',
    version: '1.0',
    popularity: 0,
    source: 'imported',
    pipeline: {
      tone: { exposure: 0.5, contrast: 10, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
    },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

let mod: typeof import('../../electron/services/storage/filterStore')

beforeEach(async () => {
  vi.resetModules()
  // 清 user / builtin 目录
  const userDir = path.join(tmpRoot, 'filters', 'user')
  if (fs.existsSync(userDir)) {
    for (const f of fs.readdirSync(userDir)) fs.unlinkSync(path.join(userDir, f))
  }
  mod = await import('../../electron/services/storage/filterStore')
})

describe('filterStore · saveFilter', () => {
  it('source=imported 的 preset 写入 user 子目录', () => {
    const preset = makePreset({ source: 'imported', id: 'user-imp-1' })
    mod.saveFilter(preset)
    const file = path.join(tmpRoot, 'filters', 'user', 'user-imp-1.json')
    expect(fs.existsSync(file)).toBe(true)
  })

  it('source=extracted 的 preset 写入 user 子目录（与 imported 同待遇）', () => {
    const preset = makePreset({ source: 'extracted', id: 'user-ext-1' })
    mod.saveFilter(preset)
    const file = path.join(tmpRoot, 'filters', 'user', 'user-ext-1.json')
    expect(fs.existsSync(file)).toBe(true)
  })

  it('自动填充 createdAt/updatedAt', () => {
    const preset = makePreset({ id: 'user-ts', createdAt: 0, updatedAt: 0 })
    mod.saveFilter(preset)
    const saved = mod.getFilter('user-ts')!
    expect(saved.createdAt).toBeGreaterThan(0)
    expect(saved.updatedAt).toBeGreaterThan(0)
  })

  it('同 id 重复 save → 覆盖（createdAt 保留 updatedAt 刷新）', async () => {
    const p1 = makePreset({ id: 'user-dup', name: 'V1' })
    mod.saveFilter(p1)
    const t1 = mod.getFilter('user-dup')!.updatedAt
    // 等 5ms 避免 updatedAt 时间戳碰撞
    await new Promise((r) => setTimeout(r, 5))
    const p2 = makePreset({ id: 'user-dup', name: 'V2' })
    mod.saveFilter(p2)
    const saved = mod.getFilter('user-dup')!
    expect(saved.name).toBe('V2')
    expect(saved.updatedAt).toBeGreaterThan(t1)
  })
})

describe('filterStore · listFilters', () => {
  it('返回 builtin + user 合集', () => {
    mod.seedBuiltinPresets() // 写入内置
    mod.saveFilter(makePreset({ id: 'user-my1' }))
    const all = mod.listFilters()
    expect(all.length).toBeGreaterThan(0)
    const myOne = all.find((f) => f.id === 'user-my1')
    expect(myOne?.source).toBe('imported')
  })
})

describe('filterStore · deleteFilter', () => {
  it('删 user 滤镜正常', () => {
    mod.saveFilter(makePreset({ id: 'user-to-del' }))
    expect(mod.getFilter('user-to-del')).toBeTruthy()
    mod.deleteFilter('user-to-del')
    expect(mod.getFilter('user-to-del')).toBeNull()
  })

  it('删 builtin 滤镜抛错', () => {
    mod.seedBuiltinPresets()
    // 任挑一个 builtin preset
    const builtin = mod.listFilters().find((f) => f.source === 'builtin')!
    expect(() => mod.deleteFilter(builtin.id)).toThrow(/Built-in/)
  })
})
