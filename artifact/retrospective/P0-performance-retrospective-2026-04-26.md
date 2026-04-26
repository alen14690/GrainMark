# P0 性能优化复盘 · 2026-04-26

> 日期：2026-04-26 22:12
> 方法论：🔴 华为味（RCA + 蓝军自攻击）+ 🟡 字节味（数据驱动）
> 目标：把滑块卡顿从 30-50ms/frame 降到 <16ms，修完复盘再决定 P1

---

## 0. 原来 P0 的 7 点 → 实际做了 6 点 + 1 点被数据证伪降级

| 原计划 | 实际状态 | 数据依据 |
|---|---|---|
| P0-1 关 preserveDrawingBuffer + 同 tick readPixels | ✅ 合并 P0-5 一起做 | 预期 -3ms/frame（浏览器合成器省 blit） |
| P0-2 Pipeline.updateUniform 快路径 | 🟡 **降级为 API 预留** | Bench 证明 pipelineToSteps 0.18μs 非瓶颈；updateUniforms API 已加但 Editor 不接入，避免过度工程 |
| P0-3 Slider 订阅单字段 + setter 稳定引用 | ✅ AdjustmentsPanel 彻底重构为单字段子组件 | 预期 -5ms/frame React reconcile（最大单点收益） |
| P0-4 ShaderRegistry makeKey WeakMap | ✅ intern id 方案 | Bench **82× 提速**（每帧省 ~17μs） |
| P0-5 histogram Uint8Array 复用 | ✅ 与 P0-1 合并 | 预期 -1ms/frame + 消除 GC pressure |
| P0-6 Editor IPC 消除 needsCpuFallback 抖动 | ✅ 实际是"精准 selector + FilterRow memo" | GPU 正常路径下 IPC 本就稳定，真瓶颈是 Editor 整体 re-render |
| ~~P0-7 hasDirtyEdits 逐字段比较~~ | ❌ **被数据证伪** | Bench 显示 hasDirtyEdits 当前实现 **0.54μs**（引用相等短路 0.02μs）→ 远低于估算；不是 P0 瓶颈，降为 P2 |

> **方法论胜利**：bench 先行让我**在动手前就证伪了 2 个预判**（P0-2 / P0-7）——
> 如果直接按报告里的 7 点硬干，会做 2 个**零收益的改动**。**数据驱动 > 直觉**。

---

## 1. 核心变更摘要（507 行新增 / 修改）

### 1.1 WebGL 引擎层
- `src/engine/webgl/ShaderRegistry.ts`：makeKey 从 "djb2 扫全量 shader 源码" 改为 "intern string→id O(1) map"
- `src/engine/webgl/Pipeline.ts`：新增 `updateUniforms(next)` + `getStructuralKey()` 作为未来快路径 API（本次不接入）

### 1.2 渲染 Hook 层
- `src/lib/histogram.ts`：拆出 `readDrawingBufferToBuffer(gl, buf)` 让调用者控制读时机
- `src/lib/useWebGLPreview.ts`：
  - **preserveDrawingBuffer=false**
  - 新增 `histogramBufferRef`（按已见最大尺寸预分配）
  - 直方图改为"draw 后同 tick readPixels"，不再 120ms setTimeout
  - 跳帧策略 `HISTOGRAM_SAMPLE_EVERY=3`（~50ms @ 60fps，比旧的 120ms debounce 更跟手）
  - **新增 FramePerf 分段打点**：setSteps / pipelineRun / readPixels / histogram 各自计时
  - 新增 `pipelineStructuralKey()` 导出（配合 Pipeline.updateUniforms 未来用）

### 1.3 React 层
- `src/design/components/Slider.tsx`：Slider 整体 `memo` 化
- `src/components/AdjustmentsPanel.tsx`：**彻底重构** —— 每个滑块独立 memo 子组件，订阅单字段，setter 从 `getState()` 拿稳定引用
- `src/routes/Editor.tsx`：
  - 精准 selector（`photos.find(...)` 放进 zustand selector，不再订阅整个 photos 数组）
  - FilterRow memo 化（filterId 替代 onClick prop 实现稳定引用）
  - Dev 诊断条显示 Frame budget
- `src/routes/Editor.tsx` 移除 setActiveFilter 顶层订阅（走 getState）

