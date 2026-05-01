# M-Frame 阶段 2 复盘 · 2026-05-01

> 设计方案:`artifact/design/frame-system-2026-05-01.md`
> 阶段 1 retrospective:本次合并到阶段 2 复盘里(阶段 1 只是基础设施骨架,无独立达成项)

---

## 里程碑

| 阶段 | Commit | 交付物 |
|---|---|---|
| 阶段 1 骨架 | `ff0a939` | FrameStyle 类型 + shared/frame-tokens + 基础 IPC + 骨架组件 + 单测 |
| 阶段 2.1 Minimal Bar | `01d5951` | 第一个完整风格 + 首次打通 SVG + CSS 预览链路 |
| 阶段 2.2 Polaroid Classic | `dab288e` | 真实宝丽来 600 比例 + Georgia 斜体 |
| 阶段 2.3 Film Full Border | `7db9677` | 135 齿孔 + 横竖朝向切换(第一个朝向敏感风格) |
| 阶段 2.4 Gallery Black/White | `8251a2b` | 双胞胎 + bottomTextGenerator 工厂提取 |
| 阶段 2.5 Editorial Caption | `f450856` | 分隔线 + 工厂 topSeparator 选项 |
| 阶段 2.6 Spine Edition | `64dca9e` | 底带/右带 + slotPlacement 工具提取 |
| 阶段 2.7 Hairline | `9439d37` | 细线框 + overlay 文字 + Stage2 完整性契约 |
| 阶段 2.8 Watermark 接入 | `c7ad90c` | FramePreviewHost 接入 + E2E frameJourney |

---

## 达成项 vs 未达成项

### ✅ 达成

1. **必保 8 风格全部实装**(原计划即 8 个):
   - Minimal Bar / Polaroid Classic / Film Full Border / Gallery Black / Gallery White /
     Editorial Caption / Spine Edition / Hairline
2. **三大痛点根治的真实证据**:
   - "切换无效":E2E F2 验证 data-frame-style-id + data-frame-orientation +
     data-frame-status 三重断言,蓝军 mutation 实证可捕获回归
   - "粗糙":所有尺寸走 `scaleByMinEdge(ratio, minEdge)`,24MP 图不糊
   - "竖横不分":Film Full Border 齿孔切边 / Spine Edition 底带切右带,
     横竖双 FrameLayout 数据驱动,frameStage2Integrity 契约护栏防遗漏
3. **零退化**:老 watermark:render / WatermarkStyle / Editor exportWatermark /
   Batch watermarkTemplateId / Settings watermark 全部保留,E2E 10 条老用例全绿
4. **架构卫生**:
   - 通用 slot 渲染提取到 slotPlacement(覆盖 5 种 area)
   - 底部文字工厂 bottomTextGenerator(Gallery 双胞胎 + Editorial 共享)
   - 前端 BottomTextLayout 通用组件(Gallery 双胞胎共用)
   - 双源共享:shared/frame-tokens + shared/frame-text,前后端零散布
5. **E2E 新增 3 条(frameJourney)**:从 10 条扩到 13 条

### ⚠️ 未达成(转阶段 3/4)

1. **4 个可选风格未实装**:SX-70 Square / Negative Strip /
   Point-and-Shoot Stamp / Contax Label —— 用户可决定是否进入阶段 3
2. **Visual regression baseline 未建**:原计划每风格 4 比例(16:9/1:1/3:4/9:16)
   共 32 张 baseline,本阶段用语义 SVG 契约 + E2E DOM 契约替代,未跑 pixelmatch
   - 实际原因:baseline 维护成本 vs 语义契约 + 蓝军实证的收益比,选了后者
3. **老 watermark 系统下线**:转阶段 4 统一迁移(Editor/Batch/Settings 6+ 处消费者)

---

## 未达成的原因分析

### 4 个可选风格未做

- 阶段 2 的"必保 8"是用户在 Q1 里**明确勾选的优先级**
- 可选 4 个等待用户审视必保 8 的实际效果后再决定

### Visual baseline 没建

