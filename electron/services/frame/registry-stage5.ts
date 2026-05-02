/**
 * registry-stage5 — 阶段 5(2026-05-01) 新增 14 个高级质感风格的数据
 *
 * 设计来源:artifact/ui-mockups/frame-premium-moodboard.html
 * 用户反馈:"把这些边框都保留,用当前的分组划分一下列表"
 *
 * 分组与命名(与 FrameStyleId union 对应):
 *   glass(2):     frosted-glass / glass-chip
 *   oil(2):       oil-texture / watercolor-caption
 *   ambient(2):   ambient-glow / bokeh-pillar
 *   cinema(2):    cinema-scope / neon-edge
 *   editorial(2): swiss-grid / contact-sheet
 *   metal(2):     brushed-metal / medal-plate
 *   floating(2):  floating-caption / stamp-corner
 *
 * 复用策略:
 *   - 每个 style 提供 `landscape + portrait` 完整 FrameLayout 数据
 *   - generator / React layout 尽量复用现有通用组件(slotPlacement + BottomTextLayout)
 *   - 只有装饰几何独特的风格(glass bar 磨砂层 · neon-edge 辉光边 · medal-plate 金章)
 *     需要独立 generator · 其余走现有 bottom-text 通用管线
 *
 * 所有 style 都遵循:
 *   - 竖图底栏 >= 18%(AGENTS 专业比例下限 · framePortraitOptimization 蓝军)
 *   - 竖图主字号 >= 0.028 minEdge
 *   - 去重由 composite 按 hasModelSlot 自动决定(不在此处写 if)
 */
import { COLOR, FONT_SIZE } from '../../../shared/frame-tokens.js'
import type { FrameStyle } from '../../../shared/types.js'
import { DEFAULT_OVERRIDES } from './registry-defaults.js'

// 阶段 5 · 玻璃拟态:比常规风格更高的字号权重,因为玻璃条本身只有 ~12% 高度
const GLASS_MODEL_FONT = 0.022
const GLASS_PARAMS_FONT = 0.016
const GLASS_MODEL_FONT_PORTRAIT = 0.026
const GLASS_PARAMS_FONT_PORTRAIT = 0.018

// ============================================================================
// GLASS(2) · 玻璃拟态
// ============================================================================

/**
 * frosted-glass · 磨砂玻璃底条(A1)
 *
 * 视觉:照片底部悬浮一条磨砂玻璃条,内含机型 + 参数 · iOS 控件中心同款
 * 实现:零边框(borderBottom=0) + 'overlay' slot · generator 在图片底部画半透明玻璃 rect
 * 竖图:玻璃条更窄,字号放大
 */
const FROSTED_GLASS: FrameStyle = {
  id: 'frosted-glass',
  name: '磨砂玻璃底条',
  description: 'iOS 控件美学 · 照片底部悬浮磨砂玻璃条 · 最 app 化的高级质感',
  group: 'glass',
  landscape: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.glassLight,
    textColor: '#FFFFFF',
    accentColor: COLOR.glassHilight,
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.1, y: 0.86 },
        fontSize: GLASS_MODEL_FONT,
        align: 'left',
        fontFamily: 'inter',
        colorOverride: '#FFFFFF',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.1, y: 0.92 },
        fontSize: GLASS_PARAMS_FONT,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.88)',
      },
    ],
  },
  portrait: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.glassLight,
    textColor: '#FFFFFF',
    accentColor: COLOR.glassHilight,
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.08, y: 0.88 },
        fontSize: GLASS_MODEL_FONT_PORTRAIT,
        align: 'left',
        fontFamily: 'inter',
        colorOverride: '#FFFFFF',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.08, y: 0.94 },
        fontSize: GLASS_PARAMS_FONT_PORTRAIT,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.88)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

/**
 * glass-chip · 胶囊徽章(A2)
 *
 * 视觉:右下角胶囊形 chip · 左彩色渐变点 + 右 mono 参数 · Apple Dynamic Island 同款
 * 实现:零边框 + overlay slot · generator 在右下角画深色胶囊 + 渐变点
 * 竖图:chip 位置不变,内容精简
 */
const GLASS_CHIP: FrameStyle = {
  id: 'glass-chip',
  name: '玻璃胶囊徽章',
  description: 'Dynamic Island 风 · 右下角胶囊 chip · 渐变点 + mono 参数',
  group: 'glass',
  landscape: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.glassDark,
    textColor: '#FFFFFF',
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.86, y: 0.91 },
        fontSize: 0.018,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: '#FFFFFF',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.86, y: 0.95 },
        fontSize: 0.014,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.8)',
      },
    ],
  },
  portrait: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.glassDark,
    textColor: '#FFFFFF',
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.84, y: 0.93 },
        fontSize: 0.022,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: '#FFFFFF',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.84, y: 0.97 },
        fontSize: 0.018,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.8)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// OIL(2) · 油画 / 水彩
// ============================================================================

const OIL_TEXTURE: FrameStyle = {
  id: 'oil-texture',
  name: '油画纸底 Caption',
  description: '米黄油画纸底 · Georgia italic 手写感标题 · 纸质 noise 纹理',
  group: 'oil',
  landscape: {
    borderTop: 0.04,
    borderBottom: 0.18,
    borderLeft: 0.04,
    borderRight: 0.04,
    backgroundColor: COLOR.oilPaper,
    textColor: COLOR.oilInk,
    accentColor: COLOR.oilInkSoft,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.4 },
        fontSize: 0.03,
        align: 'center',
        fontFamily: 'georgia',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.75 },
        fontSize: 0.015,
        align: 'center',
        fontFamily: 'georgia',
        colorOverride: COLOR.oilInkSoft,
      },
    ],
  },
  portrait: {
    borderTop: 0.04,
    borderBottom: 0.22,
    borderLeft: 0.04,
    borderRight: 0.04,
    backgroundColor: COLOR.oilPaper,
    textColor: COLOR.oilInk,
    accentColor: COLOR.oilInkSoft,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: FONT_SIZE.mainTitlePortrait,
        align: 'center',
        fontFamily: 'georgia',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.72 },
        fontSize: FONT_SIZE.captionPortrait,
        align: 'center',
        fontFamily: 'georgia',
        colorOverride: COLOR.oilInkSoft,
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const WATERCOLOR_CAPTION: FrameStyle = {
  id: 'watercolor-caption',
  name: '水彩羽化 Caption',
  description: '纸白底 · 照片下缘羽化融入 · Brush Script 手写字体',
  group: 'oil',
  landscape: {
    borderTop: 0.04,
    borderBottom: 0.2,
    borderLeft: 0.04,
    borderRight: 0.04,
    backgroundColor: COLOR.watercolorPaper,
    textColor: COLOR.oilInk,
    accentColor: COLOR.oilInkSoft,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.06, y: 0.5 },
        fontSize: 0.035,
        align: 'left',
        fontFamily: 'georgia',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.06, y: 0.82 },
        fontSize: 0.015,
        align: 'left',
        fontFamily: 'georgia',
        colorOverride: COLOR.oilInkSoft,
      },
    ],
  },
  portrait: {
    borderTop: 0.04,
    borderBottom: 0.24,
    borderLeft: 0.04,
    borderRight: 0.04,
    backgroundColor: COLOR.watercolorPaper,
    textColor: COLOR.oilInk,
    accentColor: COLOR.oilInkSoft,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.06, y: 0.4 },
        fontSize: FONT_SIZE.mainTitlePortrait,
        align: 'left',
        fontFamily: 'georgia',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.06, y: 0.78 },
        fontSize: FONT_SIZE.captionPortrait,
        align: 'left',
        fontFamily: 'georgia',
        colorOverride: COLOR.oilInkSoft,
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// AMBIENT(2) · 氛围模糊
// ============================================================================

