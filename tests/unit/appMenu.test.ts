/**
 * 应用菜单结构测试
 *
 * 说明：Electron 的 Menu API 在 node 环境下可用（属于主进程纯 JS），
 * 我们以 "buildFromTemplate + setApplicationMenu" 双重调用结构校验菜单组织是否符合预期。
 */
import type { BrowserWindow, Menu, MenuItem, MenuItemConstructorOptions } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 必须在 import ../../../electron/menu 之前 mock
vi.mock('electron', () => {
  const Menu = {
    buildFromTemplate: vi.fn((tpl: MenuItemConstructorOptions[]) => {
      const wrap = (items: MenuItemConstructorOptions[]): Menu => {
        const wrapped: MenuItem[] = items.map((it) => {
          const sub = it.submenu as MenuItemConstructorOptions[] | undefined
          return {
            ...it,
            submenu: Array.isArray(sub) ? wrap(sub) : undefined,
          } as unknown as MenuItem
        })
        return { items: wrapped } as unknown as Menu
      }
      return wrap(tpl)
    }),
    setApplicationMenu: vi.fn(),
  }
  return {
    app: { name: 'GrainMark' },
    shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
    Menu,
  }
})

// 动态 import 以保证 mock 生效
let menuModule: typeof import('../../electron/menu')
beforeEach(async () => {
  menuModule = await import('../../electron/menu')
})

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('menu · NAV_ROUTES 白名单', () => {
  it('包含 /settings', () => {
    expect(menuModule.NAV_ROUTES).toContain('/settings')
  })
  it('isNavRoute 正确识别合法与非法值', () => {
    expect(menuModule.isNavRoute('/settings')).toBe(true)
    expect(menuModule.isNavRoute('/evil')).toBe(false)
    expect(menuModule.isNavRoute(123)).toBe(false)
    expect(menuModule.isNavRoute(null)).toBe(false)
    expect(menuModule.isNavRoute(undefined)).toBe(false)
  })
  it('NAV_CHANNEL 固定为 app:navigate', () => {
    expect(menuModule.NAV_CHANNEL).toBe('app:navigate')
  })
})

describe('menu · 跨平台构造', () => {
  const fakeWin = (): BrowserWindow =>
    ({
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      focus: vi.fn(),
      webContents: { send: vi.fn() },
    }) as unknown as BrowserWindow

  const macOriginal = Object.getOwnPropertyDescriptor(process, 'platform')
  const setPlatform = (p: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', { value: p })
  }
  afterEach(() => {
    if (macOriginal) Object.defineProperty(process, 'platform', macOriginal)
  })

  it('macOS：App 菜单首位包含 Preferences…', async () => {
    setPlatform('darwin')
    const win = fakeWin()
    const menu = menuModule.buildAppMenu({ getMainWindow: () => win })
    const pref = menuModule.findMenuItemByLabel(menu, 'Preferences…')
    expect(pref).not.toBeNull()
    expect(pref?.accelerator).toBe('CmdOrCtrl+,')
  })

  it('Win/Linux：File 菜单末尾包含 Settings', async () => {
    setPlatform('win32')
    vi.resetModules()
    const m = await import('../../electron/menu')
    const win = fakeWin()
    const menu = m.buildAppMenu({ getMainWindow: () => win })
    const setting = m.findMenuItemByLabel(menu, 'Settings')
    expect(setting).not.toBeNull()
    expect(setting?.accelerator).toBe('CmdOrCtrl+,')
  })

  it('Go 菜单包含全部主要路由', () => {
    setPlatform('darwin')
    const win = fakeWin()
    const menu = menuModule.buildAppMenu({ getMainWindow: () => win })
    for (const label of [
      'Library',
      'Editor',
      'Batch',
      'Filters',
      'Extract',
      'Taste Lab',
      'Watermark',
      'AI Studio',
      'Trending',
    ]) {
      expect(menuModule.findMenuItemByLabel(menu, label), `missing ${label}`).not.toBeNull()
    }
  })

  it('findMenuItemByLabel 对不存在项返回 null', () => {
    setPlatform('darwin')
    const win = fakeWin()
    const menu = menuModule.buildAppMenu({ getMainWindow: () => win })
    expect(menuModule.findMenuItemByLabel(menu, 'NoSuchItem')).toBeNull()
  })

  it('点击 Preferences… 通过 webContents.send 广播 /settings', () => {
    setPlatform('darwin')
    const send = vi.fn()
    const focus = vi.fn()
    const win = {
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      focus,
      webContents: { send },
    } as unknown as BrowserWindow
    const menu = menuModule.buildAppMenu({ getMainWindow: () => win })
    const pref = menuModule.findMenuItemByLabel(menu, 'Preferences…') as unknown as {
      click?: (...a: unknown[]) => void
    }
    pref?.click?.()
    expect(focus).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('app:navigate', '/settings')
  })

  it('窗口已销毁时点击菜单不抛出也不 send', () => {
    setPlatform('darwin')
    const send = vi.fn()
    const win = {
      isDestroyed: () => true,
      isMinimized: () => false,
      restore: vi.fn(),
      focus: vi.fn(),
      webContents: { send },
    } as unknown as BrowserWindow
    const menu = menuModule.buildAppMenu({ getMainWindow: () => win })
    const pref = menuModule.findMenuItemByLabel(menu, 'Preferences…') as unknown as {
      click?: () => void
    }
    expect(() => pref?.click?.()).not.toThrow()
    expect(send).not.toHaveBeenCalled()
  })

  it('getMainWindow 返回 null 时点击安全降级', () => {
    setPlatform('darwin')
    const menu = menuModule.buildAppMenu({ getMainWindow: () => null })
    const pref = menuModule.findMenuItemByLabel(menu, 'Preferences…') as unknown as {
      click?: () => void
    }
    expect(() => pref?.click?.()).not.toThrow()
  })
})
