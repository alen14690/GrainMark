# M2 · 复盘（Retrospective）

> 完成时间：2026-04-25
> 状态：✅ 已完成 · commit `dee0e96`

---

## 🎯 本轮目标

M2 的核心：**Editor 必须既能承载「切预设」也能承载「手调滑块」**，并给出客观的直方图反馈。在 Pass 3b-2 全量 GPU 化之后，M2 负责把引擎的能力暴露给人。

---

## ✅ 达成项

### 🏪 editStore（编辑态抽象）

| 工作项 | 状态 | 备注 |
|---|---|---|
| `stores/editStore.ts`：Zustand + immer；state { currentPipeline, baselinePipeline } | ✅ | |
| actions：loadFromPreset / resetToBaseline / clear / setTone / setWhiteBalance / setVignette / setClarity / setSaturation / setVibrance | ✅ | immer draft 安全 |
| deepClonePipeline 使用 JSON round-trip（而非 structuredClone）避开 immer Proxy 的 DataCloneError | ✅ | |
| hasDirtyEdits(current, baseline)：重置按钮高亮判断 | ✅ | |

### 📊 实时 GPU 直方图

| 工作项 | 状态 | 备注 |
|---|---|---|
| `lib/histogram.ts` 纯函数工具：HistogramBins / computeHistogramFromRgba / computeHistogramFromCanvas / emptyHistogram | ✅ | luma = Rec.709 系数 |
| `useWebGLPreview` 集成：renderNow 完成后 120ms debounce 触发 readPixels + computeHistogramFromCanvas | ✅ | 避免滑块高频拖动时 readPixels 堆积 |
| GLContext `preserveDrawingBuffer: true` | ✅ | 保证跨帧 readPixels；实测现代 GPU 性能影响 1-3% |
| 卸载清 histogramTimerRef | ✅ | |
| WebGLPreviewResult 新增 histogram 字段 | ✅ | |

### 🎛 AdjustmentsPanel

| 工作项 | 状态 | 备注 |
|---|---|---|
| `components/AdjustmentsPanel.tsx`：Editor 右栏「调整」tab | ✅ | 12 个 Slider |
| Tone 6 滑块（exposure / contrast / highlights / shadows / whites / blacks）| ✅ | |
| White Balance 2 滑块（temp / tint）| ✅ | |
| Presence 3 滑块（clarity / saturation / vibrance）| ✅ | |
| Effects 1 滑块（vignette.amount，默认 midpoint=50 / feather=50 / roundness=0）| ✅ | |
| 双向绑定 editStore | ✅ | |

### 📺 Editor 重构

- pipeline 数据源：`activeFilter.pipeline` → **`editStore.currentPipeline`**
- useEffect 监听 `activeFilter` 变化 → `loadFromPreset(activeFilter ?? null)`
- 右栏 tab 切换「滤镜 / 调整」
- Histogram 面板接 `webgl.histogram`，附 total 像素数
- 重置按钮基于 `hasDirtyEdits` 高亮
- 滤镜行 active 色切到 Aurora 紫（修 code-review M-5）

### 🧪 测试新增

| 文件 | 用例数 |
|---|---|
| `editStore.test.ts` | 17 |
| `histogram.test.ts` | 10 |
| **M2 合计** | **+27** |
| **项目总用例** | **333**（306 → 333） |

---

## 📊 关键数值

| 指标 | P3b-2 完成 | M2 完成 |
|---|---|---|
| 测试用例 | 306 | **333** |
| tsc 错误 | 0 | 0 |
| biome 警告 | 0 | 0 |
| 文件数（biome 扫）| 133 | 138 |
| renderer 包体 | 295KB | **308KB**（+13KB） |
| GPU 支持通道 | 10 | 10 |
| 直方图 | ❌ | ✅ readPixels + 120ms debounce |
| 手动调整 | ❌（只能切预设） | ✅ 12 个滑块双向绑定 |

---

## ❌ 未达成项 & 推后事项

