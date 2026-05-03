/**
 * useWebGLPreview — Editor 画布的 WebGL 预览 hook（GPU-only 架构）
 *
 * 行为：
 *   - 接受 `sourceUrl` (data:/grain:// 均可) + 当前 FilterPipeline
 *   - 首次 mount 创建 GLContext + ShaderRegistry + Pipeline
 *   - sourceUrl 变化 → fetch → createImageBitmap → 上传 GPU
 *   - pipeline 变化 → setSteps + run (自动 abort 上一次 run)
 *   - LUT 异步加载：useLutTexture 管理，LUT ready 后自动重渲染
 *   - 返回：{ canvasRef, status, error }
 *
 * 性能关键设计（P0 优化后）：
 *   - **preserveDrawingBuffer=false**：浏览器合成器可直接用 swap chain，省每帧 2-5ms blit
 *   - **直方图同 tick 读**：pipe.run 完成后立刻 readPixels 到预分配 buffer，无 setTimeout
 *   - **Uint8Array 复用**：按最大 drawing buffer 尺寸预分配，避免每帧 6-8MB GC pressure
 *   - **跳帧采样**：高频拖动时直方图每 3 帧采一次（而非 120ms debounce 的"等静止"）
 *   - **perf / histogram 写到外部 perfStore**：Editor 主体不订阅 → 拖滑块时零 re-render
 *
 * GPU-only 降级策略（2026-04-26 架构决策）：
 *   - WebGL 2 不可用（GLContext.ok=false）→ status='unsupported'，Editor 显示不兼容提示
 *   - sourceUrl 载入失败 → status='error' + error.message
 *   - context lost → status='lost'，监听 restored 自动重建 program/texture
 *   - LUT .cube 解析失败 → pipelineToSteps 自动 skip LUT step（其它通道继续渲染）
 *
 * 原 CPU 兜底路径已删除：GPU 坏了就修 GPU，不用更慢的路径掩盖问题。
 *
 * Pipeline 顺序（Lightroom 约定）：
 *   WB → Tone → Curves → HSL → ColorGrading → Adjustments → LUT → Halation → Grain → Vignette
 */
import { useCallback, useEffect, useRef, useState } from 'react'
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
import { writeHistogram, writePerf } from '../stores/perfStore'
import { computeHistogramFromRgba, emptyHistogram, readDrawingBufferToBuffer } from './histogram'
import { useLutTexture } from './useLutTexture'

export type WebGLPreviewStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'lost' | 'error'

/**
 * P0-1 修复的修复：FramePerf 从 useWebGLPreview 返回值中**移除**，
 * 改为写入外部 `perfStore`。Editor 主体不订阅 perfStore → 拖滑块时
 * Editor 零 re-render；仅 Dev 诊断面板是独立 memo 组件订阅 perfStore
 * 自行重绘。
 *
 * 导出类型供 perfStore 复用。
 */
export type { FramePerf } from '../stores/perfStore'

