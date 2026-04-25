# Benchmarks

本目录记录 GrainMark 性能敏感路径的 benchmark 数据。

## 目录结构

- `baseline.json` —— 机器可读的基线（hz + mean + updatedAt/per case）；被 `bench-report.ts` 用作对比锚点
- `YYYY-MM-DDTHH-MM.md` —— 每次 `npm run bench:report` 或 `npm run bench:baseline` 产出的一份时间戳报告，包含与基线的 ± 变化

## 使用

```bash
# 1. 只出报告，不更新基线（PR / 本地自查用）
npm run bench:report

# 2. 更新基线（仅在确认当前性能是"新基准"时用，会覆盖 baseline.json）
npm run bench:baseline

# 3. 直接跑 bench，不生成报告
npm run bench:run
```

## 覆盖的 benchmark 套件

| 文件 | 用途 |
|---|---|
| `tests/bench/histogram.bench.ts` | computeHistogramFromRgba 三档分辨率 × 三档 stride（Editor 直方图的实际运行路径） |
| `tests/bench/namingTemplate.bench.ts` | sanitizeFilename / renderNamingTemplate / resolveConflict（批处理命名） |
| `tests/bench/pipelineSharp.bench.ts` | 批处理 CPU 管线：passthrough / 单通道 / 全 6 通道 × 3 输出格式 |
| `tests/bench/pipelineToSteps.bench.ts` | 每次 renderNow 都调用一次，必须是亚微秒级 |

## 对齐 AGENTS.md 的性能红线

| 红线 | 对应 bench 文件 |
|---|---|
| WebGL 预览 24MP > 8ms/frame | ⏳ 需 Playwright + electron in-page benchmark（下一轮） |
| 图像解码 24MP > 120ms | `pipelineSharp.bench.ts` 的 passthrough 项 |
| `npm test` 全量 > 60s | `bench-output.json` 包含单元测试总耗时（通过 vitest native） |

## 哲学

- 机器可读：所有 bench 走 `vitest --outputJson`，`scripts/bench-report.ts` 把它翻译成人类可读 Markdown + 与 baseline.json 自动对比
- **可追溯**：每一份时间戳报告都 committed 到 git，长期趋势可回顾
- **稀疏基线**：只对"期望稳定不回归"的路径建立基线；实验性 / 研究性 bench 不进 baseline
- **±10% 容差**：CPU / 内存 / JIT warmup 带来的自然抖动被视为 `~`，只有 > 10% 的变化才算改善或回归
