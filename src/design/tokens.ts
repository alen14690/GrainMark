/**
 * Aurora Glass 设计系统
 * —— Design Tokens (Pass 2.5)
 *
 * 设计哲学（取代原卤化银）：
 *   1. Deep Space Canvas   — 深空极光底，非纯黑，带细微蓝紫倾向
 *   2. Liquid Glass        — 多层毛玻璃面板 + 边缘高光 + 内阴影
 *   3. Aurora Accent       — 金（点缀）/ 紫（主强调）/ 青（次强调），冷调为主
 *   4. Film Soul Preserved — 极淡颗粒（0.02）+ Instrument Serif 保留胶片灵魂
 *   5. Quiet Motion        — 60s 周期的漂移动效，"在呼吸但不打扰"
 *   6. Brand Red for Error Only — Leica 红退为破坏性/错误专用
 *
 * 兼容策略：
 *   - 保留 `bg[0..3]`、`fg[1..4]`、`brand.amber/red/cyanDeep`、`score.*` 名称
 *   - 色值切换为 Aurora 深空紫深色系 + 冷调滑块 + 金色 CTA
 *   - 新增 `glass`、`aurora`、`glow` 三组对外命名空间
 */

// ============ 基础色（Aurora 深空底） ============
export const colors = {
  // 背景层 — 深空蓝紫，非纯黑
  bg: {
    0: '#05060E', // 最底层深空
    1: '#0A0B1E', // 主画布
    2: '#141430', // 面板浮起
    3: '#1E1E3C', // 选中态
    overlay: 'rgba(5, 6, 14, 0.72)', // 模态遮罩
  },
  // 前景层 — 冷白偏蓝，而非暖白
  fg: {
    1: '#E8E6F0', // 主文字
    2: '#A8A5B8', // 次文字
    3: '#6A6882', // 辅助
    4: '#2D2D45', // 分隔
  },
  // 品牌色 —— Aurora 三辉
  brand: {
    red: '#C8302A', // 保留原值，仅用于 error / 破坏性操作（Q4-B）
    amber: '#D4B88A', // 金 —— 提分数值 / CTA 高亮
    amberSoft: '#E8D2A8',
    violet: '#B589FF', // 主强调（滑块 fill / 链接 / active）
    violetSoft: '#CCABFF',
    cyan: '#5ECDF7', // 次强调（信息/hover 边缘高光）
    cyanDeep: '#5ECDF7', // 保留旧名字，指向同一色
  },
  // 情绪色 — 低饱和冷色化
  semantic: {
    success: '#7DDAB2',
    warn: '#E8B961',
    error: '#FF5A5F',
    info: '#8AB4F8',
  },
  // 评分渐变（P4 评分系统用）
  score: {
    surpass: '#D4B88A', // 超越 = 金
    reach: '#7DDAB2', // 达标 = 薄荷
    near: '#E8B961', // 接近 = 琥珀
    below: '#D0907A', // 差距 = 暖褐
    far: '#8A6575', // 相差 = 暗紫褐
  },
  // 玻璃面板（Liquid Glass 系统）
  glass: {
    // 半透底色（配合 backdrop-filter 使用）
    surface: 'rgba(255, 255, 255, 0.04)',
    elevated: 'rgba(255, 255, 255, 0.06)',
    overlay: 'rgba(255, 255, 255, 0.08)',
    // 边框
    border: 'rgba(255, 255, 255, 0.10)',
    borderStrong: 'rgba(255, 255, 255, 0.18)',
    // 高光 —— 面板顶部内阴影
    highlight: 'rgba(255, 255, 255, 0.15)',
  },
  // Aurora 极光底层光源（AuroraBackdrop 组件用）
  aurora: {
    violet: '#3A2D7A',
    cyan: '#5ECDF7',
    magenta: '#B589FF',
    rose: '#E06BA8',
  },
} as const

// ============ 字体（简化，去掉 Fraunces / IBM Plex Mono） ============
export const fonts = {
  // Display：衬线意式斜体，仅用于大标题 "Film Post-Production" 等
  display: '"Instrument Serif", "Source Serif 4", Georgia, serif',
  // Body：现代感无衬线
  body: '"Inter", "SF Pro Text", -apple-system, system-ui, sans-serif',
  // Mono：代码/参数值
  mono: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
  // Numeric：EXIF 数字，等宽 tnum
  numeric: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
} as const

