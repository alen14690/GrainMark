/**
 * histogram benchmark
 *
 * 覆盖：
 *   - computeHistogramFromRgba 对三种尺寸（preview / 12MP / 24MP）
 *   - stride=1（精确）vs stride=4（预览 4x subsample，实际 Editor 走此路径）
 *   - stride=16（低精度快速反馈）
 *
 * 红线参考：AGENTS.md「实时直方图 readPixels + 120ms debounce 不阻塞滑块」
 * 期望：stride=4 对 1600x1067 应 < 5ms（占 120ms debounce 预算的 4%）
 */
import { bench, describe } from 'vitest'
import { computeHistogramFromRgba } from '../../src/lib/histogram'
import { BENCH_RESOLUTIONS, makeRgbaPixels } from './_fixtures'

for (const preset of [BENCH_RESOLUTIONS.preview, BENCH_RESOLUTIONS.mp12, BENCH_RESOLUTIONS.mp24] as const) {
  const { width, height, label } = preset
  const pixels = makeRgbaPixels(width, height)

  describe(`histogram · ${label}`, () => {
    bench('stride=1 (精确)', () => {
      computeHistogramFromRgba(pixels, 1)
    })

    bench('stride=4 (Editor 默认)', () => {
      computeHistogramFromRgba(pixels, 4)
    })

    bench('stride=16 (低精度快反馈)', () => {
      computeHistogramFromRgba(pixels, 16)
    })
  })
}
