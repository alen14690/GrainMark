/**
 * IPC Schema (Zod) 单元测试
 * 验证每个 schema 对合法/非法输入都正确响应
 */
import { describe, expect, it } from 'vitest'
import {
  BatchJobConfigSchema,
  DialogSelectFilesSchema,
  FilterIdSchema,
  FilterPipelineSchema,
  PhotoImportSchema,
  WatermarkStyleSchema,
} from '../../shared/ipc-schemas'

describe('FilterIdSchema', () => {
  it('accepts alphanumeric id with dots, hyphens', () => {
    expect(() => FilterIdSchema.parse('kodak-portra-400')).not.toThrow()
    expect(() => FilterIdSchema.parse('lut.custom_1')).not.toThrow()
  })
  it('rejects id with special chars', () => {
    expect(() => FilterIdSchema.parse('evil/../id')).toThrow()
    expect(() => FilterIdSchema.parse('id with space')).toThrow()
  })
  it('rejects too long id', () => {
    expect(() => FilterIdSchema.parse('a'.repeat(200))).toThrow()
  })
})

describe('FilterPipelineSchema', () => {
  it('accepts valid pipeline', () => {
    const pipe = {
      whiteBalance: { temp: 10, tint: -5 },
      tone: { exposure: 0.5, contrast: 10, highlights: -20, shadows: 10, whites: 0, blacks: 0 },
      saturation: -10,
    }
    expect(() => FilterPipelineSchema.parse(pipe)).not.toThrow()
  })

  it('rejects out-of-range exposure', () => {
    expect(() =>
      FilterPipelineSchema.parse({
        tone: { exposure: 999, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
      }),
    ).toThrow()
  })

  it('rejects excessive curve points', () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i }))
    expect(() => FilterPipelineSchema.parse({ curves: { rgb: pts } })).toThrow()
  })
})

describe('PhotoImportSchema', () => {
  it('accepts valid paths array', () => {
    expect(() => PhotoImportSchema.parse({ paths: ['/foo/a.jpg', '/bar/b.png'] })).not.toThrow()
  })
  it('rejects empty paths', () => {
    expect(() => PhotoImportSchema.parse({ paths: [] })).toThrow()
  })
  it('rejects too many paths (DoS guard)', () => {
    const paths = Array.from({ length: 20_000 }, () => '/a.jpg')
    expect(() => PhotoImportSchema.parse({ paths })).toThrow()
  })
})

describe('BatchJobConfigSchema', () => {
  it('accepts a reasonable config', () => {
    expect(() =>
      BatchJobConfigSchema.parse({
        filterId: 'kodak-portra-400',
        watermarkTemplateId: null,
        outputDir: '/tmp/out',
        format: 'jpg',
        quality: 92,
        keepExif: true,
        colorSpace: 'srgb',
        namingTemplate: '{name}_{filter}',
        concurrency: 4,
      }),
    ).not.toThrow()
  })
  it('rejects invalid format', () => {
    expect(() =>
      BatchJobConfigSchema.parse({
        filterId: null,
        watermarkTemplateId: null,
        outputDir: '/tmp',
        format: 'bmp',
        quality: 90,
        keepExif: true,
        colorSpace: 'srgb',
        namingTemplate: '{name}',
        concurrency: 4,
      }),
    ).toThrow()
  })
  it('rejects excessive concurrency', () => {
    expect(() =>
      BatchJobConfigSchema.parse({
        filterId: null,
        watermarkTemplateId: null,
        outputDir: '/tmp',
        format: 'jpg',
        quality: 90,
        keepExif: true,
        colorSpace: 'srgb',
        namingTemplate: '{name}',
        concurrency: 1000,
      }),
    ).toThrow()
  })
})

describe('WatermarkStyleSchema', () => {
  it('rejects malformed color', () => {
    expect(() =>
      WatermarkStyleSchema.parse({
        templateId: 'x',
        position: 'bottom-center',
        opacity: 1,
        scale: 1,
        color: 'not-a-color',
        fontFamily: 'Inter',
        showLogo: false,
        fields: {},
        padding: 20,
      }),
    ).toThrow()
  })
})

describe('DialogSelectFilesSchema', () => {
  it('accepts undefined', () => {
    expect(() => DialogSelectFilesSchema.parse(undefined)).not.toThrow()
  })
  it('accepts valid filters', () => {
    expect(() =>
      DialogSelectFilesSchema.parse({
        filters: [{ name: 'Image', extensions: ['jpg', 'png'] }],
        multi: true,
      }),
    ).not.toThrow()
  })
})
