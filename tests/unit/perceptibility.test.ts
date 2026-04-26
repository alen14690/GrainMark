/**
 * perceptibility.test.ts — 滑块"用户可感知变化"硬断言基线
 *
 * 动机（M4.5 前置整改）：
 *   477 单测曾全部绿灯，但用户实测"除了曝光其他滑块全都不生效"——原因是原有
 *   shader snapshot 测试只比对 CPU 镜像和自己生成的 baseline，**不问"用户能否看到"**。
 *   本测试直接回答："拖滑块到典型档位，典型像素上的 RGB 变化是否达到人眼可感知阈值？"
 *
 * 机制：
 *   - 从 GPU shader 源码 1:1 翻译的 CPU 镜像（tests/utils/shaderCpuMirror.ts）运行
 *   - 5 个典型像素：中灰 / 暗部 / 高光 / 中红 / 中绿
 *   - 每个滑块定义"典型作用像素"（如 highlights 的典型作用像素是高光/中灰）
 *   - 硬断言：
 *     a. 典型作用像素上 Δ ≥ MIN_PERCEPTIBLE（=5，人眼可感知下限）
 *     b. 无滑块在 5 个像素上全部 Δ < 2（防完全断路）
 *
 * 维护约定：
 *   - 新增或修改 shader 时，如果发现此处断言不达标，**先问自己"用户能看到吗"**，
 *     再决定是调 shader 还是调 shader + UI curve。不允许通过降低阈值绕过。
 *   - 若极端档位（±100）在"非典型作用像素"上 Δ<2，那是设计上的"无效区"（如白色
 *     滑块对暗部无效），用 "unaffected" 字段声明，不做强断言。
 */
import { describe, expect, it } from 'vitest'
import type { RGBA } from '../utils/shaderCpuMirror'
import {
  applyAdjustmentsPass,
  applyHslFullCpu,
  applyToneCpu,
  applyWhiteBalanceCpu,
} from '../utils/shaderCpuMirror'

/** 人眼可感知 RGB 差值阈值（8bit 色，5 是保守下限） */
const MIN_PERCEPTIBLE = 5

// ============ 辅助：单像素 1×1 测试 ============

/** 构造 1×1 RGBA 输入 */
function px(r: number, g: number, b: number): { src: RGBA; w: 1; h: 1 } {
  const src = new Uint8ClampedArray([r, g, b, 255])
  return { src, w: 1, h: 1 }
}

/** RGB 三通道最大差值 */
function delta(a: RGBA, b: RGBA): number {
  return Math.max(Math.abs(a[0]! - b[0]!), Math.abs(a[1]! - b[1]!), Math.abs(a[2]! - b[2]!))
}

/** 典型像素库 */
const TEST_PIXELS: Record<string, [number, number, number]> = {
  中灰: [128, 128, 128],
  暗部: [50, 50, 50],
  高光: [220, 220, 220],
  中红: [200, 80, 80],
  中绿: [80, 180, 80],
}

type PixelName = keyof typeof TEST_PIXELS

/**
 * 运行一次滑块调整并在所有典型像素上算 Δ。
 * @returns 每个像素名到 Δ 的映射
 */
function runOnAllPixels(apply: (src: RGBA, w: number, h: number) => RGBA): Record<PixelName, number> {
  const out = {} as Record<PixelName, number>
  for (const [name, [r, g, b]] of Object.entries(TEST_PIXELS) as Array<
    [PixelName, [number, number, number]]
  >) {
    const { src } = px(r, g, b)
    const result = apply(src, 1, 1)
    out[name] = delta(src, result)
  }
  return out
}

