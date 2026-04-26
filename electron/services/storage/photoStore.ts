import fs from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import type { Photo } from '../../../shared/types.js'
import { readExif } from '../exif/reader.js'
import { detectDisplayDimensions, makeThumbnail } from '../filter-engine/thumbnail.js'
import { logger } from '../logger/logger.js'
import { validateImageDimensions, validateImageFile } from '../security/imageGuard.js'
import { getPhotosTable, getThumbsDir } from './init.js'

/**
 * 尺寸校对算法当前版本号。
 *   v1（隐式）—— 最初无校对
 *   v2 —— 本次：引入 thumb 算法版本号 + 方向交换自动修复 + 统一对
 *          dimsVerified=true 的老数据也强制重新校对一次
 */
const DIMS_ALGO_VERSION = 2

/** 将 photo.dimsVerified 归一到数值版本号。boolean true 视作 v1 老标记 */
function normalizeDimsVersion(v: Photo['dimsVerified']): number {
  if (typeof v === 'number') return v
  if (v === true) return 1
  return 0
}

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
      // 新导入照片：dims 是用 detectDisplayDimensions 现算的，天然已校对到当前算法版本
      dimsVerified: DIMS_ALGO_VERSION,
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
 *   - width/height 方向与 thumb 方向不一致（老数据在 Pass 3b 前可能存了
 *     未旋转的 EXIF 尺寸，而 thumb 已旋正 → 卡片 aspectRatio 与 thumb 内容
 *     不匹配，视觉上照片被挤压）→ 以 thumb 的真实方向为准重算
 *
 * 返回：修复后的对象；未修复返回原对象（引用相等）
 */
export async function repairPhotoRecord(photo: Photo): Promise<Photo> {
  let next: Photo = photo
  let changed = false

  // 1. thumb 失效 / 陈旧检测：
  //    (a) thumbPath 丢失 or 文件不存在 → 重建
  //    (b) makeThumbnail 的 cache key 含算法版本号 + 源 mtime/size，老 thumb 的
  //        文件名与当前期望不一致时，重新调 makeThumbnail 就会拿到新路径。
  //        把 photo.thumbPath 指向它即可（老 thumb 文件成为孤儿，由磁盘清理另算）
  const thumbMissing = !photo.thumbPath || (photo.thumbPath && !fs.existsSync(photo.thumbPath))
  if (thumbMissing && fs.existsSync(photo.path)) {
    try {
      const thumbPath = await makeThumbnail(photo.path, 360)
      next = { ...next, thumbPath }
      changed = true
      logger.info('photo.thumb.repaired', { path: photo.path })
    } catch (err) {
      logger.warn('photo.thumb.repair.failed', { path: photo.path, err: (err as Error).message })
    }
  } else if (photo.thumbPath && fs.existsSync(photo.path)) {
    // thumb 存在，但可能是旧算法产物 —— 让 makeThumbnail 用当前算法 key 检查：
    //   若现有路径即为当前 key → 直接返回，无成本
    //   若 key 变了 → 重新渲染一张新 thumb，返回新路径
    try {
      const expectedThumbPath = await makeThumbnail(photo.path, 360)
      if (expectedThumbPath !== photo.thumbPath) {
        next = { ...next, thumbPath: expectedThumbPath }
        changed = true
        logger.info('photo.thumb.algo.upgraded', {
          path: photo.path,
          from: photo.thumbPath,
          to: expectedThumbPath,
        })
      }
    } catch (err) {
      logger.warn('photo.thumb.algo.check.failed', {
        path: photo.path,
        err: (err as Error).message,
      })
    }
  }

  // 2. 尺寸缺失检测（width 或 height 为 0）
  if ((!next.width || !next.height) && fs.existsSync(next.path)) {
    try {
      const dims = await resolveDisplayDimensions(
        next.path,
        next.exif.width,
        next.exif.height,
        next.exif.orientation,
      )
      if (dims.width > 0 && dims.height > 0) {
        next = { ...next, width: dims.width, height: dims.height }
        changed = true
        logger.info('photo.dims.repaired', {
          path: next.path,
          width: dims.width,
          height: dims.height,
        })
      }
    } catch (err) {
      logger.warn('photo.dims.repair.failed', { path: next.path, err: (err as Error).message })
    }
  }

  // 3. 尺寸方向一致性检测（已存在的老数据可能存了错方向的 width/height）
  //    判据：thumb 已旋正，其长宽比应与 photo.width/height 的长宽比一致（±5% 误差）
  //    不一致 → 以 thumb 为权威，交换 width/height
  const currentThumb = next.thumbPath
  if (next.width && next.height && currentThumb && fs.existsSync(currentThumb)) {
    try {
      const { default: sharpLib } = await import('sharp')
      const thumbMeta = await sharpLib(currentThumb).metadata()
      if (thumbMeta.width && thumbMeta.height) {
        const photoAspect = next.width / next.height
        const thumbAspect = thumbMeta.width / thumbMeta.height
        // 方向反了：横/竖显著不一致（一个 > 1 一个 < 1，且偏离超过 5%）
        const swapped =
          (photoAspect > 1.05 && thumbAspect < 0.95) || (photoAspect < 0.95 && thumbAspect > 1.05)
        if (swapped) {
          next = { ...next, width: next.height, height: next.width }
          changed = true
          logger.info('photo.dims.orientation.repaired', {
            path: next.path,
            before: { w: photo.width, h: photo.height },
            after: { w: next.width, h: next.height },
            thumbAspect,
          })
        }
      }
    } catch (err) {
      logger.warn('photo.dims.orientation.check.failed', {
        path: next.path,
        err: (err as Error).message,
      })
    }
  }

  return changed ? next : photo
}

