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
  /^(filter|photo|preview|batch|extract|watermark|ai|llm|trending|sync|settings|dialog|app|perf):([a-zA-Z]+|[a-zA-Z]+:[a-zA-Z-]+)$/

/**
 * testMode 标志:仅当主进程启动时设置了 `GRAINMARK_TEST=1` 才为 true。
 * - E2E 测试环境(launchApp 会注入该环境变量)下暴露,供渲染进程判定是否挂载
 *   `__grainEditStore` 等调试钩子
 * - 生产构建默认不会有此环境变量 → testMode=false → 调试钩子不挂载
 * - 替代掉 `import.meta.env.DEV || MODE === 'test'` 条件:那只在 vite dev 服务器下为真,
 *   `npm run build` 产物里恒为 false,导致 E2E(跑的就是 build 产物)无法访问 store
 */
const testMode = process.env.GRAINMARK_TEST === '1'

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
  testMode,
}

contextBridge.exposeInMainWorld('grain', api)

export type GrainApi = typeof api