describe('perceptibility · Tone 滑块在典型像素上必须可感知', () => {
  it('曝光 +1 EV 在所有像素都产生明显变化（Δ ≥ 20）', () => {
    const d = runOnAllPixels((s, w, h) => applyToneCpu(s, w, h, { exposure: 1 }))
    for (const name of Object.keys(d) as PixelName[]) {
      expect(d[name], `曝光 +1 EV 在 ${name} 应 Δ≥20，实际 ${d[name]}`).toBeGreaterThanOrEqual(20)
    }
  })

  it('曝光 -1 EV 在中灰/高光/中红/中绿产生明显变化（暗部可能压到黑可降阈值）', () => {
    const d = runOnAllPixels((s, w, h) => applyToneCpu(s, w, h, { exposure: -1 }))
    expect(d.中灰).toBeGreaterThanOrEqual(20)
    expect(d.高光).toBeGreaterThanOrEqual(20)
    expect(d.中红).toBeGreaterThanOrEqual(20)
    expect(d.中绿).toBeGreaterThanOrEqual(20)
  })

  it('对比度 +100：暗部压更暗、高光推更亮、彩色像素被拉开（至少 3 个像素 Δ≥20）', () => {
    const d = runOnAllPixels((s, w, h) => applyToneCpu(s, w, h, { contrast: 100 }))
    const affected = Object.values(d).filter((x) => x >= 20).length
    expect(affected, `contrast +100 应至少 3 个像素 Δ≥20，实际 ${JSON.stringify(d)}`).toBeGreaterThanOrEqual(
      3,
    )
    // 中灰作为对比度锚点数学上就不变，此像素不断言
  })

  it('对比度 +50：至少让暗部/高光/中红有可感知变化', () => {
    const d = runOnAllPixels((s, w, h) => applyToneCpu(s, w, h, { contrast: 50 }))
    expect(d.暗部).toBeGreaterThanOrEqual(MIN_PERCEPTIBLE)
    expect(d.高光).toBeGreaterThanOrEqual(MIN_PERCEPTIBLE)
    expect(d.中红).toBeGreaterThanOrEqual(MIN_PERCEPTIBLE)
  })

  it('高光 +50 在高光像素必须可感知（Δ ≥ 25）', () => {
    // 阈值 25：旧版 shader 只能给出 Δ=19（中段压制 + 系数 0.30），此断言可抓退化
    const d = runOnAllPixels((s, w, h) => applyToneCpu(s, w, h, { highlights: 50 }))
    expect(d.高光, `highlights +50 在高光像素应 Δ≥25，实际 ${d.高光}`).toBeGreaterThanOrEqual(25)
  })

  it('高光 +100 不能在中间调全无感（中灰/中绿至少一个 Δ≥15）', () => {
    const d = runOnAllPixels((s, w, h) => applyToneCpu(s, w, h, { highlights: 100 }))
    // 阈值 15：旧版 +100 在中灰 Δ=0、中绿 Δ=2，此断言可抓"死区"
    const maxMid = Math.max(d.中灰, d.中绿)
    expect(maxMid, `highlights +100 中间调至少一个 Δ≥15，实际 ${JSON.stringify(d)}`).toBeGreaterThanOrEqual(
      15,
    )
  })

  it('高光 -100 在高光像素产生强烈变化（Δ ≥ 30）', () => {
    const d = runOnAllPixels((s, w, h) => applyToneCpu(s, w, h, { highlights: -100 }))
    expect(d.高光).toBeGreaterThanOrEqual(30)
  })

  it('阴影 +50 在暗部可感知（Δ ≥ 10）', () => {
    // 阈值 10：旧版中段系数 0.35 × curve(0.5)=0.329 × 蒙版 → 暗部只 Δ=3，此断言可抓退化
    const d = runOnAllPixels((s, w, h) => applyToneCpu(s, w, h, { shadows: 50 }))
    expect(d.暗部, `shadows +50 在暗部应 Δ≥10，实际 ${d.暗部}`).toBeGreaterThanOrEqual(10)
  })

  it('阴影 +100 在暗部/中红产生明显变化（Δ ≥ 25）', () => {
    // 阈值 25：旧版 Δ=10/1，此断言可抓退化
    const d = runOnAllPixels((s, w, h) => applyToneCpu(s, w, h, { shadows: 100 }))
    expect(d.暗部).toBeGreaterThanOrEqual(25)
    expect(d.中红).toBeGreaterThanOrEqual(25)
  })

  it('阴影 -100 压暗部但不破坏高光', () => {
    const d = runOnAllPixels((s, w, h) => applyToneCpu(s, w, h, { shadows: -100 }))
    expect(d.暗部).toBeGreaterThanOrEqual(10)
    // 不对高光断言（反向阴影允许不动高光像素）
  })

  it('白色 +100 在高光像素可感知（Δ ≥ 10）', () => {
    const d = runOnAllPixels((s, w, h) => applyToneCpu(s, w, h, { whites: 100 }))
    expect(d.高光).toBeGreaterThanOrEqual(10)
  })

  it('黑色 -100 在暗部像素可感知（Δ ≥ 10）', () => {
    const d = runOnAllPixels((s, w, h) => applyToneCpu(s, w, h, { blacks: -100 }))
    expect(d.暗部).toBeGreaterThanOrEqual(10)
  })
})

