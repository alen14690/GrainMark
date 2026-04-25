/**
 * Texture — WebGL 2 纹理封装
 *
 * 用途：
 *   - 作为输入：textureFromBitmap / textureFromLut3D 上传图像或 LUT 到 GPU
 *   - 作为中间缓冲：new Texture(ctx, {width,height,renderable:true}) 生成 FBO + color attachment，供 Pipeline 乒乓
 *
 * 特性：
 *   - 默认 RGBA8；可选 RGBA16F（中间 HDR pass 专用，需 EXT_color_buffer_float）
 *   - 线性过滤、clamp to edge（摄影应用用不到 repeat/wrap）
 *   - 未启用 mipmap（全屏 pass 都是 1:1，mipmap 只增内存）
 *   - 支持 3D 纹理（target = TEXTURE_3D），用于 LUT 采样
 */
import type { GLContext } from './GLContext'

export type InternalFormat = 'RGBA8' | 'RGBA16F'

/** 纹理绑定目标 —— 决定采样 uniform 类型（sampler2D / sampler3D） */
export type TextureTarget = '2D' | '3D'

export interface TextureInit {
  width: number
  height: number
  /** 3D 纹理的深度；target='3D' 时必须 > 0 */
  depth?: number
  internalFormat?: InternalFormat
  /** 是否作为渲染目标（需要 FBO）；默认 true。3D 纹理不允许 renderable */
  renderable?: boolean
  /** 默认 '2D' */
  target?: TextureTarget
}

export class Texture {
  readonly width: number
  readonly height: number
  readonly depth: number
  readonly target: TextureTarget
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
    this.target = init.target ?? '2D'
    this.depth = this.target === '3D' ? (init.depth ?? 0) : 1
    this.internalFormat = init.internalFormat ?? 'RGBA8'

    if (this.target === '3D' && this.depth <= 0) {
      throw new Error(`3D texture requires depth > 0, got ${this.depth}`)
    }
    if (this.target === '3D' && init.renderable === true) {
      // 理论上可以，但我们的 LUT 用法不需要；保守禁用避免误用
      throw new Error('3D textures cannot be renderable in this codebase')
    }

    const glTarget = this.target === '3D' ? gl.TEXTURE_3D : gl.TEXTURE_2D

    this.texture = gl.createTexture()
    gl.bindTexture(glTarget, this.texture)
    gl.texParameteri(glTarget, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(glTarget, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(glTarget, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(glTarget, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    if (this.target === '3D') {
      gl.texParameteri(glTarget, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
    }

    if (this.target === '3D') {
      // 只支持 RGBA8 的 3D 纹理（LUT 用途足够；linear 过滤由 driver 保证）
      gl.texImage3D(
        gl.TEXTURE_3D,
        0,
        gl.RGBA8,
        this.width,
        this.height,
        this.depth,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      )
    } else if (this.internalFormat === 'RGBA8') {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    } else {
      // RGBA16F 需要 EXT_color_buffer_float 扩展才能作为 FBO 附件
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.width, this.height, 0, gl.RGBA, gl.HALF_FLOAT, null)
    }

    if (init.renderable !== false && this.target === '2D') {
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
    gl.bindTexture(glTarget, null)
  }

  /** 从 ImageBitmap / HTMLImageElement / HTMLCanvasElement 上传像素（2D only） */
  upload(source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | ImageData, flipY = false): void {
    const gl = this.ctx.gl
    if (!gl || !this.texture) return
    if (this.target !== '2D') throw new Error('upload(source) is 2D-only; use uploadVolume for 3D')
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

  /** 上传 3D 纹理像素（LUT 专用）。pixels 必须是 RGBA8 格式，长度 = w·h·d·4 */
  uploadVolume(pixels: Uint8Array): void {
    const gl = this.ctx.gl
    if (!gl || !this.texture) return
    if (this.target !== '3D') throw new Error('uploadVolume is 3D-only')
    const expected = this.width * this.height * this.depth * 4
    if (pixels.length !== expected) {
      throw new Error(`uploadVolume: pixel count mismatch, got ${pixels.length}, expected ${expected}`)
    }
    gl.bindTexture(gl.TEXTURE_3D, this.texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texSubImage3D(
      gl.TEXTURE_3D,
      0,
      0,
      0,
      0,
      this.width,
      this.height,
      this.depth,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    )
    gl.bindTexture(gl.TEXTURE_3D, null)
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

/**
 * 工厂：从 RGBA8 volumetric data 建一张 3D 纹理（LUT 专用）。
 * @param size   LUT 每边的采样数（N），N×N×N 个点
 * @param pixels 长度必须是 N³ × 4 的 RGBA8 数据
 */
export function textureFromLut3D(ctx: GLContext, size: number, pixels: Uint8Array): Texture {
  const tex = new Texture(ctx, {
    width: size,
    height: size,
    depth: size,
    target: '3D',
    renderable: false,
  })
  tex.uploadVolume(pixels)
  return tex
}
