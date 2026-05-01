/**
 * frameJourney.spec.ts — 边框系统用户旅程 E2E
 *
 * 本 spec 核心价值:**直接证伪老 WatermarkOverlay 的"切换无效果" bug**
 *
 * 契约(AGENTS.md 第 7 条 UI 证据链):
 *   F1:边框 Tab 默认可见 · 能看到 FrameStyleRegistry 里至少 1 个风格
 *   F2:点击不同风格 · 预览 div 的 `data-frame-style-id` 属性真的变化
 *        —— 这是预览 DOM 被**真的重新渲染**的直接证据,不是纯 CSS 样式切换
 *   F3:竖图 / 横图的 `data-frame-orientation` 属性正确分类
 *        —— 但这一条需要 seed 不同尺寸的图,现阶段先只覆盖默认 fixture(横图)
 *
 * 蓝军 mutation 防护:
 *   - 若有人把 FrameStyleRegistry 重新指回 Placeholder,data-frame-style-id
 *     会永远是"placeholder",F2 会红
 *   - 若 FramePreviewHost 不再按 style.id 分派,data attr 也会停在初始值
 */
import { expect, test } from '@playwright/test'
import { type LaunchedApp, launchApp } from './_support/launchApp'
import { seedPhotos } from './_support/seedFixtures'
import { navItem } from './_support/selectors'

test.describe('Frame 边框系统 · 用户旅程', () => {
  let launched: LaunchedApp

  test.beforeAll(async () => {
    launched = await launchApp()
    await seedPhotos(launched.page, launched.tmpDir, { names: ['gradient-rgb.jpg'] })
  })

  test.afterAll(async () => {
    await launched?.cleanup()
  })

  test('F1 · 导航到水印路由,边框 Tab 默认激活,风格列表非空', async () => {
    const { page } = launched
    await navItem(page, 'watermark').click()
    await expect(page.getByTestId('watermark-tab-frame')).toBeVisible()
    // 默认激活边框 Tab,右侧预览容器出现
    await expect(page.getByTestId('watermark-tab-frame')).toHaveClass(/brand-amber/)
    // 至少 1 个 frame 风格(必保 8 之一)
    const minimalBarBtn = page.getByTestId('frame-style-minimal-bar')
    await expect(minimalBarBtn).toBeVisible()
  })

  test('F2 · 切换风格 · 预览 DOM 的 data-frame-style-id 真的变化(根治切换无效)', async () => {
    const { page } = launched
    // 初始:默认 minimal-bar
    await page.getByTestId('frame-style-minimal-bar').click()
    await expect(page.locator('[data-frame-style-id]').first()).toHaveAttribute(
      'data-frame-style-id',
      'minimal-bar',
      { timeout: 3000 },
    )
    // 实装组件必有 data-frame-orientation 属性(Placeholder 没有)——
    // 这是"真实实装"的额外证据,防止 FrameStyleRegistry 被指回 Placeholder
    await expect(page.locator('[data-frame-orientation]').first()).toBeVisible({ timeout: 3000 })

    // 切到 Polaroid Classic
    await page.getByTestId('frame-style-polaroid-classic').click()
    await expect(page.locator('[data-frame-style-id]').first()).toHaveAttribute(
      'data-frame-style-id',
      'polaroid-classic',
      { timeout: 3000 },
    )
    await expect(page.locator('[data-frame-orientation]').first()).toBeVisible({ timeout: 3000 })
    // 反向蓝军:data-frame-status="placeholder" 节点必须为 0
    //   (若有人把 Polaroid 指回 Placeholder,这一行会红)
    await expect(page.locator('[data-frame-status="placeholder"]')).toHaveCount(0)

    // 切到 Film Full Border
    await page.getByTestId('frame-style-film-full-border').click()
    await expect(page.locator('[data-frame-style-id]').first()).toHaveAttribute(
      'data-frame-style-id',
      'film-full-border',
      { timeout: 3000 },
    )
    await expect(page.locator('[data-frame-status="placeholder"]')).toHaveCount(0)

    // 切回 Gallery Black
    await page.getByTestId('frame-style-gallery-black').click()
    await expect(page.locator('[data-frame-style-id]').first()).toHaveAttribute(
      'data-frame-style-id',
      'gallery-black',
      { timeout: 3000 },
    )
    await expect(page.locator('[data-frame-status="placeholder"]')).toHaveCount(0)
  })

  test('F3 · Tab 切到老水印系统,data-frame-style-id 消失(边框 Tab 已卸载)', async () => {
    const { page } = launched
    await page.getByTestId('watermark-tab-watermark').click()
    await expect(page.getByTestId('watermark-tab-watermark')).toHaveClass(/brand-amber/)
    // 切到老 Tab 后,边框 Tab 的 DOM 应当卸载 ——
    // 老水印系统不给 data-frame-style-id,所以应当零计数
    await expect(page.locator('[data-frame-style-id]')).toHaveCount(0)
  })
})
