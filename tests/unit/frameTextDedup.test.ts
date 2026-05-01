/**
 * frame-text 文本构建契约 · 2026-05-01 扩展
 *
 * 新增契约(本次用户反馈驱动):
 *   T1  excludeModelMake=true 时 · 参数行跳过 make/model(避免与 model slot 重复)
 *   T2  DEFAULT_FRAME_SHOW_FIELDS.dateTime 默认 false(用户反馈"拍摄时间不要了")
 *   T3  excludeModelMake=true + lensModel 存在 · 参数行以 lens 起头
 *   T4  excludeModelMake=false(默认)· 参数行仍含 make/model(向后兼容)
 *   T5  showFields.make=false · 即使 excludeModelMake=false 也不出 make(双重关闭)
 *
 * 蓝军反例:
 *   T6  模拟回退(把 excludeModelMake 忽略)· make/model 会重复 · 本测能抓住
 *   T7  模拟默认回退(dateTime=true 默认)· T2 会红
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_FRAME_SHOW_FIELDS, buildFrameParamLine } from '../../shared/frame-text'
import type { PhotoExif } from '../../shared/types'

const EXIF: PhotoExif = {
  make: 'SONY',
  model: 'ILCE-7SM3',
  lensModel: 'FE 70-200mm F2.8 GM OSS II',
  fNumber: 5.6,
  exposureTime: '1/125',
  iso: 200,
  focalLength: 200,
  dateTimeOriginal: '2025-02-07 12:37:13',
}

describe('buildFrameParamLine · 去重与默认值契约', () => {
  it('T1 excludeModelMake=true · 参数行不含 make/model · 首项为 lensModel', () => {
    const line = buildFrameParamLine(EXIF, DEFAULT_FRAME_SHOW_FIELDS, { excludeModelMake: true })
    expect(line).not.toContain('SONY')
    expect(line).not.toContain('ILCE-7SM3')
    // 首项应是镜头
    expect(line.startsWith('FE 70-200mm F2.8 GM OSS II')).toBe(true)
  })

  it('T2 DEFAULT_FRAME_SHOW_FIELDS.dateTime 默认 false(2026-05-01 用户反馈)', () => {
    expect(DEFAULT_FRAME_SHOW_FIELDS.dateTime).toBe(false)
  })

  it('T3 excludeModelMake=true · 完整参数按 lens/focal/f/shutter/iso 顺序', () => {
    const line = buildFrameParamLine(EXIF, DEFAULT_FRAME_SHOW_FIELDS, { excludeModelMake: true })
    // 顺序:lens → focalLength → fNumber → exposureTime → iso
    expect(line).toBe('FE 70-200mm F2.8 GM OSS II  ·  200mm  ·  f/5.6  ·  1/125s  ·  ISO 200')
  })

  it('T4 excludeModelMake=false(默认调用)· 参数行仍含 make/model(向后兼容)', () => {
    const line = buildFrameParamLine(EXIF, DEFAULT_FRAME_SHOW_FIELDS)
    expect(line).toContain('SONY')
    expect(line).toContain('ILCE-7SM3')
    expect(line.startsWith('SONY')).toBe(true)
  })

  it('T5 showFields.make=false · 即使 excludeModelMake=false 也不出 make(双重闭环)', () => {
    const line = buildFrameParamLine(
      EXIF,
      { ...DEFAULT_FRAME_SHOW_FIELDS, make: false },
      { excludeModelMake: false },
    )
    expect(line).not.toContain('SONY')
    // model 未关闭 · 仍含
    expect(line).toContain('ILCE-7SM3')
  })
})

describe('buildFrameParamLine · 蓝军反例', () => {
  it('T6 若未传 excludeModelMake(undefined)· make/model 确实会留在参数行(验证蓝军"遗漏传参"可被抓)', () => {
    // 等价于"有 model slot 的 layout 忘记传 excludeModelMake"的退化场景
    // 本测通过对比"默认调用"与"true 调用"的差异,证明去重契约可验证
    const lineDefault = buildFrameParamLine(EXIF, DEFAULT_FRAME_SHOW_FIELDS)
    const lineExcluded = buildFrameParamLine(EXIF, DEFAULT_FRAME_SHOW_FIELDS, {
      excludeModelMake: true,
    })
    // 两者必须实质不同(如果 excludeModelMake 被错误地忽略 · 两者会相同 · 本测红)
    expect(lineDefault).not.toBe(lineExcluded)
    expect(lineDefault.length).toBeGreaterThan(lineExcluded.length)
  })

  it('T7 若有人把 dateTime 默认改回 true · 本测真实红(确认 T2 有防护力)', () => {
    // 反向验证:直接读 DEFAULT_FRAME_SHOW_FIELDS 值 · 若某 PR 改回 true 本测会红
    expect(DEFAULT_FRAME_SHOW_FIELDS.dateTime).not.toBe(true)
  })
})
