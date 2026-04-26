/**
 * sliderPipelineChain.test.ts — UI 滑块 → editStore → pipelineToSteps 的链路完整性
 *
 * 定位：
 *   perceptibility.test.ts 覆盖了 "shader 输入参数 → 像素变化可感知"；
 *   shaderSnapshots.test.ts 覆盖了 "shader 算法稳定性"；
 *   **但没有测试回答**："用户在 UI 上拖滑块后，pipeline 会不会真的生成对应的 step？"
 *
 *   这是用户报的"滑块不生效"的潜在失败路径之一：UI 写了 store，store 正确存储，
 *   但 pipelineToSteps 的 isXxxIdentity 判断可能错误地把非零参数视为 identity 跳过。
 *
 * 机制：
 *   每个滑块定义一条"链路测试"：
 *     1. 从空 currentPipeline 开始
 *     2. 调用对应 editStore action（setTone / setWB / ...）模拟 UI
 *     3. 调用 pipelineToSteps 得到最终 step 列表
 *     4. 断言对应 id 的 step 存在（即 shader pass 不被 identity 跳过）
 *     5. 关键 uniform 值正确归一化（随抽样断言）
 *
 * 覆盖的退化模式：
 *   - editStore patch 丢字段（如 setTone({exposure: 1}) 结果 tone.contrast 变成 undefined 导致 pipelineToSteps 异常）
 *   - isXxxIdentity 把非零参数当 identity（如原 isColorGradingIdentity 的 l-only 陷阱）
 *   - 字段名拼写错误导致 uniform 未正确传递
 */
import { describe, expect, it } from 'vitest'
import { pipelineToSteps } from '../../src/lib/useWebGLPreview'
import { useEditStore } from '../../src/stores/editStore'

// 把 store 重置到"原图" 状态
function reset(): void {
  useEditStore.getState().clear()
}

const DEFAULT_BUILD = {
  resolution: [1000, 1000] as [number, number],
  lutTexture: null,
  lutSize: 0,
}

function stepsOf(): ReturnType<typeof pipelineToSteps> {
  const pipe = useEditStore.getState().currentPipeline
  return pipelineToSteps(pipe, DEFAULT_BUILD)
}

function stepIds(): string[] {
  return stepsOf().map((s) => s.id)
}

describe('sliderPipelineChain · Tone 滑块每个 setter 都产生 tone step', () => {
  const tests: Array<{ name: string; action: () => void }> = [
    { name: '曝光', action: () => useEditStore.getState().setTone({ exposure: 1 }) },
    { name: '对比度', action: () => useEditStore.getState().setTone({ contrast: 50 }) },
    { name: '高光', action: () => useEditStore.getState().setTone({ highlights: 50 }) },
    { name: '阴影', action: () => useEditStore.getState().setTone({ shadows: 50 }) },
    { name: '白色', action: () => useEditStore.getState().setTone({ whites: 50 }) },
    { name: '黑色', action: () => useEditStore.getState().setTone({ blacks: -50 }) },
  ]
  for (const t of tests) {
    it(`${t.name} → pipeline 应含 tone step`, () => {
      reset()
      t.action()
      expect(stepIds()).toContain('tone')
    })
  }

  it('tone 多字段设置后 uniform 值正确归一化到 shader 范围', () => {
    reset()
    useEditStore.getState().setTone({ exposure: 2, contrast: 100 })
    const tone = stepsOf().find((s) => s.id === 'tone')
    expect(tone).toBeDefined()
    // exposure 直接 EV，contrast /100
    expect(tone?.uniforms?.u_exposure).toBe(2)
    expect(tone?.uniforms?.u_contrast).toBe(1)
  })

  it('setTone 部分字段不会把其他字段弄没（merge 行为契约）', () => {
    reset()
    useEditStore.getState().setTone({ exposure: 1 })
    useEditStore.getState().setTone({ contrast: 30 })
    const tone = useEditStore.getState().currentPipeline?.tone
    expect(tone?.exposure).toBe(1)
    expect(tone?.contrast).toBe(30)
    // 未传的字段不应被清掉
    expect(tone?.highlights).toBe(0)
  })
})

describe('sliderPipelineChain · WB 滑块', () => {
  it('色温 +50 → pipeline 应含 wb step', () => {
    reset()
    useEditStore.getState().setWhiteBalance({ temp: 50 })
    expect(stepIds()).toContain('wb')
  })
  it('色调 -30 → pipeline 应含 wb step', () => {
    reset()
    useEditStore.getState().setWhiteBalance({ tint: -30 })
    expect(stepIds()).toContain('wb')
  })
  it('WB 默认全零（temp=0, tint=0）→ pipeline 不含 wb step（恒等跳过）', () => {
    reset()
    useEditStore.getState().setWhiteBalance({ temp: 0, tint: 0 })
    expect(stepIds()).not.toContain('wb')
  })
})

