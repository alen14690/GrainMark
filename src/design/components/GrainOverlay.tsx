/**
 * 胶片颗粒质感层 — 全局装饰组件
 *
 * 使用 SVG fractal noise（可关闭），极淡透明度
 * 仅作为背景氛围，不干扰图像
 */
import { useEffect, useState } from 'react'

interface GrainOverlayProps {
  opacity?: number // 0..1，默认 0.04
  baseFreq?: number // SVG turbulence baseFrequency
  blend?: React.CSSProperties['mixBlendMode']
  disabled?: boolean
  seed?: number
}

export function GrainOverlay({
  opacity = 0.02,
  baseFreq = 0.9,
  blend = 'overlay',
  disabled = false,
  seed = 7,
}: GrainOverlayProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (disabled || !mounted) return null

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>
    <filter id='n'>
      <feTurbulence type='fractalNoise' baseFrequency='${baseFreq}' numOctaves='2' seed='${seed}' stitchTiles='stitch'/>
      <feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 ${opacity * 2} 0'/>
    </filter>
    <rect width='100%' height='100%' filter='url(%23n)'/>
  </svg>`
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg).replace(/'/g, '%27')}")`

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        backgroundImage: url,
        backgroundRepeat: 'repeat',
        mixBlendMode: blend,
        opacity,
        zIndex: 1,
      }}
    />
  )
}
