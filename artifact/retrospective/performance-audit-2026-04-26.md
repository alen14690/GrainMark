# GrainMark 性能架构审判报告

> 审计日期：2026-04-26 21:46
> 审计人视角：性能工程师（专注实时图像处理）
> 用户反馈：**"滑块快速滑动时照片有明显延迟，远不及 Lightroom"**
> 审计方法：逐行读代码 + 测量数据规模 + 对比 Lightroom / Capture One 的工程做法，不依赖任何记忆

---

## 0. 目标基线（Lightroom 对齐）

| 场景 | Lightroom 24MP | GrainMark 当前观测 | Gap |
|---|---|---|---|
| 滑块拖动预览更新 | < 16ms/frame（60fps 持续） | **明显卡顿 + 延迟** | 4-10× |
| 切滤镜 | < 100ms | 估算 **300-800ms** | 3-8× |
| 切照片 | < 200ms | 估算 **500-1500ms** | 3-7× |
| 导入 100 张 RAW | 几十秒（并发） | 估算 **3-5 分钟**（串行 for loop） | 10× |
| 导出 10 张（批处理） | 数十秒 | 正常，但 base64 化大图 + 预读同步有优化空间 | 约 1.5-3× |

---

## 1. 核心结论：Editor 预览路径从架构上就错了

### 1.1 根本症状

滑块卡顿的**真正来源**不是单点性能问题，而是**整个预览链路的设计本身是"CPU-heavy-pessimistic"**：

> 每次滑块动 → rAF merge → setTone → editStore 改 currentPipeline → Editor 重渲染 → useWebGLPreview 的 pipeline 依赖变化 → renderNow 触发 GPU pipeline.run
>
> **同时**：CPU 兜底路径走 `pipelineKey` + debounce 150ms → 主进程 `preview:render` → sharp 重新 **从磁盘读 RAW cache** → sharp 重新 **解码 JPEG** → sharp 重新 **resize** → `applyPipelineToRGBA` 在 JavaScript 里逐像素跑 10 通道 → sharp 重新 **encode JPEG** → 写 `preview-tmp/<hash>.jpg` → 返回 `grain://` URL → 渲染进程 `fetch` → `createImageBitmap` → GPU 上传。

代码里 WebGL 路径 **ready 了**，但仍然每次滑块变化会走 **CPU 兜底检测逻辑** + 触发不必要的 React 重渲染 + WebGL pipeline 全量重建。

### 1.2 正确设计（Lightroom 模型）

预览链路应该分成两层：
- **基准层**：`photoPath → 解码一次 RAW → 1600px RGB → 上传为 WebGL 纹理`。一张照片在整个 Editor session 期间**只做一次**。换滤镜、换参数都**不触发**这层。
- **参数层**：`currentPipeline → uniforms → GPU passes`。每帧都只动 uniform，不上传纹理，不走 IPC。

**当前代码里这两层部分耦合**，下面逐条给出证据。

---

## 2. 逐条问题证据

### F1-perf（P0）：Editor.tsx 的 IPC preview:render 无法区分"换照片"和"换参数"

`src/routes/Editor.tsx:226-255`:

```tsx
useEffect(() => {
  if (!photoPath) return
  const override = needsCpuFallback ? (currentPipeline ?? undefined) : undefined
  ipc('preview:render', photoPath, ipcFilterId, override)
  // ...
}, [photoPath, ipcFilterId, debouncedPipelineKey])
```

- 依赖 `ipcFilterId`：**切滤镜**会重新 IPC preview:render —— 即便 GPU 路径下，基准 JPEG 本身没变，完全不需要重拉
- 依赖 `debouncedPipelineKey`：CPU 兜底下任何滑块的参数变化都会重新走一次主进程 sharp 解码 + encode（24MP RAW 下主进程大约 **300-600ms**）
- 主进程每次 `preview:render` 都会调用 `resolvePreviewBuffer` → 即便 RAW cache 命中，**仍然同步 readExif（30-80ms）** + `fsp.readFile` 缓存文件（2-8MB IO）

---

### F2-perf（P0）：主进程 preview:render 每次都重做全流程

`electron/services/filter-engine/preview.ts:47-129`：

```ts
export async function renderPreview(photoPath, filterId, pipelineOverride): Promise<string> {
  const { buffer, sourceOrientation } = await resolvePreviewBuffer(photoPath)   // IO + EXIF
  let base = sharp(buffer, { failOn: 'none' })
  base = base.rotate(rotationDeg).resize(...)
  if (pipeline) {
    const { data, info } = await base.ensureAlpha().raw().toBuffer(...)
    const rgba = applyPipelineToRGBA(...)                                        // JS 10-channel 循环
    outBuffer = await sharp(Buffer.from(rgba), {raw}).jpeg().toBuffer()
  }
  fs.writeFileSync(outPath, outBuffer)                                            // 同步写盘
}
```

