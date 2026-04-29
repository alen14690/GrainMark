# GrainMark AI 后期

> 专业级胶片风格照片后期桌面应用 — 参数化滤镜 · AI 修图 · 批量处理 · EXIF 驱动水印 · 云同步

## ✨ 核心特性

- 🎞 **30 款内置胶片滤镜**：Kodak Portra / Cinestill 800T / Fuji 400H / 王家卫风 / 日系清新...
- 🧪 **从参考图提取风格**：上传一张作品，AI 分析色调生成可复用滤镜（L2 = 色彩迁移 + 3D LUT 反推）
- ⚡️ **批量一键处理**：支持 JPEG / PNG / TIFF / HEIC / 14+ 种 RAW 格式
- 📷 **EXIF 驱动水印**：7 款模板，自动读取相机/镜头/光圈/快门/ISO
- 🤖 **本地 AI 能力**：降噪 / 超分 / 天空替换 / 瑕疵消除 / 滤镜推荐（全本地 ONNX 推理）
- ☁️ **云同步**：iCloud / OneDrive / Google Drive / 阿里云盘 / S3 / WebDAV
- 🔥 **社区热度榜**：合法采集公开元数据，实时反映胶片趋势

## 🧱 技术栈

| 层 | 选型 |
|---|---|
| 壳 | Electron 33 |
| 前端 | React 18 + TypeScript 5.6 + Vite 6 |
| UI | Tailwind CSS 3.4 + Aurora Glass Design System + Lucide Icons |
| 状态 | Zustand 5 + Immer 10 |
| 图像（GPU） | WebGL 2 自研 pipeline（10 个 shader，ping-pong 双缓冲，AbortController 取消） |
| 图像（CPU） | Sharp 0.33 (libvips) —— RAW 内嵌 JPEG 提取 + 缩略图 + 批处理 CPU 兜底（9/10 通道等价 GPU） |
| RAW | exiftool-vendored 29.1 抽取内嵌 JPEG（不做真 bayer demosaic） |
| EXIF | exiftool-vendored |
| AI（云端）| OpenRouter → GPT-4o / Gemini / Claude 等 vision 模型（M5-LLM） |
| AI（本地）| ONNX Runtime（待接入 M7） |
| 存储 | JsonTable 轻量文档库 + 磁盘 LRU 缓存（RAW 2GB + preview 500MB + thumb 孤儿清理） |

## 🚀 开发

```bash
npm install
npm run dev       # 启动 Electron 开发环境
npm run build     # 构建 + 打包 (当前平台)
npm run preview   # 构建后本地预览（含 tsc 检查）
npm run pack:mac  # 仅打包 macOS
npm run pack:win  # 仅打包 Windows
npm run pack:linux
```

## 📁 项目结构

