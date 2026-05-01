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
  // ===== 阶段 5(2026-05-01)新增 =====
  // glass(玻璃拟态):半透明白 + iOS 深灰玻璃 · backdrop-filter 后的视觉近似
  glassLight: 'rgba(255, 255, 255, 0.18)',
  glassDark: 'rgba(20, 20, 20, 0.48)',
  glassHilight: 'rgba(255, 255, 255, 0.5)', // 玻璃顶边高光 inset
  glassBorder: 'rgba(255, 255, 255, 0.3)', // 玻璃描边
  // oil(油画/水彩):米黄油画纸 + 深棕墨
  oilPaper: '#F3ECE0',
  oilInk: '#3A2E1E',
  oilInkSoft: '#7D6C4E',
  watercolorPaper: '#FDFAF4',
  // cinema(电影/霓虹):深紫+琥珀
  neonAmber: '#E8B86D',
  neonViolet: '#7C5FE8',
  cinemaBg: '#0A0612',
  // metal(金属/徽章):拉丝银 + 金铜
  brushedSilver: '#8A8A8D',
  brushedSilverDark: '#1A1A1C',
  medalGold: '#B8860B',
  medalGoldLight: '#FFD89B',
  medalGoldDark: '#6B4500',
  // ambient(氛围):暗幕叠加(照片 blur 上加一层黑)
  ambientOverlay: 'rgba(0, 0, 0, 0.35)',
} as const

// ============================================================================
// 边框比例 Token(单位:相对于 minEdge 的百分比)
// ============================================================================
//
// 数值来源:
//   - Polaroid 比例参考真实 Polaroid 600 卡片(86×108mm,底边 22mm ≈ 20%)
//   - Gallery Black 比例参考画册印刷惯例(标准 6-8% 边距 + 14% 底栏)
//   - Film Full Border 参考 135 胶卷实际齿孔区比例(8% 上下)
// ============================================================================
// 边框比例 Token(单位:相对于 minEdge 的百分比)
// ============================================================================
//
// 2026-05-01 · 专业竖图修订:
//   行业专业 EXIF 边框 APP(ShotOn / Mark Foto / Fujifilm Ink Studio)在竖图
//   上的底栏占比普遍 20-28% 短边 · 给主字号 + 参数二层堆叠足够呼吸空间。
//   本项目原先竖图底栏 10-16% 过浅,导致竖图底部像"一条压条",丧失专业感。
//
// 数值来源:
//   - Polaroid:真实 Polaroid 600 卡片底边 22mm ≈ 22% 短边(横竖都套用)
//   - Gallery:画册惯例 · 横图 14% 竖图加到 24% 才够三行堆叠
//   - Minimal Bar:底栏文字风格 · 横 8% 竖 20% 给"标题 + 参数"两行
//   - Editorial / Contax:杂志版式 · 竖图 22% 给两行分明 + 留气口
export const BORDER = {
  polaroid: {
    side: 0.04,
    top: 0.04,
    bottomLandscape: 0.22,
    bottomPortrait: 0.22, // 竖图修订:与横图一致 22% · 保持宝丽来 600 真实比例(2026-05-01)
  },
  filmFullBorder: {
    perforationLandscape: 0.08,
    perforationPortrait: 0.08,
  },
  gallery: {
    side: 0.06,
    top: 0.06,
    bottomLandscape: 0.14,
    bottomPortrait: 0.24, // 竖图修订:0.16 → 0.24 · 三行堆叠需要充分呼吸
  },
  minimalBar: {
    bottomLandscape: 0.08,
    bottomPortrait: 0.2, // 竖图修订:0.12 → 0.20 · 由"压条"变"专业底栏"
  },
  hairline: {
    insetLandscape: 0.015,
    insetPortrait: 0.015,
  },
  editorialCaption: {
    bottomLandscape: 0.12,
    bottomPortrait: 0.22, // 竖图修订:0.14 → 0.22 · 两行堆叠 + 日期底角
  },
  spineEdition: {
    bandLandscape: 0.1, // 横图:底部带
    bandPortrait: 0.08, // 竖图:右侧带(侧带不变,已是专业值)
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
    bottomPortrait: 0.22, // 竖图修订:0.14 → 0.22 · 两行堆叠需充分空间
  },
} as const

// ============================================================================
// 字号比例 Token(单位:相对于 minEdge 的百分比)
// ============================================================================
//
// 2026-05-01 · 专业竖图修订:
//   竖图画幅窄 · 但屏幕/打印高度长 · 底栏文字应当**放大而非缩小**
//   才能与横图相同"视觉分量"(对照 ShotOn / Mark Foto / Fujifilm Ink Studio
//   等专业 EXIF 边框 APP,竖图主字号通常 3-4.5% minEdge,显著大于横图)
//
// 在 4000px 短边的常见图上:
//   - mainTitle          0.028 = 112px  —— 横图 100% 查看肉眼清晰
//   - mainTitlePortrait  0.034 = 136px  —— 竖图主标题 · 独占一行需要更强视觉分量
//   - params             0.022 = 88px   —— 横图参数行,稍小
//   - paramsPortrait     0.024 = 96px   —— 竖图参数 · 也适当放大保持层级
//   - caption            0.018 = 72px   —— 横图副标题 / 日期
//   - captionPortrait    0.020 = 80px   —— 竖图副标题 · 小幅放大
//   - dateStamp          0.03  = 120px  —— 橙红日期戳(需要显眼)
//   - smallLabel         0.014 = 56px   —— 角标
//   - smallLabelPortrait 0.016 = 64px   —— 竖图角标
//   - spine              0.024 = 96px   —— 书脊字
export const FONT_SIZE = {
  mainTitle: 0.028,
  mainTitlePortrait: 0.034,
  params: 0.022,
  paramsPortrait: 0.024,
  caption: 0.018,
  captionPortrait: 0.02,
  dateStamp: 0.03,
  smallLabel: 0.014,
  smallLabelPortrait: 0.016,
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