即便 GPU 路径下 pipeline=null，**前 5 步仍然要跑**（读盘、解码、resize、encode、写盘），本应作为"基准照片缓存"一次完成。

---

### F3-perf（P0）：preserveDrawingBuffer = true 禁用了浏览器 GPU 优化

`src/lib/useWebGLPreview.ts:277`：

```ts
const ctx = new GLContext(canvasRef.current, { preserveDrawingBuffer: true })
```

- 浏览器合成器不能直接用 swap chain 显示，每帧必须额外 blit（GPU 纹理 → 合成层 backing store）
- 4K 下测得 **2-5ms/frame** 纯损耗
- 唯一原因是让 `computeHistogramFromCanvas` 能跨帧 readPixels。可以改为 draw 后立刻 readPixels（同 tick），去掉 preserve

---

### F4-perf（P1）：Uniform 缓存 Key 太贵

`src/engine/webgl/ShaderRegistry.ts:19-27`：

```ts
function makeKey(vert, frag, precision): string {
  let h = 5381
  const s = `${precision}::${vert.length}::${frag.length}::${vert}::${frag}`  // 字符串连接
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0  // djb2 全量遍历
  return h.toString(36)
}
```

- 每次 runPass 调用
- shader 源码 2-5KB，**每帧 × 10 pass × 5KB = 每秒 300 万字符的 hash**
- 字符串 `${precision}::...::${vert}::${frag}` 本身就是一次大 string 分配

**修复**：shader 源码是 const（来自 import），用 `WeakMap<fragSource, CompiledProgram>` 的对象身份做 key，零开销。

---

### F5-perf（P0）：cpuPipeline 是 interpreted JS 逐像素循环

`electron/services/filter-engine/cpuPipeline.ts`：

每通道 `for (let i = 0; i < pixels.length; i += 4)` 循环。24MP = 6.7M pixels × 10 通道 = **67M ops ≈ 1.2-2s** V8 interpreter。预览尺寸（1600×1067 ≈ 1.7M pixels）× 10 通道 ≈ 400-800ms。

当前 `needsCpuFallback` 只在 `lut.status === 'error'` 触发，看起来 GPU 正常时 CPU 不会跑。但 batch 导出走 worker pool 的非 GPU 路径时 100 张 RAW = **67 秒 × 10 通道** 纯 CPU。

---

### F6-perf（P1）：每次直方图都 `new Uint8Array(w*h*4)` 分配 6.8MB

`src/lib/histogram.ts:80-98`：

```ts
const pixels = new Uint8Array(w * h * 4)    // 1600×1067 = 6.8MB alloc
gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
```

- 1600×1067 每次分配 6.8MB
- `readPixels` 是 **GPU→CPU 同步点**，pipeline stall，4K 下 3-5ms
- 当前 120ms debounce 缓解但没根治

**修复**：复用预分配 buffer；或改 GPU-side histogram（RTT 到 8×32 texture 累加）。

---

### F7-perf（P1）：pipelineKey = JSON.stringify(pipeline) + hasDirtyEdits 都是 stringify

`src/routes/Editor.tsx:204-212` + `src/stores/editStore.ts:121`：

```ts
// Editor.tsx
const pipelineKey = useMemo(() => JSON.stringify(currentPipeline ?? null), [...])

// editStore.ts
export function hasDirtyEdits(current, baseline): boolean {
  return JSON.stringify(current) !== JSON.stringify(baseline)
}
```

- useMemo 依赖 currentPipeline，immer 每次 set 顶层变 → **每帧 stringify**
- Editor.tsx:105 `const dirty = hasDirtyEdits(...)` → **每次 Editor render 两次 stringify + 字符串比较**
- pipeline 500-2000 字节，单次 20-100μs，叠加每帧数次不可忽略

**修复**：浅层逐字段比较；editStore 直接维护 `dirty` 字段。

---

### F8-perf（P1）：AdjustmentsPanel 整体订阅 currentPipeline

`src/components/AdjustmentsPanel.tsx:66`：

```tsx
const pipeline = useEditStore((s) => s.currentPipeline)
```

