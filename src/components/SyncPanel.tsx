/**
 * SyncPanel — 参数同步弹出面板
 *
 * 功能：
 *   - 用户勾选要同步的参数字段
 *   - 点击"同步"后，当前照片的对应参数复制到所有选中照片
 *   - 默认全选（除了裁切）
 */
import { Check, Copy, X } from 'lucide-react'
import { useState } from 'react'
import { type SyncOptions, useEditStore } from '../stores/editStore'

interface SyncPanelProps {
  onClose: () => void
}

const SYNC_FIELDS: Array<{ key: keyof SyncOptions; label: string; defaultOn: boolean }> = [
  { key: 'whiteBalance', label: '白平衡', defaultOn: true },
  { key: 'tone', label: '色调', defaultOn: true },
  { key: 'colorGrading', label: '颜色分级', defaultOn: true },
  { key: 'saturation', label: '饱和度', defaultOn: true },
  { key: 'vibrance', label: '活力', defaultOn: true },
  { key: 'clarity', label: '清晰度', defaultOn: true },
  { key: 'hsl', label: 'HSL', defaultOn: true },
  { key: 'curves', label: '曲线', defaultOn: true },
  { key: 'grain', label: '颗粒', defaultOn: true },
  { key: 'halation', label: '光晕', defaultOn: true },
  { key: 'vignette', label: '暗角', defaultOn: true },
  { key: 'crop', label: '裁切', defaultOn: false },
  { key: 'frame', label: '边框', defaultOn: true },
  { key: 'watermark', label: '水印', defaultOn: true },
]

function getDefaultOptions(): SyncOptions {
  const opts: Record<string, boolean> = {}
  for (const f of SYNC_FIELDS) opts[f.key] = f.defaultOn
  return opts as unknown as SyncOptions
}

export function SyncPanel({ onClose }: SyncPanelProps) {
  const [options, setOptions] = useState<SyncOptions>(getDefaultOptions)
  const selectedCount = useEditStore((s) => s.selectedPhotoIds.length)
  const syncToSelected = useEditStore((s) => s.syncToSelected)

  const toggle = (key: keyof SyncOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const selectAllFields = () => {
    const all: Record<string, boolean> = {}
    for (const f of SYNC_FIELDS) all[f.key] = true
    setOptions(all as unknown as SyncOptions)
  }

  const deselectAllFields = () => {
    const none: Record<string, boolean> = {}
    for (const f of SYNC_FIELDS) none[f.key] = false
    setOptions(none as unknown as SyncOptions)
  }

  const handleSync = () => {
    syncToSelected(options)
    onClose()
  }

  return (
    <div className="absolute top-full left-0 mt-1 z-50 w-64 rounded-xl bg-bg-1 border border-white/10 shadow-2xl shadow-black/40 p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-fg-1">同步参数</h3>
        <button type="button" onClick={onClose} className="btn-ghost btn-xs p-1">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-[11px] text-fg-3 mb-3">
        将当前照片的参数同步到已选中的 <span className="text-brand-amber font-medium">{selectedCount}</span> 张照片
      </p>

      {/* 全选/全不选 */}
      <div className="flex gap-2 mb-2">
        <button type="button" onClick={selectAllFields} className="text-[10px] text-fg-3 hover:text-fg-1 underline">
          全选
        </button>
        <button type="button" onClick={deselectAllFields} className="text-[10px] text-fg-3 hover:text-fg-1 underline">
          全不选
        </button>
      </div>

      {/* 字段勾选 */}
      <div className="grid grid-cols-2 gap-1.5 mb-4">
        {SYNC_FIELDS.map(({ key, label }) => (
          <label
            key={key}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-colors
              ${options[key] ? 'bg-brand-amber/10 text-fg-1' : 'bg-white/[0.03] text-fg-3 hover:bg-white/[0.06]'}`}
          >
            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors
              ${options[key] ? 'bg-brand-amber border-brand-amber' : 'border-white/20'}`}
            >
              {options[key] && <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />}
            </div>
            <span className="text-[11px]">{label}</span>
          </label>
        ))}
      </div>

      {/* 操作按钮 */}
      <button
        type="button"
        onClick={handleSync}
        disabled={selectedCount === 0}
        className="btn-primary w-full text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Copy className="w-3.5 h-3.5" />
        同步到 {selectedCount} 张照片
      </button>
    </div>
  )
}
