/**
 * preloadChannelWhitelist.test.ts — 防止 preload 白名单和 IPC schema 脱节
 *
 * 背景：2026-04-26 新增 `perf:log` IPC 时，忘了同步更新 preload.ts 的
 *   CHANNEL_PATTERN，导致 renderer 调用被 preload 一级拒绝、数据永远写不到磁盘。
 *   这属于"改了 A 没同步 B"的典型多任务并行冲突。
 *
 * 契约：shared/ipc-schemas.ts 里注册的每个通道，其前缀都必须在
 *   electron/preload.ts 的 CHANNEL_PATTERN 白名单里。
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('preload CHANNEL_PATTERN 契约', () => {
  it('ipc-schemas.ts 里所有通道前缀都必须在 preload 白名单里', () => {
    const repoRoot = path.resolve(__dirname, '../..')
    const schemaSrc = fs.readFileSync(path.join(repoRoot, 'shared/ipc-schemas.ts'), 'utf-8')
    const preloadSrc = fs.readFileSync(path.join(repoRoot, 'electron/preload.ts'), 'utf-8')

    // 从 schema 里扒出所有 'prefix:action' 字符串常量（IPC_SCHEMAS 对象的 key）
    const channels = Array.from(schemaSrc.matchAll(/^\s*'([a-z]+):[a-zA-Z][a-zA-Z-]*'/gm)).map((m) => m[1]!)

    const prefixes = new Set(channels)
    expect(prefixes.size, '至少应该枚举到 10 个通道').toBeGreaterThan(10)

    // 从 preload 白名单正则里提取竖线分隔的 group
    const patternMatch = preloadSrc.match(/CHANNEL_PATTERN\s*=\s*\/\^\(([a-z|]+)\)/)
    expect(patternMatch, 'preload.ts 里应该有 CHANNEL_PATTERN 正则').toBeTruthy()
    const whitelisted = new Set(patternMatch![1]!.split('|'))

    const missing: string[] = []
    for (const prefix of prefixes) {
      if (!whitelisted.has(prefix)) missing.push(prefix)
    }
    expect(missing, `以下通道前缀在 ipc-schemas 注册了但 preload 白名单缺失：${missing.join(', ')}`).toEqual(
      [],
    )
  })
})
