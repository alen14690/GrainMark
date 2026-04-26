/**
 * PhotoCard — 画廊图片卡
 * Aurora Glass：玻璃卡片 + 紫辉选中
 *
 * **两种适配模式**（对齐业界主流图库软件）：
 *   - fit='cover'（默认，Lightroom/Photos.app 风格）：
 *       卡片使用调用方指定的统一 aspectRatio（默认 1:1 方形），
 *       图片用 `object-cover` 居中裁切铺满 —— 整个网格像书架一样对齐
 *   - fit='contain'（保留真实比例）：
 *       卡片按图片真实 aspectRatio 撑开，图片 `object-contain` 不裁切 ——
 *       适合"数字暗房"场景（调色前预览完整构图）
 */
import { Star } from 'lucide-react'
import { cn } from '../utils'

export interface PhotoCardProps {
  src: string
  name: string
  starred?: boolean
  rating?: 0 | 1 | 2 | 3 | 4 | 5
  selected?: boolean
  cameraLabel?: string // e.g. "LEICA M11 · 35mm · f/2"
  dimensions?: string // "6000×4000"
  /**
   * 图片显示比例 = width / height。
   *   - fit='cover' 下：如果传入值则用于"卡片本身的比例"（所有卡片同值 → 统一网格）；
   *     不传则默认 1（方形，最常见的 Lightroom grid 风格）
   *   - fit='contain' 下：卡片按这个比例撑开；竖图传 <1，横图传 >1
   */
  aspectRatio?: number
  /**
   * 图片适配策略。
   *   - 'cover'（默认）：居中裁切，统一网格；卡片比例由 aspectRatio（或 1:1 默认）决定
   *   - 'contain'：不裁切，卡片比例 = 图片真实比例
   */
  fit?: 'cover' | 'contain'
  /** 胶片齿孔（画廊感） */
  sprocket?: boolean
  onClick?: () => void
  onDoubleClick?: () => void
  className?: string
  ariaLabel?: string
}

/** 将任意 aspect 归到合理范围，避免极端值撑爆网格 */
export function clampAspect(a: number | undefined): number {
  if (!a || !Number.isFinite(a) || a <= 0) return 4 / 3
  // 限制 [0.5, 2.2] ≈ [极竖 1:2, 极横 2.2:1]，超过的走上/下限并在 UI 上显示 letterbox
  return Math.max(0.5, Math.min(2.2, a))
}

export function PhotoCard({
  src,
  name,
  starred,
  rating,
  selected,
  cameraLabel,
  dimensions,
  aspectRatio,
  fit = 'cover',
  sprocket = false,
  onClick,
  onDoubleClick,
  className,
  ariaLabel,
}: PhotoCardProps) {
  // cover 模式：aspectRatio 默认 1（方形，Lightroom grid 风格）；若调用方明确传值则用该值
  // contain 模式：按图片真实比例撑卡片（老行为）
  const aspect =
    fit === 'cover' ? (aspectRatio && aspectRatio > 0 ? aspectRatio : 1) : clampAspect(aspectRatio)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel ?? name}
      aria-pressed={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
      style={{ aspectRatio: `${aspect}` }}
      className={cn(
        'group relative overflow-hidden rounded-lg cursor-pointer',
        'transition-all duration-fast ease-liquid',
        'bg-white/[0.03] border',
        selected
          ? 'border-brand-violet/60 ring-2 ring-brand-violet/40 shadow-glow-violet'
          : 'border-white/10 hover:border-white/20 hover:-translate-y-0.5 hover:shadow-soft-md',
        sprocket && 'film-sprocket-top film-sprocket-bottom',
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          // cover：居中裁切铺满卡片（Lightroom 风格，统一网格感）
          // contain：保持原比例，极端比例下露黑边（数字暗房风格，不丢信息）
          className={cn(
            'w-full h-full img-contain-clean',
            fit === 'cover' ? 'object-cover' : 'object-contain',
          )}
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-fg-4">
          <span className="text-xs font-mono">no preview</span>
        </div>
      )}

      {/* 底部渐变 */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 h-16',
          'bg-gradient-to-t from-black/85 via-black/40 to-transparent',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-fast',
        )}
      />

      {/* 星标 */}
      {starred && (
        <div
          aria-label="starred"
          className="absolute top-2 left-2 w-6 h-6 rounded-md bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/10"
        >
          <Star className="w-3 h-3 text-brand-amber fill-brand-amber" />
        </div>
      )}

      {/* 选中标记（Aurora 渐变）*/}
      {selected && (
        <div
          aria-label="selected"
          className="absolute top-2 right-2 w-5 h-5 rounded-full text-bg-0 flex items-center justify-center text-xxs font-bold shadow-glow-violet"
          style={{ background: 'linear-gradient(135deg,#D4B88A,#B589FF)' }}
        >
          ✓
        </div>
      )}

      {/* 评分小点 */}
      {rating && rating > 0 ? (
        <div className="absolute top-2 right-10 flex gap-0.5">
          {Array.from({ length: rating }).map((_, i) => (
            <span key={i} className="w-1 h-1 rounded-full bg-brand-amber" />
          ))}
        </div>
      ) : null}

      {/* 信息条（hover 显示） */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 p-2 opacity-0 group-hover:opacity-100',
          'transition-opacity duration-fast',
        )}
      >
        <div className="text-xs font-medium text-fg-1 truncate">{name}</div>
        {(cameraLabel || dimensions) && (
          <div className="text-xxs text-fg-2 font-mono truncate mt-0.5">
            {[cameraLabel, dimensions].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}
