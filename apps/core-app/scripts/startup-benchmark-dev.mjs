#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const coreAppRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(coreAppRoot, '..', '..')
const reportDate = process.env.TUFF_STARTUP_REPORT_DATE || '2026-03-24'
const reportRoot = path.resolve(
  repoRoot,
  'docs',
  'engineering',
  'reports',
  `startup-dev-runs-${reportDate}`
)
const logsRoot = path.resolve(reportRoot, 'logs')
const dataRoot = path.resolve(reportRoot, 'data')

function parseArgs(argv) {
  const options = {
    mode: 'run',
    runs: 30,
    timeoutMs: 180000,
    traceDeprecation: false,
    continueOnFail: false
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--mode' && argv[i + 1]) {
      options.mode = argv[++i]
      continue
    }
    if (arg === '--runs' && argv[i + 1]) {
      options.runs = Number.parseInt(argv[++i], 10)
      continue
    }
    if (arg === '--timeoutMs' && argv[i + 1]) {
      options.timeoutMs = Number.parseInt(argv[++i], 10)
      continue
    }
    if (arg === '--traceDeprecation') {
      options.traceDeprecation = true
      continue
    }
    if (arg === '--continueOnFail') {
      options.continueOnFail = true
      continue
    }
  }

  if (!Number.isFinite(options.runs) || options.runs <= 0) {
    throw new Error('--runs 必须是正整数')
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5000) {
    throw new Error('--timeoutMs 必须 >= 5000')
  }

  return options
}

function padRun(n) {
  return String(n).padStart(2, '0')
}

function parseDuration(value, unit) {
  const numeric = Number.parseFloat(value)
  if (!Number.isFinite(numeric)) return null
  return unit === 's' ? Math.round(numeric * 1000) : Math.round(numeric)
}

function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length) - 1
  const index = Math.min(sorted.length - 1, Math.max(0, rank))
  return sorted[index]
}

function collectBlockingIssues(parsed) {
  const issues = []
  const pushUnique = (value) => {
    if (!issues.includes(value)) issues.push(value)
  }

  if (parsed.deprecations.length > 0) pushUnique('deprecation')
  if (parsed.warnCount > 0 || parsed.errorCount > 0) pushUnique('startup_logs_nonzero')

  if (parsed.startupHealthMs == null) {
    pushUnique('startup_health_missing')
  } else if (parsed.startupHealthMs >= 3500) {
    pushUnique('startup_health_over_budget')
  }

  const hasEventLoopLag = parsed.warnLines.some((line) =>
    line.toLowerCase().includes('event loop lag')
  )
  if (hasEventLoopLag) pushUnique('event_loop_lag')

  const hasNetworkRefused = [...parsed.warnLines, ...parsed.errorLines].some((line) => {
    const lower = line.toLowerCase()
    return (
      lower.includes('err_connection_refused') ||
      lower.includes('econnrefused') ||
      lower.includes('network guard cooldown') ||
      lower.includes('localhost:3200')
    )
  })
  if (hasNetworkRefused) pushUnique('telemetry_endpoint_unreachable')

  const hasPermissionIssue = [...parsed.warnLines, ...parsed.errorLines].some((line) => {
    const lower = line.toLowerCase()
    return lower.includes('eperm') || lower.includes('eacces') || lower.includes('photos library')
  })
  if (hasPermissionIssue) pushUnique('watcher_permission_issue')

  const hasNoHandler = [...parsed.warnLines, ...parsed.errorLines].some((line) =>
    line.includes('No handler')
  )
  if (hasNoHandler) pushUnique('ipc_no_handler')

  for (const item of parsed.topSlowModules) {
    if (item.durationMs >= 1200) {
      pushUnique(`slow_module:${item.name}`)
    }
  }

  return issues
}

