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
// Film Full Border · 135 全齿孔(阶段 2 · 2026-05-01)
// ============================================================================
//
// 设计语言(artifact/design/frame-system-2026-05-01.md · 组 B1):
//   - 胶片黑 #0A0A0A 背景 · 上下两排齿孔
//   - 横图:齿孔在上下(对应真实 135 胶卷齿孔在胶片长边)
//   - 竖图:齿孔切到左右(真实 135 胶卷竖拍时齿孔本身就在两侧长边)
//     · 这是本风格最关键的横竖自适应契约:slot area 从 top/bottom 切到 left/right
//   - 上边:相机型号 + 日期(白字)
//   - 下边:焦距 · 光圈 · 快门 · ISO(等宽小字 · 白字)
//   - 橙红帧号 "36 →"(胶片帧计数致敬,固定字符)
//
// 齿孔图案由 SVG `<pattern>` 定义 · generator 内渲染

const FILM_FULL_BORDER: FrameStyle = {
  id: 'film-full-border',
  name: '135 全齿孔',
  description: '胶片黑边 + 真实 135 齿孔图案,横竖自动切换齿孔方向',
  landscape: {
    borderTop: BORDER.filmFullBorder.perforationLandscape,
    borderBottom: BORDER.filmFullBorder.perforationLandscape,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.paperWhite,
    accentColor: COLOR.dateStampOrange,
    slots: [
      {
        // 机型放上边中线偏左
        id: 'model',
        area: 'top',
        anchor: { x: 0.08, y: 0.55 },
        fontSize: FONT_SIZE.caption,
        align: 'left',
        fontFamily: 'mono',
      },
      {
        // 日期放上边右侧,橙红
        id: 'date',
        area: 'top',
        anchor: { x: 0.92, y: 0.55 },
        fontSize: FONT_SIZE.caption,
        align: 'right',
        fontFamily: 'courier',
        colorOverride: COLOR.dateStampOrange,
      },
      {
        // 参数放下边
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.08, y: 0.55 },
        fontSize: FONT_SIZE.caption,
        align: 'left',
        fontFamily: 'mono',
      },
    ],
  },
  portrait: {
    // 竖图关键:齿孔切到左右,文字也跟着到左右
    borderTop: 0,
    borderBottom: 0,
    borderLeft: BORDER.filmFullBorder.perforationPortrait,
    borderRight: BORDER.filmFullBorder.perforationPortrait,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.paperWhite,
    accentColor: COLOR.dateStampOrange,
    slots: [
      {
        // 机型竖排在左边(从下向上读)
        id: 'model',
        area: 'left',
        anchor: { x: 0.55, y: 0.08 },
        fontSize: FONT_SIZE.caption,
        align: 'left',
        fontFamily: 'mono',
      },
      {
        // 日期竖排在左边靠下
        id: 'date',
        area: 'left',
        anchor: { x: 0.55, y: 0.92 },
        fontSize: FONT_SIZE.caption,
        align: 'right',
        fontFamily: 'courier',
        colorOverride: COLOR.dateStampOrange,
      },
      {
        // 参数竖排在右边
        id: 'params',
        area: 'right',
        anchor: { x: 0.45, y: 0.08 },
        fontSize: FONT_SIZE.caption,
        align: 'left',
        fontFamily: 'mono',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// Gallery Black · 画册黑(阶段 2 · 2026-05-01)
// ============================================================================
//
// 设计(artifact/design/frame-system-2026-05-01.md · 组 D1):
//   - 四周胶片黑 #0A0A0A,底部延至 14%(横)/ 12%(竖)
//   - 底部居中三行堆叠:
//     · model 大字 Georgia serif(画册文字多用衬线)
//     · artist 斜体小字(艺术家署名位,Ins 摄影师偏好)
//     · date 等宽小字(创作日期,次级信息)
//   - 所有文字走 paperWhite,与黑底形成画册/画廊标签的端庄气质
//
// Gallery White 是本风格的 light 镜像 —— 用 generator 的 colorScheme 分支
// (colorScheme=light 时 bg/fg 互换),但本实现采用独立 FrameStyle 避免
// UI 分支复杂化(用户切 Gallery White 就是另一个风格,不是改 Black 的参数)

const GALLERY_BLACK: FrameStyle = {
  id: 'gallery-black',
  name: '画册黑',
  description: '胶片黑画册边 + 衬线字白,端庄沉稳,适合展览/奖赛',
  landscape: {
    borderTop: BORDER.gallery.top,
    borderBottom: BORDER.gallery.bottomLandscape,
    borderLeft: BORDER.gallery.side,
    borderRight: BORDER.gallery.side,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.paperWhite,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: FONT_SIZE.mainTitle,
        align: 'center',
        fontFamily: 'georgia',
      },
      {
        id: 'artist',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.62 },
        fontSize: FONT_SIZE.caption,
        align: 'center',
        fontFamily: 'georgia',
      },
      {
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.82 },
        fontSize: FONT_SIZE.smallLabel,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
    ],
  },
  portrait: {
    borderTop: BORDER.gallery.top,
    borderBottom: BORDER.gallery.bottomPortrait,
    borderLeft: BORDER.gallery.side,
    borderRight: BORDER.gallery.side,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.paperWhite,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.35 },
        fontSize: FONT_SIZE.mainTitle,
        align: 'center',
        fontFamily: 'georgia',
      },
      {
        id: 'artist',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.62 },
        fontSize: FONT_SIZE.caption,
        align: 'center',
        fontFamily: 'georgia',
      },
      {
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.82 },
        fontSize: FONT_SIZE.smallLabel,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
    ],
  },
  defaultOverrides: {
    ...DEFAULT_OVERRIDES,
    showFields: { ...DEFAULT_OVERRIDES.showFields, artist: true }, // 画册风格默认显示作者
  },
}

