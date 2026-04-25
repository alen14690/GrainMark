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
  it('thumbSrc uses grain://thumb/ with basename only + cache-bust version', () => {
    const p = makePhoto({ thumbPath: '/some/deep/path/abc.jpg' })
    expect(thumbSrc(p)).toBe('grain://thumb/abc.jpg?v=0')
  })

  it('thumbSrc encodes special chars', () => {
    const p = makePhoto({ thumbPath: '/x/weird name.jpg' })
    expect(thumbSrc(p)).toBe('grain://thumb/weird%20name.jpg?v=0')
  })

  it('thumbSrc propagates dimsVerified version（数值 / boolean 两种格式）', () => {
    const p1 = makePhoto({ thumbPath: '/x/t.jpg', dimsVerified: 2 })
    expect(thumbSrc(p1)).toBe('grain://thumb/t.jpg?v=2')
    const p2 = makePhoto({ thumbPath: '/x/t.jpg', dimsVerified: true })
    expect(thumbSrc(p2)).toBe('grain://thumb/t.jpg?v=1')
    const p3 = makePhoto({ thumbPath: '/x/t.jpg', dimsVerified: undefined })
    expect(thumbSrc(p3)).toBe('grain://thumb/t.jpg?v=0')
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
