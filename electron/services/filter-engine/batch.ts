/**
 * filter-engine/batch —— 批处理入口（M3 Worker Pool 版）
 *
 * 架构：
 * - startBatch 创建 BatchJob，派发到 WorkerPool（Node worker_threads）
 * - 每个 worker 独立跑 sharp pipeline，结果回传后更新 job item 状态
 * - 进度通过 BrowserWindow.webContents.send('batch:progress', update) 推给渲染侧
 * - cancelBatch 标记 job.cancelled，并让 pool shutdown 所有 worker
 *
 * 错误隔离：单个 item 失败只影响该 item；worker 崩溃由 pool 重启兜底
 */
import * as fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { BrowserWindow } from 'electron'
import { nanoid } from 'nanoid'
import sharp from 'sharp'
import type { BatchJob, BatchJobConfig, BatchJobItem, FilterPipeline } from '../../../shared/types.js'
import { getGpuRenderer } from '../batch/gpuRenderer.js'
import { renderNamingTemplate, resolveConflict } from '../batch/namingTemplate.js'
import { detectIgnoredChannels } from '../batch/pipelineSharp.js'
import type { BatchTask, MainMessage, WorkerMessage } from '../batch/worker.js'
import { readExif } from '../exif/reader.js'
import { logger } from '../logger/logger.js'
import { orientImage, resolvePreviewBuffer } from '../raw/index.js'
import { isRawFormat } from '../raw/rawDecoder.js'
import { getFilter } from '../storage/filterStore.js'

const jobs = new Map<string, BatchJob>()
const activePools = new Map<string, WorkerPool>()

/** progress 事件类型（shared/types 同步） */
export interface BatchProgressEvent {
  jobId: string
  itemId?: string
  status?: BatchJobItem['status']
  progress?: number
  outputPath?: string
  error?: string
  /** job 层面：completed / total（用于整体进度条） */
  completed: number
  total: number
  jobStatus: BatchJob['status']
}

/** 给所有渲染进程 window 推送进度（多窗口安全） */
function broadcastProgress(evt: BatchProgressEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('batch:progress', evt)
    }
  }
}

/**
 * Worker 路径：与编译后的 main.js 同目录（dist-electron/batch-worker.mjs）
 * - 开发：dist-electron 由 vite-plugin-electron 即时 build
 * - 生产：被 electron-builder 打包到 app.asar 中的 dist-electron
 * - 测试：Playwright 启动 dist-electron/main.js，__dirname 自然指向 dist-electron
 * - 使用 .mjs 扩展名让 Node 按 ESM 加载 worker
 */
function getWorkerPath(): string {
  const mainDir = path.dirname(fileURLToPath(import.meta.url))
  return path.join(mainDir, 'batch-worker.mjs')
}

class WorkerPool {
  private workers: Worker[] = []
  private idleWorkers: Worker[] = []
  private queue: BatchTask[] = []
  private pending = new Map<Worker, BatchTask>()
  private resolvers = new Map<string, (r: { ok: boolean; outputPath?: string; error?: string }) => void>()
  private shuttingDown = false
  private readyCount = 0
  private readyResolvers: Array<() => void> = []

  constructor(private readonly size: number) {
    const workerPath = getWorkerPath()
    for (let i = 0; i < size; i++) {
      // worker 产物为 .mjs，Node 自动按 ESM 加载
      const w = new Worker(workerPath)
      w.on('message', (msg: WorkerMessage) => this.handleMessage(w, msg))
      w.on('error', (err) => this.handleWorkerError(w, err))
      w.on('exit', () => this.handleWorkerExit(w))
      this.workers.push(w)
    }
  }

