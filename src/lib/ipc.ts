/**
 * 类型化 IPC 调用封装
 */
import type { IpcApi, IpcChannel } from '../../shared/types'

export function ipc<K extends IpcChannel>(channel: K, ...args: Parameters<IpcApi[K]>): ReturnType<IpcApi[K]> {
  if (typeof window === 'undefined' || !window.grain) {
    throw new Error('IPC not available (window.grain missing). Running outside Electron?')
  }
  return window.grain.invoke(channel, ...args)
}

export const hasGrain = (): boolean => typeof window !== 'undefined' && !!window.grain

/**
 * 订阅主进程推送的事件（与 invoke 不同，这是单向 push）
 * @returns 取消订阅函数
 */
export function ipcOn<T = unknown>(channel: string, listener: (payload: T) => void): () => void {
  if (typeof window === 'undefined' || !window.grain) {
    return () => undefined
  }
  return window.grain.on(channel, (payload) => listener(payload as T))
}
