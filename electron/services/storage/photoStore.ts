import fs from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import type { Photo } from '../../../shared/types.js'
import { readExif } from '../exif/reader.js'
import { detectDisplayDimensions, makeThumbnail } from '../filter-engine/thumbnail.js'
import { logger } from '../logger/logger.js'
import { validateImageDimensions, validateImageFile } from '../security/imageGuard.js'
import { getPhotosTable } from './init.js'

/** EXIF orientation 是否表示"传感器横拍 → 实际竖拍"（5..8 都需要交换宽高） */
function isRotatedOrientation(o?: number): boolean {
  return typeof o === 'number' && o >= 5 && o <= 8
}

async function resolveDisplayDimensions(
  filePath: string,
  exifWidth?: number,
  exifHeight?: number,
  exifOrientation?: number,
): Promise<{ width: number; height: number }> {
  // 优先：对内嵌 JPEG 做 sharp 探测（最准，已考虑 orientation）
  const detected = await detectDisplayDimensions(filePath)
  if (detected) return detected

  // 降级：用 EXIF 的原始尺寸 + orientation 旋转一下
  if (exifWidth && exifHeight) {
    if (isRotatedOrientation(exifOrientation)) {
      return { width: exifHeight, height: exifWidth }
    }
    return { width: exifWidth, height: exifHeight }
  }
  return { width: 0, height: 0 }
}

export async function importPhotos(paths: string[]): Promise<Photo[]> {
  const table = getPhotosTable()
  const results: Photo[] = []

  for (const p of paths) {
    if (!fs.existsSync(p)) {
      logger.warn('photo.import.missing', { path: p })
      continue
    }

    const existing = table.find((ph) => ph.path === p)
    if (existing) {
      // 已存在的照片：顺手做缩略图/尺寸的懒补（老数据 thumbPath 丢失 / 宽高为 0 等）
      const repaired = await repairPhotoRecord(existing)
      if (repaired !== existing) table.upsert(repaired)
      results.push(repaired)
      continue
    }

    // 安全守卫：魔数 + 尺寸 + 大小
    try {
      await validateImageFile(p)
    } catch (e) {
      logger.warn('photo.import.rejected', {
        path: p,
        reason: (e as Error).message,
      })
      continue
    }

    const stat = fs.statSync(p)
    const exif = await readExif(p)

    // 尺寸守卫（用 EXIF 原始宽高，不考虑方向 —— 这里是 pixel-count 守卫，不依赖方向）
    if (exif.width && exif.height) {
      try {
        validateImageDimensions(exif.width, exif.height)
      } catch (e) {
        logger.warn('photo.import.dimensions', {
          path: p,
          reason: (e as Error).message,
        })
        continue
      }
    }

    // 呈现尺寸（已应用 orientation）—— 用于 UI 的 aspect ratio
    const { width, height } = await resolveDisplayDimensions(p, exif.width, exif.height, exif.orientation)

    const thumbPath = await makeThumbnail(p, 360).catch((err) => {
      logger.warn('photo.thumb.failed', { path: p, err: (err as Error).message })
      return undefined
    })

    const photo: Photo = {
      id: nanoid(12),
      path: p,
      name: path.basename(p),
      format: path.extname(p).slice(1).toLowerCase(),
      sizeBytes: stat.size,
      width,
      height,
      thumbPath,
      exif,
      starred: false,
      rating: 0,
      tags: [],
      importedAt: Date.now(),
    }

    table.upsert(photo)
    results.push(photo)
  }
  return results
}

/**
 * 尝试修复一条旧 Photo 记录（懒补机制）：
 *   - thumbPath 缺失 / 文件不存在 → 重新 makeThumbnail
 *   - width/height 为 0（Pass 2.8 前导入的 RAW 常见）→ 重新 detect
 *
 * 返回：修复后的对象；未修复返回原对象（引用相等）
 */
export async function repairPhotoRecord(photo: Photo): Promise<Photo> {
  let next: Photo = photo
  let changed = false

  // 1. thumb 失效检测
  const thumbMissing = !photo.thumbPath || (photo.thumbPath && !fs.existsSync(photo.thumbPath))
  if (thumbMissing) {
    try {
      // 源文件还要在才谈得上重建
      if (fs.existsSync(photo.path)) {
        const thumbPath = await makeThumbnail(photo.path, 360)
        next = { ...next, thumbPath }
        changed = true
        logger.info('photo.thumb.repaired', { path: photo.path })
      }
    } catch (err) {
      logger.warn('photo.thumb.repair.failed', { path: photo.path, err: (err as Error).message })
    }
  }

  // 2. 尺寸缺失检测（width 或 height 为 0）
  if ((!photo.width || !photo.height) && fs.existsSync(photo.path)) {
    try {
      const dims = await resolveDisplayDimensions(
        photo.path,
        photo.exif.width,
        photo.exif.height,
        photo.exif.orientation,
      )
      if (dims.width > 0 && dims.height > 0) {
        next = { ...next, width: dims.width, height: dims.height }
        changed = true
        logger.info('photo.dims.repaired', {
          path: photo.path,
          width: dims.width,
          height: dims.height,
        })
      }
    } catch (err) {
      logger.warn('photo.dims.repair.failed', { path: photo.path, err: (err as Error).message })
    }
  }

  return changed ? next : photo
}

/**
 * listPhotos 对调用方是"当前快照"；修复发生在后台，不阻塞 UI 首屏
 * （修复后下次 listPhotos 调用即可见新值）
 *
 * 串行化：最多同时跑一个 repair batch，避免用户快速切换路由时并发多个后台任务
 * 造成 JsonTable 脏写、并发 makeThumbnail 写同一目标路径等 race。
 */
let repairInFlight: Promise<void> | null = null

export function listPhotos(): Photo[] {
  const all = getPhotosTable()
    .all()
    .sort((a, b) => b.importedAt - a.importedAt)

  // 后台异步懒补：每次 listPhotos 最多尝试修复前 N 张缺 thumb / 缺尺寸的记录
  // 控制在 N=8 避免首次进入图库时一次性吞吐大量 RAW；
  // 串行化保证任意时刻至多一个 batch 在运行
  if (!repairInFlight) {
    repairInFlight = repairMissingInBackground(all, 8).finally(() => {
      repairInFlight = null
    })
  }

  return all
}

/** 测试用：等待后台 repair batch 完成（若有） */
export function _waitRepairIdle(): Promise<void> {
  return repairInFlight ?? Promise.resolve()
}

/** 过滤出需要修复的条目，异步触发（fire-and-forget） */
async function repairMissingInBackground(photos: Photo[], limit: number): Promise<void> {
  const targets = photos.filter(
    (p) => !p.thumbPath || !fs.existsSync(p.thumbPath ?? '') || !p.width || !p.height,
  )
  if (targets.length === 0) return
  const table = getPhotosTable()
  let repaired = 0
  for (const photo of targets) {
    if (repaired >= limit) break
    try {
      const next = await repairPhotoRecord(photo)
      if (next !== photo) {
        table.upsert(next)
        repaired++
      }
    } catch {
      // repairPhotoRecord 内部已记日志
    }
  }
  if (repaired > 0) {
    logger.info('photo.repair.batch.done', { repaired })
  }
}