const AMBIENT_GLOW: FrameStyle = {
  id: 'ambient-glow',
  name: '氛围辉光',
  description: '照片自身放大模糊作底 · 原图居中浮起 · Apple Music 同款',
  group: 'ambient',
  landscape: {
    borderTop: 0.06,
    borderBottom: 0.14,
    borderLeft: 0.08,
    borderRight: 0.08,
    backgroundColor: COLOR.filmBlack, // 实际渲染时由 generator 叠 blur 照片
    textColor: '#FFFFFF',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.4 },
        fontSize: 0.022,
        align: 'center',
        fontFamily: 'inter',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.75 },
        fontSize: 0.016,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.8)',
      },
    ],
  },
  portrait: {
    borderTop: 0.06,
    borderBottom: 0.2,
    borderLeft: 0.1,
    borderRight: 0.1,
    backgroundColor: COLOR.filmBlack,
    textColor: '#FFFFFF',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.32 },
        fontSize: FONT_SIZE.mainTitlePortrait,
        align: 'center',
        fontFamily: 'inter',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: FONT_SIZE.captionPortrait,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.8)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const BOKEH_PILLAR: FrameStyle = {
  id: 'bokeh-pillar',
  name: '光柱背景',
  description: '照片 blur 60px 作背景 · 原图居中独立浮起 · 画廊射灯感',
  group: 'ambient',
  landscape: {
    borderTop: 0.04,
    borderBottom: 0.06,
    borderLeft: 0.15, // 两侧光柱宽
    borderRight: 0.15,
    backgroundColor: COLOR.filmBlack,
    textColor: '#FFFFFF',
    slots: [
      {
        id: 'model',
        area: 'left',
        anchor: { x: 0.5, y: 0.92 },
        fontSize: 0.012,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.85)',
      },
      {
        id: 'params',
        area: 'right',
        anchor: { x: 0.5, y: 0.92 },
        fontSize: 0.012,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.85)',
      },
    ],
  },
  portrait: {
    borderTop: 0.04,
    borderBottom: 0.06,
    borderLeft: 0.2,
    borderRight: 0.2,
    backgroundColor: COLOR.filmBlack,
    textColor: '#FFFFFF',
    slots: [
      {
        id: 'model',
        area: 'left',
        anchor: { x: 0.5, y: 0.94 },
        fontSize: 0.014,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.85)',
      },
      {
        id: 'params',
        area: 'right',
        anchor: { x: 0.5, y: 0.94 },
        fontSize: 0.014,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.85)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// AMBIENT 扩展(+8) · 圆角/阴影/玻璃/极光/霜雾/光圈/反射/暗角
// ============================================================================

const AMBIENT_ROUNDED: FrameStyle = {
  id: 'ambient-rounded', name: '圆角氛围', description: '大圆角照片 + 深阴影浮起 · 柔和现代', group: 'ambient',
  landscape: { borderTop: 0.05, borderBottom: 0.18, borderLeft: 0.08, borderRight: 0.08, backgroundColor: '#0D0D12', textColor: 'rgba(255,255,255,0.92)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.3 }, fontSize: 0.018, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.013, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.6)' }] },
  portrait: { borderTop: 0.05, borderBottom: 0.22, borderLeft: 0.08, borderRight: 0.08, backgroundColor: '#0D0D12', textColor: 'rgba(255,255,255,0.92)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.25 }, fontSize: 0.022, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.65 }, fontSize: 0.015, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.6)' }] },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_ISLAND: FrameStyle = {
  id: 'ambient-island', name: '浮岛阴影', description: '中圆角 + 超深阴影 · 照片如浮岛悬空 · 沉稳暗调', group: 'ambient',
  landscape: { borderTop: 0.05, borderBottom: 0.16, borderLeft: 0.06, borderRight: 0.06, backgroundColor: '#080810', textColor: 'rgba(255,255,255,0.9)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.35 }, fontSize: 0.018, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.013, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.55)' }] },
  portrait: { borderTop: 0.05, borderBottom: 0.2, borderLeft: 0.06, borderRight: 0.06, backgroundColor: '#080810', textColor: 'rgba(255,255,255,0.9)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.3 }, fontSize: 0.022, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.65 }, fontSize: 0.015, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.55)' }] },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_GLASS: FrameStyle = {
  id: 'ambient-glass', name: '玻璃氛围', description: '氛围底色 + 底部圆角毛玻璃信息卡 · 融合 glass+ambient', group: 'ambient',
  landscape: { borderTop: 0.04, borderBottom: 0.22, borderLeft: 0.05, borderRight: 0.05, backgroundColor: '#0A0A14', textColor: 'rgba(255,255,255,0.92)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.35 }, fontSize: 0.016, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.012, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.6)' }] },
  portrait: { borderTop: 0.04, borderBottom: 0.26, borderLeft: 0.05, borderRight: 0.05, backgroundColor: '#0A0A14', textColor: 'rgba(255,255,255,0.92)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.3 }, fontSize: 0.02, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.65 }, fontSize: 0.014, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.6)' }] },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_AURORA: FrameStyle = {
  id: 'ambient-aurora', name: '极光边缘', description: '旋转极光光晕 + 边缘辉光 · 科幻梦境感', group: 'ambient',
  landscape: { borderTop: 0.06, borderBottom: 0.16, borderLeft: 0.07, borderRight: 0.07, backgroundColor: '#050510', textColor: 'rgba(255,255,255,0.9)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.35 }, fontSize: 0.018, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.013, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.55)' }] },
  portrait: { borderTop: 0.06, borderBottom: 0.2, borderLeft: 0.07, borderRight: 0.07, backgroundColor: '#050510', textColor: 'rgba(255,255,255,0.9)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.3 }, fontSize: 0.022, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.65 }, fontSize: 0.015, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.55)' }] },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_FROST: FrameStyle = {
  id: 'ambient-frost', name: '霜雾层叠', description: '大圆角 + 白描边 + 多层霜雾 · 冷调清晨感', group: 'ambient',
  landscape: { borderTop: 0.05, borderBottom: 0.18, borderLeft: 0.06, borderRight: 0.06, backgroundColor: '#0C0C14', textColor: 'rgba(255,255,255,0.88)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.35 }, fontSize: 0.018, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.013, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.55)' }] },
  portrait: { borderTop: 0.05, borderBottom: 0.22, borderLeft: 0.06, borderRight: 0.06, backgroundColor: '#0C0C14', textColor: 'rgba(255,255,255,0.88)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.28 }, fontSize: 0.022, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.65 }, fontSize: 0.015, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.55)' }] },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_BREATHE: FrameStyle = {
  id: 'ambient-breathe', name: '呼吸光圈', description: '背景大圆形光环 · 照片被柔光环绕 · 静谧灵性', group: 'ambient',
  landscape: { borderTop: 0.06, borderBottom: 0.18, borderLeft: 0.07, borderRight: 0.07, backgroundColor: '#080810', textColor: 'rgba(255,255,255,0.9)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.35 }, fontSize: 0.018, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.013, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.55)' }] },
  portrait: { borderTop: 0.06, borderBottom: 0.22, borderLeft: 0.07, borderRight: 0.07, backgroundColor: '#080810', textColor: 'rgba(255,255,255,0.9)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.3 }, fontSize: 0.022, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.65 }, fontSize: 0.015, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.55)' }] },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_MIRROR: FrameStyle = {
  id: 'ambient-mirror', name: '镜面反射', description: '照片下方倒影渐隐 · 玻璃桌面感 · 高级展示', group: 'ambient',
  landscape: { borderTop: 0.04, borderBottom: 0.2, borderLeft: 0.06, borderRight: 0.06, backgroundColor: '#0A0A10', textColor: 'rgba(255,255,255,0.88)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.6 }, fontSize: 0.016, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.85 }, fontSize: 0.012, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.5)' }] },
  portrait: { borderTop: 0.04, borderBottom: 0.24, borderLeft: 0.06, borderRight: 0.06, backgroundColor: '#0A0A10', textColor: 'rgba(255,255,255,0.88)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.55 }, fontSize: 0.02, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.8 }, fontSize: 0.014, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.5)' }] },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_VIGNETTE: FrameStyle = {
  id: 'ambient-vignette', name: '暗角聚焦', description: '径向暗角 · 视觉聚焦中心 · 沉稳胶片暗房感', group: 'ambient',
  landscape: { borderTop: 0.05, borderBottom: 0.16, borderLeft: 0.06, borderRight: 0.06, backgroundColor: '#080808', textColor: 'rgba(255,255,255,0.88)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.35 }, fontSize: 0.018, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.013, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.5)' }] },
  portrait: { borderTop: 0.05, borderBottom: 0.2, borderLeft: 0.06, borderRight: 0.06, backgroundColor: '#080808', textColor: 'rgba(255,255,255,0.88)', slots: [{ id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.3 }, fontSize: 0.022, align: 'center', fontFamily: 'inter' }, { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.65 }, fontSize: 0.015, align: 'center', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.5)' }] },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// CINEMA(2) · 电影 / 霓虹
