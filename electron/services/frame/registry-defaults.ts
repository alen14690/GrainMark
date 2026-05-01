/**
 * registry-defaults — 被 registry.ts 和 registry-stage5.ts 共享的默认常量
 *
 * 独立文件的唯一原因:打破 ESM 循环依赖 + TDZ
 *   - 老架构:registry-stage5.ts `import { DEFAULT_OVERRIDES } from './registry.js'`
 *           registry.ts        `import { STAGE5_STYLES } from './registry-stage5.js'`
 *           → 循环 → registry.ts 初始化时 stage5 被 evaluate · stage5 顶层字面量立刻访问
 *             DEFAULT_OVERRIDES · 此时 registry.ts 还没跑到 `export const DEFAULT_OVERRIDES`
 *             → TDZ `ReferenceError: Cannot access 'H' before initialization`
 *   - 新架构:两端都 import 此文件 · 无循环
 *
 * 该文件只放"纯字面量常量" · 不依赖其他 registry 文件 · 可被任何方向 import
 */
import type { FrameStyleOverrides } from '../../../shared/types.js'

/** 所有风格共用的初始字段可见性(2026-05-01 · dateTime=false 默认关闭) */
export const DEFAULT_OVERRIDES: FrameStyleOverrides = {
  showFields: {
    make: true,
    model: true,
    lens: true,
    aperture: true,
    shutter: true,
    iso: true,
    focalLength: true,
    dateTime: false, // 2026-05-01 用户反馈"拍摄时间不要了" · 默认关闭
    artist: false,
    location: false,
  },
  colorScheme: 'default',
}
