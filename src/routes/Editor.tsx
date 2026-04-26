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
import { memo, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AdjustmentsPanel } from '../components/AdjustmentsPanel'
import { Histogram, ScoreBar, ValueBadge, cn } from '../design'
import { type FilterGroup, groupAndSortFilters } from '../lib/filterOrder'
import { ipc } from '../lib/ipc'
import { useWebGLPreview } from '../lib/useWebGLPreview'
import { useAppStore } from '../stores/appStore'
import { hasDirtyEdits, useEditStore } from '../stores/editStore'

type RightPanelTab = 'filters' | 'adjust'

export default function Editor() {
  const { photoId } = useParams()
  // P0-6：精准 selector —— 只在"当前这张照片"或"第一张照片"真变时才重渲
  //   旧实现 useAppStore((s) => s.photos) 会让 Editor 订阅整个数组，
  //   Library 导入/删除别的照片都会导致 Editor 重渲染
  const photo = useAppStore((s) => s.photos.find((p) => p.id === photoId) ?? s.photos[0])
  const filters = useAppStore((s) => s.filters)
  const activeFilterId = useAppStore((s) => s.activeFilterId)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [rightTab, setRightTab] = useState<RightPanelTab>('filters')

  const activeFilter = filters.find((f) => f.id === activeFilterId)

  /**
   * 滤镜分组：
   *   1) 我的参考作品（extracted）  2) 我导入的滤镜（imported）  3) 社区与内置（community + builtin）
   * 每组内按 category 二级分组 → 同 category 按 popularity / updatedAt 降序。
   * 详见 src/lib/filterOrder.ts
   */
  const filterGroups = useMemo<FilterGroup[]>(() => groupAndSortFilters(filters), [filters])

  // ---- editStore 与 activeFilter 同步 ----
  const currentPipeline = useEditStore((s) => s.currentPipeline)
  const baselinePipeline = useEditStore((s) => s.baselinePipeline)
  const loadFromPreset = useEditStore((s) => s.loadFromPreset)
  const resetToBaseline = useEditStore((s) => s.resetToBaseline)
  const clearEdits = useEditStore((s) => s.clear)
  // 历史栈 actions & 可用状态（M4.3）
  const history = useEditStore((s) => s.history)
  const future = useEditStore((s) => s.future)
  const commitHistory = useEditStore((s) => s.commitHistory)
  const undo = useEditStore((s) => s.undo)
  const redo = useEditStore((s) => s.redo)
  const canUndoNow = history.length > 0
  const canRedoNow = future.length > 0

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

  // ⌘Z / ⌘⇧Z 快捷键（window-level capture，避免 Slider 等子组件 preventDefault 吞掉）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const grainPlatform = typeof window !== 'undefined' ? window.grain?.platform : undefined
      const isMac =
        grainPlatform !== undefined
          ? grainPlatform === 'darwin'
          : typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey
      if (!isCmdOrCtrl) return
      // 避开输入框（专业工具中 ⌘Z 在 input 里应该撤销输入，而非 Editor 操作）
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        e.stopPropagation()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [undo, redo])

  const dirty = hasDirtyEdits(currentPipeline, baselinePipeline)

  /** 重置到滤镜预设：先 commit 当前状态为历史（能撤回）再 reset，再 commit reset 后的状态 */
  const handleResetToBaseline = () => {
    commitHistory('重置前')
    resetToBaseline()
    commitHistory('重置到滤镜预设')
  }

  /**
   * 保存当前 pipeline 为"我的滤镜"（M4.4）
   *
   * 流程：
   *   1. 若 currentPipeline 为空 / 与 baseline 完全一致 → 给出提示不保存
   *   2. window.prompt 让用户输入名称（默认"我的滤镜 YYYY-MM-DD HH:mm"）
   *   3. 生成 id = user-<timestamp>-<random>，source='imported'，category='custom'
   *   4. IPC filter:save → refreshFilters → setActiveFilter(newId) 立刻切过去
   *   5. filterOrder 会把它归到"我导入的滤镜"组并显示在 Editor 右栏顶部
   */
  const refreshFilters = useAppStore((s) => s.refreshFilters)
  const handleSavePreset = async () => {
    if (!currentPipeline || !hasDirtyEdits(currentPipeline, baselinePipeline ?? {})) {
      // 与基准完全一致没必要保存（用户通常想保存"修改过的参数组合"）
      window.alert('当前参数与起点完全一致，无需保存')
      return
    }
    const defaultName = `我的滤镜 ${new Date().toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`
    const name = window.prompt('为这个滤镜命名：', defaultName)
    if (!name) return // 用户取消
    const trimmed = name.trim().slice(0, 128)
    if (!trimmed) return

    const now = Date.now()
    // id 满足 FilterIdSchema 正则 ^[a-zA-Z0-9_\-:.]+$
    const id = `user-${now}-${Math.random().toString(36).slice(2, 8)}`
    const preset = {
      id,
      name: trimmed,
      category: 'custom' as const,
      author: 'user',
      version: '1.0',
      popularity: 0,
      source: 'imported' as const,
      description: `从照片 ${photo?.name ?? ''} 的当前调整保存`,
      tags: ['my'],
      pipeline: JSON.parse(JSON.stringify(currentPipeline)) as typeof currentPipeline,
      createdAt: now,
      updatedAt: now,
    }
    try {
      await ipc('filter:save', preset)
      await refreshFilters()
      useAppStore.getState().setActiveFilter(id)
      // 新滤镜作为新 baseline，历史也重置（切换滤镜的标准行为由 loadFromPreset 承担）
    } catch (err) {
      console.error('[filter:save]', err)
      window.alert(`保存失败：${(err as Error).message}`)
    }
  }

  // ---- WebGL 预览：按 showOriginal 短路 pipeline ----
  const renderPipeline = showOriginal ? null : currentPipeline
  const webgl = useWebGLPreview(previewUrl, renderPipeline)

  // CPU 兜底：下面情况都走 IPC 主进程应用 pipeline（data URL 回来已烘焙滤镜）：
  //   1. webgl.needsCpuFallback：LUT 纹理解析失败（历史兜底）
  //   2. webgl.status === 'error'：WebGL 初始化 / 纹理上传 / 着色器编译任一阶段挂掉
  //   3. webgl.status === 'lost'：GPU context lost 尚未恢复
  //   4. webgl.status === 'unsupported'：老机器 / 驱动不支持 WebGL 2
  // 'idle' 是瞬时态（WebGL 初始化到 sourceUrl 载入触发 loading 之间的窗口，通常 < 100ms），
  // 为避免"idle CPU → ready GPU"瞬切带来的像素跳变，idle 不触发兜底；
  // 'loading' 同理（canvas 已显示上一次的结果，短暂 loading 期间用户看到旧帧是可接受的）
  const webglBroken = webgl.status === 'error' || webgl.status === 'lost' || webgl.status === 'unsupported'
  const needsCpuFallback = !showOriginal && (webgl.needsCpuFallback || webglBroken)
  const ipcFilterId = showOriginal ? null : needsCpuFallback ? activeFilterId : null

  const photoPath = photo?.path

  /**
   * CPU 兜底路径下 IPC pipelineOverride 的 debounce key。
   *
   * 背景：
   *   - GPU 路径（webgl.status='ready' 且无 needsCpuFallback）：previewUrl 只是原图的
   *     基准 JPEG，滤镜/滑块由 WebGL 实时叠加 → pipelineOverride 无需传
   *   - CPU 兜底路径（webgl 挂 / lost / LUT 失败）：previewUrl 需要是"已烘焙 pipeline"
   *     的成图，拖滑块时必须带上 currentPipeline 让主进程重新 sharp 处理
   *
   * 高频调用保护：滑块拖动每帧触发 setTone → currentPipeline 每帧新引用 → 若直接
   *   把 currentPipeline 放进 useEffect deps，会每帧发 IPC（sharp 24MP 处理 400ms+）
   *   → 完全卡死。
   *   → 改用 JSON.stringify 哈希作 key + 150ms debounce：滑块松手后才重拉一次，
   *     拖动过程用上一次的 previewUrl 先顶着（视觉上接受"松手后更新"延迟）
   */
  const pipelineKey = useMemo(() => {
    if (!needsCpuFallback) return null
    // CPU 兜底：使用 currentPipeline 作 key；JSON.stringify 对纯数据结构稳定
    try {
      return JSON.stringify(currentPipeline ?? null)
    } catch {
      return null
    }
  }, [needsCpuFallback, currentPipeline])

  // debounce pipelineKey 150ms，只在静止态触发 IPC 重拉
  const [debouncedPipelineKey, setDebouncedPipelineKey] = useState<string | null>(null)
  useEffect(() => {
    if (pipelineKey === debouncedPipelineKey) return
    const t = window.setTimeout(() => setDebouncedPipelineKey(pipelineKey), 150)
    return () => window.clearTimeout(t)
  }, [pipelineKey, debouncedPipelineKey])

  // 拉取 previewUrl：
  //   - GPU 正常路径：override=undefined，主进程只根据 photoPath + filterId 给"基准原图"
  //   - CPU 兜底：override=currentPipeline，主进程烘焙滤镜到 data URL
  //   - currentPipeline / needsCpuFallback 经 debouncedPipelineKey 间接依赖，避免每帧 IPC
  //
  // P0-6：切滤镜 / 切照片只拉一次 preview；拖滑块（GPU 正常路径）不会触发本 effect，
  //   因为 pipelineKey 在 !needsCpuFallback 时恒为 null，debouncedPipelineKey 不变化。
  //   Guard：显式在 effect 内再检查一次，防御 webgl.status 抖动时的误触发。
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentPipeline/needsCpuFallback 已由 debouncedPipelineKey 代理
  useEffect(() => {
    if (!photoPath) return
    let alive = true
    setLoading(true)
    setPreviewError(null)
    // 再次确认：GPU 正常路径下不传 pipelineOverride（避免主进程 sharp 重做 pipeline）
    const override = needsCpuFallback ? (currentPipeline ?? undefined) : undefined
    ipc('preview:render', photoPath, ipcFilterId, override)
      .then((url) => {
        if (alive) {
          setPreviewUrl(url)
          setPreviewError(null)
        }
      })
      .catch((err) => {
        // 不吞错：卡 "rendering..." 是最差体验。把错误显示到画布上让用户能看到。
        console.error('[preview]', err)
        if (alive) {
          setPreviewUrl(null)
          setPreviewError((err as Error).message ?? String(err))
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [photoPath, ipcFilterId, debouncedPipelineKey])

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
          <button
            type="button"
            onClick={undo}
            disabled={!canUndoNow}
            className={cn('btn-ghost btn-xs', !canUndoNow && 'opacity-30 cursor-not-allowed')}
            title={`撤销 (⌘Z) · ${history.length} 步可撤`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedoNow}
            className={cn('btn-ghost btn-xs', !canRedoNow && 'opacity-30 cursor-not-allowed')}
            title={`重做 (⌘⇧Z) · ${future.length} 步可重做`}
          >
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
              onClick={handleResetToBaseline}
              className="btn-ghost btn-xs"
              title="重置到滤镜预设"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="divider-metal-v mx-1" />
          <button
            type="button"
            onClick={handleSavePreset}
            disabled={!dirty}
            className={cn('btn-secondary btn-xs', !dirty && 'opacity-40 cursor-not-allowed')}
            title={dirty ? '把当前调整保存为"我的滤镜"' : '当前参数与起点一致，无需保存'}
          >
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
            {!previewUrl && !previewError && (
              <div className="w-[600px] h-[400px] bg-bg-1 rounded-md flex items-center justify-center text-fg-3 text-sm font-mono">
                rendering…
              </div>
            )}
            {!previewUrl && previewError && (
              <div className="w-[600px] h-[400px] bg-bg-1 rounded-md flex flex-col items-center justify-center gap-2 p-6 text-center">
                <div className="text-sem-error text-sm font-medium">预览渲染失败</div>
                <div className="text-xxs text-fg-3 font-mono break-all max-w-[520px]">{previewError}</div>
                <div className="text-xxs text-fg-4 mt-2">
                  请尝试在"图库"中移除并重新导入此照片（重新授权目录访问）。
                </div>
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
            {/* Dev 诊断条：webgl 状态 + pipeline 通道数 + 兜底原因 + Frame budget；仅 import.meta.env.DEV 显示 */}
            {import.meta.env.DEV && (
              <div className="absolute top-3 left-3 text-xxs font-mono bg-black/60 text-fg-2 px-2 py-1 rounded pointer-events-none space-y-0.5">
                <div>
                  gl: {webgl.status}
                  {webgl.error ? ` (${webgl.error.slice(0, 40)})` : ''}
                </div>
                <div>
                  pipeline: {currentPipeline ? countPipelineChannels(currentPipeline) : 0} ch ·{' '}
                  {needsCpuFallback ? 'CPU' : 'GPU'}
                </div>
                {webgl.perf && (
                  <div>
                    frame: {webgl.perf.totalMs.toFixed(1)}ms · run {webgl.perf.pipelineRunMs.toFixed(1)} · rd{' '}
                    {webgl.perf.readPixelsMs.toFixed(1)} · hist {webgl.perf.histogramMs.toFixed(1)}
                  </div>
                )}
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
            <div className="p-3 space-y-3">
              {/* 原图 —— 永远在最顶部，与分组解耦 */}
              <FilterRow name="原图" active={!activeFilterId} filterId={null} />

              {/* 三层分组（extracted → imported → community），空组隐藏 */}
              {filterGroups
                .filter((g) => g.total > 0)
                .map((g) => (
                  <section key={g.meta.key} className="space-y-1.5">
                    {/* 组标题 */}
                    <header className="flex items-baseline gap-2 px-1 pt-1">
                      <span className="text-xxs uppercase tracking-[0.16em] font-mono text-fg-2">
                        {g.meta.title}
                      </span>
                      <span className="text-xxs font-numeric text-fg-4">{g.total}</span>
                      <span className="text-xxs text-fg-4 truncate hidden xl:inline">
                        · {g.meta.subtitle}
                      </span>
                    </header>

                    {/* 二级 category 分组 */}
                    {g.subgroups.map((sub) => (
                      <div key={`${g.meta.key}:${sub.category}`} className="space-y-1.5">
                        {/* category 小标签（同组多 category 时才显示，单一时省略减少噪音） */}
                        {g.subgroups.length > 1 && (
                          <div className="px-1">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-white/[0.04] text-xxs font-mono text-fg-3 tracking-wide">
                              {sub.label}
                            </span>
                          </div>
                        )}
                        {sub.filters.map((f) => (
                          <FilterRow
                            key={f.id}
                            name={f.name}
                            popularity={f.popularity}
                            tags={f.tags}
                            active={f.id === activeFilterId}
                            filterId={f.id}
                          />
                        ))}
                      </div>
                    ))}
                  </section>
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

/** dev 诊断条用：统计 pipeline 里实际激活的通道数（粗略指标，不强求精确） */
function countPipelineChannels(p: import('../../shared/types').FilterPipeline): number {
  let n = 0
  if (p.whiteBalance) n++
  if (p.tone) n++
  if (p.curves) n++
  if (p.hsl) n++
  if (p.colorGrading) n++
  if (p.clarity || p.saturation || p.vibrance) n++
  if (p.lut) n++
  if (p.halation) n++
  if (p.grain) n++
  if (p.vignette) n++
  return n
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

function FilterRow(props: {
  name: string
  popularity?: number
  tags?: string[]
  active: boolean
  filterId: string | null
}) {
  return <FilterRowMemo {...props} />
}

/**
 * P0-6：memo 稳定列表项，避免拖滑块导致整张 filter 列表重渲
 * （Editor 订阅 currentPipeline，每次 setTone 都会让 Editor re-render）
 *
 * 接口：传 filterId 而不是 onClick，组件内部从 store.getState 拿 setter。
 * 这样 props 全是稳定值（string/number/boolean/string[]），memo shallow compare 直接剪枝。
 */
const FilterRowMemo = memo(function FilterRowInner({
  name,
  popularity,
  tags,
  active,
  filterId,
}: {
  name: string
  popularity?: number
  tags?: string[]
  active: boolean
  filterId: string | null
}) {
  const handleClick = () => useAppStore.getState().setActiveFilter(filterId)
  return (
    <button
      type="button"
      onClick={handleClick}
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
})
