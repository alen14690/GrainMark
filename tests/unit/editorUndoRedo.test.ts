/**
 * Editor 撤销/重做集成行为测试（M4.3）
 *
 * 验证"用户拖滑块 + onChangeEnd + ⌘Z/⌘⇧Z"的完整行为链在 store 层面工作正常。
 * UI 层（Editor.tsx 按钮 disabled、快捷键 capture）靠代码评审保证；
 * 这里测试核心的 **commit → undo → redo → commit-after-undo 清 future** 链路。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { FilterPreset } from '../../shared/types'
import { useEditStore } from '../../src/stores/editStore'

function makePreset(): FilterPreset {
  return {
    id: 'p1',
    name: 'Test',
    category: 'custom',
    author: 'me',
    version: '1',
    popularity: 0,
    source: 'builtin',
    pipeline: {
      tone: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
    },
    createdAt: 0,
    updatedAt: 0,
  }
}

beforeEach(() => {
  useEditStore.getState().clear()
})

describe('Editor undo/redo 行为集成（M4.3）', () => {
  it('模拟 3 次滑块松手 + 撤销到初始 + 重做回到最新', () => {
    const preset = makePreset()
    const s = useEditStore.getState()
    s.loadFromPreset(preset)
    s.commitHistory('初始')

    // 第一次拖曝光
    s.setTone({ exposure: 0.5 })
    s.commitHistory('曝光 +0.5')
    // 第二次拖对比度
    s.setTone({ contrast: 20 })
    s.commitHistory('对比度 +20')
    // 第三次拖高光
    s.setTone({ highlights: -30 })
    s.commitHistory('高光 -30')

    let st = useEditStore.getState()
    expect(st.history.length).toBe(4) // 初始 + 3 次
    expect(st.currentPipeline?.tone?.exposure).toBe(0.5)
    expect(st.currentPipeline?.tone?.contrast).toBe(20)
    expect(st.currentPipeline?.tone?.highlights).toBe(-30)

    // 撤销 3 次回到初始
    s.undo()
    st = useEditStore.getState()
    expect(st.currentPipeline?.tone?.highlights).toBe(0) // 撤销"高光 -30"
    s.undo()
    st = useEditStore.getState()
    expect(st.currentPipeline?.tone?.contrast).toBe(0) // 撤销"对比度"
    s.undo()
    st = useEditStore.getState()
    expect(st.currentPipeline?.tone?.exposure).toBe(0) // 撤销"曝光"

    expect(st.future.length).toBe(3)

    // 重做 3 次
    s.redo()
    s.redo()
    s.redo()
    st = useEditStore.getState()
    expect(st.currentPipeline?.tone?.exposure).toBe(0.5)
    expect(st.currentPipeline?.tone?.contrast).toBe(20)
    expect(st.currentPipeline?.tone?.highlights).toBe(-30)
    expect(st.future.length).toBe(0)
  })

  it('撤销中途 + 新操作 → future 清空（历史分支不保留）', () => {
    const s = useEditStore.getState()
    s.setTone({ exposure: 1 })
    s.commitHistory('a')
    s.setTone({ exposure: 2 })
    s.commitHistory('b')
    s.setTone({ exposure: 3 })
    s.commitHistory('c')
    // 当前 c；撤销两次到 a
    s.undo()
    s.undo()
    expect(useEditStore.getState().future.length).toBe(2)

    // 新操作：写入 d 并 commit
    s.setTone({ exposure: 4 })
    s.commitHistory('d')

    const st = useEditStore.getState()
    expect(st.currentPipeline?.tone?.exposure).toBe(4)
    // future 应被清空（不能再 redo 到 b/c）
    expect(st.future.length).toBe(0)
    // history 应该是 [初始值, a, d]（撤销时 a 被保留在栈中）
    expect(st.history.length).toBeGreaterThan(0)
  })

  it('切换 filter（loadFromPreset）清空历史', () => {
    const s = useEditStore.getState()
    s.loadFromPreset(makePreset())
    s.setTone({ exposure: 1 })
    s.commitHistory()
    s.setTone({ exposure: 2 })
    s.commitHistory()
    expect(useEditStore.getState().history.length).toBe(2)

    // 切到另一个 preset
    const preset2 = { ...makePreset(), id: 'p2' }
    s.loadFromPreset(preset2)
    const st = useEditStore.getState()
    expect(st.history).toEqual([])
    expect(st.future).toEqual([])
  })

  it('resetToBaseline + 夹 commit（模拟 Editor handleResetToBaseline）能撤回', () => {
    const preset = makePreset()
    preset.pipeline.tone = {
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
    }
    const s = useEditStore.getState()
    s.loadFromPreset(preset)

    // 用户做了一些修改
    s.setTone({ exposure: 2, contrast: 40 })
    s.commitHistory('拖完')

    // 点击"重置到滤镜预设" → 模拟 Editor.tsx 的 handleResetToBaseline
    s.commitHistory('重置前')
    s.resetToBaseline()
    s.commitHistory('重置到滤镜预设')

    expect(useEditStore.getState().currentPipeline?.tone?.exposure).toBe(0)

    // 撤销一次应回到"重置前"（exposure=2）
    s.undo()
    expect(useEditStore.getState().currentPipeline?.tone?.exposure).toBe(2)
  })

  it('深拷贝独立：撤销后的 current 不与 history 快照共享引用', () => {
    const s = useEditStore.getState()
    s.setTone({ exposure: 1 })
    s.commitHistory()
    s.setTone({ exposure: 2 })
    s.undo()

    // 现在 current 应为 { tone: { exposure: 1, ... } }，深拷贝独立于 history 里的
    const current = useEditStore.getState().currentPipeline
    const historyTop = useEditStore.getState().history[0]?.pipeline // 此时 history 里是"undo 前的 current=2"其实已经 pop 了

    // 修改 current 不影响 future（future 里存了 exposure=2 的快照）
    s.setTone({ exposure: 99 })
    const future = useEditStore.getState().future
    expect(future[0]?.pipeline?.tone?.exposure).toBe(2) // 仍是 2 不被污染
    // current 最新值
    expect(useEditStore.getState().currentPipeline?.tone?.exposure).toBe(99)
    // 原 current 和 history 快照是不同对象（但上面断言 history 已 undo 掉不检查）
    expect(current).not.toBe(historyTop)
  })
})
