/**
 * frame-text — 边框系统文本构建工具(两端共享)
 *
 * 为什么单独放 shared/(而不是塞进 frame-tokens.ts):
 *   - frame-tokens 定位是"设计值常量 + 基础几何函数(朝向/短边)"
 *   - 文本构建依赖 PhotoExif 类型,语义更重,单独文件可读性更好
 *   - 两端都要用:
 *     · 后端 electron/services/frame/typography.ts 里 truncateParamLineToWidth 基于它
 *     · 前端 src/components/frame/layouts/*.tsx 的 CSS 预览也基于它
 *
 * AGENTS.md 第 8 条:同一语义的逻辑(构建参数行)散布在 2 处即必须提取。
 * 历史教训:orientation 逻辑散布 6 处导致 3 次修复失败,本项目不再重蹈覆辙。
 */
import type { FrameStyleOverrides, PhotoExif } from './types.js'

/** buildFrameParamLine 可选行为 */
export interface FrameParamLineOptions {
  /**
   * 设 true 时:参数行跳过 make 和 model · 适合有独立 model slot 的 layout
   *
   * 用户反馈(2026-05-01):"上面已经显示了机型,下面详细参数就不要重复了"
   * 有独立 model slot 的 layout(Polaroid / Gallery / Editorial / Contax / Minimal
   * Bar 竖图 / Film Full Border)传 true,参数行只保留镜头 + 光学/感光参数,
   * 避免 "SONY ILCE-7SM3" 在主标题和参数行里重复出现。
   */
  excludeModelMake?: boolean
}

/**
 * 按 showFields 设置和 EXIF 字段构建参数行文本。
 *
 * 字段顺序固定:make / model / lens / focalLength / aperture / shutter / iso
 * 这个顺序符合摄影师读取习惯(相机 → 镜头 → 光学参数 → 感光参数)。
 * 日期 / 作者 / 地点走自己的 slot,不混入参数行。
 *
 * 分隔符 "  ·  "(中间点前后各两空格):
 *   - 比 " · " 更有呼吸感
 *   - 比 " | " 更少金属感,符合胶片摄影调性
 */
export function buildFrameParamLine(
  exif: PhotoExif,
  showFields: FrameStyleOverrides['showFields'],
  options: FrameParamLineOptions = {},
): string {
  const parts: string[] = []
  const excludeModelMake = options.excludeModelMake === true
  if (!excludeModelMake) {
    if (showFields.make && exif.make) parts.push(exif.make)
    if (showFields.model && exif.model) parts.push(exif.model)
  }
  if (showFields.lens && exif.lensModel) parts.push(exif.lensModel)
  if (showFields.focalLength && exif.focalLength) parts.push(`${exif.focalLength}mm`)
  if (showFields.aperture && exif.fNumber) parts.push(`f/${exif.fNumber}`)
  if (showFields.shutter && exif.exposureTime) parts.push(`${exif.exposureTime}s`)
  if (showFields.iso && exif.iso) parts.push(`ISO ${exif.iso}`)
  return parts.join('  ·  ')
}

/**
 * 默认 showFields。
 *
 * 2026-05-01 修订:dateTime 改为 false ——
 *   用户反馈"拍摄时间不要了"。EXIF 日期戳通常与照片本身的美学无关,
 *   且常带时区错漂(手机拍的标 UTC,相机拍的标本地),默认展示会造成困扰。
 *   需要的用户可通过 FrameStyleOverrides.showFields.dateTime=true 手动开启。
 */
export const DEFAULT_FRAME_SHOW_FIELDS: FrameStyleOverrides['showFields'] = {
  make: true,
  model: true,
  lens: true,
  aperture: true,
  shutter: true,
  iso: true,
  focalLength: true,
  dateTime: false,
  artist: false,
  location: false,
}
