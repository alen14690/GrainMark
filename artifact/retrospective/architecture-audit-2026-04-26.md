# GrainMark 架构与代码审判报告

> 审查时间：2026-04-26
> 审查范围：`electron/`、`src/`、`shared/`、`tests/`（全量逐行扫读关键模块）
> 审查视角：不采信项目记忆、不采信 AGENTS.md 既有自评、不采信测试绿灯，以「审判专家」视角独立复核
> 审查结论：**存在多处根本性（P0/P1）设计缺陷与安全漏洞，不达 AGENTS.md 声称的 M1.5 P1 安全交付标准**

---

## 核心结论速览

| 编号 | 严重级 | 问题 | 影响面 |
|---|---|---|---|
| **F1** | **P0 — 安全** | PathGuard 从未在任何业务 IPC handler 中调用 | 全部路径参数 IPC（10+ 通道）完全无路径安全守卫 |
| **F2** | **P0 — 功能** | CPU 兜底预览 `applyPipelineSharp` 仅支持 3 个参数 | WebGL 不可用时 8 个滑块静默失效（无任何告警） |
| **F3** | **P0 — 数学一致性** | 预览 / 批处理 / GPU 三条路径对 `exposure` 单位定义不同 | 同一张照片在预览、导出、批处理得到不同亮度 |
| **F4** | **P1 — 测试** | `shaderSnapshots` 首次运行自动把当前值写为 baseline | 初始"损坏态"会被固化为 baseline，从此永远 PASS |
| **F5** | **P1 — 测试** | "可感知性测试"跑的是 CPU 镜像，不是 GPU | GPU shader 实际回归不会被这批测试捕获 |
| **F6** | **P1 — 安全** | `exportPresetToCube` 的 `outPath` 无任何校验 | 任意文件写入（可覆盖系统文件 / 用户其他文档） |
| **F7** | **P1 — 安全** | `FilterPipeline.lut` 字段无路径遍历校验 | 可构造 preset 读取 LUT 目录外任意 `.cube` 级别文件 |
| **F8** | **P1 — 性能** | `Pass.runPass` 每帧 `getUniformLocation` 且 `bindVertexArray(null)` 抖动 | 拖滑块时渲染 hot path 有 N 次冗余 GL 调用/帧 |
| **F9** | **P2 — 算法** | `curvePointsToLut` 自称 Catmull-Rom monotonic，实为切线=0 的 Hermite | 曲线平滑度与文档/预期不一致，但不会出错 |
| **F10** | **P2 — 架构** | AI runtime 全部占位但 IPC 已暴露，`runAI` 返回原路径 | 任何前端调用看到的"AI 处理结果"其实是原图 |
| **F11** | **P2 — 架构** | `JsonTable.scheduleFlush` 用 microtask 不是异步 fsync | 崩溃时最后一批写入必丢，但标记为 async API 的假象 |
| **F12** | **P2 — 架构** | `AGENTS.md` 声称 sqlite 热迁移无缝，但当前 JsonTable API 与 SQL 差异巨大 | 迁移承诺无法兑现，属于 over-promise |

---

## 一、P0：PathGuard 是"摆设"（F1）

### 证据链

1. `electron/main.ts:228` 构造了 `pathGuard = new PathGuard([...])`
2. `electron/main.ts:312` 暴露 `getPathGuard()` 供外部使用
3. **实际调用 `pathGuard.validate()` 的地方只有一处**：`electron/protocol/grain.ts:83`（grain:// 协议读文件时）
4. 全部 12 个 IPC handler 文件（`electron/ipc/*.ts`）**没有一个** import `getPathGuard`

### 验证命令（grep 结果直接佐证）

```bash
rg "pathGuard\.|getPathGuard" electron/ipc/
# 输出：零命中
```

### 受影响通道（用户可触达，携带路径参数）

