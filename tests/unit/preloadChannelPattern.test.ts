/**
 * preload.ts IPC 通道白名单正则 · 回归测试(2026-05-01 加强版)
 *
 * preload 的 CHANNEL_PATTERN 是主进程之外的第一道防线(渲染进程侧)。
 * 这个正则无法 export(preload 是 electron isolated script),因此本测试:
 *   1. 维护一份手动同步的副本
 *   2. **新增强契约** · 真正读取 `electron/preload.ts` 源码,提取其中 CHANNEL_PATTERN
 *      字面量,与副本对比字符串相等 —— 防止漂移(历史曾出现过副本缺 `frame|perf` /
 *      多出 `taste|score|evolve` 的错位)
 *
 * 防的真实 bug:
 *   - 新增 prefix 时忘了同步正则(本轮 M-Frame 增加 `frame:` 差点又漏)
 *   - 无意间放行了 `eval:` / `require:` 等危险前缀
 *   - 子空间形式 `prefix:sub:action` 的边界不对
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

// 契约副本 —— 必须与 electron/preload.ts 中的 CHANNEL_PATTERN 保持一致
// 2026-05-01:修复副本漂移(原副本缺 frame|perf、多 taste|score|evolve)并新增 frame 前缀
const CHANNEL_PATTERN =
  /^(filter|photo|preview|batch|extract|watermark|frame|ai|llm|trending|sync|settings|dialog|app|perf):([a-zA-Z]+|[a-zA-Z]+:[a-zA-Z-]+)$/

describe('preload CHANNEL_PATTERN · 放行所有现役 IPC 通道', () => {
  const valid = [
    // M5-LLM-A 新增
    'llm:getConfig',
    'llm:setConfig',
    'llm:clearConfig',
    'llm:testConnection',
    // M-Frame 新增(2026-05-01)
    'frame:templates',
    'frame:render',
    // 既有
    'filter:list',
    'photo:import',
    'preview:render',
    'batch:start',
    'batch:gpu:ready',
    'batch:gpu:task',
    'settings:get',
    'dialog:selectFiles',
    'app:navigate',
    'watermark:templates',
    'watermark:render',
    'perf:metrics',
  ]
  for (const ch of valid) {
    it(`"${ch}" 通过`, () => {
      expect(CHANNEL_PATTERN.test(ch)).toBe(true)
    })
  }
})

describe('preload CHANNEL_PATTERN · 拒绝非法 / 危险通道', () => {
  const invalid = [
    '',
    ' ',
    'eval:run',
    'require:module',
    'llm:', // 没有 action
    ':getConfig', // 没有 prefix
    'LLM:getConfig', // 大写前缀
    'llm:get config', // 空格
    'llm:get:config:extra', // 三段
    'llm:get_config', // 下划线(当前正则只允许字母)
    '../etc/passwd',
    'llm\n:evil',
    'unknown:action', // 未登记前缀
  ]
  for (const ch of invalid) {
    it(`"${ch}" 拒绝`, () => {
      expect(CHANNEL_PATTERN.test(ch)).toBe(false)
    })
  }
})

describe('preload CHANNEL_PATTERN · 副本与 electron/preload.ts 源码对齐(强契约)', () => {
  it('副本字符串与 preload 源码一致', () => {
    const preloadPath = path.resolve(__dirname, '../../electron/preload.ts')
    const src = fs.readFileSync(preloadPath, 'utf-8')

    // 匹配形如:
    //   const CHANNEL_PATTERN =
    //     /^(filter|...):(...)$/
    //
    // 允许换行和空白,但只取第一个字面量。
    const match = src.match(/const\s+CHANNEL_PATTERN\s*=\s*(\/\^.+?\$\/)/s)
    expect(match, 'preload.ts 中未能找到 CHANNEL_PATTERN 字面量;是否重构后换了形式?').toBeTruthy()
    if (!match) return
    const sourceRegexStr = match[1]
    expect(sourceRegexStr).toBe(CHANNEL_PATTERN.toString())
  })
})
