# M3-a · 复盘（Retrospective）

> 完成时间：2026-04-25
> 状态：✅ 已完成 · commit `ad508d3`
> 关联交付：`test(snapshot) e441a24`（像素级快照） + `test(integration) e1251b1`（端到端测试）

---

## 🎯 本轮目标

产品核心价值链的关键一环：**「选一批照片一键应用胶片滤镜」**。在 M2 完成 Editor 侧的所有单张处理能力之后，M3-a 负责让这条能力延伸到批处理 —— 输入 N 张照片 → 并行 → 输出到指定目录。

约束：
- 不能让主进程卡住（用 `worker_threads` 隔离 CPU 密集任务）
- 不能在 M3-a 就在 Node 端重写 10 个 shader（那是 M3-b 的活）—— 先覆盖 sharp 原生能力可达的 6 个通道，其余明示给用户「走 GPU 路径」

---

## ✅ 达成项

### 🧱 批处理流水线基础设施

| 工作项 | 状态 | 备注 |
|---|---|---|
| `electron/services/batch/pipelineSharp.ts`：sharp 侧 6 通道 CPU 管线 | ✅ | tone / WB / saturation / vibrance / clarity / vignette |
| `detectIgnoredChannels(pipeline)`：检测 pipeline 是否含 CPU 管线未覆盖通道 | ✅ | 返回 `(curves / hsl / colorGrading / grain / halation / lut)[]` |
| `UNSUPPORTED_CHANNELS_IN_BATCH` 常量导出 | ✅ | UI 侧警告条直接消费 |
| 支持输出格式：jpg / png / tiff / webp / avif | ✅ | JPEG 走 mozjpeg |
| 5 种 resize 模式：none / long-edge / short-edge / width / height | ✅ | `withoutEnlargement` 保证不拉伸 |
| `keepExif` + `sourceOrientation`（RAW 方向修正） | ✅ | |

### 📝 命名模板

| 工作项 | 状态 | 备注 |
|---|---|---|
| `electron/services/batch/namingTemplate.ts`：9 种模板变量 | ✅ | {name}/{filter}/{date}/{time}/{datetime}/{model}/{iso}/{index}/{ext} |
| `sanitizeFilename`：清洗 `/ \ : * ? " < > | NUL ControlChars` + 消除 `..` | ✅ | Windows + macOS + Linux 交集 |
| `resolveConflict`：自动加 `_1` / `_2` suffix，穷举后加时间戳兜底 | ✅ | |
| 文件名 ≤ 200 字符截断（保留扩展名） | ✅ | |

### 🧵 Worker Pool

| 工作项 | 状态 | 备注 |
|---|---|---|
| `electron/services/batch/worker.ts`：worker_threads 端入口 | ✅ | 无状态，每个 task 独立处理 |
| 协议：main→worker `{ type: 'process' \| 'shutdown' }` · worker→main `{ type: 'ready' \| 'result' }` | ✅ | |
| `electron/services/filter-engine/batch.ts` 重写：WorkerPool 类 | ✅ | N workers（1..16 夹紧）+ drain 队列 |
| `shutdown` 支持 cancel 语义 | ✅ | 队列未派发的 task 立即 resolve 为 cancelled |
| `startBatch` 预读 EXIF + RAW previewBuffer（串行，避免拖垮主线程） | ✅ | |
| `broadcastProgress` 通过 `BrowserWindow.webContents.send('batch:progress', update)` | ✅ | 替代轮询 |
| vite.config.ts：main 扩成 multi-entry，worker 独立产物 `dist-electron/batch-worker.mjs` | ✅ | 8.4KB（后来改为 .mjs 扩展名） |

### 📡 渲染侧接入

| 工作项 | 状态 | 备注 |
|---|---|---|
| `src/lib/ipc.ts` 新增 `ipcOn(channel, listener)` 订阅辅助 | ✅ | 返回取消函数 |
| `src/routes/Batch.tsx` 重写：订阅 `batch:progress` + 进度条 + 真 cancel | ✅ | |
| 滤镜变化时检测 pipeline 不支持通道 → 黄色警告条 | ✅ | M3-a 的明示边界 |
| isRunning 时配置项全部锁定 | ✅ | |

### 🧪 测试新增

| 文件 | 用例数 |
|---|---|
| `tests/unit/pipelineSharp.test.ts` | 25 |
| `tests/unit/namingTemplate.test.ts` | 23 |
| `tests/unit/shaderSnapshots.test.ts` | 14（e441a24 补齐）|
| `tests/integration-e2e/batch.spec.ts` | 5（e1251b1 补齐，CPU 路径）|
| **M3-a 区间合计** | **+67** |
| **项目总用例** | **381 单测 + 5 集成**（333 → 395 单测 + 5 集成）|

