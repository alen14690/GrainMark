/**
 * renderer — 新 frame 系统的统一渲染入口
 *
 * 阶段 2 实装:按 styleId 分派到 generators/*.ts
 *
 * 分派策略:
 *   - 每个风格在 generators/ 下有 `generate<Name>` export
 *   - 本文件维护 id → generator 映射(local Map,不复用 registry.ts,因为
 *     registry 里放的是 FrameStyle 数据,这里放的是 SVG 函数,语义不同)
 *   - 未映射的 id:回退到"尚未实装"错误(阶段 3 补完时移除)
 */
import type { FrameStyleId, FrameStyleOverrides } from '../../../shared/types.js'
import { type FrameSvgGenerator, renderWithGenerator } from './composite.js'
import { generateEditorialCaption, generateGallery } from './generators/bottomTextGenerator.js'
import { generateContaxLabel } from './generators/contaxLabel.js'
import { generateFilmFullBorder } from './generators/filmFullBorder.js'
import { generateGenericFallback } from './generators/genericFallback.js'
import { generateHairline } from './generators/hairline.js'
import { generateMinimalBar } from './generators/minimalBar.js'
import { generateNegativeStrip } from './generators/negativeStrip.js'
import { generatePointAndShootStamp } from './generators/pointAndShootStamp.js'
import { generatePolaroidClassic } from './generators/polaroidClassic.js'
import { generateSpineEdition } from './generators/spineEdition.js'
import { generateSx70Square } from './generators/sx70Square.js'
import { getFrameStyle } from './registry.js'

/**
 * 风格 id → SVG generator 映射
 *
 *   - 阶段 2(必保 8) + 阶段 3(可选 4) · 各自独立 generator
 *   - 阶段 5(14 个) · 暂用 genericFallback 跑通数据层契约 · 装饰层由阶段 5b 单独补
 */
const GENERATORS: Partial<Record<FrameStyleId, FrameSvgGenerator>> = {
  // 阶段 2 · 必保 8
  'minimal-bar': generateMinimalBar,
  'polaroid-classic': generatePolaroidClassic,
  'film-full-border': generateFilmFullBorder,
  'gallery-black': generateGallery,
  'gallery-white': generateGallery,
  'editorial-caption': generateEditorialCaption,
  'spine-edition': generateSpineEdition,
  hairline: generateHairline,
  // 阶段 3 · 可选 4
  'sx70-square': generateSx70Square,
  'negative-strip': generateNegativeStrip,
  'point-and-shoot-stamp': generatePointAndShootStamp,
  'contax-label': generateContaxLabel,
  // 阶段 5 · 14 个高级质感(generator 暂用 genericFallback · 装饰阶段 5b 补)
  'frosted-glass': generateGenericFallback,
  'glass-chip': generateGenericFallback,
  'oil-texture': generateGenericFallback,
  'watercolor-caption': generateGenericFallback,
  'ambient-glow': generateGenericFallback,
  'bokeh-pillar': generateGenericFallback,
  'cinema-scope': generateGenericFallback,
  'neon-edge': generateGenericFallback,
  'swiss-grid': generateGenericFallback,
  'contact-sheet': generateGenericFallback,
  'brushed-metal': generateGenericFallback,
  'medal-plate': generateGenericFallback,
  'floating-caption': generateGenericFallback,
  'stamp-corner': generateGenericFallback,
}

/**
 * 渲染 frame 到图片。
 *
 * @returns base64 data URL
 * @throws  - 未注册的 styleId
 *          - 尚未实装 generator 的 styleId
 *          - Sharp / EXIF 读取失败
 */
export async function renderFrame(
  photoPath: string,
  styleId: FrameStyleId,
  overrides: FrameStyleOverrides,
): Promise<string> {
  const style = getFrameStyle(styleId)
  if (!style) {
    throw new Error(`[frame:render] FrameStyleId "${styleId}" 未注册`)
  }
  const generator = GENERATORS[styleId]
  if (!generator) {
    throw new Error(
      `[frame:render] "${styleId}" 尚未实装 generator —— 阶段 2 逐个补,当前进度见 generators/index`,
    )
  }
  return renderWithGenerator(photoPath, style, overrides, generator)
}
