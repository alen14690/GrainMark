/**
 * FrameExporter — 离屏 BrowserWindow + capturePage 驱动的全分辨率边框导出
 *
 * 架构：
 *   - 离屏 BrowserWindow 加载 frame-export.html
 *   - 渲染端用 React 的 FramePreviewHost（与编辑器前端完全相同的组件）
 *   - 渲染完成后主进程用 webContents.capturePage() 截图
 *   - capturePage 是浏览器原生截图：CSS filter/blur/gradient 等效果 100% 保真
 *
 * 为什么不用 html-to-image：
 *   html-to-image 底层用 SVG foreignObject + canvas 重绘，对 CSS blur 滤镜支持不完美。
 *   capturePage 直接从 GPU 合成器取像素，效果与浏览器显示完全一致。
 */
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain } from 'electron'
import type { FrameStyle, FrameStyleOverrides, Photo } from '../../../shared/types.js'
import { logger } from '../logger/logger.js'

interface RenderedNotification {
  taskId: string
  ok: boolean
  width?: number
  height?: number
  error?: string
}

class FrameExporter {
  private window: BrowserWindow | null = null
  private ready = false
  private bootstrapFailed = false
  private bootstrapError: string | null = null
  private pending = new Map<string, (r: RenderedNotification) => void>()
  private initPromise: Promise<void> | null = null
  private ipcRegistered = false

  private registerIpcOnce(): void {
    if (this.ipcRegistered) return
    this.ipcRegistered = true

    ipcMain.handle('frame:export:ready', () => {
      this.ready = true
      logger.info('frame.exporter.ready')
      return undefined
    })
    // 渲染端通知"DOM 渲染完毕，可以截图"
    ipcMain.handle('frame:export:rendered', (_e, notification: RenderedNotification) => {
      const resolver = this.pending.get(notification.taskId)
      if (resolver) {
        this.pending.delete(notification.taskId)
        resolver(notification)
      }
      return undefined
    })
  }

  private getFrameExportUrl(): string {
    const devUrl = process.env.VITE_DEV_SERVER_URL
    if (devUrl) {
      return `${devUrl.replace(/\/$/, '')}/frame-export.html`
    }
    const mainDir = path.dirname(fileURLToPath(import.meta.url))
    return `file://${path.join(mainDir, '..', 'dist', 'frame-export.html')}`
  }

  async ensureBootstrap(): Promise<void> {
    if (this.ready) return
    if (this.bootstrapFailed) {
      throw new Error(`Frame exporter bootstrap failed: ${this.bootstrapError}`)
    }
    if (this.initPromise) return this.initPromise

    this.registerIpcOnce()

    this.initPromise = (async () => {
      const mainDir = path.dirname(fileURLToPath(import.meta.url))
      const preloadPath = path.join(mainDir, 'preload.mjs')
      this.window = new BrowserWindow({
        show: false,
        // 足够大以容纳全分辨率渲染（Electron 会按需分配）
        width: 4096,
        height: 4096,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          offscreen: false,
        },
      })

      this.window.on('closed', () => {
        this.window = null
        this.ready = false
      })

      const url = this.getFrameExportUrl()
      try {
        await this.window.loadURL(url)
      } catch (e) {
        this.bootstrapFailed = true
        this.bootstrapError = `loadURL failed: ${(e as Error).message}`
        throw new Error(this.bootstrapError)
      }

      const start = Date.now()
      while (!this.ready && !this.bootstrapFailed && Date.now() - start < 10000) {
        await new Promise((r) => setTimeout(r, 50))
      }
      if (this.bootstrapFailed) {
        throw new Error(`Frame exporter bootstrap failed: ${this.bootstrapError}`)
      }
      if (!this.ready) {
        this.bootstrapFailed = true
        this.bootstrapError = 'timeout waiting for frame:export:ready'
        throw new Error(this.bootstrapError)
      }
    })()

    try {
      await this.initPromise
    } finally {
      this.initPromise = null
    }
  }

  /**
   * 导出带边框的全分辨率图片
   *
   * 流程：
   *   1. 调整离屏窗口尺寸为目标 canvas 尺寸
   *   2. 发送 task 给渲染端（React 渲染 FramePreviewHost）
   *   3. 渲染端完成后通知主进程
   *   4. 主进程 capturePage() 截取浏览器原生渲染结果
   *
   * @returns JPEG Buffer
   */
  async exportFrame(opts: {
    taskId: string
    photoDataUrl: string
    photo: Photo
    style: FrameStyle
    overrides: FrameStyleOverrides
    width: number
    height: number
  }): Promise<Buffer> {
    await this.ensureBootstrap()
    if (!this.window) throw new Error('Frame export window not available')

    // 调整窗口尺寸为目标 canvas 尺寸
    this.window.setContentSize(opts.width, opts.height)

    // 发送任务给渲染端
    const notification = await new Promise<RenderedNotification>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(opts.taskId)
        reject(new Error(`Frame export timeout for task ${opts.taskId}`))
      }, 60000)

      this.pending.set(opts.taskId, (r) => {
        clearTimeout(timer)
        resolve(r)
      })

      this.window?.webContents.send('frame:export:task', {
        taskId: opts.taskId,
        photoDataUrl: opts.photoDataUrl,
        photo: opts.photo,
        style: opts.style,
        overrides: opts.overrides,
        width: opts.width,
        height: opts.height,
      })
    })

    if (!notification.ok) {
      throw new Error(`Frame render failed: ${notification.error}`)
    }

    // capturePage — 浏览器原生截图，CSS 效果 100% 保真
    const image = await this.window.webContents.capturePage({
      x: 0,
      y: 0,
      width: opts.width,
      height: opts.height,
    })

    const jpegBuffer = image.toJPEG(92)
    logger.info('frame.exported', {
      taskId: opts.taskId,
      styleId: opts.style.id,
      size: `${opts.width}x${opts.height}`,
      outputBytes: jpegBuffer.length,
    })

    return jpegBuffer
  }

  shutdown(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.window = null
    this.ready = false
    this.pending.clear()
  }
}

let singleton: FrameExporter | null = null

export function getFrameExporter(): FrameExporter {
  if (!singleton) singleton = new FrameExporter()
  return singleton
}

export function shutdownFrameExporter(): void {
  if (singleton) {
    singleton.shutdown()
    singleton = null
  }
}
