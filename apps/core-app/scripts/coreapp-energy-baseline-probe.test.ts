import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_IDLE_SECONDS,
  SCHEMA_VERSION,
  aggregateProcessMemorySamples,
  assertSafeToLaunchOrAttach,
  buildManualPowermetricsCommand,
  classifyElectronProcessRole,
  collectPowermetricsEnergy,
  computeSummaryStats,
  detectLiveDefaultInstances,
  evaluateBaselineReadiness,
  normalizeAppMetricsReport,
  normalizePsMemorySnapshot,
  parseArgs,
  parsePowermetricsTasksOutput,
  parsePsProcessList,
  renderMarkdownSummary,
  runProbe,
  runStaticEnergyAudit,
  selectProcessTreeFromPs,
  validateOptions,
  validateRemoteDebuggingUrl,
  validateWebSocketDebuggerUrl
} from './coreapp-energy-baseline-probe.mjs'

const tempDirs: string[] = []

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

describe('coreapp-energy-baseline-probe CLI validation & guards', () => {
  it('parses defaults and explicit options cleanly', () => {
    const defaults = parseArgs([])
    expect(defaults.idleSeconds).toBe(DEFAULT_IDLE_SECONDS)
    expect(defaults.dryRun).toBe(false)
    expect(defaults.attachOnly).toBe(false)

    const custom = parseArgs([
      '--dryRun',
      '--staticAudit',
      '--idleSeconds',
      '120',
      '--sampleIntervalMs=2000',
      '--activityMonitorEnergyImpact',
      '1.45',
      '--outputDir',
      '/tmp/out-dir'
    ])
    expect(custom.dryRun).toBe(true)
    expect(custom.staticAudit).toBe(true)
    expect(custom.idleSeconds).toBe(120)
    expect(custom.sampleIntervalMs).toBe(2000)
    expect(custom.activityMonitorEnergyImpact).toBe(1.45)
    expect(custom.outputDir).toBe('/tmp/out-dir')
    expect(() => validateOptions(custom)).not.toThrow()
  })

  it('requires --remoteDebuggingUrl for --attachOnly and rejects non-loopback hosts', () => {
    const missingUrl = parseArgs(['--attachOnly'])
    expect(() => validateOptions(missingUrl)).toThrow('--attachOnly requires --remoteDebuggingUrl')

    expect(() => validateRemoteDebuggingUrl('http://192.168.1.25:9222/json/list')).toThrow(
      'loopback'
    )
    expect(() => validateRemoteDebuggingUrl('http://example.com:9222/json/list')).toThrow(
      'loopback'
    )
    expect(() => validateRemoteDebuggingUrl('ws://127.0.0.1:9222/devtools/browser')).toThrow(
      'http or https'
    )
    expect(validateRemoteDebuggingUrl('http://127.0.0.1:9712/json/list')).toBe(
      'http://127.0.0.1:9712/json/list'
    )
    expect(validateRemoteDebuggingUrl('http://localhost:9712/json/list')).toBe(
      'http://localhost:9712/json/list'
    )
    expect(() => parseArgs(['--activityMonitorEnergyImpact', '12abc'])).toThrow(/valid number/)
    expect(() => validateWebSocketDebuggerUrl('ws://192.168.1.10:9222/devtools/page/1')).toThrow(
      /loopback/
    )
    expect(validateWebSocketDebuggerUrl('ws://127.0.0.1:9712/devtools/page/1')).toBe(
      'ws://127.0.0.1:9712/devtools/page/1'
    )
  })

  it('fails closed when a live /Applications/Tuff.app, default profile, or Vite :5173 instance is running', () => {
    const psOutput = [
      '  101     1  420000  2.4 /Applications/Tuff.app/Contents/MacOS/tuff',
      '  102   101  180000  1.1 /Applications/Tuff.app/Contents/Frameworks/tuff Helper (GPU).app/Contents/MacOS/tuff Helper (GPU) --type=gpu-process',
      '  205     1   95000  0.5 /usr/local/bin/Electron Helper --user-data-dir=/Users/dev/Library/Application Support/@talex-touch/core-app'
    ].join('\n')

    const liveCheck = detectLiveDefaultInstances({ psOutput, vitePortOpen: true, currentPid: 9999 })
    expect(liveCheck.blocked).toBe(true)
    expect(liveCheck.reasons.length).toBeGreaterThanOrEqual(3)
    expect(liveCheck.matches).toHaveLength(3)

    const launchOptions = parseArgs([])
    expect(() => assertSafeToLaunchOrAttach(launchOptions, liveCheck)).toThrow(
      /Refusing to launch Electron/
    )

    // --attachOnly with loopback CDP endpoint is explicitly allowed
    const attachOptions = parseArgs([
      '--attachOnly',
      '--remoteDebuggingUrl',
      'http://127.0.0.1:9712/json/list'
    ])
    expect(assertSafeToLaunchOrAttach(attachOptions, liveCheck)).toMatchObject({
      mode: 'attach-only',
      allowed: true
    })

    // --dryRun is always allowed without launching Electron
    const dryRunOptions = parseArgs(['--dryRun'])
    expect(assertSafeToLaunchOrAttach(dryRunOptions, liveCheck).allowed).toBe(true)
  })

  it('does not falsely block on isolated temp profiles or unrelated processes', () => {
    const psOutput = [
      '  401     1   64000  0.2 /usr/bin/node /Users/dev/project/server.mjs',
      '  402     1  120000  0.4 /tmp/build/Electron Helper --user-data-dir=/tmp/tuff-energy-baseline-12345'
    ].join('\n')

    const liveCheck = detectLiveDefaultInstances({
      psOutput,
      vitePortOpen: false,
      currentPid: 9999
    })
    expect(liveCheck.blocked).toBe(false)
    expect(liveCheck.reasons).toEqual([])
    expect(assertSafeToLaunchOrAttach(parseArgs([]), liveCheck)).toMatchObject({
      mode: 'isolated-launch',
      allowed: true
    })
  })

  it('fails closed on main Electron process with unquoted macOS Application Support path and on ps failure', () => {
    const psOutput = [
      '  301     1 320000  1.2 /Users/dev/project/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron --user-data-dir=/Users/dev/Library/Application Support/@talex-touch/core-app --enable-features=Metal'
    ].join('\n')

    const liveCheck = detectLiveDefaultInstances({
      psOutput,
      vitePortOpen: false,
      currentPid: 9999
    })
    expect(liveCheck.blocked).toBe(true)
    expect(liveCheck.matches).toHaveLength(1)
    expect(liveCheck.reasons[0]).toContain(
      '/Users/dev/Library/Application Support/@talex-touch/core-app'
    )
    expect(() => assertSafeToLaunchOrAttach(parseArgs([]), liveCheck)).toThrow(
      /Refusing to launch Electron/
    )

    const psFailedCheck = detectLiveDefaultInstances({
      psOutput: '',
      psFailed: true,
      psError: 'EPERM',
      vitePortOpen: false
    })
    expect(psFailedCheck.blocked).toBe(true)
    expect(psFailedCheck.reasons[0]).toContain('Unable to inspect running processes via ps')
    expect(() => assertSafeToLaunchOrAttach(parseArgs([]), psFailedCheck)).toThrow(
      /Refusing to launch Electron/
    )
  })
})

