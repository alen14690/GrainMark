/**
 * smoke.spec.ts — Pass T4 打包冒烟
 *
 * 目标：验证 electron-builder 打包后的 `.app`/`.exe`/AppImage 能正确启动：
 *   1. asar 打包后 main.ts 能 import dist-electron/main.js
 *   2. native binding（sharp / exiftool-vendored）在 asar 解压后能加载
 *   3. preload 桥接在 packaged 模式下仍注入 window.grain
 *   4. 基础渲染（Sidebar）能上屏
 *
 * **仅在 release/* 分支或 tag 推送时跑**（.github/workflows/ci.yml 的 gating）。
 *
 * 运行前置：
 *   npm run pack:dir       # 产出 release/mac-${arch}/GrainMark.app（不生成 dmg，节约时间）
 *
 * 为什么不复用 tests/e2e/_support/launchApp：
 *   - launchApp 启动 `dist-electron/main.js` 脚本（开发产物）
 *   - packaged 必须启动 `.app/Contents/MacOS/GrainMark` 可执行文件（实际发布物）
 *   - 这是两个本质不同的入口，AGENTS.md 第 8 条要求不强行复用（功能语义不同）
 *
 * 局限：
 *   - 只覆盖 3 条最小冒烟，不做 UI 旅程（那是 E2E 层的职责）
 *   - packaged 启动慢（asar 解压 + native 加载），单条用例 10s+ 是正常范围
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type ElectronApplication, _electron as electron, expect, test } from '@playwright/test'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 定位打包后的可执行文件。
 * - macOS: release/mac-${arch}/GrainMark.app/Contents/MacOS/GrainMark
 * - Windows: release/win-unpacked/GrainMark.exe
 * - Linux: release/linux-unpacked/grainmark
 *
 * 不存在时直接抛错 —— 打包产物必须由外部（CI 或 npm run pack:dir）预先生成。
 */
function resolvePackagedExecutable(): string {
  const repoRoot = path.resolve(__dirname, '../..')
  const releaseDir = path.join(repoRoot, 'release')
  if (!fs.existsSync(releaseDir)) {
    throw new Error('[packaged] release/ 目录不存在，请先运行 `npm run pack:dir`（产出 .app/unpacked 目录）')
  }

  if (process.platform === 'darwin') {
    // release/mac-arm64 或 release/mac（x64）
    const candidates = fs
      .readdirSync(releaseDir)
      .filter((name) => name.startsWith('mac'))
      .map((dir) => path.join(releaseDir, dir, 'GrainMark.app/Contents/MacOS/GrainMark'))
      .filter((p) => fs.existsSync(p))
    if (candidates.length === 0) {
      throw new Error(`[packaged] 未找到 GrainMark.app · releaseDir=${releaseDir}`)
    }
    return candidates[0]!
  }

  if (process.platform === 'win32') {
    const p = path.join(releaseDir, 'win-unpacked', 'GrainMark.exe')
    if (!fs.existsSync(p)) throw new Error(`[packaged] 未找到 GrainMark.exe · ${p}`)
    return p
  }

  // linux
  const p = path.join(releaseDir, 'linux-unpacked', 'grainmark')
  if (!fs.existsSync(p)) throw new Error(`[packaged] 未找到 grainmark · ${p}`)
  return p
}

test.describe('Packaged Smoke · electron-builder 产物', () => {
  let app: ElectronApplication
  let tmpUserData: string

  test.beforeAll(async () => {
    tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-packaged-'))
    const exe = resolvePackagedExecutable()
    app = await electron.launch({
      executablePath: exe,
      // 打包后的 app 不再接受 main.js 参数，只传自定义 flag
      args: ['--force-device-scale-factor=1'],
      env: {
        ...process.env,
        GRAINMARK_TEST: '1',
        GRAINMARK_USER_DATA: tmpUserData,
      },
      timeout: 60_000, // 打包后启动较慢（asar 解压 + native binding 加载）
    })
  })

  test.afterAll(async () => {
    try {
      await app?.close()
    } catch {
      // 忽略关闭异常
    }
    try {
      fs.rmSync(tmpUserData, { recursive: true, force: true })
    } catch {
      // 忽略临时目录清理异常
    }
  })

  test('P1 · 打包后 preload 桥接仍注入 window.grain', async () => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(
      () => {
        const g = (window as unknown as { grain?: { invoke?: unknown } }).grain
        return !!g && typeof g.invoke === 'function'
      },
      undefined,
      { timeout: 20_000 },
    )
    const hasGrain = await page.evaluate(
      () => typeof (window as unknown as { grain?: unknown }).grain === 'object',
    )
    expect(hasGrain).toBe(true)
  })

  test('P2 · Sidebar 渲染（asar 内 React/CSS 资源可加载）', async () => {
    const page = await app.firstWindow()
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('nav-library')).toBeVisible()
  })

  test('P3 · native binding 可用（photo:list IPC 走通，隐式依赖 exiftool / sqlite / sharp）', async () => {
    const page = await app.firstWindow()
    // 初始 userData 空 → photo:list 应当返回空数组，不应抛错
    const list = await page.evaluate(async () => {
      type GrainApi = { invoke: (ch: string) => Promise<unknown> }
      const g = (window as unknown as { grain: GrainApi }).grain
      return g.invoke('photo:list')
    })
    expect(Array.isArray(list)).toBe(true)
  })
})
