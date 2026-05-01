/**
 * frameJourney.spec.ts — 边框系统用户旅程 E2E
 *
 * 本 spec 核心价值:**直接证伪老 WatermarkOverlay 的"切换无效果" bug**
 *
 * 2026-05-01 下午更新:老水印 Tab UI 已下线,路由只剩边框系统 ——
 *   - F1:路由进入即 FrameStyleRegistry 可见(不再测 Tab class)
 *   - F2:点击不同风格 · 预览 div 的 `data-frame-style-id` 属性真的变化
 *        这仍是预览 DOM 被**真的重新渲染**的直接证据
 *   - F3:反向断言 —— 老 Tab 按钮不应再出现 · data-frame-style-id 恒在
 *
 * 蓝军 mutation 防护:
 *   - 若有人把 FrameStyleRegistry 重新指回 Placeholder,data-frame-style-id
 *     会永远是"placeholder",F2 会红
 *   - 若 FramePreviewHost 不再按 style.id 分派,data attr 也会停在初始值
 *   - 若有人复活老水印 Tab,F3 的 `toHaveCount(0)` 会红
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

  test('F1 · 导航到水印路由,边框风格列表直接可见(无 Tab 切换)', async () => {
    const { page } = launched
    await navItem(page, 'watermark').click()
    // 进入路由即可见 watermark-route 容器(不再有 Tab)
    await expect(page.getByTestId('watermark-route')).toBeVisible()
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

  test('F3 · 老水印 Tab UI 已彻底下线(反向蓝军防复活)', async () => {
    const { page } = launched
    // 下线的老 Tab 按钮不应再出现
    await expect(page.getByTestId('watermark-tab-frame')).toHaveCount(0)
    await expect(page.getByTestId('watermark-tab-watermark')).toHaveCount(0)
    // 边框预览 DOM 恒在(因为不再有 Tab 切换的卸载分支)
    await expect(page.locator('[data-frame-style-id]').first()).toBeVisible()
  })

  test('F4 · 照片盒子(data-frame-photo-box)存在且 layout 在盒内渲染(2026-05-01 · 照片贴合)', async () => {
    const { page } = launched
    // 切到 Minimal Bar · 预览应当出现 data-frame-photo-box
    await page.getByTestId('frame-style-minimal-bar').click()
    const photoBox = page.locator('[data-frame-photo-box="true"]')
    await expect(photoBox).toBeVisible({ timeout: 3000 })

    // 盒子内部应当有 data-frame-style-id 节点(layout 真的挂在盒子内)
    const inner = photoBox.locator('[data-frame-style-id]').first()
    await expect(inner).toHaveAttribute('data-frame-style-id', 'minimal-bar')

    // 盒子在容器里居中 · 至少能取到非零的 boundingBox
    const box = await photoBox.boundingBox()
    expect(box).toBeTruthy()
    if (box) {
      // 盒子有实际 size(不是 0)
      expect(box.width).toBeGreaterThan(10)
      expect(box.height).toBeGreaterThan(10)
    }
  })
})
