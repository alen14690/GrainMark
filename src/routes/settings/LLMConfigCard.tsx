/**
 * LLMConfigCard · M5-LLM-A
 *
 * Settings → AI 标签页的子组件，承担：
 *   1. OpenRouter apiKey 配置（存 SecureVault）
 *   2. 图像上传 opt-in 同意（默认 false —— 不配 = 不上传）
 *   3. 连通性测试（打 /models 端点）
 *
 * 设计约束：
 *   - 不显示 apiKey 明文；已保存时只显示 masked 前 4 位 + 后 4 位
 *   - 用户未勾选 optIn 时，所有走网络的 LLM 能力将在后续 IPC 层被拒绝
 *   - 输入框是 type="password" + autocomplete="off"，防浏览器/扩展记忆
 */
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { LLMConfigInput, LLMConfigPublic, LLMTestResult } from '../../../shared/types'
import { ipc } from '../../lib/ipc'

type TestState = { status: 'idle' } | { status: 'running' } | { status: 'done'; result: LLMTestResult }

export function LLMConfigCard(): JSX.Element {
  const [cfg, setCfg] = useState<LLMConfigPublic | null>(null)
  const [apiKeyDraft, setApiKeyDraft] = useState<string>('')
  const [modelDraft, setModelDraft] = useState<string>('')
  const [optInDraft, setOptInDraft] = useState<boolean>(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testState, setTestState] = useState<TestState>({ status: 'idle' })

  useEffect(() => {
    ipc('llm:getConfig').then((c) => {
      setCfg(c)
      setModelDraft(c.model ?? '')
      setOptInDraft(c.optInUploadImages)
    })
  }, [])

  const applyPatch = async (patch: LLMConfigInput) => {
    setSaving(true)
    setSaveError(null)
    try {
      const next = await ipc('llm:setConfig', patch)
      setCfg(next)
      setApiKeyDraft('') // 清空输入框（已写入 vault）
      setModelDraft(next.model ?? '')
      setOptInDraft(next.optInUploadImages)
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
        <div className="flex gap-2">
          <input
            id="or-apikey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="input flex-1 font-mono text-[12px]"
            placeholder={
              hasConfig ? `已保存：${cfg.apiKeyMasked ?? '****'}（输入新值以替换）` : 'sk-or-v1-...'
            }
            value={apiKeyDraft}
            onChange={(e) => setApiKeyDraft(e.target.value)}
          />
        </div>
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

      {/* model */}
      <div className="space-y-1.5">
        <label className="text-[11.5px] text-fg-2" htmlFor="or-model">
          默认模型
        </label>
        <input
          id="or-model"
          type="text"
          autoComplete="off"
          spellCheck={false}
          className="input font-mono text-[12px]"
          placeholder="google/gemini-2.0-flash-exp"
          value={modelDraft}
          onChange={(e) => setModelDraft(e.target.value)}
        />
        <div className="text-[10.5px] text-fg-3">
          推荐：<code className="text-fg-2">google/gemini-2.0-flash-exp</code>（多模态 / 低成本） ·
          <code className="text-fg-2 ml-1">openai/gpt-4o-mini</code>（质量稳定）
        </div>
      </div>

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
