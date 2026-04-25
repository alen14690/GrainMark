/**
 * 卤化银动效预设
 */
import { motion } from './tokens'

/** CSS 过渡字符串构造 */
export function transition(
  property: string | string[],
  duration: keyof typeof motion.duration = 'base',
  easing: keyof typeof motion.easing = 'standard',
): string {
  const props = Array.isArray(property) ? property : [property]
  return props.map((p) => `${p} ${motion.duration[duration]}ms ${motion.easing[easing]}`).join(', ')
}

/** 预设：悬停提亮 */
export const presets = {
  hover: transition(['background-color', 'color', 'border-color', 'box-shadow'], 'fast'),
  press: transition(['transform', 'background-color'], 'instant'),
  reveal: transition(['opacity', 'transform'], 'base', 'decelerate'),
  modal: transition(['opacity', 'transform'], 'slow', 'emphasized'),
  filmic: transition(['transform', 'opacity'], 'base', 'filmic'),
} as const

/** 键盘/鼠标驱动的 motion state helper */
export type MotionState = 'idle' | 'hover' | 'active' | 'focus'
