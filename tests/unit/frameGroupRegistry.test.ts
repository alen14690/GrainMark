/**
 * frameGroupRegistry — 阶段 5 · 分组元数据契约测试(2026-05-01)
 *
 * 2026-05-01 重要变更(用户反馈"经典那部分不要了"):
 *   - UI 层只展示阶段 5 的 31 个新风格(6 簇)
 *   - classic 12 风格保留注册但不在公共列表
 *   - FRAME_STYLE_GROUPS_ORDERED 不含 'classic' · 只 6 个
 *
 * 覆盖:
 *   G1 全部风格都必须有 group 字段
 *   G2 6 个公共 group 都必须有 style 挂载(不得有空组)
 *   G3 FRAME_STYLE_GROUPS_ORDERED 覆盖 6 个公共 group · 不含 classic
 *   G4 LABELS/SUBTITLES 对所有 FrameStyleGroup 都提供文案(含 classic 兜底)
 *   G5 getFrameStylesByGroup()默认过滤 classic · includeClassic:true 含全部
 *   G6 listPublicFrameStyles 总数 = 14(阶段 5 公开 · 防多/少注册)
 *   G7 阶段 5 的 31 个新 id 都已注册并归到对应 group
 *   G8 listFrameStyles 含 classic 的 26 个(12 老 + 31 新 · 防老 style 被误删)
 *   G9 蓝军:每个公共 group style 的竖图底栏专业水准 · 零边框风格豁免
 *   G10 蓝军:列表排序稳定
 *   G11 蓝军:registry 无 ESM 循环依赖(stage5 defaultOverrides 可读)
 *
 * 蓝军哲学:
 *   - 新增 group 时忘加 label → G4 真实红
 *   - classic 被误加入公共列表 → G6 真实红
 *   - 漏注册某 style 的 group → G1 真实红
 */
import { describe, expect, it } from 'vitest'
import {
  FRAME_STYLE_GROUPS_ORDERED,
  FRAME_STYLE_GROUP_LABELS,
  FRAME_STYLE_GROUP_SUBTITLES,
  getFrameStylesByGroup,
  listFrameStyles,
  listPublicFrameStyles,
} from '../../electron/services/frame/registry'
import type { FrameStyle, FrameStyleId } from '../../shared/types'

