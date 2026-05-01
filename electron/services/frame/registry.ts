/**
 * registry — FrameStyleId → FrameStyle 的集中注册表
 *
 * 设计文档:artifact/design/frame-system-2026-05-01.md
 *
 * 每个 FrameStyle 是一份纯数据(横 layout + 竖 layout + 默认 overrides),
 * 由 renderer.ts 的 GENERATORS map 拿去配上对应的 SVG 生成器函数。
 *
 * 扩展步骤(阶段 2 加新风格):
 *   1. 在本文件加 FrameStyle 常量 + REGISTRY.set()
 *   2. 在 generators/ 加对应 SVG 生成函数
 *   3. 在 renderer.ts 的 GENERATORS map 挂 id → 函数
 *   4. 在 src/components/frame/layouts/ 加 React CSS 预览组件
 *   5. 在 FrameStyleRegistry.ts 挂 id → 组件
 *   6. 在 tests/unit/frame<Name>.test.ts 加语义契约测试
 */
import { BORDER, COLOR, FONT_SIZE } from '../../../shared/frame-tokens.js'
import type { FrameStyle, FrameStyleId, FrameStyleOverrides } from '../../../shared/types.js'

// ============================================================================
// 默认 overrides(所有风格共用的初始字段可见性)
// ============================================================================

const DEFAULT_OVERRIDES: FrameStyleOverrides = {
  showFields: {
    make: true,
    model: true,
    lens: true,
    aperture: true,
    shutter: true,
    iso: true,
    focalLength: true,
    dateTime: true,
    artist: false,
    location: false,
  },
  colorScheme: 'default',
}

// ============================================================================
// Minimal Bar · 极简底栏(阶段 2 已实装)
// ============================================================================

const MINIMAL_BAR: FrameStyle = {
  id: 'minimal-bar',
  name: '极简底栏',
  description: '纸白底栏,等宽字参数一行,专业克制',
  landscape: {
    borderTop: 0,
    borderBottom: BORDER.minimalBar.bottomLandscape,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.04, y: 0.5 },
        fontSize: FONT_SIZE.params,
        align: 'left',
        fontFamily: 'mono',
      },
      {
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.96, y: 0.5 },
        fontSize: FONT_SIZE.caption,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
    ],
  },
  portrait: {
    // 竖图把底栏稍加厚(按 BORDER.minimalBar.bottomPortrait),其它一致
    borderTop: 0,
    borderBottom: BORDER.minimalBar.bottomPortrait,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.04, y: 0.5 },
        fontSize: FONT_SIZE.params,
        align: 'left',
        fontFamily: 'mono',
      },
      {
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.96, y: 0.5 },
        fontSize: FONT_SIZE.caption,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// Polaroid Classic · 经典宝丽来(阶段 2 · 2026-05-01)
// ============================================================================
//
// 设计语言(artifact/design/frame-system-2026-05-01.md · 组 C1):
//   - 四周纸白 #F8F5EE,左右上薄 4%,底部厚 22%(横)/ 18%(竖)
//     · 真实 Polaroid 600 卡片 86×108mm,底边 22mm ≈ 20%,本值对齐
//     · 竖图压到 18% 是为了防止竖向总高失衡(设计方案 §4)
//   - 底部 Georgia 斜体文字(衬线手写感)·居中摄影者/日期
//     · 字色 inkGray,不是 softGray —— 宝丽来底部字是读者视觉焦点
//   - 不内置任何品牌水印(AGENTS.md 🔐 安全红线)

const POLAROID_CLASSIC: FrameStyle = {
  id: 'polaroid-classic',
  name: '经典宝丽来',
  description: '四周纸白 + 底部厚边 Georgia 斜体,真实 Polaroid 600 比例',
  landscape: {
    borderTop: BORDER.polaroid.top,
    borderBottom: BORDER.polaroid.bottomLandscape,
    borderLeft: BORDER.polaroid.side,
    borderRight: BORDER.polaroid.side,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        // 机型居中,主视觉锚点
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.45 },
        fontSize: FONT_SIZE.mainTitle,
        align: 'center',
        fontFamily: 'georgia',
      },
      {
        // 参数行在机型下方(anchor.y=0.75 让它视觉上低于 model)
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.78 },
        fontSize: FONT_SIZE.caption,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
      {
        // 日期单独在右下角小字 · 橙红戳色致敬老宝丽来
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.95, y: 0.92 },
        fontSize: FONT_SIZE.smallLabel,
        align: 'right',
        fontFamily: 'courier',
        colorOverride: COLOR.dateStampOrange,
      },
    ],
  },
  portrait: {
    borderTop: BORDER.polaroid.top,
    borderBottom: BORDER.polaroid.bottomPortrait, // 竖图压到 18%
    borderLeft: BORDER.polaroid.side,
    borderRight: BORDER.polaroid.side,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.45 },
        fontSize: FONT_SIZE.mainTitle,
        align: 'center',
        fontFamily: 'georgia',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.78 },
        fontSize: FONT_SIZE.caption,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
      {
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.95, y: 0.92 },
        fontSize: FONT_SIZE.smallLabel,
        align: 'right',
        fontFamily: 'courier',
        colorOverride: COLOR.dateStampOrange,
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// 注册表
// ============================================================================

const REGISTRY = new Map<FrameStyleId, FrameStyle>()
REGISTRY.set(MINIMAL_BAR.id, MINIMAL_BAR)
REGISTRY.set(POLAROID_CLASSIC.id, POLAROID_CLASSIC)

/** 列出已注册的全部 FrameStyle */
export function listFrameStyles(): FrameStyle[] {
  return Array.from(REGISTRY.values())
}

/** 按 id 取 FrameStyle;未注册的返回 null(调用方必须容错) */
export function getFrameStyle(id: FrameStyleId): FrameStyle | null {
  return REGISTRY.get(id) ?? null
}

/**
 * 动态注册(测试用 / 未来用户自定义用)
 * 若 id 已存在则覆盖,返回旧值;无覆盖返回 null。
 */
export function registerFrameStyle(style: FrameStyle): FrameStyle | null {
  const prev = REGISTRY.get(style.id) ?? null
  REGISTRY.set(style.id, style)
  return prev
}
