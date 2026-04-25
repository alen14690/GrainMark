/**
 * .cube 3D LUT 解析器 —— 主/渲染共享纯逻辑
 *
 * 此文件不含任何 I/O、不依赖 Node / Electron API，可同时在：
 *   - 主进程（electron/services/lut/cubeIO.ts 再包一层 fs + PathGuard + 安全校验）
 *   - 渲染进程（通过 grain://lut/<filename> 拿到文本后在 useLutTexture 里解析上传 GPU）
 *
 * 安全约束：
 *   - LUT_3D_SIZE ∈ [2, 64]
 *   - 最大行数 64³ + 32 —— 防 DoS
 *   - 字段语义错误抛 CubeParseError，调用方决定降级/报错
 */

export const CUBE_LIMITS = {
  MIN_SIZE: 2,
  MAX_SIZE: 64,
  MAX_LINES: 64 * 64 * 64 + 32,
} as const

export interface Cube3D {
  /** LUT 维度 N，即每边采样数（N³ 个点） */
  size: number
  /** 文件 TITLE 指令值（截断到 128 字符） */
  title?: string
  /** 交错 RGB 数据；长度 = N³ × 3；顺序遵循 .cube 规范（R 最快变化，B 最慢） */
  data: Float32Array
}

export class CubeParseError extends Error {
  constructor(
    public readonly code: 'LUT_TOO_MANY_LINES' | 'LUT_BAD_SIZE' | 'LUT_MISSING_SIZE' | 'LUT_DATA_MISMATCH',
    message: string,
  ) {
    super(message)
    this.name = 'CubeParseError'
  }
}

export function parseCubeText(text: string): Cube3D {
  const lines = text.split(/\r?\n/)
  if (lines.length > CUBE_LIMITS.MAX_LINES) {
    throw new CubeParseError('LUT_TOO_MANY_LINES', `LUT has too many lines: ${lines.length}`)
  }

  let size = 0
  let title: string | undefined
  const rgb: number[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('TITLE')) {
      title = line
        .replace(/^TITLE\s+/, '')
        .replace(/^"|"$/g, '')
        .slice(0, 128)
      continue
    }
    if (line.startsWith('LUT_3D_SIZE')) {
      size = Number.parseInt(line.split(/\s+/)[1] ?? '0', 10)
      if (!Number.isInteger(size) || size < CUBE_LIMITS.MIN_SIZE || size > CUBE_LIMITS.MAX_SIZE) {
        throw new CubeParseError(
          'LUT_BAD_SIZE',
          `Invalid LUT_3D_SIZE=${size} (allowed ${CUBE_LIMITS.MIN_SIZE}..${CUBE_LIMITS.MAX_SIZE})`,
        )
      }
      continue
    }
    if (line.startsWith('DOMAIN_') || line.startsWith('LUT_1D')) continue

    const parts = line.split(/\s+/).map(Number)
    if (parts.length === 3 && parts.every((v) => Number.isFinite(v))) {
      rgb.push(parts[0]!, parts[1]!, parts[2]!)
    }
  }

  if (size === 0) {
    throw new CubeParseError('LUT_MISSING_SIZE', 'Missing LUT_3D_SIZE directive')
  }
  const expected = size * size * size * 3
  if (rgb.length !== expected) {
    throw new CubeParseError(
      'LUT_DATA_MISMATCH',
      `LUT data size mismatch: got ${rgb.length}, expected ${expected}`,
    )
  }

  return { size, title, data: new Float32Array(rgb) }
}

/**
 * 把 Cube3D → WebGL 2 TEXTURE_3D 所需的 RGB Float32 像素数组。
 * .cube 的通道顺序（R 最快 → G → B 最慢）正好匹配 WebGL texImage3D(texture_3d) 的
 * tightly packed RGB 布局：z=B, y=G, x=R。因此直接返回 data 即可，无需重排。
 *
 * 但：WebGL 2 的 TEXTURE_3D 颜色可渲染性仅保证 RGBA8/RGBA16F；RGB32F 作为采样纹理
 * 需要 OES_texture_float_linear 扩展。我们改走 RGBA8（8bit 色深 × 33³ = 143KB，质量足够）。
 */
export function cubeToRgba8(cube: Cube3D): Uint8Array {
  const n = cube.size
  const out = new Uint8Array(n * n * n * 4)
  for (let i = 0; i < n * n * n; i++) {
    const r = cube.data[i * 3 + 0]!
    const g = cube.data[i * 3 + 1]!
    const b = cube.data[i * 3 + 2]!
    out[i * 4 + 0] = Math.max(0, Math.min(255, Math.round(r * 255)))
    out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g * 255)))
    out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b * 255)))
    out[i * 4 + 3] = 255
  }
  return out
}
