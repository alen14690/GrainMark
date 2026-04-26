/**
 * useWebGLPreview — Editor 画布的 WebGL 预览 hook
 *
 * 行为：
 *   - 接受 `sourceUrl` (data:/grain:// 均可) + 当前 FilterPipeline
 *   - 首次 mount 创建 GLContext + ShaderRegistry + Pipeline
 *   - sourceUrl 变化 → fetch → createImageBitmap → 上传 GPU
 *   - pipeline 变化 → setSteps + run (自动 abort 上一次 run)
 *   - LUT 异步加载：useLutTexture 管理，LUT ready 后自动重渲染
 *   - 返回：{ canvasRef, status, error, lastDurationMs, needsCpuFallback, histogram, perf }
 *
 * 性能关键设计（P0 优化后）：
 *   - **preserveDrawingBuffer=false**：浏览器合成器可直接用 swap chain，省每帧 2-5ms blit
 *   - **直方图同 tick 读**：pipe.run 完成后立刻 readPixels 到预分配 buffer，无 setTimeout
 *   - **Uint8Array 复用**：按最大 drawing buffer 尺寸预分配，避免每帧 6-8MB GC pressure
 *   - **跳帧采样**：高频拖动时直方图每 3 帧采一次（而非 120ms debounce 的"等静止"）
 *   - **perf 分段打点**：setSteps / pipeline.run / readPixels / computeHist 各自计时供 UI 显示
 *
 * 降级：
 *   - WebGL 2 不可用（GLContext.ok=false）→ status='unsupported'
 *   - sourceUrl 载入失败 → status='error' + error.message
 *   - context lost → status='lost'，尝试自动重建
 *   - LUT 解析失败（含 SecurityError）会设 needsCpuFallback=true
 *
 * Pipeline 顺序（Lightroom 约定）：
 *   WB → Tone → Curves → HSL → ColorGrading → Adjustments → LUT → Halation → Grain → Vignette
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
import {
  type HistogramBins,
  computeHistogramFromRgba,
  emptyHistogram,
  readDrawingBufferToBuffer,
} from './histogram'
import { useLutTexture } from './useLutTexture'

export type WebGLPreviewStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'lost' | 'error'

/** P0-1 新增：每帧分段耗时（Editor dev 面板显示 Frame budget） */
export interface FramePerf {
  /** pipelineToSteps + Pipeline.setSteps */
  setStepsMs: number
  /** Pipeline.run（含所有 pass 的 GL 调用） */
  pipelineRunMs: number
  /** readPixels（GPU→CPU 同步点；跳帧跳过时为 0） */
  readPixelsMs: number
  /** computeHistogramFromRgba（CPU bin 累加） */
  histogramMs: number
  /** 整个 renderNow 的 wall-clock */
  totalMs: number
}

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
  /** P0-1 新增：最近一次 renderNow 的分段耗时；未渲染时 null */
  perf: FramePerf | null
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

/**
 * 仅生成 pipeline 的**结构签名**（哪些通道开、顺序、LUT 是否就绪）。
 *
 * P0-2：滑块拖动时 99% 的变化只是 uniform 数值，结构签名不变。Editor 在
 * pipeline-change useEffect 里用这个签名决定走 setSteps 还是 updateUniforms 快路径。
 *
 * 签名设计：只用"是否开启该通道"的布尔 + LUT 尺寸。与 pipelineToSteps 的
 * identity 判断保持一致，避免两边漂移。
 */
export function pipelineStructuralKey(
  pipe: FilterPipeline | null,
  lutReady: boolean,
  lutSize: number,
): string {
  if (!pipe) return '∅'
  const bits: string[] = []
  if (pipe.whiteBalance && (pipe.whiteBalance.temp !== 0 || pipe.whiteBalance.tint !== 0)) bits.push('wb')
  if (pipe.tone) bits.push('tone')
  if (pipe.curves && !isCurvesIdentity(pipe.curves)) bits.push('curves')
  if (pipe.hsl && !isHslIdentity(pipe.hsl)) bits.push('hsl')
  if (pipe.colorGrading && !isColorGradingIdentity(pipe.colorGrading)) bits.push('colorGrading')
  if (!isAdjustmentsIdentity(pipe)) bits.push('adj')
  if (pipe.lut && lutReady && lutSize >= 2) bits.push(`lut${lutSize}`)
  if (pipe.halation && !isHalationIdentity(pipe.halation)) bits.push('halation')
  if (pipe.grain && !isGrainIdentity(pipe.grain)) bits.push('grain')
  if (pipe.vignette) bits.push('vignette')
  return bits.join('|')
}

/**
 * 直方图跳帧采样策略：高频拖动时每 HISTOGRAM_SAMPLE_EVERY 帧采一次；
 * 松手后静止态自然会走一次额外渲染（pipeline 引用稳定），那次强制采一次。
 *
 * 3 帧 @ 60fps ≈ 50ms 间隔，比旧的 120ms debounce 更跟手。
 */
