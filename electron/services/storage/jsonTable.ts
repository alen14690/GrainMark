/**
 * 轻量级 JSON 表存储（M1 使用）
 * - 每张"表"对应一个 JSON 文件
 * - 同步读写，带写入队列避免并发竞争
 * - 未来数据量大时可无缝切换到 better-sqlite3（API 保持接近）
 */
import fs from 'node:fs'
import path from 'node:path'

export class JsonTable<T extends { id: string }> {
  private items: T[] = []
  private filePath: string
  private writing = false
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

  private scheduleFlush() {
    this.dirty = true
    if (this.writing) return
    this.writing = true
    queueMicrotask(() => {
      try {
        if (this.dirty) {
          fs.writeFileSync(this.filePath, JSON.stringify(this.items, null, 2), 'utf-8')
          this.dirty = false
        }
      } finally {
        this.writing = false
      }
    })
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

  upsert(item: T): void {
    const idx = this.items.findIndex((i) => i.id === item.id)
    if (idx >= 0) this.items[idx] = item
    else this.items.push(item)
    this.scheduleFlush()
  }

  delete(id: string): boolean {
    const idx = this.items.findIndex((i) => i.id === id)
    if (idx < 0) return false
    this.items.splice(idx, 1)
    this.scheduleFlush()
    return true
  }

  clear(): void {
    this.items = []
    this.scheduleFlush()
  }

  count(): number {
    return this.items.length
  }
}

/** 单键值表 (e.g. settings) */
export class JsonKV {
  private filePath: string
  private data: Record<string, unknown>

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

  set<T>(key: string, value: T): void {
    this.data[key] = value
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  all(): Record<string, unknown> {
    return { ...this.data }
  }
}
