/**
 * editStore 单测 — per-channel patch + 脏检测 + 历史栈（M4.2）
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { FilterPreset } from '../../shared/types'
import { HISTORY_LIMIT, canRedo, canUndo, hasDirtyEdits, useEditStore } from '../../src/stores/editStore'

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

describe('editStore · 历史栈（M4.2）', () => {
  it('初始：history/future 都是空数组', () => {
    const s = useEditStore.getState()
    expect(s.history).toEqual([])
    expect(s.future).toEqual([])
    expect(canUndo(s.history)).toBe(false)
    expect(canRedo(s.future)).toBe(false)
  })

  it('commitHistory 推入当前快照', () => {
    const { setTone, commitHistory } = useEditStore.getState()
    setTone({ exposure: 1 })
    commitHistory('曝光调整')
    const s = useEditStore.getState()
    expect(s.history.length).toBe(1)
    expect(s.history[0]!.pipeline?.tone?.exposure).toBe(1)
    expect(s.history[0]!.label).toBe('曝光调整')
    expect(typeof s.history[0]!.timestamp).toBe('number')
  })

  it('commitHistory 幂等去重：相同值不重复入栈', () => {
    const { setTone, commitHistory } = useEditStore.getState()
    setTone({ exposure: 1 })
    commitHistory()
    commitHistory() // 第二次 —— 值未变
    expect(useEditStore.getState().history.length).toBe(1)
  })

  it('commitHistory 深相等判定：深拷贝后值相等也视为同一步', () => {
    const { setTone, commitHistory } = useEditStore.getState()
    setTone({ exposure: 1, contrast: 0 })
    commitHistory()
    // 等价再设一次（合并无变化）
    setTone({ exposure: 1 })
    commitHistory()
    expect(useEditStore.getState().history.length).toBe(1)
  })

  it('commitHistory 新变化清空 future', () => {
    const { setTone, commitHistory, undo } = useEditStore.getState()
    setTone({ exposure: 1 })
    commitHistory()
    setTone({ exposure: 2 })
    commitHistory()
    undo()
    expect(useEditStore.getState().future.length).toBe(1)
    // 新改动 + commit 应清空 future
    useEditStore.getState().setTone({ exposure: 3 })
    useEditStore.getState().commitHistory()
    expect(useEditStore.getState().future.length).toBe(0)
  })

  it('undo：常规情况 — 栈顶 pop 到 future，current 回到新栈顶', () => {
    const { setTone, commitHistory, undo } = useEditStore.getState()
    setTone({ exposure: 1 })
    commitHistory() // history=[{1}], current=1
    setTone({ exposure: 2 })
    commitHistory() // history=[{1}, {2}], current=2
    undo()
    const s = useEditStore.getState()
    expect(s.currentPipeline?.tone?.exposure).toBe(1) // current 回到新栈顶 {1}
    expect(s.future.length).toBe(1)
    expect(s.future[0]!.pipeline?.tone?.exposure).toBe(2)
    expect(s.history.length).toBe(1)
  })

  it('undo：未 commit 场景 — current 领先栈顶时，回到栈顶并把差异存到 future', () => {
    const { setTone, commitHistory, undo } = useEditStore.getState()
    setTone({ exposure: 1 })
    commitHistory() // history=[{1}], current=1
    setTone({ exposure: 2 }) // current=2（未 commit）
    undo()
    const s = useEditStore.getState()
    // current 回到 commit 栈顶 1
    expect(s.currentPipeline?.tone?.exposure).toBe(1)
    // 未 commit 的 2 存入 future 以便 redo
    expect(s.future.length).toBe(1)
    expect(s.future[0]!.pipeline?.tone?.exposure).toBe(2)
    // history 未被 pop（因为 current 未对齐栈顶时是场景 B）
    expect(s.history.length).toBe(1)
  })

  it('redo：future 栈顶推回 history，current 设为它', () => {
    const { setTone, commitHistory, undo, redo } = useEditStore.getState()
    setTone({ exposure: 1 })
    commitHistory() // history=[{1}]
    setTone({ exposure: 2 })
    commitHistory() // history=[{1}, {2}]
    undo() // history=[{1}], future=[{2}], current=1
    redo()
    const s = useEditStore.getState()
    expect(s.currentPipeline?.tone?.exposure).toBe(2)
    expect(s.future.length).toBe(0)
    expect(s.history.length).toBe(2) // {2} 回到 history 栈顶
    expect(s.history[1]!.pipeline?.tone?.exposure).toBe(2)
  })

  it('连续多步 undo/redo 正确', () => {
    const { setTone, commitHistory, undo, redo } = useEditStore.getState()
    setTone({ exposure: 1 })
    commitHistory()
    setTone({ exposure: 2 })
    commitHistory()
    setTone({ exposure: 3 })
    // history=[1, 2], current=3
    undo()
    expect(useEditStore.getState().currentPipeline?.tone?.exposure).toBe(2)
    undo()
    expect(useEditStore.getState().currentPipeline?.tone?.exposure).toBe(1)
    redo()
    expect(useEditStore.getState().currentPipeline?.tone?.exposure).toBe(2)
    redo()
    expect(useEditStore.getState().currentPipeline?.tone?.exposure).toBe(3)
  })

  it('undo 栈空时是 no-op', () => {
    const { undo } = useEditStore.getState()
    undo()
    undo()
    const s = useEditStore.getState()
    expect(s.history).toEqual([])
    expect(s.future).toEqual([])
  })

  it('redo 栈空时是 no-op', () => {
    const { setTone, commitHistory, redo } = useEditStore.getState()
    setTone({ exposure: 1 })
    commitHistory()
    redo()
    const s = useEditStore.getState()
    expect(s.future).toEqual([])
  })

  it('历史栈超过 HISTORY_LIMIT 从栈底切，保留最新', () => {
    const { setTone, commitHistory } = useEditStore.getState()
    const TOTAL = HISTORY_LIMIT + 5
    for (let i = 0; i < TOTAL; i++) {
      setTone({ exposure: i / 100 })
      commitHistory(`step-${i}`)
    }
    const s = useEditStore.getState()
    expect(s.history.length).toBe(HISTORY_LIMIT)
    // 最新应该是 step-(TOTAL-1)
    expect(s.history[HISTORY_LIMIT - 1]!.label).toBe(`step-${TOTAL - 1}`)
    // 最老的：TOTAL - HISTORY_LIMIT 起步
    expect(s.history[0]!.label).toBe(`step-${TOTAL - HISTORY_LIMIT}`)
  })

  it('loadFromPreset 清空历史', () => {
    const { setTone, commitHistory, loadFromPreset } = useEditStore.getState()
    setTone({ exposure: 1 })
    commitHistory()
    const preset: FilterPreset = {
      id: 'p1',
      name: 'Test',
      category: 'custom',
      author: 'me',
      version: '1',
      popularity: 0,
      source: 'builtin',
      pipeline: {},
      createdAt: 0,
      updatedAt: 0,
    }
    loadFromPreset(preset)
    const s = useEditStore.getState()
    expect(s.history).toEqual([])
    expect(s.future).toEqual([])
  })

  it('clear 清空历史', () => {
    const { setTone, commitHistory, clear } = useEditStore.getState()
    setTone({ exposure: 1 })
    commitHistory()
    clear()
    const s = useEditStore.getState()
    expect(s.history).toEqual([])
    expect(s.future).toEqual([])
  })

  it('历史快照独立：修改 current 不影响已入栈的 snapshot', () => {
    const { setTone, commitHistory } = useEditStore.getState()
    setTone({ exposure: 1 })
    commitHistory()
    setTone({ exposure: 5 })
    // 栈里的那个应该还是 1，不应该被拖到 5
    expect(useEditStore.getState().history[0]!.pipeline?.tone?.exposure).toBe(1)
  })

  it('canUndo / canRedo 返回状态', () => {
    expect(canUndo([])).toBe(false)
    expect(canRedo([])).toBe(false)
    const { setTone, commitHistory, undo } = useEditStore.getState()
    setTone({ exposure: 1 })
    commitHistory()
    setTone({ exposure: 2 })
    expect(canUndo(useEditStore.getState().history)).toBe(true)
    undo()
    expect(canRedo(useEditStore.getState().future)).toBe(true)
  })
})
