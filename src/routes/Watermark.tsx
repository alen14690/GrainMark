import { Camera, Check, Stamp, Upload as UploadIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { WatermarkStyle, WatermarkTemplate, WatermarkTemplateId } from '../../shared/types'
import { thumbSrc } from '../lib/grainUrl'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'

export default function Watermark() {
  const photos = useAppStore((s) => s.photos)
  const settings = useAppStore((s) => s.settings)
  const [templates, setTemplates] = useState<WatermarkTemplate[]>([])
  const [activeTplId, setActiveTplId] = useState<WatermarkTemplateId>('minimal-bar')
  const [refPhoto, setRefPhoto] = useState(photos[0] ?? null)
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

  useEffect(() => {
    if (!refPhoto && photos.length > 0) setRefPhoto(photos[0])
  }, [photos, refPhoto])

  return (
    <div className="p-6 animate-fade-in">
      <div className="grid grid-cols-5 gap-5">
        {/* 模板 */}
        <aside className="col-span-1 card p-3">
          <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono px-2 mb-2">模板</div>
          <div className="space-y-1">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
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

        {/* 预览 */}
        <div className="col-span-3 card p-5">
          <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono mb-3 flex items-center gap-2">
            <Stamp className="w-3.5 h-3.5" />
            预览
            {refPhoto?.exif.model && (
              <span className="ml-auto text-fg-3 normal-case tracking-normal font-normal text-[11px]">
                <Camera className="inline w-3 h-3 mr-1" />
                EXIF 驱动：{refPhoto.exif.model}
              </span>
            )}
          </div>

          {refPhoto ? (
            <div className="relative aspect-[4/3] bg-bg-0 rounded-lg overflow-hidden">
              {refPhoto.thumbPath && (
                <img src={thumbSrc(refPhoto)} alt="" className="w-full h-full object-contain" />
              )}
              {/* 简单 HTML 水印预览（M6 会用真实渲染） */}
              <WatermarkOverlay style={style} photo={refPhoto} />
            </div>
          ) : (
            <div className="aspect-[4/3] bg-bg-1 rounded-lg flex items-center justify-center text-fg-3 text-sm">
              先到图库导入照片
            </div>
          )}

          {refPhoto && (
            <div className="mt-3 text-[11px] text-fg-3 font-mono grid grid-cols-3 gap-2">
              <div>{refPhoto.exif.model ?? '—'}</div>
              <div>{refPhoto.exif.lensModel ?? '—'}</div>
              <div>
                {refPhoto.exif.fNumber ? `f/${refPhoto.exif.fNumber}` : ''} {refPhoto.exif.exposureTime ?? ''}{' '}
                {refPhoto.exif.iso ? `ISO ${refPhoto.exif.iso}` : ''}
              </div>
            </div>
          )}
        </div>

        {/* 参数 */}
        <aside className="col-span-1 card p-4 space-y-4">
          <div>
            <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono mb-1.5">显示字段</div>
            {style && (
              <div className="space-y-1 text-[12px]">
                {(Object.keys(style.fields) as (keyof typeof style.fields)[]).map((k) => (
                  <label key={k} className="flex items-center justify-between gap-2 py-0.5 cursor-pointer">
                    <span className="text-fg-2 capitalize">{fieldLabel(k)}</span>
                    <input
                      type="checkbox"
                      checked={style.fields[k]}
                      onChange={(e) =>
                        setStyle((s) => (s ? { ...s, fields: { ...s.fields, [k]: e.target.checked } } : s))
                      }
                      className="accent-brand-amber"
                    />
                  </label>
                ))}
              </div>
            )}
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
            {style?.logoPath && (
              <div className="text-[10.5px] text-sem-success mt-1">已选择 Logo</div>
            )}
            <div className="text-[10.5px] text-fg-3 mt-1.5 leading-relaxed">
              ⚠ 请上传你有权使用的 Logo。应用不内置任何受商标保护的品牌 Logo。
            </div>
          </div>

          <button
            type="button"
            className="btn-primary w-full"
            onClick={async () => {
              if (!refPhoto?.path || !style) return
              try {
                const resultUrl = await ipc('watermark:render', refPhoto.path, style)
                // 打开预览（用新 tab 或弹窗显示渲染结果）
                if (resultUrl) {
                  window.open(resultUrl, '_blank', 'width=800,height=600')
                }
              } catch (err) {
                window.alert(`水印渲染失败：${(err as Error).message}`)
              }
            }}
          >
            <Check className="w-3.5 h-3.5" />
            应用到当前图
          </button>
        </aside>
      </div>
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

/** HTML 预览（真实渲染由主进程 Sharp 实装，M6） */
function WatermarkOverlay({
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
