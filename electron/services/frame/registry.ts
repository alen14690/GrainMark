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
import type { FrameStyle, FrameStyleId } from '../../../shared/types.js'
import { DEFAULT_OVERRIDES } from './registry-defaults.js'
import { STAGE5_STYLES } from './registry-stage5.js'

// 对外透出 DEFAULT_OVERRIDES(保持老调用方 `import { DEFAULT_OVERRIDES } from './registry'` 兼容)
// 实际定义已迁到 registry-defaults.ts · 打破 ESM 循环依赖(2026-05-01)
export { DEFAULT_OVERRIDES }

// ============================================================================
// 默认 overrides 定义已迁到 registry-defaults.ts(2026-05-01 打破 ESM 循环)
// 本文件通过顶部 `import { DEFAULT_OVERRIDES } from './registry-defaults.js'` + re-export 保持兼容
// ============================================================================

// ============================================================================
// Minimal Bar · 极简底栏(阶段 2 已实装)
// ============================================================================

const MINIMAL_BAR: FrameStyle = {
  id: 'minimal-bar',
  name: '极简底栏',
  description: '纸白底栏,等宽字参数一行,专业克制',
  group: 'classic',
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
    // 竖图专业重设计(2026-05-01):
    //   底栏 20% 短边(过去 10~12% 过浅,观感像"压条")
    //   二层堆叠:
    //     - 第 1 行:机型大字 · 专业视觉主体 · anchor.y=0.32
    //     - 第 2 行:参数行 · 保持等宽小字 · anchor.y=0.68
    //     - 日期移到参数行末(由 paramLine 自带),不再单独 slot · 避免三元素挤压
    borderTop: 0,
    borderBottom: BORDER.minimalBar.bottomPortrait,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        // 机型大字独占第 1 行 · 左对齐 · Inter 家族增加现代感
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.04, y: 0.32 },
        fontSize: FONT_SIZE.mainTitlePortrait, // 0.034 · 真的大
        align: 'left',
        fontFamily: 'inter',
      },
      {
        // 参数第 2 行 · 左对齐 mono · 作为机型的元数据
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.04, y: 0.7 },
        fontSize: FONT_SIZE.paramsPortrait, // 0.024
        align: 'left',
        fontFamily: 'mono',
      },
      {
        // 日期右下小字 softGray · 作为参数的"右尾"
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.96, y: 0.7 },
        fontSize: FONT_SIZE.captionPortrait,
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
  group: 'classic',
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
    // 竖图修订(2026-05-01):底边与横图同 22% · 保持 Polaroid 600 真实物理比例
    // 主标题字号用 mainTitlePortrait = 0.034 · 给竖图更充足视觉权重
    borderTop: BORDER.polaroid.top,
    borderBottom: BORDER.polaroid.bottomPortrait, // 0.22 · 与横图一致
    borderLeft: BORDER.polaroid.side,
    borderRight: BORDER.polaroid.side,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.38 },
        fontSize: FONT_SIZE.mainTitlePortrait, // 竖图放大到 0.034
        align: 'center',
        fontFamily: 'georgia',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.7 },
        fontSize: FONT_SIZE.captionPortrait, // 0.020
        align: 'center',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
      {
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.94, y: 0.9 },
        fontSize: FONT_SIZE.smallLabelPortrait,
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
  group: 'classic',
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
  group: 'classic',
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
    // 竖图专业重设计(2026-05-01):
    //   底栏 24% · 三行堆叠需要充分高度 · 主字号放大到 mainTitlePortrait
    //   y 分布 0.3 / 0.55 / 0.82 给三行足够呼吸感 · 最后一行日期偏下
    borderTop: BORDER.gallery.top,
    borderBottom: BORDER.gallery.bottomPortrait, // 0.24
    borderLeft: BORDER.gallery.side,
    borderRight: BORDER.gallery.side,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.paperWhite,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.3 },
        fontSize: FONT_SIZE.mainTitlePortrait, // 0.034
        align: 'center',
        fontFamily: 'georgia',
      },
      {
        id: 'artist',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.55 },
        fontSize: FONT_SIZE.paramsPortrait, // 0.024 · 比之前 caption 大
        align: 'center',
        fontFamily: 'georgia',
      },
      {
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.82 },
        fontSize: FONT_SIZE.captionPortrait, // 0.020
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
  group: 'classic',
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
  group: 'classic',
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
    // 竖图专业重设计(2026-05-01):
    //   底栏 22% · 两行堆叠 + 日期底角 · 主字号 mainTitlePortrait 给足视觉权重
    //   y 分布:model 0.28 / params 0.58 / date 0.85 · 三行明确分层
    borderTop: 0,
    borderBottom: BORDER.editorialCaption.bottomPortrait, // 0.22
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.05, y: 0.28 },
        fontSize: FONT_SIZE.mainTitlePortrait, // 0.034
        align: 'left',
        fontFamily: 'inter',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.05, y: 0.58 },
        fontSize: FONT_SIZE.paramsPortrait, // 0.024
        align: 'left',
        fontFamily: 'mono',
      },
      {
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.95, y: 0.85 },
        fontSize: FONT_SIZE.smallLabelPortrait,
        align: 'right',
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
  group: 'classic',
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
// Hairline · 画廊细线(阶段 2 · 2026-05-01)
// ============================================================================
//
// 设计(artifact/design/frame-system-2026-05-01.md · 组 A2):
//   - 图片周围 1.5% 处一根极细线(hairlineStroke #202020)
//   - 右下角外接一行小字参数
//   - 视觉极简,画廊展览质感
//   - 与 Minimal Bar 的区别:Minimal Bar 有完整底栏占位;Hairline 只一根线 + 小字
//
// 实现注意:
//   - "线在图内 1.5%" = 图片真正宽高留 97% 给照片 + 3% 给线框缓冲
//     但这对 border* 的语义不符 —— 这里用 2% 外边框承载 "线 + 小字"
//   - 右下角小字:slot area='overlay',直接叠在原图右下角(非扩边)

