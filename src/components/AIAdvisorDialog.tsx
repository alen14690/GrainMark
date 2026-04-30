/**
 * AI 摄影顾问面板（M5-LLM-C）
 *
 * 职责：
 *   1. 用户点「✨ AI 顾问」按钮 → 打开右侧面板 → 调 llm:analyzePhoto
 *   2. LLM 返回后展示：主体识别 + 诊断清单 + 参数建议预览（可逐项否决）
 *   3. **实时预览**：勾选/取消勾选 → 立即应用到 editStore → WebGL 画布刷新
 *   4. 确认应用：commitHistory 一次性入栈（⌘Z 一步撤销）
 *   5. 取消：恢复到 AI 分析前的状态
 *
 * 设计原则：
 *   - 右侧侧边栏面板（不遮挡画布，用户可实时看到效果）
 *   - 每次 checkbox 变化 → 同步 pipeline 到画布（无需点"应用"就能看效果）
 *   - 确认后一个 ⌘Z 完整撤销全部 AI 建议
 *   - 取消即恢复原始状态，安全无副作用
 */
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, X, XCircle } from 'lucide-react'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import type { AIAnalysisResult, AISuggestedAdjustments, FilterPipeline } from '../../shared/types'
import { cn } from '../design'
import { ipc } from '../lib/ipc'
import { useEditStore } from '../stores/editStore'

interface Props {
  open: boolean
  photoPath: string | null
  /** 当前选中的滤镜名称（如 "Kodak Portra 400"），null 表示未选滤镜 */
  activeFilterName: string | null
  /** 当前滤镜分类（如 "oil-painting"、"negative-color"） */
  activeFilterCategory: string | null
  onClose: () => void
}

/** 把 AISuggestedAdjustments 展平成一个可勾选的"建议项"列表 */
interface SuggestionItem {
  /** 唯一 id */
  key: string
  label: string
  /** 数值（若有） */
  value?: number
  /** LLM 给的一句话理由（可选） */
  reason?: string
  /** 应用到 editStore 的回调 */
  apply: () => void
}

/** 格式化 HSL 通道中文名 */
const HSL_LABELS: Record<string, string> = {
  red: '红色', orange: '橙色', yellow: '黄色', green: '绿色',
  aqua: '青色', blue: '蓝色', purple: '紫色', magenta: '品红',
}

/** 建议分组 */
interface SuggestionGroup {
  id: string
  label: string
  icon: string
  items: SuggestionItem[]
}

