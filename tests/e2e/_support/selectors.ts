/**
 * selectors — E2E 层选择器集中表(Single Source of Truth)
 *
 * 原则(AGENTS.md 第 8 条):
 *   - 所有 data-testid / role / aria-label 的 Playwright 查询都从这里派生
 *   - spec 文件 **不允许** 直接写 `page.getByTestId('...')`,统一走本模块的 helper
 *   - UI 侧改名时,只需改本文件(散布阈值 = 1)
 *
 * 2026-05-01 修订(E2E 审计整改):
 *   - 删除从未被引用的 `editorRedoBtn` / `editorExportBtn`(YAGNI),新增用例时再加
 *   - 补全 editor tab 的 helper,让 editorJourney.spec.ts 的 tab 切换不再散布
 *     `page.getByTestId('editor-tab-*')` 硬编码
 *   - 新增 `editedBadge` helper,替代 spec 里散布的 `page.getByText('EDITED')`
 *
 * 为什么不把 testid 字符串也导出常量给 UI 侧共享:
 *   - 会让 UI 组件对测试层产生编译依赖(反向耦合),不合算
 *   - UI 侧硬编码字符串天然可读;测试侧集中 getter 保障选择器单点维护
 *   - 这是 Playwright / Cypress 业界推荐做法(page object 模式的最小变体)
 */
import type { Locator, Page } from '@playwright/test'

// ============================================================================
// Sidebar 导航
// ============================================================================

/** Sidebar 根元素(用于存在性断言 + 范围收窄) */
export const sidebar = (page: Page): Locator => page.getByTestId('sidebar')

/** 导航到路由 `/${route}`(route = 'library' | 'editor' | 'batch' | ...) */
export const navItem = (page: Page, route: string): Locator => page.getByTestId(`nav-${route}`)

// ============================================================================
// Library
// ============================================================================

/** Library 非空态根容器(photo-grid 所在页面) */
export const libraryRoot = (page: Page): Locator => page.getByTestId('library-root')

/** Library 空态的"导入照片"主按钮 */
export const importPhotosBtn = (page: Page): Locator => page.getByTestId('import-photos-btn')

/** Photo grid 容器 */
export const photoGrid = (page: Page): Locator => page.getByTestId('photo-grid')

/** 指定 id 的 PhotoCard */
export const photoCard = (page: Page, photoId: string): Locator => page.getByTestId(`photo-card-${photoId}`)

// ============================================================================
// Editor
// ============================================================================

/** Editor 根容器 */
export const editorRoot = (page: Page): Locator => page.getByTestId('editor-root')

/** Editor 顶栏撤销按钮 */
export const editorUndoBtn = (page: Page): Locator => page.getByTestId('editor-undo-btn')

/** Editor 预览画布(WebGL) */
export const previewCanvas = (page: Page): Locator => page.getByTestId('preview-canvas')

/** Editor 右栏 "滤镜" Tab 标签 */
export const editorTabFilters = (page: Page): Locator => page.getByTestId('editor-tab-filters')

/** Editor 右栏 "调整" Tab 标签 */
export const editorTabAdjust = (page: Page): Locator => page.getByTestId('editor-tab-adjust')

/** 指定 id 的滤镜行;`null` 表示"原图"(filter-row-original) */
export const filterRow = (page: Page, filterId: string | null): Locator =>
  page.getByTestId(filterId === null ? 'filter-row-original' : `filter-row-${filterId}`)

/**
 * 通过 aria-label 精确定位滑块(AdjustmentsPanel 内每个 Slider 都有 aria-label=label)。
 * 不走 testid,因为 Slider 是设计系统级组件,不应为了测试加私有标记。
 */
export const slider = (page: Page, label: string): Locator =>
  page.getByRole('slider', { name: label, exact: true })

/**
 * EDITED 脏标记徽章。editStore._dirty=true 时出现。
 * 有多个"EDITED"文案节点时取首个(顶栏优先)。
 */
export const editedBadge = (page: Page): Locator => page.getByText('EDITED').first()