- **主动取舍**:4 张基线 × 8 风格 × macOS/Linux/Win3 平台 = 96 张 PNG,全走 LFS
- 每次改 token 可能触发大面积 baseline 回归,维护成本高
- 本阶段用"**语义契约 + 蓝军 mutation 验证**"替代,实证证明契约有牙:
  - 蓝军 7 次全部红了应红项(Minimal Bar viewBox / Film 齿孔方向 / Polaroid
    Georgia italic / Editorial 分隔线 / Spine rotate / Hairline 线数 /
    FramePreviewHost 组件分派)
- 阶段 4 迁移老系统时,若需像素锁死,可按需补 baseline(最多 4 张×保留 N 风格)

---

## 发现的技术债 / 风险

### 债务 A:PolaroidClassicLayout 没接入 BottomTextLayout 通用组件

- 原因:Polaroid 在 Gallery 之前做,当时还没抽 BottomTextLayout
- 风险:低 —— Polaroid 的行为已被 7 条单测锁定
- 处理建议:阶段 3 任一 commit 顺手重构,预期零外部行为变化

### 债务 B:frameJourney.spec.ts 的 F3 在 mutation 下会因 F2 timeout 连锁失败

- 原因:Playwright 多测试共享 launched app,F2 超时占 30s 让 F3 无法切 Tab
- 风险:中 —— 本身不是伪绿(F2 先红已经暴露问题),但 F3 的信号意义被稀释
- 处理建议:给 F2 加 per-click `timeout: 5000`,避免 30s 阻塞;或把 F3 移到独立 `test.describe.serial` 组

### 债务 C:FrameStyleOverrides 的 artistName 在 UI 里只对 Gallery 有效,但其它风格都接受同样的 overrides

- 原因:FrameStyleOverrides 是全局 schema,没区分"哪个字段对哪个风格生效"
- 风险:低 —— 用户输入 artistName 对 Minimal Bar 无视觉影响,不会崩
- 处理建议:阶段 4 可考虑让 FrameStyle 声明"支持的 overrides 子集",UI 按 schema 显隐

### 风险 A:Polaroid 竖图底边 18% 在 9:16 极瘦竖图上仍偏高

- 原因:18% 是设计方案的平衡值,但没验证极端比例(9:16 或 1:2)
- 建议:阶段 4 用户实际使用后看反馈,必要时在 registry 数据加条件表达式

### 风险 B:SVG pattern 齿孔在 Sharp 实际渲染的兼容性未实测

- 原因:本阶段单测只验 SVG 字符串含预期 <pattern>,没启动 Sharp 实渲
- 建议:阶段 3 写 1 条"用真实 fixture 跑 frame:render + Sharp 解析验证输出是 JPEG"
  的集成测试(不走像素 diff,只看 output JPEG 解码成功 + 尺寸合理)

---

## 对阶段 3/4 的调整建议

### 阶段 3(可选)· 4 个剩余风格

优先级建议:
1. SX-70 Square(1:1 裁切 + 厚白边)— 独一档方形美学
2. Point-and-Shoot Stamp(无边框 + 右下橙红日期戳)— 结构最简,1 天可完工
3. Negative Strip(上下黑边 + 胶片帧号)— 与 Film Full Border 形成互补
4. Contax Label(底部黑条 + 品牌 Logo 位)— 用户上传 Logo,需额外 UI 入口

每个风格按阶段 2 同套路:registry + generator(复用 slotPlacement/bottomTextGenerator)
+ CSS layout(复用 BottomTextLayout 或独建)+ 单测。预计每个 1 个 commit。

### 阶段 4 · 老 watermark 系统迁移下线

关键迁移点(按风险排序):
1. **Editor exportWatermark**(低风险):导出时 watermark.templateId = 'minimal-bar'
   替换为 frameStyleId + 默认 overrides
2. **Batch watermarkTemplateId**(中风险):字段改名 frameStyleId,老字段 deprecated
3. **Settings defaults**(低风险):settings.watermark.defaultTemplateId → frameStyleId
4. **WatermarkStyle / WatermarkTemplate 类型删除**(最后做):保留 shim 1 个发版周期
   给磁盘上的老 job 配置 JSON 做兼容

阶段 4 每一步都必须带独立 E2E 契约防迁移回归。

---

## 关键数值

