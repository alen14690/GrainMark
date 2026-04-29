/**
 * 性能 / 诊断日志 IPC — 渲染进程上报事件，主进程落盘 userData/logs/perf.ndjson
 *
 * ipc-no-path-params  ← 架构守门员识别标记：本文件仅收诊断数据，无路径参数
 *
 * 设计原则：
 *   - **极低开销**：主进程只做 append，不做任何加工
 *   - **独立 sink**：单独的 WriteStream（不过 logger.fileSink），避免和业务日志混淆
 *   - **可观测先行**：诊断性能问题的唯一数据来源
 *   - **不阻塞**：写失败静默忽略（诊断数据丢了不算灾难）
 *
 * 文件格式：ndjson（每行一个 JSON 对象），方便 `tail -f` + `jq` + `grep`
 *
 * 架构：走 safeRegister（Zod schema 已在 ipc-schemas.ts 定义为 PerfLogEventSchema），
 *   安全性与其它 IPC 一致；无路径字段故不需要 PathGuard。
 */
import fs, { type WriteStream } from 'node:fs'
import path from 'node:path'
import type { z } from 'zod'
import type { PerfLogEventSchema } from '../../shared/ipc-schemas.js'
import { logger } from '../services/logger/logger.js'
import { getLogsDir } from '../services/storage/init.js'
import { registerIpc } from './safeRegister.js'

type PerfLogEvent = z.infer<typeof PerfLogEventSchema>

let perfSink: WriteStream | null = null

function ensurePerfSink(): WriteStream | null {
  if (perfSink) return perfSink
  try {
    const filePath = path.join(getLogsDir(), 'perf.ndjson')
    perfSink = fs.createWriteStream(filePath, { flags: 'a' })
    // Q4 修复：磁盘满或写入错误时不 crash，静默降级
    perfSink.on('error', (err) => {
      logger.warn('perf.sink.error', { err: err.message })
      perfSink = null
    })
    const header = JSON.stringify({
      ts: new Date().toISOString(),
      kind: 'marker',
      name: 'perf.sink.initialized',
      pid: process.pid,
    })
    perfSink.write(`${header}\n`)
  } catch {
    perfSink = null
  }
  return perfSink
}

export function registerPerfIpc(): void {
  // safeRegister 已经用 PerfLogEventSchema 做了 Zod 校验；此处直接处理已校验的事件
  registerIpc('perf:log', async (event: unknown) => {
    const ev = event as PerfLogEvent
    const sink = ensurePerfSink()
    if (!sink) return { ok: false, reason: 'sink-unavailable' }
    try {
      const line = JSON.stringify({ ts: new Date().toISOString(), ...ev })
      sink.write(`${line}\n`)
      return { ok: true }
    } catch {
      return { ok: false, reason: 'write-failed' }
    }
  })
}

/** 主进程侧主动写入（例如 preview:render 内部埋点），不走 IPC */
export function writePerfFromMain(event: {
  kind: 'frame' | 'user' | 'marker'
  name: string
  durationMs?: number
  data?: Record<string, string | number | boolean | null>
}): void {
  const sink = ensurePerfSink()
  if (!sink) return
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      tsMs: performance.now(),
      source: 'main',
      ...event,
    })
    sink.write(`${line}\n`)
  } catch {
    /* ignore */
  }
}

/** 关闭 sink（app quit 钩子调用） */
export function shutdownPerfSink(): void {
  if (perfSink) {
    try {
      perfSink.end()
    } catch {
      /* ignore */
    }
    perfSink = null
  }
}
