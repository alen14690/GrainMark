import { Download, Film, Sparkles, Trash2, Upload, User } from 'lucide-react'
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
              category === c.id
                ? 'bg-accent-500 text-ink-950 font-medium'
                : 'bg-ink-900 text-ink-400 hover:text-ink-100'
            }`}
          >
            {c.label}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={handleImportLUT} className="btn-secondary">
          <Upload className="w-3.5 h-3.5" />
          导入 LUT
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((f) => (
          <div key={f.id} className="card p-4 hover:border-ink-700 transition-colors group">
            <div className="aspect-video rounded-lg bg-gradient-to-br from-ink-800 to-ink-900 mb-3 relative overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center text-ink-700">
                <Film className="w-8 h-8" />
              </div>
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
                <div className="text-[10.5px] text-ink-500 font-mono mt-0.5 flex items-center gap-1.5">
                  <User className="w-2.5 h-2.5" />
                  {f.author}
                  <span className="text-ink-700">·</span>♦ {f.popularity}
                </div>
              </div>
            </div>
            {f.tags && f.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {f.tags.slice(0, 3).map((t) => (
                  <span key={t} className="text-[10px] text-ink-500 font-mono">
                    #{t}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleExport(f.id)} className="btn-ghost py-1 px-2 text-[11px] flex-1">
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
