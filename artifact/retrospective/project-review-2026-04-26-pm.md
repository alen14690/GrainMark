# 项目全面复盘 · 2026-04-26 傍晚

> 触发点：用户反馈"测试凑数、无用功一大堆" → 需要以"真正起作用"为标准重新审视测试资产与下阶段规划
> 基线：main @ `d53fd7c` · 541 单测 · 38 测试文件 · 5814 测试行

---

## 一、用户质疑的核心

**"一些无用的测试用例就可以清除了，不要为了凑数而做事情，无用功一大堆，确实有价值，能起到作用的才保留"**

背后的真问题：
1. 测试数量从 M3-b 的 395 飙到现在的 541（+37%），但 M3.5 期间仍然漏掉了"滑块不生效"这种用户一眼就能发现的 bug
2. AGENTS.md 把覆盖率 ≥ 80% 列为准则，客观上诱导"凑数倾向"
3. 部分测试是"改了代码就红，但红了不代表真有 bug"（典型：测常量值、测源码字符串字面值、测"预设存在性"）
4. 存在大量"半无脑"测试，价值密度低，维护成本却是真实的（每次重构都要 touch）

**用户的潜台词**：与其靠数量堆防线，不如靠"能抓到真问题"的少量高价值测试 + 真实 dry run。

---

## 二、测试价值重审（38 文件 · 541 例逐项打分）

评分维度：
- ★★★ **关键防线**：曾抓到 / 能抓到真实 bug，失败即用户可见
- ★★ **契约护栏**：锁定 API / 数据契约，防隐式破坏
- ★ **低价值**：改就红 / 白断言 / 与其它测试重叠 / 测试常量
- ✗ **凑数**：纯测"存在性"、字符串字面值、无断言意义

### 2.1 GPU / 滑块算法层（★★★ 高价值，全部保留）

| 文件 | 例数 | 行数 | 评分 | 价值说明 |
|---|---|---|---|---|
| `perceptibility.test.ts` | 22 | 248 | ★★★ | 黄金标准：每条断言都对应"用户能否看到"，阈值带"旧版多少/新版多少"注释。**M3.5 滑块重构时真实抓到了退化。不动。** |
| `shaderSnapshots.test.ts` | 16 | 186 | ★★★ | 像素级 baseline，覆盖 10 个 shader。每改一次 shader 数学都必须显式更新 baseline，杜绝静默漂移。**不动。** |
| `sliderMapping.test.ts` | 11 | 104 | ★★★ | Lightroom 化响应曲线的互逆性、梯度契约、边界。`mapRatio ↔ mapValue` 反解精度 1e-5。**不动。** |
| `sliderPipelineChain.test.ts` | 21 | 231 | ★★ | 新增的链路级测试，填补 editStore→pipelineToSteps 空档。**21 例偏多，有部分可合并为 table-driven。** |
| `shadersPass3b.test.ts` | 47 | 436 | **混合** | **28 例高价值**（normalize 边界、is*Identity、pipelineToSteps 顺序、isColorGradingIdentity l=0 契约）+ **19 例低价值**（"shader 源码含 `u_image`"、"不含 `#version`"这类字面值检查）。**建议精简** |

### 2.2 核心状态层（★★★ 高价值，全部保留）

| 文件 | 例数 | 行数 | 评分 | 价值说明 |
|---|---|---|---|---|
| `editStore.test.ts` | 33 | 375 | ★★★ | 每一条都对应真实 bug 模式：patch 合并 / setTone(null) 清通道 / 历史幂等 / HISTORY_LIMIT 切栈 / 深拷贝独立。**不动。** |
| `editorUndoRedo.test.ts` | 5 | 171 | ★★ | 行为链路测试，与 editStore 互补（一个测 API 合约、一个测用户行为链）。**不动。** |
| `photoStoreRepair.test.ts` | 12 | 247 | ★★★ | thumb/dims 缺失修复调度，mock 隔离，单元级。**不动。** |
| `repairPhotoOrientation.test.ts` | 7 | 267 | **混合** | **6 例高价值**（sharp 实打实方向翻转校验）+ **1 例白断言**（`v1-migrate` 用 `expect(ver).toBeLessThanOrEqual(2).toBeGreaterThanOrEqual(1)` 基本永真）。**建议删 1 例。** |

### 2.3 IO / 业务链路（★★ 契约，保留）

