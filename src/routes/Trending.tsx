import { Flame, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ipc } from '../lib/ipc'

interface TrendingItem {
  name: string
  score: number
  source: string
  tags: string[]
}

export default function Trending() {
  const [items, setItems] = useState<TrendingItem[]>([])
  const [loading, setLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const list = await ipc('trending:fetch')
      setItems(list)
    } finally {
      setLoading(false)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only
  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-accent-500/15 border border-accent-500/30 flex items-center justify-center">
          <Flame className="w-4 h-4 text-accent-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold">社区胶片趋势榜</h2>
          <p className="text-[11.5px] text-ink-400 mt-0.5">
            基于合法抓取的公开元数据（Reddit r/AnalogCommunity / Unsplash / Glass 等），反映当下最热的胶片风格
          </p>
        </div>
        <button onClick={refresh} disabled={loading} className="btn-secondary">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="card divide-y divide-ink-900">
        {items.map((item, i) => (
          <div key={item.name} className="flex items-center gap-4 px-4 py-3 hover:bg-ink-900/50">
            <div className="w-8 text-center">
              <div
                className={`text-[18px] font-bold ${i < 3 ? 'text-accent-400' : 'text-ink-500'} font-mono`}
              >
                {i + 1}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-medium">{item.name}</div>
              <div className="flex gap-2 mt-1">
                {item.tags.map((t) => (
                  <span key={t} className="text-[10.5px] text-ink-500 font-mono">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[13px] font-semibold text-accent-400 font-mono">
                {item.score.toFixed(1)}
              </div>
              <div className="text-[10px] text-ink-600 font-mono uppercase">{item.source}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-[10.5px] text-ink-500 mt-4 leading-relaxed">
        💡 数据仅来源于公开元数据（标签、名称、点赞数），不抓取图片本身；遵守各平台 robots.txt 与速率限制。
      </div>
    </div>
  )
}
