/**
 * AI 运行时（M7 接入 ONNX Runtime Node）
 *
 * 本版（F10 修复）：仅提供模型注册表只读 API；能力入口 **显式抛 NotImplementedError**。
 *
 * 历史：之前 `runAI` / `downloadAIModel` / `recommendFilters` 直接返回原路径 / 静态数据 / void，
 * 造成 UI 误以为"AI 处理完成"。这是产品契约欺骗。
 *
 * 新契约：
 *   - listAIModels / listed 数据可读；UI 可展示模型目录
 *   - runAI / downloadModel / recommendFilters 抛 NotImplementedError，UI 捕获后显示
 *     "该能力尚未开放"提示，按钮应 disable
 *   - 错误 code 'AI_NOT_IMPLEMENTED' 供前端做统一提示
 */
import type { AICapability, AIModel } from '../../../shared/types.js'

/** 专门用于 AI 占位 —— renderer 可根据 code 做统一处理 */
export class NotImplementedError extends Error {
  readonly code = 'AI_NOT_IMPLEMENTED'
  constructor(feature: string) {
    super(`AI feature "${feature}" is not implemented yet. Coming in M7.`)
    this.name = 'NotImplementedError'
  }
}

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
  throw new NotImplementedError(`downloadAIModel(${modelId})`)
}

export async function runAI(
  capability: AICapability,
  _photoPath: string,
  _params?: Record<string, unknown>,
): Promise<string> {
  throw new NotImplementedError(`runAI(${capability})`)
}

export async function recommendFilters(_photoPath: string): Promise<{ filterId: string; score: number }[]> {
  throw new NotImplementedError('recommendFilters')
}
