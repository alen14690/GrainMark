/**
 * LLM IPC handler（M5-LLM-A + M5-LLM-B · OpenRouter）
 *
 * 暴露 6 个通道：
 *   llm:getConfig       获取当前配置的公开视图（不含 apiKey 明文）
 *   llm:setConfig       部分更新；apiKey=null 清空、undefined 保留、string 写入
 *   llm:clearConfig     一键清空（apiKey + meta）
 *   llm:testConnection  打 OpenRouter /models 验证 apiKey 有效性
 *   llm:listModels      拉取实时 vision 模型目录（含兜底）
 *   llm:analyzePhoto    M5-LLM-B：让 LLM 分析一张照片并给出主体/光影建议 + 参数调整
 *
 * 安全：所有参数都会先过 Zod schema（safeRegister 统一处理），
 *      apiKey 明文在返回值里被严格过滤（configStore.getPublicConfig 保证）。
 */
import type { LLMConfigInput } from '../../shared/types.js'
import { analyzePhoto } from '../services/llm/analyst.js'
import { listModels } from '../services/llm/catalog.js'
import { testConnection } from '../services/llm/client.js'
import { applyConfigPatch, clearConfig, getPublicConfig } from '../services/llm/configStore.js'
import { registerIpc } from './safeRegister.js'

export function registerLLMIpc(): void {
  registerIpc('llm:getConfig', async () => getPublicConfig())

  registerIpc('llm:setConfig', async (patch: unknown) => applyConfigPatch(patch as LLMConfigInput))

  registerIpc('llm:clearConfig', async () => clearConfig())

  registerIpc('llm:testConnection', async () => testConnection())

  registerIpc('llm:listModels', async () => listModels())

  // 图像分析：photoPath 必须过 PathGuard（防路径穿越到用户未授权目录）
  registerIpc('llm:analyzePhoto', async (photoPath: unknown) => analyzePhoto(photoPath as string), {
    pathFields: ['arg'],
  })
}
