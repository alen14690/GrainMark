/**
 * readDrawingBufferToBuffer 单测（P0-1 新增回归守卫）
 *
 * 目标：
 *   - P0-1 关掉了 preserveDrawingBuffer，readPixels 必须在 draw 后同 tick 完成
 *   - 如果未来有人把 useWebGLPreview 里的 readPixels 改到 setTimeout 后，这个测试
 *     本身不能抓到（逻辑层），但可以保证 readDrawingBufferToBuffer 的 API 契约
 *     稳定：
 *       * buffer 不够大必须 throw
 *       * 0 尺寸返回 0
 *       * readPixels 调用正确参数（RGBA + UNSIGNED_BYTE + 全画布 + bindFramebuffer 到 default）
 */
import { describe, expect, it, vi } from 'vitest'
import { readDrawingBufferToBuffer } from '../../src/lib/histogram'

function makeMockGl(
  w: number,
  h: number,
): {
  gl: WebGL2RenderingContext
  readPixels: ReturnType<typeof vi.fn>
  bindFramebuffer: ReturnType<typeof vi.fn>
} {
  const readPixels = vi.fn()
  const bindFramebuffer = vi.fn()
  const gl = {
    drawingBufferWidth: w,
    drawingBufferHeight: h,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    FRAMEBUFFER: 0x8d40,
    readPixels,
    bindFramebuffer,
  } as unknown as WebGL2RenderingContext
  return { gl, readPixels, bindFramebuffer }
}

describe('readDrawingBufferToBuffer', () => {
  it('0 尺寸 canvas → 返回 0，不调 readPixels', () => {
    const { gl, readPixels } = makeMockGl(0, 0)
    const buf = new Uint8Array(0)
    expect(readDrawingBufferToBuffer(gl, buf)).toBe(0)
    expect(readPixels).not.toHaveBeenCalled()
  })

  it('buffer 过小 → throw（防止写越界）', () => {
    const { gl } = makeMockGl(100, 100)
    const buf = new Uint8Array(100 * 100 * 4 - 1) // 少 1 字节
    expect(() => readDrawingBufferToBuffer(gl, buf)).toThrow(/buffer too small/)
  })

  it('正常路径：bind default FBO + readPixels 全画布 + 返回像素数', () => {
    const { gl, readPixels, bindFramebuffer } = makeMockGl(200, 150)
    const buf = new Uint8Array(200 * 150 * 4)
    const n = readDrawingBufferToBuffer(gl, buf)
    expect(n).toBe(200 * 150)
    // 必须绑定 default framebuffer（null）—— draw 完画布后 drawing buffer 在 default FBO
    expect(bindFramebuffer).toHaveBeenCalledWith(0x8d40, null)
    // readPixels 用完整参数
    expect(readPixels).toHaveBeenCalledWith(0, 0, 200, 150, 0x1908, 0x1401, buf)
  })

  it('buffer 比需要大（overallocate 场景）也 OK', () => {
    const { gl, readPixels } = makeMockGl(100, 100)
    const buf = new Uint8Array(500 * 500 * 4) // 比需要大几十倍但不至于 mmap 慢
    expect(readDrawingBufferToBuffer(gl, buf)).toBe(100 * 100)
    expect(readPixels).toHaveBeenCalled()
  })

  it('readPixels throw → 返回 0（不 crash 调用者）', () => {
    const { gl, readPixels } = makeMockGl(100, 100)
    readPixels.mockImplementationOnce(() => {
      throw new Error('GL_INVALID_OPERATION')
    })
    const buf = new Uint8Array(100 * 100 * 4)
    expect(readDrawingBufferToBuffer(gl, buf)).toBe(0)
  })
})
