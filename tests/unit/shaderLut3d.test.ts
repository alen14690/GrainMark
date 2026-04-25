/**
 * LUT3D shader + normalizeLut3dParams 契约单测
 */
import { describe, expect, it } from 'vitest'
import { LUT3D_FRAG, normalizeLut3dParams } from '../../src/engine/webgl'

describe('LUT3D shader 源码契约', () => {
  it('含所有必需 uniform + sampler', () => {
    for (const name of ['u_image', 'u_lut', 'u_lutSize', 'u_intensity']) {
      expect(LUT3D_FRAG).toContain(name)
    }
  })
  it('使用 sampler3D（非 sampler2D）', () => {
    expect(LUT3D_FRAG).toContain('sampler3D')
  })
  it('不自带 #version / precision', () => {
    expect(LUT3D_FRAG).not.toContain('#version')
    expect(LUT3D_FRAG).not.toContain('precision ')
  })
  it('使用 GLSL ES 3.00 in/out', () => {
    expect(LUT3D_FRAG).toContain('in vec2 v_uv')
    expect(LUT3D_FRAG).toContain('out vec4 fragColor')
  })
  it('包含半像素中心校正（避免采样偏移）', () => {
    // 形如 (s - 1.0) / s 与 0.5 / s 都在 shader 里
    expect(LUT3D_FRAG).toMatch(/\(s - 1\.0\) \/ s/)
    expect(LUT3D_FRAG).toMatch(/0\.5 \/ s/)
  })
})

describe('normalizeLut3dParams', () => {
  it('默认 intensity=100 → u_intensity=1', () => {
    const u = normalizeLut3dParams({ lutSize: 33 })
    expect(u.u_intensity).toBe(1)
    expect(u.u_lutSize).toBe(33)
  })
  it('intensity 0..100 → 0..1', () => {
    expect(normalizeLut3dParams({ lutSize: 17, intensity: 50 }).u_intensity).toBe(0.5)
    expect(normalizeLut3dParams({ lutSize: 17, intensity: 0 }).u_intensity).toBe(0)
    expect(normalizeLut3dParams({ lutSize: 17, intensity: 100 }).u_intensity).toBe(1)
  })
  it('intensity 超出 clamp 到 [0,1]', () => {
    expect(normalizeLut3dParams({ lutSize: 17, intensity: 200 }).u_intensity).toBe(1)
    expect(normalizeLut3dParams({ lutSize: 17, intensity: -50 }).u_intensity).toBe(0)
  })
  it('lutSize clamp 到 [2, 64] 并 floor', () => {
    expect(normalizeLut3dParams({ lutSize: 1 }).u_lutSize).toBe(2)
    expect(normalizeLut3dParams({ lutSize: 100 }).u_lutSize).toBe(64)
    expect(normalizeLut3dParams({ lutSize: 17.7 }).u_lutSize).toBe(17)
  })
})
