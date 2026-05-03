/**
 * paletteCache — 口味参考集图片元数据本地缓存
 *
 * 缓存内容（每张图片）：
 *   - palette: K-means 真实提取的色板
 *   - title: Unsplash 图片的 description（英文原始标题）
 *   - titleZh: 中文翻译标题（基于英文标题简单翻译）
 *   - photographer: Unsplash 图片的实际作者名
 *
 * 架构：
 *   1. 本地 JSON 缓存（userData/taste-meta-cache.json）
 *   2. 启动时加载，缺失条目异步下载图片提取 palette + 通过 Unsplash oembed 获取标题
 *   3. enrichPresets() 将缓存数据合并到 preset，覆盖硬编码的占位数据
 *   4. 图片列表变更时自动触发增量提取
 */
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { ColorPalette, TasteReference } from '../../../shared/types.js'
import { extractColorPaletteFromBuffer } from './colorExtractor.js'
import { logger } from '../logger/logger.js'

interface MetaCacheEntry {
  palette: ColorPalette
  /** Unsplash 原始英文标题 */
  title: string
  /** 中文翻译标题 */
  titleZh: string
  /** 实际摄影师名 */
  photographer: string
  extractedAt: string
}

interface MetaCacheFile {
  version: number
  updatedAt: string
  entries: Record<string, MetaCacheEntry>
}

const CACHE_VERSION = 3

/** 简单英文→中文图片描述翻译表（常见摄影场景关键词） */
const EN_ZH_MAP: Record<string, string> = {
  mountain: '山峦', mountains: '山峦', peak: '山巅', valley: '山谷', hill: '丘陵',
  ocean: '海洋', sea: '海', wave: '海浪', waves: '波涛', beach: '海滩', coast: '海岸',
  lake: '湖泊', river: '河流', waterfall: '瀑布', water: '水',
  forest: '森林', tree: '树', trees: '林木', leaf: '叶', leaves: '绿叶', green: '绿意',
  sky: '天空', cloud: '云', clouds: '云彩', sunset: '日落', sunrise: '日出', sun: '阳光',
  night: '夜', star: '星', stars: '星空', moon: '月', aurora: '极光',
  snow: '雪', ice: '冰', winter: '冬', frost: '霜',
  flower: '花', blossom: '花开', garden: '花园', cherry: '樱',
  city: '城市', street: '街道', road: '道路', bridge: '桥', building: '建筑', tower: '塔',
  light: '光', shadow: '影', dark: '暗', fog: '雾', mist: '雾', rain: '雨',
  portrait: '肖像', woman: '女', man: '男', people: '人', child: '孩童', face: '面庞',
  food: '美食', coffee: '咖啡', fruit: '水果', cake: '蛋糕', bread: '面包',
  cat: '猫', dog: '犬', bird: '鸟', animal: '动物',
  car: '车', boat: '船', train: '列车', plane: '飞机',
  desert: '沙漠', field: '原野', meadow: '草地', rock: '岩石', stone: '石',
  autumn: '秋', spring: '春', summer: '夏',
  blue: '蓝', red: '红', yellow: '黄', orange: '橙', pink: '粉', purple: '紫',
  white: '白', black: '黑', golden: '金', silver: '银',
  old: '古', vintage: '复古', minimal: '极简', abstract: '抽象',
}

/** 将英文短语翻译为中文（基于关键词匹配，不依赖网络） */
function translateTitle(enTitle: string): string {
  if (!enTitle) return ''
  const words = enTitle.toLowerCase().split(/[\s,.\-_/]+/).filter(Boolean)
  const zhParts: string[] = []
  for (const w of words) {
    if (EN_ZH_MAP[w]) zhParts.push(EN_ZH_MAP[w])
  }
  // 去重保留顺序
  const unique = [...new Set(zhParts)]
  if (unique.length === 0) return enTitle // 无法翻译就保留原文
  return unique.slice(0, 3).join('·') // 最多取3个关键词
}

