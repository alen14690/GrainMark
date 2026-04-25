import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
/**
 * 自定义 grain:// 协议
 *
 * 解决：Electron 中 file:// 协议会赋予页面读取任意本地文件的能力（配合 webSecurity 更危险）。
 * 方案：用自定义协议代理文件访问，只允许访问经过 PathGuard 授权的路径。
 *
 * URL 形式：
 *   grain://photo/<id>        — 原始照片（需 id → path 映射）
 *   grain://thumb/<id>        — 缩略图
 *   grain://preview/<id>?v=N  — 预览（带版本号缓存破坏）
 *   grain://lut/<filename>    — 用户 LUT 文件
 */
import { net, protocol } from 'electron'
import type { PathGuard } from '../services/security/pathGuard.js'
import { getLUTDir, getThumbsDir } from '../services/storage/init.js'

const MAP: Record<string, () => string> = {
  thumb: () => getThumbsDir(),
  lut: () => getLUTDir(),
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
      if (!fs.existsSync(safe)) return new Response('Not found', { status: 404 })

      const stat = fs.statSync(safe)
      if (stat.isDirectory()) return new Response('Forbidden', { status: 403 })

      // 通过 Electron net.fetch 流式返回（支持 range 请求）
      return net.fetch(pathToFileURL(safe).toString())
    } catch (err) {
      console.error('[grain-protocol] error:', err)
      return new Response('Internal Error', { status: 500 })
    }
  })
}
