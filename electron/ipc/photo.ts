import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dialog } from 'electron'
import sharp from 'sharp'
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
  registerIpc(
    'photo:exportSingle',
    async (photoPath: unknown, pipeline: unknown, options: unknown) => {
      const srcPath = photoPath as string
      const pipe = pipeline as FilterPipeline | null
      const opts = options as {
        longEdge: number | null
        quality: number
        rotation?: number
        flipH?: boolean
        flipV?: boolean
        watermark?: import('../../shared/types.js').WatermarkStyle | null
        frame?: {
          styleId: import('../../shared/types.js').FrameStyleId
          overrides: import('../../shared/types.js').FrameStyleOverrides
        } | null
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
        const format = (
          ['png', 'tiff', 'tif'].includes(outExt) ? (outExt === 'tif' ? 'tiff' : outExt) : 'jpg'
        ) as 'jpg' | 'png' | 'tiff'

        // 读取原图
        const { buffer, sourceOrientation } = await resolvePreviewBuffer(srcPath)

        // 构建 resize 配置
        const resize = opts.longEdge ? { mode: 'long-edge' as const, value: opts.longEdge } : undefined

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
          const meta = await sharp(outBuffer).metadata()
          const imgW = meta.width ?? 1920
          const imgH = meta.height ?? 1080
          const cropX = Math.max(0, Math.round(pipe.crop.x * imgW))
          const cropY = Math.max(0, Math.round(pipe.crop.y * imgH))
          let cropW = Math.round(pipe.crop.width * imgW)
          let cropH = Math.round(pipe.crop.height * imgH)
          // 边界校验：防止 extract 越界
          cropW = Math.min(cropW, imgW - cropX)
          cropH = Math.min(cropH, imgH - cropY)
          if (cropW > 0 && cropH > 0) {
            outBuffer = await sharp(outBuffer)
              .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
              .jpeg({ quality: opts.quality })
              .toBuffer()
          }
        }

        // 应用旋转和翻转（在裁切之后）
        // 注意：手动旋转后必须清除 EXIF orientation，否则后续 Sharp 读取会双重旋转
        const needsTransform = (opts.rotation && opts.rotation !== 0) || opts.flipH || opts.flipV
        if (needsTransform) {
          let img = sharp(outBuffer)
          if (opts.rotation && opts.rotation !== 0) {
            img = img.rotate(opts.rotation)
          }
          if (opts.flipH) {
            img = img.flop()
          }
          if (opts.flipV) {
            img = img.flip()
          }
          // withMetadata({ orientation: 1 }) = "Top-left"（正常方向），清除旋转标记
          outBuffer = await img.withMetadata({ orientation: 1 }).jpeg({ quality: opts.quality }).toBuffer()
        }

        // 应用水印（在所有变换之后）
        if (opts.watermark) {
          const { renderWatermark } = await import('../services/watermark/renderer.js')
          const tmpPath = path.join(os.tmpdir(), `grainmark-export-${Date.now()}.jpg`)
          await fsp.writeFile(tmpPath, outBuffer)
          try {
            const wmDataUrl = await renderWatermark(tmpPath, opts.watermark)
            const wmBase64 = wmDataUrl.replace(/^data:image\/\w+;base64,/, '')
            outBuffer = Buffer.from(wmBase64, 'base64')
          } finally {
            await fsp.unlink(tmpPath).catch(() => {})
          }
        }

        // 应用边框（离屏 BrowserWindow 渲染，与前端预览 100% 一致）
        if (opts.frame?.styleId) {
          const { getFrameExporter } = await import('../services/frame/frameExporter.js')
          const { listPublicFrameStyles } = await import('../services/frame/registry.js')
          const { computeFrameGeometry } = await import('../services/frame/layoutEngine.js')
          const { nanoid } = await import('nanoid')

          const frameStyle = listPublicFrameStyles().find((s) => s.id === opts.frame!.styleId)
          if (!frameStyle) throw new Error(`未知边框风格: ${opts.frame.styleId}`)

          // 读取编辑后照片的实际尺寸
          const editedMeta = await sharp(outBuffer).metadata()
          const editedW = editedMeta.width ?? 1920
          const editedH = editedMeta.height ?? 1080

          // 计算带边框的 canvas 尺寸
          const geometry = computeFrameGeometry(editedW, editedH, frameStyle)

          // 将编辑后照片转为 dataURL
          const photoJpeg = await sharp(outBuffer).jpeg({ quality: 92 }).toBuffer()
          const photoDataUrl = `data:image/jpeg;base64,${photoJpeg.toString('base64')}`

          // 构建最小 Photo 对象（EXIF 从原图读）
          const exifData = await readExif(srcPath)
          const photoObj = {
            id: 'export-temp',
            name: path.basename(srcPath),
            path: srcPath,
            thumbPath: null,
            format: 'jpg' as const,
            width: editedW,
            height: editedH,
            size: outBuffer.length,
            sizeBytes: outBuffer.length,
            exif: exifData,
            importedAt: Date.now(),
            starred: false,
            rating: 0,
            tags: [] as string[],
          } as unknown as import('../../shared/types.js').Photo

          const exporter = getFrameExporter()
          outBuffer = await exporter.exportFrame({
            taskId: nanoid(),
            photoDataUrl,
            photo: photoObj,
            style: frameStyle,
            overrides: opts.frame.overrides,
            width: geometry.canvasW,
            height: geometry.canvasH,
          })
        }

        await fsp.writeFile(result.filePath, outBuffer)
        logger.info('photo.exportSingle.ok', { path: result.filePath, size: outBuffer.length })
        return result.filePath
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error('photo.exportSingle.failed', { path: srcPath, err: msg })
        throw new Error(`导出失败：${msg}`)
      }
    },
    {
      pathFields: ['args.0'],
    },
  )
}