// ============================================================================

const CINEMA_SCOPE: FrameStyle = {
  id: 'cinema-scope',
  name: '电影宽银幕',
  description: '顶底黑色条幕 · 顶部 REC 红点 + 机型 · 底部标题大字',
  group: 'cinema',
  landscape: {
    borderTop: 0.18,
    borderBottom: 0.18,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: '#000000',
    textColor: 'rgba(255,255,255,0.95)',
    accentColor: COLOR.dateStampOrange, // REC 红点
    slots: [
      {
        id: 'model',
        area: 'top',
        anchor: { x: 0.06, y: 0.55 },
        fontSize: 0.013,
        align: 'left',
        fontFamily: 'courier',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.5 },
        fontSize: 0.02,
        align: 'center',
        fontFamily: 'courier',
      },
    ],
  },
  portrait: {
    borderTop: 0.14,
    borderBottom: 0.14,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#000000',
    textColor: 'rgba(255,255,255,0.95)',
    accentColor: COLOR.dateStampOrange,
    slots: [
      {
        id: 'model',
        area: 'top',
        anchor: { x: 0.06, y: 0.55 },
        fontSize: 0.016,
        align: 'left',
        fontFamily: 'courier',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.5 },
        fontSize: FONT_SIZE.paramsPortrait,
        align: 'center',
        fontFamily: 'courier',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const NEON_EDGE: FrameStyle = {
  id: 'neon-edge',
  name: '霓虹辉光边',
  description: '照片四周霓虹辉光边 · 琥珀+紫色叠加 · 右下角辉光字',
  group: 'cinema',
  landscape: {
    borderTop: 0.05,
    borderBottom: 0.05,
    borderLeft: 0.05,
    borderRight: 0.05,
    backgroundColor: COLOR.cinemaBg,
    textColor: COLOR.neonAmber,
    accentColor: COLOR.neonViolet,
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.94, y: 0.93 },
        fontSize: 0.018,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: '#FFFFFF',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.94, y: 0.97 },
        fontSize: 0.014,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: COLOR.neonAmber,
      },
    ],
  },
  portrait: {
    borderTop: 0.04,
    borderBottom: 0.04,
    borderLeft: 0.04,
    borderRight: 0.04,
    backgroundColor: COLOR.cinemaBg,
    textColor: COLOR.neonAmber,
    accentColor: COLOR.neonViolet,
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.94, y: 0.95 },
        fontSize: 0.022,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: '#FFFFFF',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.94, y: 0.98 },
        fontSize: 0.016,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: COLOR.neonAmber,
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// EDITORIAL(2) · 印刷 / 杂志
// ============================================================================