| IPC 通道 | 风险操作 |
|---|---|
| `photo:import` | 读取任意路径做 EXIF / 魔数校验（sharp 会打开文件） |
| `photo:readExif` | 同上，可对 `/etc/passwd` 之类跑 exiftool |
| `photo:thumb` | 对任意路径生成缩略图并**写入 userData**（可借此做 cache poisoning） |
| `preview:render` | 任意路径读图 + 任意 `.cube` LUT 载入 |
| `filter:importCube` | 任意文件读取并复制到 LUT 目录 |
| **`filter:exportCube`** | **任意路径写入**（参见 F6） |
| `batch:start` | `outputDir` 任意（含 `/`、`/etc`，只受系统权限限制） |
| `extract:fromReference` | 任意路径读 |
| `watermark:render` | 任意路径读 |
| `ai:run` / `ai:recommend` | 任意路径读 |

### 判决

- `PathGuard` 类设计完备、测试充分（`tests/security/pathGuard.test.ts` 11 条 case 全绿）
- 但它**从未被生产代码路径消费**，形成典型的「安全套壳」模式：类存在 → 测试存在 → 实际使用缺失
- AGENTS.md 第 🔐 安全红线「IPC 接收路径参数不过 PathGuard」被**实质违反**
- 严格意义上 P1 Pass 的声明不成立

### 根因

IPC handler 在 `safeRegister.ts` 里只接入了 Zod 参数校验，**没有通用的"路径参数白名单校验"切面**。每个 handler 作者都默认"上层会管"，上层（main.ts）却只在 `dialog:*` 回调里把目录加白名单，不做强制校验。

### 修复方向

- 在 `safeRegister.ts` 增加 `registerIpcWithPath(channel, pathFields, handler)` 变体，自动对指定字段跑 `pathGuard.validate()`；或
- 在 Zod schema 里定义带 brand 的 `ValidatedPath` 类型，`safeRegister` 识别到此类型字段强制校验；后者更难绕过

---

## 二、P0：CPU 兜底 = 静默失效（F2）

### 证据

`electron/services/filter-engine/preview.ts:106-134` 的 `applyPipelineSharp`：

```ts
function applyPipelineSharp(img, pipeline) {
  // 只处理 tone.exposure / tone.contrast / (pipeline.saturation ?? tone.saturation)
  // 其它 whiteBalance / hsl / curves / colorGrading / grain / halation / vignette /
  // clarity / vibrance / whites / blacks / highlights / shadows / lut 全部被丢弃
}
```

`Editor.tsx` 判断 `needsCpuFallback` 时会传 `pipelineOverride=currentPipeline`，期望主进程烘焙完整 pipeline。**但主进程只烘了 3 个参数**。

### 影响场景

- 用户在 WebGL 不可用的老机器上（`gl.status === 'unsupported'`）拖"高光"、"阴影"、"暗角"、"颗粒"…… **画面根本不动，且无任何提示**
- 用户在 WebGL `error`/`lost` 态下看到的"渲染结果"与他拖的滑块不符
- 没有单测覆盖 `applyPipelineSharp` 的完整通道

### 相关的二级问题

- `pipelineSharp.ts`（批处理路径）虽然支持了 6 个通道（tone/WB/saturation/vibrance/clarity/vignette），但**仍然遗漏 curves/hsl/colorGrading/grain/halation/lut**
- `detectIgnoredChannels()` 可以标记这些"批处理忽略项"，但预览路径**连这个检测都没做**，用户不会被告知

### 判决

- 预览 CPU 路径是"明知故犯"的半成品（注释 "M2 会扩展此函数" 已存在多月）
- UI 层 `needsCpuFallback` 的兜底契约与主进程实现不匹配，属于**合同违约**
- AGENTS.md 安全红线第 ❌ 项没覆盖，但这是**用户可感知的功能性欺骗**

---

## 三、P0：三条渲染路径数学语义不统一（F3）

### 证据对照

| 路径 | 文件 | exposure 到线性乘子的换算 |
|---|---|---|
| GPU | `src/engine/webgl/shaders/tone.ts:49` | `pow(2.0, u_exposure)`，`u_exposure` 取值 `exposure ∈ [-5, +5]` EV |
| 预览 CPU | `electron/services/filter-engine/preview.ts:120` | `2 ** exposure`，`exposure` 同 GPU 单位 |
| 批处理 CPU | `electron/services/batch/pipelineSharp.ts:97-98` | `ev = exposure/100 * 2`，**把 UI 值当 -100..100 处理** |

