/**
 * useWebGLPreview — Editor 画布的 WebGL 预览 hook
 *
 * 行为：
 *   - 接受 `sourceUrl` (data:/grain:// 均可) + 当前 FilterPipeline
 *   - 首次 mount 创建 GLContext + ShaderRegistry + Pipeline
 *   - sourceUrl 变化 → fetch → createImageBitmap → 上传 GPU
 *   - pipeline 变化 → setSteps + run (自动 abort 上一次 run)
 *   - LUT 异步加载：useLutTexture 管理，LUT ready 后自动重渲染
 *   - 返回：{ canvasRef, status, error, lastDurationMs, needsCpuFallback }
 *
 * 降级：
 *   - WebGL 2 不可用（GLContext.ok=false）→ status='unsupported'
 *   - sourceUrl 载入失败 → status='error' + error.message
 *   - context lost → status='lost'，尝试自动重建
 *   - Pass 3b-2 之后：LUT 解析失败（含 SecurityError 级别）会设 needsCpuFallback=true
 *     这样 Editor 会改走 IPC CPU 路径（虽然 CPU 端现在也没实现 LUT，但至少预览不会卡死）
 *
 * Pipeline 顺序（Lightroom 约定）：
 *   WB → Tone → Curves → HSL → ColorGrading → Adjustments → LUT → Halation → Grain → Vignette
 *
 * 为什么 LUT 在 ColorGrading 之后、Halation/Grain/Vignette 之前？
 *   - LUT 属于"最终色彩查表"，通常是创作者调好色之后再套个 look
 *   - 但颗粒/光晕/暗角是物理模拟（胶片感），必须最后叠加
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
  LUT3D_FRAG,
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
  normalizeLut3dParams,
  normalizeToneParams,
  normalizeVignetteParams,
  normalizeWhiteBalanceParams,
  textureFromBitmap,
} from '../engine/webgl'
import type { PipelineStep, Texture } from '../engine/webgl'
import { type HistogramBins, computeHistogramFromCanvas, emptyHistogram } from './histogram'
import { useLutTexture } from './useLutTexture'

export type WebGLPreviewStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'lost' | 'error'

export interface WebGLPreviewResult {
  canvasRef: React.RefObject<HTMLCanvasElement>
  status: WebGLPreviewStatus
  error?: string
  lastDurationMs?: number
  /**
   * 仅当 LUT 加载/解析失败时为 true（极少数情况，例如 .cube 文件被破坏）。
   * 所有 pipeline 通道都已 GPU 化，正常情况下恒为 false。
   */
  needsCpuFallback: boolean
  /** 最近一次渲染后的直方图（256 bins × 4 通道）；未就绪时为 null */
  histogram: HistogramBins | null
}

/** 构造 pipeline step 时需要的 GPU 资源（LUT 纹理等） */
export interface BuildContext {
  resolution: [number, number]
  /** LUT 纹理；null 表示 pipeline 无 LUT 或 LUT 尚未 ready */
  lutTexture: Texture | null
  lutSize: number
}

/**
 * 把 FilterPipeline 翻译成 GPU 步骤。只有 "非恒等" 的通道才会产生 step，
 * 避免浪费一个 ping-pong（一条空调整的 HSL/curves 也不是恒等 fast-path）。
 *
 * LUT 特殊处理：仅当 pipeline.lut 存在且 lutTexture 已 ready 时才产生 LUT step。
 * LUT 还在加载时，其余通道照常渲染，保证 UI 响应性。
 */