const SWISS_GRID: FrameStyle = {
  id: 'swiss-grid',
  name: '瑞士网格',
  description: '纸白底 · 粗体大字标题 · mono 参数 · 极细线分隔 · 现代画册基因',
  group: 'editorial',
  landscape: {
    borderTop: 0.04,
    borderBottom: 0.18,
    borderLeft: 0.05,
    borderRight: 0.05,
    backgroundColor: '#F5F2EA',
    textColor: '#1A1A1A',
    accentColor: 'rgba(26,26,26,0.25)', // 分隔线
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.05, y: 0.6 },
        fontSize: 0.028,
        align: 'left',
        fontFamily: 'inter',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.95, y: 0.6 },
        fontSize: 0.014,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: '#444444',
      },
    ],
  },
  portrait: {
    borderTop: 0.04,
    borderBottom: 0.22,
    borderLeft: 0.05,
    borderRight: 0.05,
    backgroundColor: '#F5F2EA',
    textColor: '#1A1A1A',
    accentColor: 'rgba(26,26,26,0.25)',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.05, y: 0.35 },
        fontSize: FONT_SIZE.mainTitlePortrait,
        align: 'left',
        fontFamily: 'inter',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.05, y: 0.7 },
        fontSize: FONT_SIZE.captionPortrait,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: '#444444',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// GLASS 扩展(+2) · 玻璃拟态变体
// ============================================================================

/**
 * glass-gradient · 渐变玻璃底条
 *
 * 视觉:照片底部一条从左到右的彩虹渐变磨砂玻璃条 · 更活泼年轻
 */
const GLASS_GRADIENT: FrameStyle = {
  id: 'glass-gradient',
  name: '渐变玻璃条',
  description: '彩虹渐变磨砂底条 · 活泼年轻 · 适合社交分享',
  group: 'glass',
  landscape: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: '#000000',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.05, y: 0.86 },
        fontSize: GLASS_MODEL_FONT,
        align: 'left',
        fontFamily: 'inter',
        colorOverride: '#ffffff',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.05, y: 0.92 },
        fontSize: GLASS_PARAMS_FONT,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.88)',
      },
    ],
  },
  portrait: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: '#000000',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.05, y: 0.87 },
        fontSize: GLASS_MODEL_FONT_PORTRAIT,
        align: 'left',
        fontFamily: 'inter',
        colorOverride: '#ffffff',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.05, y: 0.93 },
        fontSize: GLASS_PARAMS_FONT_PORTRAIT,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.88)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

/**
 * glass-minimal · 极简玻璃角标
 *
 * 视觉:照片无边 · 左下角一个极小的半透明玻璃标签 · 只有一行参数
 */
const GLASS_MINIMAL: FrameStyle = {
  id: 'glass-minimal',
  name: '极简玻璃标',
  description: '左下角极小磨砂标签 · 不干扰画面 · 记录拍摄参数',
  group: 'glass',
  landscape: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: '#000000',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.04, y: 0.92 },
        fontSize: 0.013,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.9)',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.04, y: 0.96 },
        fontSize: 0.011,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.7)',
      },
    ],
  },
  portrait: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: '#000000',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.04, y: 0.93 },
        fontSize: 0.015,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.9)',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.04, y: 0.97 },
        fontSize: 0.012,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.7)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// OIL 扩展(+1) · 油画经典
// ============================================================================

/**
 * oil-classic · 经典厚框油画
 *
 * 视觉:宽厚的暖白边框 · 底部小衬线字 · 像一幅装裱的油画
 */
const OIL_CLASSIC: FrameStyle = {
  id: 'oil-classic',
  name: '经典油画框',
  description: '宽厚暖白边框 · 底部小字署名 · 画廊装裱质感',
  group: 'oil',
  landscape: {
    borderTop: 0.06,
    borderBottom: 0.14,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#F5F0E6',
    textColor: COLOR.oilInk,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.4 },
        fontSize: 0.02,
        align: 'center',
        fontFamily: 'georgia',
        colorOverride: COLOR.oilInk,
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.013,
        align: 'center',
        fontFamily: 'georgia',
        colorOverride: COLOR.oilInkSoft,
      },
    ],
  },
  portrait: {
    borderTop: 0.05,
    borderBottom: 0.18,
    borderLeft: 0.05,
    borderRight: 0.05,
    backgroundColor: '#F5F0E6',
    textColor: COLOR.oilInk,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.024,
        align: 'center',
        fontFamily: 'georgia',
        colorOverride: COLOR.oilInk,
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.015,
        align: 'center',
        fontFamily: 'georgia',
        colorOverride: COLOR.oilInkSoft,
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// AMBIENT 扩展(+2) · 氛围模糊变体
// ============================================================================

/**
 * ambient-vinyl · 黑胶唱片风
 *
 * 视觉:照片 blur 作底 · 中间圆形照片 · 底部白字 · 像一张唱片封面
 */
const AMBIENT_VINYL: FrameStyle = {
  id: 'ambient-vinyl',
  name: '黑胶唱片',
  description: '照片圆形裁切居中 · 模糊底色 · 音乐专辑封面风格',
  group: 'ambient',
  landscape: {
    borderTop: 0.06,
    borderBottom: 0.16,
    borderLeft: 0.1,
    borderRight: 0.1,
    backgroundColor: '#0A0A0A',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.02,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,255,255,0.95)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.014,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.7)',
      },
    ],
  },
  portrait: {
    borderTop: 0.06,
    borderBottom: 0.2,
    borderLeft: 0.08,
    borderRight: 0.08,
    backgroundColor: '#0A0A0A',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.3 },
        fontSize: 0.024,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,255,255,0.95)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.016,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.7)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

/**
 * ambient-aura · 光晕氛围
 *
 * 视觉:中心照片四周弥散出彩色光晕(取色自照片) · 苹果音乐歌词卡风
 */
const AMBIENT_AURA: FrameStyle = {
  id: 'ambient-aura',
  name: '光晕弥散',
  description: '照片四周彩色光晕弥散 · Apple Music 歌词卡风格',
  group: 'ambient',
  landscape: {
    borderTop: 0.08,
    borderBottom: 0.16,
    borderLeft: 0.08,
    borderRight: 0.08,
    backgroundColor: '#0A0A0A',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.02,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,255,255,0.95)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.014,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.75)',
      },
    ],
  },
  portrait: {
    borderTop: 0.06,
    borderBottom: 0.2,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#0A0A0A',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.3 },
        fontSize: 0.024,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,255,255,0.95)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.016,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.75)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

/**
 * ambient-soft · 柔光氛围
 *
 * 视觉:照片四周渐淡到乳白色 · 梦幻柔焦感 · 文艺清新
 */