| 文件 | 例数 | 行数 | 评分 | 价值说明 |
|---|---|---|---|---|
| `pipelineSharp.test.ts` | 25 | 296 | ★★★ | CPU 兜底 pipeline 真实 sharp 烘焙、每个通道的输出验证。**不动。** |
| `renderPreview.test.ts` | 6 | 242 | ★★★ | pipelineOverride 路径、preview-cache 写入、fetch 兜底。**不动。** |
| `resolvePreviewBuffer.test.ts` | 16 | 223 | ★★ | RAW 解码 + PSD + JPG 各路径。**不动。** |
| `rawDecoder.test.ts` | 14 | 140 | ★★ | RAW 解码多格式。**不动。** |
| `rawCache.test.ts` | 11 | 134 | ★★ | LRU 命中 / 淘汰。**不动。** |
| `filterStore.test.ts` | 7 | 117 | ★★ | user/builtin 分区、delete builtin 拒绝。**不动。** |
| `photoStoreRemove.test.ts` | 8 | 194 | ★★★ | 安全契约：只删记录不动硬盘原图 + fs.unlinkSync spy 防越界。**不动。** |
| `filterOrder.test.ts` | 11 | 179 | ★★ | 三级分组 + popularity 降序 + 稳定性。**不动，但是"FILTER_GROUP_META priority 严格递增"那例过弱。** |
| `ipcSchemas.test.ts` | 15 | 144 | ★★★ | Zod schema 的越界 / DoS / 类型拒绝。**不动。** |
| `jsonTable.test.ts` | 11 | 107 | ★★ | KV 存储基础。**不动。** |
| `namingTemplate.test.ts` | 23 | 111 | ★★ | 命名模板变量替换。**23 例略多，合并到 10 例足够。** |
| `histogram.test.ts` | 10 | 113 | ★★ | 直方图计算。**不动。** |
| `cubeParser.test.ts` | 12 | 143 | ★★ | .cube LUT 解析 + 错误格式。**不动。** |

### 2.4 安全（★★★ 安全红线，全部保留）

| 文件 | 例数 | 行数 | 评分 | 价值说明 |
|---|---|---|---|---|
| `pathGuard.test.ts` | — | 109 | ★★★ | 符号链接、受控目录。**绝对不动。** |
| `imageGuard.test.ts` | 12 | 115 | ★★★ | 图片头/尺寸 DoS。**绝对不动。** |
| `cubeIO.test.ts` | 7 | 79 | ★★★ | .cube 文件 IO 越界。**绝对不动。** |
| `logger.test.ts` | 6 | 66 | ★★★ | token/apiKey 脱敏、home dir tildify。**绝对不动。** |

### 2.5 UI / 快捷键 / 菜单（★★ 契约，保留）

| 文件 | 例数 | 行数 | 评分 | 价值说明 |
|---|---|---|---|---|
| `globalHotkeys.test.ts` | 13 | 117 | ★★ | macOS/Win 分流、Alt/Shift 屏蔽。**不动。** |
| `appMenu.test.ts` | 10 | 172 | ★★ | 跨平台菜单结构、/settings 路由分发。**不动。** |
| `grainUrl.test.ts` | 7 | 62 | ★★ | grain:// 协议 URL 生成（含 cache-bust）。**不动。** |
| `photoCardAspect.test.ts` | 9 | 43 | ★★ | clampAspect 边界（超宽/超竖/NaN/负数）。**不动。** |

### 2.6 ⚠️ 低价值 / 凑数（建议精简或删除）

| 文件 | 例数 | 行数 | 评分 | 问题 |
|---|---|---|---|---|
| **`designTokens.test.ts`** | 14 | 126 | ✗ | **测常量值**：`expect(colors.bg[0]).toBe('#05060E')`、`expect(spacing[2]).toBe('8px')` —— 改设计值必红但不是 bug。全文件可删除或缩到 3 例（只测"结构完整性"） |
| **`designUtils.test.ts`** | 13 | 72 | ✗→★ | 测 `cn/clamp/mapRange` 等 10 行内的通用工具函数。**可保留但压到 4 例**（edge cases） |
| **`motion.test.ts`** | 5 | 40 | ✗ | 测 "预设存在" + "transition 字符串拼接格式"。**建议删除**（预设是否存在由 TS 类型保证，拼接格式改了也无 bug 意义） |
| **`builtinPresets.test.ts`** | 5 | 40 | ✗→★★ | "有 30 个 preset"、"source=builtin" 属于白断言。但**"每条 schema parse 通过"那条是真防线**。**保留 1 例（schema 校验）删其余 4 例** |
| **`colorMatchers.test.ts`** | 7 | 53 | ★ | 测自己写的 jest matchers（自证工具）。**可保留但价值密度低** |
| **`exifReader.test.ts`** | 4 | 42 | ★ | 4 例 exifr 解析。**不动**（薄但代表真流程） |
| **`shadersPass3b.test.ts` 前 28 例（源码字面值）** | ~28 | ~120 | ✗ | 删除 "frag.toContain('u_image')"、"不含 `#version`"、"包含 `in vec2 v_uv`"这类字符串字面值测试（用 TS 类型签名 + 运行时 GLSL 编译通过已经隐式保证） |
| **`repairPhotoOrientation.test.ts` 的 v1-migrate 例** | 1 | ~58 | ✗ | 最终断言 `ver <= 2 && ver >= 1` 基本永真 |
| **`sliderPipelineChain.test.ts` 的"全零不产生 step"系列** | ~5 | ~40 | ★ | 与 `shadersPass3b.test.ts` 的 isXxxIdentity 测试部分重叠。**可合并到 table-driven，从 21 例压到 12 例** |

