/**
 * FilmStrip — 底部胶片条（多图编辑模式）
 *
 * 功能：
 *   - 横向显示当前会话中所有照片的缩略图
 *   - 单击切换当前编辑照片
 *   - Cmd/Ctrl+Click 多选（用于同步参数/批量导出）
 *   - 当前编辑照片：金色粗边框 + 放大
 *   - 已选中照片：角标 ✓ + 淡金色边框
 *   - 有编辑的照片：右上角小圆点
 *
 * 设计：
 *   - 只在 sessionPhotoIds.length > 1 时显示
 *   - 高度 80px，可横向滚动
 */
import { Check, Plus } from 'lucide-react'
import { useCallback, useRef } from 'react'
import type { Photo } from '../../shared/types'
import { ipc } from '../lib/ipc'
import { previewCache } from '../routes/Editor'
import { useEditStore } from '../stores/editStore'

interface FilmStripProps {
  photos: Photo[]
  onAddPhotos?: () => void
}

export function FilmStrip({ photos, onAddPhotos }: FilmStripProps) {
  const sessionPhotoIds = useEditStore((s) => s.sessionPhotoIds)
  const activePhotoId = useEditStore((s) => s.activePhotoId)
  const selectedPhotoIds = useEditStore((s) => s.selectedPhotoIds)
  // P1-8 优化：只订阅有编辑的 photoId 列表（避免整个 Record 引用变化触发 re-render）
  const editedPhotoIds = useEditStore((s) => Object.keys(s.photoStates).filter((k) => s.photoStates[k]?.dirty))
  const switchPhoto = useEditStore((s) => s.switchPhoto)
  const toggleSelected = useEditStore((s) => s.toggleSelected)
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleClick = useCallback(
    (photoId: string, e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        toggleSelected(photoId)
      } else {
        switchPhoto(photoId)
      }
    },
    [switchPhoto, toggleSelected],
  )

  // P0-3：hover 预加载 — 鼠标悬停时提前请求 preview
  const handleMouseEnter = useCallback(
    (photoId: string) => {
      const photo = photos.find((p) => p.id === photoId)
      if (photo?.path && !previewCache.has(photo.path)) {
        ipc('preview:render', photo.path, null, undefined)
          .then((url) => { previewCache.set(photo.path, url) })
          .catch(() => {})
      }
    },
    [photos],
  )

  // 只在多图模式下显示（必须放在所有 hooks 之后）
  if (sessionPhotoIds.length <= 1) return null

  // 按 sessionPhotoIds 顺序排列照片
  const orderedPhotos = sessionPhotoIds
    .map((id) => photos.find((p) => p.id === id))
    .filter(Boolean) as Photo[]

  return (
    <div className="flex-shrink-0 border-t border-white/[0.06] bg-bg-0/80 backdrop-blur-sm">
      <div
        ref={scrollRef}
        className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-thin"
        style={{ height: 80 }}
      >
        {orderedPhotos.map((photo) => {
          const isActive = photo.id === activePhotoId
          const isSelected = selectedPhotoIds.includes(photo.id)
          const hasEdits = editedPhotoIds.includes(photo.id)

          return (
            <button
              key={photo.id}
              type="button"
              onClick={(e) => handleClick(photo.id, e)}
              onMouseEnter={() => handleMouseEnter(photo.id)}
              className={`
                relative flex-shrink-0 rounded-lg overflow-hidden transition-all duration-150
                ${isActive
                  ? 'ring-2 ring-brand-amber shadow-lg shadow-brand-amber/20 scale-105 z-10'
                  : isSelected
                    ? 'ring-1 ring-brand-amber/50 opacity-90'
                    : 'ring-1 ring-white/10 opacity-70 hover:opacity-90 hover:ring-white/20'
                }
              `}
              style={{ width: 56, height: 56 }}
              title={`${photo.name}${isSelected ? ' (已选中)' : ''}${hasEdits ? ' · 已编辑' : ''}`}
            >
              {/* 缩略图 */}
              <img
                src={photo.thumbPath ? `grain://thumb/${photo.id}` : `grain://photo/${photo.id}`}
                alt={photo.name}
                className="w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />

              {/* 选中角标 */}
              {isSelected && (
                <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-brand-amber flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                </div>
              )}

              {/* 已编辑标记 */}
              {hasEdits && !isActive && (
                <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-brand-amber/80" />
              )}

              {/* 序号 */}
              <div className="absolute bottom-0 inset-x-0 bg-black/50 text-center">
                <span className="text-[8px] text-white/70 font-mono">
                  {sessionPhotoIds.indexOf(photo.id) + 1}
                </span>
              </div>
            </button>
          )
        })}

        {/* 添加按钮 */}
        {onAddPhotos && (
          <button
            type="button"
            onClick={onAddPhotos}
            className="flex-shrink-0 w-14 h-14 rounded-lg border border-dashed border-white/20
              flex items-center justify-center text-fg-3 hover:text-fg-2 hover:border-white/30
              transition-all"
            title="追加照片到当前编辑会话"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* 底部信息栏 */}
      <div className="flex items-center justify-between px-4 pb-1.5 text-[10px] text-fg-3">
        <span>{sessionPhotoIds.length} 张照片</span>
        {selectedPhotoIds.length > 0 && (
          <span className="text-brand-amber">
            已选中 {selectedPhotoIds.length} 张 · Cmd+Click 多选
          </span>
        )}
        {selectedPhotoIds.length === 0 && (
          <span>单击切换 · Cmd+Click 多选</span>
        )}
      </div>
    </div>
  )
}
