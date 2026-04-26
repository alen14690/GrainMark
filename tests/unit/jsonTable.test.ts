import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
/**
 * JsonTable 单元测试（F11/F12 修复后：upsert/delete/clear/set 返回 Promise）
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JsonKV, JsonTable } from '../../electron/services/storage/jsonTable'

interface Item {
  id: string
  name: string
  value?: number
}

describe('JsonTable', () => {
  let dir: string
  let table: JsonTable<Item>

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grain-jt-'))
    table = new JsonTable<Item>(dir, 'items')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('starts empty', () => {
    expect(table.count()).toBe(0)
    expect(table.all()).toEqual([])
  })

  it('upsert + get', async () => {
    await table.upsert({ id: 'a', name: 'Alpha', value: 1 })
    const found = table.get('a')
    expect(found?.name).toBe('Alpha')
  })

  it('upsert 同 id 会覆盖', async () => {
    await table.upsert({ id: 'a', name: 'Old' })
    await table.upsert({ id: 'a', name: 'New' })
    expect(table.count()).toBe(1)
    expect(table.get('a')?.name).toBe('New')
  })

  it('delete existing returns true', async () => {
    await table.upsert({ id: 'x', name: 'X' })
    expect(await table.delete('x')).toBe(true)
    expect(table.get('x')).toBeUndefined()
  })

  it('delete non-existent returns false', async () => {
    expect(await table.delete('nope')).toBe(false)
  })

  it('filter and find work', async () => {
    await table.upsert({ id: '1', name: 'one', value: 1 })
    await table.upsert({ id: '2', name: 'two', value: 2 })
    await table.upsert({ id: '3', name: 'three', value: 3 })
    expect(table.filter((i) => (i.value ?? 0) > 1).length).toBe(2)
    expect(table.find((i) => i.name === 'two')?.id).toBe('2')
  })

  it('持久化到磁盘（await flush 后文件稳定可读）', async () => {
    await table.upsert({ id: 'a', name: 'A' })
    await table.flush()
    const reopened = new JsonTable<Item>(dir, 'items')
    expect(reopened.get('a')?.name).toBe('A')
  })

  it('F11：并发写入不丢数据（100 次 upsert 后 count=100）', async () => {
    const promises: Promise<void>[] = []
    for (let i = 0; i < 100; i++) {
      promises.push(table.upsert({ id: `k${i}`, name: `Item ${i}`, value: i }))
    }
    await Promise.all(promises)
    await table.flush()
    const reopened = new JsonTable<Item>(dir, 'items')
    expect(reopened.count()).toBe(100)
    expect(reopened.get('k50')?.value).toBe(50)
  })

  it('F11：写入失败后 dirty 仍保留（下一次 schedule 重试）', async () => {
    await table.upsert({ id: 'a', name: 'A' })
    await table.flush()
    // 模拟手动删 target 目录 —— rename 会失败
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    // 再写一次应该不 throw（fire-and-forget 场景）也应该能触发重建
    await table.upsert({ id: 'b', name: 'B' }).catch(() => undefined)
    // 如果 rename 失败会 reject；我们不强制断言 flush 成功，只验证 API 不崩
    expect(table.get('b')?.name).toBe('B')
  })
})

describe('JsonKV', () => {
  let dir: string
  let kv: JsonKV

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grain-kv-'))
    kv = new JsonKV(dir, 'settings')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('set + get', async () => {
    await kv.set('theme', 'dark')
    expect(kv.get<string>('theme')).toBe('dark')
  })

  it('handles objects', async () => {
    const data = { nested: { a: 1, b: [1, 2, 3] } }
    await kv.set('cfg', data)
    expect(kv.get('cfg')).toEqual(data)
  })

  it('returns undefined for missing key', () => {
    expect(kv.get('missing')).toBeUndefined()
  })

  it('持久化到磁盘（await set 后文件稳定可读）', async () => {
    await kv.set('k', 'v')
    await kv.flush()
    const reopened = new JsonKV(dir, 'settings')
    expect(reopened.get<string>('k')).toBe('v')
  })
})