describe('perceptibility · White Balance 滑块', () => {
  it('色温 +50 在中灰/高光/中红明显（Δ ≥ 10）', () => {
    const d = runOnAllPixels((s, w, h) => applyWhiteBalanceCpu(s, w, h, { temp: 50 }))
    expect(d.中灰).toBeGreaterThanOrEqual(10)
    expect(d.高光).toBeGreaterThanOrEqual(10)
    expect(d.中红).toBeGreaterThanOrEqual(10)
  })

  it('色温 +100 强烈（高光 Δ ≥ 30）', () => {
    const d = runOnAllPixels((s, w, h) => applyWhiteBalanceCpu(s, w, h, { temp: 100 }))
    expect(d.高光).toBeGreaterThanOrEqual(30)
    expect(d.中灰).toBeGreaterThanOrEqual(20)
  })

  it('色调 +100 在中灰/高光/中绿明显（Δ ≥ 20）', () => {
    const d = runOnAllPixels((s, w, h) => applyWhiteBalanceCpu(s, w, h, { tint: 100 }))
    expect(d.中灰).toBeGreaterThanOrEqual(20)
    expect(d.高光).toBeGreaterThanOrEqual(20)
    expect(d.中绿).toBeGreaterThanOrEqual(20)
  })

  it('色温 0 色调 0 恒等（所有像素 Δ = 0）', () => {
    const d = runOnAllPixels((s, w, h) => applyWhiteBalanceCpu(s, w, h, { temp: 0, tint: 0 }))
    for (const v of Object.values(d)) expect(v).toBe(0)
  })
})

describe('perceptibility · Presence / HSL 滑块', () => {
  it('饱和度 +100 让彩色像素明显变化（中红/中绿 Δ ≥ 30）', () => {
    const d = runOnAllPixels((s, w, h) => applyAdjustmentsPass(s, w, h, { saturation: 100 }))
    expect(d.中红).toBeGreaterThanOrEqual(30)
    expect(d.中绿).toBeGreaterThanOrEqual(30)
    // 灰度像素（中灰/暗部/高光）数学上无饱和度可言，Δ=0 正常
  })

  it('饱和度 -100（去色）让中红/中绿强烈变灰（Δ ≥ 30）', () => {
    const d = runOnAllPixels((s, w, h) => applyAdjustmentsPass(s, w, h, { saturation: -100 }))
    expect(d.中红).toBeGreaterThanOrEqual(30)
    expect(d.中绿).toBeGreaterThanOrEqual(30)
  })

  it('自然饱和度 +100 在中红/中绿可感知（Δ ≥ 10）', () => {
    const d = runOnAllPixels((s, w, h) => applyAdjustmentsPass(s, w, h, { vibrance: 100 }))
    expect(d.中红).toBeGreaterThanOrEqual(10)
    expect(d.中绿).toBeGreaterThanOrEqual(10)
  })

  it('HSL red.h=+100 让中红像素色相偏移（Δ ≥ 20）', () => {
    const d = runOnAllPixels((s, w, h) => applyHslFullCpu(s, w, h, { red: { h: 100 } }))
    expect(d.中红, `red 色相 +100 应让中红 Δ≥20，实际 ${d.中红}`).toBeGreaterThanOrEqual(20)
  })

  it('HSL green.s=-100 让中绿去饱和（Δ ≥ 20）', () => {
    const d = runOnAllPixels((s, w, h) => applyHslFullCpu(s, w, h, { green: { s: -100 } }))
    expect(d.中绿).toBeGreaterThanOrEqual(20)
  })
})

