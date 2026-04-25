/**
 * 统一日志器 — 带自动脱敏
 *
 * 特性：
 *   - 敏感字段（token/apiKey/password/credential/authorization）自动 REDACT
 *   - 文件路径自动 ~ 化（替换 home 前缀）
 *   - 生产模式仅输出 WARN 以上
 *   - 不落盘（P1 仅 console；M10 可接入 rotating file）
 */
import os from 'node:os'

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

  setLevel(l: Level): void {
    this.minLevel = l
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
