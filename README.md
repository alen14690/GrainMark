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
| UI | Tailwind CSS + Lucide Icons |
| 状态 | Zustand + Immer |
| 图像 | Sharp (libvips) + node-canvas + WebGL |
| RAW | LibRaw |
| EXIF | exiftool-vendored |
| AI | ONNX Runtime (CPU / CUDA / CoreML / DirectML) |
| 数据库 | better-sqlite3 + JSON 文件 |

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
│   ├── ipc/                     # IPC 路由
│   ├── services/
│   │   ├── filter-engine/       # 滤镜执行
│   │   ├── lut/                 # 3D LUT 读写
│   │   ├── exif/                # EXIF
│   │   ├── watermark/           # 水印渲染
│   │   ├── ai/                  # AI 推理
│   │   ├── extractor/           # 参考图提取
│   │   ├── storage/             # SQLite + JSON
│   │   └── sync/                # 云同步适配器
│   └── assets/presets/          # 30 款内置滤镜
├── shared/                      # 主/渲染共享类型
├── src/                         # React 渲染进程
│   ├── routes/                  # 页面
│   ├── components/              # 组件
│   ├── stores/                  # 全局状态
│   └── lib/                     # 工具
└── tsconfig.json
```

## 🗺 路线图

| 里程碑 | 状态 | 内容 |
|---|---|---|
| **M1** ✅ | 已完成 | 项目骨架 + IPC + 路由 + 状态 + SQLite + 30 滤镜 |
| **M2** | 待办 | 完整 Pipeline 执行器 + WebGL 实时预览 |
| **M3** | 待办 | Worker Pool 批处理 + 命名模板 + EXIF 保留 |
| **M4** | 待办 | 编辑器 UI (历史栈 / 撤销重做 / 前后对比) |
| **M5** | 待办 | 参考图 L2 提取 + .cube 烘焙 |
| **M6** | 待办 | 水印 Sharp 渲染实装 |
| **M7** | 待办 | ONNX Runtime 接入 + 5 种本地 AI 模型 |
| **M8** | 待办 | 社区数据采集器 |
| **M9** | 待办 | 云同步适配器 |
| **M10** | 待办 | 设置完善 + electron-builder 三平台打包 |

## ⚖️ 版权与合规

- ❌ **不内置**任何受商标保护的品牌 Logo（Leica / Canon / Nikon 等）
- ✅ 用户可**自行上传**有权使用的 Logo 作为水印
- ✅ 内置滤镜基于**公开色彩科学论文**与色卡实测参数化复刻
- ✅ 社区数据**仅抓取公开元数据**（标签/名称/点赞），不抓取图片本身，遵守 robots.txt 与速率限制

## 📝 License

MIT
