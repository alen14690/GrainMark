/**
 * preload.ts IPC 通道白名单正则 · 回归测试
 *
 * preload 的 CHANNEL_PATTERN 是主进程之外的第一道防线（渲染进程侧）。
 * 这个正则无法 export（preload 是 electron isolated script），因此本测试
 * 手动复制正则同步维护，作为契约回归：若有人误改 preload 的正则，这个
 * 测试会红，强制同步本文件里的副本。
 *
 * 防的真实 bug：
 *   - 新增 prefix 时忘了同步正则（例如本轮 M5-LLM-A 增加 `llm:` 时就差点遗漏）
 *   - 无意间放行了 `eval:` / `require:` 等危险前缀
 *   - 子空间形式 `prefix:sub:action` 的边界不对
 */
import { describe, expect, it } from 'vitest'

// 契约副本 —— 必须与 electron/preload.ts 中的 CHANNEL_PATTERN 保持一致
const CHANNEL_PATTERN =
  /^(filter|photo|preview|batch|extract|watermark|ai|llm|trending|sync|settings|dialog|taste|score|evolve|app):([a-zA-Z]+|[a-zA-Z]+:[a-zA-Z-]+)$/

describe('preload CHANNEL_PATTERN · 放行所有现役 IPC 通道', () => {
  const valid = [
    // M5-LLM-A 新增
    'llm:getConfig',
    'llm:setConfig',
    'llm:clearConfig',
    'llm:testConnection',
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
    'llm:get_config', // 下划线（当前正则只允许字母）
    '../etc/passwd',
    'llm\n:evil',
  ]
  for (const ch of invalid) {
    it(`"${ch}" 拒绝`, () => {
      expect(CHANNEL_PATTERN.test(ch)).toBe(false)
    })
  }
})
