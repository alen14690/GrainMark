import { ImageIcon, Star, Upload } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { thumbSrc } from '../lib/grainUrl'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'

export default function Library() {
  const photos = useAppStore((s) => s.photos)
  const selected = useAppStore((s) => s.selectedPhotoIds)
  const toggleSelect = useAppStore((s) => s.toggleSelectPhoto)
  const importPhotos = useAppStore((s) => s.importPhotos)

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
    await importPhotos(paths)
  }

  if (photos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto w-24 h-24 rounded-2xl bg-gradient-to-br from-ink-800 to-ink-900 border border-ink-800 flex items-center justify-center relative overflow-hidden">
            <ImageIcon className="w-10 h-10 text-ink-500" />
            <span className="absolute inset-0 film-grain" />
          </div>
          <h2 className="mt-6 text-xl font-semibold">图库空空如也</h2>
          <p className="mt-2 text-sm text-ink-400 leading-relaxed">
            导入 JPEG / PNG / TIFF / HEIC / RAW 照片开始你的后期之旅
            <br />
            支持 Nikon NEF / Canon CR2/CR3 / Sony ARW / Fuji RAF / Adobe DNG 等
          </p>
          <button onClick={handleImport} className="btn-primary mt-6">
            <Upload className="w-4 h-4" />
            导入照片
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="照片总数" value={stats.total} />
        <StatCard label="已收藏" value={stats.starred} />
        <StatCard label="相机型号" value={stats.cameras} />
        <StatCard label="已选中" value={selected.length} accent />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
        {photos.map((photo) => {
          const isSel = selected.includes(photo.id)
          return (
            <div
              key={photo.id}
              onClick={() => toggleSelect(photo.id)}
              className={`group relative rounded-xl overflow-hidden border transition-all cursor-pointer aspect-[4/3] bg-ink-900 ${
                isSel
                  ? 'border-accent-500 shadow-lg shadow-accent-500/25 ring-1 ring-accent-500'
                  : 'border-ink-800 hover:border-ink-700'
              }`}
            >
              {photo.thumbPath ? (
                <img
                  src={thumbSrc(photo)}
                  alt={photo.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-ink-700" />
                </div>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              {/* Star */}
              {photo.starred && (
                <div className="absolute top-2 left-2 w-6 h-6 rounded-md bg-black/60 backdrop-blur flex items-center justify-center">
                  <Star className="w-3.5 h-3.5 text-accent-400 fill-accent-400" />
                </div>
              )}

              {/* Selection mark */}
              {isSel && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent-500 flex items-center justify-center text-[11px] font-semibold text-ink-950">
                  ✓
                </div>
              )}

              {/* Meta */}
              <div className="absolute bottom-0 left-0 right-0 p-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="text-[11px] font-medium text-ink-50 truncate">{photo.name}</div>
                {(photo.exif.model || photo.exif.lensModel) && (
                  <div className="text-[10px] text-ink-300 truncate font-mono mt-0.5">
                    {photo.exif.model} · {photo.exif.focalLength ? `${photo.exif.focalLength}mm` : ''}
                    {photo.exif.fNumber ? ` · f/${photo.exif.fNumber}` : ''}
                  </div>
                )}
              </div>

              {/* Double-click → editor */}
              <Link
                to={`/editor/${photo.id}`}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-0"
                aria-label={`编辑 ${photo.name}`}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? 'border-accent-500/40 bg-accent-500/5' : ''}`}>
      <div className="text-[11px] text-ink-500 uppercase tracking-wider font-mono">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? 'text-accent-400' : 'text-ink-100'}`}>
        {value}
      </div>
    </div>
  )
}
