/**
 * tasteDailyRotation — 每日轮换算法 + Unsplash 增量拉取
 *
 * 架构：
 *   1. 本地预置 500+ 作品池（TASTE_PRESETS）做保底
 *   2. 每日按"日期种子"从池中确定性选出每品类 20 张展示
 *   3. 有网络时后台拉取 Unsplash 新作品 → 追加到本地缓存池
 *   4. 新拉取的作品优先展示（新鲜感）
 *
 * 日期种子算法：
 *   seed = hash(YYYY-MM-DD) → 用 seed 做 Fisher-Yates shuffle → 每品类取前 20
 *   同一天多次调用返回相同结果（确定性）
 *   隔天自动换一批（无需定时器）
 *
 * Unsplash 拉取策略：
 *   - 每次 app 启动时尝试拉取（fire-and-forget，不阻塞 UI）
 *   - 每品类拉 5 张最新高分作品（总共 40 张/次）
 *   - 拉取结果存入 userData/data/taste-remote-cache.json
 *   - 失败静默忽略（本地池保底）
 */
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { TasteCategory, TasteReference } from '../../../shared/types.js'
import { logger } from '../logger/logger.js'
import { getDataDir } from '../storage/init.js'
import { getTasteCategories, TASTE_PRESETS } from './tastePresets.js'

// ---- 日期种子哈希 ----