```
GrainMark/
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 入口（CSP / sandbox / PathGuard / cacheSweeper）
│   ├── preload.ts               # IPC 桥（channel 白名单正则）
│   ├── menu.ts                  # 跨平台菜单 + 快捷键路由
│   ├── protocol/grain.ts        # 自定义 grain:// 协议（PathGuard + orientImage）
│   ├── ipc/                     # IPC 路由（Zod schema + PathGuard 切面）
│   │   └── safeRegister.ts      # 统一 IPC 注册器（参数校验 + 路径守卫 + 错误脱敏）
│   ├── services/
│   │   ├── raw/                 # RAW 统一入口：resolvePreviewBuffer + orientImage（SSOT）
│   │   ├── filter-engine/       # thumbnail / preview / batch / cpuPipeline
│   │   ├── batch/               # Worker Pool + GPU 渲染器 + pipelineSharp
│   │   ├── lut/                 # 3D LUT 读写（复用 shared/cubeParser）
│   │   ├── exif/                # EXIF（5s 超时 + timer 清理）
│   │   ├── llm/                 # OpenRouter LLM 顾问（场景分析 + 参数建议）
│   │   ├── extractor/           # 参考图风格提取
│   │   ├── storage/             # JsonTable + cacheSweeper（preview LRU + orphan thumb GC）
│   │   ├── security/            # PathGuard / ImageGuard / SecureVault
│   │   └── logger/              # 结构化日志（脱敏 + 磁盘沉淀）
│   └── assets/presets/          # 30 款内置滤镜
├── shared/                      # 主/渲染共享（零运行时逻辑）
│   ├── types.ts                 # 统一类型（HSLParams 严格类型化）
│   ├── ipc-schemas.ts           # IPC Zod schema
│   └── cubeParser.ts            # .cube LUT 纯解析器
├── src/                         # React 渲染进程
│   ├── routes/                  # 9 页路由（Library/Editor/Batch/Filters/...）
│   ├── components/              # AdjustmentsPanel / Sidebar / TopBar / AIAdvisorDialog
│   ├── design/                  # Aurora Glass 设计系统 tokens + 原子组件
│   ├── engine/webgl/            # WebGL 2 引擎
│   │   ├── GLContext.ts         # 上下文 + 精度降级 + lost/restored
│   │   ├── ShaderRegistry.ts    # intern id 编译缓存（P0-4 优化 82× 提速）
│   │   ├── Texture.ts           # 2D/3D 纹理 + FBO
│   │   ├── Pass.ts / Pipeline.ts
│   │   └── shaders/             # 10 个 filter shader
│   ├── lib/                     # hooks + 工具
│   │   ├── useWebGLPreview.ts   # GPU 预览主 hook（preserveDrawingBuffer=false + 跳帧直方图）
│   │   ├── useLutTexture.ts     # LUT 3D 纹理异步加载
│   │   ├── useAppNavigation.ts  # 菜单 → 路由桥接
│   │   └── useGlobalHotkeys.ts  # ⌘,/⌘1..9 渲染端兜底
│   └── stores/                  # Zustand 状态（appStore / editStore / perfStore）
├── tests/                       # vitest 单测 + playwright 集成测试
│   ├── unit/                    # 446+ 用例（含像素级 snapshot + Slider 映射契约）
│   ├── bench/                   # 27 项 benchmark 基线
│   └── baselines/               # 像素基线 PNG（Git LFS）
└── artifact/                    # 文档 + 复盘
    └── retrospective/           # 每轮复盘（12 份，M1→M3.5 + P0 + 架构审计）
```

## 🗺 里程碑进度

| 里程碑 | 状态 | 核心内容 | 关键 commit |
|---|---|---|---|
| **M1** | ✅ 完成 | 项目骨架 + IPC + 路由 + 状态 + 存储 + 30 滤镜 | — |
| **M1.5 P1** | ✅ 完成 | 安全加固（PathGuard + ImageGuard + safeRegister 切面 + CSP + sandbox） | `6f37884` |
| **M1.5 P2** | ✅ 完成 | Silver Halide 设计系统初版 | `a16653b` |
| **M1.5 P2.5** | ✅ 完成 | Aurora Glass 设计系统（玻璃拟态 + 60s 极光漂移 + Instrument Serif） | `ec0c22f` |
| **M1.5 P2.8** | ✅ 完成 | RAW 透明预览（24 格式内嵌 JPEG + 2GB LRU + orientation 修复） | `15c0912` |
| **M1.5 P3a** | ✅ 完成 | WebGL 2 引擎骨架（5 件套 + ping-pong + AbortController） | `fc3d53b` |
| **M1.5 P3b** | ✅ 完成 | 10 个 GPU shader（含 LUT3D TEXTURE_3D + 半像素校正） | `6a4ef03` |
| **M2** | ✅ 完成 | Pipeline 执行器 + 实时预览 + editStore + 手动调整面板 + 实时 GPU 直方图 | `dee0e96` |
| **M3-a** | ✅ 完成 | 批处理 Worker Pool（CPU 路径 6→9 通道保真 + 进度事件 + 5 种格式） | `e1251b1` |
| **M3-b** | ✅ 完成 | GPU 批处理（隐藏 BrowserWindow + 10 通道全覆盖 + CPU/GPU 自动分流） | `a411c12` |
| **M3.5** | ✅ 完成 | 补丁期（RAW 方向三轮修复 + 缩略图版本号 + Lightroom 滑块对齐 + bench 基建） | `4b9e797` |
| **M4** | ✅ 完成 | 编辑器 UI 闭环（撤销/重做 50 步 + 前后对比 + 保存为我的滤镜 + 滤镜三级分组） | — |
| **M4-patch** | ✅ 完成 | orientation 统一重构（orientImage SSOT + grain:// 修复 + 镜像 2/4/5/7 + 缓存 GC） | — |
| **M5-LLM** | ✅ 完成 | LLM 云 AI 顾问（OpenRouter + 场景分析 + 参数建议 + Zod 严校验 + clamp 护栏） | — |
| **M5-LLM-C** | ✅ 完成 | AI 5 维深度分析（光影/色彩/质感/主体/氛围）+ 全 10 通道参数建议 + 分组 UI | — |
| **M5** | 🔜 下一步 | 参考图 L2 风格提取 + .cube LUT 烘焙 | — |
| **M6** | 待办 | 水印 Sharp 渲染实装 | — |
| **M7** | 待办 | ONNX Runtime 接入 + 5 种本地 AI 模型 | — |
| **M8** | 待办 | 社区数据采集器（热度榜） | — |
| **M9** | 待办 | 云同步适配器（iCloud / OneDrive / S3 / WebDAV） | — |
| **M10** | 待办 | 设置完善 + electron-builder 三平台打包 + CI/CD | — |

