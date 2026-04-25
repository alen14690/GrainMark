/**
 * grainUrl 工具函数测试
 */
import { describe, expect, it } from 'vitest'
import type { Photo } from '../../shared/types'
import { lutSrc, photoSrc, previewSrc, thumbSrc } from '../../src/lib/grainUrl'

const makePhoto = (overrides: Partial<Photo> = {}): Photo => ({
  id: 'p1',
  path: '/tmp/a.jpg',
  name: 'a.jpg',
  format: 'jpg',
  sizeBytes: 0,
  width: 0,
  height: 0,
  thumbPath: '/tmp/thumbs/abc.jpg',
  exif: {},
  starred: false,
  rating: 0,
  tags: [],
  importedAt: 0,
  ...overrides,
})

describe('grainUrl', () => {
  it('thumbSrc uses grain://thumb/ with basename only', () => {
    const p = makePhoto({ thumbPath: '/some/deep/path/abc.jpg' })
    expect(thumbSrc(p)).toBe('grain://thumb/abc.jpg')
  })

  it('thumbSrc encodes special chars', () => {
    const p = makePhoto({ thumbPath: '/x/weird name.jpg' })
    expect(thumbSrc(p)).toBe('grain://thumb/weird%20name.jpg')
  })

  it('thumbSrc returns empty string when no thumb', () => {
    const p = makePhoto({ thumbPath: undefined })
    expect(thumbSrc(p)).toBe('')
  })

  it('photoSrc uses id', () => {
    expect(photoSrc(makePhoto())).toBe('grain://photo/p1')
  })

  it('previewSrc includes version query', () => {
    expect(previewSrc('p1', 5)).toBe('grain://preview/p1?v=5')
    expect(previewSrc('p1')).toBe('grain://preview/p1')
  })

  it('lutSrc encodes filename', () => {
    expect(lutSrc('abc.cube')).toBe('grain://lut/abc.cube')
  })
})
