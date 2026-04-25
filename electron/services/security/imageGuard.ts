/**
 * ImageGuard — 图像文件入口安全守卫
 *
 * 防御面：
 *   - 扩展名欺骗（魔数校验）
 *   - 过大尺寸 DoS（dimension / file size 上限）
 *   - 畸形文件（解析超时）
 *   - 0 字节 / 残缺文件
 */
import fs from 'node:fs/promises'
import { SecurityError } from './pathGuard.js'

export const IMAGE_LIMITS = {
  MAX_FILE_BYTES: 500 * 1024 * 1024, // 单文件 500 MB
  MAX_WIDTH: 40_000,
  MAX_HEIGHT: 40_000,
  MAX_PIXELS: 40_000 * 40_000,
  MIN_FILE_BYTES: 64, // 低于 64 字节几乎不可能是合法图像
  PARSE_TIMEOUT_MS: 10_000,
}

/** 支持的图像魔数 */
const MAGIC_SIGNATURES: Array<{ ext: string; test: (b: Buffer) => boolean }> = [
  { ext: 'jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: 'png',
    test: (b) =>
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    ext: 'tiff',
    test: (b) =>
      (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
      (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a),
  },
  { ext: 'webp', test: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' },
  { ext: 'heic', test: (b) => b.slice(4, 8).toString() === 'ftyp' }, // 简化：依赖 ftyp box
  // RAW 格式签名各家不同，RAW 守卫走独立子进程解码
  {
    ext: 'cr2',
    test: (b) =>
      b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00 && b[8] === 0x43 && b[9] === 0x52,
  },
  { ext: 'nef', test: (b) => b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a },
  { ext: 'arw', test: (b) => b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00 },
  { ext: 'dng', test: (b) => b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00 },
  { ext: 'raf', test: (b) => b.slice(0, 15).toString() === 'FUJIFILMCCD-RAW' },
]

/** 通过文件头魔数检测图像类型（不信任扩展名） */
export async function detectImageType(filePath: string): Promise<string | null> {
  const fh = await fs.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(32)
    await fh.read(buffer, 0, 32, 0)
    for (const sig of MAGIC_SIGNATURES) {
      if (sig.test(buffer)) return sig.ext
    }
    return null
  } finally {
    await fh.close()
  }
}

export interface ImageValidation {
  ext: string
  size: number
}

/**
 * 对一个文件进行图像合法性校验
 * 抛出 SecurityError 或返回通过信息
 */
export async function validateImageFile(filePath: string): Promise<ImageValidation> {
  const stat = await fs.stat(filePath).catch(() => null)
  if (!stat || !stat.isFile()) {
    throw new SecurityError(`Not a file: ${filePath}`, 'NOT_FILE')
  }
  if (stat.size < IMAGE_LIMITS.MIN_FILE_BYTES) {
    throw new SecurityError(`File too small: ${stat.size}B`, 'TOO_SMALL')
  }
  if (stat.size > IMAGE_LIMITS.MAX_FILE_BYTES) {
    throw new SecurityError(`File too large: ${stat.size}B > ${IMAGE_LIMITS.MAX_FILE_BYTES}B`, 'TOO_LARGE')
  }
  const ext = await detectImageType(filePath)
  if (!ext) {
    throw new SecurityError(`Unknown image format: ${filePath}`, 'UNKNOWN_FORMAT')
  }
  return { ext, size: stat.size }
}

/** 对解码出的尺寸做二次校验 */
export function validateImageDimensions(width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    throw new SecurityError(`Invalid dimensions: ${width}x${height}`, 'BAD_DIMENSIONS')
  }
  if (width > IMAGE_LIMITS.MAX_WIDTH || height > IMAGE_LIMITS.MAX_HEIGHT) {
    throw new SecurityError(`Dimensions exceed limit: ${width}x${height}`, 'DIMENSIONS_EXCEED')
  }
  if (width * height > IMAGE_LIMITS.MAX_PIXELS) {
    throw new SecurityError(`Pixel count exceeds limit: ${width * height}`, 'PIXELS_EXCEED')
  }
}
