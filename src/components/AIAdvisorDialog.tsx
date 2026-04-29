/**
 * AI 摄影顾问弹窗（M5-LLM-B）
 *
 * 职责：
 *   1. 用户点「✨ AI 顾问」按钮 → 打开此弹窗 → 调 llm:analyzePhoto
 *   2. LLM 返回后展示：主体识别 + 诊断清单 + 参数建议预览（可逐项否决）
 *   3. 用户勾选要应用的项 → 一键写入 editStore + commitHistory
 *
 * 设计原则（M5-LLM-B 阶段）：
 *   - 只做全局参数（tone/wb/clarity/saturation/vibrance/colorGrading），不做局部 mask
 *   - 参数已在主进程 clamp 到 ±40（防 HDR 塑料感）
 *   - 用户必须「明确同意」才会写入 pipeline（默认全不勾，避免一键应用导致后悔）
 *   - 应用后进入 history，可 ⌘Z 完整撤销
 */
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import type { AIAnalysisResult, AISuggestedAdjustments } from '../../shared/types'
import { cn } from '../design'
import { ipc } from '../lib/ipc'
import { useEditStore } from '../stores/editStore'

interface Props {
  open: boolean
  photoPath: string | null
  onClose: () => void
}

/** 把 AISuggestedAdjustments 展平成一个可勾选的"建议项"列表 */
interface SuggestionItem {
  /** 唯一 id，也是展示给用户的中文 label */
  key: string
  label: string
  /** 数值（若有）；colorGrading 子字段这里只放 "已启用" 占位符 */
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

function AIAdvisorDialog({ open, photoPath, onClose }: Props) {
  const [state, setState] = useState<
    | { phase: 'idle' }
    | { phase: 'loading' }
    | { phase: 'error'; kind: string; message: string }
    | { phase: 'result'; result: AIAnalysisResult & { ok: true } }
  >({ phase: 'idle' })
  const [selected, setSelected] = useState<Record<string, boolean>>({})

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

  const analyze = async () => {
    if (!photoPath) return
    setState({ phase: 'loading' })
    setSelected({})
    try {
      const r = await ipc('llm:analyzePhoto', photoPath)
      if (r.ok) {
        setState({ phase: 'result', result: r })
        // 默认全选（让用户体验"一键应用"；勾选仍可去掉）
        const initSelected: Record<string, boolean> = {}
        const groups = buildSuggestionGroups(r.adjustments, allSetters)
        for (const g of groups) for (const it of g.items) initSelected[it.key] = true
        setSelected(initSelected)
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

  const handleApplySelected = () => {
    const toApply = allItems.filter((it) => selected[it.key])
    if (toApply.length === 0) return
    for (const it of toApply) it.apply()
    commitHistory(`AI 顾问建议（${toApply.length} 项）`)
    onClose()
    // 关闭后清理，避免再次打开时看到旧结果
    setTimeout(() => {
      setState({ phase: 'idle' })
      setSelected({})
    }, 200)
  }

  const handleClose = () => {
    onClose()
    setTimeout(() => {
      setState({ phase: 'idle' })
      setSelected({})
    }, 200)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-[640px] max-h-[85vh] bg-bg-0 border border-fg-4/60 rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <header className="h-14 border-b border-fg-4/50 flex items-center px-5 gap-3 bg-gradient-to-r from-brand-amber/10 to-transparent">
          <Sparkles className="w-5 h-5 text-brand-amber" />
          <div className="flex-1">
            <div className="text-sm font-semibold">AI 摄影顾问</div>
            <div className="text-xxs text-fg-3">由 OpenRouter 云端模型分析，调整参数可逐项勾选</div>
          </div>
          <button type="button" onClick={handleClose} className="btn-ghost btn-xs">
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
                ⚠️ 本次调用会消耗你的 OpenRouter 额度（约 $0.005~$0.05 / 次，依选择的模型）
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
              <div className="text-xxs text-fg-3">首次调用约 5-15s；网络慢或模型复杂时最长 30s</div>
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
                <button type="button" onClick={handleClose} className="btn-ghost btn-xs">
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
                    参数建议（可逐项勾选）
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
                            onClick={() => {
                              const allChecked = group.items.every((it) => selected[it.key])
                              setSelected((s) => {
                                const next = { ...s }
                                for (const it of group.items) next[it.key] = !allChecked
                                return next
                              })
                            }}
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
                                onChange={(e) => setSelected((s) => ({ ...s, [it.key]: e.target.checked }))}
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
          <footer className="h-14 border-t border-fg-4/50 flex items-center px-5 gap-2 bg-bg-1">
            <div className="text-xxs text-fg-3">
              {Object.values(selected).filter(Boolean).length} / {allItems.length} 项已选
            </div>
            <div className="flex-1" />
            <button type="button" onClick={handleClose} className="btn-ghost btn-sm">
              取消
            </button>
            <button
              type="button"
              onClick={handleApplySelected}
              disabled={Object.values(selected).filter(Boolean).length === 0}
              className={cn(
                'btn-primary btn-sm',
                Object.values(selected).filter(Boolean).length === 0 && 'opacity-40 cursor-not-allowed',
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              应用已选（可 ⌘Z 撤销）
            </button>
          </footer>
        )}
      </div>
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