### 1.4 测量基建（新建）
- `tests/bench/sliderHotPath.bench.ts`：5 条 bench 覆盖滑块 React/store 层热路径
- `tests/bench/shaderRegistryKey.bench.ts`：对比 djb2 vs intern id
- `tests/unit/readDrawingBufferToBuffer.test.ts`：5 条单测守护 readPixels 契约

---

## 2. 关键数据对比

### 2.1 Bench 基线数字（已保存为回归基线）

| 操作 | mean | p99 | 占 16.6ms frame 预算比例 |
|---|---|---|---|
| `setTone({exposure:v})` | 3.1μs | 6μs | 0.036% |
| `hasDirtyEdits(typical, baseline)` | 0.54μs | 0.7μs | 0.004% |
| `JSON.stringify(pipeline)` | 0.37μs | 0.5μs | 0.002% |
| `pipelineToSteps` 典型态 | 0.18μs | 0.3μs | 0.001% |
| `djb2Key` × 10 shader | 17.6μs | 27.8μs | 0.11% |
| `intern-id Key` × 10 shader | 0.22μs | 0.3μs | 0.001% |

**结论**：React/store 层完全不是瓶颈（总占比 < 0.2% frame budget）。滑块卡顿的瓶颈**全在 React re-render 开销 + WebGL 合成器 + GPU→CPU 同步点**。

### 2.2 预期运行时收益（基于审计报告 + bench 估算）

| 优化项 | 预期 before → after |
|---|---|
| preserveDrawingBuffer=false | 每帧 -3ms blit（浏览器合成器走 swap chain 快路径） |
| histogram buffer 复用 | 每帧 -1ms（消除 6.8MB Uint8Array alloc + GC） |
| makeKey intern id | 每帧 -17μs（10 pass × 1.7μs）|
| Slider memo + 单字段订阅 | 拖曝光时 19 个其它 Slider **不再 re-render**，estimated -5ms/frame React reconcile |
| FilterRow memo | 拖滑块时**整个滤镜列表**不再 re-render，estimated -2ms/frame（列表越长收益越大）|
| **合计（理论）** | **30-50ms/frame → 7-15ms/frame**（滑块丝滑了） |

⚠️ **真实数字必须用 Chrome DevTools Profiler 在 Electron dev 里测**。测量基建已就绪（Editor dev 面板显示 FramePerf），下一步用户可以：
1. 打开 Editor，拖任意滑块
2. 左上角显示 `frame: X.Xms · run X.X · rd X.X · hist X.X`
3. 正常应该看到 `frame` 稳定在 16ms 以下

---

## 3. 蓝军自检（确认防护力）

### 3.1 ShaderRegistry makeKey 蓝军 ✅
故意在 makeKey 末尾拼 `Math.random()` 让同一 shader 每次返回不同 key（破坏缓存）→ `tests/unit/webglEngine.test.ts:152` 的 `expect(p1).toBe(p2)` **立即红**。说明 F8 的 compile cache 测试有实质防护力，P0-4 的改动可被回归测试监控。

### 3.2 readPixels 契约蓝军 ✅
新增的 `readDrawingBufferToBuffer` 测试覆盖：
- buffer 过小 throw
- 0 尺寸返回 0（不调 readPixels）
- readPixels 参数完整（RGBA+UNSIGNED_BYTE+全画布+default FBO）
- readPixels throw 不炸调用者

如果未来有人改 API 破坏契约，这 5 条会红。

### 3.3 AdjustmentsPanel 重构蓝军
改动**没动** editStore / Slider 内部逻辑，只改了 Panel 的子组件拆分。`tests/unit/sliderPipelineChain.test.ts` 的 15+ 条测试覆盖 "editStore action → pipelineToSteps" 完整链路（setTone 语义、合并契约、identity 判定、顺序契约）—— 全部绿。Panel UI 层没有单测层防护，只能靠 Playwright 覆盖（留给 P1 测量基建）。

---

## 4. 证伪的预判 + 反思

### 4.1 P0-2 Pipeline.updateUniform
**原判断**："每帧重建 step[] 数组是 React reconcile 放大器"。
**数据证伪**：pipelineToSteps 全通道 **0.18μs**；step[] alloc 被 V8 的 escape analysis 优化得极快。
**实际决策**：API 加了（方便未来极限优化），但 useWebGLPreview 不接入，避免过度工程。

### 4.2 P0-7 hasDirtyEdits
**原判断**："JSON.stringify 两次每帧都跑，20-100μs 开销"。
**数据证伪**：**0.54μs**。pipeline 对象小（7 个字段，500-2000 字节 JSON），V8 JSON.stringify 高度优化。
**实际决策**：降级 P2，未来有空再做逐字段比较。