| 指标 | 阶段 1 起点 | 阶段 2 终点 | 变化 |
|---|---|---|---|
| FrameStyle 注册数 | 1 占位 | 8 实装 | +7 |
| generator 实装数 | 0 | 7(bottomTextGenerator 工厂算 2 个实例)| +7 |
| 前端 layout 组件数 | 1 占位 | 7 实装(+ Placeholder) | +7 |
| frame 单测条数 | 24(tokens/engine/renderer) | 74 | +50 |
| E2E 用例数 | 10 | 13 | +3 |
| 蓝军 mutation 验证次数 | 2 | 9(累计)| +7 |
| 全量 vitest 通过数 | 667 | 710 | +43 |
| pre-existing 失败 | 11 | 11(0 新回归) | 0 |
| 全量 vitest 时间 | 1.9s | 2.0s | +0.1s(可忽略) |
| Playwright E2E 时间 | 8.3s | 10.5s(+3 frameJourney) | +2.2s |

---

## 与 AGENTS.md 准则的对照

| 准则 | 阶段 2 落实 |
|---|---|
| 第 1 条 方案合理 | 所有 8 风格严格按 artifact/design/frame-system-2026-05-01.md 设计方案实装 |
| 第 3 条 安全兜底 | photoPath + logoPath 都过 IPC layer PathGuard,SVG 文本 escSvgText 防注入 |
| 第 4 条 测试价值 | 74 条 frame 单测全部是"语义契约"断言(viewBox/颜色/字体/slot 数量),0 条字面量断言;9 次蓝军 mutation 全部真红 |
| 第 5 条 每轮复盘 | 本文件即阶段 2 复盘 |
| 第 6 条 可追溯 | 阶段 2 共 9 个 commit,每个 body 四段中文(变更内容 / 动机 / 备选 / 验证) |
| 第 7 条 视觉 Bug SOP | 接入 FrameHost 前先读 Watermark.tsx + 搜 watermark 全局引用,避免破坏 Editor/Batch |
| 第 8 条 禁止散布 | 主动提取 3 次工具层:slotPlacement / bottomTextGenerator / BottomTextLayout;shared/frame-tokens 和 shared/frame-text 双端共享,零散布 |
| 第 9 条 缓存契约 | 阶段 2 未引入持久缓存(每次 frame:render 都重新走 Sharp);阶段 4 可考虑在 composite 加 LRU 缓存 |

---

## 最终状态截图(文字版)

```
shared/
├── frame-tokens.ts       ← 颜色/字号/边框/字体 token 单源
├── frame-text.ts         ← 文字构建工具(前后端共享)
└── types.ts              ← FrameStyle/FrameLayout/FrameStyleId 类型

electron/services/frame/
├── composite.ts          ← Sharp composite + EXIF 读取
├── layoutEngine.ts       ← 几何计算(朝向分派 + slot 定位)
├── registry.ts           ← FrameStyle 数据注册表(8 个)
├── renderer.ts           ← 风格 id → generator 分派入口
├── typography.ts         ← SVG 文本工具(esc/fontStack/align)
└── generators/
    ├── minimalBar.ts
    ├── polaroidClassic.ts
    ├── filmFullBorder.ts
    ├── spineEdition.ts
    ├── hairline.ts
    ├── bottomTextGenerator.ts  ← Gallery B/W + Editorial 工厂
    └── slotPlacement.ts        ← 5 area 通用 slot 渲染

src/components/frame/
├── FramePreviewHost.tsx   ← 预览主机(按 id 分派组件)
├── FrameStyleRegistry.ts  ← 前端 id → 组件映射
└── layouts/
    ├── MinimalBarLayout.tsx
    ├── PolaroidClassicLayout.tsx
    ├── FilmFullBorderLayout.tsx
    ├── SpineEditionLayout.tsx
    ├── HairlineLayout.tsx
    ├── EditorialCaptionLayout.tsx
    ├── BottomTextLayout.tsx     ← Gallery B/W 共用
    └── PlaceholderFrameLayout.tsx  ← 未实装风格兜底

tests/unit/frame*.test.ts      ← 74 条契约测试
tests/e2e/frameJourney.spec.ts ← 3 条用户旅程(根治切换无效)
```

---

**阶段 2 正式完结 · 等待用户决定是否进入阶段 3(4 个可选风格)或阶段 4(老系统迁移)。**
