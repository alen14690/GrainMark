import { Cloud, Cpu, Download, Eraser, Scan, Sparkles, Wand } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AICapability, AIModel } from '../../shared/types'
import { ipc } from '../lib/ipc'

const CAPS: {
  id: AICapability
  title: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}[] = [
  {
    id: 'denoise',
    title: '智能降噪',
    desc: '高 ISO 噪点消除，保留细节',
    icon: Scan,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'super-resolution',
    title: '超分辨率',
    desc: '无损放大 2×/4×，老照片复活',
    icon: Wand,
    color: 'from-violet-500 to-purple-500',
  },
  {
    id: 'sky-replace',
    title: '天空替换',
    desc: '一键替换为日落、星空等天空',
    icon: Cloud,
    color: 'from-orange-400 to-pfg-3',
  },
  {
    id: 'inpaint',
    title: '瑕疵消除',
    desc: '移除路人、电线、污点',
    icon: Eraser,
    color: 'from-emerald-500 to-teal-500',
  },
  {
    id: 'recommend',
    title: '滤镜推荐',
    desc: 'CLIP 图像理解，推荐 TOP 3 滤镜',
    icon: Sparkles,
    color: 'from-brand-amber to-amber-500',
  },
]

export default function AIStudio() {
  const [models, setModels] = useState<AIModel[]>([])

  useEffect(() => {
    ipc('ai:listModels').then(setModels)
  }, [])

  return (
    <div className="p-6 animate-fade-in">
      <div className="card p-5 mb-5 bg-gradient-to-br from-brand-amber/10 to-transparent border-brand-amber/20">
        <div className="flex items-center gap-3">
          <Cpu className="w-5 h-5 text-brand-amber" />
          <div className="flex-1">
            <div className="text-[14px] font-semibold">本地 AI 推理</div>
            <div className="text-[11.5px] text-fg-2 mt-0.5">
              所有 AI 能力均在你的电脑本地运行（ONNX
              Runtime），照片不上传任何服务器；未来版本将增加可选云端加速。
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {CAPS.map((cap) => {
          const model = models.find((m) => m.capability === cap.id)
          const Icon = cap.icon
          return (
            <div key={cap.id} className="card p-5 relative overflow-hidden group">
              <div
                className={`absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br ${cap.color} opacity-10 blur-xl group-hover:opacity-20 transition-opacity`}
              />
              <div
                className={`w-10 h-10 rounded-lg bg-gradient-to-br ${cap.color} flex items-center justify-center shadow-lg`}
              >
                <Icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="mt-3 text-[14px] font-semibold">{cap.title}</h3>
              <p className="text-[11.5px] text-fg-2 mt-1 leading-relaxed">{cap.desc}</p>
              {model && (
                <div className="mt-3 pt-3 border-t border-bg-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-fg-2 font-mono truncate">{model.name}</span>
                    <span className="text-fg-3 font-mono">
                      {(model.sizeBytes / 1024 / 1024).toFixed(0)} MB
                    </span>
                  </div>
                  <button
                    className={`mt-2 w-full btn py-1.5 text-[11.5px] ${
                      model.installed ? 'btn-secondary' : 'btn-primary'
                    }`}
                    onClick={() => !model.installed && ipc('ai:downloadModel', model.id)}
                  >
                    {model.installed ? (
                      '运行'
                    ) : (
                      <>
                        <Download className="w-3 h-3" />
                        下载模型
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="card p-5">
        <h3 className="text-[13px] font-semibold mb-3">开发路线</h3>
        <ul className="space-y-1.5 text-[12px] text-fg-2 leading-relaxed">
          <li>
            • <b className="text-fg-1">M7</b> 接入 ONNX Runtime（Node + Web），支持 CPU / CUDA / CoreML /
            DirectML
          </li>
          <li>
            • 降噪模型：<code className="text-brand-amber font-mono">NAFNet</code>
          </li>
          <li>
            • 超分模型：<code className="text-brand-amber font-mono">Real-ESRGAN</code>
          </li>
          <li>
            • 分割模型：<code className="text-brand-amber font-mono">SAM (mobile)</code>
          </li>
          <li>
            • 消除模型：<code className="text-brand-amber font-mono">LaMa Inpainting</code>
          </li>
          <li>
            • 推荐模型：<code className="text-brand-amber font-mono">CLIP ViT-B/32</code>{' '}
            做图像与滤镜的向量匹配
          </li>
        </ul>
      </div>
    </div>
  )
}
