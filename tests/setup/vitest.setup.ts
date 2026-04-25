/**
 * Vitest 全局 setup
 * - 扩展 expect 断言
 * - 静默无关日志
 */
import { expect } from 'vitest'
import { colorMatchers } from '../utils/colorMatchers'
import { imageMatchers } from '../utils/imageMatcher'

expect.extend({
  ...colorMatchers,
  ...imageMatchers,
})

// 抑制非关键日志，保持测试输出干净
const origError = console.error
console.error = (...args: unknown[]) => {
  const msg = String(args[0] ?? '')
  // 过滤掉已知的非关键日志
  if (msg.includes('[exif] read failed')) return
  origError(...args)
}
