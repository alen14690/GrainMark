/**
 * namingTemplate benchmark
 *
 * 覆盖：
 *   - sanitizeFilename 对常规 / 异常文件名
 *   - renderNamingTemplate 典型模板
 *   - resolveConflict 在 0 / 10 / 100 次冲突下的吞吐
 *
 * 红线参考：批处理 1000 张时命名逻辑不应成为瓶颈
 * 期望：单次 render < 0.01ms（1000 张总耗时 < 10ms）
 */
import { bench, describe } from 'vitest'
import {
  renderNamingTemplate,
  resolveConflict,
  sanitizeFilename,
} from '../../electron/services/batch/namingTemplate'

describe('namingTemplate · sanitizeFilename', () => {
  bench('干净名（no-op）', () => {
    sanitizeFilename('DSC01234_portrait-HDR.jpg')
  })
  bench('含路径分隔符', () => {
    sanitizeFilename('/Users/x/../../etc/passwd:suspicious')
  })
  bench('混合非法字符', () => {
    sanitizeFilename('aa<bb>cc"dd|ee*ff?gg\\hh/ii:jj')
  })
})

describe('namingTemplate · renderNamingTemplate', () => {
  const baseVars = {
    name: 'DSC01234',
    filter: 'kodak-portra-400',
    timestamp: new Date('2026-04-25T20:00:00+08:00').getTime(),
    model: 'ILCE-7SM3',
    iso: 200,
    index: 42,
    ext: 'jpg',
  }

  bench('默认模板 {name}_{filter}_{index}.{ext}', () => {
    renderNamingTemplate('{name}_{filter}_{index}.{ext}', baseVars)
  })
  bench('富模板（全 9 变量）', () => {
    renderNamingTemplate('{date}_{time}_{model}_{iso}_{name}_{filter}_{index}.{ext}', baseVars)
  })
})

describe('namingTemplate · resolveConflict', () => {
  bench('0 次冲突（直返）', () => {
    resolveConflict('hello.jpg', () => false)
  })
  bench('5 次冲突', () => {
    let n = 0
    resolveConflict('hello.jpg', () => n++ < 5)
  })
  bench('50 次冲突', () => {
    let n = 0
    resolveConflict('hello.jpg', () => n++ < 50)
  })
})
