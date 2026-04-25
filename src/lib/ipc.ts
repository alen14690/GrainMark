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
