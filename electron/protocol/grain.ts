import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
/**
 * 自定义 grain:// 协议
 *
 * 解决：Electron 中 file:// 协议会赋予页面读取任意本地文件的能力（配合 webSecurity 更危险）。
 * 方案：用自定义协议代理文件访问，只允许访问经过 PathGuard 授权的路径。
 *
 * URL 形式：
 *   grain://photo/<id>           — 原始照片（需 id → path 映射）
 *   grain://thumb/<id>           — 缩略图
 *   grain://preview/<id>?v=N     — 预览（带版本号缓存破坏）
 *   grain://preview-tmp/<file>   — Editor 大图预览缓存（renderPreview 输出 > 2MB 时走此路）
 *   grain://lut/<filename>       — 用户 LUT 文件
 *
 * RAW 支持（Pass 2.8）：photo / preview kind 对 RAW 文件会透明地返回内嵌 JPEG，
 * UI 层不需感知。对非 RAW 走 net.fetch(file://) 零开销透传。
 */
import { app, net, protocol } from 'electron'
import { logger } from '../services/logger/logger.js'
import { orientImage, isRawFormat, resolvePreviewBuffer } from '../services/raw/index.js'
import { UnsupportedRawError } from '../services/raw/rawDecoder.js'
import type { PathGuard } from '../services/security/pathGuard.js'
import { getLUTDir, getPreviewCacheDir, getThumbsDir } from '../services/storage/init.js'

const MAP: Record<string, () => string> = {
  thumb: () => getThumbsDir(),
  lut: () => getLUTDir(),
  // Editor 大图预览缓存（renderPreview 输出 > 2MB 时走这个）
  'preview-tmp': () => getPreviewCacheDir(),
  // 品牌 Logo（Settings 上传的）
  logo: () => path.join(app.getPath('userData'), 'logos'),
}

/** photo id → 绝对路径 的解析器（由 photoStore 注入） */
let photoPathResolver: ((id: string) => string | null) | null = null

export function setPhotoPathResolver(fn: (id: string) => string | null): void {
  photoPathResolver = fn
}

/** 注册协议为"特权"协议（必须在 app ready 前调用） */
export function registerGrainPrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'grain',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: false,
      },
    },
  ])
}

/** 应用启动后挂载 handler */
export function registerGrainProtocol(pathGuard: PathGuard): void {
  protocol.handle('grain', async (request) => {
    try {
      const url = new URL(request.url)
      const kind = url.hostname // photo / thumb / preview / lut
      // pathname 首位 '/'，故 slice(1)
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''))

      if (!/^[a-zA-Z0-9_\-./]+$/.test(id)) {
        return new Response('Bad id', { status: 400 })
      }

      // S3 纵深防御：即便正则允许 '.'，也必须拒绝路径遍历组件
      if (id.includes('..')) {
        logger.warn('grain.traversal.blocked', { id })
        return new Response('Bad id', { status: 400 })
      }

      let absPath: string | null = null

      if (kind === 'photo' || kind === 'preview') {
        if (!photoPathResolver) return new Response('Resolver not ready', { status: 503 })
        absPath = photoPathResolver(id)
        if (!absPath) return new Response('Not found', { status: 404 })
      } else if (MAP[kind]) {
        absPath = path.join(MAP[kind]!(), id)
      } else {
        return new Response('Unknown kind', { status: 400 })
      }

      // PathGuard 双重校验（即使 resolver 返回，也必须在白名单内）
      const safe = await pathGuard.validate(absPath).catch(() => null)
      if (!safe) return new Response('Forbidden', { status: 403 })

      // Q3 修复：用单次异步 stat 替代 existsSync + statSync，不阻塞主进程
      let stat: Awaited<ReturnType<typeof fsp.stat>>
      try {
        stat = await fsp.stat(safe)
      } catch {
        return new Response('Not found', { status: 404 })
      }
      if (stat.isDirectory()) return new Response('Forbidden', { status: 403 })

      // RAW 分支：photo / preview kind 对 RAW 做透明 JPEG 预览替换
      // thumb / lut 不经过 RAW 解码（thumb 已由 photoStore 预先走过 resolvePreviewBuffer 生成了 JPEG）
      if ((kind === 'photo' || kind === 'preview') && isRawFormat(safe)) {
        try {
          const { buffer, sourceOrientation } = await resolvePreviewBuffer(safe)
          // 统一 orientation 处理（Single Source of Truth：orientImage）
          // 修复 P0：grain:// 协议之前未对 RAW 做 orientation 旋转
          const orientedBuffer = await orientImage(buffer, sourceOrientation)
            .jpeg({ quality: 90 })
            .toBuffer()
          const body = new Blob([new Uint8Array(orientedBuffer).buffer as ArrayBuffer], {
            type: 'image/jpeg',
          })
          return new Response(body, {
            status: 200,
            headers: {
              'Content-Type': 'image/jpeg',
              'Content-Length': String(orientedBuffer.length),
              'Cache-Control': 'private, max-age=3600',
            },
          })
        } catch (err) {
          if (err instanceof UnsupportedRawError) {
            logger.warn('grain.raw.unsupported', { path: safe, reason: err.reason })
            return new Response('Unsupported RAW (no embedded JPEG)', { status: 415 })
          }
          throw err
        }
      }

      // 通过 Electron net.fetch 流式返回（支持 range 请求）
      return net.fetch(pathToFileURL(safe).toString())
    } catch (err) {
      logger.error('grain.protocol.error', { err: (err as Error).message })
      return new Response('Internal Error', { status: 500 })
    }
  })
}