---

## 📊 关键数值

| 指标 | M2 完成 | M3-a 完成（含 e441a24 + e1251b1） |
|---|---|---|
| 单元测试 | 333 | **395** |
| 集成测试 | — | **5** |
| tsc 错误 | 0 | 0 |
| biome 警告 | 0 | 0 |
| 文件数（biome 扫）| 138 | 146 |
| renderer 包体 | 308KB | 311KB（+3KB Batch 改造 + ipcOn）|
| main 包体 | 144KB | 150KB（+6KB WorkerPool 服务）|
| batch-worker | — | **8.4KB 独立 chunk** |
| 批处理覆盖通道 | 0（批处理是占位 return jobId）| **6（CPU 保真）** |
| 批处理并发 | — | 1..16 workers 可配置 |
| 像素级 baseline（PNG）| 0 | **14 张 × 100×100（LFS）** |
| RAW 支持 | Editor 预览 | **Editor 预览 + 批处理输入** |

---

## ❌ 未达成项 & 推后事项

| 项 | 原因 | 何时处理 |
|---|---|---|
| curves / hsl / colorGrading / grain / halation / lut 六个通道的批处理 | 在 Node 端重写 10 shader 约 500 行 GLSL 等价 CPU 代码 + 大量像素级对齐测试；成本远高于"隐藏 BrowserWindow 复用 GPU 引擎" | **M3-b**（已闭环 → commit `a411c12`）|
| WorkerPool 本身的真实 worker 集成测试 | 单测要起真实 worker_threads 成本高（~50-100ms 启动 × 20 用例）| **已通过 D（e1251b1 Playwright）覆盖** |
| 批处理吞吐的实测 benchmark | 尚无 benchmark 基础设施；README 的「4 worker × 30-50 张/min」是经验值 | 下一轮「benchmark 基础设施」|
| 批处理 session 跨进程重启保留 | 当前 jobId 存内存 Map，进程退出丢失 | 需求未明确，观望 |
| RAW 批处理时直接 demosaic 全分辨率 | 当前只支持内嵌 JPEG 预览通路（≈ 1600 长边）| 等「无损 RAW 路径」立项（远期）|

---

## 🐛 发现并处理的问题

| # | 问题 | 修复 |
|---|---|---|
| 1 | `import { getFilterById }` 实际导出名是 `getFilter` | 改名 |
| 2 | `PhotoExif.cameraModel` 实际字段是 `model` | 对齐 |
| 3 | biome `noParameterAssign`：`applyToneAndWB(img)` 里改 `img` | 改 `let cur = img` |
| 4 | biome `noControlCharactersInRegex`：`\x00-\x1f` 清洗控制字符 | 加 biome-ignore（有意匹配）|
| 5 | quality=100 vs 40 的测试用纯灰图区分不出 | 改用 256×256 噪声图 |
| 6 | `sanitizeFilename` 未处理 `{` `}` 导致 `{unknown}` 保留原形 —— 是有意的（非路径非法字符）| 更新测试预期为原样保留 |

### e441a24（shader snapshot）连带发现与处理

| # | 问题 | 修复 |
|---|---|---|
| 7 | vitest Node 环境无 WebGL 2 上下文，headless-gl 只支持 WebGL 1 且无 sampler3D | 决策：CPU 镜像 + PNG baseline 作为「算法语义快照」而非「GPU 输出一致性」层 |
| 8 | biome 把 `a ^ b * c` 加括号成 `a ^ (b * c)`，担忧优先级改变 | 验证：JavaScript 中 `*` 优先级高于 `^`，加括号不改语义 |
| 9 | 首次运行时 baseline 不存在 | 自动写入 + git add，回归时对比 |

### e1251b1（集成测试）连带发现与处理

| # | 问题 | 修复 |
|---|---|---|
| 10 | `app.getAppPath()` 在不同启动方式下不确定（Playwright 启动时与 `npm run dev` 不一样）| 改用 `path.dirname(fileURLToPath(import.meta.url))` + main.js 同目录 |
| 11 | **ESM worker 用 `.js` 扩展名时 Node 按 CJS 加载失败** | 改为 `.mjs` 扩展名（产物命名由 rollup output 函数控制）—— 这是一个实际的 bug，本地 dev 也会影响 |
| 12 | ESM 下 `__dirname` 不可用 | `fileURLToPath(import.meta.url)` 派生 |
| 13 | 集成测试污染用户真实 userData | main.ts 新增 `GRAINMARK_USER_DATA` 环境变量支持，启动最早期 setPath |

