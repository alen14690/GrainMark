/**
 * Editor — 单图编辑器
 *
 * 架构（M2）：
 *   - previewUrl  : IPC 拉到的原图预览（1600 长边 JPEG）
 *   - pipeline    : editStore.currentPipeline（切滤镜时从 preset 克隆，手动滑块叠加）
 *   - WebGL 渲染 : useWebGLPreview，完整 10-shader GPU pipeline + 实时直方图
 *   - 右栏 Tab   : 滤镜列表 | 参数调整（滑块）
 */
import {
  Crop,
  Download,
  Eye,
  FlipHorizontal2,
  FlipVertical2,
  Frame,
  Maximize,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Sliders,
  Sparkles,
  SplitSquareHorizontal,
  Undo2,
  Wand2,
  ZoomIn,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import AIAdvisorDialog from '../components/AIAdvisorDialog'
import { AdjustmentsPanel } from '../components/AdjustmentsPanel'
import CropOverlay from '../components/CropOverlay'
import { EditorFramePanel } from '../components/frame/EditorFramePanel'
import { FramePreviewHost } from '../components/frame/FramePreviewHost'
import { Histogram, ScoreBar, ValueBadge, cn } from '../design'
import { type FilterGroup, groupAndSortFilters } from '../lib/filterOrder'
import { ipc } from '../lib/ipc'
import { useWebGLPreview } from '../lib/useWebGLPreview'
import { useAppStore } from '../stores/appStore'
import { hasDirtyEdits, useEditStore } from '../stores/editStore'
import { usePerfStore } from '../stores/perfStore'

type RightPanelTab = 'filters' | 'adjust' | 'frame'

// ---- 草稿持久化（P0：编辑状态不丢失）----
const DRAFT_PREFIX = 'grainmark:draft:'
const DRAFT_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000 // 7 天过期

interface DraftData {
  pipeline: import('../../shared/types').FilterPipeline | null
  frameConfig: import('../stores/editStore').FrameConfig | null
  filterId: string | null
  timestamp: number
}

function saveDraft(photoId: string, data: DraftData): void {
  try {
    localStorage.setItem(DRAFT_PREFIX + photoId, JSON.stringify(data))
  } catch {
    /* 存满了就算了 */
  }
}

function loadDraft(photoId: string): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + photoId)
    if (!raw) return null
    const data = JSON.parse(raw) as DraftData
    if (Date.now() - data.timestamp > DRAFT_EXPIRE_MS) {
      localStorage.removeItem(DRAFT_PREFIX + photoId)
      return null
    }
    return data
  } catch {
    return null
  }
}

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
  const [showAIAdvisor, setShowAIAdvisor] = useState(false)
  const [rightTab, setRightTab] = useState<RightPanelTab>('filters')
  /** 持久 Before/After 切换（区别于 showOriginal 的 press-to-hold） */
  const [compareMode, setCompareMode] = useState(false)
  /** Viewport transform（本地状态，不需要 undo） */
  const [viewport, setViewport] = useState({ zoom: 1, panX: 0, panY: 0 })
  /** 拖拽平移状态 */
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  /** 裁切模式 */
  const [cropMode, setCropMode] = useState(false)
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  // 边框/水印从 editStore 统一读取（Single Source of Truth）
  const frameConfig = useEditStore((s) => s.frameConfig)
  const watermarkConfig = useEditStore((s) => s.watermarkConfig)
  const [frameStyles, setFrameStyles] = useState<import('../../shared/types').FrameStyle[]>([])

  // 加载边框风格列表（纯 UI 数据缓存）
  useEffect(() => {
    ipc('frame:templates')
      .then((list) => setFrameStyles(list))
      .catch(() => {})
  }, [])

  const selectedFrameStyle = frameStyles.find((s) => s.id === frameConfig?.styleId) ?? null

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
  /** 图片旋转 & 翻转（从 pipeline 读取，支持 undo） */
  const rotation = currentPipeline?.transform?.rotation ?? 0
  const flipH = currentPipeline?.transform?.flipH ?? false
  const flipV = currentPipeline?.transform?.flipV ?? false
  const baselinePipeline = useEditStore((s) => s.baselinePipeline)
  const dirtyFlag = useEditStore((s) => s._dirty)
  const loadFromPreset = useEditStore((s) => s.loadFromPreset)
  const resetToBaseline = useEditStore((s) => s.resetToBaseline)
  const clearEdits = useEditStore((s) => s.clear)
  // 历史栈 actions & 可用状态（M4.3）
  const canUndoNow = useEditStore((s) => s.history.length > 0)
  const canRedoNow = useEditStore((s) => s.future.length > 0)
  const commitHistory = useEditStore((s) => s.commitHistory)
  const setCrop = useEditStore((s) => s.setCrop)
  const setTransform = useEditStore((s) => s.setTransform)
  const undo = useEditStore((s) => s.undo)
  const redo = useEditStore((s) => s.redo)

  // 切换 filter → 重置编辑态
  useEffect(() => {
    loadFromPreset(activeFilter ?? null)
  }, [activeFilter, loadFromPreset])

  // 草稿恢复：进入 Editor 时检查 localStorage 是否有该照片的未完成编辑
  const draftRestoredRef = useRef(false)
  useEffect(() => {
    if (!photoId || draftRestoredRef.current) return
    const draft = loadDraft(photoId)
    if (draft?.pipeline) {
      // 恢复草稿 pipeline（覆盖 loadFromPreset 的结果）
      useEditStore.setState((s) => {
        s.currentPipeline = draft.pipeline
        s._dirty = true
      })
      draftRestoredRef.current = true
    }
  }, [photoId])

  // 草稿自动保存：pipeline 变化时 debounce 存入 localStorage
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!photoId || !currentPipeline) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveDraft(photoId, {
        pipeline: currentPipeline,
        frameConfig: frameConfig ?? null,
        filterId: activeFilterId ?? null,
        timestamp: Date.now(),
      })
    }, 2000) // 2 秒 debounce
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [photoId, currentPipeline, frameConfig, activeFilterId])

  // 离开 Editor 时不清空编辑态（草稿已保存），只清理内存中的 history/future 释放内存
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

  // 额外快捷键：\ Before/After、⌘0 Fit、⌘1 100%、R 旋转、H 翻转
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
        return

      const grainPlatform = typeof window !== 'undefined' ? window.grain?.platform : undefined
      const isMac =
        grainPlatform !== undefined
          ? grainPlatform === 'darwin'
          : /Mac|iPod|iPhone|iPad/.test(navigator.platform)
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey

      // \ = Before/After toggle
      if (e.key === '\\' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setCompareMode((m) => !m)
        return
      }
      // ⌘0 = Fit to window
      if (isCmdOrCtrl && e.key === '0') {
        e.preventDefault()
        setViewport({ zoom: 1, panX: 0, panY: 0 })
        return
      }
      // ⌘1 = 100% zoom (actual pixels)
      if (isCmdOrCtrl && e.key === '1') {
        e.preventDefault()
        setViewport((v) => ({ ...v, zoom: 3, panX: 0, panY: 0 }))
        return
      }
      // R = 旋转 90°（无修饰键）
      if (e.key === 'r' && !isCmdOrCtrl && !e.altKey) {
        e.preventDefault()
        const newRot = ((rotation + 90) % 360) as 0 | 90 | 180 | 270
        setTransform({ rotation: newRot, flipH, flipV })
        commitHistory('旋转')
        return
      }
      // H = 水平翻转（无修饰键）
      if (e.key === 'h' && !isCmdOrCtrl && !e.altKey) {
        e.preventDefault()
        setTransform({ rotation, flipH: !flipH, flipV })
        commitHistory('翻转')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [rotation, flipH, flipV, setTransform, commitHistory])

  const dirty = hasDirtyEdits(currentPipeline, baselinePipeline, dirtyFlag)

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
    if (!currentPipeline || !hasDirtyEdits(currentPipeline, baselinePipeline ?? {}, dirtyFlag)) {
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

  /** 导出当前编辑结果（全分辨率，后端 pipeline + 边框渲染） */
  const [exportSize, setExportSize] = useState<'original' | '4000' | '2400' | '1600'>('original')
  const [exportToast, setExportToast] = useState<string | null>(null)
  const handleExport = async () => {
    if (!photo?.path) return
    try {
      const longEdge = exportSize === 'original' ? null : Number(exportSize)
      const result = await ipc('photo:exportSingle', photo.path, currentPipeline, {
        longEdge,
        quality: 92,
        rotation,
        flipH,
        flipV,
        watermark: watermarkConfig ?? null,
        frame: frameConfig ? { styleId: frameConfig.styleId, overrides: frameConfig.overrides } : null,
      })
      if (result) {
        setExportToast(result)
        setTimeout(() => setExportToast(null), 6000)
      }
    } catch (err) {
      console.error('[export]', err)
      window.alert(`导出失败：${(err as Error).message}`)
    }
  }

  // ---- WebGL 预览：按 showOriginal / compareMode 短路 pipeline ----
  const renderPipeline = showOriginal || compareMode ? null : currentPipeline
  const webgl = useWebGLPreview(previewUrl, renderPipeline, !!frameConfig)

  // GPU-only 策略（2026-04-26 起）：
  //   架构决策：不再做 CPU 兜底。编辑路径只走 WebGL 实时渲染
  //   GPU 异常的正解：context lost 自动 restore；LUT 失败 skip 该通道；
  //   WebGL2 不支持 → 直接提示不兼容，不假装能工作
  const webglFatal = webgl.status === 'error' || webgl.status === 'unsupported'
  const photoPath = photo?.path

  // 拉取 previewUrl：只依赖 photoPath。filterId / pipelineOverride 永远传 null/undefined，
  // preview:render 主进程只做 "取原图 + resize + encode"，所有滤镜/滑块实时 GPU 渲染
  //
  // 关键：schema 是 z.tuple([path, filterId, pipelineOverride?]) —— 必须传 3 个参数
  //   即使第 3 个是 undefined 也要显式传，否则 args.length=2 会被 Zod 拒绝
  //   （Array must contain at least 3 element(s)）
  useEffect(() => {
    if (!photoPath) return
    let alive = true
    setLoading(true)
    setPreviewError(null)
    ipc('preview:render', photoPath, null, undefined)
      .then((url) => {
        if (alive) {
          setPreviewUrl(url)
          setPreviewError(null)
        }
      })
      .catch((err) => {
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
  }, [photoPath])

  // ---- Viewport: 滚轮缩放 ----
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const factor = e.ctrlKey ? 0.01 : 0.002 // trackpad 捏合用 ctrlKey
    setViewport((v) => {
      const newZoom = Math.max(0.25, Math.min(8, v.zoom * (1 - e.deltaY * factor)))
      // 缩小到 fit 以下时重置 pan
      if (newZoom <= 1) return { zoom: newZoom, panX: 0, panY: 0 }
      return { ...v, zoom: newZoom }
    })
  }, [])

  // 用 useEffect 注册 non-passive wheel listener（React onWheel 默认 passive，无法 preventDefault）
  useEffect(() => {
    const container = canvasContainerRef.current
    if (!container || showFrameOverlay) return
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [handleWheel, showFrameOverlay])

  // ---- Viewport: 拖拽平移 ----
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (viewport.zoom <= 1) return // fit 模式下不可 pan
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY, panX: viewport.panX, panY: viewport.panY }
      e.preventDefault()
    },
    [viewport.zoom, viewport.panX, viewport.panY],
  )

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    setViewport((v) => ({ ...v, panX: panStart.current.panX + dx, panY: panStart.current.panY + dy }))
  }, [])

  const handleCanvasMouseUp = useCallback(() => {
    isPanning.current = false
  }, [])

  // 双击画布切换 Fit ↔ 放大
  const handleCanvasDoubleClick = useCallback(() => {
    setViewport((v) => (v.zoom > 1 ? { zoom: 1, panX: 0, panY: 0 } : { zoom: 3, panX: 0, panY: 0 }))
  }, [])

  if (!photo) {
    return (
      <div className="h-full flex items-center justify-center text-fg-3 text-sm">请先到「图库」导入照片</div>
    )
  }

  const useWebglCanvas = !webglFatal && (webgl.status === 'ready' || webgl.status === 'loading')
  const showImgFallback = !useWebglCanvas && previewUrl
  const canvasStyle = { maxWidth: '100%', maxHeight: 'calc(100vh - 260px)' } as const
  /** 是否显示边框覆盖层 — 选中了边框且风格数据已加载 */
  const showFrameOverlay = !!frameConfig?.styleId && !!selectedFrameStyle

  return (
    <div className="h-full flex animate-fade-in bg-bg-0" data-testid="editor-root">
      {/* Canvas Column */}
      <section className="flex-1 flex flex-col min-w-0 bg-bg-0">
        {/* 顶部工具条 — 双行布局 */}
        <div className="border-b border-fg-4/50 flex flex-col">
          {/* 第一行：文件名 + 编辑工具 */}
          <div className="h-10 flex items-center px-4 gap-1.5">
            <div className="text-xs font-medium truncate text-fg-1 max-w-[120px]">{photo.name}</div>
            {dirty && <ValueBadge value="EDITED" variant="amber" size="sm" className="!ml-0 shrink-0" />}
            <div className="flex-1" />
            <button
              type="button"
              onClick={undo}
              disabled={!canUndoNow}
              data-testid="editor-undo-btn"
              className={cn('btn-ghost btn-xs', !canUndoNow && 'opacity-30 cursor-not-allowed')}
              title="撤销 (⌘Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedoNow}
              data-testid="editor-redo-btn"
              className={cn('btn-ghost btn-xs', !canRedoNow && 'opacity-30 cursor-not-allowed')}
              title="重做 (⌘⇧Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <div className="divider-metal-v mx-0.5 h-4" />
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
            <button
              type="button"
              onClick={() => setCompareMode((m) => !m)}
              className={cn('btn-ghost btn-xs', compareMode && 'bg-brand-amber/20 text-brand-amber')}
              title="Before/After 切换 (\)"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <div className="divider-metal-v mx-0.5 h-4" />
            <button
              type="button"
              onClick={() => {
                const newRot = ((rotation + 90) % 360) as 0 | 90 | 180 | 270
                setTransform({ rotation: newRot, flipH, flipV })
                commitHistory('旋转')
              }}
              className="btn-ghost btn-xs"
              title="旋转 90° (R)"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setTransform({ rotation, flipH: !flipH, flipV })
                commitHistory('水平翻转')
              }}
              className={cn('btn-ghost btn-xs', flipH && 'bg-fg-4/20')}
              title="水平翻转 (H)"
            >
              <FlipHorizontal2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setTransform({ rotation, flipH, flipV: !flipV })
                commitHistory('垂直翻转')
              }}
              className={cn('btn-ghost btn-xs', flipV && 'bg-fg-4/20')}
              title="垂直翻转"
            >
              <FlipVertical2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCropMode((m) => !m)}
              className={cn('btn-ghost btn-xs', cropMode && 'bg-brand-amber/20 text-brand-amber')}
              title="裁切 (C)"
            >
              <Crop className="w-3.5 h-3.5" />
            </button>
            <div className="divider-metal-v mx-0.5 h-4" />
            <button
              type="button"
              onClick={() => setViewport({ zoom: 1, panX: 0, panY: 0 })}
              className={cn('btn-ghost btn-xs', viewport.zoom === 1 && 'text-brand-amber')}
              title="适应窗口 (⌘0)"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewport({ zoom: 3, panX: 0, panY: 0 })}
              className={cn('btn-ghost btn-xs', viewport.zoom === 3 && 'text-brand-amber')}
              title="放大 100% (⌘1)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-xxs font-numeric text-fg-3 w-8 text-center">
              {Math.round(viewport.zoom * 100)}%
            </span>
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
            <div className="divider-metal-v mx-0.5 h-4" />
            <button
              type="button"
              onClick={() => setShowAIAdvisor(true)}
              className="btn-ghost btn-xs gap-1"
              title="AI 摄影顾问"
            >
              <Sparkles className="w-3.5 h-3.5 text-brand-amber" />
              <span className="text-xxs">AI 顾问</span>
            </button>
          </div>
          {/* 第二行：保存预设 + 导出选项 */}
          <div className="h-9 flex items-center px-4 gap-2 border-t border-fg-4/20">
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
            <div className="divider-metal-v mx-0.5 h-4" />
            <select
              value={exportSize}
              onChange={(e) => setExportSize(e.target.value as typeof exportSize)}
              className="text-xxs bg-bg-1 border border-fg-4/40 rounded px-1.5 py-1 text-fg-2"
              title="导出尺寸（长边像素）"
            >
              <option value="original">原图尺寸</option>
              <option value="4000">长边 4000px</option>
              <option value="2400">长边 2400px</option>
              <option value="1600">长边 1600px</option>
            </select>
            <label
              className="flex items-center gap-1 text-xxs text-fg-3 cursor-pointer"
              title="导出时添加 EXIF 水印底栏"
            >
              <input
                type="checkbox"
                checked={!!watermarkConfig}
                onChange={(e) => {
                  const setWm = useEditStore.getState().setWatermarkConfig
                  if (e.target.checked) {
                    setWm({
                      templateId: 'minimal-bar',
                      position: 'bottom-center',
                      opacity: 0.92,
                      scale: 1,
                      color: '#ffffff',
                      bgColor: '#000000',
                      fontFamily: 'Inter',
                      showLogo: false,
                      fields: {
                        make: true,
                        model: true,
                        lens: true,
                        aperture: true,
                        shutter: true,
                        iso: true,
                        focalLength: true,
                        dateTime: false,
                        artist: false,
                        location: false,
                      },
                      padding: 24,
                    })
                    commitHistory('添加水印')
                  } else {
                    setWm(null)
                    commitHistory('移除水印')
                  }
                }}
                className="accent-brand-amber"
              />
              水印
            </label>
            <button
              type="button"
              onClick={handleExport}
              className="btn-primary btn-xs"
              data-testid="editor-export-btn"
            >
              <Download className="w-3.5 h-3.5" />
              导出
            </button>
          </div>
        </div>

        {/* ScoreBar 占位 */}
        <div className="px-4 pt-3">
          <ScoreBar score={null} onSwitchRubric={() => {}} />
        </div>

        {/* 画布 */}
        <div
          ref={canvasContainerRef}
          className="flex-1 flex items-center justify-center p-6 overflow-hidden relative"
          style={{
            cursor:
              !showFrameOverlay && viewport.zoom > 1 ? (isPanning.current ? 'grabbing' : 'grab') : 'default',
          }}
          onMouseDown={showFrameOverlay ? undefined : handleCanvasMouseDown}
          onMouseMove={showFrameOverlay ? undefined : handleCanvasMouseMove}
          onMouseUp={showFrameOverlay ? undefined : handleCanvasMouseUp}
          onMouseLeave={showFrameOverlay ? undefined : handleCanvasMouseUp}
          onDoubleClick={showFrameOverlay ? undefined : handleCanvasDoubleClick}
        >
          {/* WebGL 画布层 — 始终挂载，避免切换时重建 GL context 导致闪烁 */}
          <div
            className="relative max-w-full max-h-full transition-transform duration-75"
            style={{
              transform: [
                `translate(${viewport.panX}px, ${viewport.panY}px)`,
                `scale(${viewport.zoom})`,
                `rotate(${rotation}deg)`,
                `scaleX(${flipH ? -1 : 1})`,
                `scaleY(${flipV ? -1 : 1})`,
              ].join(' '),
              transformOrigin: 'center center',
              // 选中边框时隐藏 WebGL 画布（不卸载），用 visibility 保持 GL context 存活
              visibility: showFrameOverlay ? 'hidden' : 'visible',
            }}
          >
            <canvas
              ref={webgl.canvasRef}
              data-testid="preview-canvas"
              className={cn('rounded-md shadow-soft-lg object-contain', useWebglCanvas ? 'block' : 'hidden')}
              style={canvasStyle}
            />
            {showImgFallback && (
              <div className="relative">
                <img
                  src={previewUrl!}
                  alt="preview"
                  className="max-w-full max-h-[calc(100vh-260px)] object-contain rounded-md shadow-soft-lg"
                />
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-sem-error/90 text-white text-xs font-medium px-3 py-1.5 rounded shadow-soft-md backdrop-blur-sm">
                  ⚠ WebGL 不可用 · 当前显示原图，调色暂不生效
                </div>
              </div>
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
            {compareMode && !showOriginal && (
              <div className="absolute top-3 left-3">
                <ValueBadge value="BEFORE" variant="amber" size="sm" />
              </div>
            )}
            {webgl.status === 'ready' && <GpuBadge />}
            {webgl.status === 'unsupported' && (
              <div className="absolute bottom-3 right-3">
                <ValueBadge value="WEBGL2 UNSUPPORTED" variant="amber" size="sm" />
              </div>
            )}
            {webgl.status === 'error' && webgl.error && (
              <div className="absolute bottom-3 left-3 text-xxs text-sem-error font-mono">
                GL: {webgl.error}
              </div>
            )}
            {import.meta.env.DEV && (
              <DevDiagnosticOverlay
                status={webgl.status}
                error={webgl.error}
                channelCount={currentPipeline ? countPipelineChannels(currentPipeline) : 0}
              />
            )}
          </div>

          {/* 边框预览覆盖层 — 选中边框时淡入叠加，不触发 WebGL 重建 */}
          <div
            className="absolute inset-6 transition-opacity duration-200 ease-out"
            style={{
              opacity: showFrameOverlay ? 1 : 0,
              pointerEvents: showFrameOverlay ? 'auto' : 'none',
            }}
          >
            {selectedFrameStyle && photo && frameConfig?.overrides && (
              <>
                <FramePreviewHost
                  photo={photo}
                  style={selectedFrameStyle}
                  overrides={frameConfig.overrides}
                  photoSrcOverride={webgl.snapshotRef.current ?? undefined}
                />
                <div className="absolute top-3 left-3 z-10">
                  <ValueBadge value={`边框 · ${selectedFrameStyle.name}`} variant="amber" size="sm" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* 裁切覆盖层 */}
        {cropMode && canvasContainerRef.current && (
          <div className="absolute inset-6" style={{ pointerEvents: 'auto' }}>
            <CropOverlay
              containerWidth={canvasContainerRef.current.clientWidth - 48}
              containerHeight={canvasContainerRef.current.clientHeight - 48}
              initial={currentPipeline?.crop ?? null}
              onConfirm={(crop) => {
                commitHistory('裁切前')
                setCrop(crop)
                commitHistory('裁切')
                setCropMode(false)
              }}
              onCancel={() => setCropMode(false)}
            />
          </div>
        )}

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
            testId="editor-tab-filters"
          />
          <TabButton
            active={rightTab === 'adjust'}
            onClick={() => setRightTab('adjust')}
            icon={<Sliders className="w-3.5 h-3.5" strokeWidth={2} />}
            label="调整"
            sub={dirty ? '已修改' : undefined}
            testId="editor-tab-adjust"
          />
          <TabButton
            active={rightTab === 'frame'}
            onClick={() => setRightTab('frame')}
            icon={<Frame className="w-3.5 h-3.5" strokeWidth={2} />}
            label="边框"
            sub={selectedFrameStyle?.name}
            testId="editor-tab-frame"
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
          ) : rightTab === 'adjust' ? (
            <AdjustmentsPanel />
          ) : (
            <EditorFramePanel photo={photo} />
          )}
        </div>

        {/* Histogram — 实时从 WebGL readPixels 采样（独立订阅 perfStore，不让 Editor 每帧重渲） */}
        <HistogramPanel />
      </aside>

      {/* AI 摄影顾问弹窗 */}
      <AIAdvisorDialog
        open={showAIAdvisor}
        photoPath={photo?.path ?? null}
        activeFilterName={activeFilter?.name ?? null}
        activeFilterCategory={activeFilter?.category ?? null}
        onClose={() => setShowAIAdvisor(false)}
      />

      {/* 导出成功 Toast */}
      {exportToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-lg bg-bg-0 border border-sem-success/40 shadow-2xl animate-fade-in">
          <div className="text-sem-success text-xs font-medium">导出成功</div>
          <div className="text-xxs text-fg-3 font-mono truncate max-w-[300px]">{exportToast}</div>
          <button
            type="button"
            className="text-xxs text-brand-amber hover:text-brand-amber/80 whitespace-nowrap"
            onClick={() => {
              ipc('dialog:selectDir').catch(() => {}) // 触发 Finder（占位，实际用 shell.showItemInFolder）
              setExportToast(null)
            }}
          >
            在 Finder 中显示
          </button>
          <button
            type="button"
            className="text-fg-4 hover:text-fg-2 text-xs"
            onClick={() => setExportToast(null)}
          >
            ×
          </button>
        </div>
      )}
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