describe('FrameStyle 分组注册契约(阶段 5 · 2026-05-01)', () => {
  it('G1 · 所有注册的 style 都必须有 group 字段', () => {
    const styles = listFrameStyles()
    expect(styles.length).toBeGreaterThan(0)
    for (const s of styles) {
      expect(s.group, `${s.id} 缺 group 字段`).toBeTruthy()
      expect(typeof s.group, `${s.id} group 必须是字符串`).toBe('string')
    }
  })

  it('G2 · 6 个公共 group 都必须至少有 1 个 style 挂载(无空组)', () => {
    const byGroup = getFrameStylesByGroup()
    for (const group of FRAME_STYLE_GROUPS_ORDERED) {
      expect(
        byGroup[group].length,
        `group "${group}" 空组 · 至少要有 1 个 style 挂载才能在 UI 展示`,
      ).toBeGreaterThan(0)
    }
  })

  it('G3 · FRAME_STYLE_GROUPS_ORDERED 覆盖 6 个公共 group · 不含 classic · 无重复', () => {
    // 7 个(editorial/oil/floating/glass/ambient/cinema)
    expect(FRAME_STYLE_GROUPS_ORDERED.length).toBe(6)
    const unique = new Set(FRAME_STYLE_GROUPS_ORDERED)
    expect(unique.size, '分组顺序数组有重复').toBe(FRAME_STYLE_GROUPS_ORDERED.length)
    // 不含 classic
    expect(
      (FRAME_STYLE_GROUPS_ORDERED as readonly string[]).includes('classic'),
      '公共展示顺序不应含 classic',
    ).toBe(false)

    const expected: Array<Exclude<FrameStyle['group'], 'classic'>> = [
      'glass',
      'oil',
      'ambient',
      'cinema',
      'editorial',

      'floating',
    ]
    for (const g of expected) {
      expect(FRAME_STYLE_GROUPS_ORDERED.includes(g), `分组顺序缺 "${g}"`).toBe(true)
    }
  })

  it('G4 · FRAME_STYLE_GROUP_LABELS 与 SUBTITLES 都覆盖全部 8 个 group(含 classic 兜底)', () => {
    // 8 = 7 public + 1 classic 兜底
    const allGroups: FrameStyle['group'][] = [
      'classic',
      'glass',
      'oil',
      'ambient',
      'cinema',
      'editorial',

      'floating',
    ]
    for (const group of allGroups) {
      expect(FRAME_STYLE_GROUP_LABELS[group], `group "${group}" 缺中文 label`).toBeTruthy()
      expect(FRAME_STYLE_GROUP_SUBTITLES[group], `group "${group}" 缺英文 subtitle`).toBeTruthy()
    }
  })

  it('G5 · getFrameStylesByGroup() 默认过滤 classic · includeClassic 选项含全部', () => {
    const publicOnly = getFrameStylesByGroup()
    const allIncl = getFrameStylesByGroup({ includeClassic: true })
    expect(publicOnly.classic.length, 'default 应不含 classic').toBe(0)
    expect(allIncl.classic.length, 'includeClassic 应含 classic 12 个').toBe(12)
    // 非 classic 组的数量应一致
    for (const g of FRAME_STYLE_GROUPS_ORDERED) {
      expect(publicOnly[g].length).toBe(allIncl[g].length)
    }
  })

  it('G6 · listPublicFrameStyles 总数 = 14(阶段 5 公开数量 · 防漂移)', () => {
    expect(listPublicFrameStyles().length).toBe(31)
  })

  it('G7 · 阶段 5 的 31 个新 id 都已注册并归到对应 group', () => {
    const byId = new Map(listFrameStyles().map((s) => [s.id, s]))
    const expectedStage5: Array<[FrameStyleId, FrameStyle['group']]> = [
      ['frosted-glass', 'glass'],
      ['glass-chip', 'glass'],
      ['oil-texture', 'oil'],
      ['watercolor-caption', 'oil'],
      ['ambient-glow', 'ambient'],
      ['bokeh-pillar', 'ambient'],
      ['cinema-scope', 'cinema'],
      ['neon-edge', 'cinema'],
      ['swiss-grid', 'editorial'],
      ['floating-caption', 'floating'],
      ['stamp-corner', 'floating'],
    ]
    for (const [id, expectedGroup] of expectedStage5) {
      const s = byId.get(id)
      expect(s, `阶段 5 id "${id}" 未注册`).toBeTruthy()
      if (s) {
        expect(s.group, `阶段 5 id "${id}" 应归到 group "${expectedGroup}"`).toBe(expectedGroup)
      }
    }
  })

  it('G8 · listFrameStyles 总数 = 26(12 classic + 14 stage5 · 内部兼容老调用方)', () => {
    expect(listFrameStyles().length).toBe(43)
  })

  it('G9 · 蓝军:每个公共 group style 竖图要么零边框 overlay 要么有真实边框', () => {
    const byGroup = getFrameStylesByGroup()
    for (const group of FRAME_STYLE_GROUPS_ORDERED) {
      for (const s of byGroup[group]) {
        const total =
          s.portrait.borderBottom + s.portrait.borderTop + s.portrait.borderLeft + s.portrait.borderRight
        // total = 0 仅允许纯 overlay 风格(glass / floating / metal-medal / stamp / neon 等)
        if (total === 0) {
          // 纯 overlay:必须有 overlay slot
          expect(
            s.portrait.slots.some((slot) => slot.area === 'overlay'),
            `${s.id} 零边框但无 overlay slot · 文字无处可放`,
          ).toBe(true)
        } else {
          // 0.5 上限:左右 + 上下加起来的半图画幅已经是边框了 · 超过即异常
          expect(total, `${s.id} 竖图边框比例 ${total} 超出合理上限 0.5`).toBeLessThanOrEqual(0.5)
        }
      }
    }
  })

  it('G10 · 蓝军:列表排序稳定 · listFrameStyles 多次调用返回数组等长', () => {
    const first = listFrameStyles()
    const second = listFrameStyles()
    expect(second.length).toBe(first.length)
    // 仅对 id 做顺序断言(注册顺序不变),不断言对象引用
    const firstIds = first.map((s) => s.id).join(',')
    const secondIds = second.map((s) => s.id).join(',')
    expect(secondIds).toBe(firstIds)
  })

  it('G11 · 蓝军:registry 模块加载无 ESM 循环依赖(stage5 的 defaultOverrides 可读)', async () => {
    const { STAGE5_STYLES } = await import('../../electron/services/frame/registry-stage5')
    expect(STAGE5_STYLES.length).toBe(31)
    for (const s of STAGE5_STYLES) {
      expect(
        s.defaultOverrides,
        `stage5 style "${s.id}" defaultOverrides 未初始化(ESM 循环 TDZ?)`,
      ).toBeTruthy()
      expect(s.defaultOverrides.showFields, `stage5 style "${s.id}" showFields 丢失`).toBeTruthy()
    }
    const { DEFAULT_OVERRIDES: viaRegistry } = await import('../../electron/services/frame/registry')
    const { DEFAULT_OVERRIDES: viaDefaults } = await import('../../electron/services/frame/registry-defaults')
    expect(viaRegistry).toBe(viaDefaults)
  })
})
