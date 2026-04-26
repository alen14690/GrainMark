/**
 * CSP connect-src / img-src 一致性契约（2026-04-27 新增）
 *
 * 背景：
 *   老 dev 模式 meta CSP 的 `connect-src` 不含 `data: blob: grain:`，
 *   但 `img-src` 含三者。结果：<img src="grain://..."> 能显示，
 *   而 fetch("grain://...") → `Failed to fetch`（CSP 阻止）。
 *   useWebGLPreview 通过 fetch sourceUrl 转 ImageBitmap → 挂掉 →
 *   webglFatal → 用户看到原图但调色不生效。这是核心滤镜功能的致命 bug。
 *
 * 契约：
 *   凡是 img-src 允许的协议（data/blob/grain），connect-src 必须也允许，
 *   否则 renderer 层的 fetch 会绕过 <img> 友好路径直接被 CSP 拒。
 *
 * 守门员：
 *   静态扫 index.html（dev meta CSP）+ electron/main.ts（setupSessionCSP 生产 CSP），
 *   提取 img-src 和 connect-src 的 scheme 集合，断言 img-src ⊆ connect-src（对 data/blob/grain）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../..')

function extractDirective(csp: string, directive: string): string[] {
  // 正则：directive ... ; 或 directive ... $
  const re = new RegExp(`${directive}\\s+([^;]+)(?:;|$)`, 'i')
  const m = csp.match(re)
  if (!m) return []
  return m[1]!
    .trim()
    .split(/\s+/)
    .filter((x) => x.length > 0)
}

function extractCspFromHtml(filePath: string): string | null {
  const src = fs.readFileSync(filePath, 'utf-8')
  // <meta http-equiv="Content-Security-Policy" content="...">
  const m = src.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)
  return m?.[1] ?? null
}

function extractCspFromMainTs(filePath: string): string | null {
  const src = fs.readFileSync(filePath, 'utf-8')
  // 查 setupSessionCSP 里用 "..." 拼 CSP 字符串的数组
  // 简化：搜连续的 "<directive ...>" 字符串字面量，拼起来
  // 更稳：匹配注入 CSP 的具体 literal 块
  const literals = Array.from(src.matchAll(/"([^"]*(?:src|uri|action)[^"]*)"/g)).map((m) => m[1])
  if (literals.length === 0) return null
  return literals.filter(Boolean).join('; ')
}

const SCHEMES_MUST_ALIGN = ['data:', 'blob:', 'grain:']

describe('CSP connect-src / img-src 一致性契约', () => {
  it('dev 模式 meta CSP（index.html）：img-src 允许的 data/blob/grain，connect-src 也必须允许', () => {
    const csp = extractCspFromHtml(path.join(ROOT, 'index.html'))
    expect(csp, '未找到 index.html 的 meta CSP').not.toBeNull()

    const imgSrc = extractDirective(csp!, 'img-src')
    const connectSrc = extractDirective(csp!, 'connect-src')

    const imgAllows = SCHEMES_MUST_ALIGN.filter((s) => imgSrc.includes(s))
    const connectDeny = imgAllows.filter((s) => !connectSrc.includes(s))

    expect(
      connectDeny,
      `img-src 允许但 connect-src 拒绝的协议：${connectDeny.join(', ')}\n` +
        `这会让 fetch('${connectDeny[0] ?? 'data:...'}...') 报 "Failed to fetch"\n` +
        `img-src: ${imgSrc.join(' ')}\nconnect-src: ${connectSrc.join(' ')}`,
    ).toEqual([])
  })

  it('生产 CSP（electron/main.ts）：img-src 允许的 data/blob/grain，connect-src 也必须允许', () => {
    const csp = extractCspFromMainTs(path.join(ROOT, 'electron/main.ts'))
    expect(csp, '未找到 electron/main.ts 的生产 CSP').not.toBeNull()

    const imgSrc = extractDirective(csp!, 'img-src')
    const connectSrc = extractDirective(csp!, 'connect-src')

    const imgAllows = SCHEMES_MUST_ALIGN.filter((s) => imgSrc.includes(s))
    const connectDeny = imgAllows.filter((s) => !connectSrc.includes(s))

    expect(connectDeny, `生产 CSP 里 img-src 允许但 connect-src 拒绝：${connectDeny.join(', ')}`).toEqual([])
  })
})
