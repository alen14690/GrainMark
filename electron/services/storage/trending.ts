/**
 * 社区热度榜（M8 将替换为真实合法的公开元数据采集器）
 */
import { getTrendingTable } from './init.js'

export interface TrendingItem {
  name: string
  score: number
  source: string
  tags: string[]
}

export async function fetchTrending(): Promise<TrendingItem[]> {
  const table = getTrendingTable()
  const stored = table.all()
  if (stored.length > 0) {
    return stored
      .map((r) => ({ name: r.name, score: r.score, source: r.source, tags: r.tags }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
  }

  // 首次无数据 — 返回种子（M8 替换为真实抓取）
  return [
    { name: 'Kodak Portra 400', score: 98, source: 'seed', tags: ['portrait', 'warm'] },
    { name: 'Cinestill 800T', score: 95, source: 'seed', tags: ['night', 'tungsten', 'halation'] },
    { name: 'Fuji 400H', score: 92, source: 'seed', tags: ['pastel', 'wedding'] },
    { name: 'Kodak Gold 200', score: 90, source: 'seed', tags: ['daily', 'warm'] },
    { name: 'Ilford HP5 Plus', score: 88, source: 'seed', tags: ['bw', 'street'] },
    { name: 'Fuji Velvia 50', score: 86, source: 'seed', tags: ['landscape', 'saturated'] },
    { name: 'Kodak Ektar 100', score: 85, source: 'seed', tags: ['landscape', 'vivid'] },
    { name: 'Fuji Classic Chrome', score: 83, source: 'seed', tags: ['documentary', 'muted'] },
    { name: 'Agfa Vista 200', score: 80, source: 'seed', tags: ['retro', 'warm'] },
    { name: 'Kodak Tri-X 400', score: 78, source: 'seed', tags: ['bw', 'classic'] },
  ]
}
