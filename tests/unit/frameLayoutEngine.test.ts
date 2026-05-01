/**
 * frameLayoutEngine 测试
 *
 * 契约(AGENTS.md 第 4 条):
 *   1. 横竖判定基于 classifyOrientation,不散布 if 语句(本测通过 orientation 字段验证)
 *   2. 横图走 style.landscape,竖图走 style.portrait(绝不能颠倒)
 *   3. canvas 尺寸 = 原图 + 四边边框(公式正确)
 *   4. 原图偏移 = (borderLeft, borderTop)
 *   5. Slot 位置计算对 5 种 area(top/bottom/left/right/overlay)都正确
 */
import { describe, expect, it } from 'vitest'
import { computeFrameGeometry, placeSlot } from '../../electron/services/frame/layoutEngine'
import { getFrameStyle, registerFrameStyle } from '../../electron/services/frame/registry'
import type { FrameStyle } from '../../shared/types'

// 测试夹具:一个"左边框 10% / 右边框 10% / 底边 20%"的不对称风格,
// 竖图版本换成"上边框 15% / 下边框 15%",方便验证横竖分派正确
const ASYM_STYLE: FrameStyle = {
  id: 'minimal-bar', // 重用已注册 id 避免加新的 union 成员
  name: '测试夹具 · 不对称',
  description: 'layoutEngine 单测专用',
  landscape: {
    borderTop: 0,
    borderBottom: 0.2,
    borderLeft: 0.1,
    borderRight: 0.1,
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
    slots: [
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.5 },
        fontSize: 0.02,
        align: 'center',
        fontFamily: 'mono',
      },
    ],
  },
  portrait: {
    borderTop: 0.15,
    borderBottom: 0.15,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
    slots: [
      {
        id: 'model',
        area: 'top',
        anchor: { x: 0.5, y: 0.5 },
        fontSize: 0.025,
        align: 'center',
        fontFamily: 'georgia',
      },
    ],
  },
  defaultOverrides: {
    showFields: {
      make: true,
      model: true,
      lens: true,
      aperture: true,
      shutter: true,
      iso: true,
      focalLength: true,
      dateTime: true,
      artist: false,
      location: false,
    },
  },
}

describe('computeFrameGeometry', () => {
  it('横图选 landscape 布局', () => {
    const g = computeFrameGeometry(4000, 3000, ASYM_STYLE)
    expect(g.orientation).toBe('landscape')
    expect(g.layout).toBe(ASYM_STYLE.landscape)
    expect(g.borderTopPx).toBe(0)
    expect(g.borderBottomPx).toBe(600) // 0.2 × minEdge(3000)
    expect(g.borderLeftPx).toBe(300) // 0.1 × 3000
    expect(g.borderRightPx).toBe(300)
    expect(g.canvasW).toBe(4000 + 600) // 4000 + 300 + 300
    expect(g.canvasH).toBe(3000 + 600) // 3000 + 0 + 600
    expect(g.imgOffsetX).toBe(300)
    expect(g.imgOffsetY).toBe(0)
  })

  it('竖图选 portrait 布局', () => {
    const g = computeFrameGeometry(3000, 4000, ASYM_STYLE)
    expect(g.orientation).toBe('portrait')
    expect(g.layout).toBe(ASYM_STYLE.portrait)
    expect(g.borderTopPx).toBe(450) // 0.15 × minEdge(3000)
    expect(g.borderBottomPx).toBe(450)
    expect(g.borderLeftPx).toBe(0)
    expect(g.borderRightPx).toBe(0)
    expect(g.canvasH).toBe(4000 + 900)
    expect(g.imgOffsetY).toBe(450)
  })

  it('方图走 landscape(square → landscape)', () => {
    const g = computeFrameGeometry(2000, 2000, ASYM_STYLE)
    expect(g.orientation).toBe('square')
    expect(g.layout).toBe(ASYM_STYLE.landscape) // 关键:square 不走 portrait
  })
})

