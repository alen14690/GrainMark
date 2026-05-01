/**
 * editorJourney.spec.ts — Pass T2 核心用户旅程（UI 状态契约版）
 *
 * 设计决策（AGENTS.md 第 4 条 · 测试价值优先）：
 *   - **不走 canvas.toDataURL / getImageData**：Editor 的 WebGL 上下文采用
 *     preserveDrawingBuffer=false（性能决策，见 src/lib/useWebGLPreview.ts:362），
 *     任何从 canvas 取像素的尝试都不稳定
 *   - **真像素验证交给 Pass T3 visual regression**（Playwright toHaveScreenshot
 *     走屏幕合成层抓图，不受 preserveDrawingBuffer 影响）
 *   - **本层断言"用户可感知的 DOM 状态契约"**：滑块值、EDITED badge、Undo 可用性、
 *     滤镜选中态、路由切换。这正好对应 AGENTS.md 准则 4 的"状态层合约"
 *
 * 真红条件：
 *   - J2 Editor 根不可见 → useAppStore.photos 未同步 / photo-card 双击事件未生效
 *   - J3 filter-row 点击后 active 态未切换 → setActiveFilter 链路断
 *   - J4 滑块 aria-valuenow 不上升 → Slider → setTone → editStore 链路断
 *   - J5 Undo 不可用 / 点后值不回退 → editStore.history / undo 契约断
 *   - J6 切回"原图"后 EDITED badge 仍在 → loadFromPreset(null) 未清空 dirty
 *
 * 共享单个 Electron 实例，按顺序串行 —— 每条用例的结果是下一条的前提。
 *
 * 运行：
 *   npm run build
 *   npx playwright test --project=e2e editorJourney.spec.ts
 */
import { expect, test } from '@playwright/test'
import { type LaunchedApp, launchApp } from './_support/launchApp'
import { type SeededPhoto, seedPhotos } from './_support/seedFixtures'
import {
  editorRoot,
  editorUndoBtn,
  filterRow,
  navItem,
  photoCard,
  photoGrid,
  previewCanvas,
  slider,
} from './_support/selectors'

