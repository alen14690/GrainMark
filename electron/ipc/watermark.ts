import type { WatermarkStyle } from '../../shared/types.js'
import { listWatermarkTemplates, renderWatermark } from '../services/watermark/renderer.js'
import { registerIpc } from './safeRegister.js'

export function registerWatermarkIpc() {
  registerIpc('watermark:templates', async () => listWatermarkTemplates())
  registerIpc('watermark:render', async (photoPath: unknown, style: unknown) =>
    renderWatermark(photoPath as string, style as WatermarkStyle),
  )
}
