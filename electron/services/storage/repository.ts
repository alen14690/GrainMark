/**
 * Repository<T> —— 存储层抽象接口（F12 修复）
 *
 * 目的：为"将来从 JsonTable 迁移到 better-sqlite3"让路。
 * 任何业务代码通过该接口访问持久化数据；JsonTable 是目前的实现，
 * 未来用 SqliteTable 替换时，只要实现同一接口，调用方零改动。
 *
 * 设计约束：
 *   - 同步读、异步写：读操作在内存，写操作可能走 I/O（原子写 + 可选 fsync）
 *   - upsert 明确表示"存在则替换，否则插入"
 *   - find/filter 使用 predicate —— 在 SQL 实现里可以用 IndexSpec 特化
 *   - 不暴露底层实现（文件路径 / db 连接）
 */

export interface Repository<T extends { id: string }> {
  /** 返回所有记录的浅拷贝数组 */
  all(): T[]
  /** 按 id 取 */
  get(id: string): T | undefined
  /** 按 predicate 取第一个 */
  find(predicate: (item: T) => boolean): T | undefined
  /** 按 predicate 取多个 */
  filter(predicate: (item: T) => boolean): T[]
  /** upsert：按 id 存在则替换，否则插入。返回刷盘 Promise（可选 await） */
  upsert(item: T): Promise<void>
  /** 按 id 删除。返回 true 表示确实删掉了一条 */
  delete(id: string): Promise<boolean>
  /** 全清（测试 / 用户"清空本地"用） */
  clear(): Promise<void>
  /** 当前记录总数 */
  count(): number
  /** 手动触发刷盘等待 —— 关应用 / 用户登出场景使用 */
  flush(): Promise<void>
}

export interface KeyValueStore {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): Promise<void>
  all(): Record<string, unknown>
  flush(): Promise<void>
}