describe('Metric 2 — powermetrics --samplers tasks parsing and sudo fallback', () => {
  const samplePowermetrics = `
*** Sampled system activity (Mon Nov 23 11:00:00 2026 +0800) (5000.12ms elapsed) ***

*** Running tasks ***

Name                               ID     CPU ms/s  User%  Deadlines (<2 ms, 2-5 ms)  Wakeups (Intr, Pkg idle)  Energy Impact
tuff                               1010   10.50     80.00  0.00   0.00                4.20   1.10               12.40
tuff Helper (Renderer)             1011   4.20      90.00  0.00   0.00                1.80   0.40               5.10
tuff Helper (GPU)                  1012   2.30      75.00  0.00   0.00                1.00   0.30               2.50
Safari                             2020   15.00     85.00  0.00   0.00                6.00   2.00               18.00
ALL_TASKS                          -2     50.00     70.00  0.00   0.00                25.00  9.00               60.00

*** Sampled system activity (Mon Nov 23 11:00:05 2026 +0800) (5000.05ms elapsed) ***

*** Running tasks ***

Name                               ID     CPU ms/s  Deadlines (<2 ms, 2-5 ms)  Wakeups (Intr, Pkg idle)  Energy Impact
tuff                               1010   6.00      0.00   0.00                2.50   0.60               7.00
tuff Helper (Renderer)             1011   2.00      0.00   0.00                0.80   0.20               2.50
ALL_TASKS                          -2     40.00     0.00   0.00                20.00  8.00               48.00
`

  it('parses multi-sample powermetrics tasks blocks with and without User% column', () => {
    const parsed = parsePowermetricsTasksOutput(samplePowermetrics)
    expect(parsed.sampleCount).toBe(2)
    expect(parsed.matchedTaskNames).toEqual(['tuff', 'tuff Helper (GPU)', 'tuff Helper (Renderer)'])
    expect(parsed.matchedPids).toEqual([1010, 1011, 1012])

    // Sample 1 energy: 12.40 + 5.10 + 2.50 = 20.00; Sample 2 energy: 7.00 + 2.50 = 9.50
    expect(parsed.energyImpact.min).toBe(9.5)
    expect(parsed.energyImpact.max).toBe(20)
    expect(parsed.energyImpact.median).toBe(14.75)
    // Sample 1 CPU: 10.50 + 4.20 + 2.30 = 17.00; Sample 2 CPU: 6.00 + 2.00 = 8.00
    expect(parsed.cpuMsPerSec.min).toBe(8)
    expect(parsed.cpuMsPerSec.max).toBe(17)
    // Sample 1 idle wakeups: 1.10 + 0.40 + 0.30 = 1.80; Sample 2: 0.60 + 0.20 = 0.80
    expect(parsed.idleWakeupsPerSec.min).toBe(0.8)
    expect(parsed.idleWakeupsPerSec.max).toBe(1.8)
    // System ALL_TASKS
    expect(parsed.systemAllTasksEnergyImpact.min).toBe(48)
    expect(parsed.systemAllTasksEnergyImpact.max).toBe(60)
  })

  it('gracefully reports requires-sudo on non-root macOS with exact manual command', async () => {
    const options = parseArgs(['--idleSeconds', '600', '--powermetricsIntervalMs', '5000'])
    const result = await collectPowermetricsEnergy(options, {
      platform: 'darwin',
      geteuid: () => 501
    })
    expect(result.status).toBe('requires-sudo')
    expect(result.manualCommand).toBe(
      buildManualPowermetricsCommand({ idleSeconds: 600, intervalMs: 5000 })
    )
    expect(result.manualCommand).toContain('sudo powermetrics --samplers tasks -i 5000 -n 120')
    expect(result.parsed).toBeNull()
  })

  it('imports and parses --powermetricsInput file cleanly without needing sudo and ignores live targetPids', async () => {
    const dir = await makeTempDir('tuff-pm-')
    const inputPath = path.join(dir, 'powermetrics.txt')
    await writeFile(inputPath, samplePowermetrics, 'utf8')

    const options = parseArgs(['--powermetricsInput', inputPath])
    const result = await collectPowermetricsEnergy(options, {
      platform: 'darwin',
      geteuid: () => 501,
      targetPids: [99999]
    })
    expect(result.status).toBe('measured')
    expect(result.source).toBe('file')
    expect(result.parsed?.sampleCount).toBe(2)
    expect(result.parsed?.matchedPids).toEqual([1010, 1011, 1012])
    expect(result.parsed?.energyImpact.max).toBe(20)
  })

  it('returns status no-matching-tasks and baselineClaimable false when capture has only ALL_TASKS and unrelated tasks', async () => {
    const unrelatedCapture = `
*** Running tasks ***

Name                               ID     CPU ms/s  User%  Deadlines (<2 ms, 2-5 ms)  Wakeups (Intr, Pkg idle)  Energy Impact
Safari                             2020   15.00     85.00  0.00   0.00                6.00   2.00               18.00
WindowServer                       111    12.00     60.00  0.00   0.00                8.00   3.00               14.00
ALL_TASKS                          -2     50.00     70.00  0.00   0.00                25.00  9.00               60.00
`
    const dir = await makeTempDir('tuff-pm-empty-')
    const inputPath = path.join(dir, 'powermetrics-unrelated.txt')
    await writeFile(inputPath, unrelatedCapture, 'utf8')

    const result = await collectPowermetricsEnergy(parseArgs(['--powermetricsInput', inputPath]), {
      platform: 'darwin',
      geteuid: () => 501
    })
    expect(result.status).toBe('no-matching-tasks')
    expect(result.parsed?.sampleCount).toBe(1)
    expect(result.parsed?.matchedPids).toEqual([])
    expect(result.parsed?.energyImpact.median).toBeNull()

    const readiness = evaluateBaselineReadiness({
      mode: 'isolated-launch',
      dryRun: false,
      metrics: {
        coldStart: { status: 'measured' },
        idleEnergy: {
          powermetrics: result,
          activityMonitor: { status: 'imported' }
        },
        processMemory: { status: 'measured' }
      }
    })
    expect(readiness.baselineClaimable).toBe(false)
    expect(readiness.missingBaselineRequirements).toContain(
      "Metric 2a (powermetrics) status is 'no-matching-tasks', expected 'measured'"
    )
  })

  it('matches Browser, GPU, Renderer, and Utility PIDs in live root powermetrics run', async () => {
    const report = await runProbe(
      parseArgs([
        '--attachOnly',
        '--remoteDebuggingUrl',
        'http://127.0.0.1:9712/json/list',
        '--idleSeconds',
        '0',
        '--activityMonitorEnergyImpact',
        '1.1'
      ]),
      {
        platform: 'darwin',
        geteuid: () => 0,
        skipCdpWait: true,
        checkLiveInstances: async () => ({ blocked: false, reasons: [], matches: [] }),
        execPowermetrics: async () => samplePowermetrics,
        sampleProcessMemoryOnce: async () =>
          normalizeAppMetricsReport({
            processes: [
              {
                pid: 1010,
                electronType: 'Browser',
                workingSetBytes: 200 * 1024 * 1024,
                cpuPercent: 1
              },
              {
                pid: 1011,
                electronType: 'Tab',
                workingSetBytes: 100 * 1024 * 1024,
                cpuPercent: 0.5
              },
              { pid: 1012, electronType: 'GPU', workingSetBytes: 80 * 1024 * 1024, cpuPercent: 0.3 }
            ]
          })
      }
    )

    expect(report.metrics.idleEnergy.powermetrics.status).toBe('measured')
    expect(report.metrics.idleEnergy.powermetrics.source).toBe('live-powermetrics')
    expect(report.metrics.idleEnergy.powermetrics.parsed?.matchedPids).toEqual([1010, 1011, 1012])
    expect(report.metrics.idleEnergy.powermetrics.parsed?.energyImpact.max).toBe(20)
  })

  it('reports skipped-non-macos on Linux/Windows hosts without input file', async () => {
    const options = parseArgs([])
    const result = await collectPowermetricsEnergy(options, { platform: 'linux', geteuid: () => 0 })
    expect(result.status).toBe('skipped-non-macos')
    expect(result.manualCommand).toBeNull()
  })

  it('rejects missing Energy Impact column, quotes spaces in manual command, and enforces idle duration coverage', async () => {
    const noEnergyCapture = `
*** Running tasks ***

Name                               ID     CPU ms/s  User%  Wakeups (Intr, Pkg idle)
tuff                               1010   10.50     80.00  4.20   1.10
ALL_TASKS                          -2     50.00     70.00  25.00  9.00
`
    const dir = await makeTempDir('tuff-pm-no-ei-')
    const inputPath = path.join(dir, 'pm-no-energy.txt')
    await writeFile(inputPath, noEnergyCapture, 'utf8')
    const noEnergyResult = await collectPowermetricsEnergy(
      parseArgs(['--powermetricsInput', inputPath]),
      { platform: 'darwin', geteuid: () => 501 }
    )
    expect(noEnergyResult.status).toBe('missing-energy-impact-column')
    expect(noEnergyResult.parsed?.energyImpact.count).toBe(0)

    const quotedCmd = buildManualPowermetricsCommand({
      idleSeconds: 600,
      intervalMs: 5000,
      outputPath: '/tmp/my dir/pm tasks.txt'
    })
    expect(quotedCmd).toContain("'/tmp/my dir/pm tasks.txt'")

    const shortCoverageReadiness = evaluateBaselineReadiness({
      mode: 'isolated-launch',
      dryRun: false,
      config: { idleSeconds: 600 },
      metrics: {
        coldStart: { status: 'measured' },
        idleEnergy: {
          idleSeconds: 600,
          powermetrics: { status: 'measured', parsed: { observedDurationSeconds: 10 } },
          activityMonitor: { status: 'imported' }
        },
        processMemory: { status: 'measured' }
      }
    })
    expect(shortCoverageReadiness.baselineClaimable).toBe(false)
    expect(shortCoverageReadiness.missingBaselineRequirements[0]).toContain(
      'shorter than target idle window 600s'
    )
  })
})

