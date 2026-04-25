/**
 * Batch GPU Worker Page
 *
 * 在隐藏 BrowserWindow 中运行，专门为 M3-b 批处理的 GPU 路径服务。
 *
 * 生命周期：
 * - 主进程 createBrowserWindow({ show: false, preload }) → loadFile('batch-gpu.html')
 * - 本页加载后调用 invoke('batch:gpu:ready') 通知主进程
 * - 主进程通过 webContents.send('batch:gpu:task', task) 推单张任务
 * - 本页完成渲染后通过 invoke('batch:gpu:done', result) 回传 Uint8Array（RGBA）
 *
 * 不用 React：启动更快、内存更省、无路由、无 DOM 树负担
 */

import type { FilterPipeline } from '../shared/types'
import { DEFAULT_VERT, GLContext, Pipeline, ShaderRegistry, textureFromBitmap } from './engine/webgl'
import { pipelineToSteps } from './lib/useWebGLPreview'

const statusEl = document.getElementById('status') as HTMLDivElement | null
function setStatus(s: string) {
  if (statusEl) statusEl.textContent = s
}

interface GpuTask {
  taskId: string
  pipeline: FilterPipeline | null
  sourceUrl: string
  /** 需返回的最大长边；0 表示原尺寸 */
  maxDim: number
}

interface GpuTaskResult {
  taskId: string
  ok: true
  width: number
  height: number
  /** Uint8Array RGBA；通过 structuredClone 走 IPC */
  pixels: Uint8Array
}
interface GpuTaskError {
  taskId: string
  ok: false
  error: string
}

async function renderOne(
  ctx: GLContext,
  registry: ShaderRegistry,
  task: GpuTask,
): Promise<GpuTaskResult | GpuTaskError> {
  try {
    // 1) 加载图像
    const resp = await fetch(task.sourceUrl)
    const blob = await resp.blob()
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })

    // 2) 决定输出尺寸
    let outW = bitmap.width
    let outH = bitmap.height
    if (task.maxDim > 0) {
      const scale = Math.min(1, task.maxDim / Math.max(outW, outH))
      outW = Math.max(1, Math.round(outW * scale))
      outH = Math.max(1, Math.round(outH * scale))
    }
    const canvas = ctx.canvas
    canvas.width = outW
    canvas.height = outH

    // 3) 上传源纹理
    const sourceTex = textureFromBitmap(ctx, bitmap, { flipY: true })

    // 4) 构建 pipeline steps（A-1：暂不支持 LUT，lutTexture=null 让 pipelineToSteps 跳过 LUT step）
    const steps = pipelineToSteps(task.pipeline, {
      resolution: [outW, outH],
      lutTexture: null,
      lutSize: 0,
    })

    // 5) 运行 pipeline（即使 steps=[] 也会 passthrough blit 到 canvas）
    const pipe = new Pipeline(ctx, registry, DEFAULT_VERT)
    pipe.setSteps(steps)
    await pipe.run({ source: sourceTex })

    // 6) readPixels
    const gl = ctx.gl
    if (!gl) {
      return { taskId: task.taskId, ok: false, error: 'GL context lost during render' }
    }
    const pixels = new Uint8Array(outW * outH * 4)
    gl.readPixels(0, 0, outW, outH, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    pipe.dispose()
    sourceTex.dispose()

    return { taskId: task.taskId, ok: true, width: outW, height: outH, pixels }
  } catch (e) {
    return { taskId: task.taskId, ok: false, error: (e as Error).message }
  }
}

// ========== IPC bridge ==========
type GrainApi = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, listener: (...args: unknown[]) => void) => () => void
}
const grain = (window as unknown as { grain?: GrainApi }).grain

async function main() {
  if (!grain) {
    setStatus('ERROR: window.grain 不可用（preload 未注入）')
    return
  }

  const canvas = document.getElementById('gl-canvas') as HTMLCanvasElement | null
  if (!canvas) {
    setStatus('ERROR: canvas not found')
    return
  }
  const ctx = new GLContext(canvas, { preserveDrawingBuffer: true })
  if (!ctx.ok) {
    setStatus('ERROR: WebGL 2 unsupported')
    await grain.invoke('batch:gpu:bootstrap-failed', 'webgl2-unsupported')
    return
  }
  const registry = new ShaderRegistry(ctx)

  setStatus('ready')
  await grain.invoke('batch:gpu:ready')

  grain.on('batch:gpu:task', async (...args: unknown[]) => {
    const task = args[0] as GpuTask
    setStatus(`rendering ${task.taskId}`)
    const result = await renderOne(ctx, registry, task)
    setStatus(result.ok ? `done ${task.taskId}` : `failed ${task.taskId}: ${result.error}`)
    await grain.invoke('batch:gpu:done', result)
  })
}

void main()
