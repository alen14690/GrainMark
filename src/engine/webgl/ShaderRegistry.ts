/**
 * ShaderRegistry — GLSL 源码 → WebGLProgram 编译缓存
 *
 * 设计要点：
 *   - 相同 (vert, frag, precision) 编译一次，后续 get() 返回缓存 program
 *   - 统一注入 `#version 300 es\nprecision X float;` 头（shader 源码里无需重复）
 *   - 暴露 compileCount 用于测试断言"相同配对不重复编译"
 *   - dispose() 释放所有 program（context lost / hot reload 时清理）
 */
import type { GLContext, Precision } from './GLContext'

const VERSION_DIRECTIVE = '#version 300 es\n'

function precisionHeader(p: Precision): string {
  return `precision ${p} float;\nprecision ${p} int;\nprecision ${p} sampler2D;\n`
}

function makeKey(vert: string, frag: string, precision: Precision): string {
  // djb2 hash — 编译 key 要稳定且短
  let h = 5381
  const s = `${precision}::${vert.length}::${frag.length}::${vert}::${frag}`
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

export class ShaderCompileError extends Error {
  constructor(
    public readonly stage: 'vertex' | 'fragment' | 'link',
    message: string,
    public readonly log?: string,
  ) {
    super(message)
    this.name = 'ShaderCompileError'
  }
}

export class ShaderRegistry {
  private _cache = new Map<string, WebGLProgram>()
  private _compileCount = 0

  constructor(private ctx: GLContext) {}

  /** 已编译 program 数（测试用） */
  get size(): number {
    return this._cache.size
  }
  /** 累计编译次数（测试用，验证缓存命中） */
  get compileCount(): number {
    return this._compileCount
  }

  /**
   * 获取或编译 program
   * vert/frag 源码**不要**自带 `#version`/`precision` 行，Registry 会统一注入
   */
  get(vert: string, frag: string): WebGLProgram {
    if (!this.ctx.gl) throw new Error('GL not available')
    const key = makeKey(vert, frag, this.ctx.precision)
    const cached = this._cache.get(key)
    if (cached) return cached
    const program = this._compile(vert, frag)
    this._cache.set(key, program)
    this._compileCount++
    return program
  }

  /** 清理一个 program（调试/特定场景） */
  delete(vert: string, frag: string): boolean {
    if (!this.ctx.gl) return false
    const key = makeKey(vert, frag, this.ctx.precision)
    const program = this._cache.get(key)
    if (!program) return false
    this.ctx.gl.deleteProgram(program)
    return this._cache.delete(key)
  }

  /** 释放所有 program（context lost / 卸载时调用） */
  dispose(): void {
    const gl = this.ctx.gl
    if (gl) {
      for (const p of this._cache.values()) gl.deleteProgram(p)
    }
    this._cache.clear()
  }

  private _compile(vert: string, frag: string): WebGLProgram {
    const gl = this.ctx.gl
    if (!gl) throw new Error('GL not available')

    const header = VERSION_DIRECTIVE + precisionHeader(this.ctx.precision)
    const fullVert = header + vert
    const fullFrag = header + frag

    const vs = this._compileShader(gl.VERTEX_SHADER, fullVert, 'vertex')
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fullFrag, 'fragment')
    const program = gl.createProgram()
    if (!program) throw new ShaderCompileError('link', 'createProgram returned null')
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    // 约定：position=0, uv=1（匹配 GLContext 全屏四边形）
    gl.bindAttribLocation(program, 0, 'a_position')
    gl.bindAttribLocation(program, 1, 'a_uv')
    gl.linkProgram(program)
    // shader 对象已被 program 持有，可安全删除
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'unknown link error'
      gl.deleteProgram(program)
      throw new ShaderCompileError('link', `Program link failed: ${log}`, log)
    }
    return program
  }

  private _compileShader(type: number, source: string, stage: 'vertex' | 'fragment'): WebGLShader {
    const gl = this.ctx.gl!
    const sh = gl.createShader(type)
    if (!sh) throw new ShaderCompileError(stage, `createShader(${stage}) returned null`)
    gl.shaderSource(sh, source)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) ?? 'unknown compile error'
      gl.deleteShader(sh)
      throw new ShaderCompileError(stage, `${stage} compile failed: ${log}`, log)
    }
    return sh
  }
}
