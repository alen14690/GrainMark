import { Download, Redo2, Save, SplitSquareHorizontal, Undo2, Wand2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
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
    return <div className="h-full flex items-center justify-center text-ink-500">请先到「图库」导入照片</div>
  }

  const activeFilter = filters.find((f) => f.id === activeFilterId)

  return (
    <div className="h-full flex animate-fade-in">
      {/* Canvas */}
      <section className="flex-1 flex flex-col min-w-0 bg-ink-950">
        <div className="h-12 border-b border-ink-900 flex items-center px-4 gap-2">
          <div className="text-[13px] font-medium truncate flex-1">{photo.name}</div>
          <button className="btn-ghost py-1.5 px-2 text-[12px]" title="撤销">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button className="btn-ghost py-1.5 px-2 text-[12px]" title="重做">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onMouseDown={() => setShowOriginal(true)}
            onMouseUp={() => setShowOriginal(false)}
            onMouseLeave={() => setShowOriginal(false)}
            className="btn-ghost py-1.5 px-2 text-[12px]"
            title="按住查看原图 (\\)"
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-5 bg-ink-800 mx-1" />
          <button className="btn-secondary py-1.5 px-3 text-[12px]">
            <Save className="w-3.5 h-3.5" />
            保存预设
          </button>
          <button className="btn-primary py-1.5 px-3 text-[12px]">
            <Download className="w-3.5 h-3.5" />
            导出
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
          <div className="relative max-w-full max-h-full">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="preview"
                className="max-w-full max-h-[calc(100vh-200px)] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <div className="w-[600px] h-[400px] bg-ink-900 rounded-lg flex items-center justify-center text-ink-500 text-sm">
                加载预览...
              </div>
            )}
            {loading && (
              <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/60 text-[11px] text-ink-300 backdrop-blur">
                渲染中...
              </div>
            )}
            {showOriginal && <div className="absolute top-3 left-3 pill-accent">原图</div>}
          </div>
        </div>

        {/* EXIF bar */}
        <div className="h-10 border-t border-ink-900 px-4 flex items-center gap-4 text-[11px] text-ink-400 font-mono">
          <span>{photo.exif.model ?? '—'}</span>
          <span className="text-ink-700">|</span>
          <span>{photo.exif.lensModel ?? '—'}</span>
          <span className="text-ink-700">|</span>
          <span>{photo.exif.focalLength ? `${photo.exif.focalLength}mm` : '—'}</span>
          <span>{photo.exif.fNumber ? `f/${photo.exif.fNumber}` : '—'}</span>
          <span>{photo.exif.exposureTime ?? '—'}</span>
          <span>{photo.exif.iso ? `ISO ${photo.exif.iso}` : '—'}</span>
          <span className="ml-auto">
            {photo.width}×{photo.height}
          </span>
        </div>
      </section>

      {/* Right panel */}
      <aside className="w-80 shrink-0 border-l border-ink-900 bg-ink-950/80 flex flex-col">
        <div className="h-12 border-b border-ink-900 flex items-center px-4">
          <Wand2 className="w-3.5 h-3.5 text-accent-400 mr-2" />
          <span className="text-[13px] font-medium">滤镜</span>
          {activeFilter && (
            <span className="ml-auto text-[11px] text-ink-500 font-mono">{activeFilter.name}</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          <button
            onClick={() => setActiveFilter(null)}
            className={`w-full text-left px-3 py-2 rounded-lg text-[12.5px] transition-all ${
              !activeFilterId
                ? 'bg-accent-500/15 text-accent-400 border border-accent-500/30'
                : 'text-ink-400 hover:bg-ink-900'
            }`}
          >
            原图
          </button>
          {filters.map((f) => {
            const active = f.id === activeFilterId
            return (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                  active
                    ? 'bg-accent-500/15 text-accent-400 border border-accent-500/30'
                    : 'text-ink-300 hover:bg-ink-900 hover:text-ink-100 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium truncate">{f.name}</span>
                  <span className="text-[10px] font-mono text-ink-500 shrink-0 ml-2">♦ {f.popularity}</span>
                </div>
                <div className="text-[10.5px] text-ink-500 mt-0.5 truncate">
                  {f.tags?.slice(0, 3).join(' · ') || f.category}
                </div>
              </button>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
