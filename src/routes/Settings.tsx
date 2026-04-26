import {
  Cloud,
  Cpu,
  FolderOpen,
  Image as ImgIcon,
  KeyRound,
  Palette,
  RotateCcw,
  Shield,
  Stamp,
} from 'lucide-react'
import { useState } from 'react'
import type { AppSettings } from '../../shared/types'
import { ipc } from '../lib/ipc'
import { useAppStore } from '../stores/appStore'
import { LLMConfigCard } from './settings/LLMConfigCard'

type TabId =
  | 'general'
  | 'import'
  | 'export'
  | 'filter'
  | 'watermark'
  | 'ai'
  | 'sync'
  | 'shortcuts'
  | 'privacy'
  | 'about'

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'general', label: '通用', icon: Palette },
  { id: 'import', label: '导入', icon: ImgIcon },
  { id: 'export', label: '导出', icon: FolderOpen },
  { id: 'filter', label: '滤镜', icon: Palette },
  { id: 'watermark', label: '水印', icon: Stamp },
  { id: 'ai', label: 'AI', icon: Cpu },
  { id: 'sync', label: '云同步', icon: Cloud },
  { id: 'shortcuts', label: '快捷键', icon: KeyRound },
  { id: 'privacy', label: '隐私', icon: Shield },
  { id: 'about', label: '关于', icon: RotateCcw },
]