// ============================================================================
// P0-1 修复的修复：从 perfStore 订阅的独立组件，避免让 Editor 每帧重渲
// ============================================================================

/**
 * GPU 耗时 badge —— 独立订阅 perfStore.perf，Editor 主体零感知。
 * renderNow 每帧 writePerf → 本组件重绘（只有文字变，DOM 开销极小）。
 */
const GpuBadge = memo(function GpuBadge() {
  const perf = usePerfStore((s) => s.perf)
  if (!perf) return null
  return (
    <div className="absolute bottom-3 right-3">
      <ValueBadge value={`GPU · ${perf.pipelineRunMs.toFixed(1)}ms`} variant="muted" size="sm" />
    </div>
  )
})

/**
 * Dev 诊断 overlay —— 订阅 perfStore 的 Frame budget；其它字段走 props。
 * 拖滑块时只这个组件重绘，不影响 Editor 主体。
 */
const DevDiagnosticOverlay = memo(function DevDiagnosticOverlay({
  status,
  error,
  channelCount,
}: {
  status: string
  error?: string
  channelCount: number
}) {
  const perf = usePerfStore((s) => s.perf)
  return (
    <div className="absolute top-3 left-3 text-xxs font-mono bg-black/60 text-fg-2 px-2 py-1 rounded pointer-events-none space-y-0.5">
      <div>
        gl: {status}
        {error ? ` (${error.slice(0, 40)})` : ''}
      </div>
      <div>pipeline: {channelCount} ch · GPU</div>
      {perf && (
        <div>
          frame: {perf.totalMs.toFixed(1)}ms · run {perf.pipelineRunMs.toFixed(1)} · rd{' '}
          {perf.readPixelsMs.toFixed(1)} · hist {perf.histogramMs.toFixed(1)}
        </div>
      )}
    </div>
  )
})

/**
 * 直方图面板 —— 独立订阅 perfStore.histogram。
 * 跳帧采样 ~20Hz，更新时只重绘本组件。
 */
const HistogramPanel = memo(function HistogramPanel() {
  const histogram = usePerfStore((s) => s.histogram)
  return (
    <div className="p-3 border-t border-fg-4/50">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xxs text-fg-3 uppercase tracking-wider font-mono">Histogram</div>
        {histogram && (
          <div className="text-xxs text-fg-3 font-mono">{histogram.total.toLocaleString()} px</div>
        )}
      </div>
      <Histogram data={histogram} width={288} height={64} />
    </div>
  )
})

function TabButton({
  active,
  onClick,
  icon,
  label,
  sub,
  testId,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  sub?: string
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
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
  // 稳定 testid：原图用 "filter-row-original"，其它按 filterId
  const testId = filterId === null ? 'filter-row-original' : `filter-row-${filterId}`
  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid={testId}
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