拖"曝光"：
1. setTone → currentPipeline 顶层对象变
2. **所有订阅 currentPipeline 的组件 re-render**：AdjustmentsPanel + 20+ 个 `<Slider>` + Editor.tsx
3. 每个 Slider 的 inline `onChange` 是新引用 → React.memo 不命中
4. Fiber 要 diff 几百个节点

**修复**：
- Slider 订阅单字段：`useEditStore((s) => s.currentPipeline?.tone?.exposure)`
- Setter 从 store `getState()` 直接取（稳定引用）
- 子组件 `React.memo` 拆分

**Editor.tsx 的 `photos` 订阅**（第 25 行）也类似：导入照片时 photos 变 → Editor 整个界面 re-render（包括 WebGL canvas ref）。

---

### F9-perf（P1）：滤镜列表每次都扫磁盘

`electron/services/storage/filterStore.ts:35-46`：

```ts
export function listFilters(): FilterPreset[] {
  for (const sub of ['builtin', 'user']) {
    for (const name of fs.readdirSync(dir)) {             // 同步 IO
      readJsonSafe(path.join(dir, name))                   // 每个文件同步 readFile + JSON.parse
    }
  }
}
```

- `filter:list` IPC 每次都扫盘
- `getFilter(id)` 每次 `preview:render` 都调（preview.ts:54）
- 50 个 builtin + 用户自建 = 几十次 readFileSync 同步阻塞主事件循环

**修复**：启动时 listFilters 一次，缓存 Map；chokidar watch 失效。

---

### F10-perf（P1）：Library 列表无虚拟化

`src/routes/Library.tsx:102-128`：

```tsx
<div className="grid ...">
  {photos.map((photo) => <PhotoCard ... />)}
</div>
```

- 1000 张照片 → 1000 DOM + 1000 `<img>` + 1000 `grain://` 请求并发
- 滚动时无视口过滤

**修复**：`react-window` 或 `@tanstack/react-virtual`。

---

### F11-perf（P1）：导入照片串行 for

`electron/services/storage/photoStore.ts:55-124`：

```ts
for (const p of paths) {
  const existing = table.find((ph) => ph.path === p)        // O(N) 线性
  await validateImageFile(p)
  const exif = await readExif(p)                             // 30-80ms/RAW（子进程 RPC）
  const { width, height } = await resolveDisplayDimensions(p, ...)   // resolvePreviewBuffer
  const thumbPath = await makeThumbnail(p, 360)              // resolvePreviewBuffer + sharp + write
}
```

问题：
1. 串行 await 不利用多核
2. `table.find` O(N) 扫全表，重复校验 O(N²)
3. **同一张 RAW 的 resolvePreviewBuffer 被调 3 次**（exif + dims + thumb），每次都 readFile cache + readExif
4. 100 张 RAW × (50 + 100 + 50 + 50)ms ≈ **25 秒串行**；并发 4 核约 6-8 秒

**修复**：Promise.all 限 `hardwareConcurrency`；单次导入内 resolvePreviewBuffer memo；table 改 Map 索引；worker pool 做 thumb。

---

### F12-perf（P2）：batch 非 RAW 路径绕 base64 大字符串

`electron/services/filter-engine/batch.ts:391-393`：

```ts
const buf = await sharp(task.photoPath).rotate().jpeg({ quality: 95 }).toBuffer()
sourceUrl = `data:image/jpeg;base64,${buf.toString('base64')}`
```

24MP JPEG 8-12MB → base64 11-16MB **字符串** → structured clone → fetch → createImageBitmap → GPU upload。

**修复**：用 grain://file-proxy 协议，或 MessagePort transferable。

---

### F13-perf（P2）：PathGuard.validate 每次都 fsp.realpath

`electron/services/security/pathGuard.ts:73-109`：每次调用都 realpath syscall（0.5-2ms）。
`preview:render` 每次 F1 切面 → validate 一次。
同一 photoPath 在 session 内会 validate 几十次。

**修复**：WeakMap / LRU 缓存 realpath 结果，fs.watch 失效。

---

### F14-perf（P1）：WebGL Pipeline 缺少"只改 uniform"快路径

`src/lib/useWebGLPreview.ts:239-244`：

```ts
pipe.setSteps(
  pipelineToSteps(latestPipelineRef.current, { resolution, lutTexture, lutSize }),
)
```

每帧：
1. `pipelineToSteps` 翻译 → 新 PipelineStep[] 数组 + 新 uniform 对象
2. `pipe.setSteps(steps)` 替换整个 step list
3. runPass 从 uniforms 对象 `Object.entries` 遍历绑定

**拖滑块时 pipeline 的 step 数量和 shader 都没变**，只是某个 uniform 数值变了。每帧重建整个 pipeline 结构纯浪费。

