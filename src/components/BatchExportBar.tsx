/**
 * BatchExportBar — Editor 内批量导出条
 *
 * 多图模式下选中 > 0 张照片时显示在 toolbar 第二行末尾。
 * 点击后逐张调用 photo:exportSingle 导出，显示进度。
 */
import { Download, FolderOpen, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { Photo } from '../../shared/types'
import { ipc } from '../lib/ipc'
import { useEditStore } from '../stores/editStore'
import { useAppStore } from '../stores/appStore'

interface BatchExportBarProps {
  /** 导出尺寸 */
  exportSize: 'original' | '4000' | '2400' | '1600'
  /** 导出质量 */
  quality?: number
}

export function BatchExportBar({ exportSize, quality = 92 }: BatchExportBarProps) {
  const selectedPhotoIds = useEditStore((s) => s.selectedPhotoIds)
  const activePhotoId = useEditStore((s) => s.activePhotoId)
  const photoStates = useEditStore((s) => s.photoStates)
  const allPhotos = useAppStore((s) => s.photos)

  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [lastOutputDir, setLastOutputDir] = useState<string | null>(null)

  // 包含当前照片 + 选中照片
  const exportIds = activePhotoId
    ? [activePhotoId, ...selectedPhotoIds.filter((id) => id !== activePhotoId)]
    : selectedPhotoIds

  if (exportIds.length <= 1) return null

  const handleBatchExport = async () => {
    setExporting(true)
    setProgress({ current: 0, total: exportIds.length })
    setLastOutputDir(null)

    // 先保存当前照片状态到 photoStates
    const store = useEditStore.getState()
    if (store.activePhotoId) {
      store.switchPhoto(store.activePhotoId) // 触发保存
    }

    let outputDir: string | null = null
    let successCount = 0

    // 让用户选择输出目录
    const dir = await ipc('dialog:selectDir')
    if (!dir) {
      setExporting(false)
      return
    }

    const longEdge = exportSize === 'original' ? null : Number(exportSize)

    for (let i = 0; i < exportIds.length; i++) {
      const photoId = exportIds[i]
      const photo = allPhotos.find((p) => p.id === photoId)
      if (!photo?.path) continue

      setProgress({ current: i + 1, total: exportIds.length })

      // 获取该照片的 pipeline（从 photoStates 或当前 store）
      const state = photoStates[photoId]
      const pipeline = state?.pipeline ?? (photoId === activePhotoId ? store.currentPipeline : null)
      const frameConfig = state?.frameConfig ?? (photoId === activePhotoId ? store.frameConfig : null)
      const watermarkConfig = state?.watermarkConfig ?? (photoId === activePhotoId ? store.watermarkConfig : null)

      try {
        // 构建导出参数
        const rotation = pipeline?.transform?.rotation ?? 0
        const flipH = pipeline?.transform?.flipH ?? false
        const flipV = pipeline?.transform?.flipV ?? false

        const result = await ipc('photo:exportSingle', photo.path, pipeline, {
          longEdge,
          quality,
          rotation,
          flipH,
          flipV,
          watermark: watermarkConfig ?? null,
          frame: frameConfig ? { styleId: frameConfig.styleId, overrides: frameConfig.overrides } : null,
        })

        if (result) {
          successCount++
          if (!outputDir) {
            // 从第一个导出结果提取目录
            const parts = (result as string).split('/')
            parts.pop()
            outputDir = parts.join('/')
          }
        }
      } catch (err) {
        console.error(`[batch-export] Failed for ${photo.name}:`, err)
      }
    }

    setExporting(false)
    setLastOutputDir(outputDir)

    if (successCount > 0) {
      window.alert(`批量导出完成：${successCount}/${exportIds.length} 张成功`)
    }
  }

  const handleOpenDir = async () => {
    if (lastOutputDir) {
      await ipc('dialog:selectDir') // fallback: 无 shell.openPath IPC 时提示
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="divider-metal-v mx-0.5 h-4" />
      {exporting ? (
        <div className="flex items-center gap-1.5 text-xxs text-fg-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-amber" />
          <span>
            导出中 {progress.current}/{progress.total}
          </span>
          <div className="w-16 h-1.5 rounded-full bg-fg-4/30 overflow-hidden">
            <div
              className="h-full bg-brand-amber rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={handleBatchExport}
            className="btn-primary btn-xs gap-1"
            title={`批量导出 ${exportIds.length} 张照片（各自参数独立）`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出全部 ({exportIds.length})</span>
          </button>
          {lastOutputDir && (
            <button
              type="button"
              onClick={handleOpenDir}
              className="btn-ghost btn-xs"
              title="打开输出目录"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  )
}