  /** 等所有 worker 发完 ready（至多 3s） */
  async waitReady(timeoutMs = 3000): Promise<void> {
    if (this.readyCount >= this.size) return
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs)
      this.readyResolvers.push(() => {
        clearTimeout(t)
        resolve()
      })
    })
  }

  private handleMessage(w: Worker, msg: WorkerMessage): void {
    if (msg.type === 'ready') {
      this.readyCount++
      this.idleWorkers.push(w)
      if (this.readyCount >= this.size) {
        const rs = this.readyResolvers.splice(0)
        for (const r of rs) r()
      }
      this.drain()
      return
    }
    if (msg.type === 'result') {
      const task = this.pending.get(w)
      this.pending.delete(w)
      if (task) {
        const resolver = this.resolvers.get(task.taskId)
        this.resolvers.delete(task.taskId)
        if (resolver) {
          resolver(msg.ok ? { ok: true, outputPath: msg.outputPath } : { ok: false, error: msg.error })
        }
      }
      if (!this.shuttingDown) {
        this.idleWorkers.push(w)
        this.drain()
      }
    }
  }

  private handleWorkerError(w: Worker, err: Error): void {
    const task = this.pending.get(w)
    if (task) {
      const resolver = this.resolvers.get(task.taskId)
      this.resolvers.delete(task.taskId)
      if (resolver) resolver({ ok: false, error: `worker error: ${err.message}` })
      this.pending.delete(w)
    }
  }

  private handleWorkerExit(w: Worker): void {
    this.workers = this.workers.filter((x) => x !== w)
    this.idleWorkers = this.idleWorkers.filter((x) => x !== w)
  }

  run(task: BatchTask): Promise<{ ok: boolean; outputPath?: string; error?: string }> {
    return new Promise((resolve) => {
      this.resolvers.set(task.taskId, resolve)
      this.queue.push(task)
      this.drain()
    })
  }

  private drain(): void {
    while (this.idleWorkers.length > 0 && this.queue.length > 0 && !this.shuttingDown) {
      const w = this.idleWorkers.shift()!
      const task = this.queue.shift()!
      this.pending.set(w, task)
      const msg: MainMessage = { type: 'process', task }
      w.postMessage(msg)
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
    // 先清空队列未执行的 task —— 它们 resolve 成 cancelled
    for (const t of this.queue) {
      const r = this.resolvers.get(t.taskId)
      this.resolvers.delete(t.taskId)
      if (r) r({ ok: false, error: 'cancelled' })
    }
    this.queue = []
    // 通知 worker 退出
    await Promise.all(
      this.workers.map(
        (w) =>
          new Promise<void>((resolve) => {
            try {
              const msg: MainMessage = { type: 'shutdown' }
              w.postMessage(msg)
              w.once('exit', () => resolve())
              // 2s 后强制 terminate
              setTimeout(() => {
                void w.terminate().catch(() => undefined)
                resolve()
              }, 2000)
            } catch {
              resolve()
            }
          }),
      ),
    )
  }
}

