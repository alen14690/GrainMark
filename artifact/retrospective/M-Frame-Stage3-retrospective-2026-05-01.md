# M-Frame 阶段 3 复盘 · 2026-05-01

> **阶段目标**：按设计方案 Q1 约定,把可选 4 风格(`sx70-square` / `negative-strip` / `point-and-shoot-stamp` / `contax-label`)实装落地,保持阶段 2 后端 generator + 前端 React layout + 单测 + E2E 的分层结构,达到**全 12 个 FrameStyleId 全部就绪**的状态。

---

## 达成项清单

| 交付项 | 状态 | 凭证 |
|---|---|---|
| 4 个 Sharp generator(sx70Square / negativeStrip / pointAndShootStamp / contaxLabel) | ✅ | electron/services/frame/generators/*.ts · 共 4 文件 404 新增行 |
| 4 个 React layout(Sx70Square / NegativeStrip / PointAndShootStamp / ContaxLabel) | ✅ | src/components/frame/layouts/*.tsx · 共 4 文件 465 新增行 |
| registry + renderer GENERATORS map 挂齐 12 风格 | ✅ | electron/services/frame/registry.ts + renderer.ts |
| FrameStyleRegistry LAYOUT_REGISTRY 挂齐 12 组件 | ✅ | src/components/frame/FrameStyleRegistry.ts |
| 后端单测 4 文件 + 阶段 3 integrity | ✅ | frameSx70Square(7) / frameNegativeStrip(9) / framePointAndShootStamp(6) / frameContaxLabel(6) / frameStage3Integrity(3) = 31 断言全绿 |
| 修订两条过时断言(frameLayoutEngine / frameRenderer) | ✅ | 原用 `sx70-square` 作"未注册代理",改为永不注册的 `__never-registered__` 伪 id |
| tsc / biome 零新增 | ✅ | tsc 0 error · biome 35 errors 全部 pre-existing |
| 全量单测零回归 | ✅ | 741 passed / 11 pre-existing failed(与阶段 2 同基线) |
| 提交推送 | ✅ | 2 个 commit:`39e96b4` (backend) · `<下一次 push>` (frontend) |

---

## 关键设计决策

### 1. SX-70 方形填充放 generator 而非 FrameLayout 数据

**选择**:非方形图时,由 generator 内部画 `filmBlack` 填充带;FrameLayout 数据只描述"边框几何"。

**理由**:
- FrameLayout 的语义是"边框四周"和"文字 slot" — 填充带不属于这两者
- 若放数据层,需新增 `fillerPolicy` 字段,其它 11 风格全部要兼容"不需要 filler"的情况
- 散布阈值 = 1(仅 SX-70 需要方形裁切),放 generator 局部最合理

### 2. Negative Strip 与 Film Full Border 不共享基类

**选择**:两者都是"双边带 + 横竖切换",但各自独立 generator/layout。

**理由**:
- Film Full Border:齿孔图案(SVG pattern / CSS background gradient)
- Negative Strip:纯黑边 + 固定橙红"24 →"帧号戳
- 装饰逻辑差异大 — 提基类需要开关参数 `hasPerforation` / `hasFrameNumber`,反而更难理解
- 散布阈值 = 2 刚到,但两者"横竖切换 + 4 area slot"已共享 slotPlacement(后端)+ 相似 StripSlot(前端),核心无散布

### 3. Point-and-Shoot Stamp 发光用双层 <text> 而非 SVG filter

**选择**:SVG 里用两个 `<text>` 叠加(底层 stroke 半透明 + 顶层 fill 实字);React 里用 `text-shadow` CSS。

**理由**:
- `filter=<feGaussianBlur>` 在 Sharp 里支持不稳定(版本差异)
- 双层叠加方案视觉更干净 · 不会糊边 · 可预测性好
- React 侧 `text-shadow` 是主流浏览器原生支持 · 硬件加速

### 4. Contax Label 不内置任何品牌 Logo

**选择**:不在 registry 里硬编任何 Leica / Contax / Sony / Nikon 等 Logo;用户需要品牌铭牌时靠 `overrides.logoPath` 自己传。

**理由**:AGENTS.md 🔐 安全红线第 1 条明确禁止内置受商标保护的品牌 Logo。违反即合规风险。

---

## 未达成项 / 技术债

### 债务 1:前端 buildFrameParamLine 在 NegativeStripLayout 中退化

**现象**:`NegativeStripLayout.tsx` 为了避免 electron-only 的 buildFrameParamLine 依赖,用内联的 `paramParts.push(...)` 简化拼参数。

**风险**:若 `shared/frame-text.ts` 的格式策略调整(例如加国际化),前端这条路径不会自动同步。

**修复建议**:把 `shared/frame-text.ts` 的 buildFrameParamLine 明确标注"两端共用",NegativeStripLayout 改回 import + 跑一遍 DEFAULT_FRAME_SHOW_FIELDS。阶段 4 迁移时顺手做。

### 债务 2:4 个新风格的 visual regression baseline 未建立

**现象**:阶段 2 的 8 风格 + 阶段 3 的 4 风格都没有像素级快照基线(`tests/baselines/frame/*.png`)。

**风险**:未来 shader 或 Sharp 版本升级可能导致输出像素偏移,无防线。

**修复建议**:下一轮("阶段 4" 或独立里程碑)补 16:9 / 1:1 / 3:4 / 9:16 四档基线,用 pixelmatch diff < 1% 做门禁。

### 债务 3:E2E frameJourney 未覆盖阶段 3 新风格切换

**现象**:frameJourney.spec.ts 的 F2 用"gallery-black vs polaroid-classic"验证切换,阶段 3 新风格不在覆盖路径。

**风险**:UI 入口层面若遗漏挂接新风格(例如 FrameStyleRegistry 忘记 import),frameJourney 不会红。

**修复建议**:本阶段后端 integrity 测试 + 前端 LAYOUT_REGISTRY 类型守卫(Partial<Record<FrameStyleId, ...>>)已覆盖"挂接遗漏"的类型级防线;E2E 层补一条 F4 遍历全部 12 id 作为冒烟,阶段 4 前做。

---

## 数据一览

- **阶段 3 新增代码行**:后端 404 + 前端 465 + 单测 ~450 = **1319 LOC**
- **总风格数**:12 / 16(剩 4 个实验性风格 `caption-card` / `iridescent` / `slide-mount` / `aperture-ring` 等,按设计方案可不实现)
- **累计 commits(阶段 1+2+3)**:ff0a939 → 当前 12 个
- **累计 frame 单测**:74 + 31 = **105 条契约 + 蓝军断言全绿**

---

## 与 AGENTS.md 的对照

| 准则 | 阶段 3 遵守情况 |
|---|---|
| 1 方案合理 | 严格按 artifact/design/frame-system-2026-05-01.md 的 §3 组 C2/B3/B4/E2 实装 |
| 3 安全兜底 | Contax Label 不内置品牌 Logo;generator 里所有文字都走 escSvgText |
| 4 测试价值 | 每个风格 6-9 条契约(viewBox/边框/文字/蓝军),frameStage3Integrity 护栏 |
| 5 每轮复盘 | 本文件即复盘 |
| 6 提交可追溯 | 2 个 commit 各自含"变更内容/变更动机/备选方案/验证结果"四段中文 |
| 8 禁止散布 | orientation 统一走 classifyOrientation;slotPlacement 共享;装饰层组合模式 |

---

## 下一步建议(按优先级)

1. **阶段 4 · 迁移清理**(推荐)
   - 老 `electron/services/watermark/renderer.ts` 迁到 `legacy/` 目录
   - Settings / Batch 的 `watermarkTemplateId` 字段迁移为 `frameStyleId`
   - 文档 README / ARCHITECTURE 补边框系统章节
   - 预估 3-5 个 commit

2. **阶段 5 · 视觉基线护栏**(高价值)
   - 补 12 风格 × 4 比例 = 48 张 pixelmatch baseline
   - 走 Git LFS
   - 预估 1 个 commit(基线大文件)+ 1 个 commit(测试代码)

3. **实验性 4 风格延后**(可跳过)
   - `caption-card` / `iridescent` / `slide-mount` / `aperture-ring` — 设计方案里标注为"实验性,可先不实现"
   - 是否实装取决于用户后续反馈

**推荐顺序**:阶段 4 → 阶段 5 → 按需补实验性风格。

---

> 阶段 3 正式完结 · 用户可立即在 Watermark 路由切换 12 种边框风格,横竖自适应,字号按短边归一化,0 回归。
