import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
/**
 * JsonTable 单元测试
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

  it('upsert + get', () => {
    table.upsert({ id: 'a', name: 'Alpha', value: 1 })
    const found = table.get('a')
    expect(found?.name).toBe('Alpha')
  })

  it('upsert 同 id 会覆盖', () => {
    table.upsert({ id: 'a', name: 'Old' })
    table.upsert({ id: 'a', name: 'New' })
    expect(table.count()).toBe(1)
    expect(table.get('a')?.name).toBe('New')
  })

  it('delete existing returns true', () => {
    table.upsert({ id: 'x', name: 'X' })
    expect(table.delete('x')).toBe(true)
    expect(table.get('x')).toBeUndefined()
  })

  it('delete non-existent returns false', () => {
    expect(table.delete('nope')).toBe(false)
  })

  it('filter and find work', () => {
    table.upsert({ id: '1', name: 'one', value: 1 })
    table.upsert({ id: '2', name: 'two', value: 2 })
    table.upsert({ id: '3', name: 'three', value: 3 })
    expect(table.filter((i) => (i.value ?? 0) > 1).length).toBe(2)
    expect(table.find((i) => i.name === 'two')?.id).toBe('2')
  })

  it('持久化到磁盘', async () => {
    table.upsert({ id: 'a', name: 'A' })
    // 等待 microtask 落盘
    await new Promise((r) => setTimeout(r, 20))
    const reopened = new JsonTable<Item>(dir, 'items')
    expect(reopened.get('a')?.name).toBe('A')
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

  it('set + get', () => {
    kv.set('theme', 'dark')
    expect(kv.get<string>('theme')).toBe('dark')
  })

  it('handles objects', () => {
    const data = { nested: { a: 1, b: [1, 2, 3] } }
    kv.set('cfg', data)
    expect(kv.get('cfg')).toEqual(data)
  })

  it('returns undefined for missing key', () => {
    expect(kv.get('missing')).toBeUndefined()
  })

  it('持久化到磁盘（立即）', () => {
    kv.set('k', 'v')
    const reopened = new JsonKV(dir, 'settings')
    expect(reopened.get<string>('k')).toBe('v')
  })
})
