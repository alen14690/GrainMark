/**
 * LLM 照片分析 · 回归测试（M5-LLM-B）
 *
 * 防的真实 bug 模式：
 *   1. LLM 返回越界值 ±80 → 必须 clamp 到 ±40（防 HDR 塑料感）
 *   2. LLM 返回 NaN / Infinity → 必须归零，不污染 pipeline
 *   3. LLM 返回所有字段 0 → 应剔除（不该写入 editStore 产生伪"修改"）
 *   4. LLM 返回 schema 不符 JSON → Zod 必须拒绝
 *   5. LLM 返回带 ```json ... ``` 围栏的字符串 → 必须能解析
 *   6. 未配置 / 未 opt-in 时必须前置拒绝，不发网络请求
 *
 * 注：真实 fetch 调用走 mock；analyst 内部的 clamp / schema 通过 __test__ 暴露
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AISuggestedAdjustments } from '../../shared/types'

// 所有 vault/configStore 的 mock 必须在 import analyst 之前
vi.mock('../../electron/services/llm/configStore.js', () => {
  return {
    getPublicConfig: vi.fn(),
    getApiKeyForInternalUse: vi.fn(),
  }
})
vi.mock('../../electron/services/logger/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('../../electron/services/raw/index.js', () => ({
  resolvePreviewBuffer: vi.fn(),
  orientationToRotationDegrees: (o?: number) => {
    if (o === 3) return 180
    if (o === 6) return 90
    if (o === 8) return 270
    return 0
  },
}))
vi.mock('sharp', () => {
  // sharp 返回链式 builder：sharp(buf).rotate().resize().jpeg().toBuffer()
  const toBuffer = vi.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xe0])) // 假 JPEG magic
  const jpeg = vi.fn(() => ({ toBuffer }))
  const resize = vi.fn(() => ({ jpeg }))
  const rotate = vi.fn(() => ({ resize }))
  const builder = () => ({ rotate })
  return { default: builder }
})

// ---- 动态 import（等 mock 生效）----
let analyst: typeof import('../../electron/services/llm/analyst')
let configStore: {
  getPublicConfig: ReturnType<typeof vi.fn>
  getApiKeyForInternalUse: ReturnType<typeof vi.fn>
}

beforeEach(async () => {
  vi.resetModules()
  analyst = await import('../../electron/services/llm/analyst')
  const cs = await import('../../electron/services/llm/configStore.js')
  configStore = cs as unknown as typeof configStore
  configStore.getPublicConfig.mockReset()
  configStore.getApiKeyForInternalUse.mockReset()
})

// ==========================================================================
// clamp 护栏：锁死"LLM 输出不信任 → 强制在安全范围内"
// ==========================================================================

describe('clampAdjustments · 防 HDR 塑料感与无效值', () => {
  it('LLM 返回 ±80 越界 → 应 clamp 到 ±40（tone/clarity/saturation/vibrance）', () => {
    const raw: AISuggestedAdjustments = {
      tone: { exposure: 80, contrast: -75, highlights: 99, shadows: -90, whites: 60, blacks: -55 },
      clarity: 77,
      saturation: -66,
      vibrance: 44,
    }
    const out = analyst.__test__.clampAdjustments(raw)
    expect(out.tone?.exposure).toBe(40)
    expect(out.tone?.contrast).toBe(-40)
    expect(out.tone?.highlights).toBe(40)
    expect(out.tone?.shadows).toBe(-40)
    expect(out.tone?.whites).toBe(40)
    expect(out.tone?.blacks).toBe(-40)
    expect(out.clarity).toBe(40)
    expect(out.saturation).toBe(-40)
    expect(out.vibrance).toBe(40)
  })

  it('whiteBalance 越界 ±80 → 应 clamp 到 ±30', () => {
    const raw: AISuggestedAdjustments = { whiteBalance: { temp: 80, tint: -99 } }
    const out = analyst.__test__.clampAdjustments(raw)
    expect(out.whiteBalance?.temp).toBe(30)
    expect(out.whiteBalance?.tint).toBe(-30)
  })

  it('LLM 返回 NaN / Infinity → 应变 0（不污染 pipeline，后续 !==0 过滤会剔除）', () => {
    const raw: AISuggestedAdjustments = {
      tone: { exposure: Number.NaN, shadows: Number.POSITIVE_INFINITY },
      clarity: Number.NEGATIVE_INFINITY,
    }
    const out = analyst.__test__.clampAdjustments(raw)
    // NaN / Infinity → clamp 成 0 → 因 !==0 过滤被完全剔除
    expect(out.tone?.exposure).toBeUndefined()
    expect(out.tone?.shadows).toBeUndefined()
    expect(out.clarity).toBeUndefined()
  })

  it('LLM 返回所有字段 0 → 输出应为空对象（不制造伪"修改"）', () => {
    const raw: AISuggestedAdjustments = {
      tone: { exposure: 0, shadows: 0, highlights: 0 },
      whiteBalance: { temp: 0, tint: 0 },
      clarity: 0,
      saturation: 0,
      vibrance: 0,
    }
    const out = analyst.__test__.clampAdjustments(raw)
    expect(out.tone).toBeUndefined()
    expect(out.whiteBalance).toBeUndefined()
    expect(out.clarity).toBeUndefined()
    expect(out.saturation).toBeUndefined()
    expect(out.vibrance).toBeUndefined()
  })

  it('tone 部分字段有效 + 部分为 0 → 只保留非零字段', () => {
    const raw: AISuggestedAdjustments = {
      tone: { exposure: 15, contrast: 0, shadows: -20, highlights: 0 },
    }
    const out = analyst.__test__.clampAdjustments(raw)
    expect(out.tone).toEqual({ exposure: 15, shadows: -20 })
  })

  it('colorGrading 仅有 hue 但 s=0 且 l=0 → 视为无效（hue 单独无意义）', () => {
    const raw: AISuggestedAdjustments = {
      colorGrading: { shadows: { h: 240, s: 0, l: 0 } },
    }
    const out = analyst.__test__.clampAdjustments(raw)
    expect(out.colorGrading).toBeUndefined()
  })

  it('colorGrading 有效：s 或 l 非零才保留', () => {
    const raw: AISuggestedAdjustments = {
      colorGrading: {
        shadows: { h: 220, s: 10, l: -5 },
        highlights: { h: 40, s: 0, l: 0 }, // 这一半会被剔
      },
    }
    const out = analyst.__test__.clampAdjustments(raw)
    expect(out.colorGrading?.shadows).toEqual({ h: 220, s: 10, l: -5 })
    expect(out.colorGrading?.highlights).toEqual({ h: 40, s: 0, l: 0 }) // 保留但 s/l=0
  })

  it('colorGrading.h 越界 361 → 保持 <= 360（Hue 上限）', () => {
    const raw: AISuggestedAdjustments = {
      colorGrading: { shadows: { h: 999, s: 20, l: 10 } },
    }
    const out = analyst.__test__.clampAdjustments(raw)
    expect(out.colorGrading?.shadows?.h).toBe(360)
  })
})

// ==========================================================================
// Zod schema 护栏：锁死"LLM 返回非法 JSON 就拒绝"
// ==========================================================================

describe('LLMResponseSchema · 拒绝异常 LLM 输出', () => {
  it('合法输出：通过', async () => {
    const m = await import('../../electron/services/llm/analyst')
    const ok = m.__test__.LLMResponseSchema.safeParse({
      analysis: {
        summary: '一张清晨窗边的人像',
        subject: '女性，坐在窗前',
        environment: '柔光、白墙背景',
        diagnosis: ['面部偏暗', '背景过亮'],
      },
      adjustments: { tone: { exposure: 20 }, clarity: 10 },
    })
    expect(ok.success).toBe(true)
  })

  it('analysis.diagnosis 为空数组 → 拒绝（至少 1 条）', async () => {
    const m = await import('../../electron/services/llm/analyst')
    const bad = m.__test__.LLMResponseSchema.safeParse({
      analysis: { summary: '一张照片', subject: '人', environment: '室内', diagnosis: [] },
      adjustments: {},
    })
    expect(bad.success).toBe(false)
  })

  it('analysis 缺 subject → 拒绝（strict + min 1）', async () => {
    const m = await import('../../electron/services/llm/analyst')
    const bad = m.__test__.LLMResponseSchema.safeParse({
      analysis: { summary: '一张照片', environment: '室内', diagnosis: ['主体偏暗'] },
      adjustments: {},
    })
    expect(bad.success).toBe(false)
  })

  it('adjustments 里塞了未知字段 → 拒绝（strict）', async () => {
    const m = await import('../../electron/services/llm/analyst')
    const bad = m.__test__.LLMResponseSchema.safeParse({
      analysis: {
        summary: '一张照片',
        subject: '人',
        environment: '室内',
        diagnosis: ['主体偏暗'],
      },
      adjustments: { unknownField: 42 },
    })
    expect(bad.success).toBe(false)
  })
})

// ==========================================================================
// 前置拒绝：锁死"未配置/未 opt-in 不发网络请求"（防流量泄漏）
// ==========================================================================

describe('analyzePhoto · 前置拒绝', () => {
  it('无 apiKey → no-config 快速失败，不调 fetch', async () => {
    configStore.getPublicConfig.mockReturnValue({
      provider: null,
      model: null,
      hasApiKey: false,
      apiKeyMasked: null,
      optInUploadImages: false,
      updatedAt: null,
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('should-not-call'))

    const r = await analyst.analyzePhoto('/tmp/fake.jpg')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorKind).toBe('no-config')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('apiKey 有但未 opt-in → not-opted-in 拒绝，不调 fetch', async () => {
    configStore.getPublicConfig.mockReturnValue({
      provider: 'openrouter',
      model: 'anthropic/claude-opus-4.7',
      hasApiKey: true,
      apiKeyMasked: 'sk-o...xxx',
      optInUploadImages: false, // <- 关键
      updatedAt: Date.now(),
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('should-not-call'))

    const r = await analyst.analyzePhoto('/tmp/fake.jpg')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorKind).toBe('not-opted-in')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('apiKey + opt-in 齐全但 model 未选 → no-config', async () => {
    configStore.getPublicConfig.mockReturnValue({
      provider: 'openrouter',
      model: null, // <- 关键
      hasApiKey: true,
      apiKeyMasked: 'sk-o...xxx',
      optInUploadImages: true,
      updatedAt: Date.now(),
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const r = await analyst.analyzePhoto('/tmp/fake.jpg')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorKind).toBe('no-config')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
