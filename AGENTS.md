# AGENTS.md — GrainMark 项目协作准则

> 本文件定义了 AI Agent（以及任何贡献者）参与本项目时必须遵循的**最高优准则**。  
> 违反任一准则即视为交付不合格。

---

## 🎯 六大工作原则

1. **方案合理** — 任何结构性变更前必须先出方案或在 plan 中有对应条目
2. **性能至上** — 性能敏感路径的改动必须附带 benchmark 对比
3. **安全兜底** — 任何文件/路径/凭证/网络操作必须经过安全守卫
4. **测试覆盖** — 核心算法 ≥ 80%，UI ≥ 80%，整体 ≥ 80%
5. **每轮复盘** — 每个 Pass / 阶段结束输出 retrospective 文档
6. **提交可追溯** — 每个任务完成即 `commit` + `push`；每次修改必须说明「改了什么 · 为什么改 · 是否有更优方案」

---

## ✅ 每次代码提交前必做的 5 项检查

### 1. 变更影响范围分析
- 修改任一符号前必须用 `search_content` / `codebase_search` 列出所有引用点
- 简述受影响的文件和模块
- 识别潜在的 break change

### 2. 冗余代码即时清理
- 扫描并删除未使用的 import / 函数 / 变量
- 不保留"以防万一"的旧实现
- 注释掉的代码要么删除，要么加 TODO 注明保留原因

### 3. 静态检查零回归
- `npx tsc --noEmit` 要求 **0 错误**
- `biome check .` 要求 **0 警告**
- 不得把新引入的错误归为"历史遗留"

### 4. 单元测试同步更新并全绿
- `npm test` 全通过
- 覆盖率不低于当前基线
- 若语义变更导致旧测试过时必须**修正断言**而不是跳过
- 新增分支必须补充用例
- 核心算法改动必须补像素级快照测试

### 5. 可运行自测
- 对 server / agentLoop / 工具 / 运行时路径的改动，交付前做**最小 dry run**
- Electron 改动需用 `npm run preview` 验证打包后效果
- 安全相关改动需跑通对应的威胁回归测试

### 6. Git 提交与推送
- **每个任务完成必须立即 `git commit` + `git push`**
- 提交 message 遵循 Conventional Commits：`<type>(<scope>): <subject>`
  - `type`: `feat` / `fix` / `refactor` / `perf` / `test` / `chore` / `docs` / `sec`
  - `scope`: `p1-security` / `p1-test` / `engine` / `ai` / `design` 等
  - 示例：`feat(p1-security): add PathGuard with symlink-safe resolution`
- **commit body 必须回答三个问题**：
  1. **改了什么**（What）— 新增/修改/删除了哪些符号和文件
  2. **为什么要这么改**（Why）— 解决的问题 / 对应的准则或 plan 条目
  3. **是否有更好的修改方案**（Alternatives）— 考虑过的其他方案及未选原因；没有则写 "已评估为最优"
- **不得跳过 hooks**（不使用 `--no-verify`）
- **不得使用 `git commit --amend`**，除非用户明确要求
- **不得 force push**，除非用户明确要求且不涉及 main 分支

Commit body 模板：

```
<type>(<scope>): <subject>

What:
- 新增/修改/删除了 xxx
- 涉及文件：A, B, C

Why:
- 对应 M1.5 P1 的 xxx 工作项
- 解决了 xxx 问题（或对应 AGENTS.md 第 X 条准则）

Alternatives:
- 方案 A：...（未选原因）
- 方案 B：...（未选原因）
- 最终选择：...（理由）

Verification:
- tsc: 0 errors
- biome: 0 warnings
- tests: N/N passed, coverage X%
```

---

## 📝 交付回复的强制结构

每次 AI 交付代码变更，**回复末尾必须附「校验结果」块**：

```markdown
## 校验结果

- **变更影响范围分析**：[简述修改的文件/符号/引用点]
- **冗余代码即时清理**：[扫描结果 + 清理项]
- **静态检查零回归**：tsc --noEmit [0/N] 错误 · biome [0/N] 警告
- **单元测试同步更新并全绿**：vitest [N/N] 通过 · 覆盖率 [X%]
- **可运行自测**：[具体验证了什么流程]
- **Git 提交与推送**：commit [hash] · message 含 What/Why/Alternatives · pushed to [branch]
```

**若违反任一条准则**：
- 不得声明"完成"
- 必须在回复中显式标注"⚠️ 未遵循准则 X，原因：..."
- 若用户指令与准则冲突，先警告风险，用户坚持则在总结中显式标注"未遵循准则 X"

---

## 🔐 安全红线

以下操作**绝对禁止**：

- ❌ 内置任何受商标保护的品牌 Logo（Leica / Canon / Nikon 等）
- ❌ 存储明文凭证到 JSON 文件
- ❌ 渲染进程接触 Node API（必须走 contextBridge）
- ❌ IPC 接收路径参数不过 PathGuard
- ❌ 加载非白名单的 ONNX 模型
- ❌ 日志中输出原始 token / apiKey / path（必须脱敏）
- ❌ 未经用户明确同意上传任何数据（包括崩溃报告）
- ❌ 直接抓取他人版权保护的图片作品
- ❌ 禁用 CSP 或开启 `nodeIntegration: true`

---

## 🧪 测试分层约定

| 层 | 工具 | 何时运行 |
|---|---|---|
| 类型检查 | tsc | 每次保存（IDE 实时） |
| Lint | biome | 每次保存（IDE 实时） |
| Unit | vitest | commit 前本地 + CI 必跑 |
| Image Snapshot | vitest + pixelmatch | PR 前本地 + CI 必跑 |
| Visual Regression | playwright | PR 前本地 + CI 必跑 |
| Integration | playwright + electron | 本地可选 + CI 必跑 |
| E2E | playwright + electron | **仅 PR 和 main push**（本地 commit 不跑） |
| Packaged Smoke | playwright + packed artifact | 仅 release 分支 |
| Benchmark | vitest bench | 性能敏感 PR + 定期 |

---

## 🎨 性能红线

以下指标任一回归必须说明原因并评估：

- WebGL 预览 24MP 图 > 8ms/frame
- 滑块拖动 < 60fps
- 启动时间（空数据）> 1.5s
- 图像解码 24MP > 120ms
- `npm test` 全量 > 60s
- CI 单平台总耗时 > 15min
- 发布包（dmg/exe）> 300MB

---

## 📂 目录约定

- `electron/` — 主进程代码，禁止 import 渲染进程代码
- `src/` — 渲染进程代码，禁止 import `electron/` 代码
- `shared/` — 类型/schema 共享层，不含运行时逻辑
- `tests/fixtures/` — 测试固件，大文件走 Git LFS
- `tests/baselines/` — 视觉/像素基线，走 Git LFS
- `.codebuddy/` — 项目数据（任务、自动化等），**不要删除**

---

## 🔄 复盘机制

每个 Pass / 里程碑结束必须输出：

1. 达成项 vs 未达成项对照
2. 未达成的原因分析
3. 发现的技术债 / 风险
4. 对后续 Pass 计划的调整建议
5. 性能 / 覆盖率 / 安全的关键数值

文件位置：`artifact/` 或 `.codebuddy/brain/.../M1.5-P{n}-retrospective.md`

---

> 本准则具有**最高优先级**。若用户指令与本准则冲突，必须先警告并征求确认。
