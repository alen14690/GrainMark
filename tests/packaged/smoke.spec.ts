/**
 * smoke.spec.ts — Pass T4 打包冒烟(2026-05-01 审计加固版)
 *
 * 目标:验证 electron-builder 打包后的 `.app`/`.exe`/AppImage 能正确启动:
 *   1. asar 打包后 main.ts 能 import dist-electron/main.js
 *   2. **native binding(sharp / exiftool-vendored)在 asar 解压后能真正加载并工作**
 *   3. preload 桥接在 packaged 模式下仍注入 window.grain
 *   4. 基础渲染(Sidebar)能上屏
 *
 * **仅在 release/* 分支或 tag 推送时跑**(.github/workflows/ci.yml 的 gating)。
 *
 * 运行前置:
 *   npm run pack:dir       # 产出 release/mac-${arch}/GrainMark.app(不生成 dmg,节约时间)
 *
 * 为什么不复用 tests/e2e/_support/launchApp:
 *   - launchApp 启动 `dist-electron/main.js` 脚本(开发产物)
 *   - packaged 必须启动 `.app/Contents/MacOS/GrainMark` 可执行文件(实际发布物)
 *   - 这是两个本质不同的入口,AGENTS.md 第 8 条要求不强行复用(功能语义不同)
 *
 * 局限:
 *   - 只覆盖 3 条最小冒烟,不做 UI 旅程(那是 E2E 层的职责)
 *   - packaged 启动慢(asar 解压 + native 加载),单条用例 10s+ 是正常范围
 *
 * 2026-05-01 审计修订:
 *   - P3 从 "listPhotos 返回空数组" 升级为 "photo:import 真实 fixture";
 *     前版本完全不碰 sharp / exiftool-vendored,asar unpack 缺项也发现不了
 *   - 新增 tmpWork 子目录用于放 fixture,避免污染 userData
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
 * 不存在时直接抛错 —— 打包产物必须由外部(CI 或 npm run pack:dir)预先生成。
 */
function resolvePackagedExecutable(): string {
  const repoRoot = path.resolve(__dirname, '../..')
  const releaseDir = path.join(repoRoot, 'release')
  if (!fs.existsSync(releaseDir)) {
    throw new Error('[packaged] release/ 目录不存在,请先运行 `npm run pack:dir`(产出 .app/unpacked 目录)')
  }

  if (process.platform === 'darwin') {
    // release/mac-arm64 或 release/mac(x64)
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
  let tmpRoot: string
  let tmpUserData: string
  let tmpWork: string

  test.beforeAll(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-packaged-'))
    tmpUserData = path.join(tmpRoot, 'userData')
    tmpWork = path.join(tmpRoot, 'work')
    fs.mkdirSync(tmpUserData, { recursive: true })
    fs.mkdirSync(tmpWork, { recursive: true })

    const exe = resolvePackagedExecutable()
    app = await electron.launch({
      executablePath: exe,
      // 打包后的 app 不再接受 main.js 参数,只传自定义 flag
      args: ['--force-device-scale-factor=1'],
      env: {
        ...process.env,
        GRAINMARK_TEST: '1',
        GRAINMARK_USER_DATA: tmpUserData,
      },
      timeout: 60_000, // 打包后启动较慢(asar 解压 + native binding 加载)
    })
  })

  test.afterAll(async () => {
    try {
      await app?.close()
    } catch {
      // 忽略关闭异常
    }
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    } catch {
      // 忽略临时目录清理异常
    }
  })

  test('P1 · 打包后 preload 桥接仍注入 window.grain(含 testMode=true)', async () => {
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
    const probe = await page.evaluate(() => {
      type GrainApi = { invoke?: unknown; testMode?: unknown; platform?: unknown }
      const g = (window as unknown as { grain?: GrainApi }).grain
      return {
        hasGrain: typeof g === 'object' && g !== null,
        hasInvoke: typeof g?.invoke === 'function',
        testMode: g?.testMode === true,
      }
    })
    expect(probe.hasGrain).toBe(true)
    expect(probe.hasInvoke).toBe(true)
    // GRAINMARK_TEST=1 已注入 → preload 应暴露 testMode=true
    expect(probe.testMode).toBe(true)
  })

  test('P2 · Sidebar 渲染(asar 内 React/CSS 资源可加载)', async () => {
    const page = await app.firstWindow()
    await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('nav-library')).toBeVisible()
  })

  test('P3 · native binding 可用:photo:import 真实触发 sharp + exiftool', async () => {
    // 拷贝一张 fixture 到临时工作区(asar 内的 fixtures 不一定对 PathGuard 可访问;
    // tmp 目录是 main.ts 默认白名单的一部分)。
    const fixtureSrc = path.resolve(__dirname, '../fixtures/images/gradient-rgb.jpg')
    if (!fs.existsSync(fixtureSrc)) {
      throw new Error(`[P3] fixture 缺失:${fixtureSrc}(运行 \`npm run fixtures:generate\`?)`)
    }
    const fixtureDst = path.join(tmpWork, 'gradient-rgb.jpg')
    fs.copyFileSync(fixtureSrc, fixtureDst)

    const page = await app.firstWindow()
    const imported = await page.evaluate(async (p: string) => {
      type GrainApi = { invoke: (ch: string, ...args: unknown[]) => Promise<unknown> }
      const grain = (window as unknown as { grain: GrainApi }).grain
      return grain.invoke('photo:import', [p])
    }, fixtureDst)

    // importPhotos 内部路径:validateImageFile → readExif(exiftool-vendored)
    //                      → resolveDisplayDimensions(sharp metadata)
    //                      → makeThumbnail(sharp encode)→ photos.json upsert
    // 任一 native binding 缺失都会让这一步抛或返回空数组
    expect(Array.isArray(imported)).toBe(true)
    const list = imported as Array<Record<string, unknown>>
    expect(list.length, 'photo:import 返回空数组,native binding 可能缺失').toBeGreaterThan(0)
    const first = list[0] ?? {}
    // sharp 读出的宽高(metadata):gradient-rgb 是 jpeg,至少得到 > 0
    expect(first.width, 'photo.width 为 0,sharp metadata 未生效').toBeGreaterThan(0)
    expect(first.height, 'photo.height 为 0,sharp metadata 未生效').toBeGreaterThan(0)
    // makeThumbnail 返回的磁盘路径必须存在(证明 sharp encode + fs 写入都通过了)
    const thumbPath = first.thumbPath
    expect(typeof thumbPath, 'thumbPath 不是字符串,sharp encode 链路断').toBe('string')
    expect(fs.existsSync(thumbPath as string), `thumbPath 不存在于磁盘:${thumbPath}`).toBe(true)
  })
})
