/**
 * typography — SVG 文本工具(字体栈解析 + XML 转义 + 文字省略)
 *
 * 与旧 renderer.ts 的 `esc()` 同语义,但统一从 frame-tokens 的 FONT_STACK 取字体栈,
 * 避免散布(阶段 2 起所有 generator 都走本模块)。
 */
import { FONT_STACK } from '../../../shared/frame-tokens.js'
import type { FrameFontFamily, FrameStyleOverrides, PhotoExif } from '../../../shared/types.js'

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
 * 按用户 showFields 设置和 EXIF 字段构建参数行文本。
 *
 * 与老 `buildParamLine` 等价,但接收的 showFields 键与新 FrameStyleOverrides 对齐。
 * 允许的字段顺序固定:make / model / lens / focalLength / aperture / shutter / iso
 * (与绝大多数摄影师习惯一致)。日期 / 作者 / 地点单独走自己的 slot,不混到参数行。
 */
export function buildFrameParamLine(exif: PhotoExif, showFields: FrameStyleOverrides['showFields']): string {
  const parts: string[] = []
  if (showFields.make && exif.make) parts.push(exif.make)
  if (showFields.model && exif.model) parts.push(exif.model)
  if (showFields.lens && exif.lensModel) parts.push(exif.lensModel)
  if (showFields.focalLength && exif.focalLength) parts.push(`${exif.focalLength}mm`)
  if (showFields.aperture && exif.fNumber) parts.push(`f/${exif.fNumber}`)
  if (showFields.shutter && exif.exposureTime) parts.push(`${exif.exposureTime}s`)
  if (showFields.iso && exif.iso) parts.push(`ISO ${exif.iso}`)
  return parts.join('  ·  ')
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
