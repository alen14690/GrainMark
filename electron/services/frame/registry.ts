import { BORDER, COLOR, FONT_SIZE } from '../../../shared/frame-tokens.js'
/**
 * registry — FrameStyleId → FrameStyle 的集中注册表
 *
 * 阶段 1:骨架期,只注册"占位风格"给 IPC 层有东西可返回(保证 frame:templates 不抛)。
 * 阶段 2 起:每实装一个风格就在 generators/ 下加文件 + 在本文件注册。
 *
 * 为什么用 Map + 函数注册(而非静态数组导出):
 *   - 将来支持用户自定义风格时,可 `registerFrameStyle(id, style)` 动态添加
 *   - 单测可 mock / 覆盖 registry 的某一条目做边界测试
 *
 * 阶段 1 占位策略:
 *   - 暂时只注册 1 个占位风格 `minimal-bar`,字段 sentinel 值,但数据结构完整
 *   - generator 暂时抛 "not-implemented" 错;renderFrame 在阶段 2 起会按 id 分派
 *   - 这样现有的 watermark 流程完全不受影响,新 frame 系统"可查询但不能渲染"
 */
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
// 阶段 1 占位风格:Minimal Bar(仅骨架,阶段 2 会替换为完整实现)
// ============================================================================
//
// 注意:以下数据结构完整有效(不是 undefined),但 generator 尚未实装。
// 用户在 UI 里看到此风格可选,但点"渲染"会得到"尚未实装"的明确错误。
// 这种"先注册结构、后实装逻辑"的渐进式暴露,比"暗地里留 TODO"更诚实。

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
// 注册表
// ============================================================================

const REGISTRY = new Map<FrameStyleId, FrameStyle>()
REGISTRY.set(MINIMAL_BAR.id, MINIMAL_BAR)

/** 列出已注册的全部 FrameStyle(阶段 1 只有 minimal-bar) */
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
