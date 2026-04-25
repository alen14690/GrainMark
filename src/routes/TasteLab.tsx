/**
 * TasteLab — 口味参考集管理
 *
 * P2 阶段：UI 骨架 + 空状态 + 卡片布局
 * P4 阶段：接入 featureExtractor / rubricBuilder / scorer 真实数据
 */
import { Plus, Target, Upload } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ValueBadge, cn } from '../design'

interface ReferenceSetView {
  id: string
  name: string
  description?: string
  sampleCount: number
  isTrained: boolean
  tags: string[]
}

// P4 替换为真实数据
const MOCK_SETS: ReferenceSetView[] = []

export default function TasteLab() {
  const [sets] = useState<ReferenceSetView[]>(MOCK_SETS)
  const [activeId, setActiveId] = useState<string | null>(null)

  if (sets.length === 0) {
    return (
      <div className="p-6 animate-fade-in">
        <HeadDescription />
        <EmptyState
          icon={<Target className="w-10 h-10" strokeWidth={1.5} />}
          title="还没有口味参考集"
          description={
            <>
              上传你喜欢的摄影作品（大师作品 / 心仪摄影师 / 满意之作），
              <br />
              GrainMark 将提炼你的审美基准，<span className="text-brand-amber">评分每张后期成片</span>，
              <br />
              并在未达标时<span className="text-brand-amber">自动优化参数</span>直至接近或超越。
            </>
          }
          action={
            <button type="button" className="btn-primary" disabled>
              <Plus className="w-4 h-4" />
              <span>新建参考集</span>
              <span className="ml-1 pill bg-bg-0 border-fg-4 text-fg-3 text-xxs">P4 开放</span>
            </button>
          }
        />
      </div>
    )
  }

  const active = sets.find((s) => s.id === activeId) ?? sets[0]!

  return (
    <div className="p-6 animate-fade-in max-w-6xl mx-auto">
      <HeadDescription />

      <div className="grid grid-cols-3 gap-4 mb-6">
        {sets.map((s) => (
          <ReferenceSetCard
            key={s.id}
            set={s}
            selected={s.id === active.id}
            onClick={() => setActiveId(s.id)}
          />
        ))}
        <NewSetCard />
      </div>

      {/* 详情区 */}
      <section className="card p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-display-serif text-xl text-fg-1">{active.name}</h2>
            {active.description && <p className="text-sm text-fg-2 mt-1">{active.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            {active.isTrained ? (
              <ValueBadge label="STATUS" value="已训练" variant="amber" />
            ) : (
              <ValueBadge label="STATUS" value="待训练" variant="muted" />
            )}
          </div>
        </div>
        <div className="text-sm text-fg-3">参考作品 {active.sampleCount} 张（P4 接入实际样本与特征）</div>
      </section>
    </div>
  )
}

function HeadDescription() {
  return (
    <div className="mb-6 max-w-3xl">
      <div className="inline-flex items-center gap-2 mb-2">
        <Target className="w-4 h-4 text-brand-amber" />
        <span className="font-mono text-xxs text-brand-amber tracking-[0.14em] uppercase">
          Taste Reference &amp; Self-Evolution
        </span>
      </div>
      <h1 className="font-display-serif text-2xl text-fg-1 leading-tight">
        用优秀作品教会 GrainMark 你的品味
      </h1>
      <p className="text-sm text-fg-2 mt-2 leading-relaxed">
        从你上传的参考作品中提炼 <span className="font-numeric text-fg-1">12 维度</span> 评分基准；
        每张成片实时评分，未达标时 <span className="text-brand-amber">自动迭代优化</span>，
        直至达到甚至超越参考集标准。所有数据均在本机处理。
      </p>
    </div>
  )
}

function ReferenceSetCard({
  set,
  selected,
  onClick,
}: {
  set: ReferenceSetView
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left card p-4 card-hover grain-local',
        selected ? 'border-brand-amber ring-1 ring-brand-amber/40' : '',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-display-serif text-lg text-fg-1">{set.name}</h3>
        {set.isTrained && <span className="w-1.5 h-1.5 rounded-full bg-brand-amber shadow-glow" />}
      </div>
      <div className="text-xs text-fg-2 mb-3">{set.sampleCount} 张参考作品</div>
      {set.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {set.tags.slice(0, 3).map((t) => (
            <span key={t} className="pill">
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

function NewSetCard() {
  return (
    <div className="card p-4 border-dashed flex flex-col items-center justify-center gap-2 text-fg-3 hover:text-fg-1 hover:border-fg-3 transition-colors duration-fast cursor-pointer min-h-[108px]">
      <Upload className="w-5 h-5" strokeWidth={1.5} />
      <span className="text-xs">新建参考集（P4 开放）</span>
    </div>
  )
}
