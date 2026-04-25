/**
 * Histogram — 实时直方图（RGB + 亮度）
 *
 * 用于编辑器右栏底部监视区，以及 TasteLab 参考集训练可视化
 */
import { useEffect, useRef } from 'react'
import { cn } from '../utils'

export interface HistogramData {
  r?: number[] // length 256
  g?: number[]
  b?: number[]
  luma?: number[]
}

export interface HistogramProps {
  data: HistogramData | null
  width?: number
  height?: number
  /** 显示哪些通道 */
  channels?: Array<'r' | 'g' | 'b' | 'luma'>
  /** 混合模式 */
  blend?: 'screen' | 'lighten' | 'overlay' | 'normal'
  className?: string
  showGrid?: boolean
}

const COLORS: Record<'r' | 'g' | 'b' | 'luma', string> = {
  r: 'rgba(200, 48, 42, 0.75)',
  g: 'rgba(122, 154, 107, 0.75)',
  b: 'rgba(74, 138, 158, 0.8)',
  luma: 'rgba(245, 243, 238, 0.55)',
}

export function Histogram({
  data,
  width = 260,
  height = 80,
  channels = ['r', 'g', 'b', 'luma'],
  blend = 'screen',
  className,
  showGrid = true,
}: HistogramProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    // 网格
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      for (let i = 1; i < 4; i++) {
        const x = (i / 4) * width
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
    }

    if (!data) return

    ctx.globalCompositeOperation = blend as GlobalCompositeOperation

    for (const ch of channels) {
      const bins = data[ch]
      if (!bins || bins.length !== 256) continue
      const peak = Math.max(1, ...bins)
      ctx.fillStyle = COLORS[ch]
      ctx.beginPath()
      ctx.moveTo(0, height)
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * width
        const h = (bins[i]! / peak) * height * 0.95
        ctx.lineTo(x, height - h)
      }
      ctx.lineTo(width, height)
      ctx.closePath()
      ctx.fill()
    }

    ctx.globalCompositeOperation = 'source-over'
  }, [data, width, height, channels, blend, showGrid])

  return (
    <div className={cn('relative rounded-sm bg-bg-0 border border-fg-4/60', className)}>
      <canvas ref={ref} className="block" />
      {!data && (
        <div className="absolute inset-0 flex items-center justify-center text-xxs text-fg-3 font-mono">
          no histogram
        </div>
      )}
    </div>
  )
}
