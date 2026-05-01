/**
 * frame 阶段 3 完整性契约 · 可选 4 风格
 *
 * 阶段 3 追加的 4 个可选风格(用户确认 Q1 方案保留):
 *   sx70-square / negative-strip / point-and-shoot-stamp / contax-label
 *
 * 契约同阶段 2(AGENTS.md 第 4 条):
 *   - listFrameStyles 返回必须包含;
 *   - renderFrame 不抛"尚未实装"(允许 Sharp 文件错);
 *   - landscape/portrait 至少各 1 个 slot(Point-and-Shoot Stamp 也满足:overlay date slot)
 *
 * 为什么单独一个 integrity 文件而不是扩 frameStage2Integrity:
 *   - 按阶段分层 · 阶段 3 改动不污染阶段 2 的回归护栏
 *   - 未来阶段 4 迁移时本文件可独立删除而不影响阶段 2 的基线契约
 */
import { describe, expect, it } from 'vitest'
import { listFrameStyles } from '../../electron/services/frame/registry'
import { renderFrame } from '../../electron/services/frame/renderer'
import type { FrameStyleId, FrameStyleOverrides } from '../../shared/types'

const STAGE3_STYLES: FrameStyleId[] = [
  'sx70-square',
  'negative-strip',
  'point-and-shoot-stamp',
  'contax-label',
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

describe('阶段 3 完整性契约 · 可选 4 风格', () => {
  it('listFrameStyles 包含阶段 3 四个风格 · 总风格数 >= 12', () => {
    const ids = listFrameStyles().map((s) => s.id)
    for (const id of STAGE3_STYLES) {
      expect(ids, `阶段 3 风格 ${id} 未注册`).toContain(id)
    }
    expect(ids.length).toBeGreaterThanOrEqual(12)
  })

  it('阶段 3 每个风格的 landscape 和 portrait 都有至少 1 个 slot', () => {
    const styles = listFrameStyles()
    for (const id of STAGE3_STYLES) {
      const s = styles.find((x) => x.id === id)
      expect(s, `风格 ${id} 未注册`).toBeTruthy()
      expect(s?.landscape.slots.length, `${id}.landscape slots 为空`).toBeGreaterThan(0)
      expect(s?.portrait.slots.length, `${id}.portrait slots 为空`).toBeGreaterThan(0)
    }
  })

  it('renderFrame 对阶段 3 每个风格都不抛"尚未实装"', async () => {
    for (const id of STAGE3_STYLES) {
      let err: Error | null = null
      try {
        await renderFrame('/tmp/nonexistent-stage3.jpg', id, EMPTY_OVERRIDES)
      } catch (e) {
        err = e as Error
      }
      expect(err, `${id} 应抛错(文件不存在),而非静默成功`).toBeTruthy()
      expect(err?.message ?? '', `${id} generator 未挂`).not.toMatch(/尚未实装/)
    }
  })
})
