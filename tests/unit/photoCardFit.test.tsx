/**
 * PhotoCard.fit 行为契约测试（不依赖 DOM renderer，纯源码静态扫描）
 *
 * 回归守护：Library 图库期望 Lightroom 风格统一网格（所有卡片同比例），
 * 不希望未来有人把 fit='cover' 改回 contain 或把 Library 的 fit 删掉。
 *
 * 这里故意**不**用 @testing-library/react —— 项目尚未引入 DOM 测试栈，
 * 加一条纯源码契约即可防住回归。若未来引入 DOM renderer，可以升级为
 * 渲染后验证 `<img>` className 和 `<div>` aspectRatio。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('PhotoCard.tsx · fit prop 实现契约', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/design/components/PhotoCard.tsx'), 'utf8')

  it('fit 参数有两个取值：cover 和 contain', () => {
    expect(src).toMatch(/fit\?:\s*['"]cover['"]\s*\|\s*['"]contain['"]/)
  })

  it("fit 默认值必须是 'cover'（Lightroom 网格对齐是产品默认）", () => {
    expect(src).toMatch(/fit\s*=\s*['"]cover['"]/)
  })

  it('cover 模式必须走 object-cover；contain 模式必须走 object-contain', () => {
    expect(src).toContain('object-cover')
    expect(src).toContain('object-contain')
    // 三元判断 fit === 'cover' ? object-cover : object-contain
    expect(src).toMatch(/fit\s*===\s*['"]cover['"]\s*\?\s*['"]object-cover['"]\s*:\s*['"]object-contain['"]/)
  })

  it('cover 模式下 aspectRatio 不传时必须默认为 1（方形）', () => {
    // cover 分支：aspectRatio && aspectRatio > 0 ? aspectRatio : 1
    expect(src).toMatch(/aspectRatio\s*&&\s*aspectRatio\s*>\s*0\s*\?\s*aspectRatio\s*:\s*1/)
  })
})

describe('Library.tsx · 缩略图网格契约（防止回到"参差不齐"状态）', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/routes/Library.tsx'), 'utf8')

  it('Library 的 PhotoCard 必须显式传 fit="cover"', () => {
    expect(src).toMatch(/fit\s*=\s*["']cover["']/)
  })

  it('Library 的 PhotoCard 必须显式传 aspectRatio={1}（统一方形网格）', () => {
    expect(src).toMatch(/aspectRatio\s*=\s*\{\s*1\s*\}/)
  })

  it('Library 不允许回到"按 photo.width/height 动态算 aspectRatio"的老模式', () => {
    expect(src).not.toMatch(/aspectRatio\s*=\s*\{[^}]*photo\.width[^}]*photo\.height/)
  })
})