describe('sliderPipelineChain · Presence（clarity/saturation/vibrance）', () => {
  it('清晰度 +50 → pipeline 应含 adjustments step', () => {
    reset()
    useEditStore.getState().setClarity(50)
    expect(stepIds()).toContain('adjustments')
  })
  it('饱和度 -100 → pipeline 应含 adjustments step', () => {
    reset()
    useEditStore.getState().setSaturation(-100)
    expect(stepIds()).toContain('adjustments')
  })
  it('自然饱和度 +100 → pipeline 应含 adjustments step', () => {
    reset()
    useEditStore.getState().setVibrance(100)
    expect(stepIds()).toContain('adjustments')
  })
  it('三者全零 → pipeline 不含 adjustments step', () => {
    reset()
    useEditStore.getState().setClarity(0)
    expect(stepIds()).not.toContain('adjustments')
  })
})

describe('sliderPipelineChain · Vignette', () => {
  it('暗角 amount=-50 → pipeline 应含 vignette step', () => {
    reset()
    useEditStore.getState().setVignette({ amount: -50 })
    expect(stepIds()).toContain('vignette')
  })
  it('暗角 amount=0 但其他字段调整 → 仍含 vignette step（非恒等策略宽松）', () => {
    // 当前设计：vignette 只要存在就加入 pipeline（shader 内部 amount=0 自己短路）
    reset()
    useEditStore.getState().setVignette({ midpoint: 60 })
    expect(stepIds()).toContain('vignette')
  })
})

describe('sliderPipelineChain · HSL', () => {
  it('red.h=+50 → pipeline 应含 hsl step', () => {
    reset()
    useEditStore.getState().setHsl({ red: { h: 50, s: 0, l: 0 } })
    expect(stepIds()).toContain('hsl')
  })
  it('orange.s=-80 → pipeline 应含 hsl step', () => {
    reset()
    useEditStore.getState().setHsl({ orange: { h: 0, s: -80, l: 0 } })
    expect(stepIds()).toContain('hsl')
  })
  it('全通道全零 → pipeline 不含 hsl step', () => {
    reset()
    useEditStore.getState().setHsl({ red: { h: 0, s: 0, l: 0 } })
    expect(stepIds()).not.toContain('hsl')
  })
})

describe('sliderPipelineChain · Curves', () => {
  it('rgb 曲线有非恒等点 → pipeline 应含 curves step', () => {
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
  it('rgb 曲线全是 y=x 恒等点 → pipeline 不含 curves step', () => {
    reset()
    useEditStore.getState().setCurves({
      rgb: [
        { x: 0, y: 0 },
        { x: 128, y: 128 },
        { x: 255, y: 255 },
      ],
    })
    expect(stepIds()).not.toContain('curves')
  })
})

describe('sliderPipelineChain · 多滑块组合（核心端到端）', () => {
  it('同时调整 Tone/WB/HSL/Saturation → pipeline 同时含 4 个对应 step', () => {
    reset()
    useEditStore.getState().setTone({ exposure: 1, contrast: 30 })
    useEditStore.getState().setWhiteBalance({ temp: 20 })
    useEditStore.getState().setHsl({ red: { h: 10, s: 0, l: 0 } })
    useEditStore.getState().setSaturation(20)
    const ids = stepIds()
    expect(ids).toContain('tone')
    expect(ids).toContain('wb')
    expect(ids).toContain('hsl')
    expect(ids).toContain('adjustments')
  })

  it('Lightroom 管线顺序固定（wb → tone → curves → hsl → colorGrading → adjustments → lut → halation → grain → vignette）', () => {
    reset()
    const s = useEditStore.getState()
    s.setTone({ exposure: 0.5 })
    s.setWhiteBalance({ temp: 20 })
    s.setHsl({ red: { h: 10, s: 0, l: 0 } })
    s.setClarity(10)
    s.setVignette({ amount: -20 })
    const ids = stepIds()
    // wb 在 tone 前
    expect(ids.indexOf('wb')).toBeLessThan(ids.indexOf('tone'))
    // hsl 在 tone 后、adjustments 前
    expect(ids.indexOf('tone')).toBeLessThan(ids.indexOf('hsl'))
    expect(ids.indexOf('hsl')).toBeLessThan(ids.indexOf('adjustments'))
    // vignette 在最后
    expect(ids.indexOf('vignette')).toBe(ids.length - 1)
  })
})

describe('sliderPipelineChain · 回归防护：清空/重置后 pipeline 也跟着清空', () => {
  it('clear() 后 steps 应为空', () => {
    useEditStore.getState().setTone({ exposure: 1 })
    expect(stepIds().length).toBeGreaterThan(0)
    useEditStore.getState().clear()
    expect(stepIds().length).toBe(0)
  })
  it('loadFromPreset(null) 后 steps 应为空', () => {
    useEditStore.getState().setTone({ exposure: 1 })
    useEditStore.getState().loadFromPreset(null)
    expect(stepIds().length).toBe(0)
  })
})
