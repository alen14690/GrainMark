import type { LLMTestResult } from '../../../shared/types.js'
/**
 * LLM 网络客户端（M5-LLM-A · OpenRouter only）
 *
 * 本文件职责：**仅做连通性测试**（llm:testConnection IPC 的后端）。
 * 真正的图像分析路径在 M5-LLM-B 再加。
 *
 * 安全约束（AGENTS.md 第 3 条 · 安全兜底）：
 *   - 目的端 host 严格白名单（openrouter.ai），拒绝任意 endpoint 注入
 *   - apiKey 仅从 configStore 读，**绝不落 log**（logger 已脱敏模式已覆盖 apiKey / Authorization）
 *   - User-Agent 固定为本产品标识（OpenRouter 要求）
 *   - HTTPS only：URL 构造器硬编码 https，不允许从配置读协议
 *   - 请求超时 10s：防止慢速攻击 / apiKey 被用来做慢 DoS
 *   - 错误信息不透传原始 response body（可能含服务器信息），只给分类
 */
import { logger } from '../logger/logger.js'
import { getApiKeyForInternalUse, getPublicConfig } from './configStore.js'

/** 白名单域名 —— 硬编码，不接受配置 */
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const MODELS_ENDPOINT = `${OPENROUTER_BASE}/models`

const TEST_TIMEOUT_MS = 10_000

/**
 * 打 OpenRouter `/models` 列表端点（该端点用 Bearer Auth 校验 apiKey 有效性，
 * 成功返回 JSON 列表；错误返回 401/403/429）。
 * 不计费（`/models` 是免费的 metadata 端点）。
 */
export async function testConnection(): Promise<LLMTestResult> {
  const pub = getPublicConfig()
  if (!pub.hasApiKey || pub.provider !== 'openrouter') {
    return {
      ok: false,
      latencyMs: 0,
      message: '未配置 OpenRouter apiKey',
      errorKind: 'no-config',
    }
  }

  const apiKey = getApiKeyForInternalUse()
  if (!apiKey) {
    // vault 读失败（safeStorage 异常等）
    return {
      ok: false,
      latencyMs: 0,
      message: '凭证读取失败（系统加密不可用？）',
      errorKind: 'invalid-key',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)
  const t0 = Date.now()
  try {
    const resp = await fetch(MODELS_ENDPOINT, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://grainmark.app',
        'X-Title': 'GrainMark',
        'User-Agent': 'GrainMark/0.1 (+llm-probe)',
      },
      signal: controller.signal,
    })
    const latencyMs = Date.now() - t0

    if (resp.ok) {
      // 只做 shape sanity check，不解析全部（可能数百模型）
      const data = (await resp.json().catch(() => null)) as { data?: unknown[] } | null
      const count = Array.isArray(data?.data) ? data!.data!.length : 0
      return {
        ok: true,
        latencyMs,
        message: count > 0 ? `连接成功（${count} 个可用模型）` : '连接成功',
      }
    }

    const errorKind = classifyStatus(resp.status)
    // 不透传 response body，仅返回分类
    logger.warn('llm.test.http', { status: resp.status, kind: errorKind })
    return {
      ok: false,
      latencyMs,
      message: `HTTP ${resp.status}`,
      errorKind,
    }
  } catch (err) {
    const latencyMs = Date.now() - t0
    const msg = (err as Error).message
    // 不把原始错误栈回传 renderer
    logger.warn('llm.test.failed', { err: msg })
    return {
      ok: false,
      latencyMs,
      message: isAbortError(err) ? '请求超时（10s）' : '网络错误',
      errorKind: 'network',
    }
  } finally {
    clearTimeout(timer)
  }
}

function classifyStatus(status: number): LLMTestResult['errorKind'] {
  if (status === 401 || status === 403) return 'invalid-key'
  if (status === 429) return 'rate-limit'
  return 'unknown'
}

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError'
}
