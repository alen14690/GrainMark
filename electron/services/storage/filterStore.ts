import fs from 'node:fs'
import path from 'node:path'
import type { FilterPreset } from '../../../shared/types.js'
import { BUILTIN_PRESETS } from '../../assets/presets/index.js'
import { getFiltersDir } from './init.js'

const USER_FILTERS_SUBDIR = 'user'
const BUILTIN_FILTERS_SUBDIR = 'builtin'

function ensureSubDir(sub: string): string {
  const dir = path.join(getFiltersDir(), sub)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function readJsonSafe<T>(file: string): T | null {
  try {
    const raw = fs.readFileSync(file, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** 首次启动把内置 preset 写入用户目录（仅 builtin 子目录） */
export function seedBuiltinPresets(): void {
  const dir = ensureSubDir(BUILTIN_FILTERS_SUBDIR)
  for (const preset of BUILTIN_PRESETS) {
    const file = path.join(dir, `${preset.id}.json`)
    // 内置滤镜每次启动都覆盖更新（保证用户升级后拿到最新参数）
    fs.writeFileSync(file, JSON.stringify(preset, null, 2), 'utf-8')
  }
}

export function listFilters(): FilterPreset[] {
  const result: FilterPreset[] = []
  for (const sub of [BUILTIN_FILTERS_SUBDIR, USER_FILTERS_SUBDIR]) {
    const dir = ensureSubDir(sub)
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      const preset = readJsonSafe<FilterPreset>(path.join(dir, name))
      if (preset) result.push(preset)
    }
  }
  return result
}

export function getFilter(id: string): FilterPreset | null {
  for (const sub of [USER_FILTERS_SUBDIR, BUILTIN_FILTERS_SUBDIR]) {
    const file = path.join(ensureSubDir(sub), `${id}.json`)
    if (fs.existsSync(file)) {
      return readJsonSafe<FilterPreset>(file)
    }
  }
  return null
}

export function saveFilter(preset: FilterPreset): void {
  // 内置滤镜受保护，用户另存
  const targetSub = preset.source === 'builtin' ? BUILTIN_FILTERS_SUBDIR : USER_FILTERS_SUBDIR
  const dir = ensureSubDir(targetSub)
  const now = Date.now()
  const toSave: FilterPreset = {
    ...preset,
    createdAt: preset.createdAt || now,
    updatedAt: now,
  }
  fs.writeFileSync(path.join(dir, `${preset.id}.json`), JSON.stringify(toSave, null, 2), 'utf-8')
}

export function deleteFilter(id: string): void {
  const userFile = path.join(ensureSubDir(USER_FILTERS_SUBDIR), `${id}.json`)
  if (fs.existsSync(userFile)) {
    fs.unlinkSync(userFile)
    return
  }
  // 内置滤镜不允许删除
  throw new Error('Built-in filters cannot be deleted.')
}