function parseLogText(text) {
  const allLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const startupBoundaryIndex = allLines.findIndex((line) =>
    line.includes('Startup health check passed')
  )
  const lines = startupBoundaryIndex >= 0 ? allLines.slice(0, startupBoundaryIndex + 1) : allLines

  let allModulesLoadedMs = null
  let startupHealthMs = null
  let rendererReadyMs = null
  let startupAnalyticsMs = null

  const moduleLoads = []
  const eventLoopLags = []
  const slowIpc = []
  const warnLines = []
  const errorLines = []
  const deprecations = []

  for (const line of lines) {
    const allModulesMatch = line.match(/All modules loaded\s+([0-9.]+)(ms|s)/)
    if (allModulesMatch) {
      allModulesLoadedMs = parseDuration(allModulesMatch[1], allModulesMatch[2])
    }

    const startupHealthMatch = line.match(/Startup health check passed\s+([0-9.]+)(ms|s)/)
    if (startupHealthMatch) {
      startupHealthMs = parseDuration(startupHealthMatch[1], startupHealthMatch[2])
    }

    const rendererMatch = line.match(/Renderer ready\s+([0-9.]+)(ms|s)/)
    if (rendererMatch) {
      rendererReadyMs = parseDuration(rendererMatch[1], rendererMatch[2])
    }

    const startupAnalyticsMatch = line.match(/totalStartupTime=([0-9.]+)/)
    if (startupAnalyticsMatch) {
      const value = Number.parseFloat(startupAnalyticsMatch[1])
      if (Number.isFinite(value)) {
        startupAnalyticsMs = Math.round(value)
      }
    }

    const moduleMatch = line.match(/Module loaded\s+([0-9.]+)(ms|s)\s+module=([^\s]+)/)
    if (moduleMatch) {
      const durationMs = parseDuration(moduleMatch[1], moduleMatch[2])
      if (durationMs != null) {
        moduleLoads.push({ name: moduleMatch[3], durationMs })
      }
    }

    const lagMatch = line.match(/Event loop lag\s+([0-9.]+)(ms|s)/)
    if (lagMatch) {
      const durationMs = parseDuration(lagMatch[1], lagMatch[2])
      if (durationMs != null) eventLoopLags.push(durationMs)
    }

    const slowIpcMatch = line.match(/channel\.send\.slow\s+([0-9.]+)ms/)
    if (slowIpcMatch) {
      const durationMs = Number.parseFloat(slowIpcMatch[1])
      if (Number.isFinite(durationMs)) slowIpc.push(Math.round(durationMs))
    }

    const hasWarn = /\[WARN\]/.test(line)
    const hasError = /\[ERROR\]/.test(line)
    const isDeprecation =
      /DeprecationWarning/.test(line) || /deprecated and will be removed/i.test(line)

    if (isDeprecation) {
      deprecations.push(line)
    }

    if (hasWarn || isDeprecation || line.includes('CGEventTap timeout')) {
      warnLines.push(line)
    }
    if (hasError) {
      errorLines.push(line)
    }
  }

  const moduleTotals = new Map()
  for (const moduleLoad of moduleLoads) {
    const current = moduleTotals.get(moduleLoad.name) || 0
    moduleTotals.set(moduleLoad.name, Math.max(current, moduleLoad.durationMs))
  }

  const topSlowModules = [...moduleTotals.entries()]
    .map(([name, durationMs]) => ({ name, durationMs }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 8)

  const maxEventLoopLagMs = eventLoopLags.length ? Math.max(...eventLoopLags) : null
  const maxSlowIpcMs = slowIpc.length ? Math.max(...slowIpc) : null
  const warnCount = warnLines.length
  const errorCount = errorLines.length

  const isPass =
    startupHealthMs != null && startupHealthMs < 3500 && warnCount === 0 && errorCount === 0

  return {
    allModulesLoadedMs,
    startupHealthMs,
    startupAnalyticsMs,
    rendererReadyMs,
    warnCount,
    errorCount,
    warnLines,
    errorLines,
    deprecations,
    topSlowModules,
    maxEventLoopLagMs,
    maxSlowIpcMs,
    isPass,
    blockingIssues: [],
    analysisCutoffReached: startupBoundaryIndex >= 0
  }
}

function toMarkdownList(items, emptyText) {
  if (!items || items.length === 0) {
    return `- ${emptyText}`
  }
  return items.map((item) => `- ${item}`).join('\n')
}

function reportFileName(runNo) {
  return `第${padRun(runNo)}次运行报告.md`
}

function renderRunReport(runNo, runData) {
  const keyMetrics = [
    ['All modules loaded', runData.allModulesLoadedMs],
    ['Startup health check passed', runData.startupHealthMs],
    ['Renderer ready', runData.rendererReadyMs],
    ['StartupAnalytics.totalStartupTime', runData.startupAnalyticsMs],
    ['EventLoop lag max', runData.maxEventLoopLagMs],
    ['channel.send.slow max', runData.maxSlowIpcMs]
  ]

  const metricRows = keyMetrics
    .map(([name, value]) => `| ${name} | ${value == null ? 'N/A' : `${value}ms`} |`)
    .join('\n')

  const topModulesRows = runData.topSlowModules.length
    ? runData.topSlowModules.map((item) => `| ${item.name} | ${item.durationMs}ms |`).join('\n')
    : '| 无 | 0ms |'

  const retestResult = runData.isPass
    ? '通过（关键阈值与日志告警均满足）'
    : '未通过（存在阻断项，需继续修复）'

  const nextAction = runData.isPass
    ? '继续下一轮认证，观察是否保持稳定。'
    : `优先处理阻断项：${runData.blockingIssues.join(', ') || '待人工判定'}`

  return `# 第${padRun(runNo)}次运行报告

## 运行环境
- runNo: ${padRun(runNo)}
- timestamp: ${runData.timestamp}
- mode: dev benchmark
- command: \`pnpm -C "apps/core-app" exec electron-vite dev\`
- timeoutMs: ${runData.timeoutMs}
- traceDeprecation: ${runData.traceDeprecation ? 'true' : 'false'}

## 关键耗时
| 指标 | 数值 |
| --- | --- |
${metricRows}

## 模块耗时 Top
| 模块 | 耗时 |
| --- | --- |
${topModulesRows}

## WARN/ERROR 清单
- WARN 总数: ${runData.warnCount}
- ERROR 总数: ${runData.errorCount}
- WARN 示例（最多8条）:
${toMarkdownList(runData.warnLines.slice(0, 8), '无')}
- ERROR 示例（最多8条）:
${toMarkdownList(runData.errorLines.slice(0, 8), '无')}

## 根因判断
${toMarkdownList(runData.blockingIssues, '未发现阻断问题')}

## 修复动作
- fixApplied: 已应用当前性能修复基线（SystemUpdate 启动异步化、Sentry/StartupAnalytics 启动宽限、Deprecation 根因治理、Watcher 权限降噪）。

## 修复后复测结果
- retestResult: ${retestResult}

## 判定
- isPass: ${runData.isPass ? 'true' : 'false'}
- blockingIssues: ${runData.blockingIssues.length ? runData.blockingIssues.join(', ') : '[]'}
- fixApplied: baseline-fixes
- retestResult: ${runData.isPass ? 'pass' : 'fail'}
- nextAction: ${nextAction}
`
}

function renderSummaryReport(allRuns) {
  const sorted = [...allRuns].sort((a, b) => a.runNo - b.runNo)
  const startupHealthValues = sorted
    .map((run) => run.startupHealthMs)
    .filter((value) => typeof value === 'number')

  const p50 = percentile(startupHealthValues, 50)
  const p95 = percentile(startupHealthValues, 95)
  const warnTotal = sorted.reduce((sum, run) => sum + run.warnCount, 0)
  const errorTotal = sorted.reduce((sum, run) => sum + run.errorCount, 0)
  const passCount = sorted.filter((run) => run.isPass).length

  const issueCounter = new Map()
  for (const run of sorted) {
    for (const issue of run.blockingIssues) {
      issueCounter.set(issue, (issueCounter.get(issue) || 0) + 1)
    }
  }
  const topIssues = [...issueCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

  const recent10 = sorted.slice(-10)
  const recent10StartupHealth = recent10
    .map((run) => run.startupHealthMs)
    .filter((value) => typeof value === 'number')
  const recent10P50 = percentile(recent10StartupHealth, 50)
  const recent10P95 = percentile(recent10StartupHealth, 95)
  const recent10WarnTotal = recent10.reduce((sum, run) => sum + run.warnCount, 0)
  const recent10ErrorTotal = recent10.reduce((sum, run) => sum + run.errorCount, 0)
  const recent10Pass =
    recent10.length === 10 &&
    recent10.every((run) => run.isPass && run.startupHealthMs != null && run.startupHealthMs < 3500)

  const rows = sorted
    .map((run) => {
      return `| ${padRun(run.runNo)} | ${run.startupHealthMs ?? 'N/A'} | ${run.warnCount} | ${run.errorCount} | ${run.isPass ? 'PASS' : 'FAIL'} | ${run.blockingIssues.join('; ') || '-'} |`
    })
    .join('\n')

  const issueRows = topIssues.length
    ? topIssues.map(([issue, count]) => `| ${issue} | ${count} |`).join('\n')
    : '| 无 | 0 |'

  const finalPass =
    recent10P50 != null &&
    recent10P95 != null &&
    recent10P50 < 3500 &&
    recent10P95 < 4500 &&
    recent10WarnTotal === 0 &&
    recent10ErrorTotal === 0 &&
    recent10Pass

  return `# 汇总报告

## 统计总览
- 总运行次数: ${sorted.length}
- PASS 次数: ${passCount}
- WARN 总数: ${warnTotal}
- ERROR 总数: ${errorTotal}
- Startup health P50: ${p50 == null ? 'N/A' : `${p50}ms`}
- Startup health P95: ${p95 == null ? 'N/A' : `${p95}ms`}
- 最近10次 Startup health P50: ${recent10P50 == null ? 'N/A' : `${recent10P50}ms`}
- 最近10次 Startup health P95: ${recent10P95 == null ? 'N/A' : `${recent10P95}ms`}
- 最近10次 WARN 总数: ${recent10WarnTotal}
- 最近10次 ERROR 总数: ${recent10ErrorTotal}
- 最近10次连续达标: ${recent10Pass ? '是' : '否'}
- 最终达标: ${finalPass ? '是' : '否'}

## 每轮结果
| Run | StartupHealth(ms) | WARN | ERROR | 判定 | Blocking Issues |
| --- | --- | --- | --- | --- | --- |
${rows}

## Top 问题排行榜
| 问题 | 次数 |
| --- | --- |
${issueRows}

## 结论
- isPass: ${finalPass ? 'true' : 'false'}
- blockingIssues: ${topIssues.map(([issue]) => issue).join(', ') || '[]'}
- nextAction: ${
    finalPass ? '保持配置，持续抽样验证。' : '继续按 Top 问题优先级修复并追加第31次及以后报告。'
  }
`
}

async function ensureDirs() {
  await fs.mkdir(logsRoot, { recursive: true })
  await fs.mkdir(dataRoot, { recursive: true })
}

async function readExistingRunNumbers() {
  try {
    const files = await fs.readdir(reportRoot)
    return files
      .map((file) => {
        const match = file.match(/^第(\d+)次运行报告\.md$/)
        return match ? Number.parseInt(match[1], 10) : null
      })
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)
  } catch {
    return []
  }
}

async function readAllRunData() {
  let files = []
  try {
    files = await fs.readdir(dataRoot)
  } catch {
    return []
  }

  const runs = []
  for (const file of files) {
    if (!/^run-\d+\.json$/.test(file)) continue
    const content = await fs.readFile(path.resolve(dataRoot, file), 'utf8')
    const parsed = JSON.parse(content)
    if (typeof parsed.runNo === 'number') {
      runs.push(parsed)
    }
  }
  runs.sort((a, b) => a.runNo - b.runNo)
  return runs
}

function terminateProcessGroup(child) {
  if (!child || child.exitCode != null) return
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // ignore
    }
    setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // ignore
      }
    }, 3000)
    return
  }

  try {
    child.kill('SIGTERM')
  } catch {
    // ignore
  }
}