**⚠️ 子集汇总**：
- 可直接删除：**~3 个文件**（designTokens / motion，约 166 行 19 例）
- 可大幅精简：**4 个文件**（designUtils / builtinPresets / shadersPass3b 部分 / sliderPipelineChain 部分，约 200 行 40+ 例）
- 净减少：**约 55-60 例、350-400 行测试代码**，**价值密度提升、维护成本下降**，541 → ~480 例

---

## 三、当前项目真实状态（非测试视角）

### 3.1 里程碑地图

| 里程碑 | 状态 | 备注 |
|---|---|---|
| M0 基建 | ✅ 完成 | 三进程隔离 · PathGuard · biome · vitest |
| M1 导入 + 图库 | ✅ 完成 | RAW 解码 · thumb · 方向修复 |
| M1.5 滤镜 P1~P3 | ✅ 完成 | GPU 10 通道 shader · WebGL 引擎 · LUT3D |
| M2 滤镜引擎 | ✅ 完成 | CPU 镜像 · pipeline · pipelineToSteps |
| M3 批处理 | ✅ 完成 | GPU 隐藏窗口 · IPC 进度推送 |
| M3.5 补丁窗口 | ✅ 完成 | RAW 竖拍 / 滑块对齐 / 图库体验 |
| **M4 编辑器闭环** | **🟡 部分完成** | M4.1 CPU 镜像修复✅ M4.2 历史栈✅ M4.3 撤销重做快捷键✅ M4.4 保存为滤镜✅ **M4.5 滑块可感知性基线✅** |
| M5 参考图提取 | ⏸ 未开始 | AI 引擎 |
| M6 水印 | ⏸ 未开始 | Sharp 渲染 · 模板系统 |
| M7 评分 | ⏸ 未开始 | AI Studio |

### 3.2 真实可跑的功能（从用户视角）

- ✅ 导入照片（JPG / PNG / RAW 多格式）
- ✅ 缩略图生成（含方向修复 + 算法版本号迁移）
- ✅ 图库浏览 / 移除记录
- ✅ Editor：30 内置 preset + 10 通道 GPU shader + 滑块实时预览
- ✅ Editor：撤销/重做（⌘Z/⌘⇧Z · 50 步）
- ✅ Editor：保存当前 pipeline 为"我的滤镜"
- ✅ Batch：选中多照片一键批处理 + GPU 隐藏窗口
- ✅ LUT3D 加载 + 强度调节
- ✅ EXIF 读取

### 3.3 开着的技术债（M3.5 复盘里欠的）

| 项 | 状态 | 严重度 |
|---|---|---|
| `preview-cache` 目录无 GC | 🔴 未处理 | 中（长期磁盘膨胀） |
| 老 thumb 孤儿文件无清理 | 🔴 未处理 | 低 |
| GPU 路径 benchmark 缺失 | 🔴 未处理 | 低（仅有 CPU bench） |
| `artifact/ui-mockups/` 未决（入仓/ignore） | 🟡 未决 | 低 |
| CI 工作流空 | 🔴 未处理 | 中（PR 质量靠本地） |
| AGENTS.md 第 7 条（视觉 bug SOP） | 🟡 提议未落地 | 中 |

### 3.4 新发现的问题（本次审计）

1. **AGENTS.md 准则 4 副作用**："覆盖率 ≥ 80%" 诱导了凑数倾向 → 需要补"价值密度"原则
2. **测试文档化不足**：38 个文件之间的"这个测什么、那个不测什么"没有索引，容易重复写
3. **CI 缺失**：`test:all` 存在但没有自动执行，本地绿不代表推送绿
4. **hsl.ts 曾被注入 `return true // MUTATION`** 未及时察觉 —— 说明 code review 流程有漏洞（该污染导致 `isHslIdentity` 永远返回 true，HSL pass 全部被跳过，用户拉 HSL 滑块完全无效。本次才修复）

### 3.5 性能 / 安全基线（当前实测）

| 指标 | 当前 | 红线 | 状态 |
|---|---|---|---|
| 全量 vitest | ~1.4s | < 60s | ✅ |
| tsc --noEmit | < 5s | — | ✅ |
| biome check | < 1s | 0 警告 | ✅ |
| 内置 preset 数 | 30 | ≥ 30 | ✅ |
| 安全红线（9 条） | 全部遵守 | — | ✅ |

---

