/**
 * 安全的 IPC Handler 注册器（修复 F1：强制 PathGuard 消费）
 *
 * 功能：
 *   1. 通道白名单 + Zod Schema 运行时校验
 *   2. **路径字段强制 PathGuard.validate() 切面**（架构级不可绕过）
 *   3. 统一错误处理（脱敏 + 分类）
 *   4. 可选：timing 度量
 *
 * 路径校验契约：
 *   - 每个涉及路径的 IPC 通道在注册时必须通过 `pathFields` 显式声明路径参数位置
 *   - 位置用 dot-path 表达（针对 tuple/object 参数均适用），例如：
 *       单参 PathSchema            → 'arg'
 *       单参对象 { outputDir: … }  → 'arg.outputDir'
 *       tuple [photoPath, style]   → 'args.0', 'args.1.logoPath'
 *       数组元素                    → 'arg.*'  / 'args.1.*'
 *   - 校验失败直接抛 SecurityError('IPC_PATH_GUARD')，renderer 收到清晰错误
 *   - 对可选字段，值为 undefined/null 时跳过校验（由上层 Zod 负责必填性）
 *
 * 这个模块是 F1 漏洞的系统修复：原来 PathGuard 只在 grain:// 协议生效，
 * 所有 IPC handler 的路径参数可被任意构造；现在强制所有 path 字段都走 validate()。
 */
import { ipcMain } from 'electron'
import type { z } from 'zod'
import { ZodTuple } from 'zod'
import { IPC_SCHEMAS, type IpcChannelName } from '../../shared/ipc-schemas.js'
import { logger } from '../services/logger/logger.js'
import type { PathGuard } from '../services/security/pathGuard.js'
import { SecurityError } from '../services/security/pathGuard.js'

type Handler = (...args: unknown[]) => unknown | Promise<unknown>

/** 由 main.ts 在 app.whenReady 里注入 —— 避免循环依赖 */
let pathGuardRef: PathGuard | null = null

export function setIpcPathGuard(guard: PathGuard): void {
  pathGuardRef = guard
}

/** 测试用：重置注入状态 */
export function _resetIpcPathGuardForTest(): void {
  pathGuardRef = null
}

/** 根据通道名拿到 schema 并做参数校验 */
function validate(channel: IpcChannelName, args: unknown[]): unknown[] {
  const schema = IPC_SCHEMAS[channel]
  if (schema === null) {
    // 无参通道
    return []
  }
  // 单参 schema → args[0]
  // tuple schema → args 整体
  // A4 修复：用 instanceof 替代 _def.typeName 内部字段，避免 Zod 升级 silent break
  const isTuple = schema instanceof ZodTuple
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

/**
 * 路径字段定位：
 *   - 'arg'               → 单参数本身
 *   - 'arg.<k>'           → 单参数的 k 字段
 *   - 'arg.*'             → 单参数的数组元素
 *   - 'args.<i>'          → tuple 的第 i 个
 *   - 'args.<i>.<k>'      → tuple 的第 i 个的 k 字段
 *   - 'args.<i>.*'        → tuple 的第 i 个（数组）的元素
 *
 * 对 optional / nullable 字段，值为 undefined/null 跳过（由 Zod 承担必填性）。
 */
type PathFieldSpec = string

/** 把 dot-path 解析成一组具体字符串引用，支持 '*' 数组展开 */
function resolvePathValues(args: unknown[], spec: PathFieldSpec): string[] {
  // 解析 tokens
  const parts = spec.split('.')
  // 起点：arg（args[0]）或 args（整体）
  let cursors: unknown[]
  const head = parts[0]
  if (head === 'arg') {
    cursors = [args[0]]
  } else if (head === 'args') {
    cursors = [args]
  } else {
    throw new SecurityError(`Invalid pathField spec: ${spec}`, 'BAD_PATH_SPEC')
  }

  for (let i = 1; i < parts.length; i++) {
    const tok = parts[i]!
    const next: unknown[] = []
    for (const cur of cursors) {
      if (cur === undefined || cur === null) continue
      if (tok === '*') {
        if (Array.isArray(cur)) next.push(...cur)
        else throw new SecurityError(`pathField ${spec}: '*' on non-array`, 'BAD_PATH_SPEC')
      } else if (/^\d+$/.test(tok)) {
        const idx = Number(tok)
        if (Array.isArray(cur)) next.push(cur[idx])
        else throw new SecurityError(`pathField ${spec}: index on non-array`, 'BAD_PATH_SPEC')
      } else {
        if (typeof cur === 'object') {
          next.push((cur as Record<string, unknown>)[tok])
        }
      }
    }
    cursors = next
  }

  const strs: string[] = []
  for (const v of cursors) {
    if (v === undefined || v === null) continue
    if (typeof v === 'string') strs.push(v)
    else throw new SecurityError(`pathField ${spec}: not a string (got ${typeof v})`, 'BAD_PATH_SPEC')
  }
  return strs
}

export interface RegisterIpcOptions {
  /**
   * 路径字段声明（F1 强制）。若本 channel 接收路径参数，必须列出全部位置。
   * 不传 = 该 channel 声明"无路径参数"。若后续 Zod 的 schema 中发现有 PathSchema
   * 但此处没列出，属于安全隐患 —— 但 runtime 不能反推，必须开发者自律（+ lint 规则）。
   */
  pathFields?: readonly PathFieldSpec[]
}

/**
 * 注册一个 IPC handler，自动跑：
 *   1. Zod schema 校验
 *   2. pathFields 里声明的字段过 PathGuard.validate()
 *   3. 错误脱敏转发给 renderer
 */
export function registerIpc(
  channel: IpcChannelName,
  handler: Handler,
  options: RegisterIpcOptions = {},
): void {
  const { pathFields = [] } = options

  ipcMain.handle(channel, async (_event, ...rawArgs: unknown[]) => {
    const t0 = Date.now()
    try {
      const safeArgs = validate(channel, rawArgs)

      // F1：路径字段强制 PathGuard
      if (pathFields.length > 0) {
        if (!pathGuardRef) {
          throw new SecurityError('PathGuard not initialized', 'NO_PATH_GUARD')
        }
        for (const spec of pathFields) {
          const values = resolvePathValues(safeArgs, spec)
          for (const v of values) {
            try {
              await pathGuardRef.validate(v)
            } catch (err) {
              throw new SecurityError(
                `Path rejected by guard on "${channel}" field=${spec}: ${(err as Error).message}`,
                'IPC_PATH_GUARD',
              )
            }
          }
        }
      }

      const result = await handler(...safeArgs)
      const dt = Date.now() - t0
      // P0 可观测性（2026-04-26）：所有 IPC 调用耗时都落盘（不只是 > 500ms）
      //   这样用户操作卡顿时我能直接 grep userData/logs/main.ndjson 看哪个慢
      //   debug 级不污染控制台，但 fileSink 会写到磁盘供事后分析
      if (dt > 500) {
        logger.warn('ipc.slow', { channel, durationMs: dt })
      } else {
        logger.debug('ipc.call', { channel, durationMs: dt })
      }
      return result
    } catch (err) {
      const info = serializeError(err)
      logger.error('ipc.error', { channel, ...info })
      // 抛回 renderer（electron 自动用 throw/reject 语义）
      throw new Error(`[${channel}] ${info.message}`)
    }
  })
}
