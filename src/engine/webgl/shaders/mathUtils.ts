/**
 * 共享数学工具——shader TypeScript 辅助函数
 *
 * AGENTS.md #8 要求：同一语义散布 >= 2 处即须提取为单一函数。
 * clamp 此前在 10 个 shader 文件中各自定义，现统一到此处。
 */

/** 将数值限制在 [min, max] 区间内 */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
