import { type ClassValue, clsx } from 'clsx'

/** tailwind-friendly clsx wrapper */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

/** 数字格式化（带符号，等宽） */
export function fmtSigned(n: number, digits = 0): string {
  const fixed = n.toFixed(digits)
  return n > 0 ? `+${fixed}` : fixed
}

/** 评分等级 → 颜色 token 名 */
export function gradeToColor(grade: 'surpass' | 'reach' | 'near' | 'below' | 'far'): string {
  const map = {
    surpass: 'score-surpass',
    reach: 'score-reach',
    near: 'score-near',
    below: 'score-below',
    far: 'score-far',
  }
  return map[grade]
}

/** clamp */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** 线性映射 */
export function mapRange(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin
  return outMin + ((v - inMin) * (outMax - outMin)) / (inMax - inMin)
}
