import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dialog } from 'electron'
import type { FilterPipeline } from '../../shared/types.js'
import { applyPipeline } from '../services/batch/pipelineSharp.js'
import { readExif } from '../services/exif/reader.js'
import { makeThumbnail } from '../services/filter-engine/thumbnail.js'
import { logger } from '../services/logger/logger.js'
import { resolvePreviewBuffer } from '../services/raw/index.js'
import { importPhotos, listPhotos, removePhotoRecords } from '../services/storage/photoStore.js'
import { registerIpc } from './safeRegister.js'

export function registerPhotoIpc() {
  // F1：导入接收任意路径数组 → 必须逐个过 PathGuard
  registerIpc('photo:import', async (paths: unknown) => importPhotos(paths as string[]), {
    pathFields: ['arg.*'],
  })
  registerIpc('photo:list', async () => listPhotos())
  registerIpc('photo:readExif', async (filePath: unknown) => readExif(filePath as string), {
    pathFields: ['arg'],
  })
  registerIpc(
    'photo:thumb',
    async (filePath: unknown, size: unknown) => makeThumbnail(filePath as string, size as number),
    { pathFields: ['args.0'] },
  )
  // 仅移除 JsonTable 记录 + 孤儿缩略图，绝不碰硬盘原图（参见 photoStore.removePhotoRecords）
  // 这里的参数是 id 数组，不涉及路径
  registerIpc('photo:remove', async (ids: unknown) => removePhotoRecords(ids as string[]))

  // 单图导出：原图 + pipeline CPU 渲染 → 全分辨率（或指定长边）→ 弹出保存对话框
  registerIpc('photo:exportSingle', async (
    photoPath: unknown,
    pipeline: unknown,
    options: unknown,
  ) => {
    const srcPath = photoPath as string
    const pipe = pipeline as FilterPipeline | null
    const opts = options as {
      longEdge: number | null
      quality: number
      rotation?: number
      flipH?: boolean
      flipV?: boolean
    }
    const baseName = path.parse(srcPath).name

    // 弹出保存对话框
    const result = await dialog.showSaveDialog({
      title: '导出照片',
      defaultPath: path.join(os.homedir(), 'Downloads', `${baseName}_edited.jpg`),
      filters: [
        { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
        { name: 'PNG', extensions: ['png'] },
        { name: 'TIFF', extensions: ['tiff', 'tif'] },
      ],
    })
    if (result.canceled || !result.filePath) return null

    try {
      const outExt = path.extname(result.filePath).toLowerCase().replace('.', '')
      const format = (['png', 'tiff', 'tif'].includes(outExt) ? (outExt === 'tif' ? 'tiff' : outExt) : 'jpg') as 'jpg' | 'png' | 'tiff'

      // 读取原图
      const { buffer, sourceOrientation } = await resolvePreviewBuffer(srcPath)

      // 构建 resize 配置
      const resize = opts.longEdge
        ? { mode: 'long-edge' as const, value: opts.longEdge }
        : undefined

      // CPU pipeline 全分辨率渲染
      let { buffer: outBuffer } = await applyPipeline({
        input: buffer,
        pipeline: pipe,
        sourceOrientation,
        format,
        quality: opts.quality,
        keepExif: true,
        resize,
      })

      // 应用裁切（在 pipeline 渲染之后、旋转之前）
      if (pipe?.crop) {
        const sharpMod = (await import('sharp')).default
        const meta = await sharpMod(outBuffer).metadata()
        const imgW = meta.width ?? 1920
        const imgH = meta.height ?? 1080
        const cropX = Math.round(pipe.crop.x * imgW)
        const cropY = Math.round(pipe.crop.y * imgH)
        const cropW = Math.round(pipe.crop.width * imgW)
        const cropH = Math.round(pipe.crop.height * imgH)
        if (cropW > 0 && cropH > 0) {
          outBuffer = await sharpMod(outBuffer)
            .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
            .toBuffer()
        }
      }

      // 应用旋转和翻转（在裁切之后）
      const needsTransform = (opts.rotation && opts.rotation !== 0) || opts.flipH || opts.flipV
      if (needsTransform) {
        const sharp = (await import('sharp')).default
        let img = sharp(outBuffer)
        if (opts.rotation && opts.rotation !== 0) {
          img = img.rotate(opts.rotation)
        }
        if (opts.flipH) {
          img = img.flop() // 水平翻转
        }
        if (opts.flipV) {
          img = img.flip() // 垂直翻转
        }
        outBuffer = await img.toBuffer()
      }

      await fsp.writeFile(result.filePath, outBuffer)
      logger.info('photo.exportSingle.ok', { path: result.filePath, size: outBuffer.length })
      return result.filePath
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('photo.exportSingle.failed', { path: srcPath, err: msg })
      throw new Error(`导出失败：${msg}`)
    }
  }, {
    pathFields: ['args.0'],
  })
}