function buildSuggestionGroups(
  adj: AISuggestedAdjustments,
  setters: {
    setTone: ReturnType<typeof useEditStore.getState>['setTone']
    setWhiteBalance: ReturnType<typeof useEditStore.getState>['setWhiteBalance']
    setClarity: ReturnType<typeof useEditStore.getState>['setClarity']
    setSaturation: ReturnType<typeof useEditStore.getState>['setSaturation']
    setVibrance: ReturnType<typeof useEditStore.getState>['setVibrance']
    setColorGrading: ReturnType<typeof useEditStore.getState>['setColorGrading']
    setCurves: ReturnType<typeof useEditStore.getState>['setCurves']
    setHsl: ReturnType<typeof useEditStore.getState>['setHsl']
    setGrain: ReturnType<typeof useEditStore.getState>['setGrain']
    setHalation: ReturnType<typeof useEditStore.getState>['setHalation']
    setVignette: ReturnType<typeof useEditStore.getState>['setVignette']
  },
): SuggestionGroup[] {
  const reasons = adj.reasons ?? {}
  const groups: SuggestionGroup[] = []

  // ---- 光影调整 ----
  const lightItems: SuggestionItem[] = []
  if (adj.tone) {
    const t = adj.tone
    const toneLabels: Array<[keyof typeof t, string]> = [
      ['exposure', '曝光'], ['contrast', '对比度'], ['highlights', '高光'],
      ['shadows', '阴影'], ['whites', '白阶'], ['blacks', '黑阶'],
    ]
    for (const [key, label] of toneLabels) {
      const v = t[key]
      if (typeof v === 'number' && v !== 0) {
        lightItems.push({
          key: `tone.${key}`,
          label,
          value: v,
          reason: reasons[key] ?? reasons[`tone.${key}`],
          apply: () => setters.setTone({ [key]: v }),
        })
      }
    }
  }
  if (adj.curves) {
    const channels = (['rgb', 'r', 'g', 'b'] as const).filter((ch) => adj.curves?.[ch]?.length)
    if (channels.length > 0) {
      const chLabel = channels.map((c) => c === 'rgb' ? 'RGB主曲线' : `${c.toUpperCase()}通道`).join(' + ')
      lightItems.push({
        key: 'curves',
        label: `曲线 — ${chLabel}`,
        reason: reasons.curves ?? reasons['curves'],
        apply: () => setters.setCurves(adj.curves!),
      })
    }
  }
  if (lightItems.length > 0) groups.push({ id: 'light', label: '光影调整', icon: '🔆', items: lightItems })

  // ---- 色彩调整 ----
  const colorItems: SuggestionItem[] = []
  if (adj.whiteBalance) {
    const wb = adj.whiteBalance
    if (typeof wb.temp === 'number' && wb.temp !== 0) {
      colorItems.push({
        key: 'wb.temp', label: '色温', value: wb.temp,
        reason: reasons.temp ?? reasons['wb.temp'],
        apply: () => setters.setWhiteBalance({ temp: wb.temp }),
      })
    }
    if (typeof wb.tint === 'number' && wb.tint !== 0) {
      colorItems.push({
        key: 'wb.tint', label: '色调', value: wb.tint,
        reason: reasons.tint ?? reasons['wb.tint'],
        apply: () => setters.setWhiteBalance({ tint: wb.tint }),
      })
    }
  }
  if (adj.hsl) {
    for (const [ch, val] of Object.entries(adj.hsl)) {
      if (!val) continue
      const parts: string[] = []
      if (val.h) parts.push(`H${val.h > 0 ? '+' : ''}${val.h}`)
      if (val.s) parts.push(`S${val.s > 0 ? '+' : ''}${val.s}`)
      if (val.l) parts.push(`L${val.l > 0 ? '+' : ''}${val.l}`)
      if (parts.length === 0) continue
      colorItems.push({
        key: `hsl.${ch}`,
        label: `${HSL_LABELS[ch] ?? ch} ${parts.join(' ')}`,
        reason: reasons[`hsl.${ch}`],
        apply: () => setters.setHsl({ [ch]: { h: val.h ?? 0, s: val.s ?? 0, l: val.l ?? 0 } }),
      })
    }
  }
  if (adj.colorGrading) {
    const cg = adj.colorGrading
    const fullZone = (z: { h?: number; s?: number; l?: number } | undefined) =>
      z ? { h: z.h ?? 0, s: z.s ?? 0, l: z.l ?? 0 } : undefined
    const full: Parameters<typeof setters.setColorGrading>[0] = {}
    const shadows = fullZone(cg.shadows)
    const highlights = fullZone(cg.highlights)
    if (shadows) full.shadows = shadows
    if (highlights) full.highlights = highlights
    if (cg.blending !== undefined) full.blending = cg.blending
    colorItems.push({
      key: 'colorGrading', label: '调色分离',
      reason: reasons.colorGrading ?? reasons['colorGrading'],
      apply: () => setters.setColorGrading(full),
    })
  }
  if (colorItems.length > 0) groups.push({ id: 'color', label: '色彩调整', icon: '🎨', items: colorItems })

  // ---- 胶片氛围 ----
  const filmItems: SuggestionItem[] = []
  if (adj.grain) {
    const g = adj.grain
    const desc = [g.amount && `强度${g.amount}`, g.size && `尺寸${g.size}`].filter(Boolean).join(' · ')
    filmItems.push({
      key: 'grain', label: `胶片颗粒${desc ? ` — ${desc}` : ''}`,
      reason: reasons.grain ?? reasons['grain'],
      apply: () => setters.setGrain(g),
    })
  }
  if (adj.halation) {
    const h = adj.halation
    filmItems.push({
      key: 'halation', label: `高光溢光${h.amount ? ` — 强度${h.amount}` : ''}`,
      reason: reasons.halation ?? reasons['halation'],
      apply: () => setters.setHalation(h),
    })
  }
  if (adj.vignette) {
    const v = adj.vignette
    filmItems.push({
      key: 'vignette', label: `暗角${v.amount ? ` — ${v.amount > 0 ? '提亮' : '压暗'}${Math.abs(v.amount)}` : ''}`,
      reason: reasons.vignette ?? reasons['vignette'],
      apply: () => setters.setVignette(v),
    })
  }
  if (filmItems.length > 0) groups.push({ id: 'film', label: '胶片氛围', icon: '🎞', items: filmItems })

  // ---- 质感微调 ----
  const texItems: SuggestionItem[] = []
  if (typeof adj.clarity === 'number' && adj.clarity !== 0) {
    texItems.push({
      key: 'clarity', label: '清晰度', value: adj.clarity,
      reason: reasons.clarity, apply: () => setters.setClarity(adj.clarity!),
    })
  }
  if (typeof adj.saturation === 'number' && adj.saturation !== 0) {
    texItems.push({
      key: 'saturation', label: '饱和度', value: adj.saturation,
      reason: reasons.saturation, apply: () => setters.setSaturation(adj.saturation!),
    })
  }
  if (typeof adj.vibrance === 'number' && adj.vibrance !== 0) {
    texItems.push({
      key: 'vibrance', label: '自然饱和度', value: adj.vibrance,
      reason: reasons.vibrance, apply: () => setters.setVibrance(adj.vibrance!),
    })
  }
  if (texItems.length > 0) groups.push({ id: 'texture', label: '质感微调', icon: '⚡', items: texItems })

  return groups
}

