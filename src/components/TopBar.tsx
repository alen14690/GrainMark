/**
 * TopBar — 顶部栏
 * 左侧：页面标题（衬线）+ 状态
 * 中间：搜索（未来）
 * 右侧：导入照片 / 全局操作
 */
import { FolderOpen, Search, Upload } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { ValueBadge } from '../design'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'

const TITLES: Record<string, { zh: string; en: string }> = {
  '/library': { zh: '图库', en: 'Library' },
  '/editor': { zh: '编辑器', en: 'Editor' },
  '/batch': { zh: '批量处理', en: 'Batch' },
  '/filters': { zh: '滤镜库', en: 'Filters' },
  '/extract': { zh: '风格提取', en: 'Extract' },
  '/taste': { zh: '口味参考集', en: 'Taste Lab' },
  '/watermark': { zh: '水印', en: 'Watermark' },
  '/ai': { zh: 'AI 工作室', en: 'AI Studio' },
  '/trending': { zh: '热度榜', en: 'Trending' },
  '/settings': { zh: '设置', en: 'Settings' },
}

export default function TopBar() {
  const location = useLocation()
  const photoCount = useAppStore((s) => s.photos.length)
  const selectedCount = useAppStore((s) => s.selectedPhotoIds.length)
  const importPhotos = useAppStore((s) => s.importPhotos)

  const entry = Object.entries(TITLES).find(([k]) => location.pathname.startsWith(k))
  const title = entry?.[1] ?? { zh: '', en: '' }

  const handleImport = async () => {
    const paths = await ipc('dialog:selectFiles', { multi: true })
    if (paths.length > 0) await importPhotos(paths)
  }

  const handleImportDir = async () => {
    const dir = await ipc('dialog:selectDir')
    if (!dir) return
    // TODO: 递归扫描目录（M3 实装）
    console.info('[topbar] selected dir:', dir)
  }

  return (
    <header className="h-14 shrink-0 glass-surface rounded-none border-x-0 border-t-0 drag-region flex items-center gap-4 px-5 relative z-10">
      {/* 标题 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <h1 className="font-display-serif text-2xl text-fg-1 leading-none">{title.zh}</h1>
          <span className="text-xxs font-mono text-fg-3 tracking-[0.14em] uppercase">{title.en}</span>
        </div>
        {photoCount > 0 && (
          <div className="flex items-center gap-2 mt-1 no-drag">
            <ValueBadge label="LIBRARY" value={photoCount} size="sm" variant="muted" />
            {selectedCount > 0 && (
              <ValueBadge label="SELECTED" value={selectedCount} size="sm" variant="amber" />
            )}
          </div>
        )}
      </div>

      {/* 操作区 */}
      <div className="flex items-center gap-2 no-drag">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3 pointer-events-none" />
          <input placeholder="搜索滤镜 / 标签…" className="input pl-8 py-1.5 w-60 text-xs" />
        </div>
        <button type="button" onClick={handleImportDir} className="btn-ghost btn-sm" title="选择文件夹">
          <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.8} />
          <span>目录</span>
        </button>
        <button type="button" onClick={handleImport} className="btn-primary btn-sm">
          <Upload className="w-3.5 h-3.5" strokeWidth={2} />
          <span>导入照片</span>
        </button>
      </div>
    </header>
  )
}
