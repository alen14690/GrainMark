/**
 * useGlobalHotkeys
 * 渲染端兜底快捷键（主进程原生菜单 accelerator 已覆盖 99% 场景，这里兜住两类情况）：
 *   1. 开发者工具打开时 devtools 窗口抢走了焦点 — 主进程菜单可能被 Electron 吞
 *   2. 输入框聚焦时的 key event 由 DOM 冒泡抢先到达渲染进程
 * 这两种情况下主进程菜单仍会工作，此 hook 只是双保险 + 与 Web 直觉一致。
 *
 * 行为：
 *   - CmdOrCtrl + ,        → /settings
 *   - CmdOrCtrl + 1..9     → 主要路由（同主进程 Go 菜单）
 *
 * 安全：只跳预定义路由，不接受任何外部字符串；对 input/textarea/contenteditable 里的 ⌘,
 * 保持触发（专业工具惯例：⌘, 应全局可用，和 Photoshop/Lightroom 一致）。
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { type RendererNavRoute, isRendererNavRoute } from './useAppNavigation'

const DIGIT_MAP: Record<string, RendererNavRoute> = {
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

/** 判断是否命中 "⌘" on mac / "Ctrl" 其他平台
 *
 * 优先级：
 *   1. 主进程通过 preload 暴露的 window.grain.platform（运行时最可信）
 *   2. navigator.platform（浏览器兜底，用于单元测试/非 Electron 环境）
 * 一旦 (1) 存在，就完全忽略 (2)，避免测试里 stub 了 window 但拿不到 navigator 导致误判。
 */
function isCmdOrCtrl(e: KeyboardEvent): boolean {
  const grainPlatform = typeof window !== 'undefined' ? window.grain?.platform : undefined
  const isMac =
    grainPlatform !== undefined
      ? grainPlatform === 'darwin'
      : typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  return isMac ? e.metaKey : e.ctrlKey
}

export function resolveHotkey(e: KeyboardEvent): RendererNavRoute | null {
  if (!isCmdOrCtrl(e)) return null
  if (e.altKey) return null // 避免与 IME / 复合快捷键冲突
  // ⌘,  → /settings
  if (e.key === ',') return '/settings'
  // ⌘1..9 → 主路由；注意 Shift+⌘+1 这种组合放行给用户/系统其它用途
  if (!e.shiftKey && Object.hasOwn(DIGIT_MAP, e.key)) {
    const r = DIGIT_MAP[e.key]
    return r && isRendererNavRoute(r) ? r : null
  }
  return null
}

export function useGlobalHotkeys(): void {
  const navigate = useNavigate()
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: KeyboardEvent) => {
      const route = resolveHotkey(e)
      if (!route) return
      e.preventDefault()
      e.stopPropagation()
      navigate(route)
    }
    // capture: 抢在子组件 keydown 之前处理，避免 Slider 之类的组件阻止冒泡导致丢键
    window.addEventListener('keydown', handler, { capture: true })
    return () => {
      window.removeEventListener('keydown', handler, { capture: true })
    }
  }, [navigate])
}
