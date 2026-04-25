import type { AICapability } from '../../shared/types.js'
import { downloadAIModel, listAIModels, recommendFilters, runAI } from '../services/ai/runtime.js'
import { registerIpc } from './safeRegister.js'

export function registerAIIpc() {
  registerIpc('ai:listModels', async () => listAIModels())
  registerIpc('ai:downloadModel', async (modelId: unknown) => {
    await downloadAIModel(modelId as string)
  })
  registerIpc('ai:run', async (capability: unknown, photoPath: unknown, params: unknown) =>
    runAI(capability as AICapability, photoPath as string, params as Record<string, unknown>),
  )
  registerIpc('ai:recommend', async (photoPath: unknown) => recommendFilters(photoPath as string))
}
