/**
 * visualRegression.spec.ts — Pass T3 视觉回归（仅覆盖 WebGL 之外的稳定区域）
 *
 * 架构发现（AGENTS.md 第 8 条复盘）：
 *   Editor 的 preview-canvas 使用 `preserveDrawingBuffer: false`（性能决策
 *   见 src/lib/useWebGLPreview.ts:362），这导致：
 *   - Playwright 的 toHaveScreenshot/locator.screenshot() 抓到的 canvas
 *     内容取决于 composite 时机，对"是否抓到 WebGL 画面"**不稳定**
 *   - 任何针对 canvas 本身的视觉回归都不可靠：基线可能是画面，运行时是透明
 *     背景 —— 两种结果都会被判"一致"或"不一致"，取决于浏览器合成器调度
 *
 *   像素级 WebGL 渲染正确性验证**已经在单测层覆盖**：
 *   - tests/unit/shaderSnapshots.test.ts（10 shader × 100×100 CPU 镜像基线）
 *   - tests/unit/perceptibility.test.ts（滑块 → 像素 Δ 可感知性）
 *   E2E 层再重复这一层没有增量价值。
 *
 * 本 spec 聚焦在 **WebGL 之外** 的视觉稳定性：
 *   V1 Sidebar 导航布局
 *   V2 Library 网格 + 缩略图（缩略图由主进程 sharp 生成，非 WebGL，稳定）
 *
 * 跨平台策略：
 *   Baseline 只在 macOS 维护（AGENTS.md 第 7 条）。DPR 锁定到 1（launchApp 里 --force-device-scale-factor=1）。
 *
 * 基线更新：
 *   npx playwright test --project=e2e visualRegression.spec.ts --update-snapshots
 */
import { expect, test } from '@playwright/test'
import { type LaunchedApp, launchApp } from './_support/launchApp'
import { seedPhotos } from './_support/seedFixtures'
import { libraryRoot, navItem, photoCard, photoGrid, sidebar } from './_support/selectors'

const isMac = process.platform === 'darwin'

test.describe('Visual Regression · 非 WebGL 稳定区域', () => {
  test.skip(!isMac, 'Visual baselines 仅在 macOS 维护（跨平台像素差异过大）')

  let launched: LaunchedApp

  test.beforeAll(async () => {
    launched = await launchApp()
  })

  test.afterAll(async () => {
    await launched?.cleanup()
  })

  test('V1 · Sidebar 布局像素稳定', async () => {
    const { page } = launched
    await navItem(page, 'library').click()
    await expect(sidebar(page)).toHaveScreenshot('sidebar.png', {
      maxDiffPixels: 100,
    })
  })

  test('V2 · Library 网格 + 缩略图像素稳定', async () => {
    const { page } = launched
    const seeded = await seedPhotos(launched.page, launched.tmpDir, {
      names: ['gradient-rgb.jpg'],
    })
    // reload 后回 Library
    await navItem(page, 'library').click()
    await expect(libraryRoot(page)).toBeVisible()
    await expect(photoCard(page, seeded[0]!.id)).toBeVisible()
    await expect(photoGrid(page)).toHaveScreenshot('photo-grid-1photo.png', {
      maxDiffPixels: 200,
    })
  })
})
