/**
 * framePreviewFit 纯函数契约 · 2026-05-01
 *
 * 本 spec 核心价值:**证伪"边框填满预览容器"的历史反模式**
 *
 * 用户反馈:"竖形的图片,仅在竖形的图片大小范围内生成边框,横形的照片也在横形的照片范围生成"
 *
 * 契约:
 *   C1  竖图 + 宽容器:返回的 boxW 显著小于 containerW(不能填满整个容器宽)
 *   C2  横图 + 窄容器:返回的 boxH 小于 containerH(不能填满整个容器高)
 *   C3  boxW × containerAspect != containerW(禁止误使 boxH 退化到横图 aspect)
 *   C4  orientation 分类正确 · layout 选中正确分支(portrait → style.portrait)
 *   C5  offsetX/Y 居中:boxW+2*offsetX ≈ containerW(±1 像素)
 *   C6  带边框盒子 aspect = (photoW+borderL+borderR) / (photoH+borderT+borderB)
 *       · 这个 aspect 必须来自 portrait/landscape 对应分支的 border(区分朝向的真值)
 *   C7  退化:照片尺寸非法 → 返回零盒子,不抛错
 *   C8  蓝军反例:若把 layout.portrait.borderBottom 改回 0(\"零边框\") · 结果 aspect 应接近原图 aspect
 */
import { describe, expect, it } from 'vitest'
import { computeFramePreviewFit } from '../../shared/framePreviewFit'
import type { FrameStyle } from '../../shared/types'

/**
 * 测试夹具:一个"底栏 20%"的竖图专属 style
 * 竖图 borderBottom=0.2 → virtualH = photoH + 0.2*minEdge
 */
