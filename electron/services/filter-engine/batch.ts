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
import * as path from 'node:path'
import { Worker } from 'node:worker_threads'
import { BrowserWindow, app } from 'electron'
import { nanoid } from 'nanoid'
import type { BatchJob, BatchJobConfig, BatchJobItem, FilterPipeline } from '../../../shared/types.js'
import type { BatchTask, MainMessage, WorkerMessage } from '../batch/worker.js'
import { readExif } from '../exif/reader.js'
import { resolvePreviewBuffer } from '../raw/index.js'
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

/** Worker 路径：dev 与 production 不同 */
function getWorkerPath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    return path.join(app.getAppPath(), 'dist-electron', 'batch-worker.js')
  }
  return path.join(app.getAppPath(), 'dist-electron', 'batch-worker.js')
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
  const filter = config.filterId ? getFilter(config.filterId) : null
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

      // pool.run 本身有 concurrency 上限，这里不等它返回就继续派发（让 pool 内部排队）
      void pool.run(task).then((r) => {
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

/** 测试辅助：清空全部 job（仅单测调用） */
export function _resetBatchState(): void {
  for (const pool of activePools.values()) {
    void pool.shutdown()
  }
  activePools.clear()
  jobs.clear()
}