## 四、下一阶段规划建议

### 四步走（用户确认后逐步执行）

#### 📍 Step A · 测试资产瘦身（半天工作量）

目标：**541 → ~480 例**，删除/合并低价值测试，价值密度 +15%

- A1. 删除 `designTokens.test.ts`（14 例）→ 压成 3 例仅保留结构完整性
- A2. 删除 `motion.test.ts`（5 例，全文件删）
- A3. 精简 `designUtils.test.ts`（13 → 4 例）
- A4. 精简 `builtinPresets.test.ts`（5 → 1 例，仅保留 schema 校验）
- A5. 精简 `shadersPass3b.test.ts`（47 → ~20 例，删除 shader 源码字面值那一段）
- A6. 精简 `sliderPipelineChain.test.ts`（21 → 12 例，合并 table-driven）
- A7. 删除 `repairPhotoOrientation.test.ts` 的 v1-migrate 白断言例
- A8. **修订 AGENTS.md 准则 4**：把"覆盖率 ≥ 80%" 改为"价值优先 / 每测必须对应可描述的真实 bug 模式"
- A9. 写"测试索引" artifact，记录 38 → ~35 个文件各自的"这个文件的唯一职责"

**交付**：一个 commit `refactor(test): 按价值密度精简测试资产（541→~480）`

#### 📍 Step B · 闭环 M3.5 技术债（半天）

- B1. `preview-cache` GC：启动扫描 + LRU 2GB（复用 `diskLRU.ts`）
- B2. 老 thumb 孤儿清理：合并进同一轮 GC
- B3. 处理 `artifact/ui-mockups/`（用户决策：入仓或 .gitignore）

**交付**：一个 commit `fix(cache): preview-cache 启动 GC + thumb 孤儿清理`

#### 📍 Step C · CI 工作流（1 天，可选）

- C1. `.github/workflows/ci.yml`：tsc + biome + vitest + playwright visual
- C2. PR 门禁：测试绿 + 覆盖率不下降 + bench 不回归 10%
- C3. AGENTS.md 补第 7 条（视觉 bug SOP · 从 M3.5 踩坑抽象）

**交付**：一个 PR 级的提交（跟用户确认是否现在做，还是留到有远端用户后）

#### 📍 Step D · M5 参考图提取启动（如果上面都清完，就进入新功能）

- 这是原路线图里的下一块 —— 用户给张参考图，AI 提取出对应 pipeline
- 预估：ONNX 模型 + 颜色科学匹配 + UI 集成 · 3~5 天

### 推荐优先级

**必做**：Step A（测试瘦身 · 回应用户核心关切）+ Step B（闭环已知债）
**可选**：Step C（CI，看用户是否要现在做）
**下一仗**：Step D（M5 参考图提取）

---

## 五、关键决策点（需用户确认）

1. **Step A 的删除/精简范围**：
   - [方案 1] 激进：删 designTokens + motion + 大幅精简 shadersPass3b（-60 例）
   - [方案 2] 保守：只删 motion + v1-migrate 白断言（-6 例）
   - [方案 3] 中间：激进删 + 中度精简（-40 例）← **建议**

2. **AGENTS.md 准则 4 修订**：
   - [方案 A] 删除"≥80%"数字，改为"每条测试必须对应可描述的真实 bug 模式"
   - [方案 B] 保留数字但补"价值密度 > 数量"的原则
   - [方案 C] 分层：核心算法覆盖率 ≥ 80%，UI/设计 token 不做覆盖率要求 ← **建议**

3. **`artifact/ui-mockups/`**：入仓 / .gitignore / 删除 —— 三选一

4. **Step C（CI）时机**：现在做 / 等 M5 完成后一起做 / 等有远端用户时做

5. **是否现在就进入 M5**：是 / 先清债再进入 / 跳过 M5 直接做 M6（水印）

---

## 六、结论

**用户的反馈是对的**：测试规模到 541 例后确实存在"数量涨、价值不涨"的现象，尤其 designTokens / motion / shadersPass3b 源码字面值这三处是典型凑数。

**但整体盘点后**：
- **真正在扛防线的测试 ~410 例**（76%）—— 每一条都对应真实 bug 模式
- **低价值可砍的 ~60 例**（11%）—— 合并到 ~20 例或直接删
- **剩余 ~70 例**（13%）—— 契约护栏，价值中等但成本低，保留

**主动识别的非测试问题**：
- `hsl.ts` 被注入 `return true // MUTATION` 长达一段时间未被发现（本次才修）→ 验证了用户质疑"测试全绿但用户无感"的真实性
- AGENTS.md 准则 4 的数字目标客观上诱导了凑数倾向

**下一步请用户在 §五 的 5 个决策点上给意见，我再逐条执行**。不会擅自删测试 —— 删测试是不可逆的资产变动。
