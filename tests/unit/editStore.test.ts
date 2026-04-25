/**
 * editStore 单测 — per-channel patch + 脏检测
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { FilterPreset } from '../../shared/types'
import { hasDirtyEdits, useEditStore } from '../../src/stores/editStore'

function makePreset(overrides: Partial<FilterPreset> = {}): FilterPreset {
  return {
    id: 'p1',
    name: 'Test Preset',
    category: 'custom',
    author: 'me',
    version: '1.0',
    popularity: 0,
    source: 'builtin',
    pipeline: {
      tone: { exposure: 0.5, contrast: 10, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
      vignette: { amount: -20, midpoint: 50, roundness: 0, feather: 50 },
    },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

beforeEach(() => {
  useEditStore.getState().clear()
})

describe('editStore · loadFromPreset', () => {
  it('从 preset 拷贝到 baselinePipeline + currentPipeline（独立副本）', () => {
    const preset = makePreset()
    useEditStore.getState().loadFromPreset(preset)
    const s = useEditStore.getState()
    expect(s.baselineFilterId).toBe('p1')
    expect(s.baselinePipeline?.tone?.exposure).toBe(0.5)
    expect(s.currentPipeline?.tone?.exposure).toBe(0.5)
    // 深拷贝：改 current 不影响 baseline
    expect(s.currentPipeline).not.toBe(s.baselinePipeline)
    expect(s.currentPipeline?.tone).not.toBe(s.baselinePipeline?.tone)
  })

  it('null preset → baseline/current 都为 null', () => {
    useEditStore.getState().loadFromPreset(null)
    const s = useEditStore.getState()
    expect(s.currentPipeline).toBeNull()
    expect(s.baselinePipeline).toBeNull()
  })
})

describe('editStore · setTone', () => {
  it('从 null 开始 patch → 填充缺省默认 0', () => {
    useEditStore.getState().setTone({ exposure: 1 })
    const t = useEditStore.getState().currentPipeline?.tone
    expect(t?.exposure).toBe(1)
    expect(t?.contrast).toBe(0)
    expect(t?.highlights).toBe(0)
    expect(t?.shadows).toBe(0)
    expect(t?.whites).toBe(0)
    expect(t?.blacks).toBe(0)
  })

  it('后续 patch 只改传入字段，其它保留', () => {
    useEditStore.getState().setTone({ exposure: 1, contrast: 30 })
    useEditStore.getState().setTone({ exposure: 2 })
    const t = useEditStore.getState().currentPipeline?.tone
    expect(t?.exposure).toBe(2)
    expect(t?.contrast).toBe(30) // 未变
  })

  it('patch=null 移除整个 tone 通道', () => {
    useEditStore.getState().setTone({ exposure: 1 })
    expect(useEditStore.getState().currentPipeline?.tone).toBeDefined()
    useEditStore.getState().setTone(null)
    expect(useEditStore.getState().currentPipeline?.tone).toBeUndefined()
  })
})

describe('editStore · setWhiteBalance / setVignette', () => {
  it('setWhiteBalance 合并语义', () => {
    useEditStore.getState().setWhiteBalance({ temp: 10 })
    useEditStore.getState().setWhiteBalance({ tint: -5 })
    const wb = useEditStore.getState().currentPipeline?.whiteBalance
    expect(wb?.temp).toBe(10)
    expect(wb?.tint).toBe(-5)
  })

  it('setVignette 缺省值：midpoint=50, feather=50', () => {
    useEditStore.getState().setVignette({ amount: -30 })
    const v = useEditStore.getState().currentPipeline?.vignette
    expect(v?.amount).toBe(-30)
    expect(v?.midpoint).toBe(50)
    expect(v?.feather).toBe(50)
    expect(v?.roundness).toBe(0)
  })
})

describe('editStore · 标量 setClarity/setSaturation/setVibrance', () => {
  it('直接赋值', () => {
    useEditStore.getState().setClarity(20)
    useEditStore.getState().setSaturation(-15)
    useEditStore.getState().setVibrance(10)
    const p = useEditStore.getState().currentPipeline!
    expect(p.clarity).toBe(20)
    expect(p.saturation).toBe(-15)
    expect(p.vibrance).toBe(10)
  })
})

describe('editStore · setLut', () => {
  it('设置 lut + intensity', () => {
    useEditStore.getState().setLut('fuji.cube', 80)
    const p = useEditStore.getState().currentPipeline!
    expect(p.lut).toBe('fuji.cube')
    expect(p.lutIntensity).toBe(80)
  })
  it('null 清空 lut 但保留原 intensity', () => {
    useEditStore.getState().setLut('fuji.cube', 80)
    useEditStore.getState().setLut(null)
    const p = useEditStore.getState().currentPipeline!
    expect(p.lut).toBeNull()
    expect(p.lutIntensity).toBe(80) // 保留
  })
})

describe('editStore · resetToBaseline', () => {
  it('重置后 current === baseline 的深拷贝', () => {
    const preset = makePreset()
    useEditStore.getState().loadFromPreset(preset)
    useEditStore.getState().setTone({ exposure: 5 })
    expect(useEditStore.getState().currentPipeline?.tone?.exposure).toBe(5)
    useEditStore.getState().resetToBaseline()
    expect(useEditStore.getState().currentPipeline?.tone?.exposure).toBe(0.5)
    // 仍然是独立拷贝
    expect(useEditStore.getState().currentPipeline).not.toBe(useEditStore.getState().baselinePipeline)
  })
})

describe('editStore · clear', () => {
  it('清空所有状态', () => {
    useEditStore.getState().loadFromPreset(makePreset())
    useEditStore.getState().clear()
    const s = useEditStore.getState()
    expect(s.currentPipeline).toBeNull()
    expect(s.baselinePipeline).toBeNull()
    expect(s.baselineFilterId).toBeNull()
  })
})

describe('hasDirtyEdits', () => {
  it('两者都 null → false', () => {
    expect(hasDirtyEdits(null, null)).toBe(false)
  })
  it('current === baseline 引用 → false', () => {
    const p = { tone: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 } }
    expect(hasDirtyEdits(p, p)).toBe(false)
  })
  it('值相同引用不同 → false（深比较）', () => {
    const a = { tone: { exposure: 1, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 } }
    const b = { tone: { exposure: 1, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 } }
    expect(hasDirtyEdits(a, b)).toBe(false)
  })
  it('值不同 → true', () => {
    const a = { tone: { exposure: 1, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 } }
    const b = { tone: { exposure: 2, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 } }
    expect(hasDirtyEdits(a, b)).toBe(true)
  })
  it('一个有通道一个没有 → true', () => {
    expect(hasDirtyEdits({ saturation: 10 }, null)).toBe(true)
    expect(hasDirtyEdits(null, { saturation: 10 })).toBe(true)
  })
})