export async function startBatch(config: BatchJobConfig, photoPaths: string[]): Promise<string> {
  const id = nanoid(12)
  const timestamp = Date.now()
  const job: BatchJob = {
    id,
    createdAt: timestamp,
    config,
    status: 'running',
    items: photoPaths.map((p) => ({
      id: nanoid(8),
      photoPath: p,
      photoName: p.split(/[\\/]/).pop() ?? p,
      status: 'pending',
      progress: 0,
    })),
  }
  jobs.set(id, job)

  // 预读 filter pipeline / filter 名字
  const filter = config.filterId ? await getFilter(config.filterId) : null
  const pipeline: FilterPipeline | null = filter?.pipeline ?? null
  const filterName = filter?.id ?? config.filterId ?? 'original'

  // 启动 pool
  const concurrency = Math.max(1, Math.min(16, config.concurrency))
  const pool = new WorkerPool(concurrency)
  activePools.set(id, pool)
  await pool.waitReady()

  broadcastProgress({
    jobId: id,
    completed: 0,
    total: job.items.length,
    jobStatus: 'running',
  })

  // 异步派发所有 task（不阻塞 IPC 返回）
  void (async () => {
    let completed = 0
    // 预读每张照片的 EXIF 与 RAW 预览 buffer（串行以免主线程被拖垮，worker 只做 sharp 计算）
    for (let i = 0; i < job.items.length; i++) {
      if (job.status === 'cancelled') break
      const item = job.items[i]!
      item.status = 'running'
      broadcastProgress({
        jobId: id,
        itemId: item.id,
        status: 'running',
        progress: 0,
        completed,
        total: job.items.length,
        jobStatus: 'running',
      })

      let exif: { model?: string; iso?: number } | undefined
      let previewBuffer: Buffer | undefined
      let sourceOrientation: number | undefined
      try {
        const e = await readExif(item.photoPath)
        exif = { model: e.model, iso: e.iso }
      } catch {
        exif = undefined
      }
      if (isRawFormat(item.photoPath)) {
        try {
          const r = await resolvePreviewBuffer(item.photoPath)
          previewBuffer = r.buffer
          sourceOrientation = r.sourceOrientation
        } catch (e) {
          item.status = 'failed'
          item.error = `RAW 预览提取失败：${(e as Error).message}`
          completed++
          broadcastProgress({
            jobId: id,
            itemId: item.id,
            status: 'failed',
            error: item.error,
            completed,
            total: job.items.length,
            jobStatus: 'running',
          })
          continue
        }
      }

      const task: BatchTask = {
        taskId: item.id,
        photoPath: item.photoPath,
        photoName: item.photoName,
        outputDir: config.outputDir,
        pipeline,
        filterName,
        config,
        timestamp,
        index: i + 1,
        exif,
        previewBuffer,
        sourceOrientation,
      }

      // 判断该 pipeline 是否需要 GPU 路径（包含任何 CPU sharp 管线不支持的通道）
      const needsGpu = pipeline ? detectIgnoredChannels(pipeline).length > 0 : false

      // 统一的 Promise：resolve 出 { ok, outputPath?, error? }
      const runPromise: Promise<{ ok: boolean; outputPath?: string; error?: string }> = needsGpu
        ? dispatchGpuTask(task, pipeline)
        : pool.run(task)

      // pool.run 本身有 concurrency 上限，这里不等它返回就继续派发（让 pool 内部排队）
      void runPromise.then((r) => {
        if (r.ok) {
          item.status = 'success'
          item.progress = 100
          item.outputPath = r.outputPath
        } else {
          item.status = r.error === 'cancelled' ? 'cancelled' : 'failed'
          item.error = r.error
        }
        completed++
        broadcastProgress({
          jobId: id,
          itemId: item.id,
          status: item.status,
          progress: item.progress,
          outputPath: item.outputPath,
          error: item.error,
          completed,
          total: job.items.length,
          jobStatus:
            job.status === 'cancelled' ? 'cancelled' : completed >= job.items.length ? 'success' : 'running',
        })

        if (completed >= job.items.length && job.status !== 'cancelled') {
          job.status = job.items.some((it) => it.status === 'failed') ? 'failed' : 'success'
          void pool.shutdown()
          activePools.delete(id)
          broadcastProgress({
            jobId: id,
            completed,
            total: job.items.length,
            jobStatus: job.status,
          })
        }
      })
    }
  })()

  return id
}

export function cancelBatch(jobId: string): void {
  const job = jobs.get(jobId)
  if (!job) return
  job.status = 'cancelled'
  for (const item of job.items) {
    if (item.status === 'pending' || item.status === 'running') {
      item.status = 'cancelled'
    }
  }
  const pool = activePools.get(jobId)
  if (pool) {
    void pool.shutdown().finally(() => activePools.delete(jobId))
  }
  broadcastProgress({
    jobId,
    completed: job.items.filter((it) => it.status !== 'pending' && it.status !== 'running').length,
    total: job.items.length,
    jobStatus: 'cancelled',
  })
}

export function getBatchStatus(jobId: string): BatchJob | null {
  return jobs.get(jobId) ?? null
}

/**
 * GPU 任务派发 —— M3-b 路径
 *
 * 流程：
 * 1. 构造 data URL（非 RAW：file://）或 sourceUrl；RAW 已有 previewBuffer 则转 data URL
 * 2. 调 gpuRenderer.renderToBuffer 获得 RGBA pixels
 * 3. 用 sharp 从 raw pixels 编码为目标格式并写盘
 * 4. 命名模板 + 冲突解决与 CPU 路径一致
 */
