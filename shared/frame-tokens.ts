/**
 * frame-tokens — 边框系统设计 token 集中文件(AGENTS.md 第 8 条 Single Source)
 *
 * 所有边框风格共享的颜色、字号比例、边框比例、字体栈 —— 一处改,全部风格联动。
 * 任何风格的 FrameLayout 数据必须引用这里的常量,不允许在 generator 里写魔法数字。
 *
 * 为什么放 `shared/`(不是 `src/design/`):
 *   - 前端 React 预览(`src/components/frame/layouts/*.tsx`)和后端 Sharp
 *     渲染(`electron/services/frame/generators/*.ts`)**都要读**
 *   - 放 `src/` 会让 electron 跨目录 import 渲染层,违反 AGENTS.md 目录约定
 *   - 本文件只含纯常量和纯函数(classifyOrientation / scaleByMinEdge),
 *     无 Node/Browser API,与 `shared/ipc-schemas.ts`(也含运行时 zod)同级
 *   - 前端通过 `src/design/frame-tokens.ts`(re-export)保持 design 目录汇总惯例
 *
 * 单位约定:
 *   - 所有"边框比例 / 字号比例"都是以 minEdge 的百分比表达
 *   - 例如 `BORDER.polaroid.bottomLandscape = 0.22`,在 4000×3000 横图上 = 0.22 × 3000 = 660px
 *   - 渲染器统一 `scaleByMinEdge(ratio, w, h)` 得到整数像素
 *
 * 修改本文件的风险级别:高 —— 会同时影响所有风格的最终视觉。
 * 修改前必须:
 *   1. 更新 `tests/unit/frameTokens.test.ts` 的契约断言
 *   2. 跑 visual regression 看是否有非预期的像素级回归
 */

// ============================================================================
// 颜色 Token(纸白 / 胶片黑 / 橙红日期戳)
// ============================================================================
//
// 纸白 `#F8F5EE` 而非 `#FFFFFF`:纯白在 JPEG sRGB 下会像打印纸,不像相纸;
//   带微暖色调能模拟宝丽来相纸白平衡,视觉更舒适。
// 胶片黑 `#0A0A0A` 而非 `#000000`:纯黑在 sRGB 下"吸光",与图像边界过于锐利;
//   `#0A0A0A` 留出微细节空间,更像真实胶片负片黑。
// 橙红 `#FF6B00` 来自 CanoDate 80 年代傻瓜相机数字戳的真实取色。
export const COLOR = {
  paperWhite: '#F8F5EE', // 宝丽来相纸白 / 画册白
  filmBlack: '#0A0A0A', // 胶片边 / 画廊黑
  inkGray: '#2A2A2A', // 主文字深灰(纸白底用)
  softGray: '#7A7A7A', // 次要文字(参数)
  dateStampOrange: '#FF6B00', // 老 LCD 数字戳橙红
  accentRed: '#E53935', // 胶片红字 / 负片帧号
  hairlineStroke: '#202020', // 画廊细线框描边
} as const

// ============================================================================
// 边框比例 Token(单位:相对于 minEdge 的百分比)
// ============================================================================
//
// 数值来源:
//   - Polaroid 比例参考真实 Polaroid 600 卡片(86×108mm,底边 22mm ≈ 20%)
//   - Gallery Black 比例参考画册印刷惯例(标准 6-8% 边距 + 14% 底栏)
//   - Film Full Border 参考 135 胶卷实际齿孔区比例(8% 上下)
export const BORDER = {
  polaroid: {
    side: 0.04,
    top: 0.04,
    bottomLandscape: 0.22,
    bottomPortrait: 0.18,
  },
  filmFullBorder: {
    perforationLandscape: 0.08,
    perforationPortrait: 0.08,
  },
  gallery: {
    side: 0.06,
    top: 0.06,
    bottomLandscape: 0.14,
    bottomPortrait: 0.16, // 竖图 ↑ 从 0.12 → 0.16 · 三行堆叠需要足够高度避免挤压
  },
  minimalBar: {
    bottomLandscape: 0.08,
    bottomPortrait: 0.12, // 竖图 ↑ 让 params + date 左右分置不再挤
  },
  hairline: {
    insetLandscape: 0.015,
    insetPortrait: 0.015,
  },
  editorialCaption: {
    bottomLandscape: 0.12,
    bottomPortrait: 0.14, // 竖图 ↑ 从 0.10 → 0.14 · 配合两行堆叠的垂直空间
  },
  spineEdition: {
    bandLandscape: 0.1, // 横图:底部带
    bandPortrait: 0.08, // 竖图:右侧带
  },
  sx70: {
    side: 0.08,
    top: 0.08,
    bottom: 0.2,
  },
  negativeStrip: {
    stripLandscape: 0.08,
    stripPortrait: 0.08,
  },
  pointAndShoot: { none: 0 },
  contaxLabel: {
    bottomLandscape: 0.1,
    bottomPortrait: 0.14, // 竖图 ↑ 从 0.10 → 0.14 · 两行堆叠需要更多高度
  },
} as const

