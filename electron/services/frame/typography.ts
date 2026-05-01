import { buildFrameParamLine } from '../../../shared/frame-text.js'
/**
 * typography — SVG 文本工具(字体栈解析 + XML 转义 + 文字省略)
 *
 * 2026-05-01 阶段 2:
 *   - `buildFrameParamLine` 已移到 `shared/frame-text.ts`(两端共享,避免散布)
 *   - 本文件只保留 electron 侧专属工具(escSvgText / resolveSvgFontStack /
 *     truncateParamLineToWidth —— 文字宽度估算依赖 SVG 等宽字体假设,是 SVG 专属)
 */
import { FONT_STACK } from '../../../shared/frame-tokens.js'
import type { FrameFontFamily, FrameStyleOverrides, PhotoExif } from '../../../shared/types.js'

// re-export 给 composite / generator 方便 import 单一来源
export { buildFrameParamLine } from '../../../shared/frame-text.js'

/** XML / SVG 文本转义(防止 EXIF 注入 SVG 结构) */
export function escSvgText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 按语义字体族解析到 Sharp 可用的 SVG 字体栈字符串 */
export function resolveSvgFontStack(family: FrameFontFamily): string {
  return FONT_STACK[family].svg
}

/**
 * 按优先级省略字段,直到文本宽度估算值 < maxWidthPx。
 *
 * 字体宽度估算:等宽字按 `fontSize * 0.6`,其它字体按 `fontSize * 0.55`。
 * 优先级(先丢):lens → shutter → aperture → iso → focalLength → model → make
 * (丢参数保留机型,保证"至少还认识是哪台相机")
 */
export function truncateParamLineToWidth(
  exif: PhotoExif,
  showFields: FrameStyleOverrides['showFields'],
  maxWidthPx: number,
  fontSizePx: number,
  family: FrameFontFamily,
): string {
  const charWidth =
    family === 'mono' || family === 'courier' || family === 'typewriter'
      ? fontSizePx * 0.6
      : fontSizePx * 0.55

  // 按优先级裁剪 —— 逐个丢字段直到长度够
  const priorityToDrop: (keyof FrameStyleOverrides['showFields'])[] = [
    'lens',
    'shutter',
    'aperture',
    'iso',
    'focalLength',
    'model',
    'make',
  ]
  const effective = { ...showFields }
  for (let i = 0; i < 16; i++) {
    const line = buildFrameParamLine(exif, effective)
    if (line.length * charWidth <= maxWidthPx) return line
    const toDrop = priorityToDrop.find((k) => effective[k])
    if (!toDrop) return line // 所有字段都丢完了还是太长(不可能但兜底)
    effective[toDrop] = false
  }
  return buildFrameParamLine(exif, effective)
}
