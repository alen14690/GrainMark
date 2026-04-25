/**
 * pipelineSharp benchmark
 *
 * 覆盖：
 *   - 无滤镜 passthrough（纯 format/resize 基线）
 *   - tone 通道单独
 *   - 全 6 通道组合
 *   - 输出 jpg vs webp vs png 对比
 *
 * 红线参考：AGENTS.md「批处理吞吐 4 worker ≈ 30-50 张 24MP JPG/分钟」
 * 单张 24MP 预算 ≈ 1200-2000ms；preview 尺寸（1600 长边）应在 60-200ms
 *
 * 注意：bench 输入用 preview 尺寸（1600×1067）而非 24MP —— 24MP 单张 1-3 秒，
 * vitest bench 默认跑 10+ 次，会让一个 bench 文件跑 10 分钟以上。
 */
import { bench, describe } from 'vitest'
import { applyPipeline } from '../../electron/services/batch/pipelineSharp'
import type { FilterPipeline } from '../../shared/types'
import { BENCH_RESOLUTIONS, makeBenchJpeg } from './_fixtures'

const { width, height, label } = BENCH_RESOLUTIONS.preview
const input = await makeBenchJpeg(width, height, 90)

const toneOnly: FilterPipeline = {
  tone: { exposure: 20, contrast: 15 },
}

const allSixChannels: FilterPipeline = {
  tone: { exposure: 20, contrast: 15, highlights: -30, shadows: 40 },
  whiteBalance: { temp: 15, tint: -10 },
  saturation: 20,
  vibrance: 30,
  clarity: 25,
  vignette: { amount: -30, midpoint: 50, feather: 50, roundness: 0 },
}

describe(`pipelineSharp · ${label} · 输出 jpg`, () => {
  bench('passthrough（无滤镜）', async () => {
    await applyPipeline({ input, pipeline: null, format: 'jpg', quality: 90, keepExif: false })
  })
  bench('tone 单通道', async () => {
    await applyPipeline({ input, pipeline: toneOnly, format: 'jpg', quality: 90, keepExif: false })
  })
  bench('全 6 通道', async () => {
    await applyPipeline({
      input,
      pipeline: allSixChannels,
      format: 'jpg',
      quality: 90,
      keepExif: false,
    })
  })
})

describe(`pipelineSharp · ${label} · 输出格式对比（全 6 通道）`, () => {
  bench('jpg q=90', async () => {
    await applyPipeline({
      input,
      pipeline: allSixChannels,
      format: 'jpg',
      quality: 90,
      keepExif: false,
    })
  })
  bench('webp q=90', async () => {
    await applyPipeline({
      input,
      pipeline: allSixChannels,
      format: 'webp',
      quality: 90,
      keepExif: false,
    })
  })
  bench('png', async () => {
    await applyPipeline({
      input,
      pipeline: allSixChannels,
      format: 'png',
      quality: 90,
      keepExif: false,
    })
  })
})
