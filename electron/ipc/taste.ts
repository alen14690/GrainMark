/**
 * taste IPC — 口味参考集相关 IPC 通道
 *
 * 通道：
 *   - taste:presets       → 返回预置参考图列表
 *   - taste:categories    → 返回分类列表
 *   - taste:extract       → 从指定图片提取色彩方案
 *   - taste:apply-scheme  → 将配色方案应用到照片（生成预览）
 */
import type { TasteCategory } from '../../shared/types.js'
import { registerIpc } from './safeRegister.js'
import { extractColorPalette } from '../services/taste/colorExtractor.js'
import { generateSchemeFromPalette } from '../services/taste/schemeGenerator.js'
import {
  TASTE_CATEGORY_LABELS,
  TASTE_PRESETS,
  getTasteCategories,
  getPresetsByCategory,
} from '../services/taste/tastePresets.js'

export function registerTasteIpc() {
  // 获取所有预置参考图
  registerIpc('taste:presets', async (category?: unknown) => {
    if (category && typeof category === 'string') {
      return getPresetsByCategory(category as TasteCategory)
    }
    return TASTE_PRESETS
  })

  // 获取分类列表
  registerIpc('taste:categories', async () => {
    return getTasteCategories().map((c) => ({ id: c, label: TASTE_CATEGORY_LABELS[c] }))
  })

  // 从用户上传的图片提取色彩方案
  registerIpc(
    'taste:extract',
    async (imagePath: unknown) => {
      const path = imagePath as string
      const palette = await extractColorPalette(path)
      const scheme = generateSchemeFromPalette(palette, `user-${Date.now()}`, '自定义方案')
      return { palette, scheme }
    },
    { pathFields: ['args.0'] },
  )

  // 获取预置方案详情（根据参考图 ID）
  registerIpc('taste:get-scheme', async (refId: unknown) => {
    const id = refId as string
    const ref = TASTE_PRESETS.find((r) => r.id === id)
    if (!ref) throw new Error(`参考图 ${id} 不存在`)
    return ref.scheme
  })
}
