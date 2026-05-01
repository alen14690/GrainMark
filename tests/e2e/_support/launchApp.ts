/**
 * launchApp — E2E 测试共享启动 fixture
 *
 * 职责（单一真源 · AGENTS.md 第 8 条）：
 *   - 启动真 Electron 主进程（dist-electron/main.js，必须先 `npm run build`）
 *   - 隔离 userData 到临时目录，防污染用户真实数据
 *   - 等待首个窗口 `domcontentloaded` + `window.grain` preload 桥接就绪
 *   - 返回 { app, page, tmpDir, userDataDir, cleanup } 供 spec 使用
 *
 * 不职责的边界：
 *   - 不做 UI 断言（spec 自己 assert）
 *   - 不碰 PathGuard（临时目录在 app.getPath('temp') 下，已在 main.ts 的默认白名单内）
 *   - 不 mock dialog（dialog:selectFiles 不在本 fixture 覆盖范围；若 spec 需要导入
 *     照片，应通过 photo:import IPC 直接注入路径，绕开对话框而不是 monkey-patch）
 *
 * 为什么不复用 tests/integration-e2e/batch.spec.ts 的内联启动逻辑：
 *   - 那段 beforeAll 是专为 batch 一个文件写的，含大量 batch 特定 fixtures
 *   - 重复提取会触发"散布阈值 ≥ 2" → 本文件是 Single Source of Truth
 *   - 未来迁移 batch.spec.ts 时，会把它改成调用本 fixture（下一个 Pass）
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type ElectronApplication, type Page, _electron as electron } from '@playwright/test'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface LaunchedApp {
  /** 真实 Electron application 句柄 */
  app: ElectronApplication
  /** 首个 BrowserWindow 对应的 Playwright Page（已 waitForLoadState） */
  page: Page
  /** 本次测试专属临时目录（其下有 userData/ 和 work/） */
  tmpDir: string
  /** Electron userData 绝对路径（app.getPath('userData') 指向此处） */
  userDataDir: string
  /**
   * 优雅关闭 —— 先 close Electron，再删临时目录。
   * 即使 close 抛错也尽力删目录，避免 /tmp 泄漏。
   */
  cleanup: () => Promise<void>
}

export interface LaunchAppOptions {
  /** 额外传给 Electron 的命令行参数（如 --use-gl=swiftshader） */
  extraArgs?: string[]
  /** 额外环境变量（默认已经注入 GRAINMARK_TEST=1 + GRAINMARK_USER_DATA） */
  extraEnv?: Record<string, string>
  /** 冷启动超时（毫秒）·默认 30s */
  timeoutMs?: number
}

/**
 * 启动一个隔离的 Electron 实例。
 *
 * 典型用法（Playwright spec）：
 *   let launched: LaunchedApp
 *   test.beforeAll(async () => { launched = await launchApp() })
 *   test.afterAll(async () => { await launched.cleanup() })
 */
export async function launchApp(options: LaunchAppOptions = {}): Promise<LaunchedApp> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-e2e-'))
  const userDataDir = path.join(tmpDir, 'userData')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.mkdirSync(path.join(tmpDir, 'work'), { recursive: true })

  // 定位 dist-electron/main.js —— 相对 tests/e2e/_support/ 往上三级
  //   tests/e2e/_support/launchApp.ts → repo-root/dist-electron/main.js
  const mainPath = path.resolve(__dirname, '../../../dist-electron/main.js')
  if (!fs.existsSync(mainPath)) {
    throw new Error(`[launchApp] dist-electron/main.js 不存在。请先运行 \`npm run build\`。path=${mainPath}`)
  }

  // 锁定 device scale factor 到 1：
  //   - 避免 retina / 外接显示器 / 系统缩放导致的截图尺寸抖动
  //   - 让 Pass T3 visual regression 的基线在任意开发机上稳定
  //   - 不影响 Pass T1-T2（那些只看 DOM 状态，不关心像素密度）
  //   - 生产环境用户真实 DPR 不受此影响（仅本 fixture 覆盖的 Electron 实例）
  const defaultArgs = ['--force-device-scale-factor=1', '--high-dpi-support=1']

  const app = await electron.launch({
    args: [mainPath, ...defaultArgs, ...(options.extraArgs ?? [])],
    env: {
      ...process.env,
      GRAINMARK_TEST: '1',
      GRAINMARK_USER_DATA: userDataDir,
      ...(options.extraEnv ?? {}),
    },
    timeout: options.timeoutMs ?? 30_000,
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // preload 桥接就绪：window.grain 存在且 invoke 是函数
  await page.waitForFunction(
    () => {
      const g = (window as unknown as { grain?: { invoke?: unknown } }).grain
      return !!g && typeof g.invoke === 'function'
    },
    undefined,
    { timeout: 10_000 },
  )

  const cleanup = async (): Promise<void> => {
    try {
      await app.close()
    } catch {
      // close 可能在测试已杀进程时抛错，继续删临时目录
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // 临时目录删除失败不致命（OS 会在重启时清理 /tmp）
    }
  }

  return { app, page, tmpDir, userDataDir, cleanup }
}
