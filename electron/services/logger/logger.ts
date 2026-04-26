/**
 * 统一日志器 — 带自动脱敏 + 磁盘沉淀
 *
 * 特性：
 *   - 敏感字段（token/apiKey/password/credential/authorization）自动 REDACT
 *   - 文件路径自动 ~ 化（替换 home 前缀）
 *   - 生产模式仅输出 WARN 以上
 *   - **ndjson 磁盘沉淀**（2026-04-26 起）：同时写到 userData/logs/main.ndjson，
 *     方便事后分析性能问题、排查错误；调用方无需主动 flush
 *   - 文件沉淀是**懒初始化**的：只有在 initFileSink() 被调用后才开始写入，
 *     避免模块初始化顺序与 Electron app.getPath 依赖冲突
 */
import fs, { type WriteStream } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const SENSITIVE_KEYS = [
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'api_key',
  'password',
  'secret',
  'credential',
  'credentials',
  'authorization',
  'cookie',
  'set-cookie',
]

const HOME_DIR = os.homedir()

function redactString(s: string): string {
  // 路径 ~ 化
  if (HOME_DIR && s.startsWith(HOME_DIR)) {
    return `~${s.slice(HOME_DIR.length)}`
  }
  return s
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[MaxDepth]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) }
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, depth + 1))
  }
  if (typeof value === 'object') {
    const obj: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
        obj[k] = '[REDACTED]'
      } else {
        obj[k] = sanitize(v, depth + 1)
      }
    }
    return obj
  }
  return String(value)
}

class Logger {
  private minLevel: Level = process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
  /** 懒初始化的 file sink；未初始化时为 null（仅 console） */
  private fileSink: WriteStream | null = null
  /** 当前日志文件路径，便于 flush 后读取 */
  private logFilePath: string | null = null

  setLevel(l: Level): void {
    this.minLevel = l
  }

  /**
   * 初始化磁盘沉淀（在 Electron app ready 后调用一次）。
   * 重复调用会关闭旧 stream 再开新的。
   *
   * @param logsDir 日志目录；调用方保证目录存在
   * @param filename 基础名，默认 main.ndjson
   */
  initFileSink(logsDir: string, filename = 'main.ndjson'): void {
    try {
      if (this.fileSink) {
        try {
          this.fileSink.end()
        } catch {
          /* ignore */
        }
      }
      const filePath = path.join(logsDir, filename)
      // append 模式；每行一个 JSON，便于 `tail -f` + `jq`
      this.fileSink = fs.createWriteStream(filePath, { flags: 'a' })
      this.logFilePath = filePath
      // 启动标记 + 版本（便于多次启动区分）
      const header = JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        msg: 'logger.fileSink.initialized',
        pid: process.pid,
      })
      this.fileSink.write(`${header}\n`)
    } catch (err) {
      // 文件写不了就回退到 console only；不影响主流程
      console.error('[logger] initFileSink failed', err)
    }
  }

  getLogFilePath(): string | null {
    return this.logFilePath
  }

  private emit(level: Level, message: string, data?: unknown): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return
    const ts = new Date().toISOString()
    const safe = data !== undefined ? sanitize(data) : undefined
    const line = `[${ts}] [${level.toUpperCase()}] ${message}`
    if (level === 'error') {
      if (safe !== undefined) console.error(line, safe)
      else console.error(line)
    } else if (level === 'warn') {
      if (safe !== undefined) console.warn(line, safe)
      else console.warn(line)
    } else {
      if (safe !== undefined) console.log(line, safe)
      else console.log(line)
    }
    // 同步写磁盘（append 模式；Node WriteStream 内部有 buffer 不会每次 fsync）
    if (this.fileSink) {
      try {
        const json = JSON.stringify({ ts, level, msg: message, data: safe })
        this.fileSink.write(`${json}\n`)
      } catch {
        /* 写失败就认命，不影响 app */
      }
    }
  }

  debug(message: string, data?: unknown): void {
    this.emit('debug', message, data)
  }
  info(message: string, data?: unknown): void {
    this.emit('info', message, data)
  }
  warn(message: string, data?: unknown): void {
    this.emit('warn', message, data)
  }
  error(message: string, data?: unknown): void {
    this.emit('error', message, data)
  }
}

export const logger = new Logger()

// 导出脱敏函数供测试
export const __test_sanitize = sanitize
