/**
 * 内置滤镜 preset 结构完整性测试
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_PRESETS } from '../../electron/assets/presets/index'
import { FilterPresetSchema } from '../../shared/ipc-schemas'

describe('Builtin filter presets', () => {
  it('has 30 presets', () => {
    expect(BUILTIN_PRESETS.length).toBeGreaterThanOrEqual(30)
  })

  it('每款 preset 都通过 Schema 校验', () => {
    for (const preset of BUILTIN_PRESETS) {
      const result = FilterPresetSchema.safeParse(preset)
      if (!result.success) {
        throw new Error(`Preset "${preset.id}" invalid: ${result.error.message}`)
      }
    }
  })

  it('所有 id 唯一', () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('所有 source 为 builtin', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(p.source).toBe('builtin')
    }
  })

  it('popularity 在 0..100 范围', () => {
    for (const p of BUILTIN_PRESETS) {
      expect(p.popularity).toBeGreaterThanOrEqual(0)
      expect(p.popularity).toBeLessThanOrEqual(100)
    }
  })
})
