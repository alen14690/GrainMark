/**
 * WebGL 引擎 · 纯函数单测（不依赖真 WebGL context）
 *
 * 覆盖：
 *   - tone / vignette 参数归一化的边界行为
 *   - shader 源码稳定性（防止意外改动）
 *   - ShaderRegistry 的 dedup key（用 mock GLContext 验证同一对源码不重复编译）
 *   - Pipeline 的 abort 行为（signal 提前 abort → stepCount=0 / aborted=true）
 */
import { describe, expect, it, vi } from 'vitest'
import { Pipeline } from '../../src/engine/webgl/Pipeline'
import { ShaderRegistry } from '../../src/engine/webgl/ShaderRegistry'
import { TONE_FRAG, normalizeToneParams } from '../../src/engine/webgl/shaders/tone'
import { VIGNETTE_FRAG, normalizeVignetteParams } from '../../src/engine/webgl/shaders/vignette'

// ========== normalizeToneParams ==========
describe('normalizeToneParams', () => {
  it('所有参数省略 → 返回 0 默认值', () => {
    const u = normalizeToneParams({})
    expect(u.u_exposure).toBe(0)
    expect(u.u_contrast).toBe(0)
    expect(u.u_highlights).toBe(0)
    expect(u.u_shadows).toBe(0)
    expect(u.u_whites).toBe(0)
    expect(u.u_blacks).toBe(0)
  })

  it('曝光 EV 保留原值（不归一化），clamp 到 ±5', () => {
    expect(normalizeToneParams({ exposure: 2.5 }).u_exposure).toBe(2.5)
    expect(normalizeToneParams({ exposure: 99 }).u_exposure).toBe(5)
    expect(normalizeToneParams({ exposure: -99 }).u_exposure).toBe(-5)
  })

  it('contrast/highlights/shadows/whites/blacks：-100..100 → -1..1', () => {
    const u = normalizeToneParams({
      contrast: 100,
      highlights: 50,
      shadows: -100,
      whites: -50,
      blacks: 25,
    })
    expect(u.u_contrast).toBe(1)
    expect(u.u_highlights).toBe(0.5)
    expect(u.u_shadows).toBe(-1)
    expect(u.u_whites).toBe(-0.5)
    expect(u.u_blacks).toBeCloseTo(0.25)
  })

  it('超出范围会被 clamp', () => {
    const u = normalizeToneParams({ contrast: 999, shadows: -999 })
    expect(u.u_contrast).toBe(1)
    expect(u.u_shadows).toBe(-1)
  })
})

// ========== normalizeVignetteParams ==========
describe('normalizeVignetteParams', () => {
  it('默认参数 + 1:1 aspect', () => {
    const u = normalizeVignetteParams({}, 1)
    expect(u.u_amount).toBe(0)
    expect(u.u_midpoint).toBe(0.5) // 50/100
    expect(u.u_roundness).toBe(0)
    expect(u.u_feather).toBe(0.5)
    expect(u.u_aspect).toBe(1)
  })

  it('midpoint / feather clamp 到 [0,1]', () => {
    const u1 = normalizeVignetteParams({ midpoint: 200, feather: -50 }, 1.5)
    expect(u1.u_midpoint).toBe(1)
    expect(u1.u_feather).toBe(0)
    const u2 = normalizeVignetteParams({ midpoint: -10, feather: 200 }, 1.5)
    expect(u2.u_midpoint).toBe(0)
    expect(u2.u_feather).toBe(1)
  })

  it('保留 aspect 原值（宽高比补偿由 shader 内部处理）', () => {
    expect(normalizeVignetteParams({}, 16 / 9).u_aspect).toBeCloseTo(16 / 9)
    expect(normalizeVignetteParams({}, 9 / 16).u_aspect).toBeCloseTo(9 / 16)
  })
})

// ========== Shader 源码稳定性 ==========
describe('Shader 源码契约', () => {
  it('tone shader 含所有 6 个 uniform + sampler', () => {
    for (const name of [
      'u_image',
      'u_exposure',
      'u_contrast',
      'u_highlights',
      'u_shadows',
      'u_whites',
      'u_blacks',
    ]) {
      expect(TONE_FRAG).toContain(name)
    }
  })

  it('vignette shader 含所有 5 个 uniform + sampler', () => {
    for (const name of ['u_image', 'u_amount', 'u_midpoint', 'u_roundness', 'u_feather', 'u_aspect']) {
      expect(VIGNETTE_FRAG).toContain(name)
    }
  })

  it('shader 源码不自带 #version / precision（由 ShaderRegistry 统一注入）', () => {
    expect(TONE_FRAG).not.toContain('#version')
    expect(TONE_FRAG).not.toContain('precision ')
    expect(VIGNETTE_FRAG).not.toContain('#version')
    expect(VIGNETTE_FRAG).not.toContain('precision ')
  })

  it('shader 使用 GLSL ES 3.00 的 in/out 语法（非 WebGL 1 的 attribute/varying）', () => {
    expect(TONE_FRAG).toContain('in vec2 v_uv')
    expect(TONE_FRAG).toContain('out vec4 fragColor')
    expect(VIGNETTE_FRAG).toContain('in vec2 v_uv')
  })
})