// ============================================================================
// 字号比例 Token(单位:相对于 minEdge 的百分比)
// ============================================================================
//
// 在 4000px 短边的常见图上:
//   - mainTitle 0.028 = 112px  —— 100% 查看时肉眼清晰
//   - params    0.022 = 88px   —— 参数行,稍小
//   - caption   0.018 = 72px   —— 副标题 / 日期
//   - dateStamp 0.03  = 120px  —— 橙红日期戳(需要显眼)
export const FONT_SIZE = {
  mainTitle: 0.028,
  params: 0.022,
  caption: 0.018,
  dateStamp: 0.03,
  smallLabel: 0.014,
  spine: 0.024,
} as const

// ============================================================================
// 字体栈 Token
// ============================================================================
//
// 前端(CSS)和后端(SVG)各走一套:
//   - 前端 CSS 用 `font-family` 字符串直接 fallback
//   - 后端 SVG 把本族名传给 Sharp,Sharp 会走 fontconfig 解析到具体 .ttf
//
// 为什么不直接在 React/SVG 里写 `'Inter, -apple-system, sans-serif'`:
//   - 语义丢失 —— 后续想换"mono"的主字体(如从 JetBrains Mono 换到 SF Mono)
//     就要在 16 处改;集中到这里一处改。
export const FONT_STACK = {
  inter: {
    css: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    svg: 'Inter, -apple-system, sans-serif',
  },
  mono: {
    css: "'JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', monospace",
    svg: "'JetBrains Mono', Menlo, monospace",
  },
  georgia: {
    css: "Georgia, 'Times New Roman', serif",
    svg: "Georgia, 'Times New Roman', serif",
  },
  courier: {
    css: "'Courier New', 'Courier Prime', 'Courier', monospace",
    svg: "'Courier New', Courier, monospace",
  },
  typewriter: {
    css: "'Special Elite', 'Courier Prime', 'Courier New', monospace",
    svg: "'Special Elite', 'Courier Prime', monospace",
  },
} as const

// ============================================================================
// 朝向判定阈值(AGENTS.md 第 8 条:横竖判定必须是单一函数)
// ============================================================================
//
// aspectRatio = imgW / imgH
//   > 1.05 → landscape
//   < 0.95 → portrait
//   [0.95, 1.05] → square(统一走 landscape 布局,多数风格是横图优化)
//
// 为什么 1.05 而不是 1.0:
//   - 手机相机的实际宽高比常是 4:3(1.333)或 3:4(0.75),1.05 是宽裕的中立带
//   - 避免 2000×1999 这种几乎是方图的边缘情况被错误判为竖图
export const ORIENTATION = {
  landscapeThreshold: 1.05,
  portraitThreshold: 0.95,
} as const

/**
 * 计算朝向类别 —— 所有横竖判定必须走这个函数,不得散布 if 语句(AGENTS.md 第 8 条)。
 *
 * 退化输入(非正数宽/高)默认返回 landscape,避免渲染器崩。
 */
export function classifyOrientation(imgW: number, imgH: number): 'landscape' | 'portrait' | 'square' {
  if (imgW <= 0 || imgH <= 0) return 'landscape'
  const ar = imgW / imgH
  if (ar > ORIENTATION.landscapeThreshold) return 'landscape'
  if (ar < ORIENTATION.portraitThreshold) return 'portrait'
  return 'square'
}

/**
 * 像素 = 比例 × minEdge
 *
 * 例如:Polaroid 底边比 0.22,在 4000×3000 横图上 = 0.22 × 3000 = 660px。
 *      Hairline 线距 0.015,在 6000×4000 竖图上 = 0.015 × 4000 = 60px。
 *
 * 所有 generator / layout 组件都必须走本函数换算,**不得手写 `Math.min(w,h) * ratio`**
 * 否则就散布了"朝向/短边"的基础设施级逻辑(AGENTS.md 第 8 条)。
 */
export function scaleByMinEdge(ratio: number, imgW: number, imgH: number): number {
  const minEdge = Math.min(imgW, imgH)
  return Math.round(ratio * minEdge)
}
