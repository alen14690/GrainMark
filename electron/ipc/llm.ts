/**
 * LLM IPC handler（M5-LLM-A · OpenRouter 配置与连通性测试）
 *
 * 暴露 4 个通道：
 *   llm:getConfig       获取当前配置的公开视图（不含 apiKey 明文）
 *   llm:setConfig       部分更新；apiKey=null 清空、undefined 保留、string 写入
 *   llm:clearConfig     一键清空（apiKey + meta）
 *   llm:testConnection  打 OpenRouter /models 验证 apiKey 有效性
 *
 * 安全：所有参数都会先过 Zod schema（safeRegister 统一处理），
 *      apiKey 明文在返回值里被严格过滤（configStore.getPublicConfig 保证）。
 */
import type { LLMConfigInput } from '../../shared/types.js'
import { testConnection } from '../services/llm/client.js'
import { applyConfigPatch, clearConfig, getPublicConfig } from '../services/llm/configStore.js'
import { registerIpc } from './safeRegister.js'

export function registerLLMIpc(): void {
  registerIpc('llm:getConfig', async () => getPublicConfig())

  registerIpc('llm:setConfig', async (patch: unknown) => applyConfigPatch(patch as LLMConfigInput))

  registerIpc('llm:clearConfig', async () => clearConfig())

  registerIpc('llm:testConnection', async () => testConnection())
}
