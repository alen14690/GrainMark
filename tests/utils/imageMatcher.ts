/**
 * 图像对比工具 + 自定义 Vitest matcher
 */
import fs from 'node:fs'
import path from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export interface PixelDiffResult {
  diffPixels: number
  diffPercent: number
  width: number
  height: number
  diffImage: Buffer
}

/** 比较两张 PNG 的像素差异 */
export function comparePNG(
  actual: Buffer,
  expected: Buffer,
  options: { threshold?: number } = {},
): PixelDiffResult {
  const a = PNG.sync.read(actual)
  const b = PNG.sync.read(expected)
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`Image dimensions differ: actual=${a.width}x${a.height}, expected=${b.width}x${b.height}`)
  }
  const diff = new PNG({ width: a.width, height: a.height })
  const diffCount = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: options.threshold ?? 0.1,
    includeAA: false,
  })
  return {
    diffPixels: diffCount,
    diffPercent: diffCount / (a.width * a.height),
    width: a.width,
    height: a.height,
    diffImage: PNG.sync.write(diff),
  }
}

/** 加载基线 PNG；不存在时返回 null（首次快照建立模式） */
export function loadBaseline(baselineRelPath: string): Buffer | null {
  const p = path.resolve('tests/baselines', baselineRelPath)
  if (!fs.existsSync(p)) return null
  return fs.readFileSync(p)
}

/** 保存基线 PNG */
export function saveBaseline(baselineRelPath: string, data: Buffer): void {
  const p = path.resolve('tests/baselines', baselineRelPath)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, data)
}

/** 写 diff 到 test-results 供排查 */
export function writeDiffArtifact(name: string, diffImg: Buffer): string {
  const dir = path.resolve('test-results/image-diffs')
  fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, `${name}.diff.png`)
  fs.writeFileSync(p, diffImg)
  return p
}

/** Vitest matcher：像素级比对（F4 修复：禁止自动写 baseline，必须显式 bless） */
export const imageMatchers = {
  toMatchImageBaseline(received: Buffer, baselinePath: string, opts: { threshold?: number } = {}) {
    // F4：只有显式 bless 才允许写 baseline。默认行为：缺失/不一致一律判失败，
    //     避免"首次运行把任意输出固化成 baseline"这类零防护陷阱。
    const bless =
      process.env.GRAINMARK_BLESS_BASELINES === '1' ||
      process.env.UPDATE_SNAPSHOTS === '1' ||
      process.argv.includes('-u') ||
      process.argv.includes('--update')

    const baseline = loadBaseline(baselinePath)

    if (!baseline) {
      if (bless) {
        saveBaseline(baselinePath, received)
        return {
          pass: true,
          message: () => `Baseline blessed: ${baselinePath}`,
        }
      }
      return {
        pass: false,
        message: () =>
          `Baseline missing: ${baselinePath}. Run "GRAINMARK_BLESS_BASELINES=1 npm test" or "npm run snapshot:update" after manual review.`,
      }
    }

    let result: PixelDiffResult
    try {
      result = comparePNG(received, baseline, { threshold: opts.threshold ?? 0.1 })
    } catch (e) {
      return {
        pass: false,
        message: () => `Image compare failed: ${(e as Error).message}`,
      }
    }

    const allowedPercent = 0.005 // 默认容忍 0.5%
    if (result.diffPercent > allowedPercent) {
      if (bless) {
        saveBaseline(baselinePath, received)
        return {
          pass: true,
          message: () =>
            `Baseline updated: ${baselinePath} (was diff ${(result.diffPercent * 100).toFixed(3)}%)`,
        }
      }
      const diffFile = writeDiffArtifact(baselinePath.replace(/[/\\]/g, '_'), result.diffImage)
      return {
        pass: false,
        message: () =>
          `Image differs by ${(result.diffPercent * 100).toFixed(3)}% (${result.diffPixels} px), ` +
          `baseline=${baselinePath}, diff=${diffFile}`,
      }
    }

    return {
      pass: true,
      message: () => `Image matched baseline (diff ${(result.diffPercent * 100).toFixed(4)}%)`,
    }
  },
}
