import type { ComponentType } from 'react'
/**
 * FrameStyleRegistry — 前端 FrameStyleId → React 布局组件的注册表
 *
 * 与 `electron/services/frame/registry.ts`(后端 id → Sharp generator)并行:
 *   - 后端负责"渲染真实带边框的 JPEG"
 *   - 前端(本文件)负责"实时 CSS 预览,所见即所得"
 *
 * 阶段 1:骨架期,只注册占位组件,保证 UI 切换风格时 DOM 会真的替换(彻底解决
 * "切换无效果"的历史 bug —— 见 artifact/design/frame-system-2026-05-01.md §1.1)。
 *
 * 阶段 2 起:每个风格实装一个 React 组件,读取 FrameLayout 数据绘制 CSS 边框。
 */
import type { FrameStyle, FrameStyleId, FrameStyleOverrides } from '../../../shared/types'
import type { Photo } from '../../../shared/types'
import { BottomTextLayout } from './layouts/BottomTextLayout'
import { FilmFullBorderLayout } from './layouts/FilmFullBorderLayout'
import { MinimalBarLayout } from './layouts/MinimalBarLayout'
import { PlaceholderFrameLayout } from './layouts/PlaceholderFrameLayout'
import { PolaroidClassicLayout } from './layouts/PolaroidClassicLayout'

/** 每个 layout 组件接收的标准 props */
export interface FrameLayoutProps {
  /** 要预览的照片(带 thumbPath / exif) */
  photo: Photo
  /** 当前风格数据 */
  style: FrameStyle
  /** 用户覆盖项(字段可见性 / Logo / 颜色方案) */
  overrides: FrameStyleOverrides
  /**
   * 预览容器宽度(CSS 像素) —— 让布局组件按"等价 minEdge"计算边框/字号,
   * 与后端 generator 的比例逻辑保持一致(AGENTS.md 第 8 条:横竖换算单源)
   */
  containerWidth: number
  /** 容器高度 */
  containerHeight: number
}

const LAYOUT_REGISTRY: Partial<Record<FrameStyleId, ComponentType<FrameLayoutProps>>> = {
  // 阶段 2:实装风格
  'minimal-bar': MinimalBarLayout,
  'polaroid-classic': PolaroidClassicLayout,
  'film-full-border': FilmFullBorderLayout,
  // Gallery 兄弟风格共用 BottomTextLayout(layout 数据分 black/white 两份)
  'gallery-black': BottomTextLayout,
  'gallery-white': BottomTextLayout,
  // 阶段 2 后续:editorial-caption / spine-edition / hairline
  // 未实装时 FramePreviewHost 会走"尚未实装"友好 fallback
}

/** 占位布局导出:给未注册的风格调用方手动 fallback 用(可选) */
export { PlaceholderFrameLayout }

/**
 * 查前端布局组件。
 * 未注册的返回 null —— 调用方应当展示友好的"该风格尚未实装"占位,不要崩。
 */
export function getFrameLayoutComponent(styleId: FrameStyleId): ComponentType<FrameLayoutProps> | null {
  return LAYOUT_REGISTRY[styleId] ?? null
}
