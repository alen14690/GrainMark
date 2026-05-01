/**
 * frameRenderer 契约测试
 *
 * 阶段 2 状态:
 *   - minimal-bar:已实装 generator(调用会真的走到 Sharp,不再抛"尚未实装")
 *   - 其它风格(polaroid-classic 等):尚未实装 generator,仍抛明确错误
 *
 * 这条测试的意义(AGENTS.md 第 4 条):
 *   - 防止未来"新增 FrameStyleId 忘记挂 generator"时被静默放过
 *   - 确保"未注册 id"与"未实装 id"的错误信息不同(便于诊断)
 *
 * 不测 minimal-bar 的真实渲染 —— 那需要真实图片文件,属 visual regression 范畴,
 * 阶段 2 尾声统一加 pixelmatch baseline。
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

describe('renderFrame · 错误边界契约', () => {
  it('未注册的 FrameStyleId 抛"未注册"错误', async () => {
    // 阶段 3 后 sx70-square 已注册 —— 用一个永远不会注册的伪 id 验证错误路径
    // 通过 as 强转穿透类型,本测专门覆盖 registry "未注册"分支
    const fakeId = '__never-registered-frame-id__' as unknown as Parameters<typeof renderFrame>[1]
    await expect(renderFrame('/tmp/fake.jpg', fakeId, EMPTY_OVERRIDES)).rejects.toThrow(
      /__never-registered.*未注册/,
    )
  })

  it('注册了但无 generator 的风格抛"尚未实装"错误(阶段 2 逐步消除)', async () => {
    // 阶段 3 后必保 8 + 可选 4 全部挂齐 generator,本测验证"实装回归"的防线:
    // minimal-bar 调用会在 Sharp 层因文件不存在失败,但错误消息不得含"尚未实装"。
    let caught: Error | null = null
    try {
      await renderFrame('/tmp/nonexistent-frame-test.jpg', 'minimal-bar', EMPTY_OVERRIDES)
    } catch (err) {
      caught = err as Error
    }
    expect(caught, 'minimal-bar 应当因 Sharp 读不到文件而抛错').toBeTruthy()
    expect(caught?.message ?? '').not.toMatch(/尚未实装/)
  })
})
