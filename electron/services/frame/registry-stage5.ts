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

const CONTACT_SHEET: FrameStyle = {
  id: 'contact-sheet',
  name: '印相小样',
  description: '顶部胶卷橙带 · 底部参数多列网格 · KODAK 风',
  group: 'editorial',
  landscape: {
    borderTop: 0.03, // 橙带高度
    borderBottom: 0.16,
    borderLeft: 0.04,
    borderRight: 0.04,
    backgroundColor: '#EDE8D9',
    textColor: '#2A2A2A',
    accentColor: '#D4A017', // 橙带色
    slots: [
      {
        id: 'model',
        area: 'top',
        anchor: { x: 0.5, y: 0.5 },
        fontSize: 0.011,
        align: 'center',
        fontFamily: 'courier',
        colorOverride: '#3A2A00',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.04, y: 0.5 },
        fontSize: 0.013,
        align: 'left',
        fontFamily: 'courier',
      },
    ],
  },
  portrait: {
    borderTop: 0.03,
    borderBottom: 0.2,
    borderLeft: 0.04,
    borderRight: 0.04,
    backgroundColor: '#EDE8D9',
    textColor: '#2A2A2A',
    accentColor: '#D4A017',
    slots: [
      {
        id: 'model',
        area: 'top',
        anchor: { x: 0.5, y: 0.5 },
        fontSize: 0.013,
        align: 'center',
        fontFamily: 'courier',
        colorOverride: '#3A2A00',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.04, y: 0.5 },
        fontSize: 0.016,
        align: 'left',
        fontFamily: 'courier',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// METAL(2) · 金属 / 徽章
// ============================================================================

const BRUSHED_METAL: FrameStyle = {
  id: 'brushed-metal',
  name: '拉丝金属铭牌',
  description: '照片下方拉丝银色铭牌 · Times 刻字 · 徕卡/蔡司风',
  group: 'metal',
  landscape: {
    borderTop: 0,
    borderBottom: 0.14,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.brushedSilver, // generator 在此基础上画拉丝纹
    textColor: '#1A1A1A',
    accentColor: COLOR.brushedSilverDark,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.06, y: 0.5 },
        fontSize: 0.02,
        align: 'left',
        fontFamily: 'georgia',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.94, y: 0.5 },
        fontSize: 0.014,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: 'rgba(26,26,26,0.7)',
      },
    ],
  },
  portrait: {
    borderTop: 0,
    borderBottom: 0.2,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.brushedSilver,
    textColor: '#1A1A1A',
    accentColor: COLOR.brushedSilverDark,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.06, y: 0.35 },
        fontSize: FONT_SIZE.mainTitlePortrait,
        align: 'left',
        fontFamily: 'georgia',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.06, y: 0.72 },
        fontSize: FONT_SIZE.captionPortrait,
        align: 'left',
        fontFamily: 'mono',
        colorOverride: 'rgba(26,26,26,0.7)',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

const MEDAL_PLATE: FrameStyle = {
  id: 'medal-plate',
  name: '金色圆章',
  description: '右下角金色浮雕圆章 · 徕卡红点式辨识度 · 零边框 overlay',
  group: 'metal',
  landscape: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.filmBlack,
    textColor: '#3A2500',
    accentColor: COLOR.medalGold,
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.92, y: 0.87 },
        fontSize: 0.016,
        align: 'center',
        fontFamily: 'georgia',
        colorOverride: '#3A2500',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.92, y: 0.92 },
        fontSize: 0.011,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: '#3A2500',
      },
    ],
  },
  portrait: {
    borderTop: 0,
    borderBottom: 0,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.filmBlack,
    textColor: '#3A2500',
    accentColor: COLOR.medalGold,
    slots: [
      {
        id: 'model',
        area: 'overlay',
        anchor: { x: 0.88, y: 0.88 },
        fontSize: 0.02,
        align: 'center',
        fontFamily: 'georgia',
        colorOverride: '#3A2500',
      },
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.88, y: 0.92 },
        fontSize: 0.014,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: '#3A2500',
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
// 导出阶段 5 全部 14 个 style(供 registry.ts 批量 set)
// ============================================================================

export const STAGE5_STYLES: readonly FrameStyle[] = [
  // glass(2)
  FROSTED_GLASS,
  GLASS_CHIP,
  // oil(2)
  OIL_TEXTURE,
  WATERCOLOR_CAPTION,
  // ambient(2)
  AMBIENT_GLOW,
  BOKEH_PILLAR,
  // cinema(2)
  CINEMA_SCOPE,
  NEON_EDGE,
  // editorial(2)
  SWISS_GRID,
  CONTACT_SHEET,
  // metal(2)
  BRUSHED_METAL,
  MEDAL_PLATE,
  // floating(2)
  FLOATING_CAPTION,
  STAMP_CORNER,
]
