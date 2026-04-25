/**
 * GpuRenderer —— 主进程侧，隐藏 BrowserWindow 驱动的 GPU 批处理渲染器（M3-b）
 *
 * 架构：
 * - 单例 + 串行队列；lazy init，首次 renderToBuffer 时才启动 hidden window
 * - 加载 `batch-gpu.html`（dev 走 Vite server，生产走 dist/batch-gpu.html）
 * - 通过 IPC 双向通信：
 *   * 主 → 渲：webContents.send('batch:gpu:task', task)
 *   * 渲 → 主：ipcMain.handle('batch:gpu:ready' | 'batch:gpu:done' | 'batch:gpu:bootstrap-failed')
 *
 * 用途：
 * - renderToBuffer(sourceUrl, pipeline, opts) → { pixels: RGBA, width, height }
 * - 调用方（batch.ts）拿到 pixels 后用 sharp 做格式编码（JPEG/PNG/TIFF/...）和写盘
 *
 * 生命周期管理：
 * - app 退出前调 shutdown() 关闭 hidden window
 * - 若 hidden window 意外关闭（webContents-destroyed），下次 renderToBuffer 会重新 bootstrap
 */
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain } from 'electron'
import type { FilterPipeline } from '../../../shared/types.js'
import { logger } from '../logger/logger.js'

interface GpuTask {
  taskId: string
  pipeline: FilterPipeline | null
  sourceUrl: string
  maxDim: number
}

interface GpuTaskSuccess {
  taskId: string
  ok: true
  width: number
  height: number
  pixels: Uint8Array
}
interface GpuTaskError {
  taskId: string
  ok: false
  error: string
}
type GpuTaskResult = GpuTaskSuccess | GpuTaskError

class GpuRenderer {
  private window: BrowserWindow | null = null
  private ready = false
  private bootstrapFailed = false
  private bootstrapError: string | null = null
  private pending = new Map<string, (r: GpuTaskResult) => void>()
  private initPromise: Promise<void> | null = null
  private ipcRegistered = false

  private registerIpcOnce(): void {
    if (this.ipcRegistered) return
    this.ipcRegistered = true

    // 注意：这里绕过 safeRegister（Zod schema 校验）
    // 原因：batch:gpu:* 通道的调用方是我们自己的 batch-gpu.html 渲染页（不接受用户直接输入），
    //      添加 schema 后当 GpuTaskResult 里的 Uint8Array 走 structured clone 时
    //      Zod 校验开销 ~20ms/张（8MB 缓冲），在批处理场景会累积明显延迟。
    // 作为补偿：任何不合法的 result 都会让 resolver 拿到 undefined 并在 30s 后超时，
    //          不影响系统整体稳定性
    ipcMain.handle('batch:gpu:ready', () => {
      this.ready = true
      logger.info('gpu.ready')
      return undefined
    })
    ipcMain.handle('batch:gpu:bootstrap-failed', (_e, reason: string) => {
      this.bootstrapFailed = true
      this.bootstrapError = reason
      logger.warn('gpu.bootstrap.failed', { reason })
      return undefined
    })
    ipcMain.handle('batch:gpu:done', (_e, result: GpuTaskResult) => {
      const resolver = this.pending.get(result.taskId)
      if (resolver) {
        this.pending.delete(result.taskId)
        resolver(result)
      }
      return undefined
    })
  }

  private getBatchGpuUrl(): string {
    const devUrl = process.env.VITE_DEV_SERVER_URL
    if (devUrl) {
      return `${devUrl.replace(/\/$/, '')}/batch-gpu.html`
    }
    // 生产：dist/batch-gpu.html（与主 renderer 同目录）
    const mainDir = path.dirname(fileURLToPath(import.meta.url))
    return `file://${path.join(mainDir, '..', 'dist', 'batch-gpu.html')}`
  }

  async ensureBootstrap(): Promise<void> {
    if (this.ready) return
    if (this.bootstrapFailed) {
      throw new Error(`GPU bootstrap failed: ${this.bootstrapError}`)
    }
    if (this.initPromise) return this.initPromise

    this.registerIpcOnce()

    this.initPromise = (async () => {
      const mainDir = path.dirname(fileURLToPath(import.meta.url))
      const preloadPath = path.join(mainDir, 'preload.mjs')
      this.window = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          // offscreen:false 仍让 GPU 合成；offscreen:true 会失去硬件加速
          offscreen: false,
        },
      })

      this.window.on('closed', () => {
        this.window = null
        this.ready = false
      })

      const url = this.getBatchGpuUrl()
      try {
        await this.window.loadURL(url)
      } catch (e) {
        this.bootstrapFailed = true
        this.bootstrapError = `loadURL failed: ${(e as Error).message}`
        throw new Error(this.bootstrapError)
      }

      // 等 ready 事件（最多 8 秒）
      const start = Date.now()
      while (!this.ready && !this.bootstrapFailed && Date.now() - start < 8000) {
        await new Promise((r) => setTimeout(r, 50))
      }
      if (this.bootstrapFailed) {
        throw new Error(`GPU bootstrap failed: ${this.bootstrapError}`)
      }
      if (!this.ready) {
        this.bootstrapFailed = true
        this.bootstrapError = 'timeout waiting for batch:gpu:ready'
        throw new Error(this.bootstrapError)
      }
    })()

    try {
      await this.initPromise
    } finally {
      this.initPromise = null
    }
  }

  /** 渲染单张并返回 RGBA buffer */
  async renderToBuffer(opts: {
    taskId: string
    pipeline: FilterPipeline | null
    sourceUrl: string
    maxDim?: number
  }): Promise<GpuTaskSuccess> {
    await this.ensureBootstrap()
    if (!this.window) throw new Error('GPU window not available')

    const task: GpuTask = {
      taskId: opts.taskId,
      pipeline: opts.pipeline,
      sourceUrl: opts.sourceUrl,
      maxDim: opts.maxDim ?? 0,
    }

    return await new Promise<GpuTaskSuccess>((resolve, reject) => {
      // 超时保护（30s / 张）
      const timer = setTimeout(() => {
        this.pending.delete(task.taskId)
        reject(new Error(`GPU render timeout for task ${task.taskId}`))
      }, 30000)

      this.pending.set(task.taskId, (r) => {
        clearTimeout(timer)
        if (r.ok) resolve(r)
        else reject(new Error(r.error))
      })

      this.window?.webContents.send('batch:gpu:task', task)
    })
  }

  /** 关闭隐藏 window（app.before-quit 调用） */
  shutdown(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.window = null
    this.ready = false
    this.pending.clear()
  }

  /** 测试辅助：查询是否已初始化 */
  isReady(): boolean {
    return this.ready
  }
}

let singleton: GpuRenderer | null = null

export function getGpuRenderer(): GpuRenderer {
  if (!singleton) singleton = new GpuRenderer()
  return singleton
}

export function shutdownGpuRenderer(): void {
  if (singleton) {
    singleton.shutdown()
    singleton = null
  }
}

export type { GpuTaskSuccess, GpuTaskError, GpuTaskResult }