describe('Metric 3 — per-process resident memory & CPU aggregation', () => {
  it('classifies Electron process roles across app.getAppMetrics() and ps formats', () => {
    expect(classifyElectronProcessRole({ electronType: 'Browser' })).toBe('Browser')
    expect(classifyElectronProcessRole({ electronType: 'GPU' })).toBe('GPU')
    expect(classifyElectronProcessRole({ electronType: 'Tab' })).toBe('Renderer')
    expect(classifyElectronProcessRole({ electronType: 'Utility', role: 'plugin-runtime' })).toBe(
      'Utility'
    )
    expect(
      classifyElectronProcessRole({
        args: '/Applications/Tuff.app/Contents/MacOS/tuff'
      })
    ).toBe('Browser')
    expect(
      classifyElectronProcessRole({
        args: '/Applications/Tuff.app/Contents/Frameworks/tuff Helper (GPU) --type=gpu-process'
      })
    ).toBe('GPU')
    expect(
      classifyElectronProcessRole({
        args: '/Applications/Tuff.app/Contents/Frameworks/tuff Helper (Renderer) --type=renderer'
      })
    ).toBe('Renderer')
    expect(
      classifyElectronProcessRole({
        args: '/Applications/Tuff.app/Contents/Frameworks/tuff Helper --type=utility'
      })
    ).toBe('Utility')
  })

  it('extracts process tree from ps output and computes min/median/p95/max + total RSS', () => {
    const psSample1 = parsePsProcessList(
      [
        '  1000     1 409600  1.5 /Applications/Tuff.app/Contents/MacOS/tuff',
        '  1001  1000 204800  0.8 /Applications/Tuff.app/Contents/Frameworks/tuff Helper (GPU) --type=gpu-process',
        '  1002  1000 102400  0.4 /Applications/Tuff.app/Contents/Frameworks/tuff Helper (Renderer) --type=renderer',
        '  1003  1000  51200  0.1 /Applications/Tuff.app/Contents/Frameworks/tuff Helper --type=utility',
        '  9999     1  80000  5.0 /usr/bin/unrelated-app'
      ].join('\n')
    )

    const tree1 = selectProcessTreeFromPs(psSample1, { rootPid: 1000 })
    expect(tree1.map((row: { pid: number }) => row.pid).sort()).toEqual([1000, 1001, 1002, 1003])

    const sample1 = normalizePsMemorySnapshot(tree1, 1_000)
    const sample2 = normalizeAppMetricsReport(
      {
        capturedAt: 6_000,
        processes: [
          {
            pid: 1000,
            electronType: 'Browser',
            workingSetBytes: 420 * 1024 * 1024,
            cpuPercent: 1.0
          },
          { pid: 1001, electronType: 'GPU', workingSetBytes: 210 * 1024 * 1024, cpuPercent: 0.5 },
          { pid: 1002, electronType: 'Tab', workingSetBytes: 110 * 1024 * 1024, cpuPercent: 0.2 },
          { pid: 1003, electronType: 'Utility', workingSetBytes: 60 * 1024 * 1024, cpuPercent: 0.1 }
        ]
      },
      6_000
    )

    const summary = aggregateProcessMemorySamples([sample1, sample2])
    expect(summary.sampleCount).toBe(2)
    expect(summary.sourcesUsed).toEqual(['ps', 'app.getAppMetrics'])
    // Sample 1 total RSS = (400 + 200 + 100 + 50) = 750 MiB; Sample 2 = (420 + 210 + 110 + 60) = 800 MiB
    expect(summary.totals.rssMiB.min).toBe(750)
    expect(summary.totals.rssMiB.max).toBe(800)
    expect(summary.totals.rssMiB.median).toBe(775)
    expect(summary.totals.rssMiB.p95).toBe(800)

    expect(summary.byRole.Browser.rssMiB.min).toBe(400)
    expect(summary.byRole.Browser.rssMiB.max).toBe(420)
    expect(summary.byRole.GPU.rssMiB.min).toBe(200)
    expect(summary.byRole.Renderer.rssMiB.max).toBe(110)
    expect(summary.byRole.Utility.rssMiB.min).toBe(50)
    expect(summary.byRole.Utility.rssMiB.max).toBe(60)
    expect(computeSummaryStats([10, 20, 30, 40, 50]).p95).toBe(50)
  })
})