### 🔧 已识别的技术债 & 优化方向

| 优先级 | 项目 | 当前状态 | 计划 |
|--------|------|----------|------|
| 🟡 P1 | CPU 镜像与 GPU shader 分叉 | `shaderCpuMirror.ts` 仍用旧线性系数，GPU 改为 `curve()·0.30` | M5 首周同步 |
| 🟡 P1 | HSL CPU 镜像仅简化版 | 8 通道完整版缺失 | 与 tone/WB 一起补 |
| ✅ 已修 | `before-quit` 异步清理不可靠 | `event.preventDefault()` + 显式 await + `app.quit()` | — |
| ✅ 已修 | `grain.ts` ID 正则允许 `..` | `id.includes('..')` 拒绝 + `fsp.stat()` 异步化 | — |
| ✅ 已修 | `safeRegister.ts` 依赖 Zod 内部 `_def.typeName` | 改用 `instanceof ZodTuple` | — |
| ✅ 已修 | `cloudEndpoints` 类型含 `apiKey` | 移除 apiKey 字段，凭证统一走 SecureVault | — |
| ✅ 已修 | HSL schema 允许任意 key | 改为 8 通道枚举 + `.strict()` | — |
| ✅ 已修 | 10 个 shader 各自定义 `clamp()` | 提取到 `shaders/mathUtils.ts` 共享 | — |
| ✅ 已修 | `filterStore` 全同步 I/O | 全部改为 `fsp.*` 异步 | — |
| ✅ 已修 | `preload.ts` 通道白名单含幽灵前缀 | 移除 `taste/score/evolve` | — |
| ✅ 已修 | `main.ts` 中 `void z` 死代码 | 清理无用 Zod import | — |
| ✅ 已修 | `perf.ts` WriteStream 无 error listener | 加 `.on('error', ...)` 降级处理 | — |
| ✅ 已修 | Editor 订阅全量 history/future 数组 | 改为 `s.history.length > 0` 标量选择器 | — |
| ✅ 已修 | `appStore` ipcOn 监听泄漏 | 加 `ipcPhotoRepairedRegistered` 防重注册 | — |
| ✅ 已修 | `hasDirtyEdits` 未利用 `_dirty` 快标 | 接入 `_dirty` 参数，O(1) 快速短路 | — |
| ✅ 已修 | `perfStore` 生产环境暴露调试钩子 | 加 `import.meta.env.DEV` 门控 | — |
| ✅ 已修 | `batch.ts` 使用 `readFileSync` | 改为 `fsp.readFile` | — |
| ✅ 已修 | 按钮缺少 `type="button"` | 全部补齐 | — |
| 🟢 P2 | CSP `connect-src` 含 `localhost:*` | 生产环境过于宽松 | M10 按 `VITE_DEV_SERVER_URL` 条件化 |
| 🟢 P2 | perf.ndjson 无日志轮转 | 长时间运行膨胀 | M10 加大小/天数轮转 |
| 🟢 P2 | GPU benchmark 缺失 | 仅有 CPU bench | Playwright in-page performance.now |
| 🟢 P2 | CI 工作流空 | `.github/workflows/` 无内容 | M10 GitHub Actions |
| ℹ️ 记录 | `Photo.dimsVerified: number \| boolean` 双类型 | `normalizeDimsVersion` 归一化 | 数据迁移后统一为 number |

### 🎞 GPU 滤镜管线

按 Lightroom 约定顺序执行；每个 step 有 `isIdentity()` 快速跳过，避免浪费 ping-pong：

```
WB → Tone → Curves → HSL → ColorGrading → Adjustments(clarity/sat/vib)
   → LUT3D → Halation → Grain → Vignette
```

