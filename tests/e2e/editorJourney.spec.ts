/**
 * editorJourney.spec.ts — Pass T2 核心用户旅程(UI 状态 + store 合约双层验证版)
 *
 * 设计决策(AGENTS.md 第 4 条 · 测试价值优先):
 *   - **不走 canvas.toDataURL / getImageData**:Editor 的 WebGL 上下文采用
 *     preserveDrawingBuffer=false(性能决策,见 src/lib/useWebGLPreview.ts:362),
 *     任何从 canvas 取像素的尝试都不稳定
 *   - **真像素验证交给 Pass T3 visual regression**(Playwright toHaveScreenshot
 *     走屏幕合成层抓图,不受 preserveDrawingBuffer 影响)
 *   - **本层断言双层契约**:
 *     (a) 用户可感知的 DOM 状态:Slider aria-valuenow、EDITED badge、filter-row active class
 *     (b) editStore 的底层 pipeline 合约:切滤镜后 currentPipeline 真的加载、切回原图后真的清空
 *     两层并存的意义:DOM 绿 + store 绿 → 真实生效; DOM 绿 + store 红 → 滤镜选中态是"假象"
 *
 * 2026-05-01 审计修订:
 *   - J3 新增 store 合约断言(前版本纯 DOM 断言,对"loadFromPreset 被短路"无防护,
 *     蓝军 mutation `s.currentPipeline = null` 时 6/6 全绿 —— 经典伪绿)
 *   - J5 把"Undo 按钮 disabled"换成"曝光归零 + 历史栈清空"双条件,避免 40 轮 click
 *     导致的 60s 超时 flaky
 *   - 所有 `page.getByTestId('editor-tab-*')` 改用 selectors.editorTabFilters/Adjust,
 *     消除 spec 层硬编码 testid(AGENTS.md 第 8 条)
 *
 * 真红条件:
 *   - J2 Editor 根不可见 → useAppStore.photos 未同步 / photo-card 双击事件未生效
 *   - J3 DOM 层:filter-row active 态未切换; store 层:currentPipeline 仍为 null 或缺 tone
 *   - J4 滑块 aria-valuenow 不上升 → Slider → setTone → editStore 链路断
 *   - J5 连续 undo 后曝光未归零 / history 栈未清空 → editStore.history / undo 契约断
 *   - J6 DOM 层:EDITED 未消失; store 层:baselineFilterId 未回到 null 或 currentPipeline 非空
 *
 * 共享单个 Electron 实例,按顺序串行 —— 每条用例的结果是下一条的前提。
 *
 * 运行:
 *   npm run build
 *   npx playwright test --project=e2e editorJourney.spec.ts
 */