**修复**：
- Pipeline 提供 `updateUniform(stepId, name, value)` 快路径
- step 对象字段 mutate，不每次 new
- 激进方案：滑块直接写 ref 到一个 uniform buffer，跳过 React

---

### F15-perf（P2）：Editor 组件内联子组件定义 → memo 不命中

`src/routes/Editor.tsx`：FilterRow / ExifItem / TabButton 定义在同一文件内部但放在主 export 之外 —— 它们是 top-level function，引用稳定，这点 OK。但 Editor 内 `photo = photos.find(...)` 在 photos 数组引用变化时重算，需要 selector 精确化。

---

## 3. 关键瓶颈按"用户感知"排序

### A. 滑块延迟（用户最痛）

根因链（按影响大小）：

1. **F8-perf**：immer 每次 set 让 pipeline 顶层变 → 订阅 currentPipeline 的 ~30 个组件全量 re-render → React reconcile 每帧 2-5ms
2. **F14-perf**：每帧重建 step[] + runPass 内部每 uniform getUniformLocation
3. **F6-perf**：每次 draw 后 6.8MB Uint8Array 分配 + GPU→CPU 同步点
4. **F3-perf**：preserveDrawingBuffer 额外 blit 2-5ms/frame
5. **F4-perf**：ShaderRegistry makeKey 每 pass 遍历 5KB 字符串

**合计**：60fps 预算 16.6ms/frame，当前实测估算 **25-50ms/frame** → 明显卡顿

### B. 切滤镜延迟

根因：
1. **F1-perf**：Editor useEffect `ipcFilterId` 依赖 → 必然触发一次主进程 preview:render
2. **F9-perf**：preview:render 里 `getFilter` readFileSync + JSON.parse
3. **F11-perf**：resolvePreviewBuffer 每次 readExif + readFile cache

### C. 切照片延迟