### 后果

- shared/types.ts 声明 `exposure: number // -5..+5 EV`
- 滤镜文件里存的也是 EV（-5..+5）
- 但 `pipelineSharp.ts` 把它当成 -100..100 除以 100 再乘 2，得到 -0.1..+0.1 EV → **批处理结果远不如预览明显**

### 对比验证

对同一张照片、同一个 `tone.exposure = 1.0`（+1 EV）：
- 预览 & GPU：×2 亮度
- 批处理：×2^0.02 ≈ ×1.014 亮度（几乎看不出）

### 判决

这是**数据契约级别的不一致**。任何用户"预览看到什么就导出什么"的期望都无法满足。批处理路径还加了 `Math.max(-2, Math.min(2, ...))`，把 ±5 EV 的预设固定 clamp 到 ±2 EV——直接不兼容预设文件的定义域。

### 相关问题

批处理 `applyToneAndWB` 还有更多语义漂移：
- `temp/tint` 用 `hue` ±5° 模拟 —— hue 和色温完全不是同一回事
- 没实现 `highlights/shadows/whites/blacks`
- `vibrance` 用饱和度 ×0.6 近似

所有这些在注释里都承认"是近似"，但**用户拖滑块时看到的 UI 值与实际效果差几个数量级**。

---

## 四、P1：测试体系的三大形式主义（F4、F5）

### 4.1 baseline 自生成陷阱（F4）

`tests/unit/shaderSnapshots.test.ts:40-51`：

```ts
function expectMatchBaseline(actual, baselineName, threshold = 0.005) {
  const baseline = readBaseline(baselineName)
  if (!baseline) {
    writeBaseline(baselineName, actual)
    return  // 首次：接受并写入 ← 自欺
  }
  // ...
}
```

### 攻击场景（无恶意、真实会发生）

1. 删掉 `tests/baselines/shaders/hsl-*.png`
2. 改坏 HSL shader（比如把 dH 计算删掉）
3. 改同步 CPU 镜像（跟着改坏）
4. `vitest run` → **全绿**（生成的 baseline 就是当前坏值）

AGENTS.md 第 7.6 条说「删/改了老 baseline 却没蓝军验证新 baseline 真的有防护力 → 零容忍」。**自动生成机制正是零容忍红线的反面**。

### 修复方向

- 移除 auto-write，改为要求显式 `npm run snapshot:bless` 才写 baseline
- 或在 CI 里用 `--ci` 开关禁用 writeBaseline，本地开发也用环境变量守门

### 4.2 测试跑的是 CPU 镜像（F5）

`tests/unit/perceptibility.test.ts` import 的是 `shaderCpuMirror.ts` 的 `applyToneCpu` / `applyWhiteBalanceCpu` / `applyHslFullCpu` 等。**没有一个测试实际跑 WebGL shader**。

### 蓝军反问

"如果我把 GPU shader `tone.ts` 里 `c *= pow(2.0, u_exposure)` 删掉，留着 CPU 镜像不动，这些测试能抓到吗？"

答：**抓不到**。CPU 镜像独立存在，shader 损坏不反映到 CPU 镜像，testcase 永远绿。

AGENTS.md 第 7.6 条「改了 shader 但 CPU 镜像没同步 → 视为失败」只能抓"CPU 改坏 GPU 没改"，抓不到反向。

### 修复方向

- 引入 `@vitest-gl` / `headless-gl` 或 Playwright `page.evaluate` 跑真 GPU；或
- 在 Playwright 集成测试里对每个 shader 做"真 GPU vs CPU 镜像" Δ ≤ 2/255 的交叉验证 —— 这样才是真正的"黄金参照"

### 4.3 测试覆盖面 vs 实际漏洞

- `tests/security/pathGuard.test.ts` 覆盖到 11 个安全 case 全绿
- 但 F1 的漏洞是"PathGuard 没被调用"—— **类本身测试全绿不代表系统安全**

