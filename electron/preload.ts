import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload — 严格 sandbox 兼容版本
 * 注意：sandbox: true 下 preload **不能** 使用 Node 模块（仅部分 electron API）
 *
 * 暴露结构：
 *   window.grain = {
 *     invoke(channel, ...args)      — 类型化 IPC 调用
 *     on(channel, listener)         — 订阅主进程事件（取消函数）
 *     platform                      — 平台标识
 *   }
 *
 * 所有实际能力都通过 IPC 走，渲染进程拿不到任何 Node API。
 */

/** IPC 通道白名单（主进程也会做校验，此处只做快速失败）
 *  支持两种形式：
 *    - 单段：prefix:actionName        （主入口，如 batch:start / preview:render）
 *    - 子空间：prefix:sub:actionName  （子系统，如 batch:gpu:ready / batch:gpu:task）
 */
const CHANNEL_PATTERN =
  /^(filter|photo|preview|batch|extract|watermark|ai|llm|trending|sync|settings|dialog|taste|score|evolve|app):([a-zA-Z]+|[a-zA-Z]+:[a-zA-Z-]+)$/

const api = {
  invoke: (channel: string, ...args: unknown[]) => {
    if (typeof channel !== 'string' || !CHANNEL_PATTERN.test(channel)) {
      return Promise.reject(new Error(`Invalid IPC channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  on: (channel: string, listener: (...args: unknown[]) => void) => {
    if (typeof channel !== 'string' || !CHANNEL_PATTERN.test(channel)) {
      throw new Error(`Invalid IPC channel: ${channel}`)
    }
    const wrapper = (_: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args)
    ipcRenderer.on(channel, wrapper)
    return () => ipcRenderer.removeListener(channel, wrapper)
  },

  platform: process.platform,
}

contextBridge.exposeInMainWorld('grain', api)

export type GrainApi = typeof api
