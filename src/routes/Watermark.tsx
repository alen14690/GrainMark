/**
 * Watermark 路由 · 阶段 2 · 2026-05-01 重做
 *
 * 两个 Tab 并存:
 *   - "边框" Tab(新系统):走 frame:templates + FramePreviewHost + frame:render
 *     · 解决用户反馈的三大痛点:切换无效 / 粗糙 / 横竖不分
 *     · 必保 8 风格全部可用(minimal-bar / polaroid-classic / film-full-border /
 *       gallery-black / gallery-white / editorial-caption / spine-edition / hairline)
 *   - "水印" Tab(老系统):保留原 watermark:templates + WatermarkOverlay
 *     · 零迁移成本 · 给 Editor exportWatermark / Batch watermarkTemplateId 继续用
 *     · 未来阶段 4 清理迁移时再切
 *
 * 为什么保留老 UI:
 *   - 阶段 2 不接管 Editor 导出/批处理的 watermark 流程(会破坏 ≥6 处消费者)
 *   - 用户可以先在"边框"Tab 尝鲜新风格 · 满意后再切换默认
 *   - 阶段 4 会整体下线老 UI(迁移动作独立一个 commit)
 */
import { Camera, Check, Stamp, Upload as UploadIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_FRAME_SHOW_FIELDS } from '../../shared/frame-text'
import type {
  FrameStyle,
  FrameStyleId,
  FrameStyleOverrides,
  WatermarkStyle,
  WatermarkTemplate,
  WatermarkTemplateId,
} from '../../shared/types'
import { FramePreviewHost } from '../components/frame/FramePreviewHost'
import { thumbSrc } from '../lib/grainUrl'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'

type Tab = 'frame' | 'watermark'

