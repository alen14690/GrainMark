/**
 * IPC 调用参数数量契约测试（2026-04-26 新增 — 防止同类回归）
 *
 * 背景：
 *   上一轮并行编辑时把 Editor.tsx 的 `ipc('preview:render', photoPath, null, override)`
 *   改成了 `ipc('preview:render', photoPath, null)`。preview:render 的 schema 是
 *   `z.tuple([PathSchema, FilterIdSchema.nullable(), FilterPipelineSchema.optional()])`
 *   —— Zod tuple 对 optional 末位的语义是"该位置值可为 undefined，但 tuple 长度必须等于 3"。
 *   传 2 个参数直接报 `Array must contain at least 3 element(s)`，整个编辑页崩溃。
 *
 * 契约：
 *   对于 z.tuple schema，渲染进程所有 ipc(channel, ...) 调用的 args 数量
 *   必须 ≥ tuple 的最小长度（tuple 长度 - 末尾连续 optional 数）。
 *
 * 实现策略：
 *   - 静态扫 src/**\/*.{ts,tsx} 找所有 `ipc('channel:xxx', ...)` 调用
 *   - 解析出 channel 和传递的参数数量
 *   - 对照 ipc-schemas.ts 的 IPC_SCHEMAS 里 tuple 定义，验证长度
 *   - 非 tuple schema 跳过（单参 schema 至少要传 1 个——但这类不是 tuple 的 TS 类型已经管了）
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { IPC_SCHEMAS } from '../../shared/ipc-schemas.ts'

/**
 * 对 z.tuple(items) 计算最小参数数量（items 长度减去末尾连续 optional 个数）。
 *
 * zod tuple 的 optional 末位语义：值位置可 undefined，但 length 必须 = items.length。
 * 但 zod v3 对 tuple 末位连续 optional 允许 length < items.length。
 * 为了**严格**（宁可误报），我们要求 **length === items.length**。
 */
function tupleMinArity(schema: unknown): number | null {
  const def = (schema as { _def?: { typeName?: string; items?: unknown[] } })._def
  if (!def || def.typeName !== 'ZodTuple') return null
  const items = def.items ?? []
  return items.length
}

/** 扫文件里所有 `ipc('xxx:yyy', ...)` 调用，返回 [channel, argCount] */
function parseIpcCalls(src: string): Array<{ channel: string; argCount: number; line: number }> {
  const results: Array<{ channel: string; argCount: number; line: number }> = []
  // 粗正则：匹配 `ipc('channel', args...)` 直到匹配的右括号
  // 限制：不支持跨行嵌套复杂情况。对于本项目的典型单行调用足够精准。
  const re = /\bipc\s*\(\s*['"]([a-z]+:[a-zA-Z][a-zA-Z-:]*)['"]([^)]*)\)/g
  let m = re.exec(src)
  while (m !== null) {
    const channel = m[1]
    const rest = m[2] ?? ''
    // 计算参数数量：
    //   - 空串（只 `ipc('x:y')`）→ 0 个额外参数
    //   - 有内容 → 顶层逗号数 + 1
    const trimmed = rest.trim()
    let argCount = 0
    if (trimmed.startsWith(',')) {
      const afterComma = trimmed.slice(1).trim()
      if (afterComma.length > 0) {
        argCount = countTopLevelCommas(afterComma) + 1
      }
    } else if (trimmed.length > 0) {
      // 理论上 ipc('x', ...) 一定以逗号开头，但防御性
      argCount = countTopLevelCommas(trimmed) + 1
    }
    // 定位行号
    const line = src.slice(0, m.index).split('\n').length
    results.push({ channel: channel ?? '', argCount, line })
    m = re.exec(src)
  }
  return results
}

/** 统计顶层（不在括号/方括号/花括号内）的逗号数 */
function countTopLevelCommas(s: string): number {
  let depth = 0
  let count = 0
  let inString: string | null = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (c === inString && s[i - 1] !== '\\') inString = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = c
      continue
    }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === ',' && depth === 0) count++
  }
  return count
}

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      out.push(...walk(p, exts))
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(p)
    }
  }
  return out
}

describe('IPC 调用参数数量契约', () => {
  it('所有渲染进程 ipc(channel, ...) 调用的参数数量必须 ≥ tuple schema 要求', () => {
    const srcDir = path.resolve(__dirname, '../../src')
    const files = walk(srcDir, ['.ts', '.tsx'])
    const violations: string[] = []

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf-8')
      const calls = parseIpcCalls(src)
      for (const { channel, argCount, line } of calls) {
        // null schema = 无参通道（如 `ai:listModels`）；channel 不在 IPC_SCHEMAS 才是真未知
        if (!(channel in IPC_SCHEMAS)) {
          violations.push(`${path.relative(srcDir, file)}:${line} 未知通道 "${channel}"`)
          continue
        }
        const schema = IPC_SCHEMAS[channel as keyof typeof IPC_SCHEMAS]
        if (schema === null) {
          // 无参通道：argCount 必须为 0
          if (argCount !== 0) {
            violations.push(
              `${path.relative(srcDir, file)}:${line} "${channel}" 传了 ${argCount} 个参数，但是无参通道（schema=null）`,
            )
          }
          continue
        }
        const minArity = tupleMinArity(schema)
        if (minArity === null) continue // 非 tuple schema（单参或 null），TS 类型管
        if (argCount < minArity) {
          violations.push(
            `${path.relative(srcDir, file)}:${line} "${channel}" 传了 ${argCount} 个参数，但 tuple schema 要求 ${minArity} 个（末尾 optional 也要显式传 undefined）`,
          )
        }
      }
    }

    expect(violations, `IPC 调用参数数量不足：\n${violations.join('\n')}`).toEqual([])
  })

  it('parseIpcCalls 自测：简单单参数调用', () => {
    const src = `const r = await ipc('photo:list')`
    expect(parseIpcCalls(src)).toEqual([{ channel: 'photo:list', argCount: 0, line: 1 }])
  })

  it('parseIpcCalls 自测：多参数且含嵌套对象', () => {
    const src = `await ipc('preview:render', photoPath, null, { tone: { exposure: 1 } })`
    expect(parseIpcCalls(src)).toEqual([{ channel: 'preview:render', argCount: 3, line: 1 }])
  })

  it('parseIpcCalls 自测：undefined 显式作为末位参数', () => {
    const src = `ipc('preview:render', p, null, undefined)`
    expect(parseIpcCalls(src)).toEqual([{ channel: 'preview:render', argCount: 3, line: 1 }])
  })

  it('tupleMinArity 对真实 preview:render schema 返回 3', () => {
    const schema = z.tuple([z.string(), z.string().nullable(), z.object({}).optional()])
    expect(tupleMinArity(schema)).toBe(3)
  })

  it('tupleMinArity 对非 tuple 返回 null', () => {
    expect(tupleMinArity(z.string())).toBeNull()
    expect(tupleMinArity(z.array(z.string()))).toBeNull()
  })
})
