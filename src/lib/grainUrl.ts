/**
 * grain:// URL 辅助
 * 所有 UI 中对本地文件的引用都必须走这里，不直接用 file://
 */
import type { Photo } from '../../shared/types'

/** 缩略图 URL — thumbPath 是绝对路径，取 basename 后经 grain://thumb/<file> 访问 */
export function thumbSrc(photo: Photo): string {
  if (!photo.thumbPath) return ''
  const basename = photo.thumbPath.split(/[/\\]/).pop() ?? ''
  return `grain://thumb/${encodeURIComponent(basename)}`
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