export interface WebGLPreviewResult {
  canvasRef: React.RefObject<HTMLCanvasElement>
  status: WebGLPreviewStatus
  error?: string
  /**
   * 最新一帧渲染结果的 dataURL（JPEG）。
   * 在 renderNow 的同一 tick 内捕获（preserveDrawingBuffer=false 安全）。
   * 用于边框预览等需要引用编辑后图像的场景。
   */
  snapshotRef: React.RefObject<string | null>
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
  /** 是否在每帧渲染后捕获快照（昂贵操作，仅边框预览时开启） */
  captureSnapshot = false,
): WebGLPreviewResult {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<WebGLPreviewStatus>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  /** 最新一帧渲染结果（draw 同 tick 捕获，preserveDrawingBuffer=false 安全） */
  const snapshotRef = useRef<string | null>(null)
  const captureSnapshotRef = useRef(captureSnapshot)
  captureSnapshotRef.current = captureSnapshot
  const [gl, setGl] = useState<GLContext | null>(null)
  /**
   * 上下文重建版本号。每次 webglcontextrestored 触发时 +1，让 sourceUrl useEffect
   * 强制重跑（重上传纹理）。没有这个依赖的话 gl 对象引用不变、sourceUrl 不变，
   * 纹理在 lost 期间已失效但不会被重建。
   */
  const [restoreVersion, setRestoreVersion] = useState(0)

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

  // LUT 纹理加载（异步）。LUT 失败不 fallback 到 CPU：pipelineToSteps 在
  //   lut.texture=null 时自动跳过 LUT step，其它通道照常渲染。用户可见的退化
  //   由 AppShell 层统一给出 Toast 提示，不在这里做产品决策。
  const lut = useLutTexture(gl, pipeline?.lut ?? null)

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

      setStatus('ready')

      // 2.5) 帧快照：始终捕获，确保切到边框时第一帧就有编辑后的图像。
      //      边框模式（captureSnapshot=true）用 0.8 质量；
      //      普通模式用 0.3 极低质量（编码耗时 ~3ms，可接受）。
      try {
        const canvas = canvasRef.current
        if (canvas) {
          const quality = captureSnapshotRef.current ? 0.8 : 0.3
          snapshotRef.current = canvas.toDataURL('image/jpeg', quality)
        }
      } catch {
        // 静默失败
      }

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
            writeHistogram(hist)
          } else {
            writeHistogram(emptyHistogram())
          }
        }
      }

      const tEnd = performance.now()
      // 写到外部 perfStore（不触发 Editor re-render；只有 Dev 面板订阅者重绘）
      writePerf({
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
    //       省每帧 2-5ms blit。导出改走主进程 CPU 渲染，不再依赖 canvas.toDataURL()
    const ctx = new GLContext(canvasRef.current, { preserveDrawingBuffer: false })
    if (!ctx.ok) {
      setStatus('unsupported')
      return
    }
    const registry = new ShaderRegistry(ctx)
    const pipelineObj = new Pipeline(ctx, registry, DEFAULT_VERT)

    pipelineRef.current = pipelineObj
    setGl(ctx)

    const offLost = ctx.onLost(() => {
      // Context lost：所有 GPU 资源已被浏览器回收。
      //   - sourceTexRef：置 null，restored 后由 sourceUrl useEffect 重新 decode + 上传
      //   - Pipeline 的 ping-pong FBO / 纹理：lost 时引用无效，resizePingPong 会在
      //     下一次 run 时按需重建；这里显式 dispose 保证 reference 清零
      //   - registry 的 program cache：lost 时引用全部无效，在 restored 中清空
      sourceTexRef.current = null
      try {
        pipelineObj.dispose()
      } catch {
        /* context lost 时 dispose 本身可能抛，忽略 */
      }
      setStatus('lost')
    })
    const offRestored = ctx.onRestored(() => {
      // GLContext._handleRestored 已经重建了 quad VAO；
      // ShaderRegistry 的 program cache 失效需清空，让 runPass 下次编译
      try {
        registry.dispose()
      } catch {
        /* ignore */
      }
      setStatus('loading')
      // 触发 sourceUrl useEffect 重跑 → 重上传纹理 → renderNow（会自动 resize ping-pong）
      setRestoreVersion((v) => v + 1)
    })

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

  // 加载 sourceUrl → ImageBitmap → GPU texture。
  // restoreVersion 被故意加进依赖：context restored 时它 bump，强制 effect 重跑
  //   → 重 decode + 重上传纹理。biome 识别不到"依赖作为触发器"这种模式
  // biome-ignore lint/correctness/useExhaustiveDependencies: restoreVersion 是 context-restore 重触发信号，非函数体内消费
  useEffect(() => {
    if (!sourceUrl || !gl || !gl.ok || !pipelineRef.current) return

    let cancelled = false
    let tmpCanvas: HTMLCanvasElement | null = null
    setStatus('loading')
    setError(undefined)
    ;(async () => {
      try {
        const res = await fetch(sourceUrl)
        if (!res.ok) throw new Error(`fetch ${sourceUrl}: ${res.status}`)
        const blob = await res.blob()
        const bitmap = await createImageBitmap(blob, { imageOrientation: 'none' })
        if (cancelled) {
          bitmap.close()
          return
        }

        const canvas = canvasRef.current!
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width
          canvas.height = bitmap.height
        }

        // Chromium 的 ImageBitmap 内部像素已是 GL 方向（底→顶），
        // 且 UNPACK_FLIP_Y_WEBGL 对 ImageBitmap 源不生效。
        // 解决：先画到临时 canvas，再用 canvas 作为纹理源（flipY 对 canvas 可靠）。
        tmpCanvas = document.createElement('canvas')
        tmpCanvas.width = bitmap.width
        tmpCanvas.height = bitmap.height
        const ctx2d = tmpCanvas.getContext('2d')!
        ctx2d.drawImage(bitmap, 0, 0)
        bitmap.close()

        sourceTexRef.current?.dispose()
        sourceTexRef.current = textureFromBitmap(gl, tmpCanvas, {
          flipY: true,
          renderable: false,
        })

        // P2 修复：上传完成后立即释放 tmpCanvas 的 backing store（24MP ≈ 96MB）
        tmpCanvas.width = 0
        tmpCanvas.height = 0
        tmpCanvas = null

        // 换图必然重采一次直方图（重置计数器让第一帧强制采样）
        histogramFrameCounterRef.current = 0
        await renderNow()
      } catch (e) {
        if (cancelled) return
        // 释放 tmpCanvas 防止 96MB 内存泄漏
        if (tmpCanvas) {
          tmpCanvas.width = 0
          tmpCanvas.height = 0
          tmpCanvas = null
        }
        // 关键错误记录到 console（诊断 "GL: Failed to fetch" 类问题）：
        //   - sourceUrl 前缀（判断是 data:/grain:/file:/...）
        //   - URL 长度（data URL 过大 Chromium 会拒）
        //   - 完整错误
        const urlPrefix = typeof sourceUrl === 'string' ? sourceUrl.slice(0, 50) : String(sourceUrl)
        const urlLen = typeof sourceUrl === 'string' ? sourceUrl.length : -1
        console.error('[useWebGLPreview] fetch/decode failed', {
          urlPrefix,
          urlLen,
          error: (e as Error).message,
          stack: (e as Error).stack?.split('\n').slice(0, 3).join(' | '),
        })
        setStatus('error')
        setError((e as Error).message)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sourceUrl, gl, renderNow, restoreVersion])

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: pipeline/lut.texture/captureSnapshot are intentional triggers, values consumed via refs + renderNow closure
  useEffect(() => {
    if (!gl || !sourceTexRef.current || !pipelineRef.current) return
    // rAF 合并：同一帧内 pipeline 多次变化只调 renderNow 一次
    if (renderRafRef.current !== null) return
    renderRafRef.current = requestAnimationFrame(() => {
      renderRafRef.current = null
      try {
        renderNow()
      } catch (e) {
        // 确保 renderRafRef 已重置，后续 pipeline 变化不会被永久跳过
        console.error('[useWebGLPreview] renderNow failed:', e)
      }
    })
  }, [pipeline, lut.texture, captureSnapshot, renderNow])

  return { canvasRef, status, error, snapshotRef }
}
