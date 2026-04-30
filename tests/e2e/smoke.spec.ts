/**
 * smoke.spec.ts — Pass T1 冒烟
 *
 * 目标（单一）：验证 E2E 基础设施可用：
 *   1. 真实 Electron 能启动（main.ts 全路径）
 *   2. preload 桥接注入 window.grain
 *   3. React 渲染到 Sidebar + Library 空态
 *   4. Sidebar 各导航项可点击，路由能切到 Editor
 *
 * 本 spec 故意只写 1 个 test.describe：Pass T2 会在此基础上扩展用户旅程。
 *
 * 真红条件：launchApp 抛错 / Sidebar 不可见 / nav 点击后 Editor 不出现 / window.grain 缺失。
 *
 * 预运行要求：`npm run build`（产出 dist-electron/main.js + dist/）。
 */
import { expect, test } from '@playwright/test'
import { type LaunchedApp, launchApp } from './_support/launchApp'
import { editorRoot, importPhotosBtn, libraryRoot, navItem, photoGrid, sidebar } from './_support/selectors'

test.describe('E2E 冒烟 · Pass T1', () => {
  let launched: LaunchedApp

  test.beforeAll(async () => {
    launched = await launchApp()
  })

  test.afterAll(async () => {
    await launched?.cleanup()
  })

  test('Electron 启动后 window.grain 可用（preload 桥接）', async () => {
    const hasGrain = await launched.page.evaluate(() => {
      const g = (window as unknown as { grain?: { invoke?: unknown; platform?: unknown } }).grain
      return (
        !!g &&
        typeof g.invoke === 'function' &&
        (g.platform === 'darwin' || g.platform === 'win32' || g.platform === 'linux')
      )
    })
    expect(hasGrain).toBe(true)
  })

  test('Sidebar 渲染 + 主要导航项可见', async () => {
    const { page } = launched
    await expect(sidebar(page)).toBeVisible()
    // 主工作台三个导航
    await expect(navItem(page, 'library')).toBeVisible()
    await expect(navItem(page, 'editor')).toBeVisible()
    await expect(navItem(page, 'batch')).toBeVisible()
    // 设置导航
    await expect(navItem(page, 'settings')).toBeVisible()
  })

  test('默认路由重定向到 Library，空态展示导入按钮', async () => {
    const { page } = launched
    // 此时尚未 seed 任何照片，photos 应为空 → Library 显示空态
    await expect(importPhotosBtn(page)).toBeVisible()
    // 确认非空态容器不出现（互斥视图）
    await expect(libraryRoot(page)).toHaveCount(0)
    // photo-grid 也不存在（空态走 EmptyState 分支）
    await expect(photoGrid(page)).toHaveCount(0)
  })

  test('点击 Editor 导航能切到 /editor 路由', async () => {
    const { page } = launched
    await navItem(page, 'editor').click()
    // 没有照片时 Editor 显示"请先到图库导入"占位文案（也要求路由切换完成）
    await expect(page.getByText('请先到「图库」导入照片')).toBeVisible()
    // editor-root 只在有照片时才渲染主界面；这里不强求可见，只验证路由生效
    // —— 这本身也是个契约：editorRoot 为空时的回退分支必须存在且文案稳定
    await expect(editorRoot(page)).toHaveCount(0)
  })

  test('点击 Library 导航能回到 Library 空态', async () => {
    const { page } = launched
    await navItem(page, 'library').click()
    await expect(importPhotosBtn(page)).toBeVisible()
  })
})
