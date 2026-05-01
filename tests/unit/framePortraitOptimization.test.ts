/**
 * 竖图(portrait)布局优化契约 · 2026-05-01
 *
 * 本 spec 专门证明"竖图不再照搬横图"的工程约束:
 *   1. gallery-black/white · editorial-caption · contax-label · minimal-bar 四风格
 *      的 portrait.slots 数据必须与 landscape.slots 有**可验证的差异**
 *      (要么 slot 数量/id 不同,要么 anchor/align/fontSize/area 不同)
 *   2. 底栏高度差异:竖图底栏 >= 横图底栏(给堆叠文字留空间),且都在合理范围(0.06~0.22)
 *   3. Contax / Editorial 的竖图 slot 布局必须是"堆叠"(model/params 左对齐同列)
 *      而不是"左右分端"(anchor.x 都 < 0.5)
 *
 * 蓝军反例(本测保护的回退模式):
 *   - 有人图省事把 portrait = { ...landscape, borderBottom: x }(只换底边高度不换 slot)
 *     → slot 差异断言会红
 *   - 有人把竖图 slot.align 恢复成 'right' 左右分端 → align 契约断言会红
 *   - 有人把竖图底栏改回 <= 横图 → 底栏差异断言会红(本风格底栏应更厚)
 *
 * 价值:未来加新风格或重构 BORDER tokens 时,防止"竖图照搬横图"反模式悄悄回归。
 */
import { describe, expect, it } from 'vitest'
import { getFrameStyle } from '../../electron/services/frame/registry'
import type { FrameContentSlot, FrameLayout, FrameStyleId } from '../../shared/types'

/** 判断两组 slots 是否"实质不同"(不是同一份数据) */
function slotsDiffer(a: FrameContentSlot[], b: FrameContentSlot[]): boolean {
  if (a.length !== b.length) return true
  return a.some((slotA, i) => {
    const slotB = b[i]
    if (!slotB) return true
    return (
      slotA.id !== slotB.id ||
      slotA.area !== slotB.area ||
      slotA.anchor.x !== slotB.anchor.x ||
      slotA.anchor.y !== slotB.anchor.y ||
      slotA.fontSize !== slotB.fontSize ||
      slotA.align !== slotB.align
    )
  })
}

/** 约定"需要竖图专属优化"的风格清单(2026-05-01 确认) */
const PORTRAIT_OPTIMIZED_STYLES: FrameStyleId[] = [
  'minimal-bar',
  'gallery-black',
  'gallery-white',
  'editorial-caption',
  'contax-label',
]

