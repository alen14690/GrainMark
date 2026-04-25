/**
 * 扩展 Vitest expect 类型
 */
import 'vitest'

interface CustomMatchers<R = unknown> {
  toMatchImageBaseline(baselinePath: string, opts?: { threshold?: number }): R
  toBeInRgbRange(range: { r?: [number, number]; g?: [number, number]; b?: [number, number] }): R
  toBeInLabRange(range: { L?: [number, number]; a?: [number, number]; b?: [number, number] }): R
  toHaveHistogramMeanBetween(min: number, max: number): R
}

declare module 'vitest' {
  interface Assertion<T = unknown> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
