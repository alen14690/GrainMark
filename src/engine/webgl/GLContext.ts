/**
 * GLContext — WebGL 2 上下文管理
 *
 * 职责：
 *   - 创建 WebGL 2 context（不降级到 WebGL 1，M1.5 明确只做 WebGL 2）
 *   - 检测片元精度（Q4-A：highp 默认，不支持时降级 mediump）
 *   - 处理 context lost / restored 事件（GPU 崩溃/休眠恢复）
 *   - 持有一个共享全屏四边形 VAO，所有 Pass 复用（零拷贝）
 *
 * 使用方式：
 *   const gl = new GLContext(canvas)
 *   if (!gl.ok) throw new Error('WebGL2 unavailable')
 *   gl.onLost(() => showFallback())
 *   gl.onRestored(() => pipeline.rebuild())
 *
 * 安全：canvas 必须来自渲染进程的 React，绝不接受外部 URL；所有着色器源码来自
 *       本地 import（不会运行用户输入的 GLSL）
 */

export type Precision = 'highp' | 'mediump'

export interface GLContextOptions {
  /** 请求 premultipliedAlpha；默认 false（与 sharp/canvas 预乘语义保持一致） */
  premultipliedAlpha?: boolean
  /** 请求 preserveDrawingBuffer；默认 false（性能最佳） */
  preserveDrawingBuffer?: boolean
  /** antialias；默认 false（FBO 阶段不需要 MSAA，输出 pass 再开） */
  antialias?: boolean
}

export class GLContext {
  readonly canvas: HTMLCanvasElement
  readonly gl: WebGL2RenderingContext | null
  readonly precision: Precision
  /** Context is created successfully and not lost */
  get ok(): boolean {
    return this.gl !== null && !this._lost
  }

  private _lost = false
  private _onLost = new Set<() => void>()
  private _onRestored = new Set<() => void>()
  private _quadVao: WebGLVertexArrayObject | null = null
  private _quadBuffer: WebGLBuffer | null = null

  constructor(canvas: HTMLCanvasElement, opts: GLContextOptions = {}) {
    this.canvas = canvas
    this.gl = canvas.getContext('webgl2', {
      premultipliedAlpha: opts.premultipliedAlpha ?? false,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
      antialias: opts.antialias ?? false,
      alpha: true,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    })

    this.precision = this.gl ? detectPrecision(this.gl) : 'mediump'

    if (this.gl) {
      canvas.addEventListener('webglcontextlost', this._handleLost, false)
      canvas.addEventListener('webglcontextrestored', this._handleRestored, false)
      this._createQuad()
    }
  }

  /** 全屏四边形 VAO（供 Pass 绑定） */
  getFullscreenQuad(): { vao: WebGLVertexArrayObject | null; buffer: WebGLBuffer | null } {
    return { vao: this._quadVao, buffer: this._quadBuffer }
  }

  /** GPU 能力快速自检（debug/UI 显示用） */
  describe(): {
    ok: boolean
    precision: Precision
    renderer?: string
    vendor?: string
    maxTextureSize?: number
    maxRenderBufferSize?: number
  } {
    if (!this.gl) return { ok: false, precision: this.precision }
    const gl = this.gl
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      ok: !this._lost,
      precision: this.precision,
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : undefined,
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : undefined,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      maxRenderBufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
    }
  }

  onLost(cb: () => void): () => void {
    this._onLost.add(cb)
    return () => this._onLost.delete(cb)
  }
  onRestored(cb: () => void): () => void {
    this._onRestored.add(cb)
    return () => this._onRestored.delete(cb)
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this._handleLost)
    this.canvas.removeEventListener('webglcontextrestored', this._handleRestored)
    if (this.gl) {
      if (this._quadBuffer) this.gl.deleteBuffer(this._quadBuffer)
      if (this._quadVao) this.gl.deleteVertexArray(this._quadVao)
    }
    this._onLost.clear()
    this._onRestored.clear()
  }

  private _handleLost = (e: Event) => {
    e.preventDefault() // 允许自动恢复
    this._lost = true
    for (const cb of this._onLost) cb()
  }
  private _handleRestored = () => {
    this._lost = false
    this._createQuad()
    for (const cb of this._onRestored) cb()
  }

  private _createQuad() {
    const gl = this.gl
    if (!gl) return
    // 覆盖 clip space 的三角形带（-1,-1 → 1,1），两个三角形 = 4 顶点
    // attribute location 0：position (vec2) + 1：uv (vec2)
    // 交错布局：[x, y, u, v]
    const vertices = new Float32Array([
      -1,
      -1,
      0,
      0, //
      1,
      -1,
      1,
      0, //
      -1,
      1,
      0,
      1, //
      1,
      1,
      1,
      1, //
    ])
    const vao = gl.createVertexArray()
    const buf = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8)
    gl.bindVertexArray(null)
    this._quadVao = vao
    this._quadBuffer = buf
  }
}

/** 检测片元精度（Q4-A）：highp 不支持时降级 mediump */
export function detectPrecision(gl: WebGL2RenderingContext): Precision {
  const fmt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
  // precision == 0 表示不支持；M1/M2 Mac / 任何桌面 GPU 都 > 0
  if (fmt && fmt.precision > 0) return 'highp'
  return 'mediump'
}
