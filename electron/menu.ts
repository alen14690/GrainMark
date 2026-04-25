/**
 * 应用菜单 — 跨平台
 *
 * 设计要点：
 *   1. macOS 遵循原生约定：App 菜单首条包含 Preferences… (⌘,)
 *   2. Win/Linux 将 Settings 放到 File 菜单末尾，Ctrl+,
 *   3. 所有导航类菜单项通过 webContents.send('app:navigate', route) 通知渲染进程
 *   4. route 走白名单，防止 IPC 被滥用成任意跳转
 *   5. 不引入任何超出 electron 的依赖
 */
import { type BrowserWindow, Menu, type MenuItemConstructorOptions, app, shell } from 'electron'

/** 允许通过菜单/全局快捷键跳转的路由白名单 */
export const NAV_ROUTES = [
  '/library',
  '/editor',
  '/batch',
  '/filters',
  '/extract',
  '/taste',
  '/watermark',
  '/ai',
  '/trending',
  '/settings',
] as const
export type NavRoute = (typeof NAV_ROUTES)[number]

export function isNavRoute(value: unknown): value is NavRoute {
  return typeof value === 'string' && (NAV_ROUTES as readonly string[]).includes(value)
}

/** 主进程 → 渲染进程的路由事件通道 */
export const NAV_CHANNEL = 'app:navigate'

/** 构造跳转路由的点击处理器 */
function makeNavigate(win: () => BrowserWindow | null, route: NavRoute) {
  return () => {
    const w = win()
    if (!w || w.isDestroyed()) return
    if (w.isMinimized()) w.restore()
    w.focus()
    w.webContents.send(NAV_CHANNEL, route)
  }
}

export interface BuildAppMenuOptions {
  /** 获取当前主窗口（用闭包，窗口重建时自动拿到最新引用） */
  getMainWindow: () => BrowserWindow | null
  /** 应用名称，默认走 app.name */
  appName?: string
}

/**
 * 构造并安装应用菜单。
 * 返回构造好的 Menu 以便测试断言结构。
 */
export function buildAppMenu(opts: BuildAppMenuOptions): Menu {
  const name = opts.appName ?? app.name ?? 'GrainMark'
  const isMac = process.platform === 'darwin'

  const nav = (route: NavRoute) => makeNavigate(opts.getMainWindow, route)

  const settingsItem: MenuItemConstructorOptions = {
    // macOS 原生约定是 "Preferences…"，但 Electron 15+ 推荐 "Settings…"。
    // 采用原生 role 行不通（role: 'preferences' 不存在），走普通 item 保显式可控。
    label: isMac ? 'Preferences…' : 'Settings',
    accelerator: 'CmdOrCtrl+,',
    click: nav('/settings'),
  }

  const template: MenuItemConstructorOptions[] = []

  // ============ macOS App 菜单 ============
  if (isMac) {
    template.push({
      label: name,
      submenu: [
        { role: 'about', label: `About ${name}` },
        { type: 'separator' },
        settingsItem,
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${name}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${name}` },
      ],
    })
  }

  // ============ File ============
  template.push({
    label: 'File',
    submenu: [
      {
        label: 'Import Photos…',
        accelerator: 'CmdOrCtrl+O',
        // 渲染进程已有完整导入流程；这里借由导航到 Library 并广播同一路由，
        // 渲染端会在快捷键路径中直接触发 importPhotos。
        click: nav('/library'),
      },
      { type: 'separator' },
      // Windows/Linux 的 Settings 放在 File 末尾，macOS 已经在 App 菜单，这里隐藏
      ...(isMac ? [] : ([settingsItem, { type: 'separator' }] as MenuItemConstructorOptions[])),
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  })

  // ============ Edit ============
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? ([
            { role: 'pasteAndMatchStyle' },
            { role: 'delete' },
            { role: 'selectAll' },
          ] as MenuItemConstructorOptions[])
        : ([
            { role: 'delete' },
            { type: 'separator' },
            { role: 'selectAll' },
          ] as MenuItemConstructorOptions[])),
    ],
  })

  // ============ Go（导航） ============
  template.push({
    label: 'Go',
    submenu: [
      { label: 'Library', accelerator: 'CmdOrCtrl+1', click: nav('/library') },
      { label: 'Editor', accelerator: 'CmdOrCtrl+2', click: nav('/editor') },
      { label: 'Batch', accelerator: 'CmdOrCtrl+3', click: nav('/batch') },
      { label: 'Filters', accelerator: 'CmdOrCtrl+4', click: nav('/filters') },
      { label: 'Extract', accelerator: 'CmdOrCtrl+5', click: nav('/extract') },
      { label: 'Taste Lab', accelerator: 'CmdOrCtrl+6', click: nav('/taste') },
      { label: 'Watermark', accelerator: 'CmdOrCtrl+7', click: nav('/watermark') },
      { label: 'AI Studio', accelerator: 'CmdOrCtrl+8', click: nav('/ai') },
      { label: 'Trending', accelerator: 'CmdOrCtrl+9', click: nav('/trending') },
      { type: 'separator' },
      // 再挂一遍 Settings，方便在 Go 菜单里也能直达
      { ...settingsItem, label: 'Settings…' },
    ],
  })

  // ============ View ============
  template.push({
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  })

  // ============ Window ============
  template.push({
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac
        ? ([
            { type: 'separator' },
            { role: 'front' },
            { type: 'separator' },
            { role: 'window' },
          ] as MenuItemConstructorOptions[])
        : ([{ role: 'close' }] as MenuItemConstructorOptions[])),
    ],
  })

  // ============ Help ============
  template.push({
    role: 'help',
    submenu: [
      {
        label: 'GrainMark Website',
        click: async () => {
          await shell.openExternal('https://github.com/alen14690/GrainMark')
        },
      },
    ],
  })

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  return menu
}

/**
 * 从一个 Menu 结构里按 label 查找项（深度优先），测试工具使用。
 * 对渲染/生产无副作用。
 */
export function findMenuItemByLabel(menu: Menu, label: string): Electron.MenuItem | null {
  for (const item of menu.items) {
    if (item.label === label) return item
    if (item.submenu) {
      const hit = findMenuItemByLabel(item.submenu, label)
      if (hit) return hit
    }
  }
  return null
}
