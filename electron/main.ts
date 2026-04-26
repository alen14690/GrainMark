import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app, dialog, ipcMain, session, shell } from 'electron'
import { z } from 'zod'
import { DialogSelectFilesSchema } from '../shared/ipc-schemas.js'
import { registerAllIpcHandlers } from './ipc/register.js'
import { setIpcPathGuard } from './ipc/safeRegister.js'
import { buildAppMenu } from './menu.js'
import { registerGrainPrivileges, registerGrainProtocol, setPhotoPathResolver } from './protocol/grain.js'
import { shutdownGpuRenderer } from './services/batch/gpuRenderer.js'
import { shutdownExiftool } from './services/exif/reader.js'
import { logger } from './services/logger/logger.js'
import { PathGuard } from './services/security/pathGuard.js'
import { setPathGuard } from './services/security/pathGuardRegistry.js'
import { SecureVault } from './services/security/secureVault.js'
import { flushStorage, getPhotosTable, initStorage } from './services/storage/init.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// 测试用：允许集成测试指定独立 userData 目录，避免污染用户真实数据
// 必须在 app.getPath('userData') 首次被调用前设置
if (process.env.GRAINMARK_USER_DATA) {
  app.setPath('userData', process.env.GRAINMARK_USER_DATA)
}

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
    show: false, // 等 ready-to-show 再显示，避免白屏闪
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

  // ready-to-show → 显示并抢焦点（macOS 从终端启动时必要）
  win.once('ready-to-show', () => {
    win?.show()
    win?.focus()
    if (process.platform === 'darwin') {
      app.focus({ steal: true })
    }
    logger.info('window.ready', { url: VITE_DEV_SERVER_URL ?? 'file://dist' })
  })

  // 兜底：5s 后仍未 ready-to-show 强制 show（防卡死）
  setTimeout(() => {
    if (win && !win.isVisible()) {
      logger.warn('window.force-show')
      win.show()
      win.focus()
    }
  }, 5000)

  // 加载失败诊断（不要静默失败）
  win.webContents.on('did-fail-load', (_e, errCode, errDesc, url) => {
    logger.error('window.load-failed', { errCode, errDesc, url })
  })

  // 渲染进程崩溃诊断
  win.webContents.on('render-process-gone', (_e, details) => {
    logger.error('renderer.gone', { reason: details.reason })
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
    // connect-src：允许 data:/blob:/grain: 是为了批处理隐藏窗口从 data URL fetch 源图
    "connect-src 'self' data: blob: grain: ws://localhost:* http://localhost:*",
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

  // Hotfix：从已导入的 photos.json 恢复"用户此前明示授权过的目录"白名单
  //
  // 背景：F1（IPC PathGuard 切面）生效后，preview:render / photo:thumb 等
  //   handler 会对传入路径强制 validate()。但启动时 PathGuard 只含 5 个系统
  //   默认目录；若用户历史导入的照片在这些目录之外（例如外置硬盘 /Volumes/*
  //   或自定义素材库），下次启动打开 Editor 会 validate 失败 → UI 卡 rendering。
  //
  // 修复契约：每张已存在于 photos.json 的照片，其父目录视为"已授权"——因为
  //   当初导入时一定走过 dialog:selectFiles / selectDir，获得过用户明示同意。
  //   重启不应撤销该授权。
  //
  // 回归保护：tests/unit/mainStartupContract.test.ts 会对本段代码做静态扫描。
  try {
    const photos = getPhotosTable().all()
    const seenDirs = new Set<string>()
    for (const p of photos) {
      if (!p.path) continue
      const parent = path.dirname(p.path)
      if (parent && !seenDirs.has(parent)) {
        seenDirs.add(parent)
        pathGuard.addAllowed(parent)
      }
    }
    logger.info('pathGuard.rehydrated', { dirs: seenDirs.size })
  } catch (err) {
    logger.warn('pathGuard.rehydrate.failed', { err: (err as Error).message })
  }

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

  // F1 修复：把 PathGuard 注入到 IPC 层，所有声明了 pathFields 的 handler 都会强制校验
  setIpcPathGuard(pathGuard)
  // F6/F7 修复：把 PathGuard 注入 service 层 registry，让 cubeIO 等做防御深度校验
  setPathGuard(pathGuard)

  // 注册 IPC
  registerDialogHandlers()
  registerAllIpcHandlers()

  await createWindow()

  // 应用菜单：必须在窗口创建后挂，确保点击时能拿到窗口引用
  buildAppMenu({ getMainWindow: () => win })

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

// 主窗口关闭时同步关掉隐藏的 GPU 窗口，避免 window-all-closed 不触发导致进程僵死
app.on('browser-window-created', (_e, bw) => {
  bw.once('closed', () => {
    if (win === bw) {
      shutdownGpuRenderer()
    }
  })
})

// 退出前清理 exiftool 子进程 + 刷盘所有 JsonTable（F11：保证不丢尾包数据）
app.on('before-quit', async () => {
  try {
    shutdownGpuRenderer()
  } catch {
    // ignore
  }
  try {
    await flushStorage()
  } catch {
    // ignore
  }
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
