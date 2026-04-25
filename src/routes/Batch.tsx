import { FileImage, FolderOpen, Play, X } from 'lucide-react'
import { useState } from 'react'
import type { BatchJobConfig } from '../../shared/types'
import { thumbSrc } from '../lib/grainUrl'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'

export default function Batch() {
  const selectedIds = useAppStore((s) => s.selectedPhotoIds)
  const photos = useAppStore((s) => s.photos)
  const filters = useAppStore((s) => s.filters)
  const settings = useAppStore((s) => s.settings)

  const [filterId, setFilterId] = useState<string | null>(null)
  const [outputDir, setOutputDir] = useState<string>(settings?.export.defaultOutputDir ?? '')
  const [format, setFormat] = useState<BatchJobConfig['format']>('jpg')
  const [quality, setQuality] = useState<number>(92)
  const [keepExif, setKeepExif] = useState(true)
  const [watermarkEnabled, setWatermarkEnabled] = useState(false)
  const [namingTemplate, setNamingTemplate] = useState('{name}_{filter}_{date}')
  const [concurrency, setConcurrency] = useState(4)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const selectedPhotos = photos.filter((p) => selectedIds.includes(p.id))

  const handlePickDir = async () => {
    const dir = await ipc('dialog:selectDir')
    if (dir) setOutputDir(dir)
  }

  const handleStart = async () => {
    if (selectedPhotos.length === 0) {
      setStatus('⚠ 请先到图库选择照片')
      return
    }
    if (!outputDir) {
      setStatus('⚠ 请选择输出目录')
      return
    }
    setRunning(true)
    setStatus('任务已提交，正在处理...')
    try {
      const config: BatchJobConfig = {
        filterId,
        watermarkTemplateId: watermarkEnabled ? 'minimal-bar' : null,
        outputDir,
        format,
        quality,
        keepExif,
        colorSpace: 'srgb',
        namingTemplate,
        concurrency,
      }
      const jobId = await ipc(
        'batch:start',
        config,
        selectedPhotos.map((p) => p.path),
      )
      setStatus(`✓ 任务 ${jobId} 已创建（M3 将实装真实并行处理）`)
    } catch (e) {
      setStatus(`✗ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="grid grid-cols-5 gap-6">
        {/* 已选照片 */}
        <div className="col-span-2 card p-4 flex flex-col">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileImage className="w-4 h-4 text-accent-400" />
            已选照片 <span className="pill">{selectedPhotos.length}</span>
          </h3>
          <div className="flex-1 overflow-y-auto space-y-1 max-h-[480px] pr-1">
            {selectedPhotos.length === 0 ? (
              <div className="text-xs text-ink-500 py-10 text-center">到图库选中想批量处理的照片</div>
            ) : (
              selectedPhotos.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-ink-900 text-[12px]"
                >
                  {p.thumbPath && <img src={thumbSrc(p)} className="w-8 h-8 object-cover rounded" alt="" />}
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-[10px] text-ink-500 font-mono">{p.format.toUpperCase()}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 配置 */}
        <div className="col-span-3 card p-5 space-y-5">
          <div>
            <Label>滤镜</Label>
            <select
              value={filterId ?? ''}
              onChange={(e) => setFilterId(e.target.value || null)}
              className="input"
            >
              <option value="">不应用滤镜（仅导出原图）</option>
              {filters.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · ♦{f.popularity}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>输出目录</Label>
            <div className="flex gap-2">
              <input
                value={outputDir}
                readOnly
                placeholder="选择输出目录..."
                className="input flex-1 font-mono text-[11.5px]"
              />
              <button onClick={handlePickDir} className="btn-secondary shrink-0">
                <FolderOpen className="w-3.5 h-3.5" />
                选择
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>格式</Label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as BatchJobConfig['format'])}
                className="input"
              >
                <option value="jpg">JPEG</option>
                <option value="png">PNG</option>
                <option value="tiff">TIFF</option>
                <option value="webp">WebP</option>
                <option value="avif">AVIF</option>
              </select>
            </div>
            <div>
              <Label>质量 {quality}</Label>
              <input
                type="range"
                min={40}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <Label>命名模板</Label>
            <input
              value={namingTemplate}
              onChange={(e) => setNamingTemplate(e.target.value)}
              className="input font-mono text-[12px]"
              placeholder="{name}_{filter}_{date}"
            />
            <div className="text-[10.5px] text-ink-500 mt-1.5 font-mono">
              可用变量：{'{name} {filter} {date} {model} {iso}'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>并行数 {concurrency}</Label>
              <input
                type="range"
                min={1}
                max={16}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <Toggle label="保留 EXIF" checked={keepExif} onChange={setKeepExif} />
              <Toggle label="叠加水印" checked={watermarkEnabled} onChange={setWatermarkEnabled} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleStart} disabled={running} className="btn-primary flex-1">
              <Play className="w-4 h-4" />
              {running ? '处理中...' : `开始批量处理 (${selectedPhotos.length})`}
            </button>
            <button className="btn-ghost" disabled={!running}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {status && (
            <div className="text-[11.5px] text-ink-300 bg-ink-900 rounded-lg px-3 py-2 font-mono">
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-ink-400 uppercase tracking-wider font-mono mb-1.5">{children}</div>
}

function Toggle({
  label,
  checked,
  onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-[12.5px] text-ink-200">
      <span
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-8 h-[18px] rounded-full relative transition-colors ${checked ? 'bg-accent-500' : 'bg-ink-700'}`}
      >
        <span
          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
      {label}
    </label>
  )
}
