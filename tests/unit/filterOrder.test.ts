/**
 * filterOrder 排序与分组契约测试
 *
 * 覆盖核心业务优先级：
 *   extracted > imported > community/builtin（组间）
 *   category 聚类（组内）
 *   popularity 降序 → updatedAt 降序（组内同 category）
 */
import { describe, expect, it } from 'vitest'
import type { FilterCategory, FilterPreset } from '../../shared/types'
import {
  CATEGORY_LABEL,
  FILTER_GROUP_META,
  flattenGroups,
  groupAndSortFilters,
} from '../../src/lib/filterOrder'

function mk(
  id: string,
  source: FilterPreset['source'],
  category: FilterCategory,
  popularity: number,
  updatedAt = 1,
): FilterPreset {
  return {
    id,
    name: id,
    category,
    author: 'test',
    version: '1',
    popularity,
    source,
    pipeline: {},
    createdAt: 0,
    updatedAt,
  }
}

describe('groupAndSortFilters', () => {
  it('空数组 → 3 个空组，meta 顺序为 extracted → imported → community', () => {
    const groups = groupAndSortFilters([])
    expect(groups.map((g) => g.meta.key)).toEqual(['extracted', 'imported', 'community'])
    for (const g of groups) {
      expect(g.total).toBe(0)
      expect(g.subgroups).toEqual([])
    }
  })

  it('混合 source → 分到正确的组，组优先级 extracted > imported > community/builtin', () => {
    const filters = [
      mk('c1', 'community', 'cinema', 50),
      mk('e1', 'extracted', 'cinema', 10),
      mk('b1', 'builtin', 'slide', 70),
      mk('i1', 'imported', 'custom', 30),
    ]
    const groups = groupAndSortFilters(filters)
    const names = groups.flatMap((g) => g.subgroups.flatMap((s) => s.filters.map((f) => f.id)))
    // 顺序必须是 extracted 先 → imported → community+builtin 最后
    expect(names.indexOf('e1')).toBeLessThan(names.indexOf('i1'))
    expect(names.indexOf('i1')).toBeLessThan(names.indexOf('b1'))
    expect(names.indexOf('i1')).toBeLessThan(names.indexOf('c1'))
  })

  it('builtin 与 community 合并进同一"社区与内置"组', () => {
    const filters = [mk('b1', 'builtin', 'cinema', 80), mk('c1', 'community', 'cinema', 90)]
    const groups = groupAndSortFilters(filters)
    const communityGroup = groups.find((g) => g.meta.key === 'community')
    expect(communityGroup?.total).toBe(2)
    // 组内按 popularity 降序：c1(90) > b1(80)
    expect(communityGroup?.subgroups[0].filters.map((f) => f.id)).toEqual(['c1', 'b1'])
  })

  it('组内按 category 聚类，同 category 按 popularity 降序；subgroup 之间按各组最高 popularity 降序', () => {
    const filters = [
      mk('slide-low', 'community', 'slide', 10),
      mk('cinema-high', 'community', 'cinema', 100),
      mk('slide-high', 'community', 'slide', 90),
      mk('cinema-low', 'community', 'cinema', 5),
    ]
    const groups = groupAndSortFilters(filters)
    const community = groups.find((g) => g.meta.key === 'community')!
    // cinema-high(100) > slide-high(90) → cinema subgroup 先出现
    expect(community.subgroups.map((s) => s.category)).toEqual(['cinema', 'slide'])
    // cinema 组：high(100) → low(5)
    expect(community.subgroups[0].filters.map((f) => f.id)).toEqual(['cinema-high', 'cinema-low'])
    // slide 组：high(90) → low(10)
    expect(community.subgroups[1].filters.map((f) => f.id)).toEqual(['slide-high', 'slide-low'])
  })

  it('同 popularity 下按 updatedAt 降序（新偏好优先）', () => {
    const filters = [
      mk('old', 'community', 'cinema', 50, 100),
      mk('new', 'community', 'cinema', 50, 999),
      mk('mid', 'community', 'cinema', 50, 500),
    ]
    const groups = groupAndSortFilters(filters)
    const community = groups.find((g) => g.meta.key === 'community')!
    expect(community.subgroups[0].filters.map((f) => f.id)).toEqual(['new', 'mid', 'old'])
  })

  it('extracted 组存在即使 popularity 是 0 也排在 community 高热度之前', () => {
    const filters = [
      mk('community-hot', 'community', 'slide', 99),
      mk('my-ref-1', 'extracted', 'extracted', 0),
      mk('my-ref-2', 'extracted', 'extracted', 0),
    ]
    const groups = groupAndSortFilters(filters)
    const flat = flattenGroups(groups)
    expect(flat[0].id).toBe('my-ref-1') // 或 my-ref-2，关键是 extracted 先
    expect(['my-ref-1', 'my-ref-2']).toContain(flat[0].id)
    expect(flat[2].id).toBe('community-hot')
  })

  it('total 字段准确反映组内过滤条数', () => {
    const filters = [
      mk('e1', 'extracted', 'extracted', 0),
      mk('e2', 'extracted', 'extracted', 0),
      mk('i1', 'imported', 'custom', 0),
      mk('c1', 'community', 'slide', 0),
      mk('c2', 'community', 'cinema', 0),
      mk('c3', 'community', 'cinema', 0),
    ]
    const groups = groupAndSortFilters(filters)
    const totals = Object.fromEntries(groups.map((g) => [g.meta.key, g.total]))
    expect(totals).toEqual({ extracted: 2, imported: 1, community: 3 })
  })

  it('稳定性：同 category + 同 popularity + 同 updatedAt 时保留原数组顺序', () => {
    const filters = [
      mk('first', 'community', 'cinema', 50, 100),
      mk('second', 'community', 'cinema', 50, 100),
      mk('third', 'community', 'cinema', 50, 100),
    ]
    const groups = groupAndSortFilters(filters)
    const community = groups.find((g) => g.meta.key === 'community')!
    expect(community.subgroups[0].filters.map((f) => f.id)).toEqual(['first', 'second', 'third'])
  })

  it('CATEGORY_LABEL 覆盖所有 FilterCategory', () => {
    const allCategories: FilterCategory[] = [
      'negative-color',
      'negative-bw',
      'slide',
      'cinema',
      'instant',
      'digital',
      'custom',
      'extracted',
    ]
    for (const c of allCategories) {
      expect(CATEGORY_LABEL[c]).toBeTruthy()
    }
  })

  it('FILTER_GROUP_META 的 priority 必须严格递增', () => {
    const ps = Object.values(FILTER_GROUP_META)
      .map((m) => m.priority)
      .sort((a, b) => a - b)
    // 去重后数量不变 → 没有重复的优先级
    expect(new Set(ps).size).toBe(ps.length)
  })
})

describe('flattenGroups', () => {
  it('扁平化保留组间 + 组内的最终顺序', () => {
    const filters = [
      mk('c1', 'community', 'cinema', 50),
      mk('i1', 'imported', 'custom', 10),
      mk('e1', 'extracted', 'extracted', 5),
      mk('c2', 'community', 'slide', 70),
    ]
    const groups = groupAndSortFilters(filters)
    const flat = flattenGroups(groups)
    expect(flat[0].id).toBe('e1')
    expect(flat[1].id).toBe('i1')
    // community 组内按 popularity：c2(70) > c1(50)
    expect(flat.slice(2).map((f) => f.id)).toEqual(['c2', 'c1'])
  })
})
