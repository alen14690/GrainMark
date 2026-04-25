/**
 * AI 运行时（M7 接入 ONNX Runtime Node）
 * 目前提供模型注册表与占位接口，便于 UI 先落地
 */
import type { AICapability, AIModel } from '../../../shared/types.js'

const MODEL_REGISTRY: AIModel[] = [
  {
    id: 'nafnet-denoise-s',
    capability: 'denoise',
    name: 'NAFNet 降噪 (S)',
    version: '1.0',
    sizeBytes: 32_000_000,
    installed: false,
    device: 'cpu',
  },
  {
    id: 'real-esrgan-x2',
    capability: 'super-resolution',
    name: 'Real-ESRGAN ×2',
    version: '0.3.0',
    sizeBytes: 65_000_000,
    installed: false,
    device: 'cpu',
  },
  {
    id: 'sam-sky',
    capability: 'sky-replace',
    name: 'SAM 天空分割',
    version: '1.0',
    sizeBytes: 95_000_000,
    installed: false,
    device: 'cpu',
  },
  {
    id: 'lama-inpaint',
    capability: 'inpaint',
    name: 'LaMa 瑕疵消除',
    version: '1.0',
    sizeBytes: 180_000_000,
    installed: false,
    device: 'cpu',
  },
  {
    id: 'clip-recommend',
    capability: 'recommend',
    name: 'CLIP 滤镜推荐',
    version: '1.0',
    sizeBytes: 150_000_000,
    installed: false,
    device: 'cpu',
  },
]

export async function listAIModels(): Promise<AIModel[]> {
  return MODEL_REGISTRY
}

export async function downloadAIModel(modelId: string): Promise<void> {
  // M7 实装：从 HuggingFace / 自建 CDN 下载并存入 getModelsDir()
  console.log(`[ai] download request: ${modelId}`)
}

export async function runAI(
  capability: AICapability,
  photoPath: string,
  _params?: Record<string, unknown>,
): Promise<string> {
  // M7 实装：ONNX inference → 输出到 cache 并返回路径/base64
  console.log(`[ai] run ${capability} on ${photoPath}`)
  return photoPath
}

export async function recommendFilters(_photoPath: string): Promise<{ filterId: string; score: number }[]> {
  // M7 实装：CLIP image embedding + filter library embedding 近邻查询
  // 占位：返回前 3 个静态建议
  return [
    { filterId: 'kodak-portra-400', score: 0.93 },
    { filterId: 'fuji-400h', score: 0.87 },
    { filterId: 'kodak-gold-200', score: 0.81 },
  ]
}