/** 基于 palette 颜色特征自动生成中文方案名（oembed 失败时的 fallback） */
function generateNameFromPalette(palette: ColorPalette, category: string): string {
  const r = Number.parseInt(palette.dominant.slice(1, 3), 16)
  const g = Number.parseInt(palette.dominant.slice(3, 5), 16)
  const b = Number.parseInt(palette.dominant.slice(5, 7), 16)

  // 色调词
  let hue: string
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 30) {
    hue = palette.brightness > 60 ? '素白' : palette.brightness < 25 ? '暗夜' : '灰调'
  } else if (r >= g && r >= b) {
    hue = r > 180 ? (g > 120 ? '暖金' : '暖红') : '褐棕'
  } else if (g >= r && g >= b) {
    hue = g > 150 ? '翠绿' : '暗绿'
  } else {
    hue = b > 150 ? '湛蓝' : '深蓝'
  }

  // 温度词
  const temp = palette.temperature < 4500 ? '暖' : palette.temperature > 7000 ? '冷' : ''

  // 品类后缀
  const suffixMap: Record<string, string[]> = {
    landscape: ['之境', '光影', '意象'],
    portrait: ['人像', '光韵', '面庞'],
    street: ['街巷', '城隙', '光痕'],
    architecture: ['空间', '构成', '线条'],
    food: ['滋味', '色调', '质感'],
    'dark-moody': ['暗调', '幽境', '深邃'],
    film: ['胶片', '色调', '年代'],
    minimal: ['极简', '留白', '清寂'],
  }
  const suffixes = suffixMap[category] ?? ['色调']
  // 用 dominant hex 做确定性选择（避免每次 enrich 都变）
  const idx = (r + g + b) % suffixes.length
  return `${temp}${hue}${suffixes[idx]}`
}

/** 基于 palette 生成英文描述（photographer fallback） */
function generateEnglishName(palette: ColorPalette, category: string): string {
  const r = Number.parseInt(palette.dominant.slice(1, 3), 16)
  const g = Number.parseInt(palette.dominant.slice(3, 5), 16)
  const b = Number.parseInt(palette.dominant.slice(5, 7), 16)

  let tone: string
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 30) {
    tone = palette.brightness > 60 ? 'Light' : palette.brightness < 25 ? 'Dark' : 'Muted'
  } else if (r >= g && r >= b) {
    tone = r > 180 ? (g > 120 ? 'Warm Gold' : 'Warm Red') : 'Earthy'
  } else if (g >= r && g >= b) {
    tone = g > 150 ? 'Green' : 'Deep Green'
  } else {
    tone = b > 150 ? 'Blue' : 'Deep Blue'
  }

  const catMap: Record<string, string> = {
    landscape: 'Landscape', portrait: 'Portrait', street: 'Street',
    architecture: 'Architecture', food: 'Food', 'dark-moody': 'Moody',
    film: 'Film', minimal: 'Minimal',
  }
  return `${tone} ${catMap[category] ?? 'Photo'}`
}

class MetaCache {
  private cachePath: string = ''
  private entries: Map<string, MetaCacheEntry> = new Map()
  private initialized = false
  private queue: Set<string> = new Set()
  private processing = false

  async init(): Promise<void> {
    if (this.initialized) return
    this.cachePath = path.join(app.getPath('userData'), 'taste-meta-cache.json')
    try {
      const raw = await fsp.readFile(this.cachePath, 'utf8')
      const data: MetaCacheFile = JSON.parse(raw)
      if (data.version === CACHE_VERSION && data.entries) {
        for (const [id, entry] of Object.entries(data.entries)) {
          this.entries.set(id, entry)
        }
        logger.info('metaCache.loaded', { count: this.entries.size })
      }
    } catch {
      logger.info('metaCache.fresh')
    }
    this.initialized = true
  }

  get(photoId: string): MetaCacheEntry | null {
    return this.entries.get(photoId) ?? null
  }

  /** 检查缺失条目，排队后台提取 */
  async ensureAll(photoIds: string[]): Promise<number> {
    await this.init()
    const missing = photoIds.filter((id) => !this.entries.has(id))
    if (missing.length === 0) return 0
    for (const id of missing) this.queue.add(id)
    logger.info('metaCache.enqueue', { missing: missing.length })
    this.processQueue()
    return missing.length
  }

