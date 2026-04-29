import { FlaskConical, Sparkles, Upload } from 'lucide-react'
import { useState } from 'react'
import type { FilterPreset } from '../../shared/types'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'

export default function Extract() {
  const refreshFilters = useAppStore((s) => s.refreshFilters)
  const [refPath, setRefPath] = useState<string | null>(null)
  const [refThumbUrl, setRefThumbUrl] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [result, setResult] = useState<FilterPreset | null>(null)

  const handlePick = async () => {
    const paths = await ipc('dialog:selectFiles', { multi: false })
    if (paths.length === 0) return
    const p = paths[0]
    setRefPath(p)
    // 生成缩略图以便通过 grain:// 显示
    try {
      const thumbPath = await ipc('photo:thumb', p, 720)
      const basename = thumbPath.split(/[/\\]/).pop() ?? ''
      setRefThumbUrl(`grain://thumb/${encodeURIComponent(basename)}`)
    } catch {
      setRefThumbUrl(null)
    }
  }

  const handleExtract = async () => {
    if (!refPath) return
    setExtracting(true)
    try {
      const preset = await ipc('extract:fromReference', refPath, undefined)
      setResult(preset)
      await refreshFilters()
    } catch (e) {
      alert(`提取失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExtracting(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="card p-6 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-brand-amber/15 border border-brand-amber/30 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-brand-amber" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold">从参考作品提取滤镜风格</h2>
            <p className="text-[12px] text-fg-2 mt-0.5">
              上传一张你欣赏的摄影作品，系统将分析其色彩、色调、颗粒等特征，自动生成可复用的滤镜
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono mb-2">参考图</div>
            <div
              onClick={handlePick}
              className="aspect-[4/3] rounded-xl border-2 border-dashed border-bg-2 hover:border-brand-amber/50 flex items-center justify-center cursor-pointer overflow-hidden bg-bg-1/50 transition-colors"
            >
              {refPath ? (
                <img src={refThumbUrl ?? ''} alt="ref" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center text-fg-3">
                  <Upload className="w-8 h-8 mx-auto mb-2" />
                  <div className="text-[13px]">点击选择参考图</div>
                  <div className="text-[10.5px] mt-1">支持 JPG / PNG / TIFF / HEIC / RAW</div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] text-fg-2 uppercase tracking-wider font-mono">提取算法 (L2)</div>
            <div className="card p-3 space-y-2.5 text-[12px] text-fg-2 border-bg-2">
              <Step n={1} title="LAB 色彩空间统计" desc="均值 / 标准差 / 分区统计" />
              <Step n={2} title="Reinhard 色彩迁移" desc="将风格色调映射到参数化管线" />
              <Step n={3} title="分区色偏分析" desc="提取高光 / 中间调 / 阴影色彩分级" />
              <Step n={4} title="3D LUT 反推" desc="烘焙标准 .cube，兼容 DaVinci / PR" />
              <Step n={5} title="颗粒频谱估计" desc="检测胶片颗粒强度与粒度" />
            </div>
            <button type="button" onClick={handleExtract} disabled={!refPath || extracting} className="btn-primary w-full">
              <Sparkles className="w-4 h-4" />
              {extracting ? '提取中...' : '开始提取'}
            </button>
            <div className="text-[10.5px] text-fg-3 leading-relaxed">
              💡 首发为占位版本（返回基础白平衡估算）。
              <br />
              M5 将上线完整的 L2 算法 — 色彩迁移 + LUT 反推。
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="card p-5 animate-slide-up border-brand-amber/40">
          <div className="flex items-center gap-3 mb-3">
            <Sparkles className="w-5 h-5 text-brand-amber" />
            <h3 className="text-[14px] font-semibold">已生成新滤镜</h3>
          </div>
          <div className="flex items-start gap-4">
            <div className="card bg-bg-1 p-3 flex-1">
              <div className="text-[13px] font-medium">{result.name}</div>
              <div className="text-[10.5px] text-fg-3 mt-1 font-mono">ID: {result.id}</div>
              <div className="text-[11px] text-fg-2 mt-3">
                参数预览：
                <pre className="text-[10.5px] text-fg-3 mt-1 overflow-x-auto font-mono">
                  {JSON.stringify(result.pipeline, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-5 h-5 shrink-0 rounded-full bg-bg-2 flex items-center justify-center text-[10px] font-mono text-fg-2">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-fg-1 font-medium">{title}</div>
        <div className="text-[10.5px] text-fg-3 leading-relaxed">{desc}</div>
      </div>
    </div>
  )
}
