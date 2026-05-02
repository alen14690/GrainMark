import { Download, Sparkles, Trash2, Upload, User } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FilterCategory } from '../../shared/types'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'

const CATEGORIES: { id: FilterCategory | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'negative-color', label: '彩色负片' },
  { id: 'negative-bw', label: '黑白' },
  { id: 'slide', label: '反转片' },
  { id: 'cinema', label: '电影胶片' },
  { id: 'instant', label: '拍立得' },
  { id: 'digital', label: '数码风格' },
  { id: 'extracted', label: '已提取' },
  { id: 'custom', label: '自定义' },
]

/**
 * 按滤镜类别选配 Unsplash 示例照片 + CSS 色调模拟
 * 照片来源：Unsplash (免费商用授权)
 * CSS filter 模拟滤镜色调效果（非精确还原，仅用于预览区氛围展示）
 */
const CATEGORY_PREVIEW: Record<string, { photo: string; css: string }> = {
  // 彩色负片：暖色调 · 柔和对比
  'negative-color': {
    photo: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&q=75',
    css: 'saturate(0.85) contrast(0.9) sepia(0.15) brightness(1.05)',
  },
  // 黑白：去饱和 · 高对比
  'negative-bw': {
    photo: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&q=75',
    css: 'grayscale(1) contrast(1.15) brightness(1.05)',
  },
  // 反转片：高饱和 · 强对比
  slide: {
    photo: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400&q=75',
    css: 'saturate(1.3) contrast(1.15) brightness(0.95)',
  },
  // 电影胶片：偏暖 · 低饱和 · 偏青暗部
  cinema: {
    photo: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&q=75',
    css: 'saturate(0.8) contrast(1.1) sepia(0.2) brightness(0.9)',
  },
  // 拍立得：褪色 · 暖调 · 低对比
  instant: {
    photo: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=400&q=75',
    css: 'saturate(0.7) contrast(0.85) sepia(0.25) brightness(1.1)',
  },
  // 数码风格：清晰 · 干净
  digital: {
    photo: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&q=75',
    css: 'saturate(1.1) contrast(1.05) brightness(1.02)',
  },
  // 已提取 / 自定义 / 油画：通用照片
  extracted: {
    photo: 'https://images.unsplash.com/photo-1477346611705-65d1883cee1e?w=400&q=75',
    css: 'saturate(0.9) contrast(1.05)',
  },
  custom: {
    photo: 'https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=400&q=75',
    css: 'saturate(1.0) contrast(1.0)',
  },
  'oil-painting': {
    photo: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400&q=75',
    css: 'saturate(0.75) contrast(0.9) sepia(0.1) brightness(1.08)',
  },
}

/** 根据滤镜名称微调 CSS 效果 */
function getFilterPreviewStyle(name: string, category: string): string {
  const base = CATEGORY_PREVIEW[category]?.css ?? 'saturate(1) contrast(1)'
  const lower = name.toLowerCase()
  // 黑白类滤镜强制灰度
  if (lower.includes('b&w') || lower.includes('黑白') || lower.includes('mono') || category === 'negative-bw') {
    return 'grayscale(1) contrast(1.15) brightness(1.05)'
  }
  // Portra 系列：柔和暖色
  if (lower.includes('portra')) return 'saturate(0.82) contrast(0.88) sepia(0.12) brightness(1.08)'
  // Cinestill / 夜景：暖黄偏红
  if (lower.includes('cinestill') || lower.includes('800t')) return 'saturate(0.9) contrast(1.1) sepia(0.2) hue-rotate(-10deg) brightness(0.92)'
  // Fuji 系列：偏绿微冷
  if (lower.includes('fuji') || lower.includes('fujifilm')) return 'saturate(0.88) contrast(1.05) hue-rotate(5deg) brightness(1.02)'
  // Kodak Gold / Ektar：暖黄高饱和
  if (lower.includes('gold') || lower.includes('ektar')) return 'saturate(1.15) contrast(1.05) sepia(0.15) brightness(1.02)'
  // Teal & Orange
  if (lower.includes('teal') || lower.includes('orange')) return 'saturate(1.1) contrast(1.1) hue-rotate(-5deg)'
  // 日系
  if (lower.includes('日系') || lower.includes('japanese')) return 'saturate(0.75) contrast(0.85) brightness(1.15) sepia(0.05)'
  return base
}