### 4.3 P0-6 Editor IPC 抖动
**原判断**："needsCpuFallback 抖动会触发 sharp 重做"。
**实际读码**：GPU 正常路径下 `needsCpuFallback=false`，`ipcFilterId=null`，`pipelineKey=null`，`debouncedPipelineKey` 恒等 null，useEffect 不会因滑块变化触发。**Editor 自己重渲染**（订阅 currentPipeline）才是真正的"浪费"，而不是 IPC 抖动。
**实际决策**：P0-6 做成"Editor 子组件 memo 化"，修复真正的浪费点。

### 4.4 反思方法论价值
**如果不先做 bench 基建直接修代码**，我会花精力在 P0-2 / P0-7 这两个空炮上，总工时浪费估计 40-60 分钟。**Bench 先行的价值**：先筛掉伪瓶颈，集中资源到真瓶颈。这是性能工程的铁律 —— **"Premature optimization is the root of all evil" 的关键不在"别优化"，在"先测量"**。

---

## 5. 后续建议（P1 路线收敛）

P0 修完后，建议先**停一下，让用户实际跑一次 Editor 体验**，确认卡顿消失 / 改善幅度。根据实测结果决定 P1 优先级：

### 5.1 如果滑块已经丝滑（预期情况）
- **转向切滤镜 / 切照片性能**（P1）
  - F9-perf：filterStore 内存缓存 + chokidar watch
  - F11-perf：resolvePreviewBuffer 结果缓存 + readExif 存 photo 记录
  - F1-perf：preview:render 拆"基准层"和"参数层"

### 5.2 如果滑块仍有感知卡顿
- **重测 FramePerf 数字分析瓶颈**
  - 若 `pipelineRun > 8ms` → GPU 层真慢，考虑 shader 简化 / pipeline 合并
  - 若 `readPixels > 2ms` → 改 GPU-side histogram（P3）
  - 若 `totalMs - pipelineRun - readPixels - histogram` 占大头 → React 仍有漏网之鱼，用 React DevTools Profiler 查
- **加 Chrome DevTools Performance 录制脚本化测量**

### 5.3 通用建议
- **把 FramePerf 数据在 CI 上收集**：vitest 环境跑不到 GPU，但可以加 Playwright 测滑块交互 + 实测 frame 时间
- **加 Storybook 页面**让 AdjustmentsPanel / Slider 可独立测交互

---

## 6. 校验结果

- **变更影响范围分析**：涉及 7 个文件（新增 3 + 修改 4）
  - 新增：`tests/bench/sliderHotPath.bench.ts`、`tests/bench/shaderRegistryKey.bench.ts`、`tests/unit/readDrawingBufferToBuffer.test.ts`
  - 修改：`src/engine/webgl/ShaderRegistry.ts`、`src/engine/webgl/Pipeline.ts`、`src/lib/histogram.ts`、`src/lib/useWebGLPreview.ts`、`src/design/components/Slider.tsx`、`src/components/AdjustmentsPanel.tsx`、`src/routes/Editor.tsx`
- **冗余代码即时清理**：移除 `histogramTimerRef` 相关代码（setTimeout 120ms 模式），移除 Editor.tsx 的 `photos`/`setActiveFilter` 顶层订阅
- **静态检查零回归**：`npx tsc --noEmit` 0 错误；`npx @biomejs/biome check .` 0 警告
- **单元测试同步更新并全绿**：`npx vitest run` **522/522 通过**（+5 新增 readDrawingBufferToBuffer 测试）
- **可运行自测 + 蓝军验证**：
  - **蓝军 ShaderRegistry**：故意注入 Math.random() 破坏 key 稳定性，webglEngine.test.ts 立即红 → 已回滚
  - **Bench 基线建立**：sliderHotPath 和 shaderRegistryKey 两套 bench 可作为未来回归基线
  - **未跑 Electron 端到端**（需要用户在 Editor 实测 FramePerf 数字），这是性能改动必须的最后一环
- **用户视角自测**：改动涉及 Slider / AdjustmentsPanel 这两个核心 UI → **P0 收尾后请用户在 Editor 实测滑块拖动 + 观察左上角 Frame budget 数字**，用真实数据判断 P1 走向
- **Git 提交与推送**：待用户确认后提交
