/**
 * TasteReference — 口味参考集页面
 *
 * 功能：
 *   1. 按分类浏览预置优秀作品
 *   2. 点击作品查看提取的配色方案
 *   3. 将配色方案应用到当前照片
 *   4. 用户上传自定义参考图
 */
import { Palette, Plus, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TasteCategory, TasteReference as TasteRef } from '../../shared/types'
import { ipc } from '../lib/ipc'

export default function TasteReferencePage() {
  const [categories, setCategories] = useState<Array<{ id: TasteCategory; label: string }>>([])
  const [activeCategory, setActiveCategory] = useState<TasteCategory | 'all'>('all')
  const [presets, setPresets] = useState<TasteRef[]>([])
  const [selectedRef, setSelectedRef] = useState<TasteRef | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      ipc('taste:categories'),
      ipc('taste:presets'),
    ]).then(([cats, refs]) => {
      setCategories(cats as any)
      setPresets(refs as any)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filteredPresets =
    activeCategory === 'all' ? presets : presets.filter((r) => r.category === activeCategory)

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col gap-4">
      {/* 顶部标题 + 分类 Tab */}
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
            <TabButton
              key={c.id}
              active={activeCategory === c.id}
              onClick={() => setActiveCategory(c.id)}
            >
              {c.label}
            </TabButton>
          ))}
        </div>
        <button
          type="button"
          className="ml-auto btn-ghost text-[12px] flex items-center gap-1"
          title="上传自定义参考图"
        >
          <Plus className="w-3.5 h-3.5" />
          上传参考
        </button>
      </div>

      {/* 主体：左侧图片网格 + 右侧方案详情 */}
      <div className="flex-1 grid grid-cols-[1fr_320px] gap-4 min-h-0">
        {/* 图片网格 */}
        <div className="overflow-y-auto rounded-lg bg-bg-0 p-3">
          {loading ? (
            <div className="text-center text-fg-3 py-12">加载中...</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filteredPresets.map((ref) => (
                <button
                  key={ref.id}
                  type="button"
                  onClick={() => setSelectedRef(ref)}
                  className={`group relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${
                    selectedRef?.id === ref.id
                      ? 'border-brand-amber shadow-lg shadow-brand-amber/10'
                      : 'border-transparent hover:border-fg-3/20'
                  }`}
                >
                  {/* 基于色板的渐变背景（不依赖外部图片，避免 CSP 阻止） */}
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(135deg, ${ref.palette.dominant} 0%, ${ref.palette.secondary[0] ?? ref.palette.dominant} 40%, ${ref.palette.secondary[1] ?? ref.palette.accent} 70%, ${ref.palette.accent} 100%)` }}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
                    <div className="text-[10px] text-white/80 truncate">{ref.photographer}</div>
                    <div className="text-[9px] text-white/50 font-mono">{ref.scheme.name}</div>
                  </div>
                  {/* 色板预览小条 */}
                  <div className="absolute top-2 right-2 flex gap-0.5">
                    {[ref.palette.dominant, ...ref.palette.secondary.slice(0, 2)].map((c: string, i: number) => (
                      <div
                        key={i}
                        className="w-2.5 h-2.5 rounded-full border border-white/30"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右侧方案详情 */}
        <div className="card p-4 overflow-y-auto">
          {selectedRef ? (
            <SchemeDetail ref={selectedRef} />
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

/** 分类 Tab 按钮 */
function TabButton({
  active,
  onClick,
  children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
        active
          ? 'bg-brand-amber/15 text-brand-amber border border-brand-amber/30'
          : 'text-fg-3 hover:text-fg-2 hover:bg-bg-1 border border-transparent'
      }`}
    >
      {children}
    </button>
  )
}

/** 配色方案详情面板 */
function SchemeDetail({ ref }: { ref: TasteRef }) {
  const { palette, scheme } = ref

  return (
    <div className="space-y-5">
      {/* 预览色板 */}
      <div className="aspect-[4/3] rounded-lg overflow-hidden" style={{ background: `linear-gradient(135deg, ${ref.palette.dominant} 0%, ${ref.palette.secondary[0] ?? ref.palette.dominant} 35%, ${ref.palette.secondary[1] ?? ref.palette.accent} 65%, ${ref.palette.accent} 100%)` }}>
      </div>

      {/* 方案名称 */}
      <div>
        <div className="text-[14px] font-semibold text-fg-1">{scheme.name}</div>
        <div className="text-[11px] text-fg-3 mt-1">by {ref.photographer}</div>
      </div>

      {/* 色板 */}
      <div>
        <div className="text-[10px] text-fg-3 uppercase tracking-wider mb-2">提取色板</div>
        <div className="flex gap-2">
          <ColorSwatch color={palette.dominant} label="主色" />
          {palette.secondary.map((c: string, i: number) => (
            <ColorSwatch key={i} color={c} label={`辅${i + 1}`} />
          ))}
          <ColorSwatch color={palette.accent} label="强调" />
        </div>
      </div>

      {/* 数值指标 */}
      <div className="grid grid-cols-2 gap-3">
        <Metric label="色温" value={`${palette.temperature}K`} />
        <Metric label="饱和度" value={`${palette.saturation}%`} />
        <Metric label="明度" value={`${palette.brightness}%`} />
        <Metric label="对比度" value={`${palette.contrast}%`} />
      </div>

      {/* 分离色调预览 */}
      <div>
        <div className="text-[10px] text-fg-3 uppercase tracking-wider mb-2">分离色调</div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: scheme.splitToning.highlights }} />
            <span className="text-[11px] text-fg-3">高光</span>
          </div>
          <div className="flex-1 h-1 rounded bg-gradient-to-r" style={{ backgroundImage: `linear-gradient(to right, ${scheme.splitToning.shadows}, ${scheme.splitToning.highlights})` }} />
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: scheme.splitToning.shadows }} />
            <span className="text-[11px] text-fg-3">暗部</span>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="space-y-2 pt-2">
        <button type="button" className="btn-primary w-full text-[13px]">
          <Sparkles className="w-3.5 h-3.5" />
          应用到当前照片
        </button>
        <button type="button" className="btn-ghost w-full text-[12px]">
          保存到我的方案
        </button>
      </div>
    </div>
  )
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-8 h-8 rounded-lg border border-white/10 shadow-sm"
        style={{ backgroundColor: color }}
      />
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