export function pipelineToSteps(pipe: FilterPipeline | null, build: BuildContext): PipelineStep[] {
  if (!pipe) return []
  const { resolution, lutTexture, lutSize } = build
  const [w, h] = resolution
  const aspect = w / Math.max(h, 1)
  const steps: PipelineStep[] = []

  // 1. White Balance
  if (pipe.whiteBalance && (pipe.whiteBalance.temp !== 0 || pipe.whiteBalance.tint !== 0)) {
    steps.push({
      id: 'wb',
      frag: WHITE_BALANCE_FRAG,
      uniforms: { ...normalizeWhiteBalanceParams(pipe.whiteBalance) },
    })
  }

  // 2. Tone
  if (pipe.tone) {
    steps.push({
      id: 'tone',
      frag: TONE_FRAG,
      uniforms: { ...normalizeToneParams(pipe.tone) },
    })
  }

  // 3. Curves
  if (pipe.curves && !isCurvesIdentity(pipe.curves)) {
    steps.push({
      id: 'curves',
      frag: CURVES_FRAG,
      uniforms: { ...normalizeCurvesParams(pipe.curves) },
    })
  }

  // 4. HSL
  if (pipe.hsl && !isHslIdentity(pipe.hsl)) {
    steps.push({
      id: 'hsl',
      frag: HSL_FRAG,
      uniforms: { ...normalizeHslParams(pipe.hsl) },
    })
  }

  // 5. Color Grading
  if (pipe.colorGrading && !isColorGradingIdentity(pipe.colorGrading)) {
    steps.push({
      id: 'colorGrading',
      frag: COLOR_GRADING_FRAG,
      uniforms: { ...normalizeColorGradingParams(pipe.colorGrading) },
    })
  }

  // 6. Adjustments
  if (!isAdjustmentsIdentity(pipe)) {
    steps.push({
      id: 'adjustments',
      frag: ADJUSTMENTS_FRAG,
      uniforms: { ...normalizeAdjustmentsParams(pipe, resolution) },
    })
  }

  // 7. LUT 3D（只有当 lutTexture 已加载完成才产生 step）
  if (pipe.lut && lutTexture && lutSize >= 2) {
    steps.push({
      id: 'lut',
      frag: LUT3D_FRAG,
      uniforms: {
        ...normalizeLut3dParams({ lutSize, intensity: pipe.lutIntensity ?? 100 }),
      },
      extraInputs: [{ name: 'u_lut', texture: lutTexture }],
    })
  }

  // 8. Halation
  if (pipe.halation && !isHalationIdentity(pipe.halation)) {
    steps.push({
      id: 'halation',
      frag: HALATION_FRAG,
      uniforms: { ...normalizeHalationParams(pipe.halation, resolution) },
    })
  }

  // 9. Grain
  if (pipe.grain && !isGrainIdentity(pipe.grain)) {
    steps.push({
      id: 'grain',
      frag: GRAIN_FRAG,
      uniforms: { ...normalizeGrainParams(pipe.grain, resolution) },
    })
  }

  // 10. Vignette
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
  const [gl, setGl] = useState<GLContext | null>(null)
  const [histogram, setHistogram] = useState<HistogramBins | null>(null)
  // 直方图节流：滑块高频拖动时跳过中间帧，只对稳定态采样
  const histogramTimerRef = useRef<number | null>(null)

  // 长期持有的 GL 对象（跨 render）
  const pipelineRef = useRef<Pipeline | null>(null)
  const sourceTexRef = useRef<Texture | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // 始终保存最新 pipeline，避免 renderNow 捕获过时闭包
  const latestPipelineRef = useRef<FilterPipeline | null>(pipeline)
  useEffect(() => {
    latestPipelineRef.current = pipeline
  }, [pipeline])

  // LUT 纹理加载（异步）
  const lut = useLutTexture(gl, pipeline?.lut ?? null)

  // CPU 兜底：只有 LUT 解析失败时才触发（几乎不发生）
  const needsCpuFallback = useMemo(() => {
    if (pipeline?.lut && lut.status === 'error') return true
    return false
  }, [pipeline?.lut, lut.status])

  const renderNow = useCallback(async () => {
    const source = sourceTexRef.current
    const pipe = pipelineRef.current
    if (!source || !pipe || !gl) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const resolution: [number, number] = [source.width, source.height]
    pipe.setSteps(
      pipelineToSteps(latestPipelineRef.current, {
        resolution,
        lutTexture: lut.texture,
        lutSize: lut.size,
      }),
    )
    try {
      const stats = await pipe.run({ source, signal: ctrl.signal })
      if (stats.aborted) return
      setLastDurationMs(stats.durationMs)
      setStatus('ready')
      // 渲染后节流采样直方图：大分辨率 canvas 的 readPixels 可达 5-15ms，
      // 拖动滑块高频触发时会堆积。保留 120ms debounce，稳定态才真正 readPixels。
      // preserveDrawingBuffer=true 保证跨帧仍可读 drawing buffer
      const canvas = canvasRef.current
      if (canvas) {
        if (histogramTimerRef.current !== null) {
          window.clearTimeout(histogramTimerRef.current)
        }
        histogramTimerRef.current = window.setTimeout(() => {
          histogramTimerRef.current = null
          try {
            setHistogram(computeHistogramFromCanvas(canvas))
          } catch {
            setHistogram(emptyHistogram())
          }
        }, 120)
      }
    } catch (e) {
      setStatus('error')
      setError((e as Error).message)
    }
  }, [gl, lut.texture, lut.size])

  // 初始化 GLContext —— 仅在 mount 时一次
  useEffect(() => {
    if (!canvasRef.current) return
    const ctx = new GLContext(canvasRef.current, { preserveDrawingBuffer: true })
    if (!ctx.ok) {
      setStatus('unsupported')
      return
    }
    const registry = new ShaderRegistry(ctx)
    const pipelineObj = new Pipeline(ctx, registry, DEFAULT_VERT)

    pipelineRef.current = pipelineObj
    setGl(ctx)

    const offLost = ctx.onLost(() => setStatus('lost'))
    const offRestored = ctx.onRestored(() => setStatus('idle'))

    return () => {
      offLost()
      offRestored()
      abortRef.current?.abort()
      if (histogramTimerRef.current !== null) {
        window.clearTimeout(histogramTimerRef.current)
        histogramTimerRef.current = null
      }
      sourceTexRef.current?.dispose()
      pipelineObj.dispose()
      registry.dispose()
      ctx.dispose()
      pipelineRef.current = null
      sourceTexRef.current = null
      setGl(null)
    }
  }, [])

  // 加载 sourceUrl → ImageBitmap → GPU texture
  useEffect(() => {
    if (!sourceUrl || !gl || !gl.ok || !pipelineRef.current) return

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
        sourceTexRef.current = textureFromBitmap(gl, bitmap, {
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
  }, [sourceUrl, gl, renderNow])

  // pipeline 或 LUT 纹理变化 → 重渲染
  // biome-ignore lint/correctness/useExhaustiveDependencies: pipeline/lut.texture are intentional triggers, values consumed via refs + renderNow closure
  useEffect(() => {
    if (!gl || !sourceTexRef.current || !pipelineRef.current) return
    renderNow()
  }, [pipeline, lut.texture, renderNow])

  return { canvasRef, status, error, lastDurationMs, needsCpuFallback, histogram }
}
