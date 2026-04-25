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
| 壳 | Electron 32 |
| 前端 | React 18 + TypeScript + Vite |
| UI | Tailwind CSS + Aurora Glass Design System + Lucide Icons |
| 状态 | Zustand + Immer |
| 图像（GPU） | WebGL 2 自研 pipeline（10 个 shader，ping-pong 双缓冲，AbortController 取消） |
| 图像（CPU） | Sharp (libvips) —— RAW 内嵌 JPEG 提取 + 缩略图 + 批处理 |
| RAW | exiftool-vendored 抽取内嵌 JPEG（不做真 bayer demosaic） |
| EXIF | exiftool-vendored |
| AI | ONNX Runtime（待接入 M7） |
| 存储 | JsonTable 轻量文档库 + 磁盘 LRU RAW 预览缓存（2GB 可调） |

## 🚀 开发

```bash
npm install
npm run dev       # 启动 Electron 开发环境
npm run build     # 构建 + 打包 (当前平台)
npm run pack:mac  # 仅打包 macOS
npm run pack:win  # 仅打包 Windows
npm run pack:linux
```

## 📁 项目结构

```
GrainMark/
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 入口
│   ├── preload.ts               # IPC 桥
│   ├── menu.ts                  # 跨平台菜单 + 快捷键路由
│   ├── protocol/grain.ts        # 自定义 grain:// 协议（PathGuard 守卫）
│   ├── ipc/                     # IPC 路由
│   ├── services/
│   │   ├── filter-engine/       # thumbnail / preview 渲染
│   │   ├── lut/                 # 3D LUT 读写（复用 shared/cubeParser）
│   │   ├── exif/                # EXIF
│   │   ├── raw/                 # RAW 内嵌 JPEG 抽取 + 磁盘 LRU 缓存（Pass 2.8）
│   │   ├── extractor/           # 参考图提取
│   │   ├── storage/             # JsonTable 文档库
│   │   └── security/            # PathGuard / ImageGuard
│   └── assets/presets/          # 30 款内置滤镜
├── shared/                      # 主/渲染共享
│   ├── types.ts                 # 统一类型
│   ├── ipc-schemas.ts           # IPC zod schema
│   └── cubeParser.ts            # .cube LUT 纯解析器（Pass 3b-2）
├── src/                         # React 渲染进程
│   ├── routes/                  # 9 页路由（Library/Editor/Batch/Filters/...）
│   ├── components/              # Sidebar / TopBar
│   ├── design/                  # Aurora Glass 设计系统 tokens + 原子组件
│   ├── engine/webgl/            # WebGL 2 引擎（Pass 3a/3b）
│   │   ├── GLContext.ts         # 上下文 + 精度降级 + lost/restored
│   │   ├── ShaderRegistry.ts    # djb2 编译缓存
│   │   ├── Texture.ts           # 2D/3D 纹理 + FBO
│   │   ├── Pass.ts / Pipeline.ts
│   │   └── shaders/             # 10 个 filter shader
│   ├── lib/                     # hooks + 工具
│   │   ├── useWebGLPreview.ts   # GPU 预览主 hook
│   │   ├── useLutTexture.ts     # LUT 3D 纹理异步加载
│   │   ├── useAppNavigation.ts  # 菜单 → 路由桥接
│   │   └── useGlobalHotkeys.ts  # ⌘,/⌘1..9 渲染端兜底
│   └── stores/                  # Zustand 状态
└── tests/                       # vitest 单测（306 passed）
```

## 🗺 当前进度

### 里程碑

| 里程碑 | 状态 | 内容 |
|---|---|---|
| **M1** | ✅ 完成 | 项目骨架 + IPC + 路由 + 状态 + 存储 + 30 滤镜 |
| **M1.5 P1** | ✅ 完成 | 安全加固（PathGuard / ImageGuard / NAV 白名单） |
| **M1.5 P2** | ✅ 完成 | Silver Halide 设计系统初版 |
| **M1.5 P2.5** | ✅ 完成 | **Aurora Glass 设计系统**（玻璃拟态 + 60s 极光漂移 + Instrument Serif） |
| **M1.5 P2.8** | ✅ 完成 | **RAW 透明预览**（24 格式内嵌 JPEG 抽取 + 2GB 磁盘 LRU + 竖屏 orientation 修复） |
| **M1.5 P3a** | ✅ 完成 | **WebGL 2 引擎骨架**（5 件套 + ping-pong + AbortController） |
| **M1.5 P3b-1** | ✅ 完成 | **7 个 GPU filter shader**（WB/HSL/Curves/ColorGrading/Adjustments/Grain/Halation） |
| **M1.5 P3b-2** | ✅ 完成 | **LUT3D shader**（WebGL 2 TEXTURE_3D + 半像素校正 + LRU 纹理缓存） |
| **M2** | ✅ 完成 | **完整 Pipeline 执行器 + 实时预览 + editStore + 手动调整面板 + 实时 GPU 直方图** |
| **M3-a** | ✅ 完成 | **批处理 Worker Pool**（worker_threads + sharp · 6 通道保真 · 进度事件 · cancel · 命名模板 · EXIF 保留 · 5 种格式） |
| **M3-b** | 待办 | 批处理接入隐藏 BrowserWindow 跑完整 GPU 管线（消除 curves/hsl/colorGrading/grain/halation/lut 的 batch 覆盖缺口） |
| **M4** | 待办 | 编辑器 UI（历史栈 / 撤销重做 / 前后对比） |
| **M5** | 待办 | 参考图 L2 提取 + .cube 烘焙 |
| **M6** | 待办 | 水印 Sharp 渲染实装 |
| **M7** | 待办 | ONNX Runtime 接入 + 5 种本地 AI 模型 |
| **M8** | 待办 | 社区数据采集器 |
| **M9** | 待办 | 云同步适配器 |
| **M10** | 待办 | 设置完善 + electron-builder 三平台打包 |

