/**
 * 全局快捷键解析纯函数测试
 *
 * 只测 resolveHotkey（不涉及 React hook），确保关键位行为稳定：
 *   - macOS：metaKey
 *   - 其他：ctrlKey
 *   - ⌘/Ctrl + ,      → /settings
 *   - ⌘/Ctrl + 1..9   → 主路由
 *   - Alt / Shift+数字不触发（避免 IME 冲突）
 *   - 非白名单键返回 null
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 被测模块依赖 react-router-dom 的 useNavigate，但 resolveHotkey 纯函数不用它。
// 仅 mock 避免按需 import 时的副作用解析。
vi.mock('react-router-dom', () => ({
  useNavigate: () => () => undefined,
}))

let resolveHotkey: typeof import('../../src/lib/useGlobalHotkeys').resolveHotkey

/** 用 window.grain.platform 控制 isCmdOrCtrl 判定平台（优先于 navigator.platform）。
 * 在 Node 20+ globalThis.navigator 是 read-only getter，不能直接赋值，因此仅改 window。 */
function setPlatform(platform: 'darwin' | 'win32') {
  vi.stubGlobal('window', { grain: { platform } })
}

function kd(init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
  // node 环境下没有原生 KeyboardEvent，构造一个结构等价对象
  return {
    key: init.key,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  } as unknown as KeyboardEvent
}

beforeEach(async () => {
  vi.resetModules()
  ;({ resolveHotkey } = await import('../../src/lib/useGlobalHotkeys'))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveHotkey · macOS', () => {
  beforeEach(() => setPlatform('darwin'))

  it('⌘, → /settings', () => {
    expect(resolveHotkey(kd({ key: ',', metaKey: true }))).toBe('/settings')
  })
  it('Ctrl+, 在 macOS 不触发（走 metaKey）', () => {
    expect(resolveHotkey(kd({ key: ',', ctrlKey: true }))).toBeNull()
  })
  it('⌘1 → /library', () => {
    expect(resolveHotkey(kd({ key: '1', metaKey: true }))).toBe('/library')
  })
  it('⌘9 → /trending', () => {
    expect(resolveHotkey(kd({ key: '9', metaKey: true }))).toBe('/trending')
  })
  it('不含修饰键时不触发', () => {
    expect(resolveHotkey(kd({ key: ',' }))).toBeNull()
    expect(resolveHotkey(kd({ key: '1' }))).toBeNull()
  })
  it('Alt 组合不触发（避免 IME / Emoji 面板冲突）', () => {
    expect(resolveHotkey(kd({ key: ',', metaKey: true, altKey: true }))).toBeNull()
  })
  it('Shift+⌘+1 不触发（留给其它用途）', () => {
    expect(resolveHotkey(kd({ key: '1', metaKey: true, shiftKey: true }))).toBeNull()
  })
  it('未定义数字（0）返回 null', () => {
    expect(resolveHotkey(kd({ key: '0', metaKey: true }))).toBeNull()
  })
  it('非白名单键返回 null', () => {
    expect(resolveHotkey(kd({ key: 'k', metaKey: true }))).toBeNull()
  })
})

describe('resolveHotkey · Win/Linux', () => {
  beforeEach(() => setPlatform('win32'))

  it('Ctrl+, → /settings', () => {
    expect(resolveHotkey(kd({ key: ',', ctrlKey: true }))).toBe('/settings')
  })
  it('⌘, 在 Win/Linux 不触发', () => {
    expect(resolveHotkey(kd({ key: ',', metaKey: true }))).toBeNull()
  })
  it('Ctrl+1..9 全部解析', () => {
    const map: Record<string, string> = {
      '1': '/library',
      '2': '/editor',
      '3': '/batch',
      '4': '/filters',
      '5': '/extract',
      '6': '/taste',
      '7': '/watermark',
      '8': '/ai',
      '9': '/trending',
    }
    for (const [digit, expected] of Object.entries(map)) {
      expect(resolveHotkey(kd({ key: digit, ctrlKey: true }))).toBe(expected)
    }
  })
})

describe('isRendererNavRoute', () => {
  it('和菜单白名单一致（至少覆盖 /settings）', async () => {
    const m = await import('../../src/lib/useAppNavigation')
    expect(m.isRendererNavRoute('/settings')).toBe(true)
    expect(m.isRendererNavRoute('/evil')).toBe(false)
    expect(m.isRendererNavRoute(42)).toBe(false)
  })
})
