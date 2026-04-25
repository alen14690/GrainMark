import type { FilterPipeline } from '../../shared/types.js'
import { renderPreview } from '../services/filter-engine/preview.js'
import { registerIpc } from './safeRegister.js'

export function registerPreviewIpc() {
  registerIpc('preview:render', async (photoPath: unknown, filterId: unknown, pipelineOverride: unknown) =>
    renderPreview(
      photoPath as string,
      filterId as string | null,
      pipelineOverride as FilterPipeline | undefined,
    ),
  )
}
