/**
 * LLM IPC Zod schema 边界测试 — M5-LLM-A
 *
 * 安全红线场景：
 *   - apiKey 含 CRLF → HTTP 头注入风险 → 必须拒绝
 *   - apiKey 前后有空白 → 用户粘贴常见错误 + schema 严格拒绝
 *   - apiKey 极短（<16）→ 防空键 / 测试桩误上传
 *   - apiKey 极长（>256）→ 防 DoS 内存放大
 *   - provider 非白名单 → 防未来扩展时混入恶意值
 *   - model id 带路径穿越字符（/ 合法，但 .. 不应合法）
 *   - 多余字段（未知 key）→ strict 拒绝，防 schema 扩展被偷渡
 */
import { describe, expect, it } from 'vitest'
import {
  LLMApiKeySchema,
  LLMConfigInputSchema,
  LLMModelIdSchema,
  LLMProviderSchema,
} from '../../shared/ipc-schemas'

describe('LLMProviderSchema · 白名单', () => {
  it('openrouter 放行', () => {
    expect(() => LLMProviderSchema.parse('openrouter')).not.toThrow()
  })
  it.each(['openai', 'gemini', 'OPENROUTER', '', 'openrouter ', 'openrouter\n'])(
    '非白名单/大小写变种/空白 "%s" 拒绝',
    (bad) => {
      expect(() => LLMProviderSchema.parse(bad)).toThrow()
    },
  )
})

describe('LLMApiKeySchema · 安全边界', () => {
  it('正常的 sk-or 前缀 key 通过', () => {
    expect(() => LLMApiKeySchema.parse('sk-or-v1-abcdef-0123456789ABCD')).not.toThrow()
  })

  it('长度 <16 拒绝（防空键 / 测试占位）', () => {
    expect(() => LLMApiKeySchema.parse('sk-or-short')).toThrow()
  })

  it('长度 >256 拒绝（防 DoS 内存放大）', () => {
    expect(() => LLMApiKeySchema.parse('a'.repeat(257))).toThrow()
  })

  it('含 CR 或 LF 拒绝（防 HTTP 头注入 → 如果通过会被用户 apiKey 带入 Authorization 头）', () => {
    expect(() => LLMApiKeySchema.parse('sk-or-v1-abcdef\r\nX-Evil: 1234')).toThrow()
    expect(() => LLMApiKeySchema.parse('sk-or-v1-abcdef\nfoo')).toThrow()
  })

  it('含控制字符 / 非 ASCII 拒绝', () => {
    expect(() => LLMApiKeySchema.parse('sk-or-v1-\u0000-abcdef-xxxxxxxx')).toThrow()
    expect(() => LLMApiKeySchema.parse('sk-or-v1-中文注入-0123456789ab')).toThrow()
  })

  it('前后带空白拒绝（强制前端 trim）', () => {
    expect(() => LLMApiKeySchema.parse(' sk-or-v1-abcdef-0123456789ABCD')).toThrow()
    expect(() => LLMApiKeySchema.parse('sk-or-v1-abcdef-0123456789ABCD ')).toThrow()
    expect(() => LLMApiKeySchema.parse('sk-or-v1-abcdef-0123456789ABCD\t')).toThrow()
  })
})

describe('LLMModelIdSchema · 格式', () => {
  it('vendor/model[:tag] 合法形式通过', () => {
    const cases = [
      'openai/gpt-4o-mini',
      'google/gemini-2.0-flash-exp',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3.5-sonnet:beta',
      'meta-llama/llama-3.1-70b-instruct',
    ]
    for (const c of cases) {
      expect(() => LLMModelIdSchema.parse(c), c).not.toThrow()
    }
  })

  it('空 / 过长 / 空格 / 中文拒绝', () => {
    expect(() => LLMModelIdSchema.parse('')).toThrow()
    expect(() => LLMModelIdSchema.parse('a'.repeat(129))).toThrow()
    expect(() => LLMModelIdSchema.parse('openai/gpt 4')).toThrow()
    expect(() => LLMModelIdSchema.parse('openai/模型')).toThrow()
  })

  it('首尾是非字母数字 / 含 CRLF 拒绝', () => {
    expect(() => LLMModelIdSchema.parse('/openai/gpt-4o')).toThrow()
    expect(() => LLMModelIdSchema.parse('openai/gpt-4o/')).toThrow()
    expect(() => LLMModelIdSchema.parse('openai/gpt\n4o')).toThrow()
  })
})

describe('LLMConfigInputSchema · 组合契约', () => {
  it('所有字段可选 —— 空对象通过（代表"no-op patch"）', () => {
    expect(() => LLMConfigInputSchema.parse({})).not.toThrow()
  })

  it('apiKey=null 通过（明确清空语义）', () => {
    expect(() => LLMConfigInputSchema.parse({ apiKey: null })).not.toThrow()
  })

  it('多余字段拒绝（strict 模式防偷渡未来字段）', () => {
    expect(() =>
      LLMConfigInputSchema.parse({
        provider: 'openrouter',
        endpoint: 'https://evil.com/v1', // 未来想加就必须显式扩 schema
      }),
    ).toThrow()
  })

  it('组合合法输入通过', () => {
    expect(() =>
      LLMConfigInputSchema.parse({
        provider: 'openrouter',
        model: 'google/gemini-2.0-flash-exp',
        apiKey: 'sk-or-v1-valid-key-0123456789',
        optInUploadImages: true,
      }),
    ).not.toThrow()
  })
})
