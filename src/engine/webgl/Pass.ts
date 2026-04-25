/**
 * Pass — 单次全屏渲染
 *
 * 抽象：一个 Pass 消耗 0..N 个输入纹理 + 若干 uniforms，渲染到一张输出纹理（FBO）
 * 或直接绘制到 canvas（output = null）。
 *
 * 性能：
 *   - 一个 program 对应一个 Pass，program 由 ShaderRegistry 缓存，切换 pass 只 useProgram
 *   - uniform 绑定用 cached location（program 内部 Map）
 *   - 绑定 GLContext 的共享全屏四边形 VAO，零额外拷贝
 */
import type { GLContext } from './GLContext'
import type { ShaderRegistry } from './ShaderRegistry'
import type { Texture } from './Texture'

export type UniformValue =
  | number
  | [number, number]
  | [number, number, number]
  | [number, number, number, number]
  | Float32Array
  | Int32Array

export interface PassInput {
  /** 纹理绑定名（shader 里的 uniform sampler2D 名） */
  name: string
  texture: Texture
}

export interface PassConfig {
  /** 顶点 shader 源码（不含 #version / precision） */
  vert: string
  /** 片元 shader 源码（同上） */
  frag: string
  /** 输入纹理列表，按 unit 顺序绑定 */
  inputs: PassInput[]
  /** 标量 uniforms */
  uniforms?: Record<string, UniformValue>
  /** 输出：null = 绘制到 canvas；Texture = 绑定该 texture 的 FBO */
  output: Texture | null
  /** 输出视口（默认取 output 纹理尺寸，output=null 时取 canvas.drawing buffer 尺寸） */
  viewport?: { x: number; y: number; width: number; height: number }
}

/** 默认顶点 shader —— 全屏四边形，适用于 98% 的全图后处理 pass */
export const DEFAULT_VERT = `
in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

export function runPass(ctx: GLContext, registry: ShaderRegistry, config: PassConfig): void {
  const gl = ctx.gl
  if (!gl) throw new Error('GL not available')

  const program = registry.get(config.vert, config.frag)
  gl.useProgram(program)

  // 绑定 VAO（全屏四边形）
  const { vao } = ctx.getFullscreenQuad()
  gl.bindVertexArray(vao)

  // 绑定输入纹理到 texture units 0..N
  config.inputs.forEach((input, i) => {
    gl.activeTexture(gl.TEXTURE0 + i)
    const glTarget = input.texture.target === '3D' ? gl.TEXTURE_3D : gl.TEXTURE_2D
    gl.bindTexture(glTarget, input.texture.texture)
    const loc = gl.getUniformLocation(program, input.name)
    if (loc) gl.uniform1i(loc, i)
  })

  // 绑定标量 uniforms
  if (config.uniforms) {
    for (const [name, value] of Object.entries(config.uniforms)) {
      const loc = gl.getUniformLocation(program, name)
      if (!loc) continue // uniform 被 glsl 优化掉（未使用）是正常的
      bindUniform(gl, loc, value)
    }
  }

  // 绑定输出
  if (config.output) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, config.output.fbo)
    const vp = config.viewport ?? { x: 0, y: 0, width: config.output.width, height: config.output.height }
    gl.viewport(vp.x, vp.y, vp.width, vp.height)
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    const vp = config.viewport ?? {
      x: 0,
      y: 0,
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
    }
    gl.viewport(vp.x, vp.y, vp.width, vp.height)
  }

  // 绘制 —— 两个三角形带 = 4 顶点
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  // 清理状态（避免泄漏到下一 pass）
  gl.bindVertexArray(null)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}

function bindUniform(gl: WebGL2RenderingContext, loc: WebGLUniformLocation, value: UniformValue): void {
  if (typeof value === 'number') {
    gl.uniform1f(loc, value)
    return
  }
  if (Array.isArray(value)) {
    switch (value.length) {
      case 2:
        gl.uniform2f(loc, value[0]!, value[1]!)
        return
      case 3:
        gl.uniform3f(loc, value[0]!, value[1]!, value[2]!)
        return
      case 4:
        gl.uniform4f(loc, value[0]!, value[1]!, value[2]!, value[3]!)
        return
    }
  }
  if (value instanceof Float32Array) {
    switch (value.length) {
      case 2:
        gl.uniform2fv(loc, value)
        return
      case 3:
        gl.uniform3fv(loc, value)
        return
      case 4:
        gl.uniform4fv(loc, value)
        return
      case 9:
        gl.uniformMatrix3fv(loc, false, value)
        return
      case 16:
        gl.uniformMatrix4fv(loc, false, value)
        return
      default:
        gl.uniform1fv(loc, value)
        return
    }
  }
  if (value instanceof Int32Array) {
    gl.uniform1iv(loc, value)
    return
  }
  throw new Error(`Unsupported uniform value: ${JSON.stringify(value)}`)
}
