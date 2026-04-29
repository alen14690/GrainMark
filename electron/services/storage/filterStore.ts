import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { FilterPreset } from '../../../shared/types.js'
import { BUILTIN_PRESETS } from '../../assets/presets/index.js'
import { getFiltersDir } from './init.js'

const USER_FILTERS_SUBDIR = 'user'
const BUILTIN_FILTERS_SUBDIR = 'builtin'

async function ensureSubDir(sub: string): Promise<string> {
  const dir = path.join(getFiltersDir(), sub)
  await fsp.mkdir(dir, { recursive: true })
  return dir
}

async function readJsonSafe<T>(file: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(file, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** 首次启动把内置 preset 写入用户目录（仅 builtin 子目录） */
export async function seedBuiltinPresets(): Promise<void> {
  const dir = await ensureSubDir(BUILTIN_FILTERS_SUBDIR)
  // 并行写入所有内置滤镜（每次启动覆盖，保证用户升级后拿到最新参数）
  await Promise.all(
    BUILTIN_PRESETS.map((preset) =>
      fsp.writeFile(path.join(dir, `${preset.id}.json`), JSON.stringify(preset, null, 2), 'utf-8'),
    ),
  )
}

export async function listFilters(): Promise<FilterPreset[]> {
  const result: FilterPreset[] = []
  for (const sub of [BUILTIN_FILTERS_SUBDIR, USER_FILTERS_SUBDIR]) {
    const dir = await ensureSubDir(sub)
    const names = await fsp.readdir(dir)
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const preset = await readJsonSafe<FilterPreset>(path.join(dir, name))
      if (preset) result.push(preset)
    }
  }
  return result
}

export async function getFilter(id: string): Promise<FilterPreset | null> {
  for (const sub of [USER_FILTERS_SUBDIR, BUILTIN_FILTERS_SUBDIR]) {
    const dir = await ensureSubDir(sub)
    const file = path.join(dir, `${id}.json`)
    try {
      await fsp.access(file)
      return await readJsonSafe<FilterPreset>(file)
    } catch {
      // file not found — try next sub
    }
  }
  return null
}

export async function saveFilter(preset: FilterPreset): Promise<void> {
  // 内置滤镜受保护，用户另存
  const targetSub = preset.source === 'builtin' ? BUILTIN_FILTERS_SUBDIR : USER_FILTERS_SUBDIR
  const dir = await ensureSubDir(targetSub)
  const now = Date.now()
  const toSave: FilterPreset = {
    ...preset,
    createdAt: preset.createdAt || now,
    updatedAt: now,
  }
  await fsp.writeFile(path.join(dir, `${preset.id}.json`), JSON.stringify(toSave, null, 2), 'utf-8')
}

export async function deleteFilter(id: string): Promise<void> {
  const userDir = await ensureSubDir(USER_FILTERS_SUBDIR)
  const userFile = path.join(userDir, `${id}.json`)
  try {
    await fsp.access(userFile)
    await fsp.unlink(userFile)
    return
  } catch {
    // file not found in user dir
  }
  // 内置滤镜不允许删除
  throw new Error('Built-in filters cannot be deleted.')
}