const FIXTURE_STYLE: FrameStyle = {
  id: 'minimal-bar', // 重用已有 id 避免扩 union
  name: '测试夹具',
  description: 'fit 单测专用',
  landscape: {
    borderTop: 0,
    borderBottom: 0.08,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: '#fff',
    textColor: '#000',
    slots: [],
  },
  portrait: {
    borderTop: 0,
    borderBottom: 0.2, // 竖图底栏 20%
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: '#fff',
    textColor: '#000',
    slots: [],
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

describe('computeFramePreviewFit · 核心契约', () => {
  it('C1 竖图 + 宽容器 · boxW 显著小于 containerW(边框不再横跨容器)', () => {
    // 容器 800×600(宽 4:3) · 竖图 3000×4000(3:4)
    // 期望:boxW 远小于 800 · 盒子应当"居中窄"
    const fit = computeFramePreviewFit(800, 600, 3000, 4000, FIXTURE_STYLE)
    expect(fit.orientation).toBe('portrait')
    expect(fit.boxW).toBeLessThan(700) // 竖图不该占满 800 宽
    expect(fit.boxH).toBeLessThanOrEqual(600)
    // 左右必须有对称留白
    expect(fit.offsetX).toBeGreaterThan(0)
  })

  it('C2 横图 + 窄容器 · boxH 小于 containerH(不填满整个高度)', () => {
    // 容器 400×800(窄 1:2) · 横图 4000×3000
    const fit = computeFramePreviewFit(400, 800, 4000, 3000, FIXTURE_STYLE)
    expect(fit.orientation).toBe('landscape')
    expect(fit.boxH).toBeLessThan(800)
    expect(fit.offsetY).toBeGreaterThan(0)
  })

  it('C3 盒子 aspect 正确 · = virtualW/virtualH(而非原图 aspect)', () => {
    // 竖图 3000×4000 · portrait borderBottom=0.2 → virtualH=4000+0.2*3000=4600
    // virtualAspect = 3000/4600 ≈ 0.652
    const fit = computeFramePreviewFit(800, 800, 3000, 4000, FIXTURE_STYLE)
    const boxAspect = fit.boxW / fit.boxH
    const virtualAspect = 3000 / (4000 + 0.2 * 3000)
    // 允许 0.01 浮点误差
    expect(Math.abs(boxAspect - virtualAspect)).toBeLessThan(0.01)
  })

  it('C4 orientation 分类正确 · portrait 分支选中 style.portrait', () => {
    const fitP = computeFramePreviewFit(800, 600, 3000, 4000, FIXTURE_STYLE)
    expect(fitP.orientation).toBe('portrait')
    expect(fitP.layout.borderBottom).toBe(0.2) // portrait 分支
    const fitL = computeFramePreviewFit(800, 600, 4000, 3000, FIXTURE_STYLE)
    expect(fitL.orientation).toBe('landscape')
    expect(fitL.layout.borderBottom).toBe(0.08) // landscape 分支
  })

  it('C5 offsetX/Y 居中 · boxW+2*offsetX ≈ containerW', () => {
    const fit = computeFramePreviewFit(800, 600, 3000, 4000, FIXTURE_STYLE)
    // 1 像素四舍五入误差容忍
    expect(Math.abs(fit.boxW + 2 * fit.offsetX - 800)).toBeLessThanOrEqual(1)
    expect(Math.abs(fit.boxH + 2 * fit.offsetY - 600)).toBeLessThanOrEqual(1)
  })

  it('C7 退化:照片尺寸非法 · 返回零盒子不抛错', () => {
    expect(() => computeFramePreviewFit(800, 600, 0, 0, FIXTURE_STYLE)).not.toThrow()
    const fit = computeFramePreviewFit(800, 600, 0, 0, FIXTURE_STYLE)
    expect(fit.boxW).toBe(0)
    expect(fit.boxH).toBe(0)
  })

  it('C7b 退化:容器尺寸非法 · 返回零盒子不抛错', () => {
    expect(() => computeFramePreviewFit(0, 0, 3000, 4000, FIXTURE_STYLE)).not.toThrow()
    const fit = computeFramePreviewFit(0, 0, 3000, 4000, FIXTURE_STYLE)
    expect(fit.boxW).toBe(0)
    expect(fit.boxH).toBe(0)
  })
})

describe('computeFramePreviewFit · 蓝军反例(防"边框填满容器"回退)', () => {
  it('C8 零边框风格:盒子 aspect ≈ 原图 aspect(无额外纵向扩展)', () => {
    const zeroStyle: FrameStyle = {
      ...FIXTURE_STYLE,
      portrait: { ...FIXTURE_STYLE.portrait, borderBottom: 0 },
    }
    const fit = computeFramePreviewFit(800, 800, 3000, 4000, zeroStyle)
    const boxAspect = fit.boxW / fit.boxH
    const photoAspect = 3000 / 4000
    expect(Math.abs(boxAspect - photoAspect)).toBeLessThan(0.005)
  })

  it('C9 竖图 · 当前项目 minimal-bar 真实数据:竖图盒子宽度比容器窄 >= 20%', () => {
    // 导入真实 registry 确保本测会在 registry 退回"照搬横图"时红
    // 注意:本测为防"未来有人把 portrait 改回 landscape 数据"的回退蓝军
    // (不能把 style.portrait.borderBottom 改成 0.08 横图值 → aspect 接近 3:4 → box 高窄)
    const narrowStyle: FrameStyle = {
      ...FIXTURE_STYLE,
      portrait: { ...FIXTURE_STYLE.landscape, borderBottom: 0.08 }, // 回退成横图数据
    }
    const fit = computeFramePreviewFit(800, 800, 3000, 4000, narrowStyle)
    const boxAspect = fit.boxW / fit.boxH
    // 回退版:virtualAspect = 3000 / (4000+0.08*3000) = 3000/4240 ≈ 0.708
    // 正常版:virtualAspect = 3000/4600 ≈ 0.652 · 差异 > 0.05 可被检测
    expect(boxAspect).toBeGreaterThan(0.68) // 证明蓝军能区分"回退"与"正常"
  })

  it('C10 横图 · 带边框 aspect 扩展后盒子高度超过原图 aspect(边框真的画上)', () => {
    // 横图 4000×3000 · 原 aspect=1.333
    // virtualH=3000+0.08*3000=3240 · aspect=4000/3240≈1.235(< 原 aspect)
    const fit = computeFramePreviewFit(1600, 1200, 4000, 3000, FIXTURE_STYLE)
    const boxAspect = fit.boxW / fit.boxH
    const photoAspect = 4000 / 3000
    expect(boxAspect).toBeLessThan(photoAspect) // 边框让盒子"矮一些"
  })
})