async function runSingle(runNo, options) {
  const startTime = Date.now()
  const runId = padRun(runNo)
  const devServerPort = String(5600 + runNo)

  const nodeOptions = [
    '--max-old-space-size=8192',
    options.traceDeprecation ? '--trace-deprecation' : null
  ]
    .filter(Boolean)
    .join(' ')

  const child = spawn('pnpm', ['-C', 'apps/core-app', 'exec', 'electron-vite', 'dev'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NODE_OPTIONS: nodeOptions,
      TUFF_STARTUP_BENCHMARK_ONCE: '1',
      TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS: '1000',
      TUFF_STARTUP_BENCHMARK_RUN_ID: runId,
      TUFF_DEV_SERVER_HOST: '127.0.0.1',
      TUFF_DEV_SERVER_PORT: devServerPort
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  })

  let output = ''
  let timeout = false
  let startupSeen = false

  const append = (chunk) => {
    const text = chunk.toString()
    output += text
    if (!startupSeen && text.includes('Startup health check passed')) {
      startupSeen = true
      setTimeout(() => terminateProcessGroup(child), 5000)
    }
  }

  child.stdout.on('data', append)
  child.stderr.on('data', append)

  const timeoutTimer = setTimeout(() => {
    timeout = true
    terminateProcessGroup(child)
  }, options.timeoutMs)

  const closeResult = await new Promise((resolve) => {
    child.on('close', (code, signal) => {
      clearTimeout(timeoutTimer)
      resolve({ code, signal })
    })
  })

  const endTime = Date.now()
  const parsed = parseLogText(output)
  parsed.blockingIssues = collectBlockingIssues(parsed)

  const runData = {
    runNo,
    timestamp: new Date(startTime).toISOString(),
    timeoutMs: options.timeoutMs,
    traceDeprecation: options.traceDeprecation,
    wallTimeMs: endTime - startTime,
    processExitCode: closeResult.code,
    processSignal: closeResult.signal,
    timedOut: timeout,
    ...parsed
  }

  return { runData, rawLog: output }
}