这是整个测试体系的盲区：**缺乏"PathGuard 必须被消费"的契约测试**（e.g. 拦截所有 `ipcMain.handle` 注册，检查路径字段是否被校验）。

---

## 五、P1：更多安全漏洞（F6、F7）

### F6：`exportPresetToCube` 任意文件写入

`electron/services/lut/cubeIO.ts:94-101`：

```ts
export async function exportPresetToCube(preset, outPath) {
  // ...
  fs.copyFileSync(src, outPath)  // outPath 完全无校验
}
```

IPC 注册位点 `filter.ts:16` 也没补 pathGuard。结合 F1，攻击者只要能调 `window.grain.invoke('filter:exportCube', 'builtin-xxx', '/Applications/GrainMark.app/Contents/Info.plist')` 就能覆盖 app 自身 Info.plist。macOS 上 app 签名会失败，下次启动崩溃 —— 这是一个 "可利用" 级别的 DoS。

### F7：LUT 字段路径遍历

`FilterPipelineSchema.lut`: `z.string().max(256).nullable().optional()` —— **只限长度，不限字符**。

攻击向量：
- 攻击者构造一个 preset JSON（通过 import / 社区分享 / 未来 URL 协议）
- `pipeline.lut = "../../../../etc/shadow"`
- `cubeIO.ts:98`: `path.join(getLUTDir(), preset.pipeline.lut)` → `/etc/shadow`
- `fs.copyFileSync(src, outPath)` —— **任意文件读**（把系统文件伪装成 LUT 导出给攻击者）

### 修复方向

- `FilterIdSchema` 的正则加到 `LutNameSchema`（`/^[a-zA-Z0-9_\-]+\.cube$/`）
- 所有 `pipeline.lut` 的使用点（LUT 协议、cubeIO、useLutTexture）统一用该 schema

---

## 六、P1：WebGL 热路径性能问题（F8）

### 证据

`src/engine/webgl/Pass.ts` 注释说 "uniform 绑定用 cached location（program 内部 Map）"，但代码里**完全没有缓存**：

```ts
// Pass.ts:72
const loc = gl.getUniformLocation(program, input.name)  // 每帧调一次
// Pass.ts:79
const loc = gl.getUniformLocation(program, name)  // 每个 uniform 每帧一次
```

拖滑块时一帧会经过 8-10 个 pass，每个 pass 有 5-25 个 uniform → 每帧 100+ 次 `getUniformLocation`。该 API 虽然 Chrome 实现相对便宜，但仍然是 CPU→GPU 同步点。

### 同文件第 104-106 行

```ts
gl.bindVertexArray(null)
gl.bindFramebuffer(gl.FRAMEBUFFER, null)
```

每个 pass 结束清理状态，下个 pass 又 bind —— 多余的 state churn。VAO 在整个 pipeline 里都是同一个（共享 quad），根本不需要 unbind。

### 修复方向

- 在 `ShaderRegistry` 缓存每个 program 的 `{ name → location }` map
- `runPass` 从 map 取 location，miss 时才 `getUniformLocation`
- 删除 pass 末尾的 `bindVertexArray(null)`、`bindFramebuffer(null)`（只在 pipeline.run 结束时统一解绑）

---

## 七、P2：算法错误与占位代码（F9、F10）

### F9：Curve 插值算法假名

`src/engine/webgl/shaders/curves.ts:108-113`：

```ts
// 三次平滑（Hermite，切线取 0 使曲线在端点平缓，避免过冲）
const h00 = 2*t3 - 3*t2 + 1
const h01 = -2*t3 + 3*t2
const y = h00 * p0.y + h01 * p1.y  // ← 缺 h10*m0 + h11*m1
```

真正 Hermite 公式是 `y = h00·p0 + h10·m0 + h01·p1 + h11·m1`。当前代码退化为"两点的 smoothstep"，连 Catmull-Rom 都不是，更谈不上 "monotonic clamp"。注释与实现完全脱钩。