describe('竖图布局优化 · 契约护栏', () => {
  for (const id of PORTRAIT_OPTIMIZED_STYLES) {
    it(`${id}: portrait 与 landscape 的 slots 实质不同(防照搬回退)`, () => {
      const style = getFrameStyle(id)
      expect(style, `${id} 未注册`).toBeTruthy()
      if (!style) return
      expect(
        slotsDiffer(style.landscape.slots, style.portrait.slots),
        `${id} 的 portrait.slots 与 landscape.slots 完全一致 —— 这违反"竖图专属优化"承诺`,
      ).toBe(true)
    })
  }

  it('minimal-bar 竖图底栏 >= 横图底栏(要给 params + date 左右分置留空间)', () => {
    const style = getFrameStyle('minimal-bar')!
    expect(style.portrait.borderBottom).toBeGreaterThanOrEqual(style.landscape.borderBottom)
  })

  it('gallery-black 竖图底栏 >= 横图底栏(三行堆叠需要更厚底栏)', () => {
    const style = getFrameStyle('gallery-black')!
    expect(style.portrait.borderBottom).toBeGreaterThanOrEqual(style.landscape.borderBottom)
  })

  it('gallery-white 竖图底栏 >= 横图底栏(继承 gallery-black 的 portrait 结构)', () => {
    const style = getFrameStyle('gallery-white')!
    expect(style.portrait.borderBottom).toBeGreaterThanOrEqual(style.landscape.borderBottom)
  })

  it('editorial-caption 竖图:所有 slots 左起点对齐(anchor.x < 0.5)或 date 右下(不再左右分端)', () => {
    const style = getFrameStyle('editorial-caption')!
    const ports = style.portrait.slots
    // 预期布局:model + params 都在左(anchor.x < 0.5) · date 可以在右(0.95)
    const model = ports.find((s) => s.id === 'model')
    const params = ports.find((s) => s.id === 'params')
    expect(model?.anchor.x, 'model 竖图应在左侧').toBeLessThan(0.5)
    expect(params?.anchor.x, 'params 竖图应在左侧(与 model 同列)').toBeLessThan(0.5)
    // 关键差异:横图的 params.anchor.x = 0.95 右对齐 → 竖图的 params.anchor.x < 0.5 左对齐
    const landscapeParams = style.landscape.slots.find((s) => s.id === 'params')
    expect(landscapeParams?.anchor.x, '横图 params 应右端(对照组)').toBeGreaterThan(0.5)
  })

  it('contax-label 竖图:model + params 都左起点对齐(两行堆叠,不是横图的左右分端)', () => {
    const style = getFrameStyle('contax-label')!
    const ports = style.portrait.slots
    const model = ports.find((s) => s.id === 'model')
    const params = ports.find((s) => s.id === 'params')
    expect(model?.anchor.x, 'model 竖图应在左侧').toBeLessThan(0.5)
    expect(params?.anchor.x, 'params 竖图应在左侧(与 model 同列堆叠)').toBeLessThan(0.5)
    // y 位置:model 应在上 · params 应在下
    expect(model?.anchor.y ?? 1).toBeLessThan(params?.anchor.y ?? 0)
    // 对照:横图 params 在右端
    const landscapeParams = style.landscape.slots.find((s) => s.id === 'params')
    expect(landscapeParams?.anchor.x, '横图 params 应右端(对照组)').toBeGreaterThan(0.5)
  })

  it('所有风格 portrait 底栏比例在合理范围(0 ~ 0.28)', () => {
    // 防御:有人把 bottomPortrait 改成 1.5 或负值等异常值
    const style = getFrameStyle
    const ids: FrameStyleId[] = [
      'minimal-bar',
      'polaroid-classic',
      'gallery-black',
      'gallery-white',
      'editorial-caption',
      'contax-label',
    ]
    for (const id of ids) {
      const s = style(id) as { portrait: FrameLayout } | null
      expect(s, id).toBeTruthy()
      if (!s) continue
      expect(s.portrait.borderBottom).toBeGreaterThanOrEqual(0)
      expect(s.portrait.borderBottom).toBeLessThanOrEqual(0.28)
    }
  })

  // ============================================================================
  // 2026-05-01 专业比例契约(对标 ShotOn / Mark Foto / Fujifilm Ink Studio)
  // ============================================================================
  // 竖图底栏必须 >= 0.18 · 主字号必须 >= 0.03 · 专业 EXIF 边框的工程标准
  // 蓝军:防止有人再把 bottomPortrait 改回 0.12 / 主字号改回 0.024 这种"压条 + 小字"反模式

  it('专业竖图:底栏式 5 风格(minimal/gallery/editorial/contax + polaroid)竖图底栏 >= 18%', () => {
    const ids: FrameStyleId[] = [
      'minimal-bar',
      'polaroid-classic',
      'gallery-black',
      'gallery-white',
      'editorial-caption',
      'contax-label',
    ]
    for (const id of ids) {
      const s = getFrameStyle(id)
      expect(s, id).toBeTruthy()
      if (!s) continue
      expect(
        s.portrait.borderBottom,
        `${id} 竖图底栏 ${s.portrait.borderBottom} 小于专业下限 0.18 —— 会观感像"压条"`,
      ).toBeGreaterThanOrEqual(0.18)
    }
  })

  it('专业竖图:含主标题 slot 的风格(model/artist)竖图主字号 >= 0.028(放大而非缩小)', () => {
    // 底栏式 4 风格的主标题都应满足:字号 >= mainTitlePortrait(0.034) 附近
    // 最低接受 0.028(mainTitle 原始值),不允许退回到 < 0.028
    const ids: FrameStyleId[] = [
      'minimal-bar',
      'polaroid-classic',
      'gallery-black',
      'gallery-white',
      'editorial-caption',
      'contax-label',
    ]
    for (const id of ids) {
      const s = getFrameStyle(id)
      expect(s, id).toBeTruthy()
      if (!s) continue
      const titleSlot = s.portrait.slots.find((slot) => slot.id === 'model')
      // minimal-bar 横图无 model slot,但竖图专业重设计后加了(验证存在性)
      expect(titleSlot, `${id} 竖图缺 model slot —— 专业重设计要求竖图必有主标题`).toBeTruthy()
      if (!titleSlot) continue
      expect(
        titleSlot.fontSize,
        `${id} 竖图主标题字号 ${titleSlot.fontSize} 小于专业下限 0.028 —— 放大而非缩小才专业`,
      ).toBeGreaterThanOrEqual(0.028)
    }
  })
})