const AMBIENT_SOFT: FrameStyle = {
  id: 'ambient-soft',
  name: '柔光氛围',
  description: '照片四周渐淡到乳白 · 梦幻柔焦 · 文艺清新感',
  group: 'ambient',
  landscape: {
    borderTop: 0.08,
    borderBottom: 0.16,
    borderLeft: 0.08,
    borderRight: 0.08,
    backgroundColor: '#F8F6F2',
    textColor: '#2A2A2A',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.018,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: '#2A2A2A',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.013,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: '#888888',
      },
    ],
  },
  portrait: {
    borderTop: 0.06,
    borderBottom: 0.2,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#F8F6F2',
    textColor: '#2A2A2A',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.3 },
        fontSize: 0.022,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: '#2A2A2A',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.015,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: '#888888',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

/**
 * ambient-dark · 暗夜氛围
 *
 * 视觉:纯深黑模糊底色 · 照片浮在暗色雾气中 · 底部极细白字 · 高级感
 */
const AMBIENT_DARK: FrameStyle = {
  id: 'ambient-dark',
  name: '暗夜氛围',
  description: '深黑雾气底 · 照片悬浮 · 底部极细白字 · 沉稳高级',
  group: 'ambient',
  landscape: {
    borderTop: 0.06,
    borderBottom: 0.14,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#050505',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.4 },
        fontSize: 0.016,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,255,255,0.85)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.75 },
        fontSize: 0.012,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.5)',
      },
    ],
  },
  portrait: {
    borderTop: 0.05,
    borderBottom: 0.18,
    borderLeft: 0.05,
    borderRight: 0.05,
    backgroundColor: '#050505',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.02,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,255,255,0.85)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.014,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.5)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

/**
 * ambient-gradient · 渐变氛围
 *
 * 视觉:照片底部向暖色渐变模糊 · 日落余晖风 · 暖调治愈
 */
const AMBIENT_GRADIENT: FrameStyle = {
  id: 'ambient-gradient',
  name: '渐变氛围',
  description: '底部暖色渐变模糊 · 日落余晖感 · 暖调治愈',
  group: 'ambient',
  landscape: {
    borderTop: 0.06,
    borderBottom: 0.18,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#1A0F08',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.018,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,255,255,0.92)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.013,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,220,180,0.75)',
      },
    ],
  },
  portrait: {
    borderTop: 0.05,
    borderBottom: 0.2,
    borderLeft: 0.05,
    borderRight: 0.05,
    backgroundColor: '#1A0F08',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.3 },
        fontSize: 0.022,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,255,255,0.92)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.015,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,220,180,0.75)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_MIST: FrameStyle = {
  id: 'ambient-mist',
  name: '薄雾晨光',
  description: '淡蓝薄雾包围照片 · 清晨湖面般宁静 · 通透感',
  group: 'ambient',
  landscape: {
    borderTop: 0.07,
    borderBottom: 0.16,
    borderLeft: 0.07,
    borderRight: 0.07,
    backgroundColor: '#0D1520',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.018,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(200,220,240,0.9)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.013,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(160,190,220,0.7)',
      },
    ],
  },
  portrait: {
    borderTop: 0.06,
    borderBottom: 0.2,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#0D1520',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.3 },
        fontSize: 0.022,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(200,220,240,0.9)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.015,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(160,190,220,0.7)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_TWILIGHT: FrameStyle = {
  id: 'ambient-twilight',
  name: '暮色黄昏',
  description: '紫橙渐变天际线 · 黄昏金色时刻 · 情绪氛围感',
  group: 'ambient',
  landscape: {
    borderTop: 0.07,
    borderBottom: 0.16,
    borderLeft: 0.07,
    borderRight: 0.07,
    backgroundColor: '#1A0D1F',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.018,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,200,150,0.9)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.013,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(200,160,200,0.7)',
      },
    ],
  },
  portrait: {
    borderTop: 0.06,
    borderBottom: 0.2,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#1A0D1F',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.3 },
        fontSize: 0.022,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,200,150,0.9)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.015,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(200,160,200,0.7)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_OCEAN: FrameStyle = {
  id: 'ambient-ocean',
  name: '深海蓝',
  description: '深蓝色调氛围 · 冷静沉着 · 海洋深处的宁静',
  group: 'ambient',
  landscape: {
    borderTop: 0.07,
    borderBottom: 0.16,
    borderLeft: 0.07,
    borderRight: 0.07,
    backgroundColor: '#060E18',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.018,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(150,200,240,0.9)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.013,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(100,160,220,0.65)',
      },
    ],
  },
  portrait: {
    borderTop: 0.06,
    borderBottom: 0.2,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#060E18',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.3 },
        fontSize: 0.022,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(150,200,240,0.9)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.015,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(100,160,220,0.65)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_FOREST: FrameStyle = {
  id: 'ambient-forest',
  name: '森林绿',
  description: '深绿色调 · 自然沉浸 · 苔藓与树影的静谧',
  group: 'ambient',
  landscape: {
    borderTop: 0.07,
    borderBottom: 0.16,
    borderLeft: 0.07,
    borderRight: 0.07,
    backgroundColor: '#081208',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.018,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(180,220,170,0.9)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.013,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(140,180,130,0.65)',
      },
    ],
  },
  portrait: {
    borderTop: 0.06,
    borderBottom: 0.2,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#081208',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.3 },
        fontSize: 0.022,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(180,220,170,0.9)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.015,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(140,180,130,0.65)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_FILM: FrameStyle = {
  id: 'ambient-film',
  name: '胶片暗房',
  description: '纯黑底 + 细微噪点纹理 · 暗房冲洗的专注感',
  group: 'ambient',
  landscape: {
    borderTop: 0.06,
    borderBottom: 0.14,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#080808',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.4 },
        fontSize: 0.016,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.8)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.75 },
        fontSize: 0.012,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.45)',
      },
    ],
  },
  portrait: {
    borderTop: 0.05,
    borderBottom: 0.18,
    borderLeft: 0.05,
    borderRight: 0.05,
    backgroundColor: '#080808',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.02,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.8)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.014,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.45)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_CREAM: FrameStyle = {
  id: 'ambient-cream',
  name: '奶油氛围',
  description: '暖奶油底色 · 柔和高调 · 温暖治愈的日常感',
  group: 'ambient',
  landscape: {
    borderTop: 0.07,
    borderBottom: 0.16,
    borderLeft: 0.07,
    borderRight: 0.07,
    backgroundColor: '#FDF8F0',
    textColor: '#3A3020',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.018,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: '#3A3020',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.013,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(90,70,40,0.6)',
      },
    ],
  },
  portrait: {
    borderTop: 0.06,
    borderBottom: 0.2,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#FDF8F0',
    textColor: '#3A3020',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.3 },
        fontSize: 0.022,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: '#3A3020',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.015,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(90,70,40,0.6)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_ROSE: FrameStyle = {
  id: 'ambient-rose',
  name: '玫瑰氛围',
  description: '浅粉玫瑰底色 · 浪漫柔和 · 少女心满满',
  group: 'ambient',
  landscape: {
    borderTop: 0.07,
    borderBottom: 0.16,
    borderLeft: 0.07,
    borderRight: 0.07,
    backgroundColor: '#1F0D14',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.018,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,200,210,0.9)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.013,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(220,160,180,0.65)',
      },
    ],
  },
  portrait: {
    borderTop: 0.06,
    borderBottom: 0.2,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#1F0D14',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.3 },
        fontSize: 0.022,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,200,210,0.9)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.015,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(220,160,180,0.65)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const AMBIENT_MONO: FrameStyle = {
  id: 'ambient-mono',
  name: '黑白氛围',
  description: '去饱和模糊 · 纯粹黑白高级感 · 沉静内敛',
  group: 'ambient',
  landscape: {
    borderTop: 0.07,
    borderBottom: 0.16,
    borderLeft: 0.07,
    borderRight: 0.07,
    backgroundColor: '#0A0A0A',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.018,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,255,255,0.88)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.013,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.5)',
      },
    ],
  },
  portrait: {
    borderTop: 0.06,
    borderBottom: 0.2,
    borderLeft: 0.06,
    borderRight: 0.06,
    backgroundColor: '#0A0A0A',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.3 },
        fontSize: 0.022,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: 'rgba(255,255,255,0.88)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.015,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: 'rgba(255,255,255,0.5)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// CINEMA 扩展(+2) · 电影变体
