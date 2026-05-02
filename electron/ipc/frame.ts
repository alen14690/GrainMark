import fsp from 'node:fs/promises'
import path from 'node:path'
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
import { app } from 'electron'
import { CAMERA_BRANDS } from '../../shared/frame-brands.js'
import type { FrameStyleId, FrameStyleOverrides } from '../../shared/types.js'
import { listPublicFrameStyles } from '../services/frame/registry.js'
import { renderFrame } from '../services/frame/renderer.js'
import { registerIpc } from './safeRegister.js'

/** Logo 存储目录 */
function logosDir(): string {
  return path.join(app.getPath('userData'), 'logos')
}

export function registerFrameIpc() {
  registerIpc('frame:templates', async () => listPublicFrameStyles())
  registerIpc(
    'frame:render',
    async (photoPath: unknown, styleId: unknown, overrides: unknown) =>
      renderFrame(photoPath as string, styleId as FrameStyleId, overrides as FrameStyleOverrides),
    { pathFields: ['args.0', 'args.2.logoPath'] },
  )

  // 上传品牌 Logo：复制到 appData/logos/{brandId}.png
  registerIpc(
    'frame:upload-logo',
    async (brandId: unknown, srcPath: unknown) => {
      const id = brandId as string
      const src = srcPath as string
      // 验证 brandId 合法
      if (!CAMERA_BRANDS.some((b) => b.id === id)) {
        throw new Error(`Unknown brand: ${id}`)
      }
      const dir = logosDir()
      await fsp.mkdir(dir, { recursive: true })
      const ext = path.extname(src) || '.png'
      const dest = path.join(dir, `${id}${ext}`)
      await fsp.copyFile(src, dest)
      return dest
    },
    { pathFields: ['args.1'] },
  )

  // 删除品牌 Logo
  registerIpc('frame:delete-logo', async (brandId: unknown) => {
    const id = brandId as string
    const dir = logosDir()
    // 尝试删除所有可能的扩展名
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp', '.svg']) {
      try {
        await fsp.unlink(path.join(dir, `${id}${ext}`))
      } catch {
        // ignore
      }
    }
  })

  // 列出已上传的全部品牌 Logo
  registerIpc('frame:list-logos', async () => {
    const dir = logosDir()
    const result: Record<string, string> = {}
    try {
      const files = await fsp.readdir(dir)
      for (const file of files) {
        const ext = path.extname(file)
        const id = path.basename(file, ext)
        if (CAMERA_BRANDS.some((b) => b.id === id)) {
          result[id] = path.join(dir, file)
        }
      }
    } catch {
      // logos dir doesn't exist yet
    }
    return result
  })
}
