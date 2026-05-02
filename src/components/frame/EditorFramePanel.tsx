/**
 * EditorFramePanel — 编辑器内的边框选择面板（受控组件）
 *
 * 架构（2026-05-02 重构）：
 *   - 边框选择状态统一存储在 editStore.frameConfig
 *   - 本组件是 editStore 的纯视图 + setter 入口
 *   - 不再持有本地 useState 重复状态
 *   - 切换边框 → editStore.setFrameConfig → commitHistory
 *   - 支持 ⌘Z 撤销边框选择
 */
import { Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { matchBrandByMake } from '../../../shared/frame-brands'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../../shared/frame-text'
import type { AppSettings, FrameStyle, FrameStyleId, FrameStyleOverrides } from '../../../shared/types'
import { ipc } from '../../lib/ipc'
import { useEditStore } from '../../stores/editStore'

/** 质感分组顺序 — 与 Watermark.tsx 保持一致 */
const GROUP_ORDER: readonly Exclude<FrameStyle['group'], 'classic'>[] = [
  'ambient',
  'simple',
  'glass',
  'cinema',
  'oil',
  'editorial',
  'floating',
  'collage',
] as const

const GROUP_LABELS: Record<Exclude<FrameStyle['group'], 'classic'>, string> = {
  simple: '简约经典',
  glass: '玻璃拟态',
  oil: '油画 · 水彩',
  ambient: '氛围模糊',
  cinema: '电影 · 霓虹',
  editorial: '印刷 · 杂志',
  floating: '浮动徽章',
  collage: '拼接',
}

function fieldLabel(k: string): string {
  const map: Record<string, string> = {
    make: '相机品牌',
    model: '机型',
    lens: '镜头',
    aperture: '光圈',
    shutter: '快门',
    iso: 'ISO',
    focalLength: '焦距',
    artist: '摄影师',
    location: '地点',
  }
  return map[k] ?? k
}

interface Props {
  photo: { exif: { make?: string | null } } | undefined
}

export function EditorFramePanel({ photo }: Props) {
  // 从 editStore 读取边框配置（Single Source of Truth）
  const frameConfig = useEditStore((s) => s.frameConfig)
  const setFrameConfig = useEditStore((s) => s.setFrameConfig)
  const commitHistory = useEditStore((s) => s.commitHistory)

  const activeId = frameConfig?.styleId ?? null
  const overrides = frameConfig?.overrides ?? { showFields: DEFAULT_FRAME_SHOW_FIELDS }

  // 风格列表缓存（只是 UI 数据，不属于工作流状态）
  const [styles, setStyles] = useState<FrameStyle[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    ipc('frame:templates')
      .then((list) => setStyles(list))
      .catch(() => {})
    ipc('settings:get')
      .then(setSettings)
      .catch(() => {})
  }, [])

  // 自动匹配品牌 Logo
  useEffect(() => {
    if (!settings || !activeId) return
    const brandLogos = settings.watermark.brandLogos ?? {}
    const brandId = matchBrandByMake(photo?.exif.make) ?? 'leica'
    const logoPath = brandLogos[brandId] ?? brandLogos.leica
    if (logoPath && overrides.logoPath !== logoPath) {
      setFrameConfig({
        styleId: activeId,
        overrides: { ...overrides, logoPath },
      })
    }
  }, [photo, settings, activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 选择边框风格 */
  function selectStyle(id: FrameStyleId | null) {
    if (id === null) {
      setFrameConfig(null)
      commitHistory('移除边框')
      return
    }
    const style = styles.find((s) => s.id === id)
    if (!style) return
    setFrameConfig({
      styleId: id,
      overrides: { ...style.defaultOverrides, logoPath: overrides.logoPath },
    })
    commitHistory(`边框 · ${style.name}`)
  }

  /** 更新 overrides 字段 */
  function updateOverrides(patch: Partial<FrameStyleOverrides>) {
    if (!activeId) return
    setFrameConfig({
      styleId: activeId,
      overrides: { ...overrides, ...patch },
    })
  }

  const activeStyle = styles.find((s) => s.id === activeId)

  return (
    <div className="p-3 space-y-3">
      {/* 当前选中状态 */}
      {activeId && activeStyle && (
        <div className="flex items-center justify-between bg-brand-amber/10 rounded-lg px-3 py-2 border border-brand-amber/20">
          <div>
            <div className="text-[11px] text-brand-amber font-medium">{activeStyle.name}</div>
            <div className="text-[9px] text-fg-3">画布已叠加边框预览 · 导出时自动应用</div>
          </div>
          <button type="button" onClick={() => selectStyle(null)} className="text-fg-3 hover:text-fg-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 无边框选项 */}
      <button
        type="button"
        onClick={() => selectStyle(null)}
        className={`w-full text-left px-3 py-2 rounded-lg text-[12px] transition-all ${
          !activeId
            ? 'bg-brand-amber/15 text-brand-amber border border-brand-amber/30'
            : 'text-fg-2 hover:bg-bg-1 border border-transparent'
        }`}
      >
        <div className="font-medium">无边框</div>
        <div className="text-[10px] text-fg-3 mt-0.5">导出原图不添加边框</div>
      </button>

      {/* 按组展示风格 — 与水印页一致 */}
      {GROUP_ORDER.map((group) => {
        const inGroup = styles.filter((s) => s.group === group)
        if (inGroup.length === 0) return null
        return (
          <div key={group} className="mb-2">
            <div className="text-[10px] text-brand-amber uppercase tracking-[0.12em] font-mono px-2 py-1 mt-2 border-b border-brand-amber/15 mb-1 flex items-center justify-between">
              <span>{GROUP_LABELS[group]}</span>
              <span className="text-fg-3 normal-case tracking-normal text-[9.5px]">{inGroup.length}</span>
            </div>
            <div className="space-y-1">
              {inGroup.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectStyle(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[12px] transition-all ${
                    activeId === s.id
                      ? 'bg-brand-amber/15 text-brand-amber border border-brand-amber/30'
                      : 'text-fg-2 hover:bg-bg-1 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{s.name}</span>
                    {activeId === s.id && <Check className="w-3 h-3 text-brand-amber shrink-0" />}
                  </div>
                  <div className="text-[10.5px] text-fg-3 mt-0.5 line-clamp-2">{s.description}</div>
                </button>
              ))}
            </div>
          </div>
        )
      })}

      {/* 字段配置 — 选中边框时显示 */}
      {activeId && (
        <div className="pt-3 border-t border-fg-4/30 space-y-3">
          <div>
            <div className="text-[10px] text-fg-3 uppercase tracking-wider font-mono mb-1.5">显示字段</div>
            <div className="space-y-1 text-[11.5px]">
              {(Object.keys(overrides.showFields) as (keyof FrameStyleOverrides['showFields'])[])
                .filter((k) => k !== 'dateTime')
                .map((k) => (
                  <label key={k} className="flex items-center justify-between gap-2 py-0.5 cursor-pointer">
                    <span className="text-fg-2">{fieldLabel(k)}</span>
                    <input
                      type="checkbox"
                      checked={overrides.showFields[k]}
                      onChange={(e) =>
                        updateOverrides({
                          showFields: { ...overrides.showFields, [k]: e.target.checked },
                        })
                      }
                      className="accent-brand-amber"
                    />
                  </label>
                ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-fg-3 uppercase tracking-wider font-mono mb-1.5">摄影师</div>
            <input
              className="w-full bg-bg-1 border border-fg-4/40 rounded px-2 py-1 text-[11.5px] text-fg-2 placeholder:text-fg-4"
              placeholder="用于 Editorial 等风格"
              value={overrides.artistName ?? ''}
              onChange={(e) => updateOverrides({ artistName: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
