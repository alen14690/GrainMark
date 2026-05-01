# GrainMark 边框/水印系统全新设计方案 · 2026-05-01

> 用户反馈:
> 1. **切换模板无效果**:点哪个模板 UI 预览都一样
> 2. **边框效果粗糙**:字号、边距、比例在高分辨率图上几乎看不见
> 3. **竖横不自适应**:竖图硬套横向边框/文字排版很丑
>
> 本方案从设计语言、风格矩阵、自适应规则、数据模型、前后端架构五个维度重做。
> 先给"尽可能全"的 16 个风格草案,由用户筛选保留。

---

## 1. 现状根因诊断(三条致命伤)

### 1.1 预览"切模板无效果"的根因

`src/routes/Watermark.tsx:217-227` 的 `<WatermarkOverlay>` **不读 `style.templateId`**,
永远渲染同一段渐变底栏 DOM。哪怕后端 `renderer.ts` 有 7 个 SVG 分支,前端预览都是同一个外观。

**修复方案**:预览层必须接入真实渲染,两条路子任选一条——
- **方案 A(推荐)**:前端也按 templateId 切分 React 组件(`PolaroidPreview`/`FilmBorderPreview`/...),
  每个组件独立实现 CSS/DOM 尺寸,保证所见即所得。**速度快、改参实时**。
- **方案 B**:前端调 `watermark:render` 取 base64 PNG 做预览。**慢(每次改参 300-800ms),
  但和导出结果 100% 一致**。

本方案**采用 A 为主 + B 做"导出前最终对比"**:点击"预览高保真"按钮时触发 B,
防止 CSS 模拟和 Sharp 实际输出漂移。

### 1.2 "边框粗糙"的根因

`renderer.ts` 用像素常数 × `style.scale`:
- `padding = 24 * scale`(默认 scale=1 → 24px)
- `fontSize = 14 * scale`
- Polaroid 底边 `bottomBorder = pad * 4 = 96px`

在 6000×4000 横图上,96px 底边只占 2.4% 的高度,**远不如 Instax mini 真实宝丽来的 18% 底边比例**。
同样 14px 字在 6000px 宽图上肉眼几乎看不见。

**修复规则**(核心一条):
> 所有尺寸必须基于图像短边 `minEdge = min(imgW, imgH)` 计算,不得使用像素常数。

例如新 Polaroid:
- 左右+顶部边框:`minEdge * 0.04`(典型 4000px 短边 → 160px)
- 底部边框:`minEdge * 0.22`(4000px → 880px,接近真实宝丽来 86×54mm 中 18-22% 的底边比例)
- 主字号:`minEdge * 0.028`(4000px → 112px,在 100% 查看时肉眼清晰)

### 1.3 "竖横不自适应"的根因

- Polaroid 横图套"下厚上薄":合理,模仿宝丽来相纸本身
- Polaroid 竖图套"下厚上薄":**也合理**,但底边比例需再压缩(因为竖图高度已经很大)
- Film-border 横图"左右等宽 + 底部参数行":OK
- Film-border 竖图"左右等宽 + 底部参数行":**参数行过窄** — 文字会溢出或缩得极小。
  竖图应当把参数移到**图像右侧垂直排列**(像胶片负片边缘孔的方向)

**修复规则**:
> 每个风格必须明确定义"横图布局"和"竖图布局"两个分支;
> 对于方形图(aspect ratio 0.95-1.05)走横图分支。

---

## 2. 设计语言(与 GrainMark 主题一致)

GrainMark 主视觉:
- 深色背景 `#05060E`,纸白 `#F5F2EA`,琥珀 `#E8B86D`(brand-amber),紫 `#7C5FE8`(brand-violet)
- 字体栈:Inter(UI)、JetBrains Mono(数字/参数)、Georgia(衬线/手写感)、
  Times New Roman(serif 备用)
- 纹理语言:**无杂讯磨砂**(不要卡通贴纸感),**近乎印刷质感**

