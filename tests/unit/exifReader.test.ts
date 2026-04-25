import path from 'node:path'
/**
 * EXIF 读取单元测试（使用真实 fixture）
 */
import { afterAll, describe, expect, it } from 'vitest'
import { readExif, shutdownExiftool } from '../../electron/services/exif/reader'

const FIXTURES = path.resolve('tests/fixtures/images')

describe('EXIF reader', () => {
  afterAll(async () => {
    await shutdownExiftool()
  })

  it('reads standard EXIF fields', async () => {
    const exif = await readExif(path.join(FIXTURES, 'full-exif.jpg'))
    expect(exif.make).toBe('Leica')
    expect(exif.model).toBe('M11')
    expect(exif.artist).toBe('GrainMark Test')
    expect(exif.iso).toBe(400)
    expect(exif.focalLength).toBe(35)
    expect(exif.fNumber).toBeCloseTo(2.0, 1)
  })

  it('formats shutter speed as fraction when < 1s', async () => {
    const exif = await readExif(path.join(FIXTURES, 'full-exif.jpg'))
    expect(exif.exposureTime).toMatch(/^1\/\d+$/)
  })

  it('reads GPS coordinates', async () => {
    const exif = await readExif(path.join(FIXTURES, 'with-gps.jpg'))
    expect(exif.gpsLatitude).toBeDefined()
    expect(exif.gpsLongitude).toBeDefined()
    expect(exif.gpsLatitude!).toBeGreaterThan(30)
    expect(exif.gpsLatitude!).toBeLessThan(32)
  })

  it('returns empty object on non-existent file', async () => {
    const exif = await readExif('/nonexistent/file.jpg')
    expect(exif).toEqual({})
  })
})