const HISTOGRAM_SAMPLE_EVERY = 3

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
  const [perf, setPerf] = useState<FramePerf | null>(null)

  // 长期持有的 GL 对象（跨 render）
  const pipelineRef = useRef<Pipeline | null>(null)
  const sourceTexRef = useRef<Texture | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // 始终保存最新 pipeline，避免 renderNow 捕获过时闭包
  const latestPipelineRef = useRef<FilterPipeline | null>(pipeline)
  useEffect(() => {
    latestPipelineRef.current = pipeline
  }, [pipeline])

  // P0-5：预分配的 readPixels 缓冲；按已见过的最大 drawing buffer 尺寸扩容
  const histogramBufferRef = useRef<Uint8Array | null>(null)
  // 跳帧计数：每 HISTOGRAM_SAMPLE_EVERY 帧采一次直方图
  const histogramFrameCounterRef = useRef<number>(0)

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

    const tStart = performance.now()

    // 1) setSteps
    const resolution: [number, number] = [source.width, source.height]
    pipe.setSteps(
      pipelineToSteps(latestPipelineRef.current, {
        resolution,
        lutTexture: lut.texture,
        lutSize: lut.size,
      }),
    )
    const tAfterSetSteps = performance.now()

    try {
      // 2) pipeline.run（所有 GL 调用同步派发，await 等 microtask）
      const stats = await pipe.run({ source, signal: ctrl.signal })
      if (stats.aborted) return
      const tAfterRun = performance.now()

      setLastDurationMs(stats.durationMs)
      setStatus('ready')

      // 3) 直方图：同 tick readPixels + 复用 buffer + 跳帧
      //    P0-1：preserveDrawingBuffer=false，但 draw 和 readPixels 都在同一个
      //    event-loop tick 内（无 setTimeout 介入），drawing buffer 还活着
      //    P0-5：Uint8Array 按"已见过的最大尺寸"预分配复用，避免每帧 6-8MB alloc
      let readPixelsMs = 0
      let histogramMs = 0
      const rawGl = gl.gl
      const shouldSample = rawGl !== null && histogramFrameCounterRef.current++ % HISTOGRAM_SAMPLE_EVERY === 0
      if (shouldSample && rawGl) {
        const w = rawGl.drawingBufferWidth
        const h = rawGl.drawingBufferHeight
        const need = w * h * 4
        if (need > 0) {
          let buf = histogramBufferRef.current
          if (!buf || buf.length < need) {
            // 扩容到当前需求（不再缩小，避免频繁重分配）
            buf = new Uint8Array(need)
            histogramBufferRef.current = buf
          }
          const tReadStart = performance.now()
          const read = readDrawingBufferToBuffer(rawGl, buf)
          readPixelsMs = performance.now() - tReadStart
          if (read > 0) {
            const TARGET_SAMPLES = 65536
            const stride = Math.max(1, Math.round(read / TARGET_SAMPLES))
            const tHistStart = performance.now()
            const hist = computeHistogramFromRgba(buf, stride, read)
            histogramMs = performance.now() - tHistStart
            setHistogram(hist)
          } else {
            setHistogram(emptyHistogram())
          }
        }
      }

      const tEnd = performance.now()
      setPerf({
        setStepsMs: tAfterSetSteps - tStart,
        pipelineRunMs: tAfterRun - tAfterSetSteps,
        readPixelsMs,
        histogramMs,
        totalMs: tEnd - tStart,
      })
    } catch (e) {
      setStatus('error')
      setError((e as Error).message)
    }
  }, [gl, lut.texture, lut.size])

  // 初始化 GLContext —— 仅在 mount 时一次
  useEffect(() => {
    if (!canvasRef.current) return
    // P0-1：preserveDrawingBuffer=false —— 让合成器走 swap chain 快路径，
    //       省每帧 2-5ms blit。readPixels 改为在 draw 后同 tick 读，不需要保留
    const ctx = new GLContext(canvasRef.current, { preserveDrawingBuffer: false })
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
      sourceTexRef.current?.dispose()
      pipelineObj.dispose()
      registry.dispose()
      ctx.dispose()
      pipelineRef.current = null
      sourceTexRef.current = null
      histogramBufferRef.current = null
      histogramFrameCounterRef.current = 0
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

        // 换图必然重采一次直方图（重置计数器让第一帧强制采样）
        histogramFrameCounterRef.current = 0
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

  // pipeline 或 LUT 纹理变化 → 重渲染（用 rAF 合并同帧多次触发，比如连续
  // set 多个分组 reset 时只跑一次 renderNow）
  const renderRafRef = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (renderRafRef.current !== null) {
        cancelAnimationFrame(renderRafRef.current)
        renderRafRef.current = null
      }
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: pipeline/lut.texture are intentional triggers, values consumed via refs + renderNow closure
  useEffect(() => {
    if (!gl || !sourceTexRef.current || !pipelineRef.current) return
    // rAF 合并：同一帧内 pipeline 多次变化只调 renderNow 一次
    if (renderRafRef.current !== null) return
    renderRafRef.current = requestAnimationFrame(() => {
      renderRafRef.current = null
      renderNow()
    })
  }, [pipeline, lut.texture, renderNow])

  return { canvasRef, status, error, lastDurationMs, needsCpuFallback, histogram, perf }
}
