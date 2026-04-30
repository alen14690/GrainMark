/**
 * Library — 图库
 *
 * 卤化银风格：EXIF 徽章统计 + PhotoCard（含胶片齿孔装饰）
 */
import { Download, ImageIcon, Trash2, Upload } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState, PhotoCard, ValueBadge } from '../design'
import { thumbSrc } from '../lib/grainUrl'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'

export default function Library() {
  const photos = useAppStore((s) => s.photos)
  const selected = useAppStore((s) => s.selectedPhotoIds)
  const toggleSelect = useAppStore((s) => s.toggleSelectPhoto)
  const importPhotos = useAppStore((s) => s.importPhotos)
  const removePhotos = useAppStore((s) => s.removePhotos)
  const navigate = useNavigate()

  const stats = useMemo(
    () => ({
      total: photos.length,
      starred: photos.filter((p) => p.starred).length,
      cameras: new Set(photos.map((p) => p.exif.model).filter(Boolean)).size,
    }),
    [photos],
  )

  const handleImport = async () => {
    const paths = await ipc('dialog:selectFiles', { multi: true })
    if (paths.length > 0) await importPhotos(paths)
  }

  /**
   * 仅从图库移除导入记录（**不会删除硬盘上的原图文件**）。
   * 二次确认后调用 `removePhotos(selected)`，主进程只删 photos.json 记录 +
   * userData/thumbs 下的孤儿缩略图。
   */
  const handleRemoveSelected = async () => {
    if (selected.length === 0) return
    const msg =
      selected.length === 1
        ? '从图库移除此照片的导入记录？\n\n（不会删除硬盘上的原图文件）'
        : `从图库移除 ${selected.length} 张照片的导入记录？\n\n（不会删除硬盘上的原图文件）`
    if (!window.confirm(msg)) return
    await removePhotos(selected)
  }

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={<ImageIcon className="w-10 h-10" strokeWidth={1.5} />}
        title="图库空空如也"
        description={
          <>
            导入 <span className="font-mono text-fg-1">JPEG / PNG / TIFF / HEIC / RAW</span> 开始你的后期之旅
            <br />
            支持 Nikon NEF · Canon CR2/CR3 · Sony ARW · Fuji RAF · Adobe DNG 等
          </>
        }
        action={
          <button type="button" onClick={handleImport} className="btn-primary">
            <Upload className="w-4 h-4" strokeWidth={2} />
            导入照片
          </button>
        }
      />
    )
  }

  return (
    <div className="p-6 animate-fade-in">
      {/* Stats */}
      <div className="flex items-center gap-2 mb-5">
        <ValueBadge label="TOTAL" value={stats.total} />
        <ValueBadge label="STARRED" value={stats.starred} />
        <ValueBadge label="CAMERAS" value={stats.cameras} />
        {selected.length > 0 && <ValueBadge label="SELECTED" value={selected.length} variant="amber" />}

        {/* 选中态下出现操作按钮 */}
        {selected.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/batch')}
              title="将选中照片批量导出"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                text-xs font-medium
                bg-brand-amber/10 hover:bg-brand-amber/20
                border border-brand-amber/30 hover:border-brand-amber/50
                text-brand-amber
                transition-all duration-fast ease-liquid"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={2} />
              <span>批量导出 {selected.length} 张</span>
            </button>
            <button
              type="button"
              onClick={handleRemoveSelected}
              title="从图库移除选中照片的导入记录；不会删除硬盘上的原文件"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                text-xs font-medium
                bg-white/[0.04] hover:bg-red-500/15
                border border-white/10 hover:border-red-400/50
                text-fg-2 hover:text-red-300
                transition-all duration-fast ease-liquid"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
              <span>移除 {selected.length} 张（仅记录）</span>
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
        {photos.map((photo) => {
          const cameraLabel = [
            photo.exif.model,
            photo.exif.focalLength ? `${photo.exif.focalLength}mm` : '',
            photo.exif.fNumber ? `f/${photo.exif.fNumber}` : '',
          ]
            .filter(Boolean)
            .join(' · ')

          return (
            <PhotoCard
              key={photo.id}
              src={thumbSrc(photo)}
              name={photo.name}
              starred={photo.starred}
              rating={photo.rating}
              selected={selected.includes(photo.id)}
              cameraLabel={cameraLabel}
              dimensions={photo.width ? `${photo.width}×${photo.height}` : undefined}
              // Lightroom grid 风格：所有卡片统一方形（aspectRatio=1），
              // 图片走 object-cover 居中裁切铺满 —— 整个网格像书架一样对齐
              // 不再按 photo.width/height 设置每卡独立比例（那会让竖图和横图卡尺寸不同）
              fit="cover"
              aspectRatio={1}
              onClick={() => toggleSelect(photo.id)}
              onDoubleClick={() => navigate(`/editor/${photo.id}`)}
            />
          )
        })}
      </div>
    </div>
  )
}
