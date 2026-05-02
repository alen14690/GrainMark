/**
 * EditorFramePanel — 编辑器内的边框选择面板
 *
 * 嵌入 Editor 右侧栏的"边框"Tab 内容。
 * 用户选择风格后，Editor 主画布切换为边框预览。
 */
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FrameStyle, FrameStyleId, FrameStyleOverrides, Photo } from '../../../shared/types'
import { ipc } from '../../lib/ipc'

const DEFAULT_SHOW_FIELDS = {
  make: true, model: true, lens: true, aperture: true, shutter: true,
  iso: true, focalLength: true, dateTime: false, artist: false, location: false,
}

interface Props {
  photo: Photo | undefined
}

export function EditorFramePanel({ photo: _photo }: Props) {
  const [styles, setStyles] = useState<FrameStyle[]>([])
  const [activeId, setActiveId] = useState<FrameStyleId | null>(null)
  const [overrides, setOverrides] = useState<FrameStyleOverrides>({
    showFields: DEFAULT_SHOW_FIELDS,
  })

  useEffect(() => {
    ipc('frame:templates').then((s) => setStyles(s as any)).catch(() => {})
  }, [])

  const activeStyle = styles.find((s) => s.id === activeId)

  // 分组
  const groups = [...new Set(styles.map((s) => s.group))].filter((g) => g !== 'classic')

  return (
    <div className="p-3 space-y-3">
      {/* 当前选中状态 */}
      {activeId && (
        <div className="flex items-center justify-between bg-brand-amber/10 rounded-lg px-3 py-2 border border-brand-amber/20">
          <div>
            <div className="text-[11px] text-brand-amber font-medium">{activeStyle?.name ?? activeId}</div>
            <div className="text-[9px] text-fg-3">导出时将自动叠加此边框</div>
          </div>
          <button type="button" onClick={() => setActiveId(null)} className="text-fg-3 hover:text-fg-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 不加边框选项 */}
      <button
        type="button"
        onClick={() => setActiveId(null)}
        className={`w-full text-left px-3 py-2 rounded-lg text-[12px] transition-all ${
          !activeId
            ? 'bg-brand-amber/15 text-brand-amber border border-brand-amber/30'
            : 'text-fg-2 hover:bg-bg-1 border border-transparent'
        }`}
      >
        <div className="font-medium">无边框</div>
        <div className="text-[10px] text-fg-3 mt-0.5">导出原图不添加边框</div>
      </button>

      {/* 按组展示风格 */}
      {groups.map((group) => {
        const inGroup = styles.filter((s) => s.group === group)
        if (inGroup.length === 0) return null
        return (
          <div key={group} className="space-y-1">
            <div className="text-[10px] text-brand-amber/80 uppercase tracking-[0.1em] font-mono px-1 pt-2">
              {group} · {inGroup.length}
            </div>
            {inGroup.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-[11.5px] transition-all ${
                  activeId === s.id
                    ? 'bg-brand-amber/15 text-brand-amber border border-brand-amber/30'
                    : 'text-fg-2 hover:bg-bg-1 border border-transparent'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )
      })}

      {/* 字段配置（选中边框时显示） */}
      {activeId && (
        <div className="pt-3 border-t border-fg-4/30 space-y-2">
          <div className="text-[10px] text-fg-3 uppercase tracking-wider font-mono">显示字段</div>
          {(Object.keys(overrides.showFields) as (keyof typeof overrides.showFields)[])
            .filter((k) => k !== 'dateTime')
            .map((k) => (
              <label key={k} className="flex items-center justify-between text-[11px] py-0.5 cursor-pointer">
                <span className="text-fg-2 capitalize">{k}</span>
                <input
                  type="checkbox"
                  checked={overrides.showFields[k]}
                  onChange={(e) => setOverrides((o) => ({ ...o, showFields: { ...o.showFields, [k]: e.target.checked } }))}
                  className="accent-brand-amber"
                />
              </label>
            ))}
        </div>
      )}
    </div>
  )
}
