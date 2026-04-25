/**
 * grain:// URL 辅助
 * 所有 UI 中对本地文件的引用都必须走这里，不直接用 file://
 */
import type { Photo } from '../../shared/types'

/** 缩略图 URL — thumbPath 是绝对路径，取 basename 后经 grain://thumb/<file> 访问。
 *  附带 ?v=<dimsVerified 版本号> 做 cache bust：算法升级 → 版本号变 → 强制重新 fetch。
 *  没有 dimsVerified 时用 thumbPath 的 basename 哈希做降级 cache-bust（不同 thumb 基名本就不同）。
 */
export function thumbSrc(photo: Photo): string {
  if (!photo.thumbPath) return ''
  const basename = photo.thumbPath.split(/[/\\]/).pop() ?? ''
  const v = typeof photo.dimsVerified === 'number' ? photo.dimsVerified : photo.dimsVerified === true ? 1 : 0
  return `grain://thumb/${encodeURIComponent(basename)}?v=${v}`
}

/** 原始照片（通过 photo id 间接访问，main 进程做 id → path 解析） */
export function photoSrc(photo: Photo): string {
  return `grain://photo/${encodeURIComponent(photo.id)}`
}

/** 预览（服务端渲染后缓存的版本） */
export function previewSrc(photoId: string, version: number | string = ''): string {
  const v = version !== '' ? `?v=${encodeURIComponent(String(version))}` : ''
  return `grain://preview/${encodeURIComponent(photoId)}${v}`
}

/** 用户导入的 LUT 文件 */
export function lutSrc(filename: string): string {
  return `grain://lut/${encodeURIComponent(filename)}`
}