import { expect, test } from '@playwright/test'
import { readEditState } from './_support/editStoreProbe'
import { type LaunchedApp, launchApp } from './_support/launchApp'
import { type SeededPhoto, seedPhotos } from './_support/seedFixtures'
import {
  editedBadge,
  editorRoot,
  editorTabAdjust,
  editorTabFilters,
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
    // IPC 注入:等价于用户完成了"打开 dialog → 选图 → 导入"的完整流程。
    // seedPhotos 默认会 reload 渲染进程,让 appStore 重新 init() 看到新照片
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

  test('J2 · 双击 photo-card 进入 Editor,画布节点存在', async () => {
    const { page } = launched
    await photoCard(page, seeded[0]!.id).dblclick()
    await expect(editorRoot(page)).toBeVisible({ timeout: 5000 })
    // 画布 DOM 存在即通过(像素级验证交 Pass T3 visual regression)
    const canvas = previewCanvas(page)
    await expect(canvas).toBeVisible()
    // 画布宽高 > 0(WebGL 上下文真的创建了且配置了 drawing buffer)
    const dims = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement
      return { w: c.width, h: c.height }
    })
    expect(dims.w).toBeGreaterThan(0)
    expect(dims.h).toBeGreaterThan(0)
  })

  test('J3 · 点击 kodak-portra-400:DOM 进入已选中态 + editStore 真加载了 pipeline', async () => {
    const { page } = launched
    const target = filterRow(page, 'kodak-portra-400')
    await expect(target).toBeVisible()
    await target.click()

    // --- 第一层:DOM 用户可感知断言 ---
    // filter-row active 态:加 brand-violet 边框 class
    await expect(target).toHaveClass(/brand-violet/, { timeout: 3000 })
    // 顶栏 tab 的 sub 文案应更新为"Kodak Portra 400"
    await expect(editorTabFilters(page)).toContainText('Kodak Portra 400', { timeout: 3000 })

    // --- 第二层:editStore 底层合约断言(2026-05-01 审计核心修复) ---
    // 等 editStore 的 useEffect(loadFromPreset) 跑完 —— 用轮询避免 race:
    // loadFromPreset 是同步的但由 useEffect 触发,点击 → React 调度 → effect 执行
    // 之间有帧级延迟,直接读会偶发拿到 null
    await expect
      .poll(
        async () => {
          const s = await readEditState(page)
          return s.baselineFilterId
        },
        { timeout: 3000, message: 'editStore.baselineFilterId 未切到 kodak-portra-400' },
      )
      .toBe('kodak-portra-400')

    const snapshot = await readEditState(page)
    // 必须真的 deepClone 了 preset.pipeline 到 currentPipeline —— 不允许为 null
    expect(snapshot.currentPipeline, 'currentPipeline 为 null,loadFromPreset 被短路').not.toBeNull()
    expect(snapshot.baselinePipeline, 'baselinePipeline 为 null,preset 未注入').not.toBeNull()
    // Portra 400 preset 的特征字段(见 electron/assets/presets/index.ts):
    //   tone.highlights = -12, whiteBalance.temp = 8, colorGrading 存在
    // 任一缺失都说明 loadFromPreset 没完整拷贝
    expect(snapshot.currentPipeline?.tone, 'pipeline.tone 缺失').toBeTruthy()
    expect(snapshot.currentPipeline?.whiteBalance, 'pipeline.whiteBalance 缺失').toBeTruthy()
    expect(snapshot.currentPipeline?.colorGrading, 'pipeline.colorGrading 缺失').toBeTruthy()
    // 刚切滤镜,尚未人工调参 → 不应当是脏态
    expect(snapshot._dirty, '刚加载 preset 不应是 dirty').toBe(false)
  })

  test('J4 · 切到调整 Tab 拖曝光 slider,editStore 值真的变化', async () => {
    const { page } = launched
    // 先切回原图,排除滤镜预设对曝光默认值的干扰
    await filterRow(page, 'original').click()
    await editorTabAdjust(page).click()
    const exposureSlider = slider(page, '曝光')
    await expect(exposureSlider).toBeVisible()

    // 初始 aria-valuenow 应为 0(原图基线)
    const baseline = await exposureSlider.getAttribute('aria-valuenow')
    expect(baseline).toBe('0')

    // Shift+ArrowRight 每次 +0.1 EV(step 0.01 × 10),20 次 → +2 EV
    await exposureSlider.focus()
    for (let i = 0; i < 20; i++) {
      await exposureSlider.press('Shift+ArrowRight')
    }

    // aria-valuenow 应稳定在 2(考虑浮点:放宽到 >= 1.9)
    const final = Number.parseFloat((await exposureSlider.getAttribute('aria-valuenow')) ?? '0')
    expect(final).toBeGreaterThanOrEqual(1.9)

    // EDITED badge 应出现(editStore dirty 标记生效)
    await expect(editedBadge(page)).toBeVisible()
    // Undo 按钮从 disabled 变为可用
    await expect(editorUndoBtn(page)).toBeEnabled()

    // store 层合约:tone.exposure 真的写入了
    const snap = await readEditState(page)
    expect(snap._dirty).toBe(true)
    expect(snap.historyLen).toBeGreaterThan(0)
  })

  test('J5 · 连续 Undo 回到基线(曝光归零 + history 栈清空)', async () => {
    const { page } = launched
    const exposureSlider = slider(page, '曝光')
    const undo = editorUndoBtn(page)

    // 终止条件:aria-valuenow 回到 ±0.05。这比"按钮 disabled"更直接反映状态,
    // 且避免了前版本 "Undo 按钮残留可点 → 40 轮无意义 click 导致 60s 超时" 的 flaky。
    //
    // history 的典型深度 ~20(J4 敲了 20 次 Shift+ArrowRight),上限给 25 留余量。
    const MAX_ROUNDS = 25
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const current = Number.parseFloat((await exposureSlider.getAttribute('aria-valuenow')) ?? '999')
      if (Math.abs(current) <= 0.05) break
      if (!(await undo.isEnabled())) break
      await undo.click({ timeout: 1500 })
    }

    // 曝光应回到 0(或接近 0;浮点允许 ±0.05)
    const finalValue = Number.parseFloat((await exposureSlider.getAttribute('aria-valuenow')) ?? '999')
    expect(finalValue).toBeGreaterThanOrEqual(-0.05)
    expect(finalValue).toBeLessThanOrEqual(0.05)

    // store 层合约:history 栈应已清空,undo 按钮 disabled 化
    const snap = await readEditState(page)
    expect(snap.historyLen).toBe(0)
    await expect(undo).toBeDisabled()
  })

  test('J6 · 从滤镜切回"原图":DOM EDITED 消失 + editStore baseline 归空', async () => {
    const { page } = launched
    // 前置:先进入有滤镜的状态(activeFilter != null),确保后面"切到原图"
    // 能触发 Editor 的 useEffect([activeFilter]) → loadFromPreset(null) 清 dirty。
    // 如果前置就是原图,再点原图 setActiveFilter(null) 不会让 activeFilter 真的变
    // → useEffect 不跑 → dirty 不会被重置。这是 Editor 现有契约(切换到不同 filter
    // 才重置编辑态),本用例也同时验证这一契约。
    await editorTabFilters(page).click()
    await filterRow(page, 'kodak-portra-400').click()

    // 切到调整 tab 脏一下
    await editorTabAdjust(page).click()
    const exposureSlider = slider(page, '曝光')
    await exposureSlider.focus()
    await exposureSlider.press('Shift+ArrowRight')
    await expect(editedBadge(page)).toBeVisible()

    // 回到滤镜 tab,点原图
    await editorTabFilters(page).click()
    await filterRow(page, 'original').click()

    // --- 第一层:DOM ---
    await expect(editedBadge(page)).toBeHidden({ timeout: 3000 })

    // --- 第二层:store 合约 ---
    await expect
      .poll(
        async () => {
          const s = await readEditState(page)
          return { id: s.baselineFilterId, pipeline: s.currentPipeline, dirty: s._dirty }
        },
        { timeout: 3000 },
      )
      .toEqual({ id: null, pipeline: null, dirty: false })
  })
})
