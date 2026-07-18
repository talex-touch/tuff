#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const coreAppRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(coreAppRoot, '..', '..')
const reportDate = process.env.TUFF_STARTUP_REPORT_DATE || '2026-03-24'
const defaultPackagedAppPath = path.resolve(
  coreAppRoot,
  'dist',
  process.platform === 'darwin' && process.arch === 'arm64' ? 'mac-arm64' : 'mac',
  'tuff.app',
  'Contents',
  'MacOS',
  'tuff'
)

let activeReportRoot = ''
let activeLogsRoot = ''
let activeDataRoot = ''
let expectedPackageVersion = null

function resolveReportRoots(target, profile) {
  const prefix = target === 'packaged' ? `startup-packaged-${profile}-runs` : 'startup-dev-runs'
  const reportRoot = path.resolve(
    repoRoot,
    'docs',
    'engineering',
    'reports',
    `${prefix}-${reportDate}`
  )
  return {
    reportRoot,
    logsRoot: path.resolve(reportRoot, 'logs'),
    dataRoot: path.resolve(reportRoot, 'data')
  }
}

function parseArgs(argv) {
  const options = {
    mode: 'run',
    target: 'dev',
    runs: 30,
    timeoutMs: 180000,
    traceDeprecation: false,
    continueOnFail: false,
    appPath: process.env.TUFF_STARTUP_BENCHMARK_APP_PATH || defaultPackagedAppPath,
    profile: 'hot',
    launchMethod: 'open'
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--mode' && argv[i + 1]) {
      options.mode = argv[++i]
      continue
    }
    if (arg === '--target' && argv[i + 1]) {
      options.target = argv[++i]
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
    if (arg === '--appPath' && argv[i + 1]) {
      options.appPath = argv[++i]
      continue
    }
    if (arg === '--profile' && argv[i + 1]) {
      options.profile = argv[++i]
      continue
    }
    if (arg === '--launchMethod' && argv[i + 1]) {
      options.launchMethod = argv[++i]
      continue
    }
  }

  if (options.target !== 'dev' && options.target !== 'packaged') {
    throw new Error('--target 必须是 dev 或 packaged')
  }
  if (options.profile !== 'hot' && options.profile !== 'cold') {
    throw new Error('--profile 必须是 hot 或 cold')
  }
  if (options.launchMethod !== 'open' && options.launchMethod !== 'exec') {
    throw new Error('--launchMethod 必须是 open 或 exec')
  }

  if (!Number.isFinite(options.runs) || options.runs <= 0) {
    throw new Error('--runs 必须是正整数')
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5000) {
    throw new Error('--timeoutMs 必须 >= 5000')
  }

  const roots = resolveReportRoots(options.target, options.profile)
  activeReportRoot = roots.reportRoot
  activeLogsRoot = roots.logsRoot
  activeDataRoot = roots.dataRoot

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

async function readExpectedPackageVersion() {
  if (expectedPackageVersion) return expectedPackageVersion
  try {
    const content = await fs.readFile(path.resolve(coreAppRoot, 'package.json'), 'utf8')
    const parsed = JSON.parse(content)
    expectedPackageVersion = typeof parsed.version === 'string' ? parsed.version : null
  } catch {
    expectedPackageVersion = null
  }
  return expectedPackageVersion
}

function resolveAppBundlePath(appPath) {
  return appPath.endsWith('/Contents/MacOS/tuff')
    ? path.resolve(appPath, '..', '..', '..')
    : appPath
}

function readMacBundleVersion(appBundlePath) {
  if (process.platform !== 'darwin') return null
  const infoPlistPath = path.resolve(appBundlePath, 'Contents', 'Info.plist')
  const result = spawnSync(
    '/usr/bin/plutil',
    ['-extract', 'CFBundleShortVersionString', 'raw', infoPlistPath],
    {
      encoding: 'utf8'
    }
  )
  if (result.status !== 0) return null
  const version = result.stdout.trim()
  return version || null
}

async function inspectPackagedArtifact(options) {
  if (options.target !== 'packaged') return null

  const expectedVersion = await readExpectedPackageVersion()
  const executablePath = options.appPath.endsWith('/Contents/MacOS/tuff')
    ? options.appPath
    : path.resolve(options.appPath, 'Contents', 'MacOS', 'tuff')
  const appBundlePath = resolveAppBundlePath(options.appPath)

  let appExists = false
  let executableExists = false
  let executable = false
  try {
    const stat = await fs.stat(appBundlePath)
    appExists = stat.isDirectory()
  } catch {
    appExists = false
  }
  try {
    await fs.access(executablePath, fs.constants.X_OK)
    executableExists = true
    executable = true
  } catch {
    try {
      const stat = await fs.stat(executablePath)
      executableExists = stat.isFile()
    } catch {
      executableExists = false
    }
  }

  const bundleVersion = appExists ? readMacBundleVersion(appBundlePath) : null
  const versionMatches =
    expectedVersion != null && bundleVersion != null ? expectedVersion === bundleVersion : null

  return {
    appPath: options.appPath,
    appBundlePath,
    executablePath,
    appExists,
    executableExists,
    executable,
    expectedVersion,
    bundleVersion,
    versionMatches
  }
}

function collectBlockingIssues(parsed, rawOutput = '') {
  const issues = []
  const pushUnique = (value) => {
    if (!issues.includes(value)) issues.push(value)
  }

  const lowerOutput = rawOutput.toLowerCase()
  if (lowerOutput.includes('klsnoexecutableerr')) {
    pushUnique('packaged_launch_executable_missing')
  }
  if (parsed.artifact?.appExists === false) {
    pushUnique('packaged_artifact_missing')
  }
  if (parsed.artifact?.executableExists === false) {
    pushUnique('packaged_executable_missing')
  }
  if (parsed.artifact?.executable === false) {
    pushUnique('packaged_executable_not_executable')
  }
  if (parsed.artifact?.versionMatches === false) {
    pushUnique('packaged_artifact_version_mismatch')
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

  if (
    parsed.startupHealthMs == null &&
    ((parsed.processExitCode != null && parsed.processExitCode !== 0) || parsed.processSignal)
  ) {
    pushUnique('process_exited_before_startup_health')
  }

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

  const artifact = runData.artifact
  const artifactSection = artifact
    ? `
## Packaged Artifact
- appBundlePath: ${artifact.appBundlePath}
- executablePath: ${artifact.executablePath}
- appExists: ${artifact.appExists ? 'true' : 'false'}
- executableExists: ${artifact.executableExists ? 'true' : 'false'}
- executable: ${artifact.executable ? 'true' : 'false'}
- expectedVersion: ${artifact.expectedVersion || 'N/A'}
- bundleVersion: ${artifact.bundleVersion || 'N/A'}
- versionMatches: ${artifact.versionMatches == null ? 'N/A' : artifact.versionMatches ? 'true' : 'false'}
`
    : ''

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
- target: ${runData.target}
- profile: ${runData.profile}
- launchMethod: ${runData.launchMethod}
- mode: ${runData.target === 'packaged' ? 'packaged benchmark' : 'dev benchmark'}
- command: \`${runData.command}\`
- timeoutMs: ${runData.timeoutMs}
- traceDeprecation: ${runData.traceDeprecation ? 'true' : 'false'}
- userDataDir: ${runData.userDataDir || 'default'}
${artifactSection}

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
  const target = sorted[0]?.target === 'packaged' ? 'packaged' : 'dev'
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

  const nextAction = finalPass
    ? '保持配置，持续抽样验证。'
    : target === 'packaged'
      ? '先处理 packaged 启动阻塞，再重新采集 cold/hot benchmark 样本。'
      : '继续按 Top 问题优先级修复并追加后续报告。'

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
- nextAction: ${nextAction}
`
}

async function ensureDirs() {
  await fs.mkdir(activeLogsRoot, { recursive: true })
  await fs.mkdir(activeDataRoot, { recursive: true })
}

async function readExistingRunNumbers() {
  try {
    const files = await fs.readdir(activeReportRoot)
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
    files = await fs.readdir(activeDataRoot)
  } catch {
    return []
  }

  const runs = []
  for (const file of files) {
    if (!/^run-\d+\.json$/.test(file)) continue
    const content = await fs.readFile(path.resolve(activeDataRoot, file), 'utf8')
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

async function clearColdProfile(userDataDir) {
  if (!userDataDir) return
  await fs.rm(userDataDir, { recursive: true, force: true })
}

function getBenchmarkUserDataDir(runNo, options) {
  if (options.target !== 'packaged') return undefined
  const runScope = options.profile === 'cold' ? `run-${padRun(runNo)}` : 'hot-profile'
  return path.resolve(activeReportRoot, 'user-data', runScope)
}

function createLaunchCommand(runNo, options) {
  if (options.target === 'packaged') {
    if (options.launchMethod === 'open' && process.platform === 'darwin') {
      const appBundlePath = options.appPath.endsWith('/Contents/MacOS/tuff')
        ? path.resolve(options.appPath, '..', '..', '..')
        : options.appPath
      return {
        command: '/usr/bin/open',
        args: ['-W', '-n', '-j', '-a', appBundlePath],
        cwd: coreAppRoot,
        displayCommand: `/usr/bin/open -W -n -j -a "${appBundlePath}"`
      }
    }

    return {
      command: options.appPath,
      args: [],
      cwd: coreAppRoot,
      displayCommand: `"${options.appPath}"`
    }
  }

  const devServerPort = String(5600 + runNo)
  return {
    command: 'pnpm',
    args: ['-C', 'apps/core-app', 'exec', 'electron-vite', 'dev'],
    cwd: repoRoot,
    displayCommand: 'pnpm -C "apps/core-app" exec electron-vite dev',
    devServerPort
  }
}

async function snapshotLogOffsets(userDataDir) {
  if (!userDataDir) return new Map()
  const logDir = path.resolve(userDataDir, 'tuff', 'logs')
  const offsets = new Map()
  let files = []
  try {
    files = await fs.readdir(logDir)
  } catch {
    return offsets
  }

  for (const file of files) {
    if (!/^[DE]\.\d{4}-\d{2}-\d{2}\.(log|err)$/.test(file)) continue
    const filePath = path.resolve(logDir, file)
    try {
      const stat = await fs.stat(filePath)
      offsets.set(filePath, stat.size)
    } catch {
      // ignore files that rotate while snapshotting
    }
  }

  return offsets
}

async function readAppLogDelta(userDataDir, offsets) {
  if (!userDataDir) return ''
  const logDir = path.resolve(userDataDir, 'tuff', 'logs')
  let files = []
  try {
    files = await fs.readdir(logDir)
  } catch {
    return ''
  }

  const chunks = []
  for (const file of files.sort()) {
    if (!/^[DE]\.\d{4}-\d{2}-\d{2}\.(log|err)$/.test(file)) continue
    const filePath = path.resolve(logDir, file)
    try {
      const content = await fs.readFile(filePath, 'utf8')
      const offset = offsets.get(filePath) ?? 0
      chunks.push(content.slice(offset))
    } catch {
      // ignore files that rotate while reading
    }
  }

  return chunks.filter(Boolean).join('\n')
}

function buildBenchmarkEnv(runId, options, launch, userDataDir, nodeOptions) {
  const diagPath =
    options.target === 'packaged'
      ? path.resolve(activeLogsRoot, `run-${runId}-precore-diagnostic.json`)
      : undefined

  return {
    FORCE_COLOR: '0',
    ...(options.target === 'packaged' ? {} : { NODE_OPTIONS: nodeOptions }),
    TUFF_STARTUP_BENCHMARK_ONCE: '1',
    TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS: '1000',
    TUFF_STARTUP_BENCHMARK_RUN_ID: runId,
    ...(diagPath ? { TUFF_STARTUP_BENCHMARK_DIAG_PATH: diagPath } : {}),
    ...(launch.devServerPort
      ? {
          TUFF_DEV_SERVER_HOST: '127.0.0.1',
          TUFF_DEV_SERVER_PORT: launch.devServerPort
        }
      : {}),
    ...(userDataDir ? { TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: userDataDir } : {})
  }
}

function appendOpenEnvArgs(launch, env) {
  if (launch.command !== '/usr/bin/open') return launch
  const envArgs = Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`])
  const appFlagIndex = launch.args.findIndex((arg) => arg === '-a' || arg === '-b')
  if (appFlagIndex >= 0) {
    return {
      ...launch,
      args: [...launch.args.slice(0, appFlagIndex), ...envArgs, ...launch.args.slice(appFlagIndex)],
      displayCommand: launch.displayCommand
    }
  }

  const appPath = launch.args.at(-1)
  const prefixArgs = launch.args.slice(0, -1)
  return {
    ...launch,
    args: [...prefixArgs, ...envArgs, appPath],
    displayCommand: launch.displayCommand
  }
}

function getArtifactBlockingIssues(artifact) {
  if (!artifact) return []
  const issues = []
  const push = (issue) => {
    if (!issues.includes(issue)) issues.push(issue)
  }
  if (artifact.appExists === false) push('packaged_artifact_missing')
  if (artifact.executableExists === false) push('packaged_executable_missing')
  if (artifact.executable === false) push('packaged_executable_not_executable')
  if (artifact.versionMatches === false) push('packaged_artifact_version_mismatch')
  return issues
}

function renderArtifactPreflightLog(artifact) {
  if (!artifact) return ''
  return [
    'Packaged artifact preflight failed before startup benchmark.',
    `appBundlePath=${artifact.appBundlePath}`,
    `executablePath=${artifact.executablePath}`,
    `appExists=${artifact.appExists}`,
    `executableExists=${artifact.executableExists}`,
    `executable=${artifact.executable}`,
    `expectedVersion=${artifact.expectedVersion || 'N/A'}`,
    `bundleVersion=${artifact.bundleVersion || 'N/A'}`,
    `versionMatches=${artifact.versionMatches == null ? 'N/A' : artifact.versionMatches}`
  ].join('\n')
}

async function runSingle(runNo, options) {
  const startTime = Date.now()
  const runId = padRun(runNo)
  const userDataDir = getBenchmarkUserDataDir(runNo, options)
  const artifact = await inspectPackagedArtifact(options)
  const artifactBlockingIssues = getArtifactBlockingIssues(artifact)

  if (artifactBlockingIssues.length > 0) {
    const endTime = Date.now()
    const parsed = parseLogText('')
    parsed.artifact = artifact
    parsed.blockingIssues = [
      ...artifactBlockingIssues,
      ...collectBlockingIssues(parsed, renderArtifactPreflightLog(artifact)).filter(
        (issue) => !artifactBlockingIssues.includes(issue)
      )
    ]
    const runData = {
      runNo,
      timestamp: new Date(startTime).toISOString(),
      timeoutMs: options.timeoutMs,
      traceDeprecation: options.traceDeprecation,
      target: options.target,
      profile: options.profile,
      launchMethod: options.target === 'packaged' ? options.launchMethod : 'exec',
      command: 'artifact preflight',
      userDataDir,
      artifact,
      wallTimeMs: endTime - startTime,
      processExitCode: null,
      processSignal: null,
      timedOut: false,
      ...parsed
    }
    return { runData, rawLog: renderArtifactPreflightLog(artifact) }
  }

  if (options.profile === 'cold') {
    await clearColdProfile(userDataDir)
  }
  const logOffsets = await snapshotLogOffsets(userDataDir)

  const nodeOptions = [
    '--max-old-space-size=8192',
    options.traceDeprecation ? '--trace-deprecation' : null
  ]
    .filter(Boolean)
    .join(' ')

  const baseLaunch = createLaunchCommand(runNo, options)
  const benchmarkEnv = buildBenchmarkEnv(runId, options, baseLaunch, userDataDir, nodeOptions)
  const launch = appendOpenEnvArgs(baseLaunch, benchmarkEnv)

  const child = spawn(launch.command, launch.args, {
    cwd: launch.cwd,
    env: {
      ...process.env,
      ...benchmarkEnv
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
  const appLogDelta = await readAppLogDelta(userDataDir, logOffsets)
  const combinedOutput = [output, appLogDelta].filter(Boolean).join('\n')
  const parsed = parseLogText(combinedOutput)
  parsed.processExitCode = closeResult.code
  parsed.processSignal = closeResult.signal
  parsed.artifact = artifact
  parsed.blockingIssues = collectBlockingIssues(parsed, combinedOutput)

  const runData = {
    runNo,
    timestamp: new Date(startTime).toISOString(),
    timeoutMs: options.timeoutMs,
    traceDeprecation: options.traceDeprecation,
    target: options.target,
    profile: options.profile,
    launchMethod: options.target === 'packaged' ? options.launchMethod : 'exec',
    command: launch.displayCommand,
    userDataDir,
    artifact,
    wallTimeMs: endTime - startTime,
    processExitCode: closeResult.code,
    processSignal: closeResult.signal,
    timedOut: timeout,
    ...parsed
  }

  return { runData, rawLog: combinedOutput }
}

async function writeRunArtifacts(runNo, runData, rawLog) {
  const runId = padRun(runNo)
  const reportPath = path.resolve(activeReportRoot, reportFileName(runNo))
  const logPath = path.resolve(activeLogsRoot, `run-${runId}.log`)
  const jsonPath = path.resolve(activeDataRoot, `run-${runId}.json`)

  await fs.writeFile(logPath, rawLog, 'utf8')
  await fs.writeFile(jsonPath, JSON.stringify(runData, null, 2), 'utf8')
  await fs.writeFile(reportPath, renderRunReport(runNo, runData), 'utf8')
}

async function writeSummary() {
  const allRuns = await readAllRunData()
  if (!allRuns.length) return
  const summaryPath = path.resolve(activeReportRoot, '汇总报告.md')
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

async function analyzeBench(options) {
  await ensureDirs()
  const files = await fs.readdir(activeLogsRoot)
  const targets = files
    .filter((file) => /^run-\d+\.log$/.test(file))
    .sort((a, b) => a.localeCompare(b, 'en'))

  for (const file of targets) {
    const runNo = Number.parseInt(file.match(/run-(\d+)\.log/)?.[1] || '', 10)
    if (!Number.isFinite(runNo)) continue

    const rawLog = await fs.readFile(path.resolve(activeLogsRoot, file), 'utf8')
    const parsed = parseLogText(rawLog)
    parsed.blockingIssues = collectBlockingIssues(parsed, rawLog)
    const hasStructuredMarkers =
      parsed.startupHealthMs != null ||
      parsed.allModulesLoadedMs != null ||
      parsed.warnCount > 0 ||
      parsed.errorCount > 0
    if (!hasStructuredMarkers) {
      continue
    }

    let previousRunData = {}
    try {
      const jsonPath = path.resolve(activeDataRoot, `run-${padRun(runNo)}.json`)
      previousRunData = JSON.parse(await fs.readFile(jsonPath, 'utf8'))
    } catch {
      previousRunData = {}
    }

    const runData = {
      ...previousRunData,
      runNo,
      timestamp: new Date().toISOString(),
      target: previousRunData.target ?? options.target,
      profile: previousRunData.profile ?? options.profile,
      launchMethod:
        previousRunData.launchMethod ??
        (options.target === 'packaged' ? options.launchMethod : 'exec'),
      command: previousRunData.command ?? 'analyze',
      userDataDir: previousRunData.userDataDir ?? null,
      artifact: previousRunData.artifact ?? null,
      timeoutMs: previousRunData.timeoutMs ?? null,
      traceDeprecation: previousRunData.traceDeprecation ?? null,
      wallTimeMs: previousRunData.wallTimeMs ?? null,
      processExitCode: previousRunData.processExitCode ?? null,
      processSignal: previousRunData.processSignal ?? null,
      timedOut: previousRunData.timedOut ?? false,
      ...parsed
    }

    await writeRunArtifacts(runNo, runData, rawLog)
  }

  await writeSummary()
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.mode === 'analyze') {
    await analyzeBench(options)
    return
  }
  await runBench(options)
}

main().catch((error) => {
  console.error('[startup-bench] 执行失败', error)
  process.exitCode = 1
})
