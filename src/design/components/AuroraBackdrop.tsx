/**
 * AuroraBackdrop — Aurora Glass 全局背景层
 *
 * 三层径向渐变 orb，60s 周期慢漂移（Q2-B）
 * - 紫（左上）
 * - 青（右上）
 * - 品红（底中）
 * 使用 fixed 定位，位于 z-index:0；所有内容层的 z-index ≥ 1
 *
 * 性能：
 *   - 用 transform 而非 top/left（GPU 合成）
 *   - 用 filter:blur 一次性模糊，浏览器会栅格化后缓存
 *   - @media (prefers-reduced-motion) 时自动停止动画（在 global.css 里声明）
 */

interface AuroraBackdropProps {
  /** 调试用：完全关闭 */
  disabled?: boolean
  /** 轻量模式：减弱亮度（默认在评分/编辑场景用） */
  dim?: boolean
}

export function AuroraBackdrop({ disabled = false, dim = false }: AuroraBackdropProps) {
  if (disabled) return null
  const opacityMul = dim ? 0.5 : 1
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      {/* orb 1 — 紫（左上） */}
      <div
        className="absolute animate-aurora-drift"
        style={{
          top: '-20%',
          left: '-10%',
          width: '60vw',
          height: '60vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #3A2D7A 0%, transparent 65%)',
          filter: 'blur(60px)',
          opacity: 0.7 * opacityMul,
          willChange: 'transform',
          animationDelay: '0s',
        }}
      />
      {/* orb 2 — 青（右上） */}
      <div
        className="absolute animate-aurora-drift"
        style={{
          top: '-10%',
          right: '-15%',
          width: '50vw',
          height: '50vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #5ECDF7 0%, transparent 65%)',
          filter: 'blur(70px)',
          opacity: 0.32 * opacityMul,
          willChange: 'transform',
          animationDelay: '-20s',
        }}
      />
      {/* orb 3 — 品红（底中） */}
      <div
        className="absolute animate-aurora-drift"
        style={{
          bottom: '-25%',
          left: '20%',
          width: '55vw',
          height: '55vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #B589FF 0%, transparent 65%)',
          filter: 'blur(70px)',
          opacity: 0.38 * opacityMul,
          willChange: 'transform',
          animationDelay: '-40s',
        }}
      />
    </div>
  )
}
