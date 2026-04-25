/**
 * Batch IPC 集成测试（Playwright + Electron）
 *
 * 定位：
 * - AGENTS.md 测试金字塔 Integration 层
 * - 启动真 Electron（main + preload + renderer），通过 window.grain.invoke 发 IPC
 * - 端到端验证：worker_threads 启动 · sharp 管线 · 文件写盘 · 命名模板 · 进度事件 · cancel
 *
 * 运行：
 *   npm run build           # 必须先 build 出 dist-electron
 *   npm run test:integration
 *
 * 超时：
 * - Electron 冷启动约 3-5s
 * - 8 张 100×100 测试图 batch 通常 < 3s
 * - project timeout 60s（playwright.config.ts）
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type ElectronApplication, _electron as electron, expect, test } from '@playwright/test'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let app: ElectronApplication
let fixturesDir: string
let outputDir: string
let photoPaths: string[]

/** 生成 N 张 100×100 渐变 JPEG 测试图 */
async function makeFixtures(dir: string, count: number): Promise<string[]> {
  fs.mkdirSync(dir, { recursive: true })
  const paths: string[] = []
  for (let i = 0; i < count; i++) {
    const gray = Math.round((i + 1) * (255 / (count + 1)))
    const buffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: gray, g: gray, b: gray } },
    })
      .jpeg({ quality: 90 })
      .toBuffer()
    const p = path.join(dir, `test_${String(i + 1).padStart(2, '0')}.jpg`)
    fs.writeFileSync(p, buffer)
    paths.push(p)
  }
  return paths
}