describe('perceptibility · 回归防护（防"完全死链"）', () => {
  // 这是兜底守门员：无论 shader 未来怎么改，都不允许用户拉滑块到极端档位时，
  // 所有典型像素都无感。一旦触发这条失败，说明有滑块 shader 断路了。
  const sliders: Array<{
    name: string
    apply: (s: RGBA, w: number, h: number) => RGBA
  }> = [
    { name: 'tone.exposure +2', apply: (s, w, h) => applyToneCpu(s, w, h, { exposure: 2 }) },
    { name: 'tone.contrast +100', apply: (s, w, h) => applyToneCpu(s, w, h, { contrast: 100 }) },
    { name: 'tone.highlights +100', apply: (s, w, h) => applyToneCpu(s, w, h, { highlights: 100 }) },
    { name: 'tone.highlights -100', apply: (s, w, h) => applyToneCpu(s, w, h, { highlights: -100 }) },
    { name: 'tone.shadows +100', apply: (s, w, h) => applyToneCpu(s, w, h, { shadows: 100 }) },
    { name: 'tone.shadows -100', apply: (s, w, h) => applyToneCpu(s, w, h, { shadows: -100 }) },
    { name: 'tone.whites +100', apply: (s, w, h) => applyToneCpu(s, w, h, { whites: 100 }) },
    { name: 'tone.whites -100', apply: (s, w, h) => applyToneCpu(s, w, h, { whites: -100 }) },
    { name: 'tone.blacks +100', apply: (s, w, h) => applyToneCpu(s, w, h, { blacks: 100 }) },
    { name: 'tone.blacks -100', apply: (s, w, h) => applyToneCpu(s, w, h, { blacks: -100 }) },
    { name: 'wb.temp +100', apply: (s, w, h) => applyWhiteBalanceCpu(s, w, h, { temp: 100 }) },
    { name: 'wb.temp -100', apply: (s, w, h) => applyWhiteBalanceCpu(s, w, h, { temp: -100 }) },
    { name: 'wb.tint +100', apply: (s, w, h) => applyWhiteBalanceCpu(s, w, h, { tint: 100 }) },
    { name: 'wb.tint -100', apply: (s, w, h) => applyWhiteBalanceCpu(s, w, h, { tint: -100 }) },
    { name: 'saturation +100', apply: (s, w, h) => applyAdjustmentsPass(s, w, h, { saturation: 100 }) },
    { name: 'saturation -100', apply: (s, w, h) => applyAdjustmentsPass(s, w, h, { saturation: -100 }) },
    { name: 'vibrance +100', apply: (s, w, h) => applyAdjustmentsPass(s, w, h, { vibrance: 100 }) },
  ]

  for (const s of sliders) {
    it(`${s.name}：至少一个典型像素 Δ ≥ 10（防完全死链）`, () => {
      const d = runOnAllPixels(s.apply)
      const max = Math.max(...Object.values(d))
      expect(max, `${s.name} 在所有像素都无感知变化（${JSON.stringify(d)}）`).toBeGreaterThanOrEqual(10)
    })
  }
})
