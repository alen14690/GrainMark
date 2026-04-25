/**
 * RAW Decoder — 内嵌 JPEG 提取
 *
 * 设计理念（Pass 2.8）：
 *   所有现代相机（Nikon/Canon/Sony/Fuji/Olympus/Panasonic/Adobe DNG 等）在写 RAW 时都会嵌入
 *   一张厂商自带调校的 JPEG（全尺寸 JpgFromRaw 或中等尺寸 PreviewImage）。
 *   对 GrainMark 的所有使用场景（浏览 / 缩略图 / 批处理 / 水印 / 滤镜预览 / 评分）来说，
 *   内嵌 JPEG 已是**最佳解**：
 *     - 速度飞快（~50-200ms，vs libraw 真 demosaic ~800-1500ms）
 *     - 画质最高（相机厂的色彩/降噪调校比任何通用 demosaic 算法都更贴合原作）
 *     - 零新依赖（复用已有的 exiftool-vendored）
 *     - 跨平台零风险（libraw 的 Node binding / WASM 方案都存在维护或平台兼容问题）
 *
 *   产品判断：**GrainMark 不做真 bayer demosaic**。
 *   用户如需极致显影，Lightroom/Capture One 已把这事做到极致；我们聚焦"滤镜/胶片模拟"
 *   这块被忽视的差异化价值，用相机厂内嵌 JPEG 作为"起点"已完全够用。
 *
 * 提取策略（Q3-A）：
 *   JpgFromRaw（全尺寸）→ PreviewImage（中尺寸）→ ThumbnailImage（小尺寸）→ UnsupportedRawError
 *
 * 所有错误都包装为 UnsupportedRawError，调用方可以 catch 后走降级链（如显示占位图）。
 */
import type { Buffer } from 'node:buffer'
import { exiftool } from 'exiftool-vendored'

/** 支持的 RAW 扩展名（与 imageGuard / main.ts 的 dialog filter 保持一致） */
export const RAW_EXTENSIONS = new Set([
  'raw',
  'nef', // Nikon
  'nrw', // Nikon 精简
  'cr2', // Canon
  'cr3', // Canon 新世代
  'crw', // Canon 老世代
  'arw', // Sony
  'srf', // Sony 老世代
  'sr2', // Sony 老世代
  'dng', // Adobe / 部分手机
  'raf', // Fuji
  'orf', // Olympus
  'rw2', // Panasonic
  'rwl', // Leica
  'pef', // Pentax
  'srw', // Samsung
  '3fr', // Hasselblad
  'erf', // Epson
  'kdc', // Kodak
  'mrw', // Minolta
  'x3f', // Sigma
])

export function isRawFormat(filePathOrExt: string): boolean {
  const ext = filePathOrExt.includes('.')
    ? filePathOrExt.split('.').pop()?.toLowerCase()
    : filePathOrExt.toLowerCase().replace(/^\./, '')
  return ext !== undefined && RAW_EXTENSIONS.has(ext)
}

/** 内嵌 JPEG 提取的错误类型 */
export class UnsupportedRawError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly reason: 'no-embedded-jpeg' | 'exiftool-failed' | 'empty-buffer' | 'timeout',
    message?: string,
  ) {
    super(message ?? `Unsupported RAW (${reason}): ${filePath}`)
    this.name = 'UnsupportedRawError'
  }
}

/** 尝试从 RAW 中抽取的标签优先级（顺序即降级链） */
const EMBEDDED_JPEG_TAGS = ['JpgFromRaw', 'PreviewImage', 'ThumbnailImage'] as const
export type EmbeddedJpegTag = (typeof EMBEDDED_JPEG_TAGS)[number]

/** 抽取结果 */
export interface ExtractResult {
  /** JPEG 字节流 */
  buffer: Buffer
  /** 实际命中的 tag（用于日志/指标） */
  tag: EmbeddedJpegTag
}

/** 单次 exiftool -b -{tag} 调用的超时（RAW 文件通常较大，给 8s 余量） */
const EXTRACT_TIMEOUT_MS = 8_000

/** 依赖注入：允许测试替换 exiftool 实例 */
export interface ExiftoolLike {
  extractBinaryTagToBuffer: (tag: string, file: string) => Promise<Buffer | undefined>
}

function defaultExiftool(): ExiftoolLike {
  return {
    async extractBinaryTagToBuffer(tag, file) {
      // exiftool-vendored 的 extractBinaryTagToBuffer 返回 Buffer 或 throw
      // 不存在该 tag 时会抛 "tag not found"，我们在外层统一转成降级链
      return exiftool.extractBinaryTagToBuffer(tag as never, file)
    },
  }
}

/**
 * 从 RAW 抽取内嵌 JPEG（核心入口）
 *
 * @throws UnsupportedRawError 没有任一内嵌 JPEG tag 可用
 */
export async function extractEmbeddedJpeg(
  filePath: string,
  options: { exiftool?: ExiftoolLike } = {},
): Promise<ExtractResult> {
  const tool = options.exiftool ?? defaultExiftool()

  for (const tag of EMBEDDED_JPEG_TAGS) {
    let buf: Buffer | undefined
    try {
      buf = await withTimeout(
        tool.extractBinaryTagToBuffer(tag, filePath),
        EXTRACT_TIMEOUT_MS,
        `extract ${tag}`,
      )
    } catch (err) {
      const msg = (err as Error).message ?? ''
      // 超时要直接上抛；其它错误（tag 不存在等）降级尝试下一个 tag
      if (msg.includes('timeout:')) {
        throw new UnsupportedRawError(filePath, 'timeout', msg)
      }
      continue
    }

    if (!buf || buf.length === 0) continue

    // 校验 JPEG 魔数（0xFF 0xD8 0xFF）
    if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) {
      // 某些 tag 可能返回 TIFF/其它格式的嵌入图；跳过到下一 tag
      continue
    }

    return { buffer: buf, tag }
  }

  throw new UnsupportedRawError(
    filePath,
    'no-embedded-jpeg',
    `No extractable embedded JPEG in RAW: ${filePath}`,
  )
}

/** Promise + 超时包装器（Node 内置 AbortSignal.timeout 在 Electron 32 偶发 flaky，手写更稳） */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`timeout: ${label} > ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
