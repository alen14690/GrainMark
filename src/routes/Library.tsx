/**
 * Library — 图库
 *
 * 卤化银风格：EXIF 徽章统计 + PhotoCard（含胶片齿孔装饰）
 */
import { ImageIcon, Upload } from 'lucide-react'
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
              onClick={() => toggleSelect(photo.id)}
              onDoubleClick={() => navigate(`/editor/${photo.id}`)}
            />
          )
        })}
      </div>
    </div>
  )
}