async function writeRunArtifacts(runNo, runData, rawLog) {
  const runId = padRun(runNo)
  const reportPath = path.resolve(reportRoot, reportFileName(runNo))
  const logPath = path.resolve(logsRoot, `run-${runId}.log`)
  const jsonPath = path.resolve(dataRoot, `run-${runId}.json`)

  await fs.writeFile(logPath, rawLog, 'utf8')
  await fs.writeFile(jsonPath, JSON.stringify(runData, null, 2), 'utf8')
  await fs.writeFile(reportPath, renderRunReport(runNo, runData), 'utf8')
}

async function writeSummary() {
  const allRuns = await readAllRunData()
  if (!allRuns.length) return
  const summaryPath = path.resolve(reportRoot, '汇总报告.md')
  await fs.writeFile(summaryPath, renderSummaryReport(allRuns), 'utf8')
}

async function runBench(options) {
  await ensureDirs()

  const existingRunNumbers = await readExistingRunNumbers()
  const existingCount = existingRunNumbers.length
  const maxRun = existingRunNumbers.length ? Math.max(...existingRunNumbers) : 0

  const targetTotal = options.runs
  const pendingRuns = Math.max(0, targetTotal - existingCount)

  if (pendingRuns === 0) {
    await writeSummary()
    console.log(`已有 ${existingCount} 份报告，已达到目标 ${targetTotal}。`)
    return
  }

  let currentRun = maxRun + 1
  for (let i = 0; i < pendingRuns; i++) {
    console.log(`\n[startup-bench] Run ${padRun(currentRun)} 开始...`)

    const { runData, rawLog } = await runSingle(currentRun, options)
    await writeRunArtifacts(currentRun, runData, rawLog)

    console.log(
      `[startup-bench] Run ${padRun(currentRun)} 结束: startupHealth=${runData.startupHealthMs ?? 'N/A'}ms warn=${runData.warnCount} error=${runData.errorCount} pass=${runData.isPass}`
    )

    const shouldStop = !options.continueOnFail && (!runData.isPass || runData.timedOut)
    currentRun += 1
    if (shouldStop) {
      console.log('[startup-bench] 检测到失败并停止（未启用 --continueOnFail）')
      break
    }
  }

  await writeSummary()
}