/**
 * 移除导入记录（**仅删 JsonTable + 受控目录下的孤儿 thumb**，绝不碰硬盘原图文件）。
 *
 * 安全要点：
 *   - 只删 photos.json 里的记录
 *   - 若 thumbPath 位于 userData/thumbs/ 下且没有其他 photo 仍在引用，才物理删除 thumb 文件
 *   - thumbPath 若不在 userData/thumbs/（极端场景：老数据手动编辑过 JSON 指到外部路径），一概跳过不删
 *   - **绝不 rm photo.path**（原始照片，硬盘上的实体文件）
 *
 * 返回：{ removed: 成功删除的记录数, orphanedThumbs: 顺带清理的 thumb 文件数 }
 */
export function removePhotoRecords(ids: string[]): { removed: number; orphanedThumbs: number } {
  if (ids.length === 0) return { removed: 0, orphanedThumbs: 0 }
  const table = getPhotosTable()

  // Step 1: 找出待删记录 + 其引用的 thumbPath
  const idSet = new Set(ids)
  const toRemove = table.all().filter((p) => idSet.has(p.id))
  if (toRemove.length === 0) return { removed: 0, orphanedThumbs: 0 }

  // Step 2: 删记录
  for (const p of toRemove) {
    table.delete(p.id)
  }

  // Step 3: 计算哪些 thumb 成了孤儿（所有引用该 thumbPath 的 photo 都被删了）
  //         仅在 thumb 位于 userData/thumbs/ 下时才尝试 unlink
  const thumbsDir = path.resolve(getThumbsDir())
  const stillReferenced = new Set(
    table
      .all()
      .map((p) => p.thumbPath)
      .filter((v): v is string => typeof v === 'string' && v.length > 0),
  )
  let orphanedThumbs = 0
  for (const p of toRemove) {
    if (!p.thumbPath) continue
    if (stillReferenced.has(p.thumbPath)) continue // 还有其他 photo 在引用
    try {
      // 安全：用 path.resolve 消除 ../ 后再判断是否处于 thumbsDir 之内
      const resolved = path.resolve(p.thumbPath)
      if (!resolved.startsWith(`${thumbsDir}${path.sep}`) && resolved !== thumbsDir) {
        // 不在受控目录 → 跳过（防止误删用户其它目录的文件）
        logger.warn('photo.remove.thumb.skip.out-of-dir', {
          id: p.id,
          thumbPath: p.thumbPath,
        })
        continue
      }
      if (fs.existsSync(resolved)) {
        fs.unlinkSync(resolved)
        orphanedThumbs++
      }
    } catch (err) {
      logger.warn('photo.remove.thumb.cleanup.failed', {
        id: p.id,
        err: (err as Error).message,
      })
    }
  }

  logger.info('photo.remove.batch.done', {
    requested: ids.length,
    removed: toRemove.length,
    orphanedThumbs,
  })
  return { removed: toRemove.length, orphanedThumbs }
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
    (p) =>
      !p.thumbPath ||
      !fs.existsSync(p.thumbPath ?? '') ||
      !p.width ||
      !p.height ||
      // 方向可能错的老数据：thumb + 尺寸都在但未用当前算法校对 → 重新跑一次
      (p.thumbPath && p.width && p.height && normalizeDimsVersion(p.dimsVerified) < DIMS_ALGO_VERSION),
  )
  if (targets.length === 0) return
  const table = getPhotosTable()
  let repaired = 0
  for (const photo of targets) {
    if (repaired >= limit) break
    try {
      const next = await repairPhotoRecord(photo)
      // 校对过的标记版本号，避免下次 listPhotos 再次 O(N) 扫描
      const needsFlag = normalizeDimsVersion(next.dimsVerified) < DIMS_ALGO_VERSION
      const withFlag: Photo = needsFlag ? { ...next, dimsVerified: DIMS_ALGO_VERSION } : next
      if (withFlag !== photo) {
        table.upsert(withFlag)
        if (next !== photo) repaired++
      }
    } catch {
      // repairPhotoRecord 内部已记日志
    }
  }
  if (repaired > 0) {
    logger.info('photo.repair.batch.done', { repaired })
    // 通知所有 BrowserWindow 重新拉 photo 列表，让老数据一次性在 UI 自愈
    try {
      // 动态 import 避免 photoStore 成为 electron 启动主链路的强依赖
      const { BrowserWindow } = await import('electron')
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send('photo:repaired')
      }
    } catch (err) {
      logger.warn('photo.repair.notify.failed', { err: (err as Error).message })
    }
  }
}
