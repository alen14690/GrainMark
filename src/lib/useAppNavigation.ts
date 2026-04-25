/**
 * useAppNavigation
 * 订阅主进程 `app:navigate` 事件，把菜单/原生快捷键的路由请求转化为 react-router 跳转。
 *
 * 仅允许白名单路由跳转（与主进程 NAV_ROUTES 一致），任何异常字符串一律忽略并记录警告。
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const NAV_CHANNEL = 'app:navigate'

export const RENDERER_NAV_ROUTES = [
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
export type RendererNavRoute = (typeof RENDERER_NAV_ROUTES)[number]

export function isRendererNavRoute(v: unknown): v is RendererNavRoute {
  return typeof v === 'string' && (RENDERER_NAV_ROUTES as readonly string[]).includes(v)
}

export function useAppNavigation(): void {
  const navigate = useNavigate()
  useEffect(() => {
    if (typeof window === 'undefined' || !window.grain?.on) return
    const off = window.grain.on(NAV_CHANNEL, (...args: unknown[]) => {
      const target = args[0]
      if (!isRendererNavRoute(target)) {
        console.warn('[app:navigate] ignored unknown route', target)
        return
      }
      navigate(target)
    })
    return off
  }, [navigate])
}