  /** 用缓存数据覆盖 preset 中的 palette / photographer / scheme.name */
  enrichPresets(presets: TasteReference[]): TasteReference[] {
    return presets.map((p) => {
      const cached = this.get(p.unsplashId)
      if (!cached) return p

      // 中文名：oembed 中文翻译 > oembed 英文 > 基于 palette 颜色自动生成
      const name = cached.titleZh || cached.title || generateNameFromPalette(cached.palette, p.category)
      // photographer：oembed 作者 > 基于 palette 生成英文描述（不 fallback 到硬编码）
      const photographer = cached.photographer || generateEnglishName(cached.palette, p.category)

      return {
        ...p,
        palette: cached.palette,
        photographer,
        scheme: {
          ...p.scheme,
          name,
          palette: cached.palette,
        },
      }
    })
  }

  /** 单图刷新（图片变更时调用） */
  async refreshOne(photoId: string): Promise<MetaCacheEntry | null> {
    try {
      const entry = await fetchAndExtract(photoId)
      if (!entry) return null
      this.entries.set(photoId, entry)
      await this.persist()
      return entry
    } catch (err) {
      logger.error('metaCache.refreshOne.failed', { photoId, err: (err as Error).message })
      return null
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true
    let count = 0
    while (this.queue.size > 0) {
      const id = this.queue.values().next().value
      if (!id) break
      this.queue.delete(id)
      try {
        const entry = await fetchAndExtract(id)
        if (entry) {
          this.entries.set(id, entry)
          count++
          if (count % 10 === 0) await this.persist()
        }
      } catch (err) {
        logger.error('metaCache.extract.failed', { photoId: id, err: (err as Error).message })
      }
    }
    if (count > 0) {
      await this.persist()
      logger.info('metaCache.extracted', { count, total: this.entries.size })
    }
    this.processing = false
  }

  private async persist(): Promise<void> {
    const data: MetaCacheFile = {
      version: CACHE_VERSION,
      updatedAt: new Date().toISOString(),
      entries: Object.fromEntries(this.entries),
    }
    try {
      await fsp.writeFile(this.cachePath, JSON.stringify(data), 'utf8')
    } catch (err) {
      logger.error('metaCache.persist.failed', { err: (err as Error).message })
    }
  }
}

/**
 * 下载图片 + 获取 Unsplash 元数据（标题/作者）+ 提取 palette
 *
 * 元数据获取策略：用 Unsplash oembed API（不需要 API key）
 *   GET https://unsplash.com/oembed?url=https://unsplash.com/photos/{photoId}
 *   返回 { author_name, title } 等信息
 */
async function fetchAndExtract(photoId: string): Promise<MetaCacheEntry | null> {
  // 1. 下载缩略图提取 palette
  let palette: ColorPalette
  try {
    const imgResp = await fetch(`https://images.unsplash.com/${photoId}?w=200&q=60`)
    if (!imgResp.ok) {
      logger.warn('metaCache.imgDownload.failed', { photoId, status: imgResp.status })
      return null
    }
    const buf = Buffer.from(await imgResp.arrayBuffer())
    palette = await extractColorPaletteFromBuffer(buf)
  } catch (err) {
    logger.warn('metaCache.imgExtract.failed', { photoId, err: (err as Error).message })
    return null
  }

  // 2. 获取 Unsplash 元数据（oembed，无需 API key）
  let title = ''
  let photographer = ''
  try {
    // Unsplash photo URL 格式：https://unsplash.com/photos/{id-without-prefix}
    // photoId 格式是 "photo-1506744038136-46273834b3fb"
    // Unsplash oembed 需要完整 URL
    const unsplashUrl = `https://unsplash.com/photos/${photoId.replace('photo-', '')}`
    const oembedResp = await fetch(
      `https://unsplash.com/oembed?url=${encodeURIComponent(unsplashUrl)}`,
      { signal: AbortSignal.timeout(5000) },
    )
    if (oembedResp.ok) {
      const data = await oembedResp.json() as { author_name?: string; title?: string }
      title = (data.title ?? '').trim()
      photographer = (data.author_name ?? '').trim()
    }
  } catch {
    // oembed 失败不阻塞，标题/作者留空用 fallback
  }

  const titleZh = translateTitle(title)

  return {
    palette,
    title,
    titleZh,
    photographer,
    extractedAt: new Date().toISOString(),
  }
}

let instance: MetaCache | null = null

export function getPaletteCache(): MetaCache {
  if (!instance) instance = new MetaCache()
  return instance
}