function dateSeed(): number {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  let hash = 0
  for (let i = 0; i < today.length; i++) {
    hash = ((hash << 5) - hash + today.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** 确定性 Fisher-Yates shuffle（同一 seed 同一结果） */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr]
  let s = seed
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) | 0 // LCG
    const j = Math.abs(s) % (i + 1)
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

// ---- 远程缓存 ----

const REMOTE_CACHE_FILE = 'taste-remote-cache.json'
let remoteCache: TasteReference[] = []
let remoteCacheLoaded = false

async function loadRemoteCache(): Promise<TasteReference[]> {
  if (remoteCacheLoaded) return remoteCache
  try {
    const filePath = path.join(getDataDir(), REMOTE_CACHE_FILE)
    const raw = await fsp.readFile(filePath, 'utf-8')
    remoteCache = JSON.parse(raw) as TasteReference[]
    remoteCacheLoaded = true
  } catch {
    remoteCache = []
    remoteCacheLoaded = true
  }
  return remoteCache
}

async function saveRemoteCache(items: TasteReference[]): Promise<void> {
  remoteCache = items
  try {
    const filePath = path.join(getDataDir(), REMOTE_CACHE_FILE)
    await fsp.writeFile(filePath, JSON.stringify(items), 'utf-8')
  } catch (err) {
    logger.warn('taste.remote-cache.save-failed', { err: (err as Error).message })
  }
}

// ---- Unsplash 拉取 ----

const UNSPLASH_ACCESS_KEY = 'YOUR_UNSPLASH_ACCESS_KEY' // 用户在 Settings 中配置
const CATEGORY_QUERY_MAP: Record<TasteCategory, string> = {
  landscape: 'landscape photography',
  portrait: 'portrait photography',
  street: 'street photography',
  architecture: 'architecture photography',
  food: 'food photography',
  'dark-moody': 'moody dark photography',
  film: 'film photography analog',
  minimal: 'minimal photography',
}

/**
 * 尝试从 Unsplash 拉取新作品（后台静默执行）
 * 不阻塞 UI，失败不影响功能
 */
export async function fetchUnsplashUpdates(): Promise<void> {
  // 如果没配置 key，跳过
  if (!UNSPLASH_ACCESS_KEY || UNSPLASH_ACCESS_KEY === 'YOUR_UNSPLASH_ACCESS_KEY') {
    logger.debug('taste.unsplash.skip', { reason: 'no-api-key' })
    return
  }

  const categories = getTasteCategories()
  const newItems: TasteReference[] = []

  for (const category of categories) {
    try {
      const query = CATEGORY_QUERY_MAP[category]
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&order_by=relevant&orientation=landscape`
      const resp = await fetch(url, {
        headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!resp.ok) continue

      const data = await resp.json() as { results: Array<{ id: string; urls: { small: string; regular: string }; user: { name: string } }> }
      for (const photo of data.results ?? []) {
        const id = `unsplash-${photo.id}`
        // 跳过已存在的
        if (remoteCache.some((r) => r.id === id)) continue

        // 提取色板（从缩略图 URL 无法直接分析，使用占位色板）
        const ref: TasteReference = {
          id,
          unsplashId: photo.id,
          thumbUrl: photo.urls.small,
          regularUrl: photo.urls.regular,
          photographer: photo.user.name,
          category,
          palette: { dominant: '#808080', secondary: ['#606060', '#A0A0A0'], accent: '#C0C0C0', temperature: 5500, saturation: 30, brightness: 50, contrast: 40 },
          scheme: {
            id: `scheme-${id}`,
            name: `${photo.user.name} · ${category}`,
            sourceRefId: id,
            palette: { dominant: '#808080', secondary: ['#606060', '#A0A0A0'], accent: '#C0C0C0', temperature: 5500, saturation: 30, brightness: 50, contrast: 40 },
            hslShifts: [
              { hueRange: [0, 60], hShift: 0, sShift: 0, lShift: 0 },
              { hueRange: [60, 120], hShift: 0, sShift: 0, lShift: 0 },
              { hueRange: [120, 180], hShift: 0, sShift: 0, lShift: 0 },
              { hueRange: [180, 240], hShift: 0, sShift: 0, lShift: 0 },
              { hueRange: [240, 300], hShift: 0, sShift: 0, lShift: 0 },
              { hueRange: [300, 360], hShift: 0, sShift: 0, lShift: 0 },
            ],
            temperatureShift: 0,
            saturationMul: 1.0,
            brightnessShift: 0,
            splitToning: { highlights: '#808080', shadows: '#404040', balance: 50 },
          },
        }
        newItems.push(ref)
      }
    } catch {
      // 单个品类失败不影响其他
    }
  }

  if (newItems.length > 0) {
    const updated = [...remoteCache, ...newItems].slice(-200) // 最多保留 200 条远程缓存
    await saveRemoteCache(updated)
    logger.info('taste.unsplash.fetched', { newCount: newItems.length, totalCached: updated.length })
  }
}

// ---- 每日轮换主逻辑 ----

/**
 * 获取今日展示的参考作品（每品类 20 张）
 *
 * 算法：
 *   1. 合并本地池 + 远程缓存 → 总池
 *   2. 按品类分桶
 *   3. 每桶用日期种子 shuffle
 *   4. 每桶取前 20 张
 *   5. 远程新作品插入到每品类前 5 位（保证新鲜感）
 */
export async function getDailyTastePresets(category?: TasteCategory): Promise<TasteReference[]> {
  const remote = await loadRemoteCache()
  const seed = dateSeed()

  const categories = category ? [category] : getTasteCategories()
  const result: TasteReference[] = []

  for (const cat of categories) {
    // 本地池 + 远程缓存合并
    const localItems = TASTE_PRESETS.filter((r) => r.category === cat)
    const remoteItems = remote.filter((r) => r.category === cat)

    // 本地池 shuffle
    const shuffledLocal = seededShuffle(localItems, seed + cat.charCodeAt(0))

    // 远程新品优先（最多 5 张）+ 本地补满 20
    const daily: TasteReference[] = []
    const remoteSlice = remoteItems.slice(-5) // 最新 5 张
    daily.push(...remoteSlice)
    for (const item of shuffledLocal) {
      if (daily.length >= 20) break
      if (!daily.some((d) => d.id === item.id)) daily.push(item)
    }

    result.push(...daily)
  }

  return result
}