export default function Watermark() {
  const photos = useAppStore((s) => s.photos)
  const [tab, setTab] = useState<Tab>('frame')
  const [refPhoto, setRefPhoto] = useState(photos[0] ?? null)

  useEffect(() => {
    if (!refPhoto && photos.length > 0) setRefPhoto(photos[0])
  }, [photos, refPhoto])

  return (
    <div className="p-6 animate-fade-in">
      {/* Tab 切换(边框 / 水印) */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab('frame')}
          data-testid="watermark-tab-frame"
          className={`px-4 py-1.5 rounded-lg text-[12.5px] transition-all ${
            tab === 'frame'
              ? 'bg-brand-amber/15 text-brand-amber border border-brand-amber/30'
              : 'text-fg-2 hover:bg-bg-1 border border-transparent'
          }`}
        >
          边框(新)
        </button>
        <button
          type="button"
          onClick={() => setTab('watermark')}
          data-testid="watermark-tab-watermark"
          className={`px-4 py-1.5 rounded-lg text-[12.5px] transition-all ${
            tab === 'watermark'
              ? 'bg-brand-amber/15 text-brand-amber border border-brand-amber/30'
              : 'text-fg-2 hover:bg-bg-1 border border-transparent'
          }`}
        >
          水印(旧,兼容保留)
        </button>
      </div>

      {tab === 'frame' ? <FrameTabBody refPhoto={refPhoto} /> : <WatermarkTabBody refPhoto={refPhoto} />}
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

      {/* 参数面板(字段可见性 / artistName / Logo) */}
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

// ============================================================================
// 水印 Tab · 老系统兼容保留(代码迁自 commit ff0a939 前版本)
// ============================================================================

function WatermarkTabBody({
  refPhoto,
}: { refPhoto: ReturnType<typeof useAppStore.getState>['photos'][number] | null }) {
  const settings = useAppStore((s) => s.settings)
  const [templates, setTemplates] = useState<WatermarkTemplate[]>([])
  const [activeTplId, setActiveTplId] = useState<WatermarkTemplateId>('minimal-bar')
  const [style, setStyle] = useState<WatermarkStyle | null>(null)

  useEffect(() => {
    ipc('watermark:templates').then((tpls) => {
      setTemplates(tpls)
      if (tpls[0]) setStyle(tpls[0].defaultStyle)
    })
  }, [])

  useEffect(() => {
    const tpl = templates.find((t) => t.id === activeTplId)
    if (tpl) setStyle(tpl.defaultStyle)
  }, [activeTplId, templates])

  return (
    <div className="grid grid-cols-5 gap-5">
      <aside className="col-span-1 card p-3">
        <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono px-2 mb-2">水印模板(老)</div>
        <div className="space-y-1">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setActiveTplId(tpl.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-[12.5px] transition-all ${
                activeTplId === tpl.id
                  ? 'bg-brand-amber/15 text-brand-amber border border-brand-amber/30'
                  : 'text-fg-2 hover:bg-bg-1 border border-transparent'
              }`}
            >
              <div className="font-medium">{tpl.name}</div>
              <div className="text-[10.5px] text-fg-3 mt-0.5">{tpl.description}</div>
            </button>
          ))}
        </div>
      </aside>

      <div className="col-span-3 card p-5">
        <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono mb-3 flex items-center gap-2">
          <Stamp className="w-3.5 h-3.5" />
          预览
          {refPhoto?.exif.model && (
            <span className="ml-auto text-fg-3 normal-case tracking-normal font-normal text-[11px]">
              <Camera className="inline w-3 h-3 mr-1" />
              EXIF 驱动:{refPhoto.exif.model}
            </span>
          )}
        </div>

        {refPhoto ? (
          <div className="relative aspect-[4/3] bg-bg-0 rounded-lg overflow-hidden">
            {refPhoto.thumbPath && (
              <img src={thumbSrc(refPhoto)} alt="" className="w-full h-full object-contain" />
            )}
            <LegacyWatermarkOverlay style={style} photo={refPhoto} />
          </div>
        ) : (
          <div className="aspect-[4/3] bg-bg-1 rounded-lg flex items-center justify-center text-fg-3 text-sm">
            先到图库导入照片
          </div>
        )}
      </div>

      <aside className="col-span-1 card p-4 space-y-4">
        <div className="text-[10.5px] text-fg-3 leading-relaxed">
          ⚠ 这是老水印系统,已切换到"边框(新)"Tab 以获得更精细的横竖自适应效果。 此 Tab 保留给 Editor 导出 /
          Batch 批处理的兼容性,阶段 4 会下线。
        </div>
        <div>
          <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono mb-1.5">摄影师</div>
          <input
            className="input text-[12px]"
            placeholder={settings?.watermark.artistName || '在设置中配置默认值'}
            defaultValue={settings?.watermark.artistName}
          />
        </div>
        <div>
          <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono mb-1.5">Logo (PNG)</div>
          <button
            type="button"
            className="btn-secondary w-full text-[11.5px]"
            onClick={async () => {
              const paths = await ipc('dialog:selectFiles', {
                filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'svg'] }],
                multi: false,
              })
              if (paths.length > 0 && style) {
                setStyle({ ...style, showLogo: true, logoPath: paths[0] })
              }
            }}
          >
            <UploadIcon className="w-3.5 h-3.5" />
            {style?.logoPath ? '更换 Logo' : '上传 Logo'}
          </button>
        </div>
        <button
          type="button"
          className="btn-primary w-full"
          onClick={async () => {
            if (!refPhoto?.path || !style) return
            try {
              const url = await ipc('watermark:render', refPhoto.path, style)
              if (url) window.open(url, '_blank', 'width=800,height=600')
            } catch (err) {
              window.alert(`水印渲染失败:${(err as Error).message}`)
            }
          }}
        >
          <Check className="w-3.5 h-3.5" />
          应用到当前图
        </button>
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

/** 老 HTML 水印预览(阶段 4 将随老系统一起下线) */
function LegacyWatermarkOverlay({
  style,
  photo,
}: {
  style: WatermarkStyle | null
  photo: NonNullable<ReturnType<typeof useAppStore.getState>['photos'][number]>
}) {
  if (!style) return null
  const parts: string[] = []
  const e = photo.exif
  if (style.fields.make && e.make) parts.push(e.make)
  if (style.fields.model && e.model) parts.push(e.model)
  if (style.fields.lens && e.lensModel) parts.push(e.lensModel)
  const params: string[] = []
  if (style.fields.focalLength && e.focalLength) params.push(`${e.focalLength}mm`)
  if (style.fields.aperture && e.fNumber) params.push(`f/${e.fNumber}`)
  if (style.fields.shutter && e.exposureTime) params.push(e.exposureTime)
  if (style.fields.iso && e.iso) params.push(`ISO ${e.iso}`)

  const text = parts.join(' · ')
  const paramText = params.join(' · ')

  return (
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white font-mono text-[12px] flex items-end justify-between">
      <div>
        <div className="font-semibold text-[13px]">{text || '—'}</div>
        {style.fields.dateTime && e.dateTimeOriginal && (
          <div className="text-[10.5px] text-white/70 mt-0.5">{e.dateTimeOriginal}</div>
        )}
      </div>
      <div className="text-[11px] text-white/90">{paramText}</div>
    </div>
  )
}
