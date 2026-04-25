/**
 * namingTemplate 单元测试
 */
import { describe, expect, it } from 'vitest'
import {
  renderNamingTemplate,
  resolveConflict,
  sanitizeFilename,
} from '../../electron/services/batch/namingTemplate'

const T = new Date('2026-04-25T18:00:30').getTime()

describe('sanitizeFilename', () => {
  it('去除路径分隔符', () => {
    expect(sanitizeFilename('a/b\\c:d.jpg')).toBe('a-b-c-d.jpg')
  })
  it('去除 Windows 非法字符 *?"<>|', () => {
    expect(sanitizeFilename('why*?"<>|yes')).toBe('why-yes')
  })
  it('去除 .. 防穿越', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('etc-passwd')
  })
  it('合并连续 -', () => {
    expect(sanitizeFilename('a-----b')).toBe('a-b')
  })
  it('去除首尾 . 和 -（防 hidden file）', () => {
    expect(sanitizeFilename('.hidden')).toBe('hidden')
    expect(sanitizeFilename('-lead-')).toBe('lead')
  })
  it('空字符串 → unnamed', () => {
    expect(sanitizeFilename('')).toBe('unnamed')
    expect(sanitizeFilename('///')).toBe('unnamed')
  })
  it('NUL 字节与控制字符', () => {
    expect(sanitizeFilename('a\x00b\x1fc')).toBe('a-b-c')
  })
})

describe('renderNamingTemplate', () => {
  const base = {
    name: 'DSC1234',
    filter: 'portra',
    timestamp: T,
    model: 'Sony A7M4',
    iso: 400,
    index: 7,
    ext: 'jpg',
  }

  it('默认模板 {name}_{filter}_{date}', () => {
    expect(renderNamingTemplate('{name}_{filter}_{date}', base)).toBe('DSC1234_portra_20260425.jpg')
  })
  it('{time} 格式 HHmmss', () => {
    expect(renderNamingTemplate('{name}_{time}', base)).toBe('DSC1234_180030.jpg')
  })
  it('{datetime} 合并', () => {
    expect(renderNamingTemplate('{datetime}', base)).toBe('20260425180030.jpg')
  })
  it('{index} 4 位零填充', () => {
    expect(renderNamingTemplate('{index}_{name}', base)).toBe('0007_DSC1234.jpg')
  })
  it('{model} 含空格 → 保留（因不是路径字符）', () => {
    expect(renderNamingTemplate('{model}_{iso}', base)).toBe('Sony A7M4_400.jpg')
  })
  it('{model} 未知 → unknown', () => {
    expect(renderNamingTemplate('{model}', { ...base, model: undefined })).toBe('unknown.jpg')
  })
  it('{iso} 未知 → 0', () => {
    expect(renderNamingTemplate('{iso}', { ...base, iso: undefined })).toBe('0.jpg')
  })
  it('未知变量保留原形', () => {
    // sanitizeFilename 不替换 {}（非路径非法字符），所以原样保留
    expect(renderNamingTemplate('{unknown}_{name}', base)).toBe('{unknown}_DSC1234.jpg')
  })
  it('自带 {ext} → 不重复加扩展名', () => {
    expect(renderNamingTemplate('{name}.{ext}', base)).toBe('DSC1234.jpg')
  })
  it('超长文件名会截断（保持 ext）', () => {
    const longName = 'x'.repeat(500)
    const out = renderNamingTemplate('{name}', { ...base, name: longName })
    expect(out.length).toBeLessThanOrEqual(200)
    expect(out.endsWith('.jpg')).toBe(true)
  })
  it('filter 含路径字符时清洗', () => {
    expect(renderNamingTemplate('{filter}', { ...base, filter: 'path/../bad' })).toBe('path-bad.jpg')
  })
})

describe('resolveConflict', () => {
  it('无冲突 → 原名返回', () => {
    expect(resolveConflict('a.jpg', () => false)).toBe('a.jpg')
  })
  it('一次冲突 → a_1.jpg', () => {
    const taken = new Set(['a.jpg'])
    expect(resolveConflict('a.jpg', (n) => taken.has(n))).toBe('a_1.jpg')
  })
  it('连续冲突 → 递增', () => {
    const taken = new Set(['a.jpg', 'a_1.jpg', 'a_2.jpg'])
    expect(resolveConflict('a.jpg', (n) => taken.has(n))).toBe('a_3.jpg')
  })
  it('无扩展名也能 suffix', () => {
    const taken = new Set(['a'])
    expect(resolveConflict('a', (n) => taken.has(n))).toBe('a_1')
  })
  it('maxSuffix 用完 → 加时间戳', () => {
    // 模拟 exists 对前 5 个全 true
    const exists = (n: string) => /^a(_\d+)?\.jpg$/.test(n) && Number(n.match(/_(\d+)/)?.[1] ?? 0) <= 5
    const result = resolveConflict('a.jpg', exists, 5)
    expect(result).toMatch(/^a_\d{10,}\.jpg$/) // 时间戳
  })
})