/** 格式化数值：带正负号 */
function fmtSigned(v: number): string {
  if (v > 0) return `+${v.toFixed(0)}`
  return v.toFixed(0)
}

/** 深拷贝 pipeline（JSON round-trip，与 editStore 一致） */
function clonePipeline(p: FilterPipeline | null): FilterPipeline | null {
  if (!p) return null
  return JSON.parse(JSON.stringify(p)) as FilterPipeline
}

function AIAdvisorDialog({ open, photoPath, activeFilterName, activeFilterCategory, onClose }: Props) {
  const [state, setState] = useState<
    | { phase: 'idle' }
    | { phase: 'loading' }
    | { phase: 'error'; kind: string; message: string }
    | { phase: 'result'; result: AIAnalysisResult & { ok: true } }
  >({ phase: 'idle' })
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  /** AI 分析前的 pipeline 快照（用于预览恢复 & 取消恢复） */
  const preAISnapshotRef = useRef<FilterPipeline | null>(null)
  /** 是否已进入预览模式（避免重复保存快照） */
  const previewActiveRef = useRef(false)

  const setTone = useEditStore((s) => s.setTone)
  const setWhiteBalance = useEditStore((s) => s.setWhiteBalance)
  const setClarity = useEditStore((s) => s.setClarity)
  const setSaturation = useEditStore((s) => s.setSaturation)
  const setVibrance = useEditStore((s) => s.setVibrance)
  const setColorGrading = useEditStore((s) => s.setColorGrading)
  const setCurves = useEditStore((s) => s.setCurves)
  const setHsl = useEditStore((s) => s.setHsl)
  const setGrain = useEditStore((s) => s.setGrain)
  const setHalation = useEditStore((s) => s.setHalation)
  const setVignette = useEditStore((s) => s.setVignette)
  const commitHistory = useEditStore((s) => s.commitHistory)

  const allSetters = {
    setTone, setWhiteBalance, setClarity, setSaturation, setVibrance,
    setColorGrading, setCurves, setHsl, setGrain, setHalation, setVignette,
  }

  const suggestionGroups = useMemo<SuggestionGroup[]>(() => {
    if (state.phase !== 'result') return []
    return buildSuggestionGroups(state.result.adjustments, allSetters)
  }, [state, setTone, setWhiteBalance, setClarity, setSaturation, setVibrance, setColorGrading, setCurves, setHsl, setGrain, setHalation, setVignette])

  const allItems = useMemo(() => suggestionGroups.flatMap((g) => g.items), [suggestionGroups])

  /**
   * 同步预览到画布：恢复到 pre-AI 快照，然后只应用已勾选项。
   * 因为 setter 是 patch 模式（merge），必须先恢复到干净基准再叠加。
   */
  const syncPreviewToCanvas = useCallback((sel: Record<string, boolean>, items: SuggestionItem[]) => {
    // 1. 恢复到 AI 分析前的 pipeline 快照
    const snapshot = preAISnapshotRef.current
    useEditStore.setState((s) => {
      s.currentPipeline = clonePipeline(snapshot)
      s._dirty = true
    })
    // 2. 在恢复后的基础上叠加已勾选项
    for (const it of items) {
      if (sel[it.key]) it.apply()
    }
  }, [])

  /** 进入预览模式：保存快照 + 首次应用 */
  const enterPreview = useCallback((items: SuggestionItem[], sel: Record<string, boolean>) => {
    if (!previewActiveRef.current) {
      // 保存当前 pipeline 快照（AI 分析前的状态）
      preAISnapshotRef.current = clonePipeline(useEditStore.getState().currentPipeline)
      // commitHistory 让 ⌘Z 可以回到 AI 分析前
      commitHistory('AI 分析前')
      previewActiveRef.current = true
    }
    // 同步预览
    syncPreviewToCanvas(sel, items)
  }, [commitHistory, syncPreviewToCanvas])

  const analyze = async () => {
    if (!photoPath) return
    setState({ phase: 'loading' })
    setSelected({})
    previewActiveRef.current = false
    try {
      const r = await ipc('llm:analyzePhoto', photoPath, activeFilterName, activeFilterCategory)
      if (r.ok) {
        setState({ phase: 'result', result: r })
        // 默认全选
        const groups = buildSuggestionGroups(r.adjustments, allSetters)
        const initSelected: Record<string, boolean> = {}
        const items: SuggestionItem[] = []
        for (const g of groups) {
          for (const it of g.items) {
            initSelected[it.key] = true
            items.push(it)
          }
        }
        setSelected(initSelected)
        // 立即进入预览模式 → 画布显示 AI 建议效果
        enterPreview(items, initSelected)
      } else {
        setState({ phase: 'error', kind: r.errorKind, message: r.message })
      }
    } catch (err) {
      setState({
        phase: 'error',
        kind: 'unknown',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** checkbox 变化 → 更新 selected + 同步预览 */
  const handleToggle = useCallback((key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev, [key]: checked }
      // 延迟到下一微任务确保 state 已更新（items 依赖 suggestionGroups 不变）
      queueMicrotask(() => {
        syncPreviewToCanvas(next, allItems)
      })
      return next
    })
  }, [allItems, syncPreviewToCanvas])

  /** 分组全选/取消全选 */
  const handleGroupToggle = useCallback((group: SuggestionGroup) => {
    setSelected((prev) => {
      const allChecked = group.items.every((it) => prev[it.key])
      const next = { ...prev }
      for (const it of group.items) next[it.key] = !allChecked
      queueMicrotask(() => {
        syncPreviewToCanvas(next, allItems)
      })
      return next
    })
  }, [allItems, syncPreviewToCanvas])

  /** 确认应用：commit 入 history 后关闭 */
  const handleApply = useCallback(() => {
    const selectedCount = Object.values(selected).filter(Boolean).length
    if (selectedCount === 0) return
    // 当前 canvas 已经是预览状态（已应用勾选项），直接 commit 即可
    commitHistory(`AI 顾问建议（${selectedCount} 项）`)
    previewActiveRef.current = false
    preAISnapshotRef.current = null
    onClose()
    // 确认应用后清理内部状态（下次打开是全新流程）
    setState({ phase: 'idle' })
    setSelected({})
  }, [selected, commitHistory, onClose])

  /** 取消：恢复到 AI 分析前状态后关闭 */
  const handleCancel = useCallback(() => {
    if (previewActiveRef.current) {
      // 恢复到快照
      const snapshot = preAISnapshotRef.current
      useEditStore.setState((s) => {
        s.currentPipeline = clonePipeline(snapshot)
        s._dirty = snapshot !== null
      })
    }
    previewActiveRef.current = false
    preAISnapshotRef.current = null
    onClose()
    // 取消后清理状态
    setState({ phase: 'idle' })
    setSelected({})
  }, [onClose])

  // 面板关闭时不清理状态（保持后台进展）
  // 只有用户明确 handleCancel / handleApply 时才清理
  // 如果面板被强制卸载（比如离开 Editor 页面），React 会自然销毁状态

  if (!open) return null

  return (
    <div
      className="fixed right-0 top-0 h-screen z-40 w-[420px] bg-bg-0 border-l border-fg-4/60 shadow-2xl flex flex-col"
      role="dialog"
      aria-modal="false"
      aria-label="AI 摄影顾问"
    >
      {/* Header */}
      <header className="h-14 border-b border-fg-4/50 flex items-center px-5 gap-3 bg-gradient-to-r from-brand-amber/10 to-transparent shrink-0">
        <Sparkles className="w-5 h-5 text-brand-amber" />
        <div className="flex-1">
          <div className="text-sm font-semibold">AI 摄影顾问</div>
          <div className="text-xxs text-fg-3">实时预览 · 勾选即应用到画布</div>
        </div>
        <button type="button" onClick={handleCancel} className="btn-ghost btn-xs" title="关闭（取消预览）">
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {state.phase === 'idle' && (
          <div className="text-center py-8 space-y-4">
            <div className="text-sm text-fg-2 leading-relaxed">
              点击下方按钮，AI 会降采样这张照片（768px）并上传给你配置的 OpenRouter 模型。
              <br />
              返回：<strong className="text-fg-1">光影诊断 · 色彩分析 · 质感评估 · 主体强化 · 全通道参数建议</strong>。
            </div>
            <div className="text-xxs text-fg-3 leading-relaxed px-6">
              分析完成后建议会<strong>实时应用到画布</strong>，你可以逐项勾选调整，确认后一键保存。
            </div>
            <button type="button" onClick={analyze} className="btn-primary btn-md mt-2">
              <Sparkles className="w-4 h-4" />
              开始分析
            </button>
          </div>
        )}

        {state.phase === 'loading' && (
          <div className="text-center py-12 space-y-3">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-brand-amber" />
            <div className="text-sm text-fg-2">正在分析照片...</div>
            <div className="text-xxs text-fg-3">多模态分析耗时较长，请耐心等待（最长约 6 分钟）</div>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="py-6 space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-md bg-sem-error/10 border border-sem-error/30">
              <AlertTriangle className="w-5 h-5 text-sem-error shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-sem-error">{humanizeErrorKind(state.kind)}</div>
                <div className="text-xxs text-fg-2 mt-1 font-mono break-all">{state.message}</div>
              </div>
            </div>
            {(state.kind === 'no-config' || state.kind === 'not-opted-in') && (
              <div className="text-xxs text-fg-3 px-1">
                提示：请到 Settings → AI 检查 OpenRouter apiKey 和 opt-in 同意勾选。
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={handleCancel} className="btn-ghost btn-xs">
                关闭
              </button>
              <button type="button" onClick={analyze} className="btn-secondary btn-xs">
                重试
              </button>
            </div>
          </div>
        )}

        {state.phase === 'result' && (
          <div className="space-y-5">
            {/* 主体 / 环境 / 诊断 */}
            <section className="space-y-3">
              <div>
                <div className="text-xxs font-mono uppercase tracking-wider text-fg-3 mb-1">场景摘要</div>
                <div className="text-[13px] text-fg-1 leading-relaxed">{state.result.analysis.summary}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xxs font-mono uppercase tracking-wider text-fg-3 mb-1">主体</div>
                  <div className="text-xs text-fg-2">{state.result.analysis.subject}</div>
                </div>
                <div>
                  <div className="text-xxs font-mono uppercase tracking-wider text-fg-3 mb-1">环境</div>
                  <div className="text-xs text-fg-2">{state.result.analysis.environment}</div>
                </div>
              </div>
              <div>
                <div className="text-xxs font-mono uppercase tracking-wider text-fg-3 mb-1">光影诊断</div>
                <ul className="text-xs text-fg-2 space-y-1 list-disc list-inside">
                  {state.result.analysis.diagnosis.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            </section>

            <div className="divider-metal" />

            {/* 参数建议 · 分组展示 */}
            <section>
              <div className="flex items-baseline gap-2 mb-3">
                <div className="text-xxs font-mono uppercase tracking-wider text-fg-3">
                  参数建议（勾选即预览）
                </div>
                <span className="text-xxs text-fg-4 ml-auto">共 {allItems.length} 项</span>
              </div>

              {allItems.length === 0 ? (
                <div className="text-xs text-fg-3 italic py-4 text-center">AI 判断无需调整参数。</div>
              ) : (
                <div className="space-y-4">
                  {suggestionGroups.map((group) => (
                    <div key={group.id} className="rounded-lg border border-fg-4/30 overflow-hidden">
                      {/* 分组标题 */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-bg-1 border-b border-fg-4/20">
                        <span className="text-sm">{group.icon}</span>
                        <span className="text-xs font-semibold text-fg-1">{group.label}</span>
                        <span className="text-xxs text-fg-4 ml-auto">{group.items.length} 项</span>
                        <button
                          type="button"
                          className="text-xxs text-brand-amber hover:text-brand-amber/80 ml-1"
                          onClick={() => handleGroupToggle(group)}
                        >
                          {group.items.every((it) => selected[it.key]) ? '取消全选' : '全选'}
                        </button>
                      </div>
                      {/* 分组内的建议项 */}
                      <div className="divide-y divide-fg-4/10">
                        {group.items.map((it) => (
                          <label
                            key={it.key}
                            className={cn(
                              'flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors',
                              selected[it.key]
                                ? 'bg-brand-amber/5'
                                : 'hover:bg-fg-4/5',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={!!selected[it.key]}
                              onChange={(e) => handleToggle(it.key, e.target.checked)}
                              className="mt-0.5 accent-brand-amber"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs font-medium text-fg-1">{it.label}</span>
                                {it.value !== undefined && (
                                  <span
                                    className={cn(
                                      'text-xs font-numeric',
                                      it.value > 0 ? 'text-sem-success' : 'text-sem-info',
                                    )}
                                  >
                                    {fmtSigned(it.value)}
                                  </span>
                                )}
                              </div>
                              {it.reason && (
                                <div className="text-xxs text-fg-3 mt-0.5 leading-snug">{it.reason}</div>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 元信息 */}
            <div className="text-xxs text-fg-4 font-mono pt-2 border-t border-fg-4/30 flex gap-3 flex-wrap">
              <span>模型：{state.result.meta.model}</span>
              <span>耗时：{state.result.meta.latencyMs}ms</span>
              {state.result.meta.promptTokens !== undefined && (
                <span>
                  tokens：{state.result.meta.promptTokens} in / {state.result.meta.completionTokens ?? 0}{' '}
                  out
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {state.phase === 'result' && (
        <footer className="border-t border-fg-4/50 flex flex-col bg-bg-1 shrink-0">
          {/* 全局快捷操作行 */}
          <div className="flex items-center px-5 pt-2.5 pb-1 gap-2">
            <button
              type="button"
              className="text-xxs text-fg-2 hover:text-fg-1 transition-colors"
              onClick={() => {
                const next: Record<string, boolean> = {}
                for (const it of allItems) next[it.key] = true
                setSelected(next)
                queueMicrotask(() => syncPreviewToCanvas(next, allItems))
              }}
            >
              全选
            </button>
            <span className="text-fg-4">·</span>
            <button
              type="button"
              className="text-xxs text-fg-2 hover:text-fg-1 transition-colors"
              onClick={() => {
                const next: Record<string, boolean> = {}
                for (const it of allItems) next[it.key] = false
                setSelected(next)
                queueMicrotask(() => syncPreviewToCanvas(next, allItems))
              }}
            >
              全不选
            </button>
            <span className="text-fg-4">·</span>
            <button
              type="button"
              className="text-xxs text-fg-2 hover:text-fg-1 transition-colors"
              onClick={() => {
                const next: Record<string, boolean> = {}
                for (const it of allItems) next[it.key] = !selected[it.key]
                setSelected(next)
                queueMicrotask(() => syncPreviewToCanvas(next, allItems))
              }}
            >
              反选
            </button>
            <div className="flex-1" />
            <div className="text-xxs text-fg-3">
              {Object.values(selected).filter(Boolean).length} / {allItems.length} 项已选
            </div>
          </div>
          {/* 主操作行 */}
          <div className="flex items-center px-5 pb-2.5 pt-1 gap-2">
            <div className="flex-1" />
            <button type="button" onClick={handleCancel} className="btn-ghost btn-sm gap-1">
              <XCircle className="w-3.5 h-3.5" />
              取消
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={Object.values(selected).filter(Boolean).length === 0}
              className={cn(
                'btn-primary btn-sm',
                Object.values(selected).filter(Boolean).length === 0 && 'opacity-40 cursor-not-allowed',
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              确认应用（可 ⌘Z 撤销）
            </button>
          </div>
        </footer>
      )}
    </div>
  )
}

function humanizeErrorKind(kind: string): string {
  switch (kind) {
    case 'no-config':
      return '未配置 OpenRouter'
    case 'not-opted-in':
      return '未同意云端上传'
    case 'image-prep-failed':
      return '原图处理失败'
    case 'invalid-key':
      return 'apiKey 无效或被拒'
    case 'rate-limit':
      return '触发速率限制'
    case 'network':
      return '网络错误'
    case 'timeout':
      return '请求超时'
    case 'invalid-response':
      return 'LLM 响应格式不符'
    default:
      return '未知错误'
  }
}

export default memo(AIAdvisorDialog)
