/**
 * Editor 右栏滤镜列表的分组与排序规则
 *
 * 业务优先级（由高到低）：
 *   1. 用户自己上传的摄影作品参考集（source = 'extracted'）
 *      —— 最贴合用户当下偏好，放最上
 *   2. 用户自己导入的 LUT / 滤镜（source = 'imported'）
 *      —— 用户主动引入的第三方素材
 *   3. 社区排行（source = 'community' | 'builtin'）
 *      —— 内置 + 社区榜单合并为一组（都是外部推荐）
 *
 * 组内排序：
 *   - 先按 category 聚类（同一 category 紧挨）
 *   - 同 category 内按 popularity 降序；同热度按 updatedAt 降序（新偏好优先）
 *
 * 返回的分组数据直接驱动 Editor.tsx 的列表渲染（含标题、数量、列表项）
 */
import type { FilterCategory, FilterPreset } from '../../shared/types'

/** 渲染层的顶级分组 key */
export type FilterGroupKey = 'extracted' | 'imported' | 'community'

/** 每个顶级分组的元数据 */
export interface FilterGroupMeta {
  key: FilterGroupKey
  /** 中文短名（展示给用户） */
  title: string
  /** 次要说明（hover / 视觉辅助） */
  subtitle: string
  /** 排序权重（数字越小越靠前） */
  priority: number
}

export const FILTER_GROUP_META: Record<FilterGroupKey, FilterGroupMeta> = {
  extracted: {
    key: 'extracted',
    title: '我的参考作品',
    subtitle: '从你上传的摄影作品提取的风格',
    priority: 1,
  },
  imported: {
    key: 'imported',
    title: '我导入的滤镜',
    subtitle: '外部 LUT / 预设文件',
    priority: 2,
  },
  community: {
    key: 'community',
    title: '社区与内置',
    subtitle: '社区榜单 + 经典胶片预设',
    priority: 3,
  },
}

/** FilterCategory → 中文短标签（用作组内二级分组的 chip） */
export const CATEGORY_LABEL: Record<FilterCategory, string> = {
  'negative-color': '彩色负片',
  'negative-bw': '黑白',
  slide: '反转片',
  cinema: '电影胶片',
  instant: '拍立得',
  digital: '数码',
  custom: '自定义',
  extracted: '已提取',
}

/** 分组内二级子分组（同 category 紧挨） */
export interface FilterSubgroup {
  category: FilterCategory
  label: string
  filters: FilterPreset[]
}

/** 完整分组结果 */
export interface FilterGroup {
  meta: FilterGroupMeta
  total: number
  /** 按 category 聚类、并按 popularity 内排序的子分组 */
  subgroups: FilterSubgroup[]
}

/** FilterPreset.source → 顶级分组 key */
function sourceToGroupKey(source: FilterPreset['source']): FilterGroupKey {
  switch (source) {
    case 'extracted':
      return 'extracted'
    case 'imported':
      return 'imported'
    // builtin 和 community 统一并入"社区与内置"组
    default:
      return 'community'
  }
}

/**
 * 对滤镜列表做"业务优先级分组 + 组内分类二级分组 + 热度降序"。
 *
 * - 稳定性：相等权重下保留原数组顺序（避免滤镜列表无谓"晃动"）
 * - 空分组会被保留（meta.priority 顺序）但 total=0，调用方可以自行决定是否隐藏
 */
export function groupAndSortFilters(filters: readonly FilterPreset[]): FilterGroup[] {
  // Step 1: 按 groupKey 分桶
  const buckets = new Map<FilterGroupKey, FilterPreset[]>([
    ['extracted', []],
    ['imported', []],
    ['community', []],
  ])
  for (const f of filters) {
    const key = sourceToGroupKey(f.source)
    const arr = buckets.get(key)
    if (arr) arr.push(f)
  }

  // Step 2: 每个 bucket 内部先按 category 聚类，再按 popularity desc / updatedAt desc 排
  const groups: FilterGroup[] = []
  const sortedKeys = (Object.keys(FILTER_GROUP_META) as FilterGroupKey[]).sort(
    (a, b) => FILTER_GROUP_META[a].priority - FILTER_GROUP_META[b].priority,
  )
  for (const key of sortedKeys) {
    const meta = FILTER_GROUP_META[key]
    const items = buckets.get(key) ?? []
    // Map 保持插入顺序 → 让 category 第一次出现的顺序决定组内顺序
    const subMap = new Map<FilterCategory, FilterPreset[]>()
    for (const f of items) {
      const arr = subMap.get(f.category)
      if (arr) arr.push(f)
      else subMap.set(f.category, [f])
    }
    const subgroups: FilterSubgroup[] = []
    for (const [category, arr] of subMap) {
      // 稳定排序：Array.prototype.sort 在 V8 已稳定 → 同权重保留原顺序
      arr.sort((a, b) => {
        if (b.popularity !== a.popularity) return b.popularity - a.popularity
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
      })
      subgroups.push({
        category,
        label: CATEGORY_LABEL[category] ?? category,
        filters: arr,
      })
    }
    // Subgroup 之间按"组内最高 popularity"降序（更火的 category 先出现）
    subgroups.sort((a, b) => {
      const ap = a.filters[0]?.popularity ?? 0
      const bp = b.filters[0]?.popularity ?? 0
      return bp - ap
    })
    groups.push({
      meta,
      total: items.length,
      subgroups,
    })
  }
  return groups
}

/** 扁平化回数组（保持组间 + 组内的最终顺序），用于某些场景仍需单列表的调用方 */
export function flattenGroups(groups: readonly FilterGroup[]): FilterPreset[] {
  const out: FilterPreset[] = []
  for (const g of groups) {
    for (const s of g.subgroups) {
      out.push(...s.filters)
    }
  }
  return out
}