export default function Settings() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  const [tab, setTab] = useState<TabId>('general')

  if (!settings) return <div className="p-8 text-fg-3">加载中...</div>

  const pickDir = async (set: (path: string) => void) => {
    const dir = await ipc('dialog:selectDir')
    if (dir) set(dir)
  }

  return (
    <div className="flex h-full animate-fade-in">
      {/* 左侧 tab */}
      <aside className="w-48 shrink-0 border-r border-bg-1 py-4 px-2 bg-bg-0/60">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] transition-all ${
                tab === t.id ? 'bg-bg-2 text-fg-1 font-medium' : 'text-fg-2 hover:bg-bg-1 hover:text-fg-1'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </aside>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl space-y-6">
          {tab === 'general' && (
            <Section title="通用">
              <Row label="语言">
                <Select
                  value={settings.general.language}
                  onChange={(v) =>
                    update({
                      general: { ...settings.general, language: v as AppSettings['general']['language'] },
                    })
                  }
                  options={[
                    { value: 'zh-CN', label: '简体中文' },
                    { value: 'en-US', label: 'English' },
                    { value: 'ja-JP', label: '日本語' },
                  ]}
                />
              </Row>
              <Row label="主题">
                <Select
                  value={settings.general.theme}
                  onChange={(v) =>
                    update({ general: { ...settings.general, theme: v as AppSettings['general']['theme'] } })
                  }
                  options={[
                    { value: 'dark', label: '深色' },
                    { value: 'light', label: '浅色' },
                    { value: 'system', label: '跟随系统' },
                    { value: 'film', label: '胶片褐' },
                  ]}
                />
              </Row>
              <Row label="硬件加速" desc="启用 GPU 加速图像处理与 AI 推理">
                <Switch
                  checked={settings.general.hardwareAcceleration}
                  onChange={(v) => update({ general: { ...settings.general, hardwareAcceleration: v } })}
                />
              </Row>
            </Section>
          )}

          {tab === 'import' && (
            <Section title="照片与导入">
              <Row label="默认导入目录">
                <DirPicker
                  value={settings.import.defaultImportDir}
                  onPick={() =>
                    pickDir((p) => update({ import: { ...settings.import, defaultImportDir: p } }))
                  }
                />
              </Row>
              <Row label="RAW 色彩配置">
                <Select
                  value={settings.import.rawColorProfile}
                  onChange={(v) =>
                    update({
                      import: {
                        ...settings.import,
                        rawColorProfile: v as AppSettings['import']['rawColorProfile'],
                      },
                    })
                  }
                  options={[
                    { value: 'camera', label: '相机原生色彩' },
                    { value: 'adobe-standard', label: 'Adobe Standard' },
                    { value: 'neutral', label: '中性' },
                  ]}
                />
              </Row>
              <Row label="缩略图缓存" desc={`当前 ${settings.import.thumbnailCacheMB} MB`}>
                <input
                  type="range"
                  min={512}
                  max={8192}
                  step={256}
                  value={settings.import.thumbnailCacheMB}
                  onChange={(e) =>
                    update({ import: { ...settings.import, thumbnailCacheMB: Number(e.target.value) } })
                  }
                  className="w-40"
                />
              </Row>
            </Section>
          )}

          {tab === 'export' && (
            <Section title="导出">
              <Row label="默认输出目录 ⭐" desc="批量处理默认会把成品输出到这里">
                <DirPicker
                  value={settings.export.defaultOutputDir}
                  onPick={() =>
                    pickDir((p) => update({ export: { ...settings.export, defaultOutputDir: p } }))
                  }
                />
              </Row>
              <Row label="文件命名模板" desc="可用：{name} {filter} {date} {model} {iso}">
                <input
                  className="input font-mono text-[12px]"
                  value={settings.export.namingTemplate}
                  onChange={(e) => update({ export: { ...settings.export, namingTemplate: e.target.value } })}
                />
              </Row>
              <Row label="默认格式">
                <Select
                  value={settings.export.defaultFormat}
                  onChange={(v) =>
                    update({
                      export: {
                        ...settings.export,
                        defaultFormat: v as AppSettings['export']['defaultFormat'],
                      },
                    })
                  }
                  options={[
                    { value: 'jpg', label: 'JPEG' },
                    { value: 'png', label: 'PNG' },
                    { value: 'tiff', label: 'TIFF' },
                    { value: 'webp', label: 'WebP' },
                  ]}
                />
              </Row>
              <Row label={`默认质量 ${settings.export.defaultQuality}`}>
                <input
                  type="range"
                  min={40}
                  max={100}
                  value={settings.export.defaultQuality}
                  onChange={(e) =>
                    update({ export: { ...settings.export, defaultQuality: Number(e.target.value) } })
                  }
                  className="w-40"
                />
              </Row>
              <Row label="保留 EXIF 元数据">
                <Switch
                  checked={settings.export.keepExif}
                  onChange={(v) => update({ export: { ...settings.export, keepExif: v } })}
                />
              </Row>
              <Row label={`批处理并行数 ${settings.export.concurrency}`}>
                <input
                  type="range"
                  min={1}
                  max={16}
                  value={settings.export.concurrency}
                  onChange={(e) =>
                    update({ export: { ...settings.export, concurrency: Number(e.target.value) } })
                  }
                  className="w-40"
                />
              </Row>
            </Section>
          )}

          {tab === 'filter' && (
            <Section title="滤镜">
              <Row label="热度榜更新频率">
                <Select
                  value={String(settings.filter.trendingUpdateHours)}
                  onChange={(v) => update({ filter: { ...settings.filter, trendingUpdateHours: Number(v) } })}
                  options={[
                    { value: '6', label: '每 6 小时' },
                    { value: '12', label: '每 12 小时' },
                    { value: '24', label: '每天' },
                    { value: '168', label: '每周' },
                  ]}
                />
              </Row>
              <Row label="自动推荐滤镜" desc="上传照片时根据内容自动推荐 TOP 3">
                <Switch
                  checked={settings.filter.autoRecommend}
                  onChange={(v) => update({ filter: { ...settings.filter, autoRecommend: v } })}
                />
              </Row>
            </Section>
          )}

          {tab === 'watermark' && (
            <Section title="水印">
              <Row label="摄影师姓名" desc="将写入 EXIF Artist 字段">
                <input
                  className="input"
                  value={settings.watermark.artistName}
                  onChange={(e) =>
                    update({ watermark: { ...settings.watermark, artistName: e.target.value } })
                  }
                  placeholder="John Doe"
                />
              </Row>
              <Row label="版权信息">
                <input
                  className="input"
                  value={settings.watermark.copyright}
                  onChange={(e) =>
                    update({ watermark: { ...settings.watermark, copyright: e.target.value } })
                  }
                  placeholder="© 2026 John Doe"
                />
              </Row>
              <Row label="默认 Logo (PNG)" desc="请确保你有权使用该 Logo">
                <button className="btn-secondary text-[12px]">
                  <ImgIcon className="w-3.5 h-3.5" />
                  {settings.watermark.defaultLogoPath ? '更换' : '上传'} Logo
                </button>
              </Row>
              <Row label="默认启用水印">
                <Switch
                  checked={settings.watermark.enabledByDefault}
                  onChange={(v) => update({ watermark: { ...settings.watermark, enabledByDefault: v } })}
                />
              </Row>
              <div className="text-[11px] text-fg-3 leading-relaxed mt-2 pt-3 border-t border-bg-1">
                ⚠ 合规提示：GrainMark 不内置任何受商标保护的品牌 Logo（如 Leica / Canon / Nikon 等）。
                <br />
                如需品牌 Logo 水印，请上传你自有或已获授权的 Logo 文件。
              </div>
            </Section>
          )}

          {tab === 'ai' && (
            <Section title="AI 推理">
              <Row label="GPU 加速" desc="启用 GPU 可大幅提速（CUDA / CoreML / DirectML 自动选择）">
                <Switch
                  checked={settings.ai.gpuEnabled}
                  onChange={(v) => update({ ai: { ...settings.ai, gpuEnabled: v } })}
                />
              </Row>
              <Row label="计算设备">
                <Select
                  value={settings.ai.device}
                  onChange={(v) =>
                    update({ ai: { ...settings.ai, device: v as AppSettings['ai']['device'] } })
                  }
                  options={[
                    { value: 'auto', label: '自动选择' },
                    { value: 'cpu', label: 'CPU' },
                    { value: 'cuda', label: 'NVIDIA GPU (CUDA)' },
                    { value: 'coreml', label: 'Apple Silicon (CoreML)' },
                    { value: 'directml', label: 'Windows GPU (DirectML)' },
                  ]}
                />
              </Row>
              <div className="text-[11px] text-fg-3 leading-relaxed pt-3 border-t border-bg-1">
                🔒 本地 AI 能力（降噪 / 超分 / 抠图等）完全运行在你的电脑上，照片不会离开硬盘。
                <br />
                如需使用「AI 摄影顾问」等云端能力，请在下方配置 OpenRouter。
              </div>
              <LLMConfigCard />
            </Section>
          )}

          {tab === 'sync' && (
            <Section title="云同步">
              <Row label="启用云同步">
                <Switch
                  checked={settings.sync.enabled}
                  onChange={(v) => update({ sync: { ...settings.sync, enabled: v } })}
                />
              </Row>
              <Row label="冲突策略">
                <Select
                  value={settings.sync.conflictStrategy}
                  onChange={(v) =>
                    update({
                      sync: {
                        ...settings.sync,
                        conflictStrategy: v as AppSettings['sync']['conflictStrategy'],
                      },
                    })
                  }
                  options={[
                    { value: 'newer-wins', label: '较新版本优先' },
                    { value: 'local-wins', label: '本地优先' },
                    { value: 'remote-wins', label: '云端优先' },
                    { value: 'ask', label: '每次询问' },
                  ]}
                />
              </Row>
              <div className="text-[11.5px] text-fg-2 space-y-1.5 pt-3 border-t border-bg-1">
                <div className="font-medium text-fg-1">支持的云服务：</div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-fg-2">
                  <div>• iCloud Drive</div>
                  <div>• Microsoft OneDrive</div>
                  <div>• Google Drive</div>
                  <div>• Dropbox</div>
                  <div>• 阿里云盘</div>
                  <div>• 百度网盘</div>
                  <div>• 腾讯云 COS</div>
                  <div>• WebDAV / S3 兼容</div>
                </div>
                <div className="text-[10.5px] text-fg-3 pt-2">M9 将实装完整账号绑定流程</div>
              </div>
              <div className="pt-2">
                <Row label="同步项">
                  <div />
                </Row>
                <div className="space-y-1 -mt-4">
                  <SubSwitch
                    label="滤镜库"
                    checked={settings.sync.syncFilters}
                    onChange={(v) => update({ sync: { ...settings.sync, syncFilters: v } })}
                  />
                  <SubSwitch
                    label="水印模板"
                    checked={settings.sync.syncWatermarks}
                    onChange={(v) => update({ sync: { ...settings.sync, syncWatermarks: v } })}
                  />
                  <SubSwitch
                    label="应用设置"
                    checked={settings.sync.syncSettings}
                    onChange={(v) => update({ sync: { ...settings.sync, syncSettings: v } })}
                  />
                  <SubSwitch
                    label="原始照片（占用大）"
                    checked={settings.sync.syncOriginals}
                    onChange={(v) => update({ sync: { ...settings.sync, syncOriginals: v } })}
                  />
                </div>
              </div>
            </Section>
          )}

          {tab === 'shortcuts' && (
            <Section title="快捷键">
              <div className="space-y-2">
                {Object.entries(settings.shortcuts).map(([key, combo]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-2 border-b border-bg-1/80 last:border-0"
                  >
                    <span className="text-[12.5px] text-fg-1">{shortcutLabel(key)}</span>
                    <span className="kbd">{combo}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {tab === 'privacy' && (
            <Section title="隐私与数据">
              <Row label="匿名使用统计" desc="帮助改进产品，不收集任何照片内容">
                <Switch
                  checked={settings.privacy.anonymousStats}
                  onChange={(v) => update({ privacy: { anonymousStats: v } })}
                />
              </Row>
              <Row label="清除缩略图缓存">
                <button className="btn-secondary text-[11.5px]">清除</button>
              </Row>
              <Row label="导出全部数据">
                <button className="btn-secondary text-[11.5px]">导出 .zip</button>
              </Row>
            </Section>
          )}

          {tab === 'about' && (
            <Section title="关于 GrainMark">
              <div className="card p-5 bg-gradient-to-br from-brand-amber/10 to-transparent border-brand-amber/20">
                <div className="text-[20px] font-display font-semibold">GrainMark AI 后期</div>
                <div className="text-[12px] text-fg-2 mt-1 font-mono">v1.0.0 · M1 Foundation</div>
                <p className="text-[12px] text-fg-2 mt-4 leading-relaxed">
                  专业级胶片风格照片后期桌面应用。
                  <br />
                  参数化滤镜 · AI 修图 · 批量处理 · EXIF 驱动水印 · 云同步
                </p>
              </div>
              <div className="text-[11.5px] text-fg-2 space-y-1.5">
                <div>• React 18 + TypeScript + Electron 32</div>
                <div>• Sharp (libvips) · ONNX Runtime · exiftool-vendored</div>
                <div>• Tailwind CSS · Zustand · React Router</div>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

// ========== 组件 ==========
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[11px] text-fg-3 uppercase tracking-widest font-mono mb-3">{title}</h2>
      <div className="card p-5 space-y-4">{children}</div>
    </div>
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-fg-1">{label}</div>
        {desc && <div className="text-[11px] text-fg-3 mt-0.5 leading-relaxed">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="input py-1.5 text-[12px] w-44"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full relative transition-colors ${checked ? 'bg-brand-amber' : 'bg-bg-3'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
      />
    </button>
  )
}

function SubSwitch({
  label,
  checked,
  onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-1 cursor-pointer">
      <span className="text-[12px] text-fg-2">{label}</span>
      <Switch checked={checked} onChange={onChange} />
    </label>
  )
}

function DirPicker({ value, onPick }: { value: string; onPick: () => void }) {
  return (
    <div className="flex gap-2">
      <input value={value} readOnly className="input w-64 font-mono text-[11px]" />
      <button onClick={onPick} className="btn-secondary text-[11.5px]">
        <FolderOpen className="w-3.5 h-3.5" />
        选择
      </button>
    </div>
  )
}

function shortcutLabel(key: string): string {
  const map: Record<string, string> = {
    export: '导出',
    undo: '撤销',
    redo: '重做',
    'toggle-before-after': '前后对比（按住查看原图）',
    'next-photo': '下一张',
    'prev-photo': '上一张',
    'apply-filter': '应用当前滤镜',
  }
  return map[key] ?? key
}