test.describe('E2E 用户旅程 · Editor', () => {
  let launched: LaunchedApp
  let seeded: SeededPhoto[]

  test.beforeAll(async () => {
    launched = await launchApp()
    // IPC 注入：等价于用户完成了"打开 dialog → 选图 → 导入"的完整流程。
    // seedPhotos 默认会 reload 渲染进程，让 appStore 重新 init() 看到新照片
    // —— 顺便验证了 photos.json 持久化 + 下次启动正确加载 这一契约。
    seeded = await seedPhotos(launched.page, launched.tmpDir, {
      names: ['gradient-rgb.jpg'],
    })
  })

  test.afterAll(async () => {
    await launched?.cleanup()
  })

  test('J1 · seed 后 Library 渲染 photo-card', async () => {
    const { page } = launched
    await navItem(page, 'library').click()
    await expect(photoGrid(page)).toBeVisible()
    await expect(photoCard(page, seeded[0]!.id)).toBeVisible()
  })

  test('J2 · 双击 photo-card 进入 Editor，画布节点存在', async () => {
    const { page } = launched
    await photoCard(page, seeded[0]!.id).dblclick()
    await expect(editorRoot(page)).toBeVisible({ timeout: 5000 })
    // 画布 DOM 存在即通过（像素级验证交 Pass T3 visual regression）
    const canvas = previewCanvas(page)
    await expect(canvas).toBeVisible()
    // 画布宽高 > 0（WebGL 上下文真的创建了且配置了 drawing buffer）
    const dims = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement
      return { w: c.width, h: c.height }
    })
    expect(dims.w).toBeGreaterThan(0)
    expect(dims.h).toBeGreaterThan(0)
  })

  test('J3 · 点击 kodak-portra-400 滤镜，DOM 进入"已应用该滤镜"状态', async () => {
    const { page } = launched
    const target = filterRow(page, 'kodak-portra-400')
    await expect(target).toBeVisible()
    await target.click()
    // 滤镜 active 态：filter-row 会加 brand-violet 边框 class
    // 用更稳定的语义断言：aria-pressed 或 class 含 'brand-violet'
    await expect(target).toHaveClass(/brand-violet/, { timeout: 3000 })
    // 顶栏 tab 的 sub 文案应当更新为"Kodak Portra 400"
    await expect(page.getByTestId('editor-tab-filters')).toContainText('Kodak Portra 400', {
      timeout: 3000,
    })
  })

  test('J4 · 切到调整 Tab 拖曝光 slider，editStore 值真的变化', async () => {
    const { page } = launched
    // 先切回原图，排除滤镜预设对曝光默认值的干扰
    await filterRow(page, 'original').click()
    await page.getByTestId('editor-tab-adjust').click()
    const exposureSlider = slider(page, '曝光')
    await expect(exposureSlider).toBeVisible()

    // 初始 aria-valuenow 应为 0（原图基线）
    const baseline = await exposureSlider.getAttribute('aria-valuenow')
    expect(baseline).toBe('0')

    // Shift+ArrowRight 每次 +0.1 EV（step 0.01 × 10），20 次 → +2 EV
    await exposureSlider.focus()
    for (let i = 0; i < 20; i++) {
      await exposureSlider.press('Shift+ArrowRight')
    }

    // aria-valuenow 应稳定在 2（考虑浮点：放宽到 >= 1.9）
    const final = Number.parseFloat((await exposureSlider.getAttribute('aria-valuenow')) ?? '0')
    expect(final).toBeGreaterThanOrEqual(1.9)

    // EDITED badge 应出现（editStore dirty 标记生效）
    await expect(page.getByText('EDITED').first()).toBeVisible()
    // Undo 按钮从 disabled 变为可用
    await expect(editorUndoBtn(page)).toBeEnabled()
  })

  test('J5 · 连续 Undo 回到基线（曝光 aria-valuenow 归零）', async () => {
    const { page } = launched
    const exposureSlider = slider(page, '曝光')
    const undo = editorUndoBtn(page)

    // 连续 Undo 到按钮自己 disable 为止（最多 40 次，避免无限循环）
    for (let i = 0; i < 40; i++) {
      if (!(await undo.isEnabled())) break
      await undo.click()
    }

    // 曝光应回到 0（或接近 0；浮点允许 ±0.05）
    const finalValue = Number.parseFloat((await exposureSlider.getAttribute('aria-valuenow')) ?? '999')
    expect(Math.abs(finalValue)).toBeLessThanOrEqual(0.05)
  })

  test('J6 · 从滤镜切回"原图"会清空 EDITED（loadFromPreset 契约）', async () => {
    const { page } = launched
    // 前置：先进入有滤镜的状态（activeFilter != null），确保后面"切到原图"
    // 能触发 Editor 的 useEffect([activeFilter]) → loadFromPreset(null) 清 dirty。
    // 如果前置就是原图，再点原图 setActiveFilter(null) 不会让 activeFilter 真的变
    // → useEffect 不跑 → dirty 不会被重置。这是 Editor 现有契约（切换到不同 filter
    // 才重置编辑态），本用例也同时验证这一契约。
    await page.getByTestId('editor-tab-filters').click()
    await filterRow(page, 'kodak-portra-400').click()

    // 切到调整 tab 脏一下
    await page.getByTestId('editor-tab-adjust').click()
    const exposureSlider = slider(page, '曝光')
    await exposureSlider.focus()
    await exposureSlider.press('Shift+ArrowRight')
    await expect(page.getByText('EDITED').first()).toBeVisible()

    // 回到滤镜 tab，点原图
    await page.getByTestId('editor-tab-filters').click()
    await filterRow(page, 'original').click()

    // loadFromPreset(null) 清 dirty → EDITED 消失
    await expect(page.getByText('EDITED').first()).toBeHidden({ timeout: 3000 })
  })
})
