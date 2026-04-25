/**
 * 3D LUT .cube 文件读写
 *
 * 安全加固：
 *   - LUT_3D_SIZE 限制 2..64
 *   - 文本行数上限（防 DoS）
 *   - 必要字段完整性校验
 */
import fs from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import type { FilterPreset } from '../../../shared/types.js'
import { SecurityError } from '../security/pathGuard.js'
import { saveFilter } from '../storage/filterStore.js'
import { getLUTDir } from '../storage/init.js'

export const LUT_LIMITS = {
  MIN_SIZE: 2,
  MAX_SIZE: 64,
  MAX_FILE_BYTES: 20 * 1024 * 1024, // 20 MB
  MAX_LINES: 64 * 64 * 64 + 32,
}

export interface Cube3D {
  size: number
  title?: string
  data: Float32Array
}

export function parseCubeText(text: string): Cube3D {
  // 行数守卫
  const lines = text.split(/\r?\n/)
  if (lines.length > LUT_LIMITS.MAX_LINES) {
    throw new SecurityError(`LUT has too many lines: ${lines.length}`, 'LUT_TOO_MANY_LINES')
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
      if (!Number.isInteger(size) || size < LUT_LIMITS.MIN_SIZE || size > LUT_LIMITS.MAX_SIZE) {
        throw new SecurityError(
          `Invalid LUT_3D_SIZE=${size} (allowed ${LUT_LIMITS.MIN_SIZE}..${LUT_LIMITS.MAX_SIZE})`,
          'LUT_BAD_SIZE',
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
    throw new SecurityError('Missing LUT_3D_SIZE directive', 'LUT_MISSING_SIZE')
  }
  const expected = size * size * size * 3
  if (rgb.length !== expected) {
    throw new SecurityError(
      `LUT data size mismatch: got ${rgb.length}, expected ${expected}`,
      'LUT_DATA_MISMATCH',
    )
  }
  return { size, title, data: new Float32Array(rgb) }
}

export function writeCubeText(cube: Cube3D, title?: string): string {
  const lines: string[] = []
  if (title) lines.push(`TITLE "${title}"`)
  lines.push(`LUT_3D_SIZE ${cube.size}`)
  lines.push('DOMAIN_MIN 0 0 0')
  lines.push('DOMAIN_MAX 1 1 1')
  for (let i = 0; i < cube.data.length; i += 3) {
    lines.push(`${cube.data[i]!.toFixed(6)} ${cube.data[i + 1]!.toFixed(6)} ${cube.data[i + 2]!.toFixed(6)}`)
  }
  return `${lines.join('\n')}\n`
}

export async function importCubeAsPreset(cubePath: string): Promise<FilterPreset> {
  const stat = fs.statSync(cubePath)
  if (stat.size > LUT_LIMITS.MAX_FILE_BYTES) {
    throw new SecurityError(`LUT file too large: ${stat.size}B`, 'LUT_TOO_LARGE')
  }
  const text = fs.readFileSync(cubePath, 'utf-8')
  // 解析 + 校验
  const cube = parseCubeText(text)

  // 拷贝到用户 LUT 目录
  const lutDir = getLUTDir()
  const filename = `${nanoid(12)}.cube`
  fs.copyFileSync(cubePath, path.join(lutDir, filename))

  const baseName = cube.title || path.basename(cubePath, path.extname(cubePath))
  const id = `lut-${nanoid(8)}`

  const preset: FilterPreset = {
    id,
    name: baseName.slice(0, 128),
    category: 'custom',
    author: 'Imported',
    version: '1.0',
    popularity: 0,
    source: 'imported',
    description: `Imported from ${path.basename(cubePath).slice(0, 128)}`,
    tags: ['lut'],
    pipeline: {
      lut: filename,
      lutIntensity: 100,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  saveFilter(preset)
  return preset
}

export async function exportPresetToCube(preset: FilterPreset, outPath: string): Promise<void> {
  if (!preset.pipeline.lut) {
    throw new Error('Preset has no LUT. M5 will implement pipeline → LUT baking.')
  }
  const src = path.join(getLUTDir(), preset.pipeline.lut)
  if (!fs.existsSync(src)) throw new Error(`LUT file missing: ${src}`)
  fs.copyFileSync(src, outPath)
}
