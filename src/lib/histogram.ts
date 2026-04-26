/**
 * Histogram 计算 —— 纯函数，可测
 *
 * 输入：RGBA8 像素数组（来自 gl.readPixels 或 canvas ctx.getImageData）
 * 输出：256 bins × {r, g, b, luma}
 *
 * 性能（P0-1 + P0-5 优化后）：
 *   - readPixels 必须**与 draw 在同一 tick**（否则 drawing buffer 被清）
 *   - 调用者持有预分配的 Uint8Array，避免每帧 6.8MB 重新分配
 *   - stride 跳采降低 bins 填充开销，24MP 下 ~500μs
 */

export interface HistogramBins {
  r: number[]
  g: number[]
  b: number[]
  luma: number[]
  /** 采样总像素数 */
  total: number
}

/** Rec.709 luma 权重（与 shader 内一致） */
const LR = 0.2126
const LG = 0.7152
const LB = 0.0722

export function emptyHistogram(): HistogramBins {
  return {
    r: new Array(256).fill(0),
    g: new Array(256).fill(0),
    b: new Array(256).fill(0),
    luma: new Array(256).fill(0),
    total: 0,
  }
}

/**
 * 按 stride 跳采 RGBA8 → 256 bins
 * @param pixels RGBA8 交错数组（length ≥ w·h·4）
 * @param stride 跳采步长（1 = 每像素，4 = 每 4 像素采 1）
 * @param pixelCountOverride 可选：显式声明像素数；默认 floor(pixels.length/4)
 *   —— P0-5 场景：Buffer 被 overallocate，真实像素数比 buffer 小，此参数必填
 */
export function computeHistogramFromRgba(
  pixels: Uint8Array | Uint8ClampedArray,
  stride = 1,
  pixelCountOverride?: number,
): HistogramBins {
  const step = stride < 1 ? 1 : stride
  const pixelCount = pixelCountOverride ?? Math.floor(pixels.length / 4)
  const r = new Array(256).fill(0)
  const g = new Array(256).fill(0)
  const b = new Array(256).fill(0)
  const luma = new Array(256).fill(0)
  let total = 0

  for (let i = 0; i < pixelCount; i += step) {
    const idx = i * 4
    const R = pixels[idx]!
    const G = pixels[idx + 1]!
    const B = pixels[idx + 2]!
    // alpha idx+3 忽略
    r[R]!++
    g[G]!++
    b[B]!++
    // luma 0..255
    const L = Math.min(255, Math.round(LR * R + LG * G + LB * B))
    luma[L]!++
    total++
  }

  return { r, g, b, luma, total }
}

/**
 * 把 WebGL drawing buffer readPixels 到指定 buffer（P0-1 核心）。
 *
 * **必须在 draw 调用完成后的同一 tick 内调用**；下一次浏览器合成后
 * drawing buffer 可能被清空（没有 preserveDrawingBuffer 的前提）。
 *
 * @returns 实际读取的像素数（= w·h）；gl 丢失或 0 尺寸时返回 0
 */
export function readDrawingBufferToBuffer(gl: WebGL2RenderingContext, buffer: Uint8Array): number {
  const w = gl.drawingBufferWidth
  const h = gl.drawingBufferHeight
  if (w === 0 || h === 0) return 0
  const needBytes = w * h * 4
  if (buffer.length < needBytes) {
    throw new Error(
      `readDrawingBufferToBuffer: buffer too small (${buffer.length} < ${needBytes} for ${w}x${h})`,
    )
  }
  try {
    // 直接读 default framebuffer（渲染到 canvas 的那个）
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buffer)
    return w * h
  } catch {
    return 0
  }
}

/**
 * 便利函数：从一张 canvas 读出直方图。
 *
 * ⚠️ 仅用于**非性能关键路径**（如测试、一次性诊断）。
 *   - 性能关键路径（Editor 滑块）请用 `readDrawingBufferToBuffer` + `computeHistogramFromRgba`
 *     并配合 useWebGLPreview 的复用 buffer
 *   - 本函数内部每次 `new Uint8Array(w*h*4)`，1600×1067 = 6.8MB，频繁调用会 GC pressure
 */
export function computeHistogramFromCanvas(canvas: HTMLCanvasElement, targetSamples = 65536): HistogramBins {
  const gl = canvas.getContext('webgl2')
  if (!gl) return emptyHistogram()

  const w = gl.drawingBufferWidth
  const h = gl.drawingBufferHeight
  if (w === 0 || h === 0) return emptyHistogram()

  const pixels = new Uint8Array(w * h * 4)
  const read = readDrawingBufferToBuffer(gl, pixels)
  if (read === 0) return emptyHistogram()

  const totalPixels = w * h
  const stride = Math.max(1, Math.round(totalPixels / targetSamples))
  return computeHistogramFromRgba(pixels, stride, totalPixels)
}
