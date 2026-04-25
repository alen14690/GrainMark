import { FolderOpen, Search, Upload } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'

const TITLES: Record<string, string> = {
  '/library': '图库',
  '/editor': '编辑器',
  '/batch': '批量处理',
  '/filters': '滤镜库',
  '/extract': '从参考图提取风格',
  '/watermark': '水印编辑',
  '/trending': '社区胶片趋势榜',
  '/ai': 'AI 工作室',
  '/settings': '设置',
}

export default function TopBar() {
  const location = useLocation()
  const importPhotos = useAppStore((s) => s.importPhotos)
  const photoCount = useAppStore((s) => s.photos.length)

  const title = Object.entries(TITLES).find(([k]) => location.pathname.startsWith(k))?.[1] ?? ''

  const handleImport = async () => {
    const paths = await ipc('dialog:selectFiles', { multi: true })
    await importPhotos(paths)
  }

  const handleImportDir = async () => {
    const dir = await ipc('dialog:selectDir')
    if (!dir) return
    // TODO: 递归扫描目录并导入 — 后续由主进程接口支持
    alert(`将扫描目录: ${dir}\n（递归扫描功能将在 M3 实装）`)
  }

  return (
    <header className="h-14 shrink-0 border-b border-ink-900 bg-ink-950/80 backdrop-blur flex items-center px-5 gap-4 drag-region">
      <div className="flex-1 min-w-0">
        <h1 className="text-[15px] font-semibold tracking-tight text-ink-100">{title}</h1>
        {photoCount > 0 && (
          <div className="text-[11px] text-ink-500 font-mono mt-0.5">{photoCount} 张照片</div>
        )}
      </div>

      <div className="flex items-center gap-2 no-drag">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500" />
          <input placeholder="搜索滤镜 / 标签..." className="input pl-8 py-1.5 w-56 text-[12.5px]" />
        </div>
        <button onClick={handleImportDir} className="btn-ghost py-1.5 px-2.5 text-[12.5px]">
          <FolderOpen className="w-3.5 h-3.5" />
          选择目录
        </button>
        <button onClick={handleImport} className="btn-primary py-1.5 px-3 text-[12.5px]">
          <Upload className="w-3.5 h-3.5" />
          导入照片
        </button>
      </div>
    </header>
  )
}
