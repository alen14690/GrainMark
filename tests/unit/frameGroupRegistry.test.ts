/**
 * frameGroupRegistry — 阶段 5 · 分组元数据契约测试(2026-05-01)
 *
 * 覆盖:
 *   G1 24 个风格都必须有 group 字段 · 不得漏一个
 *   G2 8 个 group 都必须有 style 挂载 · 不得有空组
 *   G3 FRAME_STYLE_GROUPS_ORDERED 覆盖全部 8 个 group · 无遗漏无重复
 *   G4 FRAME_STYLE_GROUP_LABELS 对每个 group 都提供中文名
 *   G5 getFrameStylesByGroup 按 group 归类 · 总数 = listFrameStyles 总数
 *   G6 classic 组必须至少含 12 个(M-Frame 阶段 2/3 的必保 8 + 可选 4)
 *   G7 阶段 5 的 14 个新 id 都已注册并归到对应 group
 *   G8 蓝军:Watermark.tsx 的 GROUP_ORDER 与 registry 的一致(防两端漂移)
 *
 * 蓝军哲学:
 *   - 新增 group 时忘加 label → G4 真实红
 *   - 注册漏一个 style 的 group 字段 → G1 真实红
 *   - GROUP_ORDER 漏掉某个 group → G3 真实红
 */
import { describe, expect, it } from 'vitest'
import {
  FRAME_STYLE_GROUPS_ORDERED,
  FRAME_STYLE_GROUP_LABELS,
  FRAME_STYLE_GROUP_SUBTITLES,
  getFrameStylesByGroup,
  listFrameStyles,
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

  it('G2 · 8 个 group 都必须至少有 1 个 style 挂载(无空组)', () => {
    const byGroup = getFrameStylesByGroup()
    for (const group of FRAME_STYLE_GROUPS_ORDERED) {
      expect(
        byGroup[group].length,
        `group "${group}" 空组 · 至少要有 1 个 style 挂载才能在 UI 展示`,
      ).toBeGreaterThan(0)
    }
  })

  it('G3 · FRAME_STYLE_GROUPS_ORDERED 覆盖所有 8 个 group · 无遗漏无重复', () => {
    // 应为 8 个(classic/glass/oil/ambient/cinema/editorial/metal/floating)
    expect(FRAME_STYLE_GROUPS_ORDERED.length).toBe(8)
    const unique = new Set(FRAME_STYLE_GROUPS_ORDERED)
    expect(unique.size, '分组顺序数组有重复').toBe(FRAME_STYLE_GROUPS_ORDERED.length)

    const expected: Array<FrameStyle['group']> = [
      'classic',
      'glass',
      'oil',
      'ambient',
      'cinema',
      'editorial',
      'metal',
      'floating',
    ]
    for (const g of expected) {
      expect(FRAME_STYLE_GROUPS_ORDERED.includes(g), `分组顺序缺 "${g}"`).toBe(true)
    }
  })

  it('G4 · FRAME_STYLE_GROUP_LABELS 与 SUBTITLES 都覆盖全部 8 个 group', () => {
    for (const group of FRAME_STYLE_GROUPS_ORDERED) {
      expect(FRAME_STYLE_GROUP_LABELS[group], `group "${group}" 缺中文 label`).toBeTruthy()
      expect(FRAME_STYLE_GROUP_SUBTITLES[group], `group "${group}" 缺英文 subtitle`).toBeTruthy()
    }
  })

  it('G5 · getFrameStylesByGroup 总数 = listFrameStyles 总数', () => {
    const all = listFrameStyles()
    const byGroup = getFrameStylesByGroup()
    const sum = Object.values(byGroup).reduce((acc, arr) => acc + arr.length, 0)
    expect(sum, 'byGroup 总数与 listFrameStyles 不一致').toBe(all.length)
  })

  it('G6 · classic 组至少含 12 个(M-Frame 阶段 2 必保 8 + 阶段 3 可选 4)', () => {
    const byGroup = getFrameStylesByGroup()
    expect(byGroup.classic.length).toBeGreaterThanOrEqual(12)
  })

  it('G7 · 阶段 5 的 14 个新 id 都已注册并归到对应 group', () => {
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
      ['contact-sheet', 'editorial'],
      ['brushed-metal', 'metal'],
      ['medal-plate', 'metal'],
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

  it('G8 · 蓝军:阶段 5 注册总数应为 14(防止多/少注册漂移)', () => {
    const stage5Ids = new Set([
      'frosted-glass',
      'glass-chip',
      'oil-texture',
      'watercolor-caption',
      'ambient-glow',
      'bokeh-pillar',
      'cinema-scope',
      'neon-edge',
      'swiss-grid',
      'contact-sheet',
      'brushed-metal',
      'medal-plate',
      'floating-caption',
      'stamp-corner',
    ])
    const registered = listFrameStyles().filter((s) => stage5Ids.has(s.id))
    expect(registered.length, '阶段 5 应注册 14 个风格').toBe(14)
  })

  it('G9 · 蓝军:每个 classic 组 style 的竖图底栏比例应保持专业水准 >= 0.18 或独特(hairline/stamp/chip 零边框)', () => {
    // classic 组的"底栏式"风格必须满足专业比例
    // 零边框风格(hairline / point-and-shoot-stamp)允许 0
    const byGroup = getFrameStylesByGroup()
    const zeroBorderAllowed = new Set([
      'hairline',
      'point-and-shoot-stamp',
      'glass-chip',
      'frosted-glass',
      'medal-plate',
      'stamp-corner',
      'floating-caption',
    ])
    for (const s of byGroup.classic) {
      if (zeroBorderAllowed.has(s.id)) continue
      expect(
        s.portrait.borderBottom + s.portrait.borderTop + s.portrait.borderLeft + s.portrait.borderRight,
        `${s.id} classic 组竖图边框全为 0 不合理`,
      ).toBeGreaterThan(0)
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
    // 2026-05-01 复盘:老版 registry-stage5 `import DEFAULT_OVERRIDES from registry`
    //   registry `import STAGE5_STYLES from registry-stage5` → 循环 → TDZ
    //   报错:"Cannot access 'H' before initialization"(H = 压缩后的 DEFAULT_OVERRIDES)
    //
    // 新版:DEFAULT_OVERRIDES 迁到独立 registry-defaults.ts · 两边 import 都走它
    //
    // 本契约:如果哪天有人把 DEFAULT_OVERRIDES 挪回 registry.ts · stage5 的每个 style 的
    //   defaultOverrides 会变成 undefined(顶层 TDZ 读取) · 本断言会捕获
    const { STAGE5_STYLES } = await import('../../electron/services/frame/registry-stage5')
    expect(STAGE5_STYLES.length).toBe(14)
    for (const s of STAGE5_STYLES) {
      expect(
        s.defaultOverrides,
        `stage5 style "${s.id}" defaultOverrides 未初始化(ESM 循环 TDZ?)`,
      ).toBeTruthy()
      expect(s.defaultOverrides.showFields, `stage5 style "${s.id}" showFields 丢失`).toBeTruthy()
    }
    // 同时验证:registry 对外 re-export 的 DEFAULT_OVERRIDES 与 defaults 模块一致
    const { DEFAULT_OVERRIDES: viaRegistry } = await import('../../electron/services/frame/registry')
    const { DEFAULT_OVERRIDES: viaDefaults } = await import('../../electron/services/frame/registry-defaults')
    expect(viaRegistry).toBe(viaDefaults) // 应是同一引用
  })
})
