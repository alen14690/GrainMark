/**
 * smoke.spec.ts — Pass T1 冒烟(2026-05-01 审计精简版)
 *
 * 目标(最小充分集):验证 E2E 基础设施可用。
 *   1. 真实 Electron 能启动 + Sidebar 导航全部可见
 *   2. 默认路由到 Library 空态,"导入照片"按钮 + photo-grid 缺席契约成立
 *
 * 与之前 5 条的差异(审计修订):
 *   - 删除 "window.grain 可用" —— launchApp 的 waitForFunction 已在启动阶段
 *     保证 grain.invoke 存在,再断一次是重复
 *   - 删除 "点击 Editor 导航" / "回到 Library" —— editorJourney J1/J2 会用
 *     photo-seed + 完整旅程覆盖,此处保留只会重复
 *   - preload.testMode 契约验证交给 editorJourney 的 readEditState(读不到会抛错)
 *
 * 真红条件:launchApp 抛错 / Sidebar 不可见 / 任一主导航缺席 / 默认不是空态。
 *
 * 预运行要求:`npm run build`(产出 dist-electron/main.js + dist/)。
 */
import { expect, test } from '@playwright/test'
import { type LaunchedApp, launchApp } from './_support/launchApp'
import { importPhotosBtn, libraryRoot, navItem, photoGrid, sidebar } from './_support/selectors'

test.describe('E2E 冒烟 · Pass T1', () => {
  let launched: LaunchedApp

  test.beforeAll(async () => {
    launched = await launchApp()
  })

  test.afterAll(async () => {
    await launched?.cleanup()
  })

  test('Sidebar 渲染 + 4 个主导航可见(基础 UI 壳子契约)', async () => {
    const { page } = launched
    await expect(sidebar(page)).toBeVisible()
    // 主工作台三个导航
    await expect(navItem(page, 'library')).toBeVisible()
    await expect(navItem(page, 'editor')).toBeVisible()
    await expect(navItem(page, 'batch')).toBeVisible()
    // 设置导航
    await expect(navItem(page, 'settings')).toBeVisible()
  })

  test('默认路由到 Library 空态:import 按钮可见,photo-grid 缺席', async () => {
    const { page } = launched
    // 此时尚未 seed 任何照片,photos 应为空 → Library 显示空态
    await expect(importPhotosBtn(page)).toBeVisible()
    // 确认非空态容器不出现(互斥视图)
    await expect(libraryRoot(page)).toHaveCount(0)
    // photo-grid 也不存在(空态走 EmptyState 分支)
    await expect(photoGrid(page)).toHaveCount(0)
  })
})
