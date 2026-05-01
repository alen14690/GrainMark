# tests/README.md — 测试资产索引

> 生成时间：2026-04-26 · 对应 main @ 测试瘦身后（37 文件 · 466 例）  
> Pass T1（2026-05-01 更新）：新增 E2E 基础设施 + 冒烟用例（5 例真 Electron 启动）  
> 本索引的唯一目标：**让下次写新测试前能先看到"这块是否已有人测过"，避免重复覆盖与凑数**

---

## 🎯 测试金字塔

```
                ┌───────────────┐
                │ Packaged Smoke│  release only
                ├───────────────┤
                │      E2E      │  PR/main only
                ├───────────────┤
                │ Integration   │  CI + local
                │ (Playwright)  │
                ├───────────────┤
                │ Image Snapshot│  shaderSnapshots.test.ts
                ├───────────────┤
                │  Unit × 36    │  vitest · 本仓库 95% 的测试在这一层
                ├───────────────┤
                │ Type Check    │  tsc --noEmit · 每次保存
                │ Lint          │  biome · 每次保存
                └───────────────┘
```

## 📐 分层原则（AGENTS.md 准则 4 · 2026-04-26 修订）

| 层 | 强度要求 | 禁止形式 |
|---|---|---|
| 核心算法（engine/shader/pipeline） | 每个 shader 必须 ≥1 perceptibility + ≥1 snapshot | 源码字面值断言 |
| 状态层（store/IPC/schema） | 合约 + 边界 + mock 隔离 IO | 白断言 |
| 安全红线 | 威胁回归必覆盖 | — |
| UI / 设计 token / 简单工具 | 只测真实 edge case；无覆盖率要求 | 测常量值、存在性断言 |

---

## 📚 37 个测试文件职责表

### 🎨 核心算法层（11 文件 · ~220 例）

| 文件 | 职责（唯一） | 关键防线 |
|---|---|---|
| `perceptibility.test.ts` | 滑块档位 → 典型像素 Δ 是否达人眼可感知 | **防"测试全绿但用户无感"** · 黄金标准 |
| `shaderSnapshots.test.ts` | 10 shader × 100×100 baseline PNG 像素级稳定 | 防 shader 数学静默漂移 |
| `sliderMapping.test.ts` | `mapRatioToValue ↔ mapValueToRatio` 互逆 + ease-center 曲线 | Lightroom 化响应 |
| `sliderPipelineChain.test.ts` | UI action → editStore → pipelineToSteps 链路 | 防 is*Identity 误判把非零当恒等 |
| `shadersPass3b.test.ts` | normalize* 边界 + is*Identity + pipelineToSteps 顺序 + LUT3D | fast-path skip 契约 |
| `pipelineSharp.test.ts` | CPU 兜底 pipeline 真实 sharp 烘焙各通道输出 | RAW fallback 路径 |
| `histogram.test.ts` | 直方图计算 + 统计量 | Histogram UI 数据源 |
| `shaderLut3d.test.ts` | 17³ / 33³ LUT 采样正确性 + intensity 插值 | LUT3D 专用 |
| `webglEngine.test.ts` | WebGL 引擎：shader 链接 / uniform 绑定 / FBO ping-pong | 若 shader 少 uniform 编译即红 |
| `cubeParser.test.ts` | .cube 文件解析 + 非法格式拒绝 | LUT 导入前哨 |
| `colorMatchers.test.ts` | rgbToLab + 自写 jest matchers | `toBeInLabRange` 等自证 |

### 💾 状态 / 数据层（11 文件 · ~150 例）

| 文件 | 职责 | 关键防线 |
|---|---|---|
| `editStore.test.ts` | patch 合并 / setTone(null) 清通道 / 历史幂等 / 深拷贝独立 | 编辑状态核心 |
| `editorUndoRedo.test.ts` | 用户行为链：3 次拖滑 + 撤销到初始 + 重做 + future 清空 | 撤销重做契约 |
| `filterStore.test.ts` | user/builtin 分区 + saveFilter 往返 + delete builtin 拒绝 | 滤镜持久化 |
| `filterOrder.test.ts` | 三级分组 + category 聚类 + popularity 稳定排序 | Editor 滤镜列表 |
| `photoStoreRepair.test.ts` | thumbPath/width/height 缺失修复调度（mock 隔离） | 启动懒补触发条件 |
| `repairPhotoOrientation.test.ts` | sharp 实打实方向翻转校验（wide/tall/square） | Sony A7S3 ARW 竖拍修复 |
| `photoStoreRemove.test.ts` | 只删记录不动硬盘原图 + fs.unlinkSync spy 防越界 | **安全契约** |
| `cacheSweeper.test.ts` | preview-cache LRU 水位 + thumb 孤儿清理 + 路径守卫 | **启动 GC 安全契约** |
| `jsonTable.test.ts` | KV 存储读写 + 并发 upsert | storage 基础 |
| `rawCache.test.ts` | LRU 命中 / 淘汰 / 磁盘预算 | RAW 解码缓存 |
| `rawDecoder.test.ts` | 多格式 RAW（ARW / NEF / CR2）解码 | RAW 主路径 |
| `resolvePreviewBuffer.test.ts` | RAW + PSD + JPG + 降采样策略 | preview 统一入口 |

