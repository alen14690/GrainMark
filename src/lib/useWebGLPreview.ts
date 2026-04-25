/**
 * useWebGLPreview — Editor 画布的 WebGL 预览 hook
 *
 * 行为：
 *   - 接受 `sourceUrl` (data:/grain:// 均可) + 当前 FilterPipeline
 *   - 首次 mount 创建 GLContext + ShaderRegistry + Pipeline
 *   - sourceUrl 变化 → fetch → createImageBitmap → 上传 GPU
 *   - pipeline 变化 → setSteps + run (自动 abort 上一次 run)
 *   - 返回：{ canvasRef, status, stats, error }
 *
 * 降级：
 *   - WebGL 2 不可用（GLContext.ok=false）→ status='unsupported'，调用方显示 Sharp 兜底
 *   - sourceUrl 载入失败 → status='error' + error.message
 *   - context lost → status='lost'，尝试自动重建
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FilterPipeline } from '../../shared/types'
import {
  DEFAULT_VERT,
  GLContext,
  Pipeline,
  ShaderRegistry,
  TONE_FRAG,
  VIGNETTE_FRAG,
  normalizeToneParams,
  normalizeVignetteParams,
  textureFromBitmap,
} from '../engine/webgl'
import type { PipelineStep, Texture } from '../engine/webgl'

export type WebGLPreviewStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'lost' | 'error'

export interface WebGLPreviewResult {
  canvasRef: React.RefObject<HTMLCanvasElement>
  status: WebGLPreviewStatus
  error?: string
  lastDurationMs?: number
}

/** 把 FilterPipeline 翻译成 Pass 3a 范围内支持的步骤（tone + vignette） */
function pipelineToSteps(pipe: FilterPipeline | null, aspect: number): PipelineStep[] {
  if (!pipe) return []
  const steps: PipelineStep[] = []
  if (pipe.tone) {
    steps.push({
      id: 'tone',
      frag: TONE_FRAG,
      uniforms: { ...normalizeToneParams(pipe.tone) },
    })
  }
  if (pipe.vignette) {
    steps.push({
      id: 'vignette',
      frag: VIGNETTE_FRAG,
      uniforms: { ...normalizeVignetteParams(pipe.vignette, aspect) },
    })
  }
  return steps
}

export function useWebGLPreview(
  sourceUrl: string | null,
  pipeline: FilterPipeline | null,
): WebGLPreviewResult {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<WebGLPreviewStatus>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [lastDurationMs, setLastDurationMs] = useState<number | undefined>(undefined)

  // 长期持有的 GL 对象（跨 render）
  const glRef = useRef<GLContext | null>(null)
  const registryRef = useRef<ShaderRegistry | null>(null)
  const pipelineRef = useRef<Pipeline | null>(null)
  const sourceTexRef = useRef<Texture | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // 始终保存最新 pipeline，避免 renderNow 捕获过时闭包
  const latestPipelineRef = useRef<FilterPipeline | null>(pipeline)
  useEffect(() => {
    latestPipelineRef.current = pipeline
  }, [pipeline])

  const renderNow = useCallback(async () => {
    const source = sourceTexRef.current
    const pipe = pipelineRef.current
    const gl = glRef.current
    if (!source || !pipe || !gl) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const aspect = source.width / Math.max(source.height, 1)
    pipe.setSteps(pipelineToSteps(latestPipelineRef.current, aspect))
    try {
      const stats = await pipe.run({ source, signal: ctrl.signal })
      if (stats.aborted) return
      setLastDurationMs(stats.durationMs)
      setStatus('ready')
    } catch (e) {
      setStatus('error')
      setError((e as Error).message)
    }
  }, [])

  // 初始化 GLContext —— 仅在 mount 时一次
  useEffect(() => {
    if (!canvasRef.current) return
    const ctx = new GLContext(canvasRef.current, { preserveDrawingBuffer: false })
    if (!ctx.ok) {
      setStatus('unsupported')
      return
    }
    const registry = new ShaderRegistry(ctx)
    const pipelineObj = new Pipeline(ctx, registry, DEFAULT_VERT)

    glRef.current = ctx
    registryRef.current = registry
    pipelineRef.current = pipelineObj

    const offLost = ctx.onLost(() => setStatus('lost'))
    const offRestored = ctx.onRestored(() => setStatus('idle'))

    return () => {
      offLost()
      offRestored()
      abortRef.current?.abort()
      sourceTexRef.current?.dispose()
      pipelineObj.dispose()
      registry.dispose()
      ctx.dispose()
      glRef.current = null
      registryRef.current = null
      pipelineRef.current = null
      sourceTexRef.current = null
    }
  }, [])

  // 加载 sourceUrl → ImageBitmap → GPU texture
  useEffect(() => {
    if (!sourceUrl || !glRef.current || !pipelineRef.current) return
    if (!glRef.current.ok) return

    let cancelled = false
    setStatus('loading')
    setError(undefined)
    ;(async () => {
      try {
        const res = await fetch(sourceUrl)
        if (!res.ok) throw new Error(`fetch ${sourceUrl}: ${res.status}`)
        const blob = await res.blob()
        const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
        if (cancelled) {
          bitmap.close()
          return
        }

        const canvas = canvasRef.current!
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width
          canvas.height = bitmap.height
        }

        sourceTexRef.current?.dispose()
        sourceTexRef.current = textureFromBitmap(glRef.current!, bitmap, {
          flipY: true,
          renderable: false,
        })
        bitmap.close()

        await renderNow()
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setError((e as Error).message)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sourceUrl, renderNow])

  // pipeline 变化 → 重渲染（pipeline 是触发信号，实际值由 latestPipelineRef 同步给 renderNow）
  // biome-ignore lint/correctness/useExhaustiveDependencies: pipeline here is intentional trigger
  useEffect(() => {
    if (!glRef.current || !sourceTexRef.current || !pipelineRef.current) return
    renderNow()
  }, [pipeline, renderNow])

  return { canvasRef, status, error, lastDurationMs }
}
