/**
 * frame IPC 注册(阶段 1 · 2026-05-01)
 *
 * 通道:
 *   - `frame:templates` —— 列出已注册风格(阶段 1 仅有 minimal-bar 占位)
 *   - `frame:render` —— 渲染边框(阶段 1 一定抛 NotImplementedError)
 *
 * 与旧 `watermark:*` 的关系:并存,互不影响。旧通道 / renderer.ts / Batch /
 * Editor exportWatermark 全部保留,确保阶段 1 零退化。
 *
 * 安全:
 *   - photoPath 过 PathGuard(args.0)
 *   - overrides.logoPath 也要过(args.2.logoPath),阶段 2 起真用到时依赖这一守卫
 */
import type { FrameStyleId, FrameStyleOverrides } from '../../shared/types.js'
import { listFrameStyles } from '../services/frame/registry.js'
import { renderFrame } from '../services/frame/renderer.js'
import { registerIpc } from './safeRegister.js'

export function registerFrameIpc() {
  registerIpc('frame:templates', async () => listFrameStyles())
  registerIpc(
    'frame:render',
    async (photoPath: unknown, styleId: unknown, overrides: unknown) =>
      renderFrame(photoPath as string, styleId as FrameStyleId, overrides as FrameStyleOverrides),
    { pathFields: ['args.0', 'args.2.logoPath'] },
  )
}
