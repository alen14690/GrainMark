/**
 * taste IPC — 口味参考集相关 IPC 通道
 *
 * 通道：
 *   - taste:presets       → 返回今日轮换的参考图列表（palette 用本地缓存的真实数据）
 *   - taste:categories    → 返回分类列表
 *   - taste:extract       → 从指定图片提取色彩方案
 *   - taste:get-scheme    → 获取指定参考图的配色方案
 *
 * Palette 缓存架构：
 *   - 首次请求时用硬编码 palette 快速响应
 *   - 后台异步下载图片真实提取 palette 并缓存到 userData/taste-palettes.json
 *   - 后续请求用缓存的真实 palette 覆盖硬编码数据
 *   - 图片列表变更时自动触发增量提取
 */
import type { TasteCategory } from '../../shared/types.js'
import { registerIpc } from './safeRegister.js'
import { extractColorPalette } from '../services/taste/colorExtractor.js'
import { getDailyTastePresets, fetchUnsplashUpdates } from '../services/taste/tasteDailyRotation.js'
import { generateSchemeFromPalette } from '../services/taste/schemeGenerator.js'
import { getPaletteCache } from '../services/taste/paletteCache.js'
import {
  TASTE_CATEGORY_LABELS,
  TASTE_PRESETS,
  getTasteCategories,
} from '../services/taste/tastePresets.js'

export function registerTasteIpc() {
  const cache = getPaletteCache()

  // 启动时初始化缓存 + 触发缺失 palette 的后台提取
  void (async () => {
    await cache.init()
    const allIds = TASTE_PRESETS.map((p) => p.unsplashId)
    await cache.ensureAll(allIds)
  })()

  // 获取今日轮换的参考图（palette 优先用缓存的真实数据）
  registerIpc('taste:presets', async (category?: unknown) => {
    const cat = category && typeof category === 'string' ? category as TasteCategory : undefined
    const presets = await getDailyTastePresets(cat)
    // 确保缓存已初始化（读取本地 JSON）
    await cache.init()
    // 用缓存的真实 palette + 自动名字覆盖硬编码数据
    return cache.enrichPresets(presets)
  })

  // 获取分类列表
  registerIpc('taste:categories', async () => {
    return getTasteCategories().map((c) => ({ id: c, label: TASTE_CATEGORY_LABELS[c] }))
  })

  // 从用户上传的图片提取色彩方案
  registerIpc(
    'taste:extract',
    async (imagePath: unknown) => {
      const p = imagePath as string
      const palette = await extractColorPalette(p)
      const scheme = generateSchemeFromPalette(palette, `user-${Date.now()}`, '自定义方案')
      return { palette, scheme }
    },
    { pathFields: ['args.0'] },
  )

  // 获取预置方案详情（用缓存 palette）
  registerIpc('taste:get-scheme', async (refId: unknown) => {
    const id = refId as string
    const ref = TASTE_PRESETS.find((r) => r.id === id)
    if (!ref) throw new Error(`参考图 ${id} 不存在`)
    await cache.init()
    const cached = cache.get(ref.unsplashId)
    if (cached) {
      return { ...ref.scheme, palette: cached.palette }
    }
    return ref.scheme
  })

  // 启动时后台尝试拉取 Unsplash 新作品（不阻塞）
  void fetchUnsplashUpdates().catch(() => {})
}
