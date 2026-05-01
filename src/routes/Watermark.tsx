/**
 * Watermark 路由 · 2026-05-01 下线老水印 UI · 只保留新边框系统
 *
 * 历史:
 *   - 阶段 2(c7ad90c):新增 FramePreviewHost 双 Tab(边框 / 水印),两套 UI 并存
 *   - 阶段 3 + 本次(2026-05-01 下午):按用户反馈下线老水印 Tab,UI 只剩"边框(新)"
 *
 * 为什么只删 UI 不删后端:
 *   - Editor 的 photo:exportSingle 仍带 watermark?: WatermarkStyle 参数(IPC API 契约)
 *   - Batch 的 BatchJobConfig.watermarkTemplateId 被批处理消费
 *   - settings.watermark.defaultTemplateId 被 AppSettings 消费
 *   - 强行下线后端会造成 ≥6 处调用点同时 break · 风险过大
 *   - 方案:UI 层下线(用户看不到也进不去老系统),后端保留直到阶段 4 整体迁移
 *
 * 下线后的用户体验:
 *   - 打开"水印"路由,直接进入新边框系统,无 Tab 切换干扰
 *   - 所有 12 个边框风格都按横竖自适应渲染,字号按短边归一化
 *   - Editor / Batch 的水印流程仍走老 IPC(用户不感知)
 */
import { Camera, Check, Stamp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../shared/frame-text'
import type { FrameStyle, FrameStyleId, FrameStyleOverrides } from '../../shared/types'
import { FramePreviewHost } from '../components/frame/FramePreviewHost'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'

export default function Watermark() {
  const photos = useAppStore((s) => s.photos)
  const [refPhoto, setRefPhoto] = useState(photos[0] ?? null)

  useEffect(() => {
    if (!refPhoto && photos.length > 0) setRefPhoto(photos[0])
  }, [photos, refPhoto])

  return (
    <div className="p-6 animate-fade-in" data-testid="watermark-route">
      <FrameTabBody refPhoto={refPhoto} />
    </div>
  )
}

// ============================================================================
// 边框 Tab · 新系统(frame:* IPC + FramePreviewHost)
// ============================================================================

function FrameTabBody({
  refPhoto,
}: { refPhoto: ReturnType<typeof useAppStore.getState>['photos'][number] | null }) {
  const [styles, setStyles] = useState<FrameStyle[]>([])
  const [activeId, setActiveId] = useState<FrameStyleId>('minimal-bar')
  const [overrides, setOverrides] = useState<FrameStyleOverrides>({ showFields: DEFAULT_FRAME_SHOW_FIELDS })
  const [rendering, setRendering] = useState(false)

  useEffect(() => {
    ipc('frame:templates').then((list) => {
      setStyles(list)
      if (list[0]) setOverrides(list[0].defaultOverrides)
    })
  }, [])

  useEffect(() => {
    const s = styles.find((x) => x.id === activeId)
    if (s) setOverrides(s.defaultOverrides)
  }, [activeId, styles])

  const activeStyle = styles.find((s) => s.id === activeId) ?? null

  async function onApply() {
    if (!refPhoto?.path) return
    setRendering(true)
    try {
      const url = await ipc('frame:render', refPhoto.path, activeId, overrides)
      if (url) window.open(url, '_blank', 'width=1000,height=800')
    } catch (err) {
      window.alert(`边框渲染失败:${(err as Error).message}`)
    } finally {
      setRendering(false)
    }
  }

  return (
    <div className="grid grid-cols-5 gap-5">
      {/* 风格列表 */}
      <aside className="col-span-1 card p-3">
        <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono px-2 mb-2">
          边框风格 · {styles.length}
        </div>
        <div className="space-y-1">
          {styles.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              data-testid={`frame-style-${s.id}`}
              className={`w-full text-left px-3 py-2 rounded-lg text-[12.5px] transition-all ${
                activeId === s.id
                  ? 'bg-brand-amber/15 text-brand-amber border border-brand-amber/30'
                  : 'text-fg-2 hover:bg-bg-1 border border-transparent'
              }`}
            >
              <div className="font-medium">{s.name}</div>
              <div className="text-[10.5px] text-fg-3 mt-0.5">{s.description}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* 预览(FramePreviewHost 按 style.id 分派组件,彻底根治"切换无效") */}
      <div className="col-span-3 card p-5">
        <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono mb-3 flex items-center gap-2">
          <Stamp className="w-3.5 h-3.5" />
          预览 · {activeStyle?.name ?? '—'}
          {refPhoto?.exif.model && (
            <span className="ml-auto text-fg-3 normal-case tracking-normal font-normal text-[11px]">
              <Camera className="inline w-3 h-3 mr-1" />
              EXIF 驱动:{refPhoto.exif.model}
            </span>
          )}
        </div>

        <div className="aspect-[4/3] bg-bg-0 rounded-lg overflow-hidden">
          <FramePreviewHost photo={refPhoto} style={activeStyle} overrides={overrides} />
        </div>
      </div>

      {/* 参数面板(字段可见性 / artistName) */}
      <aside className="col-span-1 card p-4 space-y-4">
        <div>
          <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono mb-1.5">显示字段</div>
          <div className="space-y-1 text-[12px]">
            {(Object.keys(overrides.showFields) as (keyof FrameStyleOverrides['showFields'])[]).map((k) => (
              <label key={k} className="flex items-center justify-between gap-2 py-0.5 cursor-pointer">
                <span className="text-fg-2 capitalize">{fieldLabel(k)}</span>
                <input
                  type="checkbox"
                  checked={overrides.showFields[k]}
                  onChange={(e) =>
                    setOverrides((o) => ({
                      ...o,
                      showFields: { ...o.showFields, [k]: e.target.checked },
                    }))
                  }
                  className="accent-brand-amber"
                />
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono mb-1.5">摄影师</div>
          <input
            className="input text-[12px]"
            placeholder="用于 Gallery / Editorial 等风格"
            value={overrides.artistName ?? ''}
            onChange={(e) => setOverrides((o) => ({ ...o, artistName: e.target.value }))}
          />
        </div>

        <button
          type="button"
          className="btn-primary w-full"
          onClick={onApply}
          disabled={rendering || !refPhoto?.path}
          data-testid="frame-apply-btn"
        >
          <Check className="w-3.5 h-3.5" />
          {rendering ? '渲染中…' : '高保真预览(Sharp 实渲)'}
        </button>

        <div className="text-[10.5px] text-fg-3 leading-relaxed">
          预览左侧是 CSS 实时模拟 · 点击按钮用主进程 Sharp 真渲染一次,会弹出新窗口
        </div>
      </aside>
    </div>
  )
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
    dateTime: '拍摄时间',
    artist: '摄影师',
    location: '地点',
  }
  return map[k] ?? k
}
