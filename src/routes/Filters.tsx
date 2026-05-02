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
 * 按滤镜类别/名称生成 CSS 渐变背景，模拟滤镜色调效果
 * 不使用外部图片（Electron CSP 阻止外部网络请求）
 */
const CATEGORY_GRADIENT: Record<string, string> = {
  'negative-color': 'linear-gradient(135deg, #8B6B3A 0%, #C4A060 30%, #4A7080 70%, #2A3040 100%)',
  'negative-bw': 'linear-gradient(135deg, #1A1A1A 0%, #4A4A4A 30%, #8A8A8A 70%, #3A3A3A 100%)',
  slide: 'linear-gradient(135deg, #1A4060 0%, #3A8050 30%, #80A040 70%, #C06030 100%)',
  cinema: 'linear-gradient(135deg, #0A1520 0%, #1A3040 30%, #4A3020 70%, #0A0A10 100%)',
  instant: 'linear-gradient(135deg, #E8D8C0 0%, #C0A880 30%, #8A7050 70%, #F0E8D8 100%)',
  digital: 'linear-gradient(135deg, #2A4060 0%, #4080A0 30%, #60A0C0 70%, #204060 100%)',
  'oil-painting': 'linear-gradient(135deg, #6A5030 0%, #A08040 30%, #C0A060 70%, #5A4020 100%)',
  extracted: 'linear-gradient(135deg, #3A2050 0%, #604080 30%, #8060A0 70%, #2A1040 100%)',
  custom: 'linear-gradient(135deg, #2A2A3A 0%, #4A4A5A 30%, #6A6A7A 70%, #2A2A3A 100%)',
}

function getFilterGradient(name: string, category: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('portra')) return 'linear-gradient(135deg, #A08060 0%, #D0B080 40%, #80A0B0 80%, #604030 100%)'
  if (lower.includes('cinestill') || lower.includes('800t')) return 'linear-gradient(135deg, #1A0A08 0%, #4A2010 30%, #803010 60%, #C06020 100%)'
  if (lower.includes('fuji') && lower.includes('pro')) return 'linear-gradient(135deg, #E0D8C8 0%, #A0C8A0 40%, #80B8A0 70%, #D0E0D0 100%)'
  if (lower.includes('fuji')) return 'linear-gradient(135deg, #304838 0%, #508060 30%, #70A080 60%, #405840 100%)'
  if (lower.includes('gold')) return 'linear-gradient(135deg, #C09030 0%, #E0B040 30%, #D0A030 60%, #A07020 100%)'
  if (lower.includes('teal') || lower.includes('orange')) return 'linear-gradient(135deg, #104040 0%, #206060 30%, #C07030 70%, #804020 100%)'
  if (lower.includes('日系') || lower.includes('japanese')) return 'linear-gradient(135deg, #E8E0D8 0%, #D0C8C0 30%, #B8D0D8 70%, #F0E8E0 100%)'
  if (lower.includes('b&w') || lower.includes('mono') || category === 'negative-bw') return 'linear-gradient(135deg, #1A1A1A 0%, #4A4A4A 30%, #8A8A8A 60%, #2A2A2A 100%)'
  if (lower.includes('chrome')) return 'linear-gradient(135deg, #2A3A30 0%, #4A6A50 30%, #6A8A60 60%, #3A4A38 100%)'
  return CATEGORY_GRADIENT[category] ?? CATEGORY_GRADIENT.custom
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
            <div className="aspect-video rounded-lg mb-3 relative overflow-hidden">
              <div
                className="absolute inset-0"
                style={{ background: getFilterGradient(f.name, f.category) }}
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
