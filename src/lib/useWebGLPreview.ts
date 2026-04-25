/**
 * useWebGLPreview — Editor 画布的 WebGL 预览 hook
 *
 * 行为：
 *   - 接受 `sourceUrl` (data:/grain:// 均可) + 当前 FilterPipeline
 *   - 首次 mount 创建 GLContext + ShaderRegistry + Pipeline
 *   - sourceUrl 变化 → fetch → createImageBitmap → 上传 GPU
 *   - pipeline 变化 → setSteps + run (自动 abort 上一次 run)
 *   - 返回：{ canvasRef, status, stats, error, needsCpuFallback }
 *
 * 降级：
 *   - WebGL 2 不可用（GLContext.ok=false）→ status='unsupported'
 *   - sourceUrl 载入失败 → status='error' + error.message
 *   - context lost → status='lost'，尝试自动重建
 *   - Pipeline 含 WebGL 未实现通道（Pass 3b-1 后仅剩 LUT）→ needsCpuFallback=true
 *
 * Pipeline 顺序（Lightroom 约定 + 摄影工作流直觉）：
 *   WhiteBalance → Tone → Curves → HSL → ColorGrading → Adjustments(clarity/sat/vib)
 *   → Halation → Grain → Vignette
 *
 * 注：Halation/Grain 放在最后颜色处理之后、Vignette 前；Vignette 永远是最后一步
 * （否则颗粒/溢光被暗角遮住就看不见了）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FilterPipeline } from '../../shared/types'
import {
  ADJUSTMENTS_FRAG,
  COLOR_GRADING_FRAG,
  CURVES_FRAG,
  DEFAULT_VERT,
  GLContext,
  GRAIN_FRAG,
  HALATION_FRAG,
  HSL_FRAG,
  Pipeline,
  ShaderRegistry,
  TONE_FRAG,
  VIGNETTE_FRAG,
  WHITE_BALANCE_FRAG,
  isAdjustmentsIdentity,
  isColorGradingIdentity,
  isCurvesIdentity,
  isGrainIdentity,
  isHalationIdentity,
  isHslIdentity,
  normalizeAdjustmentsParams,
  normalizeColorGradingParams,
  normalizeCurvesParams,
  normalizeGrainParams,
  normalizeHalationParams,
  normalizeHslParams,
  normalizeToneParams,
  normalizeVignetteParams,
  normalizeWhiteBalanceParams,
  textureFromBitmap,
} from '../engine/webgl'
import type { PipelineStep, Texture } from '../engine/webgl'

export type WebGLPreviewStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'lost' | 'error'

export interface WebGLPreviewResult {
  canvasRef: React.RefObject<HTMLCanvasElement>
  status: WebGLPreviewStatus
  error?: string
  lastDurationMs?: number
  /**
   * Pipeline 中含 GPU 未实现的通道。Pass 3b-1 后只剩 LUT 需要 CPU 兜底。
   * Editor 接到此信号应调用带 filterId 的 IPC preview:render。
   */
  needsCpuFallback: boolean
}

/** GPU 未实现的通道（Pass 3b-1 之后仅 LUT） */
function hasGpuUnsupportedChannels(pipe: FilterPipeline | null): boolean {
  if (!pipe) return false
  if (pipe.lut) return true
  return false
}

/**
 * 把 FilterPipeline 翻译成 GPU 步骤。只有 "非恒等" 的通道才会产生 step，
 * 避免浪费一个 ping-pong（一条空调整的 HSL/curves 也不是恒等 fast-path）。
 */
export function pipelineToSteps(pipe: FilterPipeline | null, resolution: [number, number]): PipelineStep[] {
  if (!pipe) return []
  const [w, h] = resolution
  const aspect = w / Math.max(h, 1)
  const steps: PipelineStep[] = []

  // 1. White Balance（最先应用，影响后续所有色彩）
  if (pipe.whiteBalance && (pipe.whiteBalance.temp !== 0 || pipe.whiteBalance.tint !== 0)) {
    steps.push({
      id: 'wb',
      frag: WHITE_BALANCE_FRAG,
      uniforms: { ...normalizeWhiteBalanceParams(pipe.whiteBalance) },
    })
  }

  // 2. Tone（曝光/对比/高光/阴影/白黑点）
  if (pipe.tone) {
    steps.push({
      id: 'tone',
      frag: TONE_FRAG,
      uniforms: { ...normalizeToneParams(pipe.tone) },
    })
  }

  // 3. Curves（RGB + R/G/B）
  if (pipe.curves && !isCurvesIdentity(pipe.curves)) {
    steps.push({
      id: 'curves',
      frag: CURVES_FRAG,
      uniforms: { ...normalizeCurvesParams(pipe.curves) },
    })
  }

  // 4. HSL（8 通道）
  if (pipe.hsl && !isHslIdentity(pipe.hsl)) {
    steps.push({
      id: 'hsl',
      frag: HSL_FRAG,
      uniforms: { ...normalizeHslParams(pipe.hsl) },
    })
  }

  // 5. Color Grading（三向色轮）
  if (pipe.colorGrading && !isColorGradingIdentity(pipe.colorGrading)) {
    steps.push({
      id: 'colorGrading',
      frag: COLOR_GRADING_FRAG,
      uniforms: { ...normalizeColorGradingParams(pipe.colorGrading) },
    })
  }

  // 6. Adjustments（clarity + saturation + vibrance 合并为一个 pass）
  if (!isAdjustmentsIdentity(pipe)) {
    steps.push({
      id: 'adjustments',
      frag: ADJUSTMENTS_FRAG,
      uniforms: { ...normalizeAdjustmentsParams(pipe, resolution) },
    })
  }

  // 7. Halation（高光溢光，颜色处理的最后一步）
  if (pipe.halation && !isHalationIdentity(pipe.halation)) {
    steps.push({
      id: 'halation',
      frag: HALATION_FRAG,
      uniforms: { ...normalizeHalationParams(pipe.halation, resolution) },
    })
  }

  // 8. Grain（胶片颗粒）
  if (pipe.grain && !isGrainIdentity(pipe.grain)) {
    steps.push({
      id: 'grain',
      frag: GRAIN_FRAG,
      uniforms: { ...normalizeGrainParams(pipe.grain, resolution) },
    })
  }

  // 9. Vignette（必须最后，否则会被后续操作覆盖）
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
  const pipelineRef = useRef<Pipeline | null>(null)
  const sourceTexRef = useRef<Texture | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // 始终保存最新 pipeline，避免 renderNow 捕获过时闭包
  const latestPipelineRef = useRef<FilterPipeline | null>(pipeline)
  useEffect(() => {
    latestPipelineRef.current = pipeline
  }, [pipeline])

  const needsCpuFallback = useMemo(() => hasGpuUnsupportedChannels(pipeline), [pipeline])

  const renderNow = useCallback(async () => {
    const source = sourceTexRef.current
    const pipe = pipelineRef.current
    const gl = glRef.current
    if (!source || !pipe || !gl) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const resolution: [number, number] = [source.width, source.height]
    pipe.setSteps(pipelineToSteps(latestPipelineRef.current, resolution))
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

  return { canvasRef, status, error, lastDurationMs, needsCpuFallback }
}
