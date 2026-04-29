/**
 * 3D LUT .cube 文件读写
 *
 * 安全加固（本轮 F6/F7 修复）：
 *   - LUT_3D_SIZE 限制 2..64（由 shared/cubeParser 保证）
 *   - 文本行数上限（防 DoS，由 shared/cubeParser 保证）
 *   - 必要字段完整性校验
 *   - **exportPresetToCube 的 outPath 必须在 PathGuard 白名单内**（F6）
 *   - **preset.pipeline.lut 必须通过 LutFileNameSchema**（F7）
 *   - **拼接后的 src 必须仍在 LUT 目录内**（二次防线）
 *
 * 本文件是主进程侧的"带 I/O + 安全错误包装"壳；纯解析逻辑在 shared/cubeParser.ts。
 */
import fs from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import type { Cube3D } from '../../../shared/cubeParser.js'
import { CUBE_LIMITS, CubeParseError, parseCubeText as _parseCubeText } from '../../../shared/cubeParser.js'
import { LutFileNameSchema } from '../../../shared/ipc-schemas.js'
import type { FilterPreset } from '../../../shared/types.js'
import { SecurityError } from '../security/pathGuard.js'
import { getPathGuardOrNull } from '../security/pathGuardRegistry.js'
import { saveFilter } from '../storage/filterStore.js'
import { getLUTDir } from '../storage/init.js'

export type { Cube3D } from '../../../shared/cubeParser.js'

export const LUT_LIMITS = {
  MIN_SIZE: CUBE_LIMITS.MIN_SIZE,
  MAX_SIZE: CUBE_LIMITS.MAX_SIZE,
  MAX_FILE_BYTES: 20 * 1024 * 1024, // 20 MB
  MAX_LINES: CUBE_LIMITS.MAX_LINES,
}

/** 把 shared 层的 CubeParseError 包装成 SecurityError 以保留历史契约 */
export function parseCubeText(text: string): Cube3D {
  try {
    return _parseCubeText(text)
  } catch (err) {
    if (err instanceof CubeParseError) {
      throw new SecurityError(err.message, err.code)
    }
    throw err
  }
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

  // 拷贝到用户 LUT 目录（文件名由本地生成，一定合法）
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

  await saveFilter(preset)
  return preset
}

/**
 * 校验 LUT 源文件名并返回真实绝对路径（在 LUT 目录内）。
 *
 * F7 防御深度：即便 Zod schema 被绕过，这里也会再次拒绝任何包含路径分隔符
 * 或不以 `.cube` 结尾的字符串。
 */
function resolveLutSourcePath(lutFileName: string): string {
  try {
    LutFileNameSchema.parse(lutFileName)
  } catch (err) {
    throw new SecurityError(
      `Invalid LUT filename "${lutFileName}": ${(err as Error).message}`,
      'BAD_LUT_NAME',
    )
  }
  const lutDir = path.resolve(getLUTDir())
  const src = path.resolve(lutDir, lutFileName)
  // 额外防线：确保 src 仍在 lutDir prefix 下（防御诡异的 realpath 歧义）
  if (src !== lutDir && !src.startsWith(lutDir + path.sep)) {
    throw new SecurityError(`LUT path escapes directory: ${src}`, 'BAD_LUT_NAME')
  }
  return src
}

export async function exportPresetToCube(preset: FilterPreset, outPath: string): Promise<void> {
  if (!preset.pipeline.lut) {
    throw new Error('Preset has no LUT. M5 will implement pipeline → LUT baking.')
  }

  // F6：outPath 必须过 PathGuard（service 层防御深度，即便 IPC 层漏了）
  const guard = getPathGuardOrNull()
  if (guard) {
    try {
      await guard.validate(outPath)
    } catch (err) {
      throw new SecurityError(
        `exportPresetToCube outPath rejected: ${(err as Error).message}`,
        'EXPORT_PATH_REJECTED',
      )
    }
  }

  // F7：源 LUT 文件名二次校验 + 路径边界检查
  const src = resolveLutSourcePath(preset.pipeline.lut)
  if (!fs.existsSync(src)) throw new Error(`LUT file missing: ${src}`)

  fs.copyFileSync(src, outPath)
}