### 🖼 渲染 / 预览（2 文件 · ~10 例）

| 文件 | 职责 | 关键防线 |
|---|---|---|
| `renderPreview.test.ts` | pipelineOverride 真正消费 + preview-cache 写入 + fetch 兜底 | Editor 调参对 RAW 生效 |
| `exifReader.test.ts` | exifr 解析 orientation / make / model | EXIF 元数据入口 |

### 🔐 安全红线（4 文件 · ~35 例 · **不得动**）

| 文件 | 职责 | 关键防线 |
|---|---|---|
| `security/pathGuard.test.ts` | 符号链接攻击 + 路径越界 + 受控目录解析 | 🔴 不得动 |
| `security/imageGuard.test.ts` | 图片头校验 + 尺寸 DoS 兜底 | 🔴 不得动 |
| `security/cubeIO.test.ts` | .cube IO 越界 + 文件大小限制 | 🔴 不得动 |
| `logger.test.ts` | token/apiKey/password 脱敏 + home dir tildify + 循环引用 | 🔴 不得动 |

### 🪜 UI / 快捷键 / 菜单（5 文件 · ~38 例）

| 文件 | 职责 | 关键防线 |
|---|---|---|
| `globalHotkeys.test.ts` | resolveHotkey（macOS metaKey vs Win ctrlKey + Alt/Shift 屏蔽） | 跨平台热键 |
| `appMenu.test.ts` | Electron 菜单模板 + Preferences/Settings 分平台 + webContents.send | 主进程菜单契约 |
| `grainUrl.test.ts` | grain:// 协议 URL 生成 + cache-bust 版本号映射 | WebContents cache 绕开 |
| `photoCardAspect.test.ts` | clampAspect（超宽/超竖/NaN/负数/Infinity） | 图库网格不崩 |
| `ipcSchemas.test.ts` | Zod schema 越界 + DoS + 类型拒绝 | **IPC 边界总哨** |
| `llmIpcSchemas.test.ts` | LLM 配置 schema：apiKey CRLF 注入 / 长度 / 提供商白名单 / strict 未知字段 | **LLM 配置安全边界** |
| `llmConfigStore.test.ts` | apiKey 绝不泄漏公开视图 + patch 合并语义（null 清空 / undefined 保留）+ vault 不可用抛错 | **apiKey 凭证安全红线** |
| `preloadChannelPattern.test.ts` | preload 白名单正则契约副本，新增 prefix 时同步回归 | IPC 通道注入防御 |

### 🧰 通用工具（3 文件 · ~15 例 · 精简后）

| 文件 | 职责 | 备注 |
|---|---|---|
| `namingTemplate.test.ts` | 命名模板变量替换（{name}/{filter}/{date}）+ 非法字符拒绝 | 批处理命名 |
| `designTokens.test.ts` | 聚合对象结构契约（designTokens 子集、slider/histogram 语义 token） | **只测结构不测具体数值** |
| `designUtils.test.ts` | clamp / fmtSigned / mapRange 的 edge case | **只测 NaN/退化区间** |

### 🏛 业务契约（1 文件 · 2 例）

| 文件 | 职责 | 备注 |
|---|---|---|
| `builtinPresets.test.ts` | 所有内置 preset 通过 FilterPresetSchema + id 唯一 | **Schema 校验一笔带过** |

---

## 🚫 已删除的测试（谨防复写）

| 文件 / 用例 | 删除原因 | 替代防线 |
|---|---|---|
| `motion.test.ts`（全文件） | 测预设存在 + 字符串拼接格式，无 bug 意义 | TS 类型已保证 |
| `designTokens.test.ts` 原 14 例中 11 例 | 测常量值（`#05060E`, `'8px'`），改值不是 bug | 结构契约 3 例已够 |
| `designUtils.test.ts` 原 13 例中 9 例 | 测 "1+1=2" 类恒等行为 | edge case 4 例已够 |
| `builtinPresets.test.ts` 原 5 例中 3 例 | 测 "有 30 个"、"source=builtin" 白断言 | Schema parse 一次性覆盖 |
| `shadersPass3b.test.ts` 原 47 例中约 19 例 | 测 shader 源码字面值（`toContain('u_image')`、`不含 #version`） | `webglEngine.test.ts` 实际编译 + `perceptibility.test.ts` 像素级抓 |
| `repairPhotoOrientation.test.ts` v1-migrate | 白断言 `ver ≤ 2 && ver ≥ 1` 永真 | `photoStoreRepair.test.ts` 覆盖 normalizeDimsVersion |
| `sliderPipelineChain.test.ts` 原 26 例 | 每滑块单独写一条，样板过多 | table-driven 合并到 21 例 |

