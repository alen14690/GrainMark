/**
 * ShaderRegistry — GLSL 源码 → WebGLProgram 编译缓存（P0-4 优化版）
 *
 * 设计要点：
 *   - 相同 (vert, frag, precision) 编译一次，后续 get() 返回缓存 program
 *   - 统一注入 `#version 300 es\nprecision X float;` 头（shader 源码里无需重复）
 *   - 暴露 compileCount 用于测试断言"相同配对不重复编译"
 *   - **F8：每个 program 自带 `uniformLocation(name)` 缓存**
 *   - **P0-4：lookup key 用 `WeakMap<fragString, id>` 对象身份**
 *     - 原实现每次 runPass 都做 djb2 hash 完整 shader 源码（单次 ~1.7μs × 10 pass = 17μs/frame）
 *     - shader 源码都是 ES module 的 const string，**字符串身份稳定** —— 用 id 映射代替 hash
 *     - 字符串不能直接当 WeakMap key（V8 限制），但我们可以先 `Map<string, id>` intern 一次，
 *       后续用 id（number）组合生成短 key —— 同样是 O(1)，零字符串遍历
 *   - dispose() 释放所有 program（context lost / hot reload 时清理）
 */
import type { GLContext, Precision } from './GLContext'

const VERSION_DIRECTIVE = '#version 300 es\n'

function precisionHeader(p: Precision): string {
  return `precision ${p} float;\nprecision ${p} int;\nprecision ${p} sampler2D;\n`
}

/**
 * P0-4：字符串 → 数字 id 的 intern 映射（模块级单例）。
 *
 * 每个不同的 shader 源码字符串（import 的 const，身份稳定）在首次出现时
 * 分配一个递增 id；之后相同字符串同一 id。避免每次 lookup 都 hash 整个源码。
 */
const _shaderIdMap = new Map<string, number>()
let _nextShaderId = 1

function internShaderId(src: string): number {
  const cached = _shaderIdMap.get(src)
  if (cached !== undefined) return cached
  const id = _nextShaderId++
  _shaderIdMap.set(src, id)
  return id
}

/** 测试辅助：清空 intern map（通常不需要） */
export function _resetShaderIdMapForTest(): void {
  _shaderIdMap.clear()
  _nextShaderId = 1
}

function makeKey(vert: string, frag: string, precision: Precision): string {
  const vid = internShaderId(vert)
  const fid = internShaderId(frag)
  // precision 只有 highp/mediump 两种；用单字符前缀足够
  return `${precision[0]}${vid}:${fid}`
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

/**
 * 编译后的 program + 其 uniform location 缓存（F8）。
 *
 * getUniformLocation 在 Chrome 下每次调用都要走字符串查找 + CPU→GPU 同步点；
 * 拖滑块时一帧会经过 8-10 个 pass，每个 pass 有 5-25 个 uniform，
 * 无缓存时每帧多达 200 次 GL 调用。Runtime 缓存消除该开销。
 */
export class CompiledProgram {
  private _uniformLocations = new Map<string, WebGLUniformLocation | null>()

  constructor(
    public readonly program: WebGLProgram,
    private readonly gl: WebGL2RenderingContext,
  ) {}

  /**
   * 取 uniform 位置；结果缓存（包括"该 uniform 被 glsl 优化掉" 的 null 状态）。
   * 返回 null 表示 shader 里没用到（不是 bug，bindUniform 会跳过）。
   */
  getUniformLocation(name: string): WebGLUniformLocation | null {
    const cached = this._uniformLocations.get(name)
    if (cached !== undefined) return cached
    const loc = this.gl.getUniformLocation(this.program, name)
    this._uniformLocations.set(name, loc)
    return loc
  }

  /** 清空 location 缓存（program 内部状态没变时一般不需要；dispose 会整体清） */
  _clearLocationCache(): void {
    this._uniformLocations.clear()
  }
}

export class ShaderRegistry {
  private _cache = new Map<string, CompiledProgram>()
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
   * 获取或编译 program（返回带缓存的 CompiledProgram 包装）。
   *
   * vert/frag 源码**不要**自带 `#version`/`precision` 行，Registry 会统一注入。
   */
  getCompiled(vert: string, frag: string): CompiledProgram {
    if (!this.ctx.gl) throw new Error('GL not available')
    const key = makeKey(vert, frag, this.ctx.precision)
    const cached = this._cache.get(key)
    if (cached) return cached
    const program = this._compile(vert, frag)
    const wrapped = new CompiledProgram(program, this.ctx.gl)
    this._cache.set(key, wrapped)
    this._compileCount++
    return wrapped
  }

  /**
   * 取裸 WebGLProgram —— 旧 API 兼容（测试 webglEngine.test.ts 会用）
   */
  get(vert: string, frag: string): WebGLProgram {
    return this.getCompiled(vert, frag).program
  }

  /** 清理一个 program（调试/特定场景） */
  delete(vert: string, frag: string): boolean {
    if (!this.ctx.gl) return false
    const key = makeKey(vert, frag, this.ctx.precision)
    const wrapped = this._cache.get(key)
    if (!wrapped) return false
    this.ctx.gl.deleteProgram(wrapped.program)
    wrapped._clearLocationCache()
    return this._cache.delete(key)
  }

  /** 释放所有 program（context lost / 卸载时调用） */
  dispose(): void {
    const gl = this.ctx.gl
    if (gl) {
      for (const w of this._cache.values()) {
        gl.deleteProgram(w.program)
        w._clearLocationCache()
      }
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
