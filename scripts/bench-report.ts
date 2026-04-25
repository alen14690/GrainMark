#!/usr/bin/env node
/**
 * bench-report.ts —— 汇总 vitest bench 的 JSON 输出到一份 Markdown 报告
 *
 * 流程：
 *   1. 读 bench-output.json（由 `npm run bench -- --outputJson=...` 产出）
 *   2. 按 file/describe 分组，列出 hz / avg(ms) / min(ms) / max(ms)
 *   3. 与 artifact/benchmarks/baseline.json 对比：每项标注 ↑ / ↓ / ~（±10% 视为无变化）
 *   4. 输出 artifact/benchmarks/<YYYY-MM-DDTHH-MM>.md
 *   5. 若传 --update-baseline，同步把当前结果写回 baseline.json
 *
 * 为什么不直接用 vitest 的默认输出：
 *   - 默认表格不持久化、没对比基线、没机器可读数据
 *   - AGENTS.md 原则 #2「性能敏感路径的改动必须附带 benchmark 对比」
 *     要求交付时能贴出「当前 vs 上次基线」的对照
 */
import fs from 'node:fs'
import path from 'node:path'

interface VitestBenchResult {
  name: string
  rank?: number
  rme?: number
  samples?: number[]
  mean?: number // ms
  min?: number
  max?: number
  hz?: number
  p75?: number
  p99?: number
  p995?: number
  p999?: number
}

interface VitestBenchGroup {
  /** describe() 的 full name，形如 `file/path > describe name` */
  fullName: string
  /** bench() 数组 */
  benchmarks: VitestBenchResult[]
}

interface VitestBenchFile {
  /** 文件相对路径 */
  filepath: string
  /** describe 分组 */
  groups: VitestBenchGroup[]
}

interface VitestBenchOutput {
  files: VitestBenchFile[]
}

interface BaselineEntry {
  hz: number
  mean: number
  updatedAt: string
}
type Baseline = Record<string, BaselineEntry>

const ROOT = path.resolve(process.cwd())
const INPUT = path.join(ROOT, 'bench-output.json')
const ARTIFACT_DIR = path.join(ROOT, 'artifact', 'benchmarks')
const BASELINE_PATH = path.join(ARTIFACT_DIR, 'baseline.json')

function loadJSON<T>(p: string, fallback: T): T {
  if (!fs.existsSync(p)) return fallback
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T
  } catch {
    return fallback
  }
}

function fmtMs(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  if (v < 0.001) return `${(v * 1000).toFixed(2)}μs`
  if (v < 1) return `${v.toFixed(3)}ms`
  return `${v.toFixed(2)}ms`
}

function fmtHz(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '—'
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M/s`
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K/s`
  return `${v.toFixed(0)}/s`
}

function compareSign(cur: number, base: number | undefined, higherIsBetter = true): string {
  if (base === undefined || !Number.isFinite(base) || base === 0) return '—'
  const deltaPct = ((cur - base) / base) * 100
  if (Math.abs(deltaPct) < 10) return `~ (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`
  const improved = higherIsBetter ? deltaPct > 0 : deltaPct < 0
  const sign = deltaPct >= 0 ? '+' : ''
  return improved ? `↑ ${sign}${deltaPct.toFixed(1)}%` : `↓ ${sign}${deltaPct.toFixed(1)}%`
}

function main(): void {
  if (!fs.existsSync(INPUT)) {
    console.error(`[bench-report] 找不到 ${INPUT}`)
    console.error('请先运行: npm run bench -- --outputJson=bench-output.json --run')
    process.exit(1)
  }

  const raw = loadJSON<VitestBenchOutput | { files?: VitestBenchFile[] }>(INPUT, { files: [] })
  const files = raw.files ?? []
  if (files.length === 0) {
    console.error('[bench-report] JSON 输出里没有 files 字段或为空')
    process.exit(1)
  }

  const baseline = loadJSON<Baseline>(BASELINE_PATH, {})
  const updateBaseline = process.argv.includes('--update-baseline')
  const nextBaseline: Baseline = { ...baseline }

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })

  const nowIso = new Date().toISOString()
  const filenameSlug = nowIso.replace(/:/g, '-').replace(/\..+$/, '')
  const outputPath = path.join(ARTIFACT_DIR, `${filenameSlug}.md`)

  const lines: string[] = []
  lines.push(`# Benchmark 报告 · ${nowIso}`)
  lines.push('')
  lines.push('| 平台 | Node | 产出 |')
  lines.push('|---|---|---|')
  lines.push(`| ${process.platform} ${process.arch} | ${process.version} | ${filenameSlug} |`)
  lines.push('')
  lines.push('> 对比基线：`artifact/benchmarks/baseline.json`。')
  lines.push('> ±10% 内视为波动（~），超出视为改善（↑）或回归（↓）。')
  lines.push('> hz = 每秒执行次数（越高越好）；mean = 单次平均耗时（越低越好）')
  lines.push('')

  let totalCases = 0
  let regressions = 0
  let improvements = 0

  for (const file of files) {
    const fileTitle = file.filepath.replace(/^.*\/tests\/bench\//, 'tests/bench/')
    lines.push(`## ${fileTitle}`)
    lines.push('')

    for (const group of file.groups ?? []) {
      // fullName 形如 "tests/bench/x.bench.ts > describe 名"，只取 describe 部分
      const describeName = group.fullName.includes(' > ')
        ? group.fullName.split(' > ').slice(1).join(' > ')
        : group.fullName
      lines.push(`### ${describeName}`)
      lines.push('')
      lines.push('| bench | hz | mean | min | max | vs baseline |')
      lines.push('|---|--:|--:|--:|--:|---|')

      for (const b of group.benchmarks ?? []) {
        totalCases++
        const key = `${fileTitle}::${describeName}::${b.name}`
        const base = baseline[key]
        const sign = compareSign(b.hz ?? 0, base?.hz, true)
        if (sign.startsWith('↑')) improvements++
        else if (sign.startsWith('↓')) regressions++

        lines.push(
          `| ${b.name} | ${fmtHz(b.hz)} | ${fmtMs(b.mean)} | ${fmtMs(b.min)} | ${fmtMs(b.max)} | ${sign} |`,
        )

        if (updateBaseline && b.hz && b.mean) {
          nextBaseline[key] = { hz: b.hz, mean: b.mean, updatedAt: nowIso }
        }
      }
      lines.push('')
    }
  }

  lines.push('---')
  lines.push('')
  lines.push('## 摘要')
  lines.push('')
  lines.push(`- 总用例数：**${totalCases}**`)
  lines.push(`- 改善（↑ > 10%）：**${improvements}**`)
  lines.push(`- 回归（↓ > 10%）：**${regressions}**`)
  lines.push(`- 基线时间：${baseline[Object.keys(baseline)[0] ?? '']?.updatedAt ?? '（无历史基线）'}`)
  if (updateBaseline) {
    lines.push('- ✅ 已更新基线文件：`artifact/benchmarks/baseline.json`')
  }

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8')
  console.log(`[bench-report] 已写入 ${outputPath}`)

  if (updateBaseline) {
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(nextBaseline, null, 2)}\n`, 'utf8')
    console.log(`[bench-report] 已更新基线 ${BASELINE_PATH}`)
  }

  if (regressions > 0) {
    console.warn(`[bench-report] ⚠️  ${regressions} 项回归超过 10%`)
    process.exitCode = 2
  }
}

main()