---

## 🔍 方案合理性复盘

### 👍 好的决策

1. **M3-a / M3-b 分段**：6 通道 sharp 立刻可用，其余通道以黄色警告明示 → 用户当下就能用而非等 M3-b；M3-b 闭环时警告变紫色「走 GPU 批处理」语义自洽
2. **worker_threads 而非 utilityProcess**：API 稳定、单测容易、与 main 共享 node_modules（sharp 不用重装原生二进制）；utilityProcess 留给 M7 AI 大模型（那个场景的隔离需求更强）
3. **进度用 push 事件而非轮询 `batch:status`**：1000 张 job 时避免 3000+ 次 IPC 轮询
4. **per-job 新建 pool 而非长期常驻**：50-100ms 启动开销相对 batch 整体耗时可忽略；开发期调试更简单
5. **detectIgnoredChannels 独立纯函数**：UI 警告条和主进程分流都直接复用，没有双份实现漂移风险
6. **ipcOn 辅助抽象**：一行调用换一个取消函数，React 组件里 useEffect cleanup 自然配套
7. **（e441a24）CPU 镜像 + PNG baseline**：不是 GPU 一致性层，是「算法意图防退化」层 —— 定位清晰、维护成本低（改 shader 时同步改 30-80 行 CPU 对应）
8. **（e441a24）回归保护端到端验证**：改算法分母 100→50 立即 diff 3.25% > 0.5% fail，证明机制有效
9. **（e1251b1）整条链路 Playwright：preload + IPC + WorkerPool + sharp + 写盘**：一个用例挂了能立刻定位是哪一层问题

### 🤔 可能改进

1. **pipelineSharp 的 clarity 是 sharpen 近似**：与 GPU 的 unsharp mask 数学不严格等价；M3-b 上线后批处理会走 GPU，此差异自然消除，但如果用户选 CPU-only filter 会看到差异 —— 下一轮补 benchmark / 视觉对比文档
2. **vibrance 走 0.6× saturation 近似**：同样是数学近似；M3-b 走 GPU 消除
3. **resolveConflict 穷举后加时间戳**：时间戳是秒级，同秒内连续 100+ 冲突会回到死循环理论可能 —— 概率极低，但可考虑 `nanoid(4)` 加后缀
4. **Batch.tsx 配置项锁定时没有视觉提示**：只是 disabled，应该加「批处理中，请等待或取消」文案
5. **RAW 批处理时 `previewBuffer` 预读是串行**：N 张 RAW 会累加延迟；可以并发 3-4 个预读（sharp 内部已经线程池，但 RawDecoder 是 dcraw-wasm 串行）
6. **namingTemplate 的 `{index}` 默认 4 位 padStart**：1001 张 batch 会溢出到 5 位，目前没校验；建议加 warning 但不阻止

---

## 📝 对 M3-b（GPU 批处理）的建议

- ✅ detectIgnoredChannels 可直接作为 CPU / GPU 分流的判断器
- ✅ renderNamingTemplate / resolveConflict / sharp resize 代码可被 GPU 路径复用（GPU 只负责从 RGBA pixels 编码 + 写盘复用这套工具）
- ⚠️ 必须考虑隐藏 window 与主窗口生命周期：main 关了但 hidden 还在会让进程僵死 → 显式 shutdown 钩子
- ⚠️ CSP connect-src 需放宽到 `data:` 让隐藏页面从 data URL fetch 源图
- ⚠️ IPC 通道白名单正则只支持单段 `prefix:name`，`batch:gpu:ready` 要扩展为两段
- ⚠️ BuildContext 原本 private → 需要 export 供 batchGpu.tsx 复用

*(以上建议在 M3-b 实际实施时全部落实，见 `M3-b-retrospective.md`)*

---

## 🎬 结论

**M3-a 完成度：100%**（预先约定的 6 通道 + 9 种命名变量 + 5 种格式 + cancel + 进度事件全部达成）。

**配套交付** `e441a24` 补齐了测试金字塔 Image Snapshot 层（14 张 baseline），`e1251b1` 补齐了 Playwright + Electron 集成层（5 用例），两个交付都有意识地与 M3-a 的时间线并行，一次把「测试基础设施 + 批处理能力」铺到位。

**推荐进入 M3-b（GPU 批处理）**，继承 M3-a 的 worker pool 架构但通过 detectIgnoredChannels 分流。