// ============================================================================

/**
 * cinema-letterbox · 宽银幕信箱
 *
 * 视觉:2.35:1 宽银幕比例上下黑边 · 底部中间白字机型 · 电影感
 */
const CINEMA_LETTERBOX: FrameStyle = {
  id: 'cinema-letterbox',
  name: '宽银幕信箱',
  description: '2.35:1 宽银幕比例 · 纯黑上下条 · 底部中间白字',
  group: 'cinema',
  landscape: {
    borderTop: 0.12,
    borderBottom: 0.12,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: '#000000',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.4 },
        fontSize: 0.016,
        align: 'center',
        fontFamily: 'courier',
        colorOverride: 'rgba(255,255,255,0.85)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.75 },
        fontSize: 0.012,
        align: 'center',
        fontFamily: 'courier',
        colorOverride: 'rgba(255,255,255,0.6)',
      },
    ],
  },
  portrait: {
    borderTop: 0.14,
    borderBottom: 0.2,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: '#000000',
    textColor: '#ffffff',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.02,
        align: 'center',
        fontFamily: 'courier',
        colorOverride: 'rgba(255,255,255,0.85)',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: 0.014,
        align: 'center',
        fontFamily: 'courier',
        colorOverride: 'rgba(255,255,255,0.6)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

/**
 * cinema-timestamp · 电影时码
 *
 * 视觉:照片无边 · 左下角绿色时码风 monospace 小字(模拟 SMPTE 时间码)
 */
const CINEMA_TIMESTAMP: FrameStyle = {
  id: 'cinema-timestamp',
  name: '电影时码',
  description: '左下角绿色时码字 · 监视器/DIT 风格 · 极简',
  group: 'cinema',
  landscape: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: '#000000',
    textColor: '#00FF66',
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.03, y: 0.92 },
        fontSize: 0.014,
        align: 'left',
        fontFamily: 'courier',
        colorOverride: '#00FF66',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.03, y: 0.96 },
        fontSize: 0.011,
        align: 'left',
        fontFamily: 'courier',
        colorOverride: 'rgba(0,255,102,0.7)',
      },
    ],
  },
  portrait: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: '#000000',
    textColor: '#00FF66',
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.03, y: 0.93 },
        fontSize: 0.016,
        align: 'left',
        fontFamily: 'courier',
        colorOverride: '#00FF66',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.03, y: 0.97 },
        fontSize: 0.012,
        align: 'left',
        fontFamily: 'courier',
        colorOverride: 'rgba(0,255,102,0.7)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// EDITORIAL 扩展(+1) · 印刷变体
// ============================================================================

/**
 * editorial-minimal · 极简印刷
 *
 * 视觉:纯白底 · 照片居中 · 底部一行小字(机型 + 参数) · 无多余装饰
 */
const EDITORIAL_MINIMAL: FrameStyle = {
  id: 'editorial-minimal',
  name: '极简印刷',
  description: '纯白底 · 底部单行小字 · 干净利落的杂志排版',
  group: 'editorial',
  landscape: {
    borderTop: 0.04,
    borderBottom: 0.12,
    borderLeft: 0.04,
    borderRight: 0.04,
    backgroundColor: '#FFFFFF',
    textColor: '#1A1A1A',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.45 },
        fontSize: 0.014,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: '#1A1A1A',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.75 },
        fontSize: 0.011,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: '#888888',
      },
    ],
  },
  portrait: {
    borderTop: 0.04,
    borderBottom: 0.18,
    borderLeft: 0.04,
    borderRight: 0.04,
    backgroundColor: '#FFFFFF',
    textColor: '#1A1A1A',
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: 0.018,
        align: 'center',
        fontFamily: 'inter',
        colorOverride: '#1A1A1A',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.65 },
        fontSize: 0.013,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: '#888888',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// FLOATING(2) · 浮动徽章
// ============================================================================

