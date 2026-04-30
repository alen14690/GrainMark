/**
 * seedFixtures — 把测试 fixtures 拷贝到临时工作目录 + 注入到 photoStore
 *
 * 职责单一（AGENTS.md 第 8 条）：
 *   - 从 tests/fixtures/images/*.jpg 挑选 N 张
 *   - 拷贝到 launchApp 返回的 tmpDir/work/photos/ 下（随机子目录避免同名冲突）
 *   - 通过 IPC photo:import 注入到主进程 photoStore
 *   - 返回注入后的 Photo 列表（供 spec assert id / path）
 *
 * 为什么不直接读 fixtures 源路径注入：
 *   - fixtures 在仓库路径下，不一定在 PathGuard 白名单里（repo root 可能在 Desktop 外）
 *   - 拷到 os.tmpdir() 下能命中 main.ts 默认白名单（app.getPath('temp')）
 *   - 这也更贴近真实使用：用户导入的图通常是运行时目录
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { grainInvoke } from './grainInvoke'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Photo 类型子集（避免 E2E 层依赖 shared/types 的全部字段） */
export interface SeededPhoto {
  id: string
  name: string
  path: string
  width?: number
  height?: number
}

/**
 * 默认 fixture 集合：优先挑色彩/渐变/肤色，避免 with-gps.jpg（含真实 GPS，E2E 无需）
 */
const DEFAULT_FIXTURE_NAMES = ['gradient-rgb.jpg', 'skin-tones-5.jpg', 'full-exif.jpg'] as const

export interface SeedPhotosOptions {
  /** 要拷贝并注入的 fixture 文件名（默认 DEFAULT_FIXTURE_NAMES 全部） */
  names?: readonly string[]
  /** 目标工作目录（通常是 launchApp 的 tmpDir）下的子目录名，默认 'work/photos' */
  subdir?: string
}

/**
 * 从 fixtures 目录拷贝文件到 tmpDir/subdir，然后通过 photo:import IPC 注入。
 *
 * @param page    Playwright Page
 * @param tmpDir  launchApp 的 tmpDir（绝对路径）
 * @returns       注入成功的 Photo 列表（至少 1 张；不足则抛错）
 */
export async function seedPhotos(
  page: Page,
  tmpDir: string,
  options: SeedPhotosOptions = {},
): Promise<SeededPhoto[]> {
  const names = options.names ?? DEFAULT_FIXTURE_NAMES
  const subdir = options.subdir ?? 'work/photos'
  const destDir = path.join(tmpDir, subdir)
  fs.mkdirSync(destDir, { recursive: true })

  // 定位 fixtures 源目录：tests/e2e/_support/ → repo-root/tests/fixtures/images/
  const fixturesDir = path.resolve(__dirname, '../../fixtures/images')
  const copiedPaths: string[] = []
  for (const name of names) {
    const src = path.join(fixturesDir, name)
    if (!fs.existsSync(src)) {
      throw new Error(`[seedPhotos] fixture 不存在：${src}（运行 \`npm run fixtures:generate\`？）`)
    }
    const dst = path.join(destDir, name)
    fs.copyFileSync(src, dst)
    copiedPaths.push(dst)
  }

  // 通过 IPC 注入（photo:import 内部会过 PathGuard + readExif + 生成 thumb）
  const imported = await grainInvoke<SeededPhoto[]>(page, 'photo:import', copiedPaths)
  if (!Array.isArray(imported) || imported.length === 0) {
    throw new Error(`[seedPhotos] photo:import 返回空数组。copiedPaths=${copiedPaths.join(',')}`)
  }
  return imported
}