// ============================================================================
// Gallery White · 美术馆白(阶段 2 · 2026-05-01)
// ============================================================================
//
// Gallery Black 的 light 反色版:纸白边 + 深灰字,更 Ins 风、更现代。
// 结构完全一致,只交换 backgroundColor / textColor。
// 用独立 FrameStyle(不是 colorScheme 分支)保证 UI 里可独立选择,语义更清晰。

const GALLERY_WHITE: FrameStyle = {
  id: 'gallery-white',
  name: '美术馆白',
  description: '纸白画册边 + 深灰衬线字,现代 Ins 风,画廊感',
  landscape: {
    ...GALLERY_BLACK.landscape,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: GALLERY_BLACK.landscape.slots.map((s) =>
      s.id === 'date' ? { ...s, colorOverride: COLOR.softGray } : s,
    ),
  },
  portrait: {
    ...GALLERY_BLACK.portrait,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: GALLERY_BLACK.portrait.slots.map((s) =>
      s.id === 'date' ? { ...s, colorOverride: COLOR.softGray } : s,
    ),
  },
  defaultOverrides: GALLERY_BLACK.defaultOverrides,
}

// ============================================================================
// Editorial Caption · 卡片新闻(阶段 2 · 2026-05-01)
// ============================================================================
//
// 设计(artifact/design/frame-system-2026-05-01.md · 组 D4):
//   - 纸白背景 · 图片下方外接一块 caption 区(12%/10% 底边)
//   - caption 顶部一根极细黑线分隔(画册/杂志排版惯例)
//   - 左边:粗体大字机型(Inter semibold,现代出版感)
//   - 右边:小字参数(mono,对齐 right)
//   - 居中:日期小字(mono softGray)
//
// 与 Gallery 的区别:
//   - Gallery 三行居中堆叠(端庄画册气);Editorial 左右分隔(杂志版式)
//   - Editorial 底部比 Gallery 浅(12% vs 14%)· 分隔线是标志性视觉元素

