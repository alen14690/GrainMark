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
import { type FrameSvgGenerator, renderWithBuffer, renderWithGenerator } from './composite.js'
import { generateEditorialCaption, generateGallery } from './generators/bottomTextGenerator.js'
import { generateContaxLabel } from './generators/contaxLabel.js'
import { generateFilmFullBorder } from './generators/filmFullBorder.js'
import { generateHairline } from './generators/hairline.js'
import { generateMinimalBar } from './generators/minimalBar.js'
import { generateNegativeStrip } from './generators/negativeStrip.js'
import { generatePointAndShootStamp } from './generators/pointAndShootStamp.js'
import { generatePolaroidClassic } from './generators/polaroidClassic.js'
import { generateSpineEdition } from './generators/spineEdition.js'
import { STAGE5_GENERATORS } from './generators/stage5Generators.js'
import { generateSx70Square } from './generators/sx70Square.js'
import { getFrameStyle } from './registry.js'

/**
 * 风格 id → SVG generator 映射
 *
 *   - 阶段 2(必保 8) + 阶段 3(可选 4) · 各自独立 generator · 保留兼容
 *   - 阶段 5(14 个) · 每个风格独立装饰几何 · 走 stage5Generators
 */
const GENERATORS: Partial<Record<FrameStyleId, FrameSvgGenerator>> = {
  // 阶段 2 · 必保 8(classic 组 · UI 不展示 · 保留供老测试与兼容)
  'minimal-bar': generateMinimalBar,
  'polaroid-classic': generatePolaroidClassic,
  'film-full-border': generateFilmFullBorder,
  'gallery-black': generateGallery,
  'gallery-white': generateGallery,
  'editorial-caption': generateEditorialCaption,
  'spine-edition': generateSpineEdition,
  hairline: generateHairline,
  // 阶段 3 · 可选 4(classic 组 · 同上)
  'sx70-square': generateSx70Square,
  'negative-strip': generateNegativeStrip,
  'point-and-shoot-stamp': generatePointAndShootStamp,
  'contax-label': generateContaxLabel,
  // 阶段 5 · 14 个高级质感 · 每个风格独立装饰几何
  ...STAGE5_GENERATORS,
}

/**
 * 渲染 frame 到图片。
 *
 * @param photoPath 图片路径（用于读取像素数据）
 * @param styleId 边框风格 ID
 * @param overrides 用户覆盖项
 * @param exifSourcePath 可选，EXIF 源路径。导出流程中图片经过 pipeline 处理后 EXIF 丢失，
 *                       需要从原图路径读取 EXIF 来生成参数行文本。
 * @returns base64 data URL
 */
export async function renderFrame(
  photoPath: string,
  styleId: FrameStyleId,
  overrides: FrameStyleOverrides,
  exifSourcePath?: string,
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
  return renderWithGenerator(photoPath, style, overrides, generator, exifSourcePath)
}

/**
 * 从 Buffer 渲染边框 —— 导出流程专用。
 *
 * 与 renderFrame 的区别：直接接收图片 buffer（已完成 pipeline + 裁切 + 旋转），
 * 无需写临时文件，避免 EXIF orientation / 格式编码的所有中间问题。
 *
 * @param imageBuffer 已处理完毕的图片 buffer（JPEG/PNG 编码）
 * @param styleId 边框风格
 * @param overrides 用户覆盖项
 * @param exifSourcePath 原图路径，用于读取 EXIF 参数信息
 * @returns 带边框的图片 buffer（JPEG 编码）
 */
export async function renderFrameFromBuffer(
  imageBuffer: Buffer,
  styleId: FrameStyleId,
  overrides: FrameStyleOverrides,
  exifSourcePath: string,
): Promise<Buffer> {
  const style = getFrameStyle(styleId)
  if (!style) {
    throw new Error(`[frame:render] FrameStyleId "${styleId}" 未注册`)
  }
  const generator = GENERATORS[styleId]
  if (!generator) {
    throw new Error(`[frame:render] "${styleId}" 尚未实装 generator`)
  }
  return renderWithBuffer(imageBuffer, style, overrides, generator, exifSourcePath)
}