export default function Filters() {
  const filters = useAppStore((s) => s.filters)
  const refreshFilters = useAppStore((s) => s.refreshFilters)
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('all')

  const filtered = useMemo(
    () => filters.filter((f) => category === 'all' || f.category === category),
    [filters, category],
  )

  const handleImportLUT = async () => {
    const paths = await ipc('dialog:selectFiles', {
      filters: [{ name: '3D LUT', extensions: ['cube'] }],
      multi: false,
    })
    if (paths.length === 0) return
    await ipc('filter:importCube', paths[0])
    await refreshFilters()
  }

  const handleDelete = async (id: string, source: string) => {
    if (source === 'builtin') {
      alert('内置滤镜受保护，不可删除')
      return
    }
    if (!confirm('确认删除此滤镜？')) return
    await ipc('filter:delete', id)
    await refreshFilters()
  }

  const handleExport = async (id: string) => {
    const dir = await ipc('dialog:selectDir')
    if (!dir) return
    try {
      await ipc('filter:exportCube', id, `${dir}/${id}.cube`)
      alert(`已导出到 ${dir}/${id}.cube`)
    } catch (e) {
      alert(`导出失败：${e instanceof Error ? e.message : String(e)}\n（M5 会实装完整 pipeline→LUT 烘焙）`)
    }
  }

  return (
    <div className="p-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`px-3 py-1.5 rounded-full text-[12px] transition-colors ${
              category === c.id ? 'bg-brand-amber text-bg-0 font-medium' : 'bg-bg-1 text-fg-2 hover:text-fg-1'
            }`}
          >
            {c.label}
          </button>
        ))}
        <div className="flex-1" />
        <button type="button" onClick={handleImportLUT} className="btn-secondary">
          <Upload className="w-3.5 h-3.5" />
          导入 LUT
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((f) => (
          <div key={f.id} className="card p-4 hover:border-bg-3 transition-colors group">
            <div className="aspect-video rounded-lg mb-3 relative overflow-hidden bg-bg-1">
              <img
                src={CATEGORY_PREVIEW[f.category]?.photo ?? CATEGORY_PREVIEW.custom.photo}
                alt={f.name}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: getFilterPreviewStyle(f.name, f.category) }}
              />
              <span className="absolute inset-0 film-grain" />
              {f.source === 'extracted' && (
                <div className="absolute top-2 left-2 pill-accent text-[10px]">
                  <Sparkles className="w-3 h-3" />
                  AI 提取
                </div>
              )}
              {f.source === 'imported' && <div className="absolute top-2 left-2 pill text-[10px]">LUT</div>}
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate">{f.name}</div>
                <div className="text-[10.5px] text-fg-3 font-mono mt-0.5 flex items-center gap-1.5">
                  <User className="w-2.5 h-2.5" />
                  {f.author}
                  <span className="text-bg-3">·</span>♦ {f.popularity}
                </div>
              </div>
            </div>
            {f.tags && f.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {f.tags.slice(0, 3).map((t) => (
                  <span key={t} className="text-[10px] text-fg-3 font-mono">
                    #{t}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" onClick={() => handleExport(f.id)} className="btn-ghost py-1 px-2 text-[11px] flex-1">
                <Download className="w-3 h-3" />
                导出 .cube
              </button>
              {f.source !== 'builtin' && (
                <button
                  onClick={() => handleDelete(f.id, f.source)}
                  className="btn-ghost py-1 px-2 text-[11px] text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
