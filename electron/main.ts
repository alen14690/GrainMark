import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app, dialog, ipcMain, session, shell } from 'electron'
import { z } from 'zod'
import { DialogSelectFilesSchema } from '../shared/ipc-schemas.js'
import { registerAllIpcHandlers } from './ipc/register.js'
import { registerGrainPrivileges, registerGrainProtocol, setPhotoPathResolver } from './protocol/grain.js'
import { shutdownExiftool } from './services/exif/reader.js'
import { logger } from './services/logger/logger.js'
import { PathGuard } from './services/security/pathGuard.js'
import { SecureVault } from './services/security/secureVault.js'
import { getPhotosTable, initStorage } from './services/storage/init.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// ============ 全局安全对象（早期初始化） ============
let pathGuard: PathGuard
let secureVault: SecureVault | null = null

// 协议特权必须在 app.ready 之前注册
registerGrainPrivileges()

// 只允许单例运行
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let win: BrowserWindow | null = null

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    title: 'GrainMark',
    backgroundColor: '#0E0E10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // ★ P1 安全核心
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
    },
  })

  // 拦截所有新窗口 / 外链：一律用系统浏览器打开（不在 Electron 里加载外部 URL）
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // 导航限制：只允许 dev server / file / grain
  win.webContents.on('will-navigate', (event, url) => {
    const allow =
      (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL)) ||
      url.startsWith('file://') ||
      url.startsWith('grain://')
    if (!allow) {
      logger.warn('nav.blocked', { url })
      event.preventDefault()
    }
  })

  // 禁用 webview 标签
  win.webContents.on('will-attach-webview', (event) => {
    logger.warn('webview.blocked')
    event.preventDefault()
  })

  // 禁止通过 page.downloadURL 下载未明示文件（由 UI 明确触发的导出走 IPC）
  win.webContents.session.on('will-download', (event, item) => {
    logger.warn('download.blocked', { filename: item.getFilename() })
    event.preventDefault()
  })

  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    await win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

/** 会话级 CSP 强化（生产模式） */
function setupSessionCSP() {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: grain:",
    "connect-src 'self' ws://localhost:* http://localhost:*",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    headers['Content-Security-Policy'] = [csp]
    // 保险：移除 X-Frame-Options、添加其他安全头
    headers['X-Content-Type-Options'] = ['nosniff']
    headers['Referrer-Policy'] = ['no-referrer']
    callback({ responseHeaders: headers })
  })

  // 禁止请求非白名单权限
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed: string[] = [] // P1 不允许任何权限；需要时明确开放
    callback(allowed.includes(permission))
  })
}

/** 对话框 IPC — 主进程弹出，返回值可信 */
function registerDialogHandlers() {
  ipcMain.handle('dialog:selectFiles', async (_e, raw: unknown) => {
    if (!win) return []
    const options = DialogSelectFilesSchema.parse(raw)
    const result = await dialog.showOpenDialog(win, {
      properties: options?.multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: options?.filters ?? [
        {
          name: '图片',
          extensions: [
            'jpg',
            'jpeg',
            'png',
            'tiff',
            'tif',
            'webp',
            'heic',
            'heif',
            'raw',
            'nef',
            'cr2',
            'cr3',
            'arw',
            'dng',
            'raf',
            'orf',
            'rw2',
          ],
        },
      ],
    })
    if (result.canceled) return []

    // 把 dialog 返回的路径加入 PathGuard 白名单（用户显式选择）
    for (const p of result.filePaths) {
      pathGuard.addAllowed(path.dirname(p))
    }
    return result.filePaths
  })

  ipcMain.handle('dialog:selectDir', async () => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled) return null
    const dir = result.filePaths[0]
    if (dir) pathGuard.addAllowed(dir)
    return dir ?? null
  })
}

app.whenReady().then(async () => {
  setupSessionCSP()

  // 初始化存储
  await initStorage()

  // 初始化安全组件
  const home = app.getPath('home')
  pathGuard = new PathGuard([
    path.join(home, 'Pictures'),
    path.join(home, 'Downloads'),
    path.join(home, 'Desktop'),
    app.getPath('userData'),
    app.getPath('temp'),
  ])
  await pathGuard.init()

  try {
    secureVault = new SecureVault(app.getPath('userData'))
  } catch (e) {
    logger.warn('vault.unavailable', { reason: (e as Error).message })
  }

  // 注册 grain:// 协议
  const table = getPhotosTable()
  setPhotoPathResolver((id) => {
    const photo = table.get(id)
    return photo ? photo.path : null
  })
  registerGrainProtocol(pathGuard)

  // 注册 IPC
  registerDialogHandlers()
  registerAllIpcHandlers()

  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 二次实例被激活时唤醒主窗口
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

// 退出前清理 exiftool 子进程
app.on('before-quit', async () => {
  try {
    await shutdownExiftool()
  } catch {
    // ignore
  }
})

// 未捕获异常 — 本地记录（不上传）
process.on('uncaughtException', (err) => {
  logger.error('uncaught', { message: err.message })
})
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled-rejection', { reason: String(reason) })
})

// 导出给测试/IPC 使用
export function getPathGuard(): PathGuard {
  return pathGuard
}
export function getSecureVault(): SecureVault | null {
  return secureVault
}

// suppress unused import warning if tests import z directly
void z