const EDITORIAL_CAPTION: FrameStyle = {
  id: 'editorial-caption',
  name: '卡片新闻',
  description: '纸白 + 细线分隔 + 左粗体右参数 · 杂志版式',
  landscape: {
    borderTop: 0,
    borderBottom: BORDER.editorialCaption.bottomLandscape,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        // 机型左侧粗体大字
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.05, y: 0.45 },
        fontSize: FONT_SIZE.mainTitle,
        align: 'left',
        fontFamily: 'inter',
      },
      {
        // 参数右侧小字
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.95, y: 0.45 },
        fontSize: FONT_SIZE.caption,
        align: 'right',
        fontFamily: 'mono',
      },
      {
        // 日期居中小字,略靠下
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.8 },
        fontSize: FONT_SIZE.smallLabel,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
    ],
  },
  portrait: {
    borderTop: 0,
    borderBottom: BORDER.editorialCaption.bottomPortrait,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.05, y: 0.45 },
        fontSize: FONT_SIZE.mainTitle,
        align: 'left',
        fontFamily: 'inter',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.95, y: 0.45 },
        fontSize: FONT_SIZE.caption,
        align: 'right',
        fontFamily: 'mono',
      },
      {
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.8 },
        fontSize: FONT_SIZE.smallLabel,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// Spine Edition · 书脊式(阶段 2 · 2026-05-01)
// ============================================================================
//
// 设计(artifact/design/frame-system-2026-05-01.md · 组 D3):
//   - 横图:底部胶片黑粗带 10%,带内左侧 Georgia 白字机型 + 右侧橙红日期
//   - 竖图:右侧胶片黑粗带 8%,带内从上到下 rotate(90) 排列:机型 + 日期
//   - "书脊"的视觉隐喻 —— 像精装书的书脊印着书名
//
// 与 Film Full Border 的差异:
//   - Film Full Border:两条平行边 + 齿孔图案(胶卷视觉)
//   - Spine Edition:只一条厚带 + 文字竖排(书籍视觉)
//   - 都涉及横竖方向 area 切换(bottom ↔ right),共享 Film 的"朝向真值"
//     安全入口(读 layout 数据,不在 generator 散布 if)

const SPINE_EDITION: FrameStyle = {
  id: 'spine-edition',
  name: '书脊式',
  description: '横图底带 / 竖图右带 · 致敬精装书脊排版',
  landscape: {
    borderTop: 0,
    borderBottom: BORDER.spineEdition.bandLandscape,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.paperWhite,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.05, y: 0.55 },
        fontSize: FONT_SIZE.spine,
        align: 'left',
        fontFamily: 'georgia',
      },
      {
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.95, y: 0.55 },
        fontSize: FONT_SIZE.caption,
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
    borderRight: BORDER.spineEdition.bandPortrait,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.paperWhite,
    slots: [
      {
        // 竖图:机型在右带 · 垂直向上读(从下到上)
        id: 'model',
        area: 'right',
        anchor: { x: 0.5, y: 0.9 },
        fontSize: FONT_SIZE.spine,
        align: 'left',
        fontFamily: 'georgia',
      },
      {
        // 日期在右带 · 垂直向上读(从下到上,靠底部)
        id: 'date',
        area: 'right',
        anchor: { x: 0.5, y: 0.1 },
        fontSize: FONT_SIZE.caption,
        align: 'left',
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
REGISTRY.set(FILM_FULL_BORDER.id, FILM_FULL_BORDER)
REGISTRY.set(GALLERY_BLACK.id, GALLERY_BLACK)
REGISTRY.set(GALLERY_WHITE.id, GALLERY_WHITE)
REGISTRY.set(EDITORIAL_CAPTION.id, EDITORIAL_CAPTION)
REGISTRY.set(SPINE_EDITION.id, SPINE_EDITION)

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