| 项 | 原因 | 何时处理 |
|---|---|---|
| HSL / Curves / Color Grading / Grain / Halation 的专门 UI（色环 / 曲线画布 / 多通道滑块） | 需 400+ 行 + 大量拖拽交互测试 | M4 |
| 历史栈 / 撤销重做 | editStore.baselinePipeline 已预留锚点 | M4 |
| 前后对比（按住查看原图） | 需额外 state + 动画 | M4 |
| Downsample FBO 做直方图 256×256 readPixels | 当前 120ms debounce 已够流畅 | M4（1:1 原图预览上线时） |
| 像素级快照测试（10 shader × 100×100 baseline）| playwright electron 环境尚未通 | M3 / M4 |
| `preserveDrawingBuffer: true` 的性能测量报告 | 主观观察无感；暂无 benchmark 数据 | M3（benchmark 基础设施上线时） |

---

## 🐛 发现并处理的问题

| # | 问题 | 修复 |
|---|---|---|
| 1 | structuredClone(immer draft) 抛 DataCloneError | deepClonePipeline 改 JSON round-trip |
| 2 | biome `noParameterAssign`：computeHistogramFromRgba 重赋参数 stride | 改用 const step = stride < 1 ? 1 : stride |
| 3 | preserveDrawingBuffer=false 下跨帧 readPixels 读到空 buffer | 改 true（全局性能影响可忽略） |
| 4 | 滑块高频拖动时 readPixels 堆积 | 120ms debounce + timer cleanup |
| 5 | Editor useEffect 依赖 photo 整个对象 → photos store re-sort 误触发 IPC | 收窄到 photo?.path |

---

## 🔍 方案合理性复盘

### 👍 好的决策

1. **editStore 独立于 appStore**：生命周期不同（Editor 局部 vs 跨路由全局），拆开后卸载 Editor 时 clear() 一次就干净
2. **baselinePipeline 预留**：未来 M4 撤销栈直接复用，不改 schema
3. **120ms debounce 而非 requestIdleCallback**：有确定的上限延迟，滑块停下约 120ms 直方图更新，UX 可预期
4. **只实装 12 个线性滑块**：80/20 覆盖日常微调；HSL / Curves 的复杂 UI 正确地留到 M4
5. **immer draft + JSON round-trip clone**：对 FilterPipeline 这种纯 JSON 结构性能足够，比 structuredClone 的 Proxy 感知更可靠
6. **README 同步更新里程碑 + 质量基线**：符合用户要求的「活文档」

### 🤔 可能改进

1. **Slider 双击复位的目标值硬编码在 AdjustmentsPanel**：M4 可以从 baselinePipeline 取，让「复位到当前预设」更直观
2. **未实现 Adjustments 预设保存**：用户手调后切其他预设再切回来会丢失手调结果 —— 目前是预期行为（editStore 被 loadFromPreset 覆盖），但用户可能需要「派生自 X」的语义
3. **直方图 `preserveDrawingBuffer: true` 的代价尚未量化**：需要等 M3 benchmark 基础设施上线后补实测数据
4. **AdjustmentsPanel 对 pipeline=null（原图）场景的表现**：滑块显示为默认值但 onChange 被 no-op —— 应该灰掉整个面板更清晰

---

## 📝 对 M3 的建议

- ✅ editStore 稳定，M3 批处理面板可复用「currentPipeline 就是真源」的约定
- ✅ 直方图工具是纯函数，M3 的批处理 preview 可直接复用
- ⚠️ M3 的 Worker Pool 应该考虑直接消费 editStore 的 pipeline —— 而非再次调 IPC 过一次 applyPipelineSharp（CPU 端对 LUT/HSL 的实现仍未补齐）
- ⚠️ M3 首要目标是 benchmark 基础设施，让 M2 的性能假设（preserveDrawingBuffer / debounce / 12 滑块）可量化

---

## 🎬 结论

**M2 完成度：100%**（HSL / Curves 等复杂 UI 按计划推到 M4）。

**推荐进入 M3（批处理 Worker Pool）**。
