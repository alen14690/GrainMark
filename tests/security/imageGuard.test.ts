import fs from 'node:fs'
import path from 'node:path'
/**
 * ImageGuard 单元测试
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  IMAGE_LIMITS,
  detectImageType,
  validateImageDimensions,
  validateImageFile,
} from '../../electron/services/security/imageGuard'
import { SecurityError } from '../../electron/services/security/pathGuard'

const FIXTURES = path.resolve('tests/fixtures/images')
const MALICIOUS = path.resolve('tests/fixtures/malicious')

async function expectCode(fn: () => Promise<unknown> | unknown, code: string) {
  try {
    await fn()
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

describe('ImageGuard.detectImageType', () => {
  beforeAll(() => {
    if (!fs.existsSync(path.join(FIXTURES, 'color-checker-24.png'))) {
      throw new Error('Run `npm run fixtures:generate` first')
    }
  })

  it('detects PNG by magic bytes', async () => {
    const ext = await detectImageType(path.join(FIXTURES, 'color-checker-24.png'))
    expect(ext).toBe('png')
  })

  it('detects JPEG by magic bytes', async () => {
    const ext = await detectImageType(path.join(FIXTURES, 'gradient-rgb.jpg'))
    expect(ext).toBe('jpeg')
  })

  it('returns null for fake image (text with .jpg ext)', async () => {
    const ext = await detectImageType(path.join(MALICIOUS, 'fake.jpg'))
    expect(ext).toBeNull()
  })
})

describe('ImageGuard.validateImageFile', () => {
  it('accepts valid PNG', async () => {
    const result = await validateImageFile(path.join(FIXTURES, 'color-checker-24.png'))
    expect(result.ext).toBe('png')
    expect(result.size).toBeGreaterThan(0)
  })

  it('rejects 0-byte file as TOO_SMALL', async () => {
    await expectCode(() => validateImageFile(path.join(MALICIOUS, 'empty.jpg')), 'TOO_SMALL')
  })

  it('rejects fake JPEG (extension spoofing) as UNKNOWN_FORMAT', async () => {
    await expectCode(() => validateImageFile(path.join(MALICIOUS, 'fake.jpg')), 'UNKNOWN_FORMAT')
  })

  it('rejects very short malformed JPEG as TOO_SMALL', async () => {
    await expectCode(() => validateImageFile(path.join(MALICIOUS, 'malformed.jpg')), 'TOO_SMALL')
  })

  it('rejects non-existent file', async () => {
    await expectCode(() => validateImageFile('/nonexistent/image.jpg'), 'NOT_FILE')
  })
})

describe('ImageGuard.validateImageDimensions', () => {
  it('accepts normal dimensions', () => {
    expect(() => validateImageDimensions(1920, 1080)).not.toThrow()
    expect(() => validateImageDimensions(6000, 4000)).not.toThrow()
  })

  it('rejects zero or negative', () => {
    const doIt = () => validateImageDimensions(0, 100)
    expect(doIt).toThrow(SecurityError)
    try {
      doIt()
    } catch (e) {
      expect((e as SecurityError).code).toBe('BAD_DIMENSIONS')
    }
  })

  it('rejects exceeding MAX_WIDTH', () => {
    const doIt = () => validateImageDimensions(IMAGE_LIMITS.MAX_WIDTH + 1, 1000)
    expect(doIt).toThrow(SecurityError)
    try {
      doIt()
    } catch (e) {
      expect((e as SecurityError).code).toBe('DIMENSIONS_EXCEED')
    }
  })

  it('rejects pixel-count bomb (50000x50000)', () => {
    const doIt = () => validateImageDimensions(50_000, 50_000)
    expect(doIt).toThrow(SecurityError)
    // 可能是 DIMENSIONS_EXCEED 或 PIXELS_EXCEED 取决于哪个阈值先触发
    try {
      doIt()
    } catch (e) {
      expect(['DIMENSIONS_EXCEED', 'PIXELS_EXCEED']).toContain((e as SecurityError).code)
    }
  })
})
