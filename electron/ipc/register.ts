import { registerAIIpc } from './ai.js'
import { registerBatchIpc } from './batch.js'
import { registerExtractIpc } from './extract.js'
import { registerFilterIpc } from './filter.js'
import { registerFrameIpc } from './frame.js'
import { registerLLMIpc } from './llm.js'
import { registerPerfIpc } from './perf.js'
import { registerPhotoIpc } from './photo.js'
import { registerPreviewIpc } from './preview.js'
import { registerSettingsIpc } from './settings.js'
import { registerSyncIpc } from './sync.js'
import { registerTasteIpc } from './taste.js'
import { registerTrendingIpc } from './trending.js'
import { registerWatermarkIpc } from './watermark.js'

export function registerAllIpcHandlers() {
  registerFilterIpc()
  registerPhotoIpc()
  registerPreviewIpc()
  registerBatchIpc()
  registerExtractIpc()
  registerWatermarkIpc()
  registerFrameIpc()
  registerAIIpc()
  registerLLMIpc()
  registerTrendingIpc()
  registerSyncIpc()
  registerSettingsIpc()
  registerPerfIpc()
  registerTasteIpc()
}