describe('Dry-run honesty, artifact generation, and static audit', () => {
  it('writes dry-run JSON + Markdown without launching Electron or claiming live baseline numbers', async () => {
    const outDir = await makeTempDir('tuff-energy-dryrun-')
    const options = parseArgs(['--dryRun', '--outputDir', outDir, '--idleSeconds', '600'])

    const report = await runProbe(options)
    expect(report.schema).toBe(SCHEMA_VERSION)
    expect(report.mode).toBe('dry-run')
    expect(report.dryRun).toBe(true)
    expect(report.readiness.baselineClaimable).toBe(false)
    expect(report.readiness.liveMeasurementsCaptured).toBe(false)
    expect(report.metrics.coldStart.coldStartToCoreBoxInteractiveMs).toBeNull()
    expect(report.metrics.processMemory.summary.sampleCount).toBe(0)

    const writtenJson = JSON.parse(
      await readFile(path.join(outDir, 'energy-baseline-probe.json'), 'utf8')
    )
    const writtenMd = await readFile(path.join(outDir, 'energy-baseline-probe.md'), 'utf8')
    expect(writtenJson.readiness.baselineClaimable).toBe(false)
    expect(writtenMd).toContain('does **not** claim a complete live Phase 0 baseline')
    expect(writtenMd).toContain('sudo powermetrics --samplers tasks')
  })

  it('marks baselineClaimable true only when all 3 live metrics are genuinely measured', () => {
    const completeReport = {
      schema: SCHEMA_VERSION,
      generatedAt: '2026-11-23T00:00:00.000Z',
      mode: 'isolated-launch',
      dryRun: false,
      config: { idleSeconds: 600 },
      metrics: {
        coldStart: { status: 'measured', coldStartToCoreBoxInteractiveMs: 1420, reason: null },
        idleEnergy: {
          idleSeconds: 600,
          powermetrics: {
            status: 'measured',
            manualCommand: 'sudo powermetrics --samplers tasks -i 5000 -n 120',
            parsed: {
              sampleCount: 120,
              energyImpact: computeSummaryStats([0.8, 1.1, 1.4]),
              cpuMsPerSec: computeSummaryStats([1.2, 1.5, 2.0])
            }
          },
          activityMonitor: { status: 'imported', energyImpact: 0.9 }
        },
        processMemory: {
          status: 'measured',
          summary: aggregateProcessMemorySamples([
            normalizeAppMetricsReport({
              processes: [
                {
                  pid: 1,
                  electronType: 'Browser',
                  workingSetBytes: 256 * 1024 * 1024,
                  cpuPercent: 0.4
                }
              ]
            })
          ])
        }
      }
    }
    const readiness = evaluateBaselineReadiness(completeReport)
    expect(readiness.baselineClaimable).toBe(true)
    expect(readiness.liveMeasurementsCaptured).toBe(true)
    expect(readiness.missingBaselineRequirements).toEqual([])

    const md = renderMarkdownSummary({ ...completeReport, readiness })
    expect(md).toContain('Baseline claimable: `true`')
    expect(md).toContain('`1420 ms`')
  })

  it('counts setInterval, powerMonitor, and requestAnimationFrame in --staticAudit with runtime/test split', async () => {
    const repoDir = await makeTempDir('tuff-static-audit-')
    await mkdir(path.join(repoDir, 'apps/core-app/src/main'), { recursive: true })
    await mkdir(path.join(repoDir, 'apps/core-app/src/main/dist'), { recursive: true })
    await mkdir(path.join(repoDir, 'packages/tuffex/src'), { recursive: true })

    await writeFile(
      path.join(repoDir, 'apps/core-app/src/main/idle.ts'),
      `
      import { powerMonitor } from 'electron'
      powerMonitor.on('suspend', () => {})
      const timer = setInterval(() => {}, 1000)
      `,
      'utf8'
    )
    await writeFile(
      path.join(repoDir, 'apps/core-app/src/main/idle.test.ts'),
      `
      setInterval(() => {}, 500)
      powerMonitor.emit('resume')
      `,
      'utf8'
    )
    // dist/ should be ignored
    await writeFile(
      path.join(repoDir, 'apps/core-app/src/main/dist/bundle.js'),
      `setInterval(() => {}, 100); requestAnimationFrame(() => {});`,
      'utf8'
    )
    await writeFile(
      path.join(repoDir, 'packages/tuffex/src/Surface.vue'),
      `<script setup>
      requestAnimationFrame(() => {})
      requestAnimationFrame(() => {})
      </script>`,
      'utf8'
    )

    const audit = await runStaticEnergyAudit({ repoRoot: repoDir })
    expect(audit.scannedFiles).toBe(3)
    expect(audit.incomplete).toBe(false)
    expect(audit.totals.setInterval).toMatchObject({ runtime: 1, test: 1, total: 2 })
    expect(audit.totals.powerMonitor).toMatchObject({ runtime: 2, test: 1, total: 3 })
    expect(audit.totals.requestAnimationFrame).toMatchObject({ runtime: 2, test: 0, total: 2 })
    expect(audit.byRoot['apps/core-app/src'].setInterval.runtime).toBe(1)
    expect(audit.byRoot['packages/tuffex'].requestAnimationFrame.runtime).toBe(2)
    expect(audit.topRuntimeFiles.requestAnimationFrame[0].file).toBe(
      'packages/tuffex/src/Surface.vue'
    )

    const missingRootAudit = await runStaticEnergyAudit({
      repoRoot: repoDir,
      roots: ['does/not/exist']
    })
    expect(missingRootAudit.incomplete).toBe(true)
    expect(missingRootAudit.unreadablePaths).toHaveLength(1)
  })

  it('orchestrates --attachOnly end-to-end and fails closed in launch mode when live instance exists', async () => {
    const outDir = await makeTempDir('tuff-energy-attach-')
    const pmPath = path.join(outDir, 'pm.txt')
    await writeFile(
      pmPath,
      [
        '*** Running tasks ***',
        'Name ID CPU ms/s User% Deadlines (<2 ms, 2-5 ms) Wakeups (Intr, Pkg idle) Energy Impact',
        'tuff 101 5.0 80.0 0.0 0.0 1.2 0.3 6.2',
        'ALL_TASKS -2 20.0 70.0 0.0 0.0 10.0 2.0 25.0'
      ].join('\n'),
      'utf8'
    )

    const liveBlocked = {
      blocked: true,
      reasons: ['Live packaged /Applications/Tuff.app instance detected'],
      matches: [{ pid: 101, reason: 'live', args: '/Applications/Tuff.app/Contents/MacOS/tuff' }]
    }

    await expect(
      runProbe(parseArgs(['--idleSeconds', '0']), {
        checkLiveInstances: async () => liveBlocked
      })
    ).rejects.toThrow(/Refusing to launch Electron/)

    const attachReport = await runProbe(
      parseArgs([
        '--attachOnly',
        '--remoteDebuggingUrl',
        'http://127.0.0.1:9712/json/list',
        '--idleSeconds',
        '0',
        '--powermetricsInput',
        pmPath,
        '--activityMonitorEnergyImpact',
        '1.2',
        '--outputDir',
        outDir
      ]),
      {
        checkLiveInstances: async () => liveBlocked,
        skipCdpWait: true,
        sampleProcessMemoryOnce: async () =>
          normalizeAppMetricsReport({
            processes: [
              {
                pid: 101,
                electronType: 'Browser',
                workingSetBytes: 300 * 1024 * 1024,
                cpuPercent: 0.7
              },
              {
                pid: 102,
                electronType: 'Tab',
                workingSetBytes: 120 * 1024 * 1024,
                cpuPercent: 0.2
              }
            ]
          })
      }
    )

    expect(attachReport.mode).toBe('attach-only')
    expect(attachReport.metrics.coldStart.status).toBe('attach-only-unmeasured')
    expect(attachReport.metrics.idleEnergy.powermetrics.status).toBe('measured')
    expect(attachReport.metrics.idleEnergy.activityMonitor.status).toBe('imported')
    expect(attachReport.metrics.processMemory.status).toBe('measured')
    expect(attachReport.metrics.processMemory.summary.totals.rssMiB.median).toBe(420)
    expect(attachReport.readiness.liveMeasurementsCaptured).toBe(true)
    expect(attachReport.readiness.baselineClaimable).toBe(false)
    expect(attachReport.readiness.missingBaselineRequirements).toEqual([
      "Metric 1 (coldStart) status is 'attach-only-unmeasured', expected 'measured'"
    ])
  })
})
