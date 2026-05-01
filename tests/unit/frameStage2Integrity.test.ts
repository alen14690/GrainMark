/**
 * frame 阶段 2 尾声闭环测试 · 8 风格完整性契约
 *
 * 必保 8 风格:minimal-bar / polaroid-classic / film-full-border / gallery-black /
 *            gallery-white / editorial-caption / spine-edition / hairline
 *
 * 契约(AGENTS.md 第 4 条):
 *   - 每个必保风格都应在 listFrameStyles 返回
 *   - renderFrame 对每个必保风格**不应抛**"尚未实装"(允许 Sharp 文件错)
 *   - 每个必保风格的 landscape/portrait 都必须含至少 1 个 slot
 *
 * 这是"阶段 2 完成状态"的回归护栏 —— 未来阶段 3 加风格时,本测试会捕获
 * "忘了挂 generator"或"忘了给 portrait 定义 slot"等低级错误。
 */
import { describe, expect, it } from 'vitest'
import { listFrameStyles } from '../../electron/services/frame/registry'
import { renderFrame } from '../../electron/services/frame/renderer'
import type { FrameStyleId, FrameStyleOverrides } from '../../shared/types'

const MUST_HAVE_STYLES: FrameStyleId[] = [
  'minimal-bar',
  'polaroid-classic',
  'film-full-border',
  'gallery-black',
  'gallery-white',
  'editorial-caption',
  'spine-edition',
  'hairline',
]

const EMPTY_OVERRIDES: FrameStyleOverrides = {
  showFields: {
    make: true,
    model: true,
    lens: true,
    aperture: true,
    shutter: true,
    iso: true,
    focalLength: true,
    dateTime: true,
    artist: false,
    location: false,
  },
}

describe('阶段 2 完整性契约 · 必保 8 风格', () => {
  it('listFrameStyles 包含所有必保 8 风格', () => {
    const ids = listFrameStyles().map((s) => s.id)
    for (const must of MUST_HAVE_STYLES) {
      expect(ids).toContain(must)
    }
    expect(ids.length).toBeGreaterThanOrEqual(MUST_HAVE_STYLES.length)
  })

  it('每个必保风格的 landscape 和 portrait 都有至少 1 个 slot', () => {
    const styles = listFrameStyles()
    for (const id of MUST_HAVE_STYLES) {
      const s = styles.find((x) => x.id === id)
      expect(s, `风格 ${id} 未注册`).toBeTruthy()
      expect(s?.landscape.slots.length, `${id}.landscape slots 为空`).toBeGreaterThan(0)
      expect(s?.portrait.slots.length, `${id}.portrait slots 为空`).toBeGreaterThan(0)
    }
  })

  it('renderFrame 对每个必保风格都不抛"尚未实装"(可能抛 Sharp 错,但不是 NotImplemented)', async () => {
    for (const id of MUST_HAVE_STYLES) {
      let err: Error | null = null
      try {
        await renderFrame('/tmp/nonexistent-stage2.jpg', id, EMPTY_OVERRIDES)
      } catch (e) {
        err = e as Error
      }
      expect(err, `${id} 应当抛错(文件不存在),而非静默成功`).toBeTruthy()
      expect(err?.message ?? '', `${id} 抛的错含"尚未实装"——generator 未挂`).not.toMatch(/尚未实装/)
    }
  })
})