const HAIRLINE: FrameStyle = {
  id: 'hairline',
  name: '画廊细线',
  description: '四周发丝线 + 右下角参数小字,极简画廊展览感',
  group: 'classic',
  landscape: {
    // 四周薄边 2%(容纳线 + 右下小字)
    borderTop: 0.02,
    borderBottom: 0.02,
    borderLeft: 0.02,
    borderRight: 0.02,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        // 参数在右下角,area='overlay' 叠在原图右下 · 字极小 · softGray
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.97, y: 0.97 },
        fontSize: FONT_SIZE.smallLabel,
        align: 'right',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
    ],
  },
  portrait: {
    borderTop: 0.02,
    borderBottom: 0.02,
    borderLeft: 0.02,
    borderRight: 0.02,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        id: 'params',
        area: 'overlay',
        anchor: { x: 0.97, y: 0.97 },
        fontSize: FONT_SIZE.smallLabelPortrait, // 0.016 · 竖图稍大(过去 0.014 肉眼几乎看不见)
        align: 'right',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// SX-70 Square · 方形宝丽来(阶段 3 · 2026-05-01)
// ============================================================================
//
// 设计(artifact/design/frame-system-2026-05-01.md · 组 C2):
//   - 四边等白 8% + 底部 20% · 横竖数据一致(本风格本质是方形,横竖区别弱)
//   - 底部三行文字(model/params/date),Courier Prime 老打字机字
//   - 与 Polaroid Classic 对照:Polaroid 偏长方形 + Georgia 手写感;
//     SX-70 偏方形 + Courier 老打字机
//   - 非方形图由 generator 内部画 filmBlack 填充带,layout 只负责边框几何

const SX70_SQUARE: FrameStyle = {
  id: 'sx70-square',
  name: 'SX-70 方宝丽来',
  description: '四边等白 + 老打字机字,真实 SX-70 相纸方形比例',
  group: 'classic',
  landscape: {
    borderTop: BORDER.sx70.top,
    borderBottom: BORDER.sx70.bottom,
    borderLeft: BORDER.sx70.side,
    borderRight: BORDER.sx70.side,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.4 },
        fontSize: FONT_SIZE.mainTitle,
        align: 'center',
        fontFamily: 'courier',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.68 },
        fontSize: FONT_SIZE.caption,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
      {
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.9 },
        fontSize: FONT_SIZE.smallLabel,
        align: 'center',
        fontFamily: 'courier',
        colorOverride: COLOR.softGray,
      },
    ],
  },
  portrait: {
    // 竖图 = 横图(方形风格横竖无差异)
    borderTop: BORDER.sx70.top,
    borderBottom: BORDER.sx70.bottom,
    borderLeft: BORDER.sx70.side,
    borderRight: BORDER.sx70.side,
    backgroundColor: COLOR.paperWhite,
    textColor: COLOR.inkGray,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.4 },
        fontSize: FONT_SIZE.mainTitle,
        align: 'center',
        fontFamily: 'courier',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.68 },
        fontSize: FONT_SIZE.caption,
        align: 'center',
        fontFamily: 'mono',
        colorOverride: COLOR.softGray,
      },
      {
        id: 'date',
        area: 'bottom',
        anchor: { x: 0.5, y: 0.9 },
        fontSize: FONT_SIZE.smallLabel,
        align: 'center',
        fontFamily: 'courier',
        colorOverride: COLOR.softGray,
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// Negative Strip · 胶片负片条(阶段 3 · 2026-05-01)
// ============================================================================
//
// 设计(artifact/design/frame-system-2026-05-01.md · 组 B3):
//   - 横图:上下胶片黑 ledger 8%,白字机型/参数 + 橙红 "24 →" 帧号戳(在画面左上)
//   - 竖图:左右胶片黑 ledger 8%,参数切到 area='right'(垂直排)
//   - 与 Film Full Border 的关系:都是"双边黑带 + 横竖切换",但 Negative Strip
//     无齿孔 + 固定帧号戳(两个风格在 generators 里相互独立,共享 slotPlacement)

const NEGATIVE_STRIP: FrameStyle = {
  id: 'negative-strip',
  name: '负片黑边条',
  description: '上下(横)/ 左右(竖)黑 ledger + 白字参数 + 橙红帧号戳 "24 →"',
  group: 'classic',
  landscape: {
    borderTop: BORDER.negativeStrip.stripLandscape,
    borderBottom: BORDER.negativeStrip.stripLandscape,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.paperWhite,
    slots: [
      {
        // 机型在上 ledger 左侧
        id: 'model',
        area: 'top',
        anchor: { x: 0.06, y: 0.55 },
        fontSize: FONT_SIZE.caption,
        align: 'left',
        fontFamily: 'mono',
      },
      {
        // 日期在上 ledger 右侧
        id: 'date',
        area: 'top',
        anchor: { x: 0.94, y: 0.55 },
        fontSize: FONT_SIZE.caption,
        align: 'right',
        fontFamily: 'mono',
      },
      {
        // 参数在下 ledger 左侧
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.06, y: 0.55 },
        fontSize: FONT_SIZE.caption,
        align: 'left',
        fontFamily: 'mono',
      },
    ],
  },
  portrait: {
    // 竖图:黑带切到左右,参数 area='right' 竖排
    borderTop: 0,
    borderBottom: 0,
    borderLeft: BORDER.negativeStrip.stripPortrait,
    borderRight: BORDER.negativeStrip.stripPortrait,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.paperWhite,
    slots: [
      {
        // 机型竖排在左带
        id: 'model',
        area: 'left',
        anchor: { x: 0.55, y: 0.06 },
        fontSize: FONT_SIZE.caption,
        align: 'left',
        fontFamily: 'mono',
      },
      {
        // 日期竖排在左带靠底
        id: 'date',
        area: 'left',
        anchor: { x: 0.55, y: 0.94 },
        fontSize: FONT_SIZE.caption,
        align: 'right',
        fontFamily: 'mono',
      },
      {
        // 参数竖排在右带
        id: 'params',
        area: 'right',
        anchor: { x: 0.45, y: 0.06 },
        fontSize: FONT_SIZE.caption,
        align: 'left',
        fontFamily: 'mono',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// Point-and-Shoot Stamp · 傻瓜相机日期戳(阶段 3 · 2026-05-01)
// ============================================================================
//
// 设计(artifact/design/frame-system-2026-05-01.md · 组 B4):
//   - 零边框 · 图像不扩展;只在画面右下角叠一枚 overlay 橙红日期戳
//   - 与 Hairline 相似(都用 overlay),但本风格完全不画线框,日期字号更大
//   - 用户 showFields.dateTime=false 时会退化成"空 overlay",即跟无边框原图一致

const POINT_AND_SHOOT_STAMP: FrameStyle = {
  id: 'point-and-shoot-stamp',
  name: '傻瓜机日期戳',
  description: '零边框 + 右下角橙红 LCD 日期戳,致敬 90 年代傻瓜相机',
  group: 'classic',
  landscape: {
    borderTop: BORDER.pointAndShoot.none,
    borderBottom: BORDER.pointAndShoot.none,
    borderLeft: BORDER.pointAndShoot.none,
    borderRight: BORDER.pointAndShoot.none,
    backgroundColor: COLOR.filmBlack, // 零边框时不会看到背景,但保底给个颜色
    textColor: COLOR.dateStampOrange,
    slots: [
      {
        // 只用 date slot(overlay 在图右下角) · 字号 3% · Courier 粗体
        id: 'date',
        area: 'overlay',
        anchor: { x: 0.96, y: 0.94 },
        fontSize: 0.03,
        align: 'right',
        fontFamily: 'courier',
        colorOverride: COLOR.dateStampOrange,
      },
    ],
  },
  portrait: {
    borderTop: BORDER.pointAndShoot.none,
    borderBottom: BORDER.pointAndShoot.none,
    borderLeft: BORDER.pointAndShoot.none,
    borderRight: BORDER.pointAndShoot.none,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.dateStampOrange,
    slots: [
      {
        id: 'date',
        area: 'overlay',
        anchor: { x: 0.96, y: 0.96 },
        fontSize: 0.03,
        align: 'right',
        fontFamily: 'courier',
        colorOverride: COLOR.dateStampOrange,
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// Contax Label · 相机铭牌致敬条(阶段 3 · 2026-05-01)
// ============================================================================
//
// 设计(artifact/design/frame-system-2026-05-01.md · 组 E2):
//   - 底部 10% 胶片黑条,横竖一致(不切侧)
//   - 左:大字 Inter 粗体机型(白字) · 右:mono 小字参数(白字)
//   - 中间一根橙红竖线分隔(致敬 Leica 红标 / Contax 红 T*)
//   - Logo 留给用户上传(overrides.logoPath;安全红线:不内置任何受商标保护的 Logo)

const CONTAX_LABEL: FrameStyle = {
  id: 'contax-label',
  name: '铭牌致敬条',
  description: '底部黑条 + 左粗体机型 · 右小字参数 · 橙红竖线分隔',
  group: 'classic',
  landscape: {
    borderTop: 0,
    borderBottom: BORDER.contaxLabel.bottomLandscape,
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.paperWhite,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.06, y: 0.55 },
        fontSize: FONT_SIZE.mainTitle,
        align: 'left',
        fontFamily: 'inter',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.94, y: 0.55 },
        fontSize: FONT_SIZE.caption,
        align: 'right',
        fontFamily: 'mono',
      },
    ],
  },
  portrait: {
    // 竖图专业重设计(2026-05-01):
    //   底栏 22% · 两行堆叠(model 上 params 下)
    //   视觉轴:左侧一根橙红粗竖线贯穿两行(在 generator 里手绘,此处只定义文字)
    //   slot x 起点 0.1 给竖线留空间
    borderTop: 0,
    borderBottom: BORDER.contaxLabel.bottomPortrait, // 0.22
    borderLeft: 0,
    borderRight: 0,
    backgroundColor: COLOR.filmBlack,
    textColor: COLOR.paperWhite,
    slots: [
      {
        id: 'model',
        area: 'bottom',
        anchor: { x: 0.1, y: 0.3 },
        fontSize: FONT_SIZE.mainTitlePortrait, // 0.034
        align: 'left',
        fontFamily: 'inter',
      },
      {
        id: 'params',
        area: 'bottom',
        anchor: { x: 0.1, y: 0.68 },
        fontSize: FONT_SIZE.paramsPortrait, // 0.024
        align: 'left',
        fontFamily: 'mono',
      },
    ],
  },
  defaultOverrides: DEFAULT_OVERRIDES,
}

// ============================================================================
// 注册表
// ============================================================================
//
// 注册策略(2026-05-01 用户反馈\"经典组不要了\"):
//   - Classic 12 风格仍注册入 REGISTRY(供老测试 + 未来潜在调用方)
//   - 但通过 listPublicFrameStyles() 过滤 · UI 只展示阶段 5 的 14 个
//   - IPC 'frame:templates' 的公共列表也只返回 14 个(见 electron/ipc/frame.ts)

const REGISTRY = new Map<FrameStyleId, FrameStyle>()
// classic · 阶段 2 必保 8 + 阶段 3 可选 4(保留注册 · UI 不展示)
REGISTRY.set(MINIMAL_BAR.id, MINIMAL_BAR)
REGISTRY.set(POLAROID_CLASSIC.id, POLAROID_CLASSIC)
REGISTRY.set(FILM_FULL_BORDER.id, FILM_FULL_BORDER)
REGISTRY.set(GALLERY_BLACK.id, GALLERY_BLACK)
REGISTRY.set(GALLERY_WHITE.id, GALLERY_WHITE)
REGISTRY.set(EDITORIAL_CAPTION.id, EDITORIAL_CAPTION)
REGISTRY.set(SPINE_EDITION.id, SPINE_EDITION)
REGISTRY.set(HAIRLINE.id, HAIRLINE)
REGISTRY.set(SX70_SQUARE.id, SX70_SQUARE)
REGISTRY.set(NEGATIVE_STRIP.id, NEGATIVE_STRIP)
REGISTRY.set(POINT_AND_SHOOT_STAMP.id, POINT_AND_SHOOT_STAMP)
REGISTRY.set(CONTAX_LABEL.id, CONTAX_LABEL)
// 阶段 5 · 14 个高级质感(glass/oil/ambient/cinema/editorial/metal/floating 7 簇)
// 数据定义在 registry-stage5.ts · 此处集中注册 · 对外公开展示
for (const style of STAGE5_STYLES) {
  REGISTRY.set(style.id, style)
}

/** 列出已注册的全部 FrameStyle(包含老 classic · 用于测试 / 动态注册场景) */
export function listFrameStyles(): FrameStyle[] {
  return Array.from(REGISTRY.values())
}

/**
 * 列出对外公开展示的 FrameStyle(UI + IPC `frame:templates` 用)
 *
 * 2026-05-01 用户反馈\"经典那部分不要了,新增的部分已经包含这些效果了\"
 * 策略:过滤掉 group='classic' 的 12 个老风格 · 只返回阶段 5 的 14 个
 *
 * 老风格仍在 REGISTRY 供 getFrameStyle / 内部测试使用 · UI 层不可见
 */
export function listPublicFrameStyles(): FrameStyle[] {
  return listFrameStyles().filter((s) => s.group !== 'classic')
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

// ============================================================================
// 分组相关 API(2026-05-01 新增 · UI 分组展示)
// ============================================================================

/**
 * 质感分组展示顺序(UI 按此顺序 section 化)
 *
 * 2026-05-01 用户反馈"经典组不要了" · 只保留阶段 5 的 7 个新簇
 *
 * 顺序按"纸面感 → 数字质感 → 个性强"排列:
 *   editorial(印刷排版) → oil(油画) → floating(浮动) · 都是纸面语义
 *   glass / ambient(数字质感 · iOS 风)
 *   metal(金属 · 硬物理)
 *   cinema(电影霓虹 · 个性最强)
 *
 * 类型安全:若将来新增 FrameStyleGroup 成员,此数组漏掉会被 TS never 断言捕获。
 *
 * 注:'classic' 仍在 FrameStyleGroup 类型里(老 style 兼容),但不在公共展示顺序里。
 */
export const FRAME_STYLE_GROUPS_ORDERED = [
  'glass',
  'ambient',
  'cinema',
  'oil',
  'editorial',
  'floating',
] as const satisfies readonly Exclude<FrameStyle['group'], 'classic'>[]

/**
 * 分组中文名(UI 展示用)
 *
 * 类型安全:Record 字段必须覆盖所有 FrameStyleGroup 成员,漏一个就 TS 报错。
 * classic 保留映射但 UI 的 GROUPS_ORDERED 已不含它 · 不会出现在界面上。
 */
export const FRAME_STYLE_GROUP_LABELS: Record<FrameStyle['group'], string> = {
  classic: '经典', // 保留类型完整性 · UI 不展示
  glass: '玻璃拟态',
  oil: '油画 · 水彩',
  ambient: '氛围模糊',
  cinema: '电影 · 霓虹',
  editorial: '印刷 · 杂志',
  floating: '浮动徽章',
}

/** 分组英文副标(UI 展示用,与 moodboard 页面一致) */
export const FRAME_STYLE_GROUP_SUBTITLES: Record<FrameStyle['group'], string> = {
  classic: 'CLASSIC',
  glass: 'FROSTED GLASS',
  oil: 'OIL · WATERCOLOR',
  ambient: 'AMBIENT BLUR',
  cinema: 'CINEMA · NEON',
  editorial: 'EDITORIAL · PRINT',
  floating: 'FLOATING',
}

/**
 * 按分组归类 · 返回 { group → style[] } · 内部按注册顺序保持稳定
 *
 * 2026-05-01 变更:
 *   - 默认过滤 classic(用户反馈"经典组不要了")
 *   - 需要全量(含 classic)可传 `{ includeClassic: true }`
 */
export function getFrameStylesByGroup(
  opts: { includeClassic?: boolean } = {},
): Record<FrameStyle['group'], FrameStyle[]> {
  const result = {
    classic: [] as FrameStyle[],
    glass: [] as FrameStyle[],
    oil: [] as FrameStyle[],
    ambient: [] as FrameStyle[],
    cinema: [] as FrameStyle[],
    editorial: [] as FrameStyle[],
    floating: [] as FrameStyle[],
  }
  const source = opts.includeClassic ? listFrameStyles() : listPublicFrameStyles()
  for (const style of source) {
    result[style.group].push(style)
  }
  return result
}