### 🎞 GPU 滤镜管线（M1.5 P3 成果）

按 Lightroom 约定顺序执行；每个 step 有 `isIdentity()` 快速跳过，避免浪费 ping-pong：

```
WB → Tone → Curves → HSL → ColorGrading → Adjustments(clarity/sat/vib)
   → LUT3D → Halation → Grain → Vignette
```

| Shader | 文件 | Uniform | 状态 |
|---|---|---|---|
| Tone | `shaders/tone.ts` | exposure/contrast/highlights/shadows/whites/blacks | ✅ |
| Vignette | `shaders/vignette.ts` | amount/midpoint/roundness/feather | ✅ |
| White Balance | `shaders/whiteBalance.ts` | temp/tint | ✅ |
| HSL | `shaders/hsl.ts` | 24-float（8 通道 × H/S/L） | ✅ |
| Color Grading | `shaders/colorGrading.ts` | shadows/midtones/highlights + blending + balance | ✅ |
| Curves | `shaders/curves.ts` | 4 × 256 LUT（RGB + R + G + B） | ✅ |
| Adjustments | `shaders/adjustments.ts` | clarity（unsharp mask）+ sat + vibrance | ✅ |
| Grain | `shaders/grain.ts` | amount/size/roughness + 中间调 mask | ✅ |
| Halation | `shaders/halation.ts` | 9-tap 红泛光 blur + threshold | ✅ |
| LUT3D | `shaders/lut3d.ts` | WebGL 2 sampler3D + 半像素校正 + intensity | ✅ |

所有 filter 通道现在**全量 GPU 渲染**；CPU 兜底仅在 LUT 文件解析失败的极少数情况触发。

### 📊 质量基线（实时）

| 指标 | 当前 | 红线 |
|---|---|---|
| 单元测试 | **395 / 395 通过**（29 文件，含 14 个像素级 snapshot） | ≥ 基线无回归 |
| 集成测试 | **5 / 5 通过**（Playwright + Electron 端到端批处理链路） | ≥ 基线无回归 |
| tsc --noEmit | **0 错误** | 0 |
| biome check | **0 警告**（146 文件） | 0 |
| 打包体积 | renderer 311KB · main 150KB · batch-worker.mjs 6.6KB · preload 0.55KB | dmg/exe ≤ 300MB |
| WebGL 预览性能 | M-series Mac 24MP Nms（UI 实时显示） | ≤ 8ms/frame |
| 实时直方图 | readPixels + 120ms debounce，不阻塞滑块 | 滑块 ≥ 60fps |
| 批处理吞吐 | 4 worker × sharp 约 30-50 张 24MP JPG/分钟（M 系列实测待补） | 可配置 1..16 并行 |
| 像素级 Snapshot | 14 张 100×100 PNG baseline（10 shader × 算法语义快照） | 单次 diff ≤ 0.5% |

## ⚖️ 版权与合规

- ❌ **不内置**任何受商标保护的品牌 Logo（Leica / Canon / Nikon 等）
- ✅ 用户可**自行上传**有权使用的 Logo 作为水印
- ✅ 内置滤镜基于**公开色彩科学论文**与色卡实测参数化复刻
- ✅ 社区数据**仅抓取公开元数据**（标签/名称/点赞），不抓取图片本身，遵守 robots.txt 与速率限制
- ✅ **不做 RAW 真 bayer demosaic** —— 使用相机厂内嵌 JPEG 预览，避开 LibRaw 的 GPL 限制与跨平台依赖噩梦

## 📐 开发准则

所有代码变更必须遵循 [AGENTS.md](./AGENTS.md) 的六大原则和五项强制检查：
1. 方案合理 · 性能至上 · 安全兜底 · 测试覆盖 · 每轮复盘 · 提交可追溯
2. 变更影响范围分析 / 冗余清理 / 静态检查零回归 / 单测同步并全绿 / 可运行自测

## 📝 License

MIT