const FLOATING_CAPTION: FrameStyle = {
  id: 'floating-caption',
  name: '漂浮白卡',
  description: '照片无边 · 右下角独立白卡片深阴影 · 左侧橙红标识条',
  group: 'floating',
  landscape: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.filmBlack,
    textColor: '#1A1A1A',
    accentColor: COLOR.dateStampOrange,
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.72, y: 0.88 },
        fontSize: 0.018,
        align: 'left',
        fontFamily: 'inter',
        colorOverride: '#1A1A1A',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.72, y: 0.93 },
        fontSize: 0.013,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: '#444444',
      },
    ],
  },
  portrait: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.filmBlack,
    textColor: '#1A1A1A',
    accentColor: COLOR.dateStampOrange,
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.55, y: 0.89 },
        fontSize: 0.022,
        align: 'left',
        fontFamily: 'inter',
        colorOverride: '#1A1A1A',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.55, y: 0.94 },
        fontSize: 0.016,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: '#444444',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const STAMP_CORNER: FrameStyle = {
  id: 'stamp-corner',
  name: '角落印章',
  description: '照片无边 · 右下角橙红大字机型戳 + 辉光 · 复古傻瓜机 LCD 风',
  group: 'floating',
  landscape: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.dateStampOrange,
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.96, y: 0.9 },
        fontSize: 0.03,
        align: 'right',
        fontFamily: 'courier',
        colorOverride: COLOR.dateStampOrange,
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.96, y: 0.95 },
        fontSize: 0.014,
        align: 'right',
        fontFamily: 'courier',
        colorOverride: COLOR.dateStampOrange,
      },
    ],
  },
  portrait: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.dateStampOrange,
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.96, y: 0.91 },
        fontSize: 0.032,
        align: 'right',
        fontFamily: 'courier',
        colorOverride: COLOR.dateStampOrange,
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.96, y: 0.96 },
        fontSize: 0.016,
        align: 'right',
        fontFamily: 'courier',
        colorOverride: COLOR.dateStampOrange,
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================

// ============================================================================
// SIMPLE · 简约经典
// ============================================================================

