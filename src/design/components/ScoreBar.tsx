/**
 * ScoreBar — 编辑器顶部评分条
 * 空壳版（P2）：数据接口已定，可渲染；P4 将通过 IPC 实时接入真实评分
 */
import { cn, gradeToColor } from '../utils'

export type ScoreGrade = 'surpass' | 'reach' | 'near' | 'below' | 'far' | 'pending'

export interface ScoreBarProps {
  /** 0..100，null 表示未启用参考集 */
  score: number | null
  target?: number // 目标分数（默认 80）
  grade?: ScoreGrade
  rubricName?: string
  onAutoTune?: () => void
  onSwitchRubric?: () => void
  onDetail?: () => void
  className?: string
}

const GRADE_LABEL: Record<ScoreGrade, string> = {
  surpass: '🏆 超越参考集',
  reach: '✨ 达到参考集',
  near: '⭐ 接近参考集',
  below: '⚠ 有明显差距',
  far: '✗ 需要大幅调整',
  pending: '评分中…',
}

export function ScoreBar({
  score,
  target = 80,
  grade = 'pending',
  rubricName,
  onAutoTune,
  onSwitchRubric,
  onDetail,
  className,
}: ScoreBarProps) {
  if (score === null) {
    // 无参考集：引导添加
    return (
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-2 rounded-md bg-bg-1 border border-fg-4/60',
          className,
        )}
      >
        <span className="text-xs text-fg-2">
          开启 <span className="font-display-serif text-fg-1">口味参考集</span> 以获得作品评分与自动优化
        </span>
        <button type="button" onClick={onSwitchRubric} className="btn-ghost btn-xs ml-auto">
          选择 / 新建
        </button>
      </div>
    )
  }

  const pct = Math.max(0, Math.min(100, score))
  const colorClass = `bg-${gradeToColor(grade === 'pending' ? 'near' : grade)}`

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 rounded-md bg-bg-1 border border-fg-4/60',
        'animate-fade-in',
        className,
      )}
    >
      {/* 分数 */}
      <div className="flex items-baseline gap-1.5">
        <span className="font-numeric tabular-nums text-2xl text-fg-1 font-semibold leading-none">
          {pct.toFixed(0)}
        </span>
        <span className="font-numeric text-xxs text-fg-3">/100</span>
      </div>

      {/* 进度 */}
      <div className="flex-1 min-w-0">
        <div className="score-track">
          <div className={cn('score-fill', colorClass)} style={{ width: `${pct}%` }} />
          {/* 目标刻度线 */}
          <div
            className="absolute top-0 h-full w-px bg-brand-amber/60"
            style={{ left: `${target}%` }}
            aria-hidden
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xxs text-fg-3 font-mono">{rubricName ?? 'Default Rubric'}</span>
          <span className="text-xxs text-fg-2">{GRADE_LABEL[grade]}</span>
        </div>
      </div>

      {/* 操作 */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onAutoTune && (
          <button type="button" onClick={onAutoTune} className="btn-primary btn-xs">
            自动优化
          </button>
        )}
        {onDetail && (
          <button type="button" onClick={onDetail} className="btn-ghost btn-xs">
            详情
          </button>
        )}
      </div>
    </div>
  )
}
