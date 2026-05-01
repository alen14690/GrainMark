/**
 * editStoreProbe — E2E 层读取 `__grainEditStore` 的集中封装
 *
 * 职责(AGENTS.md 第 8 条 Single Source):
 *   - 所有从 Playwright page 读 `window.__grainEditStore.getState()` 的调用统一走这里
 *   - spec 不再散布 `(window as any).__grainEditStore` 的转型
 *
 * 挂载条件回顾(见 src/stores/editStore.ts 底部):
 *   - 仅当 `window.grain.testMode === true` 或 `import.meta.env.DEV` 才挂
 *   - 生产构建在不传 GRAINMARK_TEST 时不会暴露,对线上用户无副作用
 *
 * 用法:
 *   const state = await readEditState(page)
 *   expect(state.baselineFilterId).toBe('kodak-portra-400')
 *   expect(state.currentPipeline).not.toBeNull()
 */
import type { Page } from '@playwright/test'

/**
 * editStore 对外暴露的快照结构(本 helper 只关心 E2E 需要的字段,不求全)。
 * 对应 `src/stores/editStore.ts` 的 `EditState` 中 "状态" 部分。
 */
export interface EditStoreSnapshot {
  /** 当前生效的 pipeline,null = 原图 */
  currentPipeline: null | {
    tone?: Record<string, number>
    whiteBalance?: Record<string, number>
    colorGrading?: Record<string, unknown>
    lut3D?: Record<string, unknown>
    grain?: Record<string, unknown>
    halation?: Record<string, unknown>
    vignette?: Record<string, unknown>
    [k: string]: unknown
  }
  /** baseline 快照(加载 preset 时的初始态) */
  baselinePipeline: null | Record<string, unknown>
  /** 当前加载的 filter id,null = 原图 */
  baselineFilterId: null | string
  /** 脏标记(set* action 会置 true) */
  _dirty: boolean
  /** undo 栈深度 */
  historyLen: number
  /** redo 栈深度 */
  futureLen: number
}

/**
 * 读取当前 editStore 快照。
 *
 * 抛错场景:
 *   - `window.__grainEditStore` 未挂载 → 说明 launchApp 未注入 GRAINMARK_TEST=1,
 *     或 editStore.ts 的挂载分支被意外跳过 —— 这是测试基础设施级故障,直接红
 */
export async function readEditState(page: Page): Promise<EditStoreSnapshot> {
  return await page.evaluate(() => {
    type StoreLike = {
      getState: () => {
        currentPipeline: EditStoreSnapshot['currentPipeline']
        baselinePipeline: EditStoreSnapshot['baselinePipeline']
        baselineFilterId: EditStoreSnapshot['baselineFilterId']
        _dirty: boolean
        history: unknown[]
        future: unknown[]
      }
    }
    const store = (window as unknown as { __grainEditStore?: StoreLike }).__grainEditStore
    if (!store || typeof store.getState !== 'function') {
      throw new Error(
        '[readEditState] window.__grainEditStore 未挂载 —— 检查 preload 的 testMode 或 GRAINMARK_TEST 环境变量',
      )
    }
    const s = store.getState()
    return {
      currentPipeline: s.currentPipeline,
      baselinePipeline: s.baselinePipeline,
      baselineFilterId: s.baselineFilterId,
      _dirty: s._dirty,
      historyLen: Array.isArray(s.history) ? s.history.length : 0,
      futureLen: Array.isArray(s.future) ? s.future.length : 0,
    }
  })
}
