/**
 * Editor — 单图编辑器
 *
 * 架构（M2）：
 *   - previewUrl  : IPC 拉到的原图预览（1600 长边 JPEG）
 *   - pipeline    : editStore.currentPipeline（切滤镜时从 preset 克隆，手动滑块叠加）
 *   - WebGL 渲染 : useWebGLPreview，完整 10-shader GPU pipeline + 实时直方图
 *   - 右栏 Tab   : 滤镜列表 | 参数调整（滑块）
 */
import { Download, Redo2, RotateCcw, Save, Sliders, SplitSquareHorizontal, Undo2, Wand2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AdjustmentsPanel } from '../components/AdjustmentsPanel'
import { Histogram, ScoreBar, ValueBadge, cn } from '../design'
import { ipc } from '../lib/ipc'
import { useWebGLPreview } from '../lib/useWebGLPreview'
import { useAppStore } from '../stores/appStore'
import { hasDirtyEdits, useEditStore } from '../stores/editStore'

type RightPanelTab = 'filters' | 'adjust'

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
  const [rightTab, setRightTab] = useState<RightPanelTab>('filters')

  const activeFilter = filters.find((f) => f.id === activeFilterId)

  // ---- editStore 与 activeFilter 同步 ----
  const currentPipeline = useEditStore((s) => s.currentPipeline)
  const baselinePipeline = useEditStore((s) => s.baselinePipeline)
  const loadFromPreset = useEditStore((s) => s.loadFromPreset)
  const resetToBaseline = useEditStore((s) => s.resetToBaseline)
  const clearEdits = useEditStore((s) => s.clear)

  // 切换 filter → 重置编辑态
  useEffect(() => {
    loadFromPreset(activeFilter ?? null)
  }, [activeFilter, loadFromPreset])

  // 离开 Editor 清空编辑态
  useEffect(() => {
    return () => {
      clearEdits()
    }
  }, [clearEdits])

  const dirty = hasDirtyEdits(currentPipeline, baselinePipeline)

  // ---- WebGL 预览：按 showOriginal 短路 pipeline ----
  const renderPipeline = showOriginal ? null : currentPipeline
  const webgl = useWebGLPreview(previewUrl, renderPipeline)

  // CPU 兜底：正常 Pass 3b-2 后只剩 LUT 解析失败触发
  const needsCpuFallback = !showOriginal && webgl.needsCpuFallback
  const ipcFilterId = showOriginal ? null : needsCpuFallback ? activeFilterId : null

  const photoPath = photo?.path
  useEffect(() => {
    if (!photoPath) return
    let alive = true
    setLoading(true)
    ipc('preview:render', photoPath, ipcFilterId, undefined)
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
  }, [photoPath, ipcFilterId])

  if (!photo) {
    return (
      <div className="h-full flex items-center justify-center text-fg-3 text-sm">请先到「图库」导入照片</div>
    )
  }

  const useWebglCanvas = !needsCpuFallback && (webgl.status === 'ready' || webgl.status === 'loading')
  const showImgFallback = !useWebglCanvas && previewUrl
  const canvasStyle = { maxWidth: '100%', maxHeight: 'calc(100vh - 240px)' } as const

  return (
    <div className="h-full flex animate-fade-in">
      {/* Canvas Column */}
      <section className="flex-1 flex flex-col min-w-0 bg-bg-0">
        {/* 顶部工具条 */}
        <div className="h-12 border-b border-fg-4/50 flex items-center px-4 gap-2">
          <div className="text-sm font-medium truncate flex-1 text-fg-1">{photo.name}</div>
          {dirty && <ValueBadge value="EDITED" variant="amber" size="sm" className="!ml-0 shrink-0" />}
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
          {dirty && (
            <button
              type="button"
              onClick={resetToBaseline}
              className="btn-ghost btn-xs"
              title="重置到滤镜预设"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
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
            {/* WebGL 画布（主路径） */}
            <canvas
              ref={webgl.canvasRef}
              className={cn('rounded-md shadow-soft-lg object-contain', useWebglCanvas ? 'block' : 'hidden')}
              style={canvasStyle}
            />
            {/* IPC base64 兜底（WebGL 初始化前 / 不可用时 / CPU 路径） */}
            {showImgFallback && (
              <img
                src={previewUrl!}
                alt="preview"
                className="max-w-full max-h-[calc(100vh-240px)] object-contain rounded-md shadow-soft-lg"
              />
            )}
            {!previewUrl && (
              <div className="w-[600px] h-[400px] bg-bg-1 rounded-md flex items-center justify-center text-fg-3 text-sm font-mono">
                rendering…
              </div>
            )}
            {(loading || webgl.status === 'loading') && (
              <div className="absolute top-3 right-3">
                <ValueBadge value="RENDERING" variant="muted" size="sm" />
              </div>
            )}
            {showOriginal && (
              <div className="absolute top-3 left-3">
                <ValueBadge value="ORIGINAL" variant="amber" size="sm" />
              </div>
            )}
            {webgl.status === 'ready' && webgl.lastDurationMs !== undefined && !needsCpuFallback && (
              <div className="absolute bottom-3 right-3">
                <ValueBadge value={`GPU · ${webgl.lastDurationMs.toFixed(1)}ms`} variant="muted" size="sm" />
              </div>
            )}
            {needsCpuFallback && (
              <div className="absolute bottom-3 right-3">
                <ValueBadge value="CPU" variant="muted" size="sm" />
              </div>
            )}
            {webgl.status === 'unsupported' && (
              <div className="absolute bottom-3 right-3">
                <ValueBadge value="CPU FALLBACK" variant="muted" size="sm" />
              </div>
            )}
            {webgl.status === 'error' && webgl.error && (
              <div className="absolute bottom-3 left-3 text-xxs text-sem-error font-mono">
                GL: {webgl.error}
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
        {/* Tab 切换 */}
        <div className="h-12 border-b border-fg-4/50 flex items-stretch">
          <TabButton
            active={rightTab === 'filters'}
            onClick={() => setRightTab('filters')}
            icon={<Wand2 className="w-3.5 h-3.5" strokeWidth={2} />}
            label="滤镜"
            sub={activeFilter?.name}
          />
          <TabButton
            active={rightTab === 'adjust'}
            onClick={() => setRightTab('adjust')}
            icon={<Sliders className="w-3.5 h-3.5" strokeWidth={2} />}
            label="调整"
            sub={dirty ? '已修改' : undefined}
          />
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto">
          {rightTab === 'filters' ? (
            <div className="p-3 space-y-1.5">
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
          ) : (
            <AdjustmentsPanel />
          )}
        </div>

        {/* Histogram — 实时从 WebGL readPixels 采样 */}
        <div className="p-3 border-t border-fg-4/50">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xxs text-fg-3 uppercase tracking-wider font-mono">Histogram</div>
            {webgl.histogram && (
              <div className="text-xxs text-fg-3 font-mono">{webgl.histogram.total.toLocaleString()} px</div>
            )}
          </div>
          <Histogram data={webgl.histogram} width={288} height={64} />
        </div>
      </aside>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  sub?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center justify-center gap-2 px-3 transition-all duration-fast border-b-2',
        active
          ? 'border-brand-violet text-fg-1 bg-white/[0.03]'
          : 'border-transparent text-fg-3 hover:text-fg-2',
      )}
    >
      <span className={active ? 'text-brand-violet' : 'text-fg-3'}>{icon}</span>
      <div className="flex flex-col items-start leading-tight">
        <span className="text-sm font-medium">{label}</span>
        {sub && <span className="text-xxs font-mono text-fg-3 truncate max-w-[90px]">{sub}</span>}
      </div>
    </button>
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
          ? 'bg-brand-violet/10 text-brand-violet border border-brand-violet/30'
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
