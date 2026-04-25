/**
 * 安全的 IPC Handler 注册器
 *
 * 功能：
 *   1. 通道白名单 + Zod Schema 运行时校验
 *   2. 统一错误处理（脱敏 + 分类）
 *   3. 入参日志（开发模式）
 *   4. 可选：timing 度量
 */
import { ipcMain } from 'electron'
import type { z } from 'zod'
import { IPC_SCHEMAS, type IpcChannelName } from '../../shared/ipc-schemas.js'
import { logger } from '../services/logger/logger.js'
import { SecurityError } from '../services/security/pathGuard.js'

type Handler = (...args: unknown[]) => unknown | Promise<unknown>

/** 根据通道名拿到 schema 并做参数校验 */
function validate(channel: IpcChannelName, args: unknown[]): unknown[] {
  const schema = IPC_SCHEMAS[channel]
  if (schema === null) {
    // 无参通道
    return []
  }
  // 单参 schema → args[0]
  // tuple schema → args 整体
  const isTuple = (schema as unknown as { _def?: { typeName?: string } })._def?.typeName === 'ZodTuple'
  try {
    if (isTuple) {
      return (schema as z.ZodTuple).parse(args) as unknown[]
    }
    return [(schema as z.ZodTypeAny).parse(args[0])]
  } catch (err) {
    throw new SecurityError(
      `IPC validation failed for "${channel}": ${(err as Error).message}`,
      'IPC_VALIDATION',
    )
  }
}

/** 统一错误序列化（防止把敏感栈抛给渲染进程） */
function serializeError(err: unknown): { name: string; message: string; code?: string } {
  if (err instanceof SecurityError) {
    return { name: err.name, message: err.message, code: err.code }
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message }
  }
  return { name: 'Error', message: String(err) }
}

export function registerIpc(channel: IpcChannelName, handler: Handler): void {
  ipcMain.handle(channel, async (_event, ...rawArgs: unknown[]) => {
    const t0 = Date.now()
    try {
      const safeArgs = validate(channel, rawArgs)
      const result = await handler(...safeArgs)
      const dt = Date.now() - t0
      if (dt > 500) logger.warn('ipc.slow', { channel, durationMs: dt })
      return result
    } catch (err) {
      const info = serializeError(err)
      logger.error('ipc.error', { channel, ...info })
      // 抛回 renderer（electron 自动用 throw/reject 语义）
      throw new Error(`[${channel}] ${info.message}`)
    }
  })
}