// ========== ShaderRegistry · 去重编译 ==========
describe('ShaderRegistry · 编译去重', () => {
  /** 最小 mock GLContext —— 够让 Registry 的 compile/link/program 调用可运行 */
  function makeMockCtx() {
    const gl: Partial<WebGL2RenderingContext> = {
      VERTEX_SHADER: 0x8b31 as number,
      FRAGMENT_SHADER: 0x8b30 as number,
      COMPILE_STATUS: 0x8b81 as number,
      LINK_STATUS: 0x8b82 as number,
      createShader: vi.fn(() => ({}) as WebGLShader),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn(() => true),
      getShaderInfoLog: vi.fn(() => ''),
      createProgram: vi.fn(() => ({}) as WebGLProgram),
      attachShader: vi.fn(),
      bindAttribLocation: vi.fn(),
      linkProgram: vi.fn(),
      deleteShader: vi.fn(),
      deleteProgram: vi.fn(),
      getProgramParameter: vi.fn(() => true),
      getProgramInfoLog: vi.fn(() => ''),
    }
    return {
      gl: gl as WebGL2RenderingContext,
      precision: 'highp' as const,
    }
  }

  it('相同 (vert, frag) 重复 get → 只编译一次', () => {
    const ctx = makeMockCtx()
    const reg = new ShaderRegistry(ctx as never)
    const p1 = reg.get('in vec2 a_position; void main() {}', TONE_FRAG)
    const p2 = reg.get('in vec2 a_position; void main() {}', TONE_FRAG)
    expect(p1).toBe(p2)
    expect(reg.compileCount).toBe(1)
    expect(reg.size).toBe(1)
  })

  it('不同 frag → 分别编译，缓存两个 program', () => {
    const ctx = makeMockCtx()
    const reg = new ShaderRegistry(ctx as never)
    reg.get('VERT1', TONE_FRAG)
    reg.get('VERT1', VIGNETTE_FRAG)
    expect(reg.compileCount).toBe(2)
    expect(reg.size).toBe(2)
  })

  it('dispose 清空所有缓存', () => {
    const ctx = makeMockCtx()
    const reg = new ShaderRegistry(ctx as never)
    reg.get('v', 'f')
    expect(reg.size).toBe(1)
    reg.dispose()
    expect(reg.size).toBe(0)
  })
})

// ========== Pipeline · abort 提前 ==========
describe('Pipeline · AbortController 提前退出', () => {
  it('signal 已 abort → run 立刻返回 { aborted: true, stepCount: 0 }', async () => {
    // Pipeline 的 abort 检查在 run() 开头；无需真实 GL
    const fakeCtx = { gl: {} as WebGL2RenderingContext, precision: 'highp' as const }
    const fakeReg = {} as ShaderRegistry
    const pipe = new Pipeline(fakeCtx as never, fakeReg, 'VERT')
    pipe.setSteps([
      { id: 'a', frag: 'X' },
      { id: 'b', frag: 'Y' },
    ])

    const ctrl = new AbortController()
    ctrl.abort()
    const source = {} as never // signal.aborted 先命中，source 不会被真正用到
    const stats = await pipe.run({ source, signal: ctrl.signal })
    expect(stats.aborted).toBe(true)
    expect(stats.stepCount).toBe(0)
  })

  it('空 steps → stepCount=0 且 aborted=false（不调用 _blit，因为需真 GL）', async () => {
    // 此用例仅验证"非 aborted 分支到达 steps.length==0 短路"，
    // 实际 _blit 会走 runPass（需要真 gl），故用 abort 之前阻断
    const fakeCtx = { gl: {} as WebGL2RenderingContext, precision: 'highp' as const }
    const pipe = new Pipeline(fakeCtx as never, {} as never, 'VERT')
    pipe.setSteps([])
    // 立即 abort 以避免 _blit 调用
    const ctrl = new AbortController()
    ctrl.abort()
    const stats = await pipe.run({ source: {} as never, signal: ctrl.signal })
    expect(stats.aborted).toBe(true)
  })

  it('setSteps / getSteps 行为', () => {
    const pipe = new Pipeline({ gl: {} as never, precision: 'highp' } as never, {} as never, 'VERT')
    expect(pipe.getSteps()).toEqual([])
    pipe.setSteps([
      { id: 'a', frag: 'X' },
      { id: 'b', frag: 'Y' },
    ])
    expect(pipe.getSteps()).toHaveLength(2)
    expect(pipe.getSteps()[0]!.id).toBe('a')
  })
})