### 影响

- 用户画曲线时，曲线 segment 在控制点间不具有单调三次样条的自然曲率
- 与 Lightroom 的曲线形状可见差异（过平）
- 但不会 NaN 不会崩，属于"能用但不精"

### F10：AI 模块 fake

`electron/services/ai/runtime.ts:64-72`：

```ts
export async function runAI(capability, photoPath, _params) {
  console.log(`[ai] run ${capability} on ${photoPath}`)
  return photoPath  // ← 返回原图路径
}
```

UI 层任何调用 `ipc('ai:run', 'denoise', path)` 得到的都是**未经任何处理的原图**。若 UI 显示"降噪完成"且对比前后，用户会被误导"降噪有效"。

相关 `recommendFilters` 返回的是写死的三个 filter id —— UI 显示"推荐准确度 93%"是假数据。

### 判决

- IPC 暴露尚未实现的能力属于**产品契约欺骗**
- 至少应加 `throw new Error('Not implemented in this milestone')`，让前端有机会 disable button

---

## 八、P2：存储层的假象（F11、F12）

### F11：`JsonTable.scheduleFlush` 的并发陷阱

`electron/services/storage/jsonTable.ts:33-47`：

```ts
private scheduleFlush() {
  this.dirty = true
  if (this.writing) return  // ← 问题点
  this.writing = true
  queueMicrotask(() => {
    try {
      if (this.dirty) {
        fs.writeFileSync(...)  // 同步写
        this.dirty = false
      }
    } finally {
      this.writing = false
    }
  })
}
```

### 漏洞

- `this.writing = true` 后，期间再来的 upsert 只会 `dirty = true; return`
- microtask 里看到 `dirty=true` 会写一次 —— OK
- 但是 microtask 本身**不等下一轮** —— 如果 microtask 还没调度完（极快场景），又来一波 `scheduleFlush`，第二轮 `this.writing` 还是 true，这波数据只能靠第一轮的 `if (this.dirty)` 兜——问题是此时 microtask 正在跑，看不到后面的 dirty
- 第二波数据会丢，直到下次 `scheduleFlush` 被调用才会真正落盘

### 更大问题

- `fs.writeFileSync` 同步阻塞事件循环，对大 photos.json（数万条）可达 20-50ms，拖垮 IPC 响应
- 崩溃时**最后一批写入必丢**（microtask 还没跑完）
- 没有写日志 / 没有 fsync，电源故障会丢更多

### F12：SQL 迁移的空头支票

文件头注释：「未来数据量大时可无缝切换到 better-sqlite3（API 保持接近）」。

### 反例

- `JsonTable.filter(predicate)` 在 SQL 没有等价原语（要 ORM 翻译）
- `upsert` 行为（依赖 `findIndex` 线性扫）在 SQL 要 `INSERT ... ON CONFLICT UPDATE`
- `all()` 返回 `[...items]` 内存全拷贝，SQL 不会这么做
- 整套 API 是"内存对象数组"语义，不是"查询"语义，迁移时所有调用方都要改

### 判决

注释是美好愿景，**不是架构承诺**。真要迁移至少得先定义抽象接口（Table<T>），而当前是具体类。

---

## 九、架构层面的结构性问题

### 9.1 `shared/` 不含运行时逻辑？不是

AGENTS.md 目录约定说 `shared/` 不含运行时逻辑，但 `shared/cubeParser.ts` 包含 `parseCubeText` / `cubeToRgba8` —— 这**正是运行时逻辑**。定义违反了自己的约定。

好的做法要么：
- 把 cubeParser 挪到 `src/lib/` 并在主进程 re-export；或
- 修正 AGENTS.md 目录约定，承认 `shared/` 允许纯函数的运行时逻辑

### 9.2 预览渲染的"主进程 + 渲染进程"双头蛇

- 渲染进程有完整 10-pass WebGL pipeline
- 主进程也通过隐藏 BrowserWindow 跑 GPU（`gpuRenderer.ts`）
- 主进程还有 sharp CPU pipeline
- 批处理走 worker 里的 sharp