---

## ✍️ 新增测试前的自查清单

1. 我要防的是哪个**具体 bug 模式**？能用 1-2 句话描述吗？
2. 这条 bug 模式是否**已有测试覆盖**？（先搜本索引再写）
3. 失败时错误信息能否**直接定位**到代码位置？（避免"某测试红了但看不出在哪"）
4. 这个测试会**在什么真实场景下红**？（红了代表用户可见问题 or 只是代码风格变了？）
5. 这个测试的**维护成本**是否合理？（简单工具函数不值得 20 行测试）

**任一答"否"或"不清楚" → 不要写这个测试**。

---

## 🚀 E2E 基础设施（Pass T1-T2 · 2026-05-01）

### 目录结构

```
tests/e2e/
├── _support/                     # 共享 fixture（非 spec，playwright 不拾取）
│   ├── launchApp.ts              # 启动真 Electron + 隔离 userData + 等 preload 就绪
│   ├── grainInvoke.ts            # page 内类型化 IPC 调用 helper
│   ├── seedFixtures.ts           # 把 tests/fixtures/images 注入到 photoStore（默认 reload 让 zustand 看到）
│   └── selectors.ts              # 选择器集中表（Single Source of Truth · 第 8 条）
├── smoke.spec.ts                 # T1 冒烟：启动 + Sidebar + 路由切换（5 例）
└── editorJourney.spec.ts         # T2 用户旅程：导入→Editor→滤镜→滑块→Undo→切回原图（6 例）
```

### 运行

```bash
npm run build                     # 必须先构建 dist-electron/main.js
npm run test:e2e                  # 运行全部 E2E（11 例，~6s）
npx playwright test --project=e2e smoke.spec.ts           # 只跑冒烟
npx playwright test --project=e2e editorJourney.spec.ts   # 只跑用户旅程
```

### 核心设计决策

1. **testid 命名规则**（UI 侧硬编码，测试侧集中查询）
   - Sidebar 导航：`nav-${route}`（如 `nav-library`、`nav-settings`）
   - Library：`library-root`、`photo-grid`、`photo-card-${id}`、`import-photos-btn`
   - Editor：`editor-root`、`editor-undo-btn`、`editor-redo-btn`、`editor-export-btn`、`preview-canvas`、`editor-tab-filters`、`editor-tab-adjust`、`filter-row-${id}`（原图用 `filter-row-original`）
   - Slider：**不加 testid**，走 `getByRole('slider', { name: label })`；aria-label 已由设计系统提供

2. **选择器散布阈值 = 1**：所有 Playwright 选择器收敛到 `tests/e2e/_support/selectors.ts`，UI 改名时只改本文件

3. **隔离 userData**：每个 E2E run 在 `os.tmpdir()` 下创建独立 userData 目录（`GRAINMARK_USER_DATA` env），不污染开发用户数据

4. **PathGuard 配合**：fixtures 拷到 `os.tmpdir()` 下（命中 main.ts 默认白名单 `app.getPath('temp')`），不需要给 guard 开测试后门

5. **不从 WebGL canvas 取像素** ⚠：Editor 的 `useWebGLPreview` 使用 `preserveDrawingBuffer: false`（性能决策，见 `src/lib/useWebGLPreview.ts:362`），任何 `canvas.toDataURL/getImageData/drawImage` 都不稳定。Pass T2 用**可观测 DOM 状态**断言（aria-valuenow、EDITED badge、filter 高亮态、按钮 enabled）；像素级验证交给 **Pass T3 visual regression**（Playwright `toHaveScreenshot` 走合成层抓图，不受 preserveDrawingBuffer 影响）

### 新增 E2E 用例前自查

除通用 5 条外，还需：

6. 失败时能否 **仅通过截图 + error-context.md 定位**？（playwright 自动附件）
7. 是否对**真实副作用**断言（磁盘文件 / 像素 / IPC 回调），而不是只看 DOM 存在？
8. 用例启动代价 ≤ 2s？（否则应合并到同一 `describe` 共享 Electron 实例）
9. 给高风险改动做过**蓝军 mutation 验证**（手工破坏一次断言确认真能红）？

