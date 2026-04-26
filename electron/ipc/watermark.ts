import type { WatermarkStyle } from '../../shared/types.js'
import { listWatermarkTemplates, renderWatermark } from '../services/watermark/renderer.js'
import { registerIpc } from './safeRegister.js'

export function registerWatermarkIpc() {
  registerIpc('watermark:templates', async () => listWatermarkTemplates())
  // F1：photoPath + style.logoPath（可选）都必须过 PathGuard
  registerIpc(
    'watermark:render',
    async (photoPath: unknown, style: unknown) =>
      renderWatermark(photoPath as string, style as WatermarkStyle),
    { pathFields: ['args.0', 'args.1.logoPath'] },
  )
}
