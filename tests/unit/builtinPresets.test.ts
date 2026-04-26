/**
 * 内置滤镜 preset · Schema 校验（唯一真防线）
 *
 * 其他"数量 ≥ 30 / source=builtin / popularity 在范围"属于 TS 类型或数据录入约定，
 * Schema parse 一次性覆盖了全部字段校验 —— 不重复测。
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_PRESETS } from '../../electron/assets/presets/index'
import { FilterPresetSchema } from '../../shared/ipc-schemas'

describe('builtin presets · Schema 校验', () => {
  it('所有内置 preset 都通过 FilterPresetSchema.safeParse（杜绝脏数据）', () => {
    const errors: string[] = []
    for (const preset of BUILTIN_PRESETS) {
      const result = FilterPresetSchema.safeParse(preset)
      if (!result.success) {
        errors.push(`"${preset.id}": ${result.error.message}`)
      }
    }
    if (errors.length > 0) {
      throw new Error(`${errors.length} invalid preset(s):\n${errors.join('\n')}`)
    }
  })

  it('所有 id 唯一（重复 id 会导致 filterStore 覆盖）', () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
