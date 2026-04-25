/**
 * Texture — WebGL 2 纹理封装
 *
 * 用途：
 *   - 作为输入：fromImageBitmap / fromImage 上传 HTMLImageElement / ImageBitmap 到 GPU
 *   - 作为中间缓冲：createRenderTarget(w,h) 生成 FBO + color attachment，供 Pipeline 乒乓
 *
 * 特性：
 *   - 默认 RGBA8；可选 RGBA16F（中间 HDR pass 专用，需 EXT_color_buffer_float）
 *   - 线性过滤、clamp to edge（摄影应用用不到 repeat/wrap）
 *   - 未启用 mipmap（全屏 pass 都是 1:1，mipmap 只增内存）
 */
import type { GLContext } from './GLContext'

export type InternalFormat = 'RGBA8' | 'RGBA16F'

export interface TextureInit {
  width: number
  height: number
  internalFormat?: InternalFormat
  /** 是否作为渲染目标（需要 FBO）；默认 true */
  renderable?: boolean
}

export class Texture {
  readonly width: number
  readonly height: number
  readonly internalFormat: InternalFormat
  readonly texture: WebGLTexture | null
  readonly fbo: WebGLFramebuffer | null

  constructor(
    private ctx: GLContext,
    init: TextureInit,
  ) {
    if (!ctx.gl) throw new Error('GL not available')
    if (init.width <= 0 || init.height <= 0) {
      throw new Error(`Invalid texture dimensions: ${init.width}x${init.height}`)
    }
    const maxSize = ctx.gl.getParameter(ctx.gl.MAX_TEXTURE_SIZE) as number
    if (init.width > maxSize || init.height > maxSize) {
      throw new Error(`Texture exceeds MAX_TEXTURE_SIZE (${maxSize}): ${init.width}x${init.height}`)
    }

    const gl = ctx.gl
    this.width = init.width
    this.height = init.height
    this.internalFormat = init.internalFormat ?? 'RGBA8'

    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    if (this.internalFormat === 'RGBA8') {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    } else {
      // RGBA16F 需要 EXT_color_buffer_float 扩展才能作为 FBO 附件
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.width, this.height, 0, gl.RGBA, gl.HALF_FLOAT, null)
    }

    if (init.renderable !== false) {
      this.fbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0)
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`FBO incomplete: 0x${status.toString(16)}`)
      }
    } else {
      this.fbo = null
    }
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  /** 从 ImageBitmap / HTMLImageElement / HTMLCanvasElement 上传像素（一次性，纹理尺寸已固定） */
  upload(source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | ImageData, flipY = false): void {
    const gl = this.ctx.gl
    if (!gl || !this.texture) return
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      gl.RGBA,
      this.internalFormat === 'RGBA16F' ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
      source as TexImageSource,
    )
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  dispose(): void {
    const gl = this.ctx.gl
    if (!gl) return
    if (this.fbo) gl.deleteFramebuffer(this.fbo)
    if (this.texture) gl.deleteTexture(this.texture)
  }
}

/**
 * 工厂：从 ImageBitmap 建一张纹理（尺寸来自 bitmap，自动 upload）。
 */
export function textureFromBitmap(
  ctx: GLContext,
  bitmap: ImageBitmap,
  opts: { renderable?: boolean; flipY?: boolean; internalFormat?: InternalFormat } = {},
): Texture {
  const tex = new Texture(ctx, {
    width: bitmap.width,
    height: bitmap.height,
    internalFormat: opts.internalFormat ?? 'RGBA8',
    renderable: opts.renderable ?? false,
  })
  tex.upload(bitmap, opts.flipY ?? false)
  return tex
}
