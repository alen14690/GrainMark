import { AlertTriangle, FileImage, FolderOpen, Play, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BatchJobConfig, BatchJobItem, FilterPipeline } from '../../shared/types'
import { thumbSrc } from '../lib/grainUrl'
import { ipc, ipcOn } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'

/**
 * 批处理页 (M3)
 * - 订阅 batch:progress 事件实时更新每张照片状态
 * - 显示整体进度条 + 失败/成功统计
 * - 真实 cancel：向主进程 IPC 发 batch:cancel
 * - 对含不支持通道（curves/hsl/colorGrading/grain/halation/lut）的滤镜给出黄色警告
 */

interface BatchProgressEvent {
  jobId: string
  itemId?: string
  status?: BatchJobItem['status']
  progress?: number
  outputPath?: string
  error?: string
  completed: number
  total: number
  jobStatus: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
}

const UNSUPPORTED_CHANNEL_LABELS: Record<string, string> = {
  curves: '曲线',
  hsl: 'HSL',
  colorGrading: '色彩分级',
  grain: '颗粒',
  halation: '光晕',
  lut: 'LUT',
}

function detectIgnoredChannelsClient(pipeline: FilterPipeline | null | undefined): string[] {
  if (!pipeline) return []
  const out: string[] = []
  if (pipeline.curves && Object.values(pipeline.curves).some((a) => Array.isArray(a) && a.length > 0)) {
    out.push('curves')
  }
  if (pipeline.hsl && Object.values(pipeline.hsl).some(Boolean)) out.push('hsl')
  if (pipeline.colorGrading && Object.values(pipeline.colorGrading).some(Boolean)) out.push('colorGrading')
  if (pipeline.grain && (pipeline.grain.amount ?? 0) > 0) out.push('grain')
  if (pipeline.halation && (pipeline.halation.amount ?? 0) > 0) out.push('halation')
  if (pipeline.lut) out.push('lut')
  return out
}

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

  // job 运行态
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<'idle' | 'running' | 'success' | 'failed' | 'cancelled'>('idle')
  const [completed, setCompleted] = useState(0)
  const [total, setTotal] = useState(0)
  const [itemStates, setItemStates] = useState<
    Record<string, { status: BatchJobItem['status']; error?: string; outputPath?: string }>
  >({})
  const jobIdRef = useRef<string | null>(null)

  const selectedPhotos = photos.filter((p) => selectedIds.includes(p.id))
  const activeFilter = filters.find((f) => f.id === filterId) ?? null
  const ignoredChannels = useMemo(() => detectIgnoredChannelsClient(activeFilter?.pipeline), [activeFilter])

  // 订阅主进程进度
  useEffect(() => {
    const off = ipcOn<BatchProgressEvent>('batch:progress', (evt) => {
      // 只响应当前 job（避免被之前 job 的残留事件污染）
      if (jobIdRef.current && evt.jobId !== jobIdRef.current) return
      setCompleted(evt.completed)
      setTotal(evt.total)
      setJobStatus(evt.jobStatus === 'pending' ? 'running' : evt.jobStatus)
      if (evt.itemId && evt.status) {
        setItemStates((prev) => ({
          ...prev,
          [evt.itemId!]: {
            status: evt.status!,
            error: evt.error,
            outputPath: evt.outputPath,
          },
        }))
      }
    })
    return off
  }, [])

  const handlePickDir = async () => {
    const dir = await ipc('dialog:selectDir')
    if (dir) setOutputDir(dir)
  }

  const handleStart = async () => {
    if (selectedPhotos.length === 0) return
    if (!outputDir) return
    setJobStatus('running')
    setCompleted(0)
    setTotal(selectedPhotos.length)
    setItemStates({})
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
      const id = await ipc(
        'batch:start',
        config,
        selectedPhotos.map((p) => p.path),
      )
      jobIdRef.current = id
      setJobId(id)
    } catch (e) {
      setJobStatus('failed')
      console.error('[batch]', e)
    }
  }

  const handleCancel = async () => {
    if (!jobId) return
    try {
      await ipc('batch:cancel', jobId)
    } catch (e) {
      console.error('[batch:cancel]', e)
    }
  }

  const isRunning = jobStatus === 'running'
  const overallPct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="grid grid-cols-5 gap-6">
        {/* 已选照片 */}
        <div className="col-span-2 card p-4 flex flex-col">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FileImage className="w-4 h-4 text-brand-amber" />
            已选照片 <span className="pill">{selectedPhotos.length}</span>
          </h3>
          <div className="flex-1 overflow-y-auto space-y-1 max-h-[480px] pr-1">
            {selectedPhotos.length === 0 ? (
              <div className="text-xs text-fg-3 py-10 text-center">到图库选中想批量处理的照片</div>
            ) : (
              selectedPhotos.map((p) => {
                // item 状态（jobId 建立后，itemStates 的 key 是 server-side item id，
                // 这里按「selectedPhotos 顺序」无法直接索引，故改为显示当前 completed 的累积视图）
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-1 text-[12px]"
                  >
                    {p.thumbPath && <img src={thumbSrc(p)} className="w-8 h-8 object-cover rounded" alt="" />}
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-[10px] text-fg-3 font-mono">{p.format.toUpperCase()}</span>
                  </div>
                )
              })
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
              disabled={isRunning}
            >
              <option value="">不应用滤镜（仅导出原图）</option>
              {filters.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · ♦{f.popularity}
                </option>
              ))}
            </select>
            {ignoredChannels.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-brand-violet/10 border border-brand-violet/30 px-2.5 py-1.5 text-[11px] text-brand-violet">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  包含高级通道
                  <span className="font-mono font-semibold mx-1">
                    {ignoredChannels.map((c) => UNSUPPORTED_CHANNEL_LABELS[c] ?? c).join(' / ')}
                  </span>
                  ，将自动走 <span className="font-semibold">GPU 批处理</span>（隐藏渲染窗口，首次启动约 1-2 秒，后续复用）。
                </div>
              </div>
            )}
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
              <button
                type="button"
                onClick={handlePickDir}
                className="btn-secondary shrink-0"
                disabled={isRunning}
              >
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
                disabled={isRunning}
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
                disabled={isRunning}
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
              disabled={isRunning}
            />
            <div className="text-[10.5px] text-fg-3 mt-1.5 font-mono">
              可用变量：{'{name} {filter} {date} {time} {datetime} {model} {iso} {index}'}
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
                disabled={isRunning}
              />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <Toggle label="保留 EXIF" checked={keepExif} onChange={setKeepExif} disabled={isRunning} />
              <Toggle
                label="叠加水印"
                checked={watermarkEnabled}
                onChange={setWatermarkEnabled}
                disabled={isRunning}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleStart}
              disabled={isRunning || selectedPhotos.length === 0 || !outputDir}
              className="btn-primary flex-1"
            >
              <Play className="w-4 h-4" />
              {isRunning ? `处理中 ${completed}/${total}...` : `开始批量处理 (${selectedPhotos.length})`}
            </button>
            <button type="button" onClick={handleCancel} className="btn-ghost" disabled={!isRunning}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 运行状态 & 进度条 */}
          {(isRunning || jobStatus !== 'idle') && total > 0 && (
            <div className="space-y-2 pt-1">
              <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden">
                <div className="h-full bg-brand-amber transition-all" style={{ width: `${overallPct}%` }} />
              </div>
              <div className="text-[11.5px] text-fg-2 font-mono flex justify-between">
                <span>
                  {jobStatus === 'success' && '✓ 完成'}
                  {jobStatus === 'failed' && '✗ 失败（有条目未成功）'}
                  {jobStatus === 'cancelled' && '已取消'}
                  {jobStatus === 'running' && `处理中 · ${overallPct}%`}
                </span>
                <span>
                  {completed} / {total}
                  {(() => {
                    const vals = Object.values(itemStates)
                    const failed = vals.filter((s) => s.status === 'failed').length
                    const cancelled = vals.filter((s) => s.status === 'cancelled').length
                    if (failed + cancelled === 0) return null
                    return (
                      <span className="ml-2 text-fg-3">
                        {failed > 0 && `失败 ${failed}`}
                        {failed > 0 && cancelled > 0 && ' · '}
                        {cancelled > 0 && `取消 ${cancelled}`}
                      </span>
                    )
                  })()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono mb-1.5">{children}</div>
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-[12.5px] text-fg-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`w-8 h-[18px] rounded-full relative transition-colors ${checked ? 'bg-brand-amber' : 'bg-bg-3'} ${disabled ? 'opacity-50' : ''}`}
      >
        <span
          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </button>
      {label}
    </label>
  )
}