describe('placeSlot · 5 种 area 定位', () => {
  const g = computeFrameGeometry(4000, 3000, ASYM_STYLE)
  // g.canvasW=4600, canvasH=3600, imgOffsetX=300, imgOffsetY=0

  it('bottom area 锚点 y=0.5 落在底边条的竖向中线', () => {
    const slot = ASYM_STYLE.landscape.slots[0]!
    const p = placeSlot(slot, g)
    // bottom area:y 从 imgOffsetY+imgH=3000 到 canvasH=3600
    // anchor.y=0.5 → y = 3000 + 0.5 * 600 = 3300
    expect(p.y).toBe(3300)
    // anchor.x=0.5 × canvasW(4600) = 2300
    expect(p.x).toBe(2300)
    // fontSize 0.02 × minEdge(3000) = 60
    expect(p.fontSizePx).toBe(60)
  })

  it('top area 锚点 y=0.5 落在顶边条竖向中线', () => {
    const gTop = computeFrameGeometry(3000, 4000, ASYM_STYLE)
    const slot = ASYM_STYLE.portrait.slots[0]!
    const p = placeSlot(slot, gTop)
    // top area:y 从 0 到 borderTopPx=450
    // anchor.y=0.5 → y = 225
    expect(p.y).toBe(225)
  })

  it('left / right / overlay 区域分别覆盖正确范围', () => {
    const gLR = computeFrameGeometry(4000, 3000, ASYM_STYLE)
    const leftSlot = { ...ASYM_STYLE.landscape.slots[0]!, area: 'left' as const, anchor: { x: 0.5, y: 0.5 } }
    const rightSlot = {
      ...ASYM_STYLE.landscape.slots[0]!,
      area: 'right' as const,
      anchor: { x: 0.5, y: 0.5 },
    }
    const overlaySlot = {
      ...ASYM_STYLE.landscape.slots[0]!,
      area: 'overlay' as const,
      anchor: { x: 0.9, y: 0.9 },
    }

    const pL = placeSlot(leftSlot, gLR)
    // left area 宽 = borderLeftPx = 300,x 0.5 → 150
    expect(pL.x).toBe(150)
    // left area 高 = canvasH = 3600,y 0.5 → 1800
    expect(pL.y).toBe(1800)

    const pR = placeSlot(rightSlot, gLR)
    // right area x0 = imgOffsetX + imgW = 300 + 4000 = 4300,宽 = borderRightPx = 300
    // x 0.5 → 4300 + 150 = 4450
    expect(pR.x).toBe(4450)

    const pO = placeSlot(overlaySlot, gLR)
    // overlay 覆盖原图 = (imgOffsetX..imgOffsetX+imgW, imgOffsetY..imgOffsetY+imgH)
    // x 0.9 → 300 + 0.9 × 4000 = 3900
    // y 0.9 → 0 + 0.9 × 3000 = 2700
    expect(pO.x).toBe(3900)
    expect(pO.y).toBe(2700)
  })
})

describe('frame registry', () => {
  it('listFrameStyles 至少含 minimal-bar(阶段 1 占位)', async () => {
    const { listFrameStyles } = await import('../../electron/services/frame/registry')
    const all = listFrameStyles()
    expect(all.some((s) => s.id === 'minimal-bar')).toBe(true)
  })

  it('getFrameStyle 对未注册 id 返回 null', () => {
    // 阶段 3 后 sx70-square 已注册 —— 用一个永远不会注册的伪 id 验证 null 契约
    // 类型断言:该 id 不在 FrameStyleId union 内,本测专门用于验证 null 返回
    expect(getFrameStyle('__never-registered__' as unknown as Parameters<typeof getFrameStyle>[0])).toBeNull()
  })

  it('registerFrameStyle 覆盖相同 id 返回旧值', () => {
    const old = getFrameStyle('minimal-bar')
    expect(old).toBeTruthy()
    const fake: FrameStyle = { ...old!, name: '__test_shadow__' }
    const prev = registerFrameStyle(fake)
    expect(prev?.name).toBe(old?.name)
    // 恢复原状,避免污染其它测试
    if (old) registerFrameStyle(old)
  })
})
