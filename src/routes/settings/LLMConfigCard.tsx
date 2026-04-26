/**
 * LLMConfigCard · M5-LLM-A
 *
 * Settings → AI 标签页的子组件，承担：
 *   1. OpenRouter apiKey 配置（存 SecureVault）
 *   2. 图像上传 opt-in 同意（默认 false —— 不配 = 不上传）
 *   3. 从 OpenRouter /models 端点实时拉取 vision 模型目录 + 三档推荐
 *   4. 连通性测试
 *
 * 设计约束：
 *   - 不显示 apiKey 明文；已保存时只显示 masked 前 4 位 + 后 4 位
 *   - 用户未勾选 optIn 时，所有走网络的 LLM 能力将在后续 IPC 层被拒绝
 *   - 不硬编码任何模型名 —— 全部从 IPC 拉取；拉不通才用后端兜底
 *   - 支持"下拉选择最新模型"和"手动输入自定义 ID"双通道
 */
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  LLMConfigInput,
  LLMConfigPublic,
  LLMModelCatalog,
  LLMModelEntry,
  LLMTestResult,
} from '../../../shared/types'
import { ipc } from '../../lib/ipc'

type TestState = { status: 'idle' } | { status: 'running' } | { status: 'done'; result: LLMTestResult }

export function LLMConfigCard(): JSX.Element {
  const [cfg, setCfg] = useState<LLMConfigPublic | null>(null)
  const [catalog, setCatalog] = useState<LLMModelCatalog | null>(null)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [apiKeyDraft, setApiKeyDraft] = useState<string>('')
  const [modelDraft, setModelDraft] = useState<string>('')
  const [manualMode, setManualMode] = useState<boolean>(false) // true=手动输入，false=下拉选择
  const [optInDraft, setOptInDraft] = useState<boolean>(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testState, setTestState] = useState<TestState>({ status: 'idle' })

  useEffect(() => {
    void (async () => {
      const c = await ipc('llm:getConfig')
      setCfg(c)
      setModelDraft(c.model ?? '')
      setOptInDraft(c.optInUploadImages)
      // 首次挂载若已配 apiKey，自动拉一次目录
      if (c.hasApiKey) void refreshCatalog()
    })()
  }, [])

  const refreshCatalog = async () => {
    setLoadingCatalog(true)
    try {
      const cat = await ipc('llm:listModels')
      setCatalog(cat)
    } finally {
      setLoadingCatalog(false)
    }
  }

  const applyPatch = async (patch: LLMConfigInput) => {
    setSaving(true)
    setSaveError(null)
    try {
      const next = await ipc('llm:setConfig', patch)
      setCfg(next)
      setApiKeyDraft('') // 清空输入框（已写入 vault）
      setModelDraft(next.model ?? '')
      setOptInDraft(next.optInUploadImages)
      // 保存 apiKey 后自动刷新目录（可能此前一直是兜底）
      if (patch.apiKey !== undefined && next.hasApiKey) void refreshCatalog()
    } catch (err) {
      setSaveError((err as Error).message.replace(/^\[llm:setConfig]\s*/, ''))
    } finally {
      setSaving(false)
    }
  }

  const runTest = async () => {
    setTestState({ status: 'running' })
    try {
      const result = await ipc('llm:testConnection')
      setTestState({ status: 'done', result })
    } catch (err) {
      setTestState({
        status: 'done',
        result: {
          ok: false,
          latencyMs: 0,
          message: (err as Error).message,
          errorKind: 'unknown',
        },
      })
    }
  }

  const clearAll = async () => {
    if (!window.confirm('确认清除 OpenRouter 配置？apiKey 将从本地加密存储中删除。')) return
    setSaving(true)
    try {
      const next = await ipc('llm:clearConfig')
      setCfg(next)
      setApiKeyDraft('')
      setModelDraft('')
      setOptInDraft(false)
      setTestState({ status: 'idle' })
      setCatalog(null)
    } finally {
      setSaving(false)
    }
  }

  if (!cfg) {
    return <div className="text-[11.5px] text-fg-3">加载中...</div>
  }

  const hasConfig = cfg.hasApiKey && cfg.provider === 'openrouter'
  const pendingKey = apiKeyDraft.length > 0
  const pendingModel = modelDraft !== (cfg.model ?? '')
  const pendingOptIn = optInDraft !== cfg.optInUploadImages
  const canSave = (pendingKey || pendingModel || pendingOptIn) && !saving

  return (
    <div className="mt-6 pt-5 border-t border-bg-1 space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-brand-amber mt-0.5 flex-shrink-0" />
        <div className="text-[11.5px] leading-relaxed text-fg-2">
          <div className="font-medium text-fg-1 mb-1">
            云 AI 顾问 · OpenRouter <span className="text-fg-3">（可选增强能力）</span>
          </div>
          <div>
            配置 OpenRouter apiKey 并勾选同意后，「AI 摄影顾问」等功能会将你的照片（降采样后的缩略图）
            加密上传给 OpenRouter 进行分析，产生的 API 费用由你自行承担。
          </div>
          <div className="mt-1.5 text-fg-3">
            <b className="text-fg-2">
              如不配置，本软件的所有 AI 能力仍默认完全本地运行，照片不会离开你的电脑。
            </b>
          </div>
        </div>
      </div>

      {/* apiKey */}
      <div className="space-y-1.5">
        <label className="text-[11.5px] text-fg-2" htmlFor="or-apikey">
          OpenRouter apiKey
        </label>
        <input
          id="or-apikey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="input w-full font-mono text-[12px]"
          placeholder={hasConfig ? `已保存：${cfg.apiKeyMasked ?? '****'}（输入新值以替换）` : 'sk-or-v1-...'}
          value={apiKeyDraft}
          onChange={(e) => setApiKeyDraft(e.target.value)}
        />
        <div className="text-[10.5px] text-fg-3">
          来源：
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-brand-amber"
          >
            openrouter.ai/keys
          </a>
          · 通过 macOS Keychain / Windows DPAPI 加密存储，绝不写入明文文件或日志
        </div>
      </div>

      {/* model 选择（下拉 + 手动切换） */}
      <ModelPicker
        hasApiKey={hasConfig}
        catalog={catalog}
        loading={loadingCatalog}
        current={modelDraft}
        manualMode={manualMode}
        onToggleManual={() => setManualMode((v) => !v)}
        onPick={setModelDraft}
        onRefresh={refreshCatalog}
      />

      {/* opt-in */}
      <label className="flex items-start gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={optInDraft}
          onChange={(e) => setOptInDraft(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-[11.5px] leading-relaxed text-fg-2">
          我明确同意：使用 AI 顾问类功能时，将我的照片降采样版本上传给 OpenRouter 及其背后的模型提供商
          （OpenAI / Google / Anthropic 等），用于本次分析。OpenRouter 的数据处理政策请参见其
          <a
            href="https://openrouter.ai/terms"
            target="_blank"
            rel="noreferrer"
            className="underline mx-1 hover:text-brand-amber"
          >
            服务条款
          </a>
          。不勾选此项时，所有 AI 能力保持完全本地运行。
        </span>
      </label>

      {/* 操作按钮 */}
      <div className="flex gap-2 items-center flex-wrap">
        <button
          type="button"
          className="btn-primary text-[12px]"
          disabled={!canSave}
          onClick={() => {
            const patch: LLMConfigInput = { provider: 'openrouter' }
            if (pendingKey) patch.apiKey = apiKeyDraft.trim()
            if (pendingModel) patch.model = modelDraft.trim() || ''
            if (pendingOptIn) patch.optInUploadImages = optInDraft
            void applyPatch(patch)
          }}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          保存
        </button>

        <button
          type="button"
          className="btn-secondary text-[12px]"
          disabled={!hasConfig || testState.status === 'running'}
          onClick={() => void runTest()}
        >
          {testState.status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          测试连接
        </button>

        {hasConfig ? (
          <button
            type="button"
            className="btn-ghost text-[12px] text-red-400"
            onClick={() => void clearAll()}
          >
            清除配置
          </button>
        ) : null}

        {testState.status === 'done' ? <TestResultBadge r={testState.result} /> : null}
      </div>

      {saveError ? (
        <div className="text-[11px] text-red-400 flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5" />
          保存失败：{saveError}
        </div>
      ) : null}
    </div>
  )
}

// ==================== ModelPicker 子组件 ====================

interface ModelPickerProps {
  hasApiKey: boolean
  catalog: LLMModelCatalog | null
  loading: boolean
  current: string
  manualMode: boolean
  onToggleManual: () => void
  onPick: (id: string) => void
  onRefresh: () => void
}

function ModelPicker({
  hasApiKey,
  catalog,
  loading,
  current,
  manualMode,
  onToggleManual,
  onPick,
  onRefresh,
}: ModelPickerProps): JSX.Element {
  const showFallbackHint = !!catalog?.fallback
  const usingLiveCatalog = !!catalog && !catalog.fallback && catalog.fetchedAt !== null
  const models = catalog?.models ?? []
  const recommended = catalog?.recommended ?? []

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11.5px] text-fg-2">默认模型</label>
        <div className="flex items-center gap-2 text-[10.5px]">
          <button
            type="button"
            className="text-fg-3 hover:text-fg-1 flex items-center gap-1"
            onClick={onRefresh}
            disabled={!hasApiKey || loading}
            title={hasApiKey ? '从 OpenRouter 刷新模型目录' : '请先保存 apiKey'}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            刷新目录
          </button>
          <span className="text-fg-3">·</span>
          <button type="button" className="text-fg-3 hover:text-fg-1" onClick={onToggleManual}>
            {manualMode ? '下拉选择' : '手动输入 ID'}
          </button>
        </div>
      </div>

      {/* 推荐三档快速选择（未进手动模式时显示） */}
      {!manualMode && recommended.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {recommended.map((r) => {
            const active = r.model.id === current
            return (
              <button
                key={r.tier}
                type="button"
                onClick={() => onPick(r.model.id)}
                className={`px-2 py-1 rounded text-[10.5px] border transition-all ${
                  active
                    ? 'border-brand-amber/60 bg-brand-amber/10 text-brand-amber'
                    : 'border-bg-1 hover:border-bg-2 text-fg-2'
                }`}
                title={r.reason}
              >
                <span className="font-medium">{tierLabel(r.tier)}</span>
                <span className="text-fg-3 ml-1">· {r.model.id}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {/* 主控件：下拉 or 手动输入 */}
      {manualMode ? (
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          className="input w-full font-mono text-[12px]"
          placeholder="anthropic/claude-opus-4.7"
          value={current}
          onChange={(e) => onPick(e.target.value)}
        />
      ) : (
        <select className="input w-full text-[12px]" value={current} onChange={(e) => onPick(e.target.value)}>
          <option value="">— 选择模型 —</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {renderModelOption(m)}
            </option>
          ))}
          {/* 若当前保存的模型不在目录里（可能是用户手动输入过），仍要保留展示 */}
          {current && !models.some((m) => m.id === current) ? (
            <option value={current}>{current}（自定义）</option>
          ) : null}
        </select>
      )}

      <div className="text-[10.5px] text-fg-3">
        {!hasApiKey ? (
          <>先保存 apiKey 后才能从 OpenRouter 拉取实时模型目录</>
        ) : showFallbackHint ? (
          <span className="text-amber-400">
            ⚠ 目录拉取失败（{fallbackHint(catalog!.fallback!)}），当前为内置兜底列表（可能已过时） ·
            稍后点击「刷新目录」重试
          </span>
        ) : usingLiveCatalog ? (
          <>
            实时目录 · 共 {models.length} 个支持图像输入的模型 · 最后刷新{' '}
            {new Date(catalog!.fetchedAt!).toLocaleTimeString()}
          </>
        ) : (
          <>准备就绪，点击「刷新目录」拉取模型</>
        )}
      </div>
    </div>
  )
}

function tierLabel(tier: 'flagship' | 'balanced' | 'cheap'): string {
  if (tier === 'flagship') return '旗舰'
  if (tier === 'balanced') return '推荐'
  return '经济'
}

function renderModelOption(m: LLMModelEntry): string {
  const price = m.isFree ? '免费' : `$${m.pricePromptPerMTok.toFixed(m.pricePromptPerMTok < 1 ? 2 : 1)}/M`
  const ctx =
    m.contextLength >= 1_000_000
      ? `${(m.contextLength / 1_000_000).toFixed(1)}M ctx`
      : `${Math.round(m.contextLength / 1000)}K ctx`
  return `${m.name} · ${ctx} · ${price}`
}

function fallbackHint(kind: NonNullable<LLMModelCatalog['fallback']>): string {
  if (kind === 'no-config') return '未配置 apiKey'
  if (kind === 'invalid-key') return 'apiKey 无效'
  if (kind === 'rate-limit') return '速率限制'
  if (kind === 'network') return '网络错误'
  return '未知错误'
}

// ==================== TestResultBadge 子组件 ====================

function TestResultBadge({ r }: { r: LLMTestResult }): JSX.Element {
  if (r.ok) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {r.message}（{r.latencyMs}ms）
      </span>
    )
  }
  const hint =
    r.errorKind === 'invalid-key'
      ? 'apiKey 无效或被拒绝'
      : r.errorKind === 'rate-limit'
        ? '触发速率限制，稍后再试'
        : r.errorKind === 'no-config'
          ? r.message
          : r.errorKind === 'network'
            ? r.message
            : r.message
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-red-400">
      <XCircle className="w-3.5 h-3.5" />
      {hint}
    </span>
  )
}
