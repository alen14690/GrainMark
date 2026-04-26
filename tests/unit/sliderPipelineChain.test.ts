/**
 * sliderPipelineChain.test.ts — UI 滑块 → editStore → pipelineToSteps 的链路完整性
 *
 * 定位（测试金字塔空档）：
 *   - perceptibility.test.ts 覆盖 "shader 输入参数 → 像素变化可感知"
 *   - shaderSnapshots.test.ts 覆盖 "shader 算法稳定性"
 *   - **本文件**覆盖 "UI action → pipelineToSteps 输出" 这条链路
 *     —— 防止 editStore setter 正确、shader 正确、但 is*Identity 误判把非零参数当恒等跳过
 *
 * 覆盖的真实退化模式：
 *   - editStore patch 丢字段（如 setTone({exposure: 1}) 导致 tone.contrast 变 undefined）
 *   - is*Identity 把非零参数当 identity（历史上 isColorGradingIdentity 的 l-only 陷阱）
 *   - 字段名拼写错误导致 uniform 未正确传递
 *   - Lightroom 管线顺序被破坏
 */
import { describe, expect, it } from 'vitest'
import { pipelineToSteps } from '../../src/lib/useWebGLPreview'
import { useEditStore } from '../../src/stores/editStore'

function reset(): void {
  useEditStore.getState().clear()
}

const DEFAULT_BUILD = {
  resolution: [1000, 1000] as [number, number],
  lutTexture: null,
  lutSize: 0,
}

function stepsOf(): ReturnType<typeof pipelineToSteps> {
  return pipelineToSteps(useEditStore.getState().currentPipeline, DEFAULT_BUILD)
}

function stepIds(): string[] {
  return stepsOf().map((s) => s.id)
}

describe('sliderPipelineChain · 每个滑块 action 都产生对应 step（table-driven）', () => {
  // 一条用例覆盖一个 channel 的若干典型滑块，table-driven 降低样板
  const cases: Array<{ group: string; action: () => void; expectedId: string }> = [
    {
      group: 'tone.exposure',
      action: () => useEditStore.getState().setTone({ exposure: 1 }),
      expectedId: 'tone',
    },
    {
      group: 'tone.contrast',
      action: () => useEditStore.getState().setTone({ contrast: 50 }),
      expectedId: 'tone',
    },
    {
      group: 'tone.highlights',
      action: () => useEditStore.getState().setTone({ highlights: 50 }),
      expectedId: 'tone',
    },
    {
      group: 'tone.shadows',
      action: () => useEditStore.getState().setTone({ shadows: 50 }),
      expectedId: 'tone',
    },
    {
      group: 'wb.temp',
      action: () => useEditStore.getState().setWhiteBalance({ temp: 50 }),
      expectedId: 'wb',
    },
    {
      group: 'wb.tint',
      action: () => useEditStore.getState().setWhiteBalance({ tint: -30 }),
      expectedId: 'wb',
    },
    { group: 'clarity', action: () => useEditStore.getState().setClarity(50), expectedId: 'adjustments' },
    {
      group: 'saturation',
      action: () => useEditStore.getState().setSaturation(-100),
      expectedId: 'adjustments',
    },
    { group: 'vibrance', action: () => useEditStore.getState().setVibrance(100), expectedId: 'adjustments' },
    {
      group: 'vignette',
      action: () => useEditStore.getState().setVignette({ amount: -50 }),
      expectedId: 'vignette',
    },
    {
      group: 'hsl.red.h',
      action: () => useEditStore.getState().setHsl({ red: { h: 50, s: 0, l: 0 } }),
      expectedId: 'hsl',
    },
    {
      group: 'hsl.orange.s',
      action: () => useEditStore.getState().setHsl({ orange: { h: 0, s: -80, l: 0 } }),
      expectedId: 'hsl',
    },
  ]
  for (const c of cases) {
    it(`${c.group} 非零 → pipeline 应含 ${c.expectedId} step`, () => {
      reset()
      c.action()
      expect(stepIds()).toContain(c.expectedId)
    })
  }
})