| Shader | 文件 | Uniform | GPU | CPU 镜像 |
|---|---|---|---|---|
| White Balance | `shaders/whiteBalance.ts` | temp/tint | ✅ | ✅ |
| Tone | `shaders/tone.ts` | exposure/contrast/highlights/shadows/whites/blacks | ✅ | ✅ |
| Curves | `shaders/curves.ts` | 4 × 256 LUT（RGB + R + G + B） | ✅ | ✅ |
| HSL | `shaders/hsl.ts` | 24-float（8 通道 × H/S/L） | ✅ | ✅（简化版） |
| Color Grading | `shaders/colorGrading.ts` | shadows/midtones/highlights + blending + balance | ✅ | ✅ |
| Adjustments | `shaders/adjustments.ts` | clarity（unsharp mask）+ sat + vibrance | ✅ | ✅ |
| LUT3D | `shaders/lut3d.ts` | WebGL 2 sampler3D + 半像素校正 + intensity | ✅ | ❌（CPU 路径跳过） |
| Halation | `shaders/halation.ts` | 9-tap 红泛光 blur + threshold | ✅ | ✅ |
| Grain | `shaders/grain.ts` | amount/size/roughness + 中间调 mask | ✅ | ✅ |
| Vignette | `shaders/vignette.ts` | amount/midpoint/roundness/feather | ✅ | ✅ |

### 📊 质量基线（实时）

| 指标 | 当前 | 红线 |
|---|---|---|
| 单元测试 | **446+ 通过**（34 文件，含 14 像素级 snapshot + 17 Slider 映射契约 + orientation 覆盖） | ≥ 基线无回归 |
| 集成测试 | **6 / 6 通过** | ≥ 基线无回归 |
| tsc --noEmit | **0 错误** | 0 |
| biome check | **0 警告** | 0 |
| WebGL 预览 | M-series Mac 24MP ≤ 8ms/frame | ≤ 8ms/frame |
| 直方图采样 | 跳帧 ~50ms @ 60fps，不阻塞滑块 | 滑块 ≥ 60fps |
| 批处理吞吐 | 4 worker × sharp ~56ms/preview → 外推 24MP ~500 张/分钟 | 可配置 1..16 并行 |
| Benchmark | 27 用例 baseline（`npm run bench:report`） | 回归 > 10% 须解释 |
| 磁盘缓存 | RAW 2GB + preview 500MB + orphan thumb GC（启动时异步 sweep） | 上限可调 |

### 🏗️ 架构亮点（M4-patch 后）

1. **orientImage SSOT**：所有图片方向处理（旋转 + 镜像翻转）统一走 `raw/index.ts:orientImage()`，6 条消费路径零冗余（AGENTS.md #8 强制）
2. **cacheSweeper 统一 GC**：preview + thumb 孤儿清理由 `storage/cacheSweeper.ts` 单一入口管理，启动时异步触发不阻塞
3. **safeRegister 安全切面**：所有 IPC 通道强制 Zod 参数校验 + PathGuard 路径守卫 + 错误脱敏
4. **P0 性能优化三层**：Slider rAF 合并 → useWebGLPreview rAF 合并 → shader curve() 降敏
5. **editStore 50 步撤销**：commit 模式入栈 + dirty flag 快速脏判定 + Immer 不可变更新

## ⚖️ 版权与合规

- ❌ **不内置**任何受商标保护的品牌 Logo（Leica / Canon / Nikon 等）
- ✅ 用户可**自行上传**有权使用的 Logo 作为水印
- ✅ 内置滤镜基于**公开色彩科学论文**与色卡实测参数化复刻
- ✅ 社区数据**仅抓取公开元数据**（标签/名称/点赞），不抓取图片本身，遵守 robots.txt 与速率限制
- ✅ **不做 RAW 真 bayer demosaic** —— 使用相机厂内嵌 JPEG 预览，避开 LibRaw 的 GPL 限制与跨平台依赖噩梦

## 📐 开发准则

所有代码变更必须遵循 [AGENTS.md](./AGENTS.md) 的**九大原则**和提交前检查：
1. 方案合理 · 性能至上 · 安全兜底 · 测试价值优先 · 每轮复盘 · 提交可追溯
2. **视觉 Bug 诊断 SOP**（4 步：查数据 → 查磁盘 → 查 URL → 改代码）
3. **禁止散布式逻辑**（同一语义散布 ≥ 2 处即须提取为单一函数）
4. **缓存契约标准化**（key = path+mtime+size · 版本号 · GC · 异步写入）

## 📝 License

MIT