// ============ 字号 ============
export const fontSize = {
  xxs: '10px',
  xs: '11px',
  sm: '12px',
  base: '13px',
  md: '14px',
  lg: '16px',
  xl: '20px',
  '2xl': '28px',
  '3xl': '36px',
  '4xl': '48px',
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

// ============ 圆角（Aurora 放大一档） ============
export const radius = {
  none: '0',
  xs: '4px',
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  full: '999px',
} as const

// ============ 阴影（冷调 + glow 新增紫/青） ============
export const shadow = {
  xs: '0 1px 2px rgba(0,0,0,0.20)',
  sm: '0 2px 6px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.04)',
  md: '0 8px 24px rgba(0,0,0,0.36), 0 0 0 1px rgba(255,255,255,0.05)',
  lg: '0 20px 50px rgba(0,0,0,0.46), 0 0 0 1px rgba(255,255,255,0.06)',
  // 玻璃内高光（顶部白光）
  glassInset: 'inset 0 1px 0 rgba(255,255,255,0.15)',
  // Aurora CTA 金辉
  glow: '0 0 20px rgba(212, 184, 138, 0.28), 0 0 40px rgba(212, 184, 138, 0.12)',
  // 紫色辉（滑块 focus / active 态）
  glowViolet: '0 0 16px rgba(181, 137, 255, 0.40), 0 0 32px rgba(181, 137, 255, 0.18)',
  // 青色辉（信息 / hover）
  glowCyan: '0 0 16px rgba(94, 205, 247, 0.35), 0 0 32px rgba(94, 205, 247, 0.12)',
  // 评分徽章
  badge: '0 1px 0 rgba(255,255,255,0.08) inset, 0 1px 2px rgba(0,0,0,0.5)',
} as const

// ============ 动效 ============
export const motion = {
  duration: {
    instant: 80,
    fast: 150,
    base: 250,
    slow: 420,
    glacial: 800,
    aurora: 60_000, // Aurora 背景漂移周期（60s）
  },
  easing: {
    standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
    emphasized: 'cubic-bezier(0.2, 0.0, 0.0, 1)',
    decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.4, 0.0, 1, 1)',
    // 液态玻璃弹性
    liquid: 'cubic-bezier(0.22, 1.0, 0.36, 1.0)',
    // 胶片抖动（沿用）
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

// ============ 断点 ============
export const breakpoints = {
  compact: 1280,
  comfort: 1440,
  spacious: 1680,
} as const

// ============ 毛玻璃强度（Q1-A 标准档） ============
export const glassBlur = {
  sm: '12px',
  md: '20px',
  lg: '28px',
  xl: '40px',
} as const

// ============ 语义化 Token ============
export const tokens = {
  card: {
    bg: colors.glass.surface,
    bgHover: colors.glass.elevated,
    bgActive: colors.glass.overlay,
    border: colors.glass.border,
    borderHover: colors.glass.borderStrong,
    borderFocus: colors.brand.amber,
    radius: radius.lg,
    shadow: shadow.md,
    blur: glassBlur.md,
  },
  button: {
    primary: {
      bg: colors.brand.amber,
      bgHover: colors.brand.amberSoft,
      fg: colors.bg[0],
      shadow: shadow.glow,
    },
    secondary: {
      bg: colors.glass.surface,
      bgHover: colors.glass.elevated,
      fg: colors.fg[1],
      border: colors.glass.border,
    },
    ghost: {
      bg: 'transparent',
      bgHover: colors.glass.surface,
      fg: colors.fg[2],
      fgHover: colors.fg[1],
    },
    danger: {
      bg: colors.brand.red,
      fg: colors.fg[1],
    },
  },
  input: {
    bg: colors.glass.surface,
    bgFocus: colors.glass.elevated,
    fg: colors.fg[1],
    fgPlaceholder: colors.fg[3],
    border: colors.glass.border,
    borderFocus: colors.brand.violet,
  },
  slider: {
    track: 'rgba(255,255,255,0.08)',
    trackFill: colors.brand.violet, // 紫色主 fill（mockup 用紫青渐变，track 单色也可）
    trackFillGradient: `linear-gradient(90deg, ${colors.brand.cyan}, ${colors.brand.violet})`,
    thumb: colors.fg[1],
    thumbShadow: shadow.md,
    halo: 'rgba(181, 137, 255, 0.30)',
  },
  histogram: {
    r: '#FF6B6B',
    g: '#7DDAB2',
    b: '#5ECDF7',
    luma: colors.fg[2],
    bg: 'rgba(0,0,0,0.35)',
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
  glassBlur: typeof glassBlur
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
  glassBlur,
  tokens,
}