async function analyzeBench() {
  await ensureDirs()
  const files = await fs.readdir(logsRoot)
  const targets = files
    .filter((file) => /^run-\d+\.log$/.test(file))
    .sort((a, b) => a.localeCompare(b, 'en'))

  for (const file of targets) {
    const runNo = Number.parseInt(file.match(/run-(\d+)\.log/)?.[1] || '', 10)
    if (!Number.isFinite(runNo)) continue

    const rawLog = await fs.readFile(path.resolve(logsRoot, file), 'utf8')
    const parsed = parseLogText(rawLog)
    parsed.blockingIssues = collectBlockingIssues(parsed)
    const hasStructuredMarkers =
      parsed.startupHealthMs != null ||
      parsed.allModulesLoadedMs != null ||
      parsed.warnCount > 0 ||
      parsed.errorCount > 0
    if (!hasStructuredMarkers) {
      continue
    }

    const runData = {
      runNo,
      timestamp: new Date().toISOString(),
      timeoutMs: null,
      traceDeprecation: null,
      wallTimeMs: null,
      processExitCode: null,
      processSignal: null,
      timedOut: false,
      ...parsed
    }

    await writeRunArtifacts(runNo, runData, rawLog)
  }

  await writeSummary()
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.mode === 'analyze') {
    await analyzeBench()
    return
  }
  await runBench(options)
}

main().catch((error) => {
  console.error('[startup-bench] 执行失败', error)
  process.exitCode = 1
})
