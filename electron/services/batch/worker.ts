/**
 * batch worker —— worker_threads 端入口
 *
 * 协议：
 * - main → worker: { type: 'process', task: BatchTask }
 * - main → worker: { type: 'shutdown' }
 * - worker → main: { type: 'result', taskId, ok, outputPath? | error? }
 * - worker → main: { type: 'progress', taskId, progress: 0..100 }
 * - worker → main: { type: 'ready' }（worker 启动时发一次）
 *
 * Worker 是无状态的：每个 task 独立处理，不保留上下文，便于 pool 动态调度。
 *
 * 注意：本文件在 worker_threads 运行，不得 import Electron API；
 * sharp / exiftool-vendored 等 CJS 模块走 node:module 的 createRequire 动态 import。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import type { BatchJobConfig, FilterPipeline } from '../../../shared/types.js'
import { renderNamingTemplate, resolveConflict } from './namingTemplate.js'
import { applyPipeline } from './pipelineSharp.js'

export interface BatchTask {
  taskId: string
  photoPath: string
  photoName: string
  outputDir: string
  pipeline: FilterPipeline | null
  filterName: string
  config: BatchJobConfig
  timestamp: number
  index: number
  /** 可选：EXIF model / iso，由 main 预读 */
  exif?: { model?: string; iso?: number }
  /** 可选：RAW 预览 buffer & sourceOrientation（由 main 调 resolvePreviewBuffer 后传入） */
  previewBuffer?: Buffer
  sourceOrientation?: number
}

export type WorkerMessage =
  | { type: 'ready' }
  | { type: 'result'; taskId: string; ok: true; outputPath: string; durationMs: number }
  | { type: 'result'; taskId: string; ok: false; error: string }
  | { type: 'progress'; taskId: string; progress: number }

export type MainMessage = { type: 'process'; task: BatchTask } | { type: 'shutdown' }

/**
 * 处理单个 task
 * @returns 输出文件的绝对路径
 */
export async function processTask(task: BatchTask): Promise<string> {
  const start = Date.now()

  // 1) 读入（或复用 main 传入的 previewBuffer）
  const input = task.previewBuffer ?? (await fs.promises.readFile(task.photoPath))

  // 2) 跑 pipeline
  const { buffer } = await applyPipeline({
    input,
    pipeline: task.pipeline,
    format: task.config.format,
    quality: task.config.quality,
    keepExif: task.config.keepExif,
    resize: task.config.resize,
    sourceOrientation: task.sourceOrientation,
  })

  // 3) 文件名模板
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

  // 4) 冲突解决
  const finalName = resolveConflict(rawName, (n) => fs.existsSync(path.join(task.outputDir, n)))
  const outPath = path.join(task.outputDir, finalName)

  // 5) 写盘
  await fs.promises.mkdir(task.outputDir, { recursive: true })
  await fs.promises.writeFile(outPath, buffer)

  void start
  return outPath
}

// ========== Worker 主循环 ==========
// workerData 留作将来扩展（如传入 logger 配置）
void workerData

if (parentPort) {
  parentPort.on('message', async (msg: MainMessage) => {
    if (msg.type === 'shutdown') {
      process.exit(0)
    }
    if (msg.type !== 'process') return

    const task = msg.task
    const tStart = Date.now()
    try {
      const outputPath = await processTask(task)
      const out: WorkerMessage = {
        type: 'result',
        taskId: task.taskId,
        ok: true,
        outputPath,
        durationMs: Date.now() - tStart,
      }
      parentPort?.postMessage(out)
    } catch (e) {
      const out: WorkerMessage = {
        type: 'result',
        taskId: task.taskId,
        ok: false,
        error: (e as Error).message,
      }
      parentPort?.postMessage(out)
    }
  })

  parentPort.postMessage({ type: 'ready' } satisfies WorkerMessage)
}
