/**
 * 卤化银设计系统（Silver Halide Design System）
 * —— Design Tokens
 *
 * 设计哲学：
 *   1. Film First, Chrome Last  — 图像是主角，UI 装饰 ≤ 20%
 *   2. 信息建筑                 — 有层次，不是一堆
 *   3. 暗房质感                 — 深色非纯黑，带温度
 *   4. 数字 EXIF 的仪式感       — 等宽 + 衬线混排
 *   5. 胶片颗粒贯穿背景         — 极淡，可关闭
 *   6. 动效即呼吸               — 不是炫技
 */

// ============ 颜色 ============
export const colors = {
  // 暗房褐（Darkroom）— 非纯黑，带胶片基底色
  bg: {
    0: '#0E0E10', // 深底
    1: '#16161A', // 卡片底
    2: '#1E1E24', // 悬停
    3: '#2A2A32', // 选中
    overlay: 'rgba(14, 14, 16, 0.72)', // 模态遮罩
  },
  // 银盐（Silver）— 信息层级
  fg: {
    1: '#F5F3EE', // 主文字（偏暖白，不刺眼）
    2: '#A8A39A', // 次文字
    3: '#6C6860', // 辅助
    4: '#3D3A35', // 分隔
  },
  // 品牌色 — 显影红 + 定影金
  brand: {
    red: '#C8302A', // Leica 红那种，点缀用，绝不大面积
    amber: '#E8B961', // 暖金，高光调/CTA
    amberSoft: '#F0C983',
    cyanDeep: '#4A8A9E', // 冷阴影 / 参数滑块高亮
  },
  // 情绪色 — 低饱和
  semantic: {
    success: '#7A9A6B', // 墨绿
    warn: '#C89A4A', // 铜黄
    error: '#B04A42', // 土红
    info: '#6C8FA6', // 青灰
  },
  // 评分渐变（P4 评分系统用）
  score: {
    surpass: '#E8B961', // 超越 = 金
    reach: '#7A9A6B', // 达标 = 墨绿
    near: '#C89A4A', // 接近 = 铜黄
    below: '#B08560', // 差距 = 土橙
    far: '#7A5553', // 相差 = 暗红褐
  },
} as const

// ============ 字体 ============
export const fonts = {
  display: '"Fraunces", "Source Serif 4", Georgia, serif',
  body: '"Inter", "SF Pro Text", -apple-system, system-ui, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
  numeric: '"IBM Plex Mono", "JetBrains Mono", ui-monospace, Menlo, monospace', // 表盘感
} as const

// ============ 字号（专业摄影 UI 倾向小字号） ============
export const fontSize = {
  xxs: '10px',
  xs: '11px',
  sm: '12px',
  base: '13px',
  md: '14px',
  lg: '16px',
  xl: '20px',
  '2xl': '26px',
  '3xl': '32px',
  '4xl': '44px',
} as const

// ============ 间距（8px 网格） ============
export const spacing = {
  0: '0',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
} as const

// ============ 圆角（克制） ============
export const radius = {
  none: '0',
  xs: '3px',
  sm: '5px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '999px',
} as const

// ============ 阴影（柔和暖调） ============
export const shadow = {
  xs: '0 1px 2px rgba(0,0,0,0.18)',
  sm: '0 2px 4px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.02)',
  md: '0 4px 12px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.03)',
  lg: '0 12px 32px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.04)',
  // 高光 CTA 的暖光辉
  glow: '0 0 20px rgba(232, 185, 97, 0.25), 0 0 40px rgba(232, 185, 97, 0.10)',
  // 评分徽章
  badge: '0 1px 0 rgba(255,255,255,0.06) inset, 0 1px 2px rgba(0,0,0,0.4)',
} as const

// ============ 动效 ============
export const motion = {
  duration: {
    instant: 80, // 瞬时反馈（按下）
    fast: 150, // 悬停 / 焦点
    base: 250, // 视图切换
    slow: 420, // 模态进入
    glacial: 800, // 第一次加载
  },
  easing: {
    standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
    emphasized: 'cubic-bezier(0.2, 0.0, 0.0, 1)',
    decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.4, 0.0, 1, 1)',
    // 胶片抖动感（微妙）
    filmic: 'cubic-bezier(0.65, 0.05, 0.36, 1)',
  },
} as const

// ============ Z-Index ============
export const zIndex = {
  base: 0,
  raised: 1,
  sticky: 10,
  overlay: 20,
  modal: 30,
  toast: 40,
  tooltip: 50,
} as const

// ============ 断点（桌面 APP 不重要，最小集） ============
export const breakpoints = {
  compact: 1280,
  comfort: 1440,
  spacious: 1680,
} as const

// ============ 语义化 Token（供组件直接使用） ============
export const tokens = {
  card: {
    bg: colors.bg[1],
    bgHover: colors.bg[2],
    bgActive: colors.bg[3],
    border: colors.fg[4],
    borderHover: colors.fg[3],
    borderFocus: colors.brand.amber,
    radius: radius.md,
    shadow: shadow.sm,
  },
  button: {
    primary: {
      bg: colors.brand.amber,
      bgHover: colors.brand.amberSoft,
      fg: colors.bg[0],
      shadow: shadow.glow,
    },
    secondary: {
      bg: colors.bg[2],
      bgHover: colors.bg[3],
      fg: colors.fg[1],
      border: colors.fg[4],
    },
    ghost: {
      bg: 'transparent',
      bgHover: colors.bg[2],
      fg: colors.fg[2],
      fgHover: colors.fg[1],
    },
    danger: {
      bg: colors.semantic.error,
      fg: colors.fg[1],
    },
  },
  input: {
    bg: colors.bg[1],
    bgFocus: colors.bg[0],
    fg: colors.fg[1],
    fgPlaceholder: colors.fg[3],
    border: colors.fg[4],
    borderFocus: colors.brand.amber,
  },
  slider: {
    track: colors.fg[4],
    trackFill: colors.brand.cyanDeep,
    thumb: colors.fg[1],
    thumbShadow: shadow.md,
    halo: 'rgba(74, 138, 158, 0.25)',
  },
  histogram: {
    r: '#C8302A',
    g: '#7A9A6B',
    b: '#4A8A9E',
    luma: colors.fg[2],
    bg: colors.bg[0],
  },
} as const

export type DesignTokens = {
  colors: typeof colors
  fonts: typeof fonts
  fontSize: typeof fontSize
  spacing: typeof spacing
  radius: typeof radius
  shadow: typeof shadow
  motion: typeof motion
  zIndex: typeof zIndex
  tokens: typeof tokens
}

export const designTokens: DesignTokens = {
  colors,
  fonts,
  fontSize,
  spacing,
  radius,
  shadow,
  motion,
  zIndex,
  tokens,
}