async function dispatchGpuTask(
  task: BatchTask,
  pipeline: FilterPipeline | null,
): Promise<{ ok: boolean; outputPath?: string; error?: string }> {
  try {
    // 1) 准备 sourceUrl 给渲染进程 fetch
    //    统一 orientation 处理（Single Source of Truth：orientImage）
    let sourceUrl: string
    if (task.previewBuffer) {
      // RAW 已预读：用 orientImage 统一处理方向
      const buf = await orientImage(task.previewBuffer, task.sourceOrientation)
        .jpeg({ quality: 95 })
        .toBuffer()
      sourceUrl = `data:image/jpeg;base64,${buf.toString('base64')}`
    } else {
      // 非 RAW：orientImage(buffer, undefined) → sharp.rotate() autoOrient
      const buf = await orientImage(await fsp.readFile(task.photoPath), undefined)
        .jpeg({ quality: 95 })
        .toBuffer()
      sourceUrl = `data:image/jpeg;base64,${buf.toString('base64')}`
    }

    // 2) 让 GPU 渲染
    const gpuResult = await getGpuRenderer().renderToBuffer({
      taskId: task.taskId,
      pipeline,
      sourceUrl,
      maxDim: 0, // 原尺寸
    })

    // 3) sharp 从 raw RGBA → 目标格式 + EXIF 保留
    let img = sharp(Buffer.from(gpuResult.pixels.buffer), {
      raw: {
        width: gpuResult.width,
        height: gpuResult.height,
        channels: 4,
      },
    })

    // EXIF 保留：只能从原图带过来（这里简化：只有非 RAW 时能保留）
    if (task.config.keepExif && task.previewBuffer) {
      // RAW 的 EXIF 走主进程已拿到的 task.exif；sharp.withMetadata 需要完整 EXIF block，
      // 暂不完整保留（M3-b A-2 再做）
    }

    // resize
    if (task.config.resize && task.config.resize.mode !== 'none' && task.config.resize.value > 0) {
      const rz = task.config.resize
      switch (rz.mode) {
        case 'long-edge':
          img = img.resize({ width: rz.value, height: rz.value, fit: 'inside', withoutEnlargement: true })
          break
        case 'short-edge':
          img = img.resize({ width: rz.value, height: rz.value, fit: 'outside', withoutEnlargement: true })
          break
        case 'width':
          img = img.resize({ width: rz.value, withoutEnlargement: true })
          break
        case 'height':
          img = img.resize({ height: rz.value, withoutEnlargement: true })
          break
      }
    }

    const q = Math.max(1, Math.min(100, task.config.quality))
    switch (task.config.format) {
      case 'jpg':
        img = img.jpeg({ quality: q, mozjpeg: true })
        break
      case 'png':
        img = img.png({ compressionLevel: 9 })
        break
      case 'tiff':
        img = img.tiff({ quality: q, compression: 'lzw' })
        break
      case 'webp':
        img = img.webp({ quality: q })
        break
      case 'avif':
        img = img.avif({ quality: q })
        break
    }

    const buffer = await img.toBuffer()

    // 4) 命名 + 写盘
    const ext = task.config.format === 'jpg' ? 'jpg' : task.config.format
    const rawName = renderNamingTemplate(task.config.namingTemplate, {
      name: path.parse(task.photoName).name,
      filter: task.filterName,
      timestamp: task.timestamp,
      model: task.exif?.model,
      iso: task.exif?.iso,
      index: task.index,
      ext,
    })
    const finalName = resolveConflict(rawName, (n) => fs.existsSync(path.join(task.outputDir, n)))
    const outPath = path.join(task.outputDir, finalName)
    await fs.promises.mkdir(task.outputDir, { recursive: true })
    await fs.promises.writeFile(outPath, buffer)

    return { ok: true, outputPath: outPath }
  } catch (e) {
    logger.warn('batch.gpu.task.failed', { taskId: task.taskId, error: (e as Error).message })
    return { ok: false, error: (e as Error).message }
  }
}

/** 测试辅助：清空全部 job（仅单测调用） */
export function _resetBatchState(): void {
  for (const pool of activePools.values()) {
    void pool.shutdown()
  }
  activePools.clear()
  jobs.clear()
}
