/**
 * Editor — 单图编辑器
 *
 * 卤化银风格：
 *  - 顶部 ScoreBar（评分条，P4 接入真实数据）
 *  - 左侧画布 + EXIF 金属条
 *  - 右侧滤镜列表（带 popularity 标识）
 */
import { Download, Redo2, Save, SplitSquareHorizontal, Undo2, Wand2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Histogram, ScoreBar, ValueBadge, cn } from '../design'
import type { HistogramData } from '../design'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'

export default function Editor() {
  const { photoId } = useParams()
  const photos = useAppStore((s) => s.photos)
  const filters = useAppStore((s) => s.filters)
  const activeFilterId = useAppStore((s) => s.activeFilterId)
  const setActiveFilter = useAppStore((s) => s.setActiveFilter)

  const photo = useMemo(() => photos.find((p) => p.id === photoId) ?? photos[0], [photos, photoId])

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)

  useEffect(() => {
    if (!photo) return
    let alive = true
    setLoading(true)
    ipc('preview:render', photo.path, showOriginal ? null : activeFilterId, undefined)
      .then((url) => {
        if (alive) setPreviewUrl(url)
      })
      .catch((err) => console.error('[preview]', err))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [photo, activeFilterId, showOriginal])

  if (!photo) {
    return (
      <div className="h-full flex items-center justify-center text-fg-3 text-sm">请先到「图库」导入照片</div>
    )
  }

  const activeFilter = filters.find((f) => f.id === activeFilterId)
  // P4 会从 IPC 拉到真实直方图；P2 用空占位
  const histogramData: HistogramData | null = null

  return (
    <div className="h-full flex animate-fade-in">
      {/* Canvas Column */}
      <section className="flex-1 flex flex-col min-w-0 bg-bg-0">
        {/* 顶部工具条 */}
        <div className="h-12 border-b border-fg-4/50 flex items-center px-4 gap-2">
          <div className="text-sm font-medium truncate flex-1 text-fg-1">{photo.name}</div>
          <button type="button" className="btn-ghost btn-xs" title="撤销 (⌘Z)">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" className="btn-ghost btn-xs" title="重做">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={() => setShowOriginal(true)}
            onMouseUp={() => setShowOriginal(false)}
            onMouseLeave={() => setShowOriginal(false)}
            className="btn-ghost btn-xs"
            title="按住查看原图"
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
          </button>
          <div className="divider-metal-v mx-1" />
          <button type="button" className="btn-secondary btn-xs">
            <Save className="w-3.5 h-3.5" />
            保存预设
          </button>
          <button type="button" className="btn-primary btn-xs">
            <Download className="w-3.5 h-3.5" />
            导出
          </button>
        </div>

        {/* ScoreBar 占位 */}
        <div className="px-4 pt-3">
          <ScoreBar score={null} onSwitchRubric={() => {}} />
        </div>

        {/* 画布 */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
          <div className="relative max-w-full max-h-full">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="preview"
                className="max-w-full max-h-[calc(100vh-240px)] object-contain rounded-md shadow-soft-lg"
              />
            ) : (
              <div className="w-[600px] h-[400px] bg-bg-1 rounded-md flex items-center justify-center text-fg-3 text-sm font-mono">
                rendering…
              </div>
            )}
            {loading && (
              <div className="absolute top-3 right-3">
                <ValueBadge value="RENDERING" variant="muted" size="sm" />
              </div>
            )}
            {showOriginal && (
              <div className="absolute top-3 left-3">
                <ValueBadge value="ORIGINAL" variant="amber" size="sm" />
              </div>
            )}
          </div>
        </div>

        {/* EXIF 金属条 */}
        <div className="h-12 border-t border-fg-4/50 px-4 flex items-center gap-3 text-xs">
          <ExifItem label="CAM" value={photo.exif.model ?? '—'} />
          <span className="divider-metal-v h-4" />
          <ExifItem label="LENS" value={photo.exif.lensModel ?? '—'} />
          <span className="divider-metal-v h-4" />
          <ExifItem label="F" value={photo.exif.fNumber ? `f/${photo.exif.fNumber}` : '—'} />
          <ExifItem label="SS" value={photo.exif.exposureTime ?? '—'} />
          <ExifItem label="ISO" value={photo.exif.iso ? String(photo.exif.iso) : '—'} />
          <ExifItem label="FL" value={photo.exif.focalLength ? `${photo.exif.focalLength}mm` : '—'} />
          <span className="ml-auto font-numeric text-fg-3">
            {photo.width}×{photo.height}
          </span>
        </div>
      </section>

      {/* Right Panel */}
      <aside className="w-80 shrink-0 border-l border-fg-4/60 bg-bg-0 flex flex-col">
        <div className="h-12 border-b border-fg-4/50 flex items-center px-4">
          <Wand2 className="w-3.5 h-3.5 text-brand-amber mr-2" strokeWidth={2} />
          <span className="text-sm font-medium text-fg-1">滤镜</span>
          {activeFilter && (
            <span className="ml-auto text-xxs text-fg-3 font-mono truncate max-w-[140px]">
              {activeFilter.name}
            </span>
          )}
        </div>

        {/* 滤镜列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          <FilterRow name="原图" active={!activeFilterId} onClick={() => setActiveFilter(null)} />
          {filters.map((f) => (
            <FilterRow
              key={f.id}
              name={f.name}
              popularity={f.popularity}
              tags={f.tags}
              active={f.id === activeFilterId}
              onClick={() => setActiveFilter(f.id)}
            />
          ))}
        </div>

        {/* Histogram */}
        <div className="p-3 border-t border-fg-4/50">
          <div className="text-xxs text-fg-3 uppercase tracking-wider font-mono mb-1.5">Histogram</div>
          <Histogram data={histogramData} width={288} height={64} />
        </div>
      </aside>
    </div>
  )
}

function ExifItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-xxs text-fg-3 font-mono">{label}</span>
      <span className="font-numeric text-fg-1">{value}</span>
    </div>
  )
}

function FilterRow({
  name,
  popularity,
  tags,
  active,
  onClick,
}: {
  name: string
  popularity?: number
  tags?: string[]
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-md transition-all duration-fast',
        active
          ? 'bg-brand-amber/10 text-brand-amber border border-brand-amber/30'
          : 'text-fg-2 hover:text-fg-1 hover:bg-bg-1 border border-transparent',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium truncate">{name}</span>
        {popularity !== undefined && (
          <span className="text-xxs font-numeric text-fg-3 shrink-0 ml-2">♦ {popularity}</span>
        )}
      </div>
      {tags && tags.length > 0 && (
        <div className="text-xxs text-fg-3 font-mono mt-0.5 truncate">
          {tags
            .slice(0, 3)
            .map((t) => `#${t}`)
            .join('  ')}
        </div>
      )}
    </button>
  )
}
