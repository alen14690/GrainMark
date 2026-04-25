import fs from 'node:fs'
import path from 'node:path'
/**
 * LUT cubeIO 单元测试（含安全守卫）
 */
import { describe, expect, it } from 'vitest'
import { LUT_LIMITS, parseCubeText, writeCubeText } from '../../electron/services/lut/cubeIO'
import { SecurityError } from '../../electron/services/security/pathGuard'

const LUT_DIR = path.resolve('tests/fixtures/luts')

function expectCode(fn: () => unknown, code: string) {
  try {
    fn()
    throw new Error(`Expected throw with code=${code}`)
  } catch (e) {
    if (!(e instanceof SecurityError)) {
      throw new Error(
        `Expected SecurityError, got ${(e as Error).constructor?.name}: ${(e as Error).message}`,
      )
    }
    expect(e.code).toBe(code)
  }
}

describe('cubeIO.parseCubeText', () => {
  it('parses valid 2×2×2 cube', () => {
    const text = fs.readFileSync(path.join(LUT_DIR, 'valid.cube'), 'utf-8')
    const cube = parseCubeText(text)
    expect(cube.size).toBe(2)
    expect(cube.data.length).toBe(2 * 2 * 2 * 3)
    expect(cube.title).toBeDefined()
  })

  it('rejects LUT with size > MAX_SIZE (code=LUT_BAD_SIZE)', () => {
    const text = fs.readFileSync(path.join(LUT_DIR, 'oversized.cube'), 'utf-8')
    expectCode(() => parseCubeText(text), 'LUT_BAD_SIZE')
  })

  it('rejects LUT missing LUT_3D_SIZE (code=LUT_MISSING_SIZE)', () => {
    const text = fs.readFileSync(path.join(LUT_DIR, 'no-size.cube'), 'utf-8')
    expectCode(() => parseCubeText(text), 'LUT_MISSING_SIZE')
  })

  it('rejects LUT with data size mismatch (code=LUT_DATA_MISMATCH)', () => {
    const text = fs.readFileSync(path.join(LUT_DIR, 'mismatched.cube'), 'utf-8')
    expectCode(() => parseCubeText(text), 'LUT_DATA_MISMATCH')
  })

  it('rejects LUT with too many lines (code=LUT_TOO_MANY_LINES)', () => {
    const lines = ['LUT_3D_SIZE 2']
    for (let i = 0; i < LUT_LIMITS.MAX_LINES + 100; i++) {
      lines.push('0 0 0')
    }
    expectCode(() => parseCubeText(lines.join('\n')), 'LUT_TOO_MANY_LINES')
  })

  it('rejects size below MIN_SIZE (code=LUT_BAD_SIZE)', () => {
    const text = 'LUT_3D_SIZE 1\n0 0 0\n'
    expectCode(() => parseCubeText(text), 'LUT_BAD_SIZE')
  })
})

describe('cubeIO.writeCubeText', () => {
  it('writes valid .cube format and roundtrips', () => {
    const original = {
      size: 2,
      title: 'Test',
      data: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1]),
    }
    const text = writeCubeText(original, 'Test')
    expect(text).toContain('LUT_3D_SIZE 2')
    expect(text).toContain('TITLE "Test"')

    const parsed = parseCubeText(text)
    expect(parsed.size).toBe(2)
    expect(Array.from(parsed.data)).toEqual(Array.from(original.data))
  })
})
