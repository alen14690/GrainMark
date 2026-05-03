/**
 * TasteReference — 口味参考集页面
 *
 * 功能：
 *   1. 按分类浏览高质量摄影参考作品（每品类 20+）
 *   2. 点击作品查看提取的配色方案 + 色彩统计
 *   3. 「提取为滤镜」→ 深度 LAB 分析 → 生成 FilterPreset 存入滤镜库
 *   4. 「收藏」→ 标记到本地收藏列表
 *
 * 设计原则：
 *   - 口味参考是"灵感画廊"，不直接操作照片
 *   - 用户选中喜欢的作品 → 提取风格 → 生成可复用滤镜
 *   - 收藏功能用于标记稍后想深入研究的作品
 */
import { Bookmark, Loader2, Palette, Plus, Sparkles, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TasteCategory, TasteReference as TasteRef } from '../../shared/types'
import { ipc } from '../lib/ipc'

export default function TasteReferencePage() {
  const [categories, setCategories] = useState<Array<{ id: TasteCategory; label: string }>>([])
  const [activeCategory, setActiveCategory] = useState<TasteCategory | 'all'>('all')
  const [presets, setPresets] = useState<TasteRef[]>([])
  const [selectedRef, setSelectedRef] = useState<TasteRef | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([ipc('taste:categories'), ipc('taste:presets')])
      .then(([cats, refs]) => {
        setCategories((cats ?? []) as Array<{ id: TasteCategory; label: string }>)
        setPresets((refs ?? []) as TasteRef[])
        setLoading(false)
      })
      .catch((err) => {
        setError(err?.message ?? '加载失败')
        setLoading(false)
      })
  }, [])

  const filteredPresets =
    activeCategory === 'all' ? presets : presets.filter((r) => r.category === activeCategory)

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col gap-4 p-6">
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-amber" />
          <h2 className="text-[15px] font-semibold text-fg-1">口味参考集</h2>
        </div>
        <div className="flex gap-1 flex-wrap">
          <TabButton active={activeCategory === 'all'} onClick={() => setActiveCategory('all')}>
            全部
          </TabButton>
          {categories.map((c) => (
            <TabButton key={c.id} active={activeCategory === c.id} onClick={() => setActiveCategory(c.id)}>
              {c.label}
            </TabButton>
          ))}
        </div>
        <button type="button" className="ml-auto btn-ghost text-[12px] flex items-center gap-1" title="上传自定义参考图">
          <Plus className="w-3.5 h-3.5" />
          上传参考
        </button>
      </div>

      <div className="flex-1 grid grid-cols-[1fr_320px] gap-4 min-h-0">
        <div className="overflow-y-auto rounded-lg bg-bg-0/50 p-3">
          {error ? (
            <div className="text-center text-sem-error py-12 text-sm">{error}</div>
          ) : loading ? (
            <div className="text-center text-fg-3 py-12">加载中...</div>
          ) : filteredPresets.length === 0 ? (
            <div className="text-center text-fg-3 py-12">
              <Palette className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <div className="text-sm">暂无参考作品</div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filteredPresets.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRef(r)}
                  className={`group relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${selectedRef?.id === r.id ? 'border-brand-amber shadow-lg shadow-brand-amber/10' : 'border-transparent hover:border-fg-3/20'}`}
                >
                  <img src={r.thumbUrl} alt={r.scheme.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" draggable={false} />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-8">
                    <div className="text-[11px] text-white/90 font-medium truncate">{r.photographer}</div>
                    <div className="text-[9px] text-white/60 font-mono mt-0.5">{r.scheme.name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4 overflow-y-auto">
          {selectedRef ? (
            <SchemeDetail tasteRef={selectedRef} />
          ) : (
            <div className="text-center text-fg-3 text-[13px] py-12">
              <Palette className="w-8 h-8 mx-auto mb-3 opacity-30" />
              点击左侧作品查看配色方案
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${active ? 'bg-brand-amber/15 text-brand-amber border border-brand-amber/30' : 'text-fg-3 hover:text-fg-2 hover:bg-bg-1 border border-transparent'}`}
    >
      {children}
    </button>
  )
}

function SchemeDetail({ tasteRef }: { tasteRef: TasteRef }) {
  const { palette, scheme } = tasteRef
  const [extracting, setExtracting] = useState(false)

  return (
    <div className="space-y-5">
      <div className="aspect-[4/3] rounded-lg overflow-hidden bg-bg-0">
        <img src={tasteRef.regularUrl} alt={scheme.name} className="w-full h-full object-cover" loading="lazy" draggable={false} />
      </div>
      <div>
        <div className="text-[14px] font-semibold text-fg-1">{scheme.name}</div>
        <div className="text-[11px] text-fg-3 mt-1">by {tasteRef.photographer}</div>
      </div>
      <div>
        <div className="text-[10px] text-fg-3 uppercase tracking-wider mb-2">提取色板</div>
        <div className="flex gap-2">
          <ColorSwatch color={palette.dominant} label="主色" />
          {palette.secondary.map((c: string, i: number) => (
            <ColorSwatch key={`s${i}`} color={c} label={`辅${i + 1}`} />
          ))}
          <ColorSwatch color={palette.accent} label="强调" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="色温" value={`${palette.temperature}K`} />
        <Metric label="饱和度" value={`${palette.saturation}%`} />
        <Metric label="明度" value={`${palette.brightness}%`} />
        <Metric label="对比度" value={`${palette.contrast}%`} />
      </div>
      <div>
        <div className="text-[10px] text-fg-3 uppercase tracking-wider mb-2">分离色调</div>
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: scheme.splitToning.highlights }} />
          <div className="flex-1 h-1 rounded bg-gradient-to-r" style={{ backgroundImage: `linear-gradient(to right, ${scheme.splitToning.shadows}, ${scheme.splitToning.highlights})` }} />
          <div className="w-4 h-4 rounded" style={{ backgroundColor: scheme.splitToning.shadows }} />
        </div>
      </div>
      <div className="space-y-2 pt-2">
        <button type="button" className="btn-primary w-full text-[13px]" disabled={extracting} onClick={async () => { setExtracting(true); try { const preset = await ipc('extract:fromReference', tasteRef.regularUrl); window.alert(`已生成滤镜「${preset.name}」`) } catch (err) { window.alert(`风格提取失败：${(err as Error).message}`) } finally { setExtracting(false) } }}>
          {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          {extracting ? '正在提取...' : '提取为滤镜'}
        </button>
        <button type="button" className="btn-ghost w-full text-[12px]" onClick={() => { const key = 'grainmark:taste-favorites'; const favs: string[] = JSON.parse(localStorage.getItem(key) ?? '[]'); if (!favs.includes(tasteRef.id)) { favs.push(tasteRef.id); localStorage.setItem(key, JSON.stringify(favs)); window.alert(`已收藏「${scheme.name}」`) } else { window.alert('已在收藏中') } }}>
          <Bookmark className="w-3.5 h-3.5" />
          收藏
        </button>
      </div>
    </div>
  )
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-8 h-8 rounded-lg border border-white/10 shadow-sm" style={{ backgroundColor: color }} />
      <span className="text-[9px] text-fg-3">{label}</span>
      <span className="text-[8px] text-fg-3/60 font-mono">{color}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-0 rounded-lg p-2">
      <div className="text-[9px] text-fg-3 uppercase">{label}</div>
      <div className="text-[13px] text-fg-1 font-medium font-mono">{value}</div>
    </div>
  )
}
