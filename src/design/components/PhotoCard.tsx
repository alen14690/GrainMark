/**
 * PhotoCard — 画廊图片卡
 * Aurora Glass：玻璃卡片 + 紫辉选中 + 真实宽高比（不强制裁切）
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
   * - 缺省或 0 → 回退到 4/3（老行为）
   * - 竖拍图传 <1（如 2/3）；横拍传 >1（如 3/2）；方形传 1
   * 注意：aspect 决定的是"卡片本身的外形"，图片内部用 object-contain
   * 避免裁切导致的变形/信息丢失。
   */
  aspectRatio?: number
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
  sprocket = false,
  onClick,
  onDoubleClick,
  className,
  ariaLabel,
}: PhotoCardProps) {
  const aspect = clampAspect(aspectRatio)
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
          // object-contain 保持原比例，不变形；因为 aspect 已用图片真实比例设定，
          // 通常无明显 letterbox；极端比例时留黑边而不是挤压
          className="w-full h-full object-contain img-contain-clean"
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