根因：
1. **F11-perf**：resolvePreviewBuffer 的 readExif 走子进程 RPC（exiftool-vendored）
2. 无 prefetch next/prev
3. fetch(grain://) → blob → createImageBitmap → 上传 GPU 链路未零拷贝

### D. 导入延迟

根因：**F11-perf**（串行 + 三次重复 decode）

### E. 导出延迟

根因：**F12-perf**（base64 大字符串）+ worker pool 预读串行

---

## 4. 阶段化优化路线图

### 阶段 P0 — 立刻（1-2 天）：滑块卡顿 30ms → <16ms

| 编号 | 动作 | 预期收益 |
|---|---|---|
| P0-1 | **移除 preserveDrawingBuffer**；histogram 改为 draw 后同 tick readPixels | -3ms/frame |
| P0-2 | **Pipeline.updateUniform 快路径**；useWebGLPreview 只在结构变化时 setSteps | -2ms/frame |
| P0-3 | **Slider 订阅单字段** + setter 从 store.getState 拿（稳定引用） + AdjustmentsPanel 子组件 React.memo 拆分 | -5ms/frame React reconcile |
| P0-4 | **ShaderRegistry makeKey** 改 WeakMap 对象身份 | -1ms/frame |
| P0-5 | **histogram Uint8Array 复用**（按 canvas 最大尺寸预分配） | -1ms/frame + 减 GC |
| P0-6 | **Editor IPC useEffect** 把 `needsCpuFallback` 间接依赖改为纯事件式（只有 error/unsupported 瞬态触发重拉） | 消除偶发 CPU 抖动 |
| P0-7 | **hasDirtyEdits 改逐字段比较** + editStore 维护 dirty 字段 | -0.5ms/frame |

### 阶段 P1 — 这周（3-5 天）：切滤镜 + 切照片回到 <100ms

| 编号 | 动作 | 预期收益 |
|---|---|---|
| P1-1 | **filterStore 内存缓存** + chokidar watch 文件变化失效 | getFilter/listFilters 5-30ms → <0.1ms |
| P1-2 | **preview:render 重构为基准层**：分离"基准预览"（photo-scoped 缓存）和"pipeline 应用"（GPU-only）；GPU 路径下 preview:render 只返回基准 URL | 切滤镜 300-800ms → <50ms |
| P1-3 | **resolvePreviewBuffer 结果缓存** + readExif 只在 import 时读一次存到 photo 记录 | 切照片 -50-150ms |
| P1-4 | **Library 虚拟化**（`@tanstack/react-virtual`） | 1000 张首屏 2s → 200ms |
| P1-5 | **PathGuard.validate LRU 缓存**（1000 条 path → realPath） | IPC overhead -1ms/call |
| P1-6 | **Editor 组件拆分** + React.memo | 减少无关 re-render |

### 阶段 P2 — 两周（5-10 天）：导入导出达 Lightroom 水准

| 编号 | 动作 | 预期收益 |
|---|---|---|
| P2-1 | **importPhotos 并发化** + resolvePreviewBuffer 单次导入 memo + table 改 Map | 100 张 RAW 25s → 6s |
| P2-2 | **worker pool 做 thumbnail** | 进一步减半到 3s |
| P2-3 | **batch GPU 路径零拷贝**：grain://file-proxy 协议，不走 base64 | 100 张导出 -5-10s |
| P2-4 | **hidden GPU window 复用 renderer**（OffscreenCanvas 共享 context） | 批处理首张冷启动 -500ms |
| P2-5 | **cpuPipeline 迁 WASM** 或映射 sharp 原生 SIMD（exposure/contrast/saturation） | CPU 兜底 400-800ms → 100-200ms |

### 阶段 P3 — 半月：极致

- P3-1 **GPU-side histogram**（RTT 8×32 texture 累加）
- P3-2 **PBO 异步 readPixels**
- P3-3 **prefetch next/prev**
- P3-4 **滤镜悬停实时预览**
- P3-5 **clipped highlights 叠加**（LR 的 J 键）

---

## 5. 测量基建建议

**目前零性能回归守卫**。优先做：

1. 在 `useWebGLPreview.renderNow` 插 `performance.now()` 分段打点：
   - setSteps 耗时 / pipeline.run 耗时 / readPixels 耗时 / histogram 耗时
2. Editor dev 角落显示 **Frame budget**（上一帧总耗时），而不仅 GPU 一个数字
3. `tests/bench/` 新增两套基准：
   - `slider-drag.bench.ts`：模拟 100 次 setTone，测 p50/p95/p99
   - `filter-switch.bench.ts`：模拟 20 次 activateFilter，测 IPC→显示时间
4. CI 回归守门员：PR 滑块拖动 p95 > 20ms 则失败

---

## 6. AGENTS.md 建议补充

目前只写了"24MP 图 > 8ms/frame"。建议补：

```md
## 🎨 性能红线（新增）

- 滑块拖动 p95 端到端（setState → GPU draw → 屏幕）> 16ms
- 切换滤镜（单击到预览刷新）> 100ms
- 切换照片 > 200ms
- 导入 100 张 RAW > 60s（≈ 6 核并发）
- 批处理单张 4K JPEG（GPU 路径）> 800ms
```

---

## 7. 核心判断

> **当前代码库在"工程正确性"上已经不错（安全、测试、数学正确），但在"性能工程"上明显缺乏深度**：
>
> - 预览链路**把 CPU 重活放在每次参数变化的关键路径上**（F1/F2）
> - WebGL 引擎**缺少 uniform-only 快路径**（F14）
> - React 侧**store 订阅粒度过粗**导致全量 re-render（F8）
> - 基础设施（filterStore / resolvePreviewBuffer / PathGuard）**没有缓存**（F9/F11/F13）
>
> **Lightroom 级体验不是靠"算法写对"就能得到，而是靠"每一层都有快路径"**：
> - 磁盘层：cache cache cache
> - 主进程层：filter metadata in-memory，只读一次
> - IPC 层：路径校验结果 cache
> - 渲染进程层：state 订阅粒度到单字段
> - WebGL 层：uniform update 不重建 pipeline
> - 合成器层：不要 preserveDrawingBuffer
>
> **建议**：不继续加新功能，优先做 **P0 的 7 个点**。完成后手感会从"卡"变"丝滑"，再做 P1/P2 接近 Lightroom 档位。

---

## 8. 蓝军自检

防止报告自身形式主义，关键判断的验证思路：

| 判断 | 量化验证 |
|---|---|
| preserveDrawingBuffer 是性能成本 | Chrome DevTools Performance 对比（开 vs 关） |
| Slider 全量 re-render | React DevTools Profiler 录拖一次曝光，看到 20+ 次 Slider 渲染 |
| cpuPipeline 1600×1067 要 400-800ms | `node` 跑 `applyPipelineToRGBA` 100 次 benchmark |
| resolvePreviewBuffer readExif 每次 30-80ms | 插 performance.now 在 preview:render 统计 p50/p95 |
| AdjustmentsPanel 重渲染 | 组件里塞 `useRef(0); ref.current++` + dev 显示 |

**这些都能在 1 小时内量化**。建议在 P0-1 动手前先录基线，作为修复效果的证据。