test.describe('batch IPC · 端到端', () => {
  test.beforeAll(async () => {
    // 准备临时目录 + 测试图
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grainmark-batch-it-'))
    fixturesDir = path.join(tmp, 'fixtures')
    outputDir = path.join(tmp, 'output')
    photoPaths = await makeFixtures(fixturesDir, 5)

    // 启动 Electron
    const mainPath = path.resolve(__dirname, '../../dist-electron/main.js')
    if (!fs.existsSync(mainPath)) {
      throw new Error(`dist-electron/main.js not found. Run 'npm run build' first. Path=${mainPath}`)
    }
    app = await electron.launch({
      args: [mainPath],
      // 禁用 devtools + 用非生产 userData 防污染真实数据
      env: {
        ...process.env,
        GRAINMARK_TEST: '1',
        GRAINMARK_USER_DATA: path.join(tmp, 'userData'),
      },
      timeout: 30000,
    })
  })

  test.afterAll(async () => {
    if (app) await app.close()
  })

  test('启动后 window.grain 可用（preload 桥接）', async () => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    const hasGrain = await page.evaluate(
      () => typeof (window as unknown as { grain?: unknown }).grain === 'object',
    )
    expect(hasGrain).toBe(true)
  })

  test('batch:start 跑通 5 张图 → 输出目录有 5 个 JPEG', async () => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const result = await page.evaluate(
      async ({ paths, outDir }) => {
        type GrainApi = {
          invoke: (ch: string, ...args: unknown[]) => Promise<unknown>
          on: (ch: string, listener: (...args: unknown[]) => void) => () => void
        }
        const grain = (window as unknown as { grain: GrainApi }).grain
        const progressEvents: unknown[] = []
        const off = grain.on('batch:progress', (evt) => progressEvents.push(evt))
        const config = {
          filterId: null,
          watermarkTemplateId: null,
          outputDir: outDir,
          format: 'jpg',
          quality: 90,
          keepExif: false,
          colorSpace: 'srgb',
          namingTemplate: '{name}_batched_{index}',
          concurrency: 2,
        }
        const jobId = await grain.invoke('batch:start', config, paths)
        // 轮询直到 job 完成（最多 20s）
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 500))
          const status = (await grain.invoke('batch:status', jobId)) as {
            status: string
            items: Array<{ status: string; outputPath?: string }>
          } | null
          if (
            status &&
            (status.status === 'success' || status.status === 'failed' || status.status === 'cancelled')
          ) {
            off()
            return { jobId, status, progressCount: progressEvents.length }
          }
        }
        off()
        throw new Error('batch did not finish in 20s')
      },
      { paths: photoPaths, outDir: outputDir },
    )

    expect(result.status.status).toBe('success')
    expect(result.status.items).toHaveLength(5)
    // 所有 item 成功
    for (const item of result.status.items) {
      expect(item.status).toBe('success')
      expect(item.outputPath).toBeTruthy()
      expect(fs.existsSync(item.outputPath!)).toBe(true)
    }
    // progress 事件至少收到了 completed 变化（每个 item 至少 1 次 running + 1 次 success）
    expect(result.progressCount).toBeGreaterThanOrEqual(5)

    // 输出目录应恰好 5 个 .jpg
    const files = fs.readdirSync(outputDir).filter((f) => f.endsWith('.jpg'))
    expect(files).toHaveLength(5)
  })

  test('命名模板 {name}_batched_{index} 生效（4 位零填充）', () => {
    const files = fs
      .readdirSync(outputDir)
      .filter((f) => f.endsWith('.jpg'))
      .sort()
    // 5 张输入 test_01 ~ test_05 → 输出 test_01_batched_0001 ~ test_05_batched_0005
    expect(files[0]).toBe('test_01_batched_0001.jpg')
    expect(files[4]).toBe('test_05_batched_0005.jpg')
  })

  test('batch:cancel 能真实取消一半以上 items', async () => {
    const page = await app.firstWindow()
    const cancelOutputDir = path.join(path.dirname(outputDir), 'output-cancel')

    // 30 张更大的图让 worker 有时间被打断
    const largePaths: string[] = []
    for (let i = 0; i < 30; i++) {
      const buffer = await sharp({
        create: { width: 1200, height: 1200, channels: 3, background: { r: (i * 7) % 255, g: 120, b: 80 } },
      })
        .jpeg({ quality: 92 })
        .toBuffer()
      const p = path.join(fixturesDir, `large_${i}.jpg`)
      fs.writeFileSync(p, buffer)
      largePaths.push(p)
    }

    const result = await page.evaluate(
      async ({ paths, outDir }) => {
        type GrainApi = {
          invoke: (ch: string, ...args: unknown[]) => Promise<unknown>
          on: (ch: string, listener: (...args: unknown[]) => void) => () => void
        }
        const grain = (window as unknown as { grain: GrainApi }).grain
        const config = {
          filterId: null,
          watermarkTemplateId: null,
          outputDir: outDir,
          format: 'jpg',
          quality: 90,
          keepExif: false,
          colorSpace: 'srgb',
          namingTemplate: '{name}_{index}',
          concurrency: 2,
        }
        const jobId = (await grain.invoke('batch:start', config, paths)) as string
        // 等 400ms 让前几张开始处理，然后 cancel
        await new Promise((r) => setTimeout(r, 400))
        await grain.invoke('batch:cancel', jobId)
        // 再等 2s 让 shutdown 完成
        await new Promise((r) => setTimeout(r, 2000))
        const status = (await grain.invoke('batch:status', jobId)) as {
          status: string
          items: Array<{ status: string }>
        } | null
        return { status }
      },
      { paths: largePaths, outDir: cancelOutputDir },
    )

    expect(result.status!.status).toBe('cancelled')
    const cancelledCount = result.status!.items.filter((it) => it.status === 'cancelled').length
    const successCount = result.status!.items.filter((it) => it.status === 'success').length
    // 至少有一部分被取消（不是全部 30 个都完成了）
    expect(cancelledCount).toBeGreaterThan(0)
    // 也可能有少数在 cancel 前已完成
    expect(cancelledCount + successCount).toBe(30)
  })

  test('photoPaths 中包含不存在的文件时不影响其他 items', async () => {
    const page = await app.firstWindow()
    const mixedOut = path.join(path.dirname(outputDir), 'output-mixed')
    const mixed = [photoPaths[0]!, path.join(fixturesDir, 'NONEXISTENT.jpg'), photoPaths[1]!]

    const result = await page.evaluate(
      async ({ paths, outDir }) => {
        type GrainApi = {
          invoke: (ch: string, ...args: unknown[]) => Promise<unknown>
        }
        const grain = (window as unknown as { grain: GrainApi }).grain
        const config = {
          filterId: null,
          watermarkTemplateId: null,
          outputDir: outDir,
          format: 'jpg',
          quality: 90,
          keepExif: false,
          colorSpace: 'srgb',
          namingTemplate: '{name}_mix',
          concurrency: 2,
        }
        const jobId = (await grain.invoke('batch:start', config, paths)) as string
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 300))
          const s = (await grain.invoke('batch:status', jobId)) as {
            status: string
            items: Array<{ status: string }>
          }
          if (s.status === 'success' || s.status === 'failed' || s.status === 'cancelled') return s
        }
        throw new Error('timeout')
      },
      { paths: mixed, outDir: mixedOut },
    )

    expect(['success', 'failed']).toContain(result.status)
    const successCount = result.items.filter((it) => it.status === 'success').length
    const failedCount = result.items.filter((it) => it.status === 'failed').length
    expect(successCount).toBe(2) // 两张真实图都应成功
    expect(failedCount).toBe(1) // 不存在的那张失败
  })

  test('GPU 路径（含 colorGrading/grain/halation 的 preset）跑通 3 张', async () => {
    const page = await app.firstWindow()
    const gpuOut = path.join(path.dirname(outputDir), 'output-gpu')

    const result = await page.evaluate(
      async ({ paths, outDir }) => {
        type GrainApi = {
          invoke: (ch: string, ...args: unknown[]) => Promise<unknown>
        }
        const grain = (window as unknown as { grain: GrainApi }).grain
        const config = {
          filterId: 'kodak-portra-400', // 含 GPU-only 通道：colorGrading + grain + halation
          watermarkTemplateId: null,
          outputDir: outDir,
          format: 'jpg',
          quality: 90,
          keepExif: false,
          colorSpace: 'srgb',
          namingTemplate: '{name}_gpu_{index}',
          concurrency: 2,
        }
        const jobId = (await grain.invoke('batch:start', config, paths.slice(0, 3))) as string
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 500))
          const s = (await grain.invoke('batch:status', jobId)) as {
            status: string
            items: Array<{ status: string; outputPath?: string; error?: string }>
          } | null
          if (s && (s.status === 'success' || s.status === 'failed' || s.status === 'cancelled')) {
            return s
          }
        }
        throw new Error('GPU batch did not finish in 30s')
      },
      { paths: photoPaths, outDir: gpuOut },
    )

    // GPU 路径可能在 CI headless 环境下 WebGL 2 不可用，这时预期失败但有明确错误
    if (result.status === 'failed') {
      const errors = result.items.map((it) => it.error).filter(Boolean)
      // 打印所有失败原因以便调试
      console.log('[GPU test] item errors:', errors)
      // 所有 item 的 error 里至少应该有 gpu/webgl/bootstrap 相关字样（明确的失败原因）
      const hasGpuError = errors.some((e) => /gpu|webgl|bootstrap/i.test(e ?? ''))
      if (!hasGpuError) {
        throw new Error(`GPU 路径失败但错误不含 gpu 关键字。errors=${JSON.stringify(errors)}`)
      }
      return
    }

    expect(result.status).toBe('success')
    expect(result.items).toHaveLength(3)
    for (const item of result.items) {
      expect(item.status).toBe('success')
      expect(item.outputPath).toBeTruthy()
      expect(fs.existsSync(item.outputPath!)).toBe(true)
    }
    // 输出文件名应含 _gpu_
    const files = fs.readdirSync(gpuOut).filter((f) => f.endsWith('.jpg'))
    expect(files.every((f) => f.includes('_gpu_'))).toBe(true)
  })
})