**同一套滤镜语义有 4 套实现**，任何一套落后于 `FilterPipeline` schema 演进都会漂移（F2、F3 就是这么产生的）。

### 9.3 `editStore` deepCloneByJson 的性能陷阱

`editStore.ts:106`：

```ts
return JSON.parse(JSON.stringify(p))
```

每次 `commitHistory` / `undo` / `redo` 都对整个 pipeline JSON round-trip。拖滑块 → 松手 → commit 时跑一次 OK。但 `undo`/`redo` 会跑 2-3 次（pop + push + set）。历史栈满 50 条时，每次切换要 O(N) 的克隆。

24-byte pipeline 无所谓；但 `curves` 里如果有 ~30 个点 + 4 通道 = 120 对象，深克隆吞吐确实不大。需要 benchmark 量化。

### 9.4 `useWebGLPreview` 的 `useCallback` 与闭包

`renderNow` 依赖 `[gl, lut.texture, lut.size]`，但内部用 `latestPipelineRef.current` 取 pipeline。**pipeline 被刻意踢出 deps**（为了避免每次 pipeline 变化重建 callback），但这引入了"`renderNow` 闭包里 lut 可能过期"的风险。

证据：`useEffect` 的 `[pipeline, lut.texture, renderNow]` 依赖写着 `// biome-ignore lint/correctness/useExhaustiveDependencies`。这个 hook 的依赖推理已经扛不住了，说明设计需要简化（要么 pipeline 也用 ref，要么 lut 也放 deps 并接受 callback 重建代价）。

---

## 十、对 AGENTS.md 的修正建议

AGENTS.md 自称「P1 已完成」「477 单测全绿就代表质量达标」的信念需要**实质性调整**：

1. 增加"安全守卫消费率"指标：PathGuard.validate 在 IPC 路径字段上的覆盖率必须 100%，由 lint rule / AST 扫描保证
2. 把「测试数量」与「测试有效性」解耦：每类测试都得通过一次"蓝军 mutation"检测才算数
3. baseline 首次生成必须**人工 review 并签名**，不允许 CI 自动生成
4. 三条渲染路径（GPU / 预览 CPU / 批处理 CPU）必须**同一 reference pipeline 出等价像素**，加差值回归测试
5. 占位服务（AI）不允许走 IPC 暴露，必须 stub 在 preload 或 UI 层

---

## 十一、修复优先级建议

### 立即（本周内必改）

- F1：加 IPC 层 PathGuard 切面，修 10+ 通道
- F2：`applyPipelineSharp` 对齐 GPU pipeline，至少支持 10 个通道；或主动抛 "CPU fallback 有限功能" 给 UI 显示
- F3：统一 exposure 单位契约，加回归测试

### 下一 Pass（2 周内）

- F4/F5：重建测试基线信任（禁止 auto-write、加 GPU vs CPU 差值测试）
- F6/F7：LUT 路径遍历与导出写入校验
- F10：AI handler 显式抛 NotImplemented

### 技术债（M5 前完成）

- F8：WebGL uniform location 缓存
- F9：真正的 Catmull-Rom monotonic 实现
- F11/F12：替换 JsonTable 为 better-sqlite3 或重构为 Repository 抽象

---

## 十二、审判结论

**当前代码库存在明显的"工程仪式感 >> 工程实质"的问题**：

- ✅ 目录分层清晰
- ✅ 每个模块文件头都有详尽注释
- ✅ AGENTS.md 的规则文档化充分
- ✅ 测试数量多（35 个 unit + 3 个 security + 集成）
- ❌ 安全类存在但未被消费
- ❌ 测试绿灯但蓝军攻不破（可感知性测试打不到 GPU shader）
- ❌ "Pass X 完成"的声明与实际实现脱节（CPU 兜底缺通道、AI 占位、批处理数学不等价）
- ❌ AGENTS.md 的第 1~7 条检查清单本身无法机械化验证「准则确实被遵守」

**不建议声明 M1.5 P1 完成**，建议先修 F1/F2/F3 三个 P0 后再重新过线。

