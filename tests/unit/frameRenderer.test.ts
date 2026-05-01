/**
 * frameRenderer 阶段 1 契约测试
 *
 * 阶段 1 的承诺:
 *   - renderFrame 不会静默成功返回占位数据 —— 必须抛清晰错误
 *   - 错误消息要含 styleId,方便定位
 *   - 未注册的 id 与已注册但未实装的 id 有不同错误分支
 *
 * 这条测试在阶段 2 起会被替换为真实 generator 的像素级 snapshot 测试。
 * 本测试的意义是"防止有人误以为阶段 1 渲染可用"从而推上线。
 */
import { describe, expect, it } from 'vitest'
import { renderFrame } from '../../electron/services/frame/renderer'
import type { FrameStyleOverrides } from '../../shared/types'

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

describe('renderFrame 阶段 1 · 诚实抛错契约', () => {
  it('未注册的 styleId 抛"未注册"错误', async () => {
    await expect(renderFrame('/tmp/fake.jpg', 'sx70-square', EMPTY_OVERRIDES)).rejects.toThrow(
      /sx70-square.*未注册/,
    )
  })

  it('已注册但未实装(阶段 1 只有 minimal-bar)抛"尚未实装"错误,且错误消息含 styleId', async () => {
    await expect(renderFrame('/tmp/fake.jpg', 'minimal-bar', EMPTY_OVERRIDES)).rejects.toThrow(
      /尚未实装.*minimal-bar/,
    )
  })
})
