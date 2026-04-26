/**
 * 轻量级 JSON 表存储（F11 修复：原子写 + 串行 flush；F12：实现 Repository<T>）
 *
 * - 每张"表"对应一个 JSON 文件
 * - 读在内存；写先写到 `.tmp` 再 rename 上覆盖（原子性，崩溃不留半成品）
 * - 串行 flush：一个写入在飞时，后续变更累加为 pending，等上一次完成后再刷一次
 * - 未来数据量大时可无缝切换到 better-sqlite3（实现同一 Repository<T> 接口）
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { KeyValueStore, Repository } from './repository.js'

export class JsonTable<T extends { id: string }> implements Repository<T> {
  private items: T[] = []
  private filePath: string
  /** 正在进行的 flush Promise；null 表示空闲 */
  private flushing: Promise<void> | null = null
  /** 自上次刷盘完成后是否又有变更 */
  private dirty = false

  constructor(dir: string, name: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.filePath = path.join(dir, `${name}.json`)
    this.load()
  }

  private load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        this.items = JSON.parse(raw) as T[]
      } catch {
        this.items = []
      }
    }
  }

  /**
   * 触发异步刷盘。关键保证：
   *   1. 原子性：先写 .tmp 再 rename（崩溃不会留半成品文件）
   *   2. 串行化：同一时刻只有一个写任务；期间的 upsert 设 dirty=true，
   *      等前一次完成后再刷新；避免 microtask 丢数据漏洞
   *   3. 不丢尾包：flush() 会等到 dirty=false 才返回
   */
  private schedule(): Promise<void> {
    this.dirty = true
    if (this.flushing) return this.flushing
    this.flushing = this._runFlushLoop().finally(() => {
      this.flushing = null
    })
    return this.flushing
  }

  private async _runFlushLoop(): Promise<void> {
    // 循环：每轮把当前快照写盘；如果写盘期间又有变更，再写一轮
    // 最多等价于"合并连续 N 次变更为 O(1) 次实际刷盘"
    while (this.dirty) {
      this.dirty = false
      const snapshot = JSON.stringify(this.items, null, 2)
      const tmp = `${this.filePath}.tmp`
      try {
        await fsp.writeFile(tmp, snapshot, { encoding: 'utf-8', mode: 0o600 })
        await fsp.rename(tmp, this.filePath)
      } catch (err) {
        // 写失败：标记 dirty 并跳出，避免死循环；下次 schedule 触发会再试
        this.dirty = true
        throw err
      }
    }
  }

  all(): T[] {
    return [...this.items]
  }

  find(predicate: (item: T) => boolean): T | undefined {
    return this.items.find(predicate)
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.items.filter(predicate)
  }

  get(id: string): T | undefined {
    return this.items.find((i) => i.id === id)
  }

  async upsert(item: T): Promise<void> {
    const idx = this.items.findIndex((i) => i.id === item.id)
    if (idx >= 0) this.items[idx] = item
    else this.items.push(item)
    await this.schedule()
  }

  async delete(id: string): Promise<boolean> {
    const idx = this.items.findIndex((i) => i.id === id)
    if (idx < 0) return false
    this.items.splice(idx, 1)
    await this.schedule()
    return true
  }

  async clear(): Promise<void> {
    this.items = []
    await this.schedule()
  }

  count(): number {
    return this.items.length
  }

  /** 显式等待所有 pending 写完成（关闭 app 时调用） */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing
    if (this.dirty) return this.schedule()
    return Promise.resolve()
  }
}

/** 单键值表 (e.g. settings) —— 同样原子写 + 串行 flush */
export class JsonKV implements KeyValueStore {
  private filePath: string
  private data: Record<string, unknown>
  private flushing: Promise<void> | null = null
  private dirty = false

  constructor(dir: string, name: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.filePath = path.join(dir, `${name}.json`)
    this.data = this.load()
  }

  private load(): Record<string, unknown> {
    if (!fs.existsSync(this.filePath)) return {}
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
    } catch {
      return {}
    }
  }

  get<T>(key: string): T | undefined {
    return this.data[key] as T | undefined
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data[key] = value
    this.dirty = true
    if (this.flushing) return this.flushing
    this.flushing = this._runFlushLoop().finally(() => {
      this.flushing = null
    })
    return this.flushing
  }

  private async _runFlushLoop(): Promise<void> {
    while (this.dirty) {
      this.dirty = false
      const snapshot = JSON.stringify(this.data, null, 2)
      const tmp = `${this.filePath}.tmp`
      try {
        await fsp.writeFile(tmp, snapshot, { encoding: 'utf-8', mode: 0o600 })
        await fsp.rename(tmp, this.filePath)
      } catch (err) {
        this.dirty = true
        throw err
      }
    }
  }

  all(): Record<string, unknown> {
    return { ...this.data }
  }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing
    if (this.dirty) {
      this.flushing = this._runFlushLoop().finally(() => {
        this.flushing = null
      })
      return this.flushing
    }
    return Promise.resolve()
  }
}
