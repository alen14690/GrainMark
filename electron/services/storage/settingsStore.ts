import path from 'node:path'
import { app } from 'electron'
import type { AppSettings } from '../../../shared/types.js'
import { getSettingsKV } from './init.js'

const KEY = 'app.settings.v1'

function defaultSettings(): AppSettings {
  const home = app.getPath('home')
  return {
    general: {
      language: 'zh-CN',
      theme: 'dark',
      hardwareAcceleration: true,
    },
    import: {
      defaultImportDir: path.join(home, 'Pictures'),
      watchedDirs: [],
      rawColorProfile: 'camera',
      thumbnailCacheMB: 2048,
    },
    export: {
      defaultOutputDir: path.join(home, 'Pictures', 'GrainMark'),
      namingTemplate: '{name}_{filter}_{date}',
      defaultFormat: 'jpg',
      defaultQuality: 92,
      keepExif: true,
      concurrency: 4,
    },
    filter: {
      libraryDir: '',
      trendingUpdateHours: 24,
      autoRecommend: true,
    },
    watermark: {
      artistName: '',
      copyright: '',
      brandLogos: {},
      defaultTemplateId: 'minimal-bar',
      enabledByDefault: false,
    },
    ai: {
      gpuEnabled: true,
      device: 'auto',
      cloudEndpoints: {},
    },
    sync: {
      enabled: false,
      accountId: null,
      syncFilters: true,
      syncWatermarks: true,
      syncSettings: true,
      syncOriginals: false,
      conflictStrategy: 'newer-wins',
    },
    shortcuts: {
      export: 'CmdOrCtrl+E',
      undo: 'CmdOrCtrl+Z',
      redo: 'CmdOrCtrl+Shift+Z',
      'toggle-before-after': '\\',
      'next-photo': 'ArrowRight',
      'prev-photo': 'ArrowLeft',
      'apply-filter': 'Enter',
    },
    privacy: {
      anonymousStats: true,
    },
  }
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  if (typeof base !== 'object' || base === null) return (patch as T) ?? base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const key of Object.keys(patch as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[key]
    const p = (patch as Record<string, unknown>)[key]
    if (
      typeof b === 'object' &&
      b !== null &&
      !Array.isArray(b) &&
      typeof p === 'object' &&
      p !== null &&
      !Array.isArray(p)
    ) {
      // 如果 patch 对象是空的 → 直接替换（用于"清空"场景如删除所有 brandLogos）
      // 如果 patch 对象的 key 集合与 base 不同（有增删）→ 直接替换（用于删除某个 brandLogo）
      const pKeys = Object.keys(p)
      const bKeys = Object.keys(b)
      const hasDeletedKeys = bKeys.some((k) => !pKeys.includes(k))
      if (pKeys.length === 0 || hasDeletedKeys) {
        out[key] = p
      } else {
        out[key] = deepMerge(b, p as Record<string, unknown>)
      }
    } else if (p !== undefined) {
      out[key] = p
    }
  }
  return out as T
}

export function getSettings(): AppSettings {
  const kv = getSettingsKV()
  const stored = kv.get<AppSettings>(KEY)
  if (!stored) {
    const def = defaultSettings()
    // F11：kv.set 现在返回 Promise；启动时 fire-and-forget，app 退出有 flush 兜底
    void kv.set(KEY, def)
    return def
  }
  return deepMerge(defaultSettings(), stored as Partial<AppSettings>)
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const kv = getSettingsKV()
  const next = deepMerge(getSettings(), patch)
  void kv.set(KEY, next)
  return next
}
