/**
 * Bench fixture 共享工具
 *
 * 原则：
 *   - 所有 bench 都用同一套 fixture，方便跨轮次对比
 *   - 固定 seed 伪随机，保证跨机器/跨运行的 benchmark 工作量一致
 *   - 图像尺寸预设三档（代表 RAW 缩略图 / 预览 / 原图 24MP）
 */
import sharp from 'sharp'

/** LCG 伪随机，固定 seed 保证可重现 */
export function prngBytes(length: number, seed = 0x9e3779b9): Uint8Array {
  const out = new Uint8Array(length)
  let state = seed >>> 0
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 2654435761) ^ Math.imul(i, 40503)) >>> 0
    out[i] = state & 0xff
  }
  return out
}

/** 常用 benchmark 分辨率预设 */
export const BENCH_RESOLUTIONS = {
  thumb: { width: 360, height: 240, label: '360x240 thumb' },
  preview: { width: 1600, height: 1067, label: '1600x1067 preview' },
  mp12: { width: 4000, height: 3000, label: '12MP' },
  mp24: { width: 6000, height: 4000, label: '24MP' },
} as const

/** 生成 RGBA Uint8Array 伪随机像素（histogram bench 主消费方） */
export function makeRgbaPixels(width: number, height: number): Uint8Array {
  return prngBytes(width * height * 4)
}

/**
 * 生成一个 "可被 sharp 处理的" JPEG buffer，大小近似真实照片。
 * - width/height：输出像素
 * - 使用低熵平滑渐变以避免 JPEG 压缩失效（模拟真实 RAW 内嵌 JPEG）
 */
export async function makeBenchJpeg(width: number, height: number, quality = 85): Promise<Buffer> {
  const pixels = new Uint8Array(width * height * 3)
  for (let i = 0; i < pixels.length; i += 3) {
    const x = (i / 3) % width
    const y = Math.floor(i / 3 / width)
    pixels[i] = Math.floor((x / width) * 255) // R 梯度
    pixels[i + 1] = Math.floor((y / height) * 255) // G 梯度
    pixels[i + 2] = 128 // B 常量
  }
  return await sharp(Buffer.from(pixels.buffer), {
    raw: { width, height, channels: 3 },
  })
    .jpeg({ quality })
    .toBuffer()
}