const WHITE_CLASSIC: FrameStyle = {
  id: 'white-classic',
  name: '经典白边',
  description: '纯白底 · 底部居中品牌+机型+参数 · 最经典的摄影分享格式',
  group: 'simple',
  landscape: {
    borderTop: 0.06, borderBottom: 0.18, borderLeft: 0.06, borderRight: 0.06,
    backgroundColor: '#FFFFFF', textColor: '#1A1A1A',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.3 }, fontSize: 0.018, align: 'center', fontFamily: 'inter' },
      { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.013, align: 'center', fontFamily: 'mono', colorOverride: '#666666' },
    ],
  },
  portrait: {
    borderTop: 0.05, borderBottom: 0.2, borderLeft: 0.05, borderRight: 0.05,
    backgroundColor: '#FFFFFF', textColor: '#1A1A1A',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.3 }, fontSize: 0.022, align: 'center', fontFamily: 'inter' },
      { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.015, align: 'center', fontFamily: 'mono', colorOverride: '#666666' },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const SEPARATOR_LINE: FrameStyle = {
  id: 'separator-line',
  name: '简约分隔线',
  description: '白底 · 一条极细分隔线 · 左侧 Logo+机型 · 右侧参数',
  group: 'simple',
  landscape: {
    borderTop: 0.04, borderBottom: 0.12, borderLeft: 0.04, borderRight: 0.04,
    backgroundColor: '#FFFFFF', textColor: '#333333',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.05, y: 0.6 }, fontSize: 0.015, align: 'left', fontFamily: 'inter' },
      { id: 'params', area: 'bottom', anchor: { x: 0.95, y: 0.6 }, fontSize: 0.012, align: 'right', fontFamily: 'mono', colorOverride: '#888888' },
    ],
  },
  portrait: {
    borderTop: 0.04, borderBottom: 0.14, borderLeft: 0.04, borderRight: 0.04,
    backgroundColor: '#FFFFFF', textColor: '#333333',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.05, y: 0.55 }, fontSize: 0.018, align: 'left', fontFamily: 'inter' },
      { id: 'params', area: 'bottom', anchor: { x: 0.95, y: 0.55 }, fontSize: 0.014, align: 'right', fontFamily: 'mono', colorOverride: '#888888' },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const ROUNDED_SHADOW: FrameStyle = {
  id: 'rounded-shadow',
  name: '圆角浮层',
  description: '浅灰底 · 大圆角照片 · 深阴影浮起感 · 现代感强',
  group: 'simple',
  landscape: {
    borderTop: 0.08, borderBottom: 0.16, borderLeft: 0.08, borderRight: 0.08,
    backgroundColor: '#F0F0F0', textColor: '#333333',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.4 }, fontSize: 0.015, align: 'center', fontFamily: 'inter' },
      { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.012, align: 'center', fontFamily: 'mono', colorOverride: '#888888' },
    ],
  },
  portrait: {
    borderTop: 0.06, borderBottom: 0.18, borderLeft: 0.06, borderRight: 0.06,
    backgroundColor: '#F0F0F0', textColor: '#333333',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.35 }, fontSize: 0.018, align: 'center', fontFamily: 'inter' },
      { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.014, align: 'center', fontFamily: 'mono', colorOverride: '#888888' },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const GRADIENT_BORDER: FrameStyle = {
  id: 'gradient-border',
  name: '渐变彩边',
  description: '多彩渐变背景 · 照片居中 · 白色参数 · 年轻社交媒体风',
  group: 'simple',
  landscape: {
    borderTop: 0.05, borderBottom: 0.14, borderLeft: 0.05, borderRight: 0.05,
    backgroundColor: '#667eea', textColor: '#FFFFFF',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.4 }, fontSize: 0.015, align: 'center', fontFamily: 'inter' },
      { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.012, align: 'center', fontFamily: 'mono' },
    ],
  },
  portrait: {
    borderTop: 0.04, borderBottom: 0.16, borderLeft: 0.04, borderRight: 0.04,
    backgroundColor: '#667eea', textColor: '#FFFFFF',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.35 }, fontSize: 0.018, align: 'center', fontFamily: 'inter' },
      { id: 'params', area: 'bottom', anchor: { x: 0.5, y: 0.7 }, fontSize: 0.014, align: 'center', fontFamily: 'mono' },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const GEO_INFO: FrameStyle = {
  id: 'geo-info',
  name: '地理信息卡',
  description: '白底 · 底部网格展示相机/位置/日期/天气 · 适合旅行记录',
  group: 'simple',
  landscape: {
    borderTop: 0.04, borderBottom: 0.2, borderLeft: 0.04, borderRight: 0.04,
    backgroundColor: '#FAFAFA', textColor: '#444444',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.05, y: 0.2 }, fontSize: 0.013, align: 'left', fontFamily: 'inter' },
      { id: 'params', area: 'bottom', anchor: { x: 0.05, y: 0.6 }, fontSize: 0.012, align: 'left', fontFamily: 'mono' },
    ],
  },
  portrait: {
    borderTop: 0.04, borderBottom: 0.22, borderLeft: 0.04, borderRight: 0.04,
    backgroundColor: '#FAFAFA', textColor: '#444444',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.05, y: 0.15 }, fontSize: 0.016, align: 'left', fontFamily: 'inter' },
      { id: 'params', area: 'bottom', anchor: { x: 0.05, y: 0.55 }, fontSize: 0.014, align: 'left', fontFamily: 'mono' },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const MAGAZINE_COVER: FrameStyle = {
  id: 'magazine-cover',
  name: '杂志封面',
  description: '照片全幅 · 底部渐变遮罩 · 大号衬线标题 · 杂志感十足',
  group: 'editorial',
  landscape: {
    borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0,
    backgroundColor: '#000000', textColor: '#FFFFFF',
    slots: [
      { id: 'model', area: 'overlay', anchor: { x: 0.05, y: 0.88 }, fontSize: 0.024, align: 'left', fontFamily: 'georgia' },
      { id: 'params', area: 'overlay', anchor: { x: 0.05, y: 0.94 }, fontSize: 0.012, align: 'left', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.6)' },
    ],
  },
  portrait: {
    borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0,
    backgroundColor: '#000000', textColor: '#FFFFFF',
    slots: [
      { id: 'model', area: 'overlay', anchor: { x: 0.05, y: 0.86 }, fontSize: 0.028, align: 'left', fontFamily: 'georgia' },
      { id: 'params', area: 'overlay', anchor: { x: 0.05, y: 0.93 }, fontSize: 0.014, align: 'left', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.6)' },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const TRANSPARENT_OVERLAY: FrameStyle = {
  id: 'transparent-overlay',
  name: '透明浮动水印',
  description: '无边框 · 照片全幅 · 右下角半透明毛玻璃小标 · 不破坏构图',
  group: 'floating',
  landscape: {
    borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0,
    backgroundColor: '#000000', textColor: '#FFFFFF',
    slots: [
      { id: 'model', area: 'overlay', anchor: { x: 0.95, y: 0.9 }, fontSize: 0.013, align: 'right', fontFamily: 'inter' },
      { id: 'params', area: 'overlay', anchor: { x: 0.95, y: 0.95 }, fontSize: 0.01, align: 'right', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.7)' },
    ],
  },
  portrait: {
    borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0,
    backgroundColor: '#000000', textColor: '#FFFFFF',
    slots: [
      { id: 'model', area: 'overlay', anchor: { x: 0.95, y: 0.92 }, fontSize: 0.015, align: 'right', fontFamily: 'inter' },
      { id: 'params', area: 'overlay', anchor: { x: 0.95, y: 0.96 }, fontSize: 0.012, align: 'right', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.7)' },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const HALF_FRAME: FrameStyle = {
  id: 'half-frame',
  name: '半格双联',
  description: '模拟半格相机 · 左右两张照片并排 · 底部机型参数',
  group: 'collage',
  landscape: {
    borderTop: 0.02, borderBottom: 0.1, borderLeft: 0.02, borderRight: 0.02,
    backgroundColor: '#1A1A1A', textColor: 'rgba(255,255,255,0.85)',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.05, y: 0.5 }, fontSize: 0.012, align: 'left', fontFamily: 'mono' },
      { id: 'params', area: 'bottom', anchor: { x: 0.95, y: 0.5 }, fontSize: 0.012, align: 'right', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.6)' },
    ],
  },
  portrait: {
    borderTop: 0.02, borderBottom: 0.12, borderLeft: 0.02, borderRight: 0.02,
    backgroundColor: '#1A1A1A', textColor: 'rgba(255,255,255,0.85)',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.05, y: 0.45 }, fontSize: 0.014, align: 'left', fontFamily: 'mono' },
      { id: 'params', area: 'bottom', anchor: { x: 0.95, y: 0.45 }, fontSize: 0.014, align: 'right', fontFamily: 'mono', colorOverride: 'rgba(255,255,255,0.6)' },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const DIPTYCH: FrameStyle = {
  id: 'diptych',
  name: '双联拼图',
  description: '白底 · 两张照片并排 · 底部统一参数 · 适合系列展示',
  group: 'collage',
  landscape: {
    borderTop: 0.03, borderBottom: 0.1, borderLeft: 0.03, borderRight: 0.03,
    backgroundColor: '#FFFFFF', textColor: '#666666',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.5 }, fontSize: 0.012, align: 'center', fontFamily: 'mono' },
    ],
  },
  portrait: {
    borderTop: 0.03, borderBottom: 0.12, borderLeft: 0.03, borderRight: 0.03,
    backgroundColor: '#FFFFFF', textColor: '#666666',
    slots: [
      { id: 'model', area: 'bottom', anchor: { x: 0.5, y: 0.45 }, fontSize: 0.014, align: 'center', fontFamily: 'mono' },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// 导出阶段 5 全部 14 个 style(供 registry.ts 批量 set)
// ============================================================================

export const STAGE5_STYLES: readonly FrameStyle[] = [
  // glass(4)
  FROSTED_GLASS,
  GLASS_CHIP,
  GLASS_GRADIENT,
  GLASS_MINIMAL,
  // oil(3)
  OIL_TEXTURE,
  WATERCOLOR_CAPTION,
  OIL_CLASSIC,
  // ambient(15)
  AMBIENT_GLOW,
  BOKEH_PILLAR,
  AMBIENT_VINYL,
  AMBIENT_AURA,
  AMBIENT_SOFT,
  AMBIENT_DARK,
  AMBIENT_GRADIENT,
  AMBIENT_MIST,
  AMBIENT_TWILIGHT,
  AMBIENT_OCEAN,
  AMBIENT_FOREST,
  AMBIENT_FILM,
  AMBIENT_CREAM,
  AMBIENT_ROSE,
  AMBIENT_MONO,
  AMBIENT_ROUNDED,
  AMBIENT_ISLAND,
  AMBIENT_GLASS,
  AMBIENT_AURORA,
  AMBIENT_FROST,
  AMBIENT_BREATHE,
  AMBIENT_MIRROR,
  AMBIENT_VIGNETTE,
  // cinema(4)
  CINEMA_SCOPE,
  NEON_EDGE,
  CINEMA_LETTERBOX,
  CINEMA_TIMESTAMP,
  // editorial(2)
  SWISS_GRID,
  EDITORIAL_MINIMAL,
  // floating(2)
  FLOATING_CAPTION,
  STAMP_CORNER,
  // simple(5)
  WHITE_CLASSIC,
  SEPARATOR_LINE,
  ROUNDED_SHADOW,
  GRADIENT_BORDER,
  GEO_INFO,
  // editorial(+1)
  MAGAZINE_COVER,
  // floating(+1)
  TRANSPARENT_OVERLAY,
  // collage(2)
  HALF_FRAME,
  DIPTYCH,
]
