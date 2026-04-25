import fs from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import type { Photo } from '../../../shared/types.js'
import { readExif } from '../exif/reader.js'
import { makeThumbnail } from '../filter-engine/thumbnail.js'
import { logger } from '../logger/logger.js'
import { validateImageDimensions, validateImageFile } from '../security/imageGuard.js'
import { getPhotosTable } from './init.js'

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
      results.push(existing)
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

    // 维度守卫（EXIF 声明的维度）
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
      width: exif.width ?? 0,
      height: exif.height ?? 0,
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

export function listPhotos(): Photo[] {
  return getPhotosTable()
    .all()
    .sort((a, b) => b.importedAt - a.importedAt)
}
