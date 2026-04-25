import os from 'node:os'
/**
 * Logger 脱敏单元测试
 */
import { describe, expect, it } from 'vitest'
import { __test_sanitize } from '../../electron/services/logger/logger'

describe('Logger.sanitize', () => {
  it('REDACTs sensitive keys (case-insensitive)', () => {
    const out = __test_sanitize({
      token: 'secret123',
      apiKey: 'abc',
      password: 'pass',
      refreshToken: 'rt',
      Authorization: 'Bearer xxx',
      normal: 'visible',
    }) as Record<string, unknown>
    expect(out.token).toBe('[REDACTED]')
    expect(out.apiKey).toBe('[REDACTED]')
    expect(out.password).toBe('[REDACTED]')
    expect(out.refreshToken).toBe('[REDACTED]')
    expect(out.Authorization).toBe('[REDACTED]')
    expect(out.normal).toBe('visible')
  })

  it('tildifies home directory in path strings', () => {
    const home = os.homedir()
    const out = __test_sanitize(`${home}/Pictures/foo.jpg`)
    expect(out).toBe('~/Pictures/foo.jpg')
  })

  it('sanitizes nested objects', () => {
    const out = __test_sanitize({
      user: { name: 'alice', token: 't0' },
      list: [{ password: 'p' }, { ok: 1 }],
    }) as Record<string, unknown>
    const user = out.user as Record<string, unknown>
    expect(user.name).toBe('alice')
    expect(user.token).toBe('[REDACTED]')
    const list = out.list as Record<string, unknown>[]
    expect(list[0]!.password).toBe('[REDACTED]')
    expect(list[1]!.ok).toBe(1)
  })

  it('handles cycles via depth cap', () => {
    const a: Record<string, unknown> = { name: 'A' }
    a.self = a
    const out = __test_sanitize(a)
    // 不应该死循环
    expect(out).toBeDefined()
  })

  it('handles Error instances', () => {
    const err = new Error('some failure')
    const out = __test_sanitize(err) as { name: string; message: string }
    expect(out.name).toBe('Error')
    expect(out.message).toBe('some failure')
  })

  it('preserves primitives', () => {
    expect(__test_sanitize(42)).toBe(42)
    expect(__test_sanitize(true)).toBe(true)
    expect(__test_sanitize(null)).toBe(null)
    expect(__test_sanitize(undefined)).toBe(undefined)
  })
})