新边框系统统一:
- **数字参数**(焦距/光圈/快门/ISO)一律 JetBrains Mono 等宽
- **相机型号**可选 Inter(现代感) / Georgia(复古) / 宋体(东方)
- 纸白底边框一律 `#F8F5EE`(稍暖白,别用纯 #FFFFFF —— 那像打印纸)
- 黑底边框一律 `#0A0A0A` + 可选真实胶片齿孔纹理

---

## 3. 风格矩阵(16 个草案,由用户筛选)

### 组 A · 极简派(无边框或窄边)

**A1. 文字底栏 · 极简(Minimal Bar)**
- 当前 `minimal-bar` 的改良版
- 底部文字条 `minEdge * 8%` 高,纸白底 `#F8F5EE`,等宽字深灰 `#2A2A2A`
- 竖图保持一致(底栏随图片同宽,不做横向压缩)
- 左:相机 + 镜头;右:f/1.4 · 1/250 · ISO 100 · 35mm
- 适合简洁 ins 风,专业摄影师首选

**A2. 双线边框(Hairline)**
- 四周 1-2px 极细线,距离图片边缘 `minEdge * 1.5%`
- 右下角小字 EXIF,与线同色
- 画廊展览气质
- 横竖图完全一致,最简朴

**A3. 漂浮小卡(Caption Card)**
- 图片无边框,右下角外接一张 `minEdge * 20%` 宽的参数卡(白底深字,带淡阴影)
- 卡片内两行:大字机型 + 小字参数
- 适合社交媒体分享(小红书/Ins)

### 组 B · 胶片摄影致敬

**B1. 135 胶片全齿孔(Film Full Border)**
- 上下两排真实尺寸齿孔(`Perforation` 图案,每齿 `minEdge * 2%`)
- 上边:相机型号 + 日期(橙红色日期戳,CanoDate 风)
- 下边:焦距 · 光圈 · 快门 · ISO(小字纸白)
- 竖图把齿孔移到左右两侧(而不是上下),真实 135 胶片竖拍逻辑
- **这个一定要有,玩家级摄影师的心头好**

**B2. 反转片挂片(Slide Mount)**
- 粗白框(类似 Kodachrome 裱装)`minEdge * 6%`
- 下边加宽 `minEdge * 9%`,标有"KODACHROME 64 · ISO 100"手写字体
- 日期(黄)在右下角
- 横竖自适应:竖图底部手写字变为两行

**B3. 胶片负片条(Negative Strip)**
- 图片上下加黑边 `minEdge * 8%`(模仿 35mm 负片裁切后的黑 ledger)
- 黑边上白字机型,下白字参数,等宽字体
- 左上角橙色数字 "24 →"(模拟胶片帧号)
- 竖图:改为左右黑边 + 参数变成垂直排列(沿右侧黑边自上而下)

**B4. 傻瓜相机日期戳(PointAndShoot Stamp)**
- 图片无边框,右下角橙红色 8-bit 点阵日期(Courier Bold,带发光)
- 大小:`minEdge * 3%`
- 这是当前 `film-timestamp` 的升级版:加字体衬线模拟老 LCD,加点发光阴影

### 组 C · 相纸/显影派

**C1. 经典宝丽来(Polaroid Classic)**
- 左右上白边 `minEdge * 4%`,下白边 `minEdge * 22%`(真实宝丽来 600 比例)
- 下白边居中 Georgia 斜体手写感文字,深灰
- 横竖都保留"下厚上薄"比例,只是**竖图底边稍压缩到 18%** 避免过高
- 可选日期戳(右下角小角)

**C2. 方形宝丽来 SX-70(SX-70 Square)**
- 只适用于 1:1 裁切的图片(若非方形则强制灰阶黑边填充为方形)
- 4 边等白 `minEdge * 8%`,底部额外 `minEdge * 20%`
- 字体 Courier Prime(老打字机)
- 复古力拉满

**C3. 接触印相 · 印相表(Contact Sheet)**
- 模拟胶卷接触印相:上边缘露出 `minEdge * 1%` 橘色"KODAK GOLD 200"胶片缎带
- 下边白纸 `minEdge * 14%`,等宽字体 6 列:机型 / 镜头 / 焦距 / 光圈 / 快门 / ISO
- 红笔手写风格选框
- 适合摄影师分享 "选片" 过程

### 组 D · 画廊/高级出版

**D1. 画册黑(Gallery Black)**
- 四周黑边 `minEdge * 6%`,底部延长到 `minEdge * 14%`
- 底部居中 Times 纸白字:大字机型 + 细字摄影师 + 日期
- 非常沉稳,适合展览、画册、奖赛提交
- 竖图同样比例,底部字变两行

**D2. 美术馆白(Gallery White)**
- D1 的反色:纸白边 `#F8F5EE`,深灰字
- 更现代、更 Ins 风

**D3. 书脊式(Spine Edition)**
- 右侧竖向黑带 `minEdge * 8%` 宽,白字垂直排列机型 + 日期
- 图片左占主体
- 竖图时带子移到底部(变横条),避免在窄图上遮太多
- 独特,辨识度高

**D4. 卡片新闻(Editorial Caption)**
- 图片下方外接一块白色"报纸 caption":左边粗体大字机型,右边参数小字
- 中间一根极细黑线分隔
- 非常杂志感

### 组 E · 概念/创新

**E1. 幻彩薄膜边框(Iridescent Border)**
- 四周 `minEdge * 2%` 薄边,用线性渐变模拟宝丽来 i-Type 防伪膜彩虹纹
- 高级感、年轻向
- 参数字在右下角

**E2. 拍立得 · 徕卡联名向(Contax-Style Label)**
- 底部黑条,左边大字白底红斜杠"SUMMICRON"风格 Logo 位(**用户自上传,不内置品牌**)
- 右边等宽字参数
- 致敬经典旁轴排版,用户可换 Logo

### 组 F · EXIF 数据可视化派(创新向)

**F1. 光圈环图(Aperture Ring)**
- 图片右下角小圆圈,刻度标注当前光圈值
- 其它参数围绕圆圈环形排列
- 数据可视化美学,独一份

**F2. 打字机条(Typewriter Strip)**
- 图片底部 `minEdge * 6%` 纸白条,**每个字母略有纵向抖动**(模仿机械打字机压印)
- IBM Selectric 风字体
- 暖调

---

## 4. 横竖自适应规则表

统一原则(所有风格都要遵守):

| 规则 | 横图(aspect > 1.05) | 竖图(aspect < 0.95) | 方形(0.95-1.05) |
|---|---|---|---|
| 主文字方向 | 水平 | **视风格而定**:B3 竖排,其它仍水平 | 水平 |
| 下边框比例 | 按风格设计 | 通常压缩 15-20% 避免总高失衡 | 按风格设计 |
| 多列参数布局 | 横向一行 | **可改两列** 或 **堆叠换行** | 横向 |
| 日期戳位置 | 右下角 | 右下角 | 右下角 |
| Logo 位置 | 左下(留白最多) | 左下;若底部太窄,移到右上 | 左下 |

自动决策流程(设计实现时用):
```
const isPortrait = imgH > imgW * 1.05
const isLandscape = imgW > imgH * 1.05
const minEdge = Math.min(imgW, imgH)

// 单位缩放因子 —— 所有"像素常数"都乘以 u
const u = minEdge / 1000  // 1000px 短边对应 u=1,任意分辨率线性缩放
```

---

## 5. 数据模型改造

### 5.1 类型重构(shared/types.ts)

```ts
// 旧:WatermarkTemplateId 只有 7 个枚举,扩展难
// 新:FrameStyleId 使用字符串 ID + 注册表,便于后续加新风格
export type FrameStyleId =
  // 极简派
  | 'minimal-bar' | 'hairline' | 'caption-card'
  // 胶片派
  | 'film-full-border' | 'slide-mount' | 'negative-strip' | 'point-and-shoot-stamp'
  // 相纸派
  | 'polaroid-classic' | 'sx70-square' | 'contact-sheet'
  // 画廊派
  | 'gallery-black' | 'gallery-white' | 'spine-edition' | 'editorial-caption'
  // 概念派
  | 'iridescent' | 'contax-label'
  // EXIF 可视化
  | 'aperture-ring' | 'typewriter-strip'

// 同一 style 对应不同朝向的布局描述
export interface FrameLayout {
  // 边框几何(比例形式,乘 minEdge 得到像素)
  borderTop: number
  borderBottom: number
  borderLeft: number
  borderRight: number
  // 内容区(参数/Logo/日期)位置:以归一化坐标描述
  contentSlots: Array<{
    id: 'params' | 'model' | 'date' | 'logo' | 'artist'
    area: 'top' | 'bottom' | 'left' | 'right' | 'overlay'
    anchor: { x: number; y: number }  // 0..1
    fontSize: number                   // 乘 minEdge
    align: 'left' | 'center' | 'right'
    fontFamily: 'inter' | 'mono' | 'georgia' | 'courier' | 'typewriter'
  }>
  backgroundColor: string              // 边框颜色
  accentColor?: string                 // 日期戳/重点色
}

export interface FrameStyle {
  id: FrameStyleId
  // 横竖布局分离 —— 核心新增
  landscape: FrameLayout
  portrait: FrameLayout
  // 用户可调项
  overrides: {
    showFields: Record<EXIFField, boolean>
    artistName?: string
    logoPath?: string
    colorScheme?: 'default' | 'light' | 'dark'  // 部分风格支持黑白反转
  }
}
```

### 5.2 路由/命名重构

- **保留** `/watermark` 路由,但增加 Tab:
  - Tab 1 "边框风格" Frame Styles(新主体)
  - Tab 2 "单水印/Logo" Watermark Only(覆盖式水印,不改变画面尺寸)
- **拆分 IPC**:
  - `frame:templates` / `frame:render` — 新(完整边框)
  - `watermark:overlay` — 保留(仅覆盖在图上的简单水印)
- 向后兼容:旧 `watermark:render` 路由到 `frame:render` + 读 FrameStyleId 映射表

---

## 6. 前端预览重做(解决"切换无效")

### 6.1 组件架构

```
src/components/frame/
  FramePreviewHost.tsx         // 接受 style+photo,按 layout 数据绘制
  layouts/
    PolaroidLayout.tsx         // 一个 .frame-border CSS + 图片 img
    FilmBorderLayout.tsx
    SpineEditionLayout.tsx
    ... (一个风格一个组件)
  FrameStyleRegistry.ts        // style id → layout 组件映射
```

每个 Layout 组件接受 `{ photo, style, containerWidth }`,独立计算所有百分比尺寸并渲染 DOM。
**预览层 100% 用 CSS 模拟 Sharp 的 SVG 输出**(字体/行高/padding 都 pixel-perfect 对齐),
在"导出前"用户可以点一次 "高保真预览" 触发真实 Sharp 渲染做最终对比。

### 6.2 visualRegression 基线

每个风格必须有 4 个 visual baseline:
- 16:9 横图 · 1:1 方图 · 3:4 竖图 · 9:16 竖图
- 基线图放 `tests/e2e/visualRegression.spec.ts-snapshots/`

---

## 7. 后端渲染器重构

`electron/services/watermark/renderer.ts` 重做:

```
electron/services/frame/
  registry.ts                  // FrameStyleId → 生成器函数
  generators/
    polaroid.ts                // generatePolaroid(ctx): SVG
    filmFullBorder.ts
    ...
  typography.ts                // 统一字体栈、字号计算
  layoutEngine.ts              // 横竖自适应 + 坐标计算
  textRenderer.ts              // 文字自动断行/省略/超宽适配
  composite.ts                 // Sharp composite + Logo 嵌入
```

核心 API:
```ts
renderFrame(photoPath: string, style: FrameStyle): Promise<Buffer>
listFrameStyles(): FrameStyle[]   // 内置 16 种
```

### 7.1 关键实现点

- **所有尺寸走 `u = minEdge / 1000`**,不用像素常数
- **字体 fallback**:主进程用 `fontconfig`(Linux)/系统字体(Mac),缺字时回退到 Inter
- **文字截断**:参数行超过可用宽度时,自动省略较低权重字段(顺序:GPS → artist → datetime → lens → ...)
- **Logo 渲染**:用户上传的 PNG/SVG 经 Sharp 读入,限制最大 2048×2048,过滤 SVG 中的 `<script>`
- **颜色管理**:JPEG 输出始终 sRGB,Polaroid 白用 ICC 定义的 `#F8F5EE` 而不是 #FFFFFF

---

## 8. 请用户决策的问题清单

### Q1. 16 个风格保留哪些?

推荐分档:
- **必保留(8 个核心)**:
  Minimal Bar、Hairline、Film Full Border、Polaroid Classic、Gallery Black、
  Gallery White、Editorial Caption、Spine Edition
- **可选精选(4 个,视用户偏好)**:
  SX-70 Square、Negative Strip、Point-and-Shoot Stamp、Contax Label
- **实验性(4 个,可先不实现)**:
  Caption Card、Iridescent、Aperture Ring、Typewriter Strip、Slide Mount、Contact Sheet

> 请用户勾选/打叉,或直接指定最终保留的 N 个。

### Q2. 命名定位

- **方案 A**:仍叫"水印"(零迁移成本,用户已熟悉)
- **方案 B**:改叫"边框"(更贴切,但 Sidebar/Settings/IPC/批处理都要改,迁移成本大)
- **方案 C**:Sidebar 改"边框",但内部保持 `watermark` IPC 兼容(折中)

> 推荐 C。

### Q3. 预览策略

- **方案 A** CSS 模拟 + "高保真"按钮触发 Sharp(推荐)
- **方案 B** 每次改参数都调 Sharp(最准但慢)

### Q4. 横竖强制?

- 当用户在横图上选了"纯竖图风格"(如 Spine Edition 右侧竖带),怎么处理?
  - **方案 A** 自动切成横图版本
  - **方案 B** 提示"该风格竖图更佳"但允许强制使用
  - **方案 C** 每个风格必须两个版本都实现,无强制

> 推荐 C,由设计方自行保证两种版本都美观。

### Q5. 设计 token 统一

是否接受新增 `src/design/frame-tokens.ts` 集中定义:
- 纸白色 `#F8F5EE`
- 胶片黑 `#0A0A0A`
- 橙红数字戳 `#FF6B00`
- Polaroid 底边比 `0.22`
- 画廊底边比 `0.14`
…… 让设计改动只改一个文件。

---

## 9. 实施阶段拆分(用户确认方案后执行)

**阶段 1 · 基础设施**(1 commit)
- 新增 `electron/services/frame/` 目录结构
- 新增 `src/components/frame/` 骨架
- 新增 `FrameStyle` 类型 + registry
- 保留老 `WatermarkTemplate` 做 shim 兼容

**阶段 2 · 前 4 个核心风格**(每风格 1 commit)
- Minimal Bar(改造)
- Polaroid Classic(重做)
- Film Full Border(新)
- Gallery Black(新)
每 commit:Sharp 实现 + CSS 预览 + 16:9/1:1/3:4/9:16 四个 snapshot

**阶段 3 · 其余风格**(按用户决定的保留数)

**阶段 4 · 迁移清理**
- 旧 `renderer.ts` 老模板移到 legacy 目录
- Settings/Batch 的 `watermarkTemplateId` 迁移为 `frameStyleId`
- 文档更新

每一阶段独立可交付,可暂停。

---

## 10. 预计工作量

- 基础设施(阶段 1):~600 LOC 新增
- 每个风格:~150 LOC(Sharp 生成器 + React 预览 + snapshot 基线)
- 16 个风格全做:~3000 LOC 新增
- 实施时 tsc/biome/vitest 三道门禁 + 蓝军 mutation 每阶段复跑

---

## 11. 附:与 AGENTS.md 的对照

- **第 1 条方案合理**:本文件即方案,用户确认后再动手
- **第 3 条安全兜底**:Logo 路径走 PathGuard,SVG 文本 XML 转义(老 renderer 已有,继续保留)
- **第 4 条测试价值**:每个风格 visual baseline 用 pixelmatch 防回归,不做"空存在性断言"
- **第 8 条 Single Source**:所有尺寸走 `u = minEdge / 1000`,横竖布局两个数据体;字体/颜色走 design token
- **第 9 条缓存契约**:若加渲染缓存,key 用 `photoPath + mtime + styleId + overridesHash`,版本号 bump

---

**等用户回复 Q1-Q5 后,立即进入阶段 1。**