describe('sliderPipelineChain · 恒等短路（全零参数不产生无谓 GPU pass）', () => {
  const cases: Array<{ name: string; action: () => void; notExpectedId: string }> = [
    {
      name: 'WB 全零',
      action: () => useEditStore.getState().setWhiteBalance({ temp: 0, tint: 0 }),
      notExpectedId: 'wb',
    },
    {
      name: 'HSL 全通道全零',
      action: () => useEditStore.getState().setHsl({ red: { h: 0, s: 0, l: 0 } }),
      notExpectedId: 'hsl',
    },
    {
      name: 'Presence 全零',
      action: () => useEditStore.getState().setClarity(0),
      notExpectedId: 'adjustments',
    },
    {
      name: 'Curves y=x 三点（恒等曲线）',
      action: () =>
        useEditStore.getState().setCurves({
          rgb: [
            { x: 0, y: 0 },
            { x: 128, y: 128 },
            { x: 255, y: 255 },
          ],
        }),
      notExpectedId: 'curves',
    },
  ]
  for (const c of cases) {
    it(`${c.name} → pipeline 不含 ${c.notExpectedId} step`, () => {
      reset()
      c.action()
      expect(stepIds()).not.toContain(c.notExpectedId)
    })
  }
})

describe('sliderPipelineChain · 合并语义 + 顺序契约', () => {
  it('setTone 部分字段 patch 不会清掉其他字段（merge 契约）', () => {
    reset()
    useEditStore.getState().setTone({ exposure: 1 })
    useEditStore.getState().setTone({ contrast: 30 })
    const tone = useEditStore.getState().currentPipeline?.tone
    expect(tone?.exposure).toBe(1)
    expect(tone?.contrast).toBe(30)
    expect(tone?.highlights).toBe(0) // 未传的字段不应被清掉
  })

  it('tone 多字段设置后 uniform 值正确归一化（exposure 直传 EV，contrast /100）', () => {
    reset()
    useEditStore.getState().setTone({ exposure: 2, contrast: 100 })
    const tone = stepsOf().find((s) => s.id === 'tone')
    expect(tone).toBeDefined()
    expect(tone?.uniforms?.u_exposure).toBe(2)
    expect(tone?.uniforms?.u_contrast).toBe(1)
  })

  it('curves 有非恒等点 → pipeline 含 curves step', () => {
    reset()
    useEditStore.getState().setCurves({
      rgb: [
        { x: 0, y: 0 },
        { x: 128, y: 180 }, // 中点上抬
        { x: 255, y: 255 },
      ],
    })
    expect(stepIds()).toContain('curves')
  })

  it('Lightroom 管线顺序固定：wb < tone < hsl < adjustments < vignette', () => {
    reset()
    const s = useEditStore.getState()
    s.setTone({ exposure: 0.5 })
    s.setWhiteBalance({ temp: 20 })
    s.setHsl({ red: { h: 10, s: 0, l: 0 } })
    s.setClarity(10)
    s.setVignette({ amount: -20 })
    const ids = stepIds()
    expect(ids.indexOf('wb')).toBeLessThan(ids.indexOf('tone'))
    expect(ids.indexOf('tone')).toBeLessThan(ids.indexOf('hsl'))
    expect(ids.indexOf('hsl')).toBeLessThan(ids.indexOf('adjustments'))
    expect(ids.indexOf('vignette')).toBe(ids.length - 1)
  })

  it('多滑块组合：同时调 Tone/WB/HSL/Saturation → 4 个对应 step 都在', () => {
    reset()
    const s = useEditStore.getState()
    s.setTone({ exposure: 1, contrast: 30 })
    s.setWhiteBalance({ temp: 20 })
    s.setHsl({ red: { h: 10, s: 0, l: 0 } })
    s.setSaturation(20)
    const ids = stepIds()
    for (const id of ['tone', 'wb', 'hsl', 'adjustments']) {
      expect(ids).toContain(id)
    }
  })
})

describe('sliderPipelineChain · 清空契约', () => {
  it('clear() / loadFromPreset(null) 后 steps 应为空', () => {
    useEditStore.getState().setTone({ exposure: 1 })
    expect(stepIds().length).toBeGreaterThan(0)
    useEditStore.getState().clear()
    expect(stepIds().length).toBe(0)

    useEditStore.getState().setTone({ exposure: 1 })
    useEditStore.getState().loadFromPreset(null)
    expect(stepIds().length).toBe(0)
  })
})
