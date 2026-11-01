import { lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  AppHandles,
  Breach,
  CreateMonitor,
  DbIntegrity,
  MonitorSummary,
  Pressure,
  Report,
  StressMonitor
} from '../../eval-types'
import type {
  CorpusManifest,
  GenerateOptions,
  Scenario,
  ScenarioPlan,
  SearchCheck
} from '../../types'
import type { ShutdownOutcome } from '../app-shutdown'
import type { RunOptions } from '../args'
import type { LaunchConfig } from '../app-launch'
import { realClock } from '../clock'
import { removeOwnedCorpus } from '../corpus'
import { writeReport } from '../deps'
import type { SearchAnswer, SearchRow } from '../driver-types'
import { DriverError } from '../errors'
import { emptyMonitorSummary } from '../report-inputs'
import type { RunnableApp, RunnerDeps, RunnerTuning } from '../runner-deps'

export const FAST_TUNING: RunnerTuning = {
  tickerMs: 0,
  watchdogMs: 15,
  batchMark: 2,
  abortGraceMs: 150,
  schedulerTickMs: 4,
  pacerOkHoldMs: 10,
  pacerHoldMaxMs: 400,
  seedPollMs: 5,
  seedAppGraceMs: 40,
  idleCapMs: 80,
  drainCapMs: 80,
  poll: { backoffMs: [4, 8], retries: 1, retryDelayMs: 2 },
  health: { window: 20, minSamples: 6, maxErrorRatio: 0.2 }
}

const present = (
  name: string,
  rel: string | undefined,
  query: string,
  tier: 'hard' | 'soft' = 'hard',
  deadlineMs = 400
): SearchCheck => ({
  query,
  target: { kind: 'file', name, ...(rel ? { path: rel } : {}) },
  expect: 'present',
  topK: 5,
  tier,
  deadlineMs
})
const absent = (name: string, rel: string, query: string): SearchCheck => ({
  ...present(name, rel, query),
  expect: 'absent',
  deadlineMs: 30
})

const payload = (kind: 'png' | 'text', seed: number) => ({ kind, bytes: 24, seed })

function scenario(
  id: string,
  cls: Scenario['class'],
  steps: Scenario['steps'],
  checks: SearchCheck[],
  requires?: string[]
): Scenario {
  return {
    id,
    index: 0,
    class: cls,
    dims: { shape: id },
    steps,
    checks,
    ...(requires ? { requires } : {})
  }
}

/** Twelve scenarios of every class; the first ten run in the steady phase and the last two in the burst. */
export function testPlan(options: Partial<GenerateOptions> = {}): ScenarioPlan {
  const corpus: CorpusManifest = {
    directories: ['docs', 'pictures'],
    files: [
      { path: 'docs/alpha-report.txt', payload: payload('text', 1) },
      { path: 'docs/budget-2026.txt', payload: payload('text', 2) },
      { path: 'pictures/sunset-beach.png', payload: payload('png', 3) },
      { path: 'pictures/old-name.png', payload: payload('png', 4) },
      { path: 'pictures/forest-trail.png', payload: payload('png', 5) }
    ]
  }
  const scenarios = [
    scenario(
      'search-file-001',
      'search-file',
      [],
      [present('alpha-report.txt', 'docs/alpha-report.txt', 'alpha')]
    ),
    scenario(
      'search-file-002',
      'search-file',
      [],
      [present('budget-2026.txt', 'docs/budget-2026.txt', 'budget')]
    ),
    scenario(
      'search-image-001',
      'search-image',
      [],
      [present('sunset-beach.png', 'pictures/sunset-beach.png', 'sunset')]
    ),
    scenario(
      'search-app-001',
      'search-app',
      [],
      [{ ...present('Notes', undefined, 'notes', 'soft'), target: { kind: 'app', name: 'Notes' } }]
    ),
    scenario(
      'create-image-001',
      'create-image',
      [{ op: 'write', path: 'pictures/new-shot-one.png', payload: payload('png', 11) }],
      [present('new-shot-one.png', 'pictures/new-shot-one.png', 'new-shot-one')]
    ),
    scenario(
      'create-image-002',
      'create-image',
      [{ op: 'write-atomic', path: 'pictures/new-shot-two.png', payload: payload('png', 12) }],
      [present('new-shot-two.png', 'pictures/new-shot-two.png', 'new-shot-two')]
    ),
    scenario(
      'search-created-001',
      'search-created',
      [],
      [present('new-shot-one.png', 'pictures/new-shot-one.png', 'new-shot-one')],
      ['create-image-001']
    ),
    scenario(
      'change-image-001',
      'change-image',
      [{ op: 'move', from: 'pictures/old-name.png', to: 'pictures/renamed-photo.png' }],
      [
        present('renamed-photo.png', 'pictures/renamed-photo.png', 'renamed-photo'),
        absent('old-name.png', 'pictures/old-name.png', 'old-name')
      ]
    ),
    scenario(
      'ignore-image-001',
      'ignore-image',
      [{ op: 'write', path: 'pictures/.hidden-shot.png', payload: payload('png', 13) }],
      [absent('.hidden-shot.png', 'pictures/.hidden-shot.png', 'hidden-shot')]
    ),
    scenario(
      'ignore-image-002',
      'ignore-image',
      [{ op: 'symlink', path: 'pictures/link-shot.png', target: 'docs/alpha-report.txt' }],
      [absent('link-shot.png', 'pictures/link-shot.png', 'link-shot')]
    ),
    scenario(
      'create-image-003',
      'create-image',
      [{ op: 'write', path: 'pictures/new-shot-three.png', payload: payload('png', 14) }],
      [present('new-shot-three.png', 'pictures/new-shot-three.png', 'new-shot-three')]
    ),
    scenario(
      'search-created-002',
      'search-created',
      [],
      [present('new-shot-three.png', 'pictures/new-shot-three.png', 'new-shot-three')],
      ['create-image-003']
    )
  ].map((entry, index) => ({ ...entry, index }))
  return {
    seed: options.seed ?? 1,
    count: scenarios.length,
    options: { seed: 1, count: scenarios.length, apps: [], ...options },
    corpus,
    scenarios
  }
}

function abortable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new DriverError('cdp', 'the search was aborted'))
    if (signal.aborted) onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

async function listFiles(root: string): Promise<Array<{ path: string; mtimeMs: number }>> {
  const found: Array<{ path: string; mtimeMs: number }> = []
  const visit = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir).catch(() => [] as string[])) {
      const full = path.join(dir, entry)
      const info = await lstat(full).catch(() => null)
      if (!info || info.isSymbolicLink()) continue
      if (info.isDirectory()) await visit(full)
      else found.push({ path: full, mtimeMs: info.mtimeMs })
    }
  }
  await visit(root)
  return found
}

export interface WorldOptions {
  /** A file is findable this long after it was last written. */
  indexDelayMs?: number
  /** Files whose name matches are never found. */
  hide?: RegExp
  installedApps?: string[]
  shutdown?: Partial<ShutdownOutcome>
  launchError?: Error
}

/** An app that answers searches from the real corpus directory, and a monitor that records what it is told. */
export class FakeWorld {
  readonly lifecycle: string[] = []
  readonly phases: string[] = []
  readonly marks: string[] = []
  readonly launches: LaunchConfig[] = []
  pressure: Pressure = 'ok'
  mainAlive = true
  searches = 0
  phase = 'before-start'
  /** Awaited before every search answer; throw to make the driver fail, or never settle to make it hang. */
  beforeSearch: (query: string) => void | Promise<void> = () => undefined
  /** Called by the monitor's `setPhase`. */
  onPhase: (phase: string) => void = () => undefined
  /** Replaces the monitor's summary. */
  summary: MonitorSummary | null = null
  stopCalls = 0
  corpusRoot = ''
  private readonly options: Required<Pick<WorldOptions, 'indexDelayMs' | 'installedApps'>> &
    WorldOptions

  constructor(options: WorldOptions = {}) {
    this.options = { indexDelayMs: 8, installedApps: ['Notes', 'Safari'], ...options }
  }

  private async answer(query: string): Promise<SearchAnswer> {
    this.searches += 1
    await this.beforeSearch(query)
    const needle = query.toLowerCase()
    const rows: SearchRow[] = []
    for (const app of this.options.installedApps) {
      if (app.toLowerCase().includes(needle))
        rows.push({
          id: `app:${app}`,
          kind: 'app',
          name: app,
          path: `/Applications/${app}.app`,
          sourceId: 'app-provider',
          score: 0.9
        })
    }
    for (const file of await listFiles(this.corpusRoot)) {
      const name = path.basename(file.path)
      if (
        name.startsWith('.') ||
        !name.toLowerCase().includes(needle) ||
        Date.now() - file.mtimeMs < this.options.indexDelayMs
      )
        continue
      if (this.options.hide?.test(name)) continue
      rows.push({
        id: `file:${file.path}`,
        kind: 'file',
        name,
        path: file.path,
        sourceId: 'file-provider',
        score: 0.5
      })
    }
    return { rows, answerMs: 2, endSignalSeen: true }
  }

  launch = async (config: LaunchConfig): Promise<RunnableApp> => {
    this.lifecycle.push('launch')
    this.launches.push(config)
    if (this.options.launchError) throw this.options.launchError
    this.corpusRoot = config.corpusRoot
    await mkdir(path.join(config.segment.profileDir, 'tuff-dev'), { recursive: true })
    await writeFile(path.join(config.segment.profileDir, 'tuff-dev', 'index.db'), 'x')
    const handles: AppHandles = {
      mainPid: 4242,
      cdpPort: config.ports.cdp,
      inspectPort: config.ports.inspect,
      profileDir: config.segment.profileDir,
      logsDir: config.segment.logsDir,
      evidenceDir: config.segment.evidenceDir
    }
    return {
      handles,
      wrapperPid: 4241,
      driver: {
        search: (query, options) => abortable(this.answer(query), options.signal)
      },
      control: {
        fileIndexStatus: async () => ({
          isInitializing: false,
          initializationFailed: false,
          startupPending: false,
          stage: 'idle',
          current: 0,
          total: 0
        }),
        fileIndexStats: async () => ({ totalFiles: 40, failedFiles: 0, completedFiles: 40 })
      },
      wrapperExit: () => null,
      isMainAlive: () => this.mainAlive,
      shutdown: async () => {
        this.lifecycle.push('shutdown')
        this.mainAlive = false
        return {
          clean: true,
          how: 'ipc',
          leftPids: [],
          markers: [],
          detail: 'quit through IPC',
          ...this.options.shutdown
        }
      }
    }
  }

  createMonitor: CreateMonitor = (handles) => {
    const listeners: Array<(breach: Breach) => void> = []
    const monitor: StressMonitor = {
      start: async () => {
        this.lifecycle.push('monitor.start')
      },
      setPhase: (phase) => {
        this.phase = phase
        this.phases.push(phase)
        this.onPhase(phase)
      },
      mark: (label) => void this.marks.push(label),
      pressure: () => ({ level: this.pressure }),
      onBreach: (listener) => {
        listeners.push(listener)
        return () => void listeners.splice(listeners.indexOf(listener), 1)
      },
      stop: async () => {
        this.stopCalls += 1
        this.lifecycle.push('monitor.stop')
        return (
          this.summary ??
          emptyMonitorSummary(Date.now(), undefined, `fake monitor for pid ${handles.mainPid}`)
        )
      }
    }
    return monitor
  }
}

export interface DepsHarness {
  deps: RunnerDeps
  /** What the fake machinery saw: lock calls, the report inputs, the preflight input. */
  seen: {
    locks: string[]
    released: string[]
    preflight: Array<Record<string, unknown>>
    reports: Array<Parameters<RunnerDeps['report']['build']>[0]>
    logs: string[]
  }
}

export interface DepsOptions {
  root: string
  world: FakeWorld
  plan?: ScenarioPlan
  tuning?: Partial<RunnerTuning>
  signal?: AbortSignal
  preflight?: RunnerDeps['preflight']
  checkDatabases?: (profileDir: string) => Promise<DbIntegrity>
  /** Default: fail when a hard check failed, else pass. */
  verdict?: Report['verdict']
  runId?: string
}

export function runnerDeps(options: DepsOptions): DepsHarness {
  const seen: DepsHarness['seen'] = {
    locks: [],
    released: [],
    preflight: [],
    reports: [],
    logs: []
  }
  const base = options.plan ?? testPlan()
  const corpusBase = path.join(options.root, 'corpus-base')
  const deps: RunnerDeps = {
    clock: realClock,
    ...(options.signal ? { signal: options.signal } : {}),
    log: (line) => void seen.logs.push(line),
    progress: (line) => void seen.logs.push(`progress: ${line}`),
    argv: ['run', '--profile', 'smoke'],
    appDir: '/nonexistent/apps/core-app',
    newRunId: () => options.runId ?? 'test-run-1',
    corpusBase,
    host: () => ({ os: 'TestOS 1', cpus: 4, memGb: 8 }),
    versions: async () => ({ appVersion: '9.9.9', gitSha: 'abc123def456' }),
    plan: {
      generatePlan: (generate) => ({
        ...base,
        seed: generate.seed,
        count: generate.count,
        options: generate
      }),
      validatePlan: () => [],
      materializePayload: (spec) => Buffer.alloc(spec.bytes, spec.seed),
      materializeCorpus: async (root, corpus) => {
        let bytes = 0
        for (const dir of corpus.directories) await mkdir(path.join(root, dir), { recursive: true })
        for (const file of corpus.files) {
          await writeFile(
            path.join(root, file.path),
            Buffer.alloc(file.payload.bytes, file.payload.seed)
          )
          bytes += file.payload.bytes
        }
        return { files: corpus.files.length, bytes }
      },
      profileCounts: { smoke: base.scenarios.length, full: 10_000, burst: 1_500 }
    },
    discoverApps: async () => ({
      names: ['Calendar', 'Notes', 'Safari'],
      bundlesSeen: 3,
      sources: { displayName: 3, bundleName: 0, directory: 0 },
      dropped: { own: 0, invalid: 0, noise: 0, duplicate: 0 },
      notes: []
    }),
    readAppsFile: async () => ['Notes', 'Safari'],
    preflight: options.preflight ?? (async (input) => (seen.preflight.push({ ...input }), [])),
    acquireLock: async (runId) => {
      seen.locks.push(runId)
      return { release: async () => void seen.released.push(runId) }
    },
    allocatePorts: async () => ({ cdp: 9301, inspect: 9302, vite: 9303 }),
    launch: options.world.launch,
    createMonitor: options.world.createMonitor,
    sampleCpu: async () => 12,
    checkDatabases:
      options.checkDatabases ??
      (async () => ({ checked: true, results: [{ file: 'tuff-dev/index.db', ok: true }] })),
    report: {
      build: (inputs) => {
        seen.reports.push(inputs)
        const verdict =
          options.verdict ??
          (inputs.results.some((result) => result.tier === 'hard' && result.outcome === 'fail')
            ? 'fail'
            : 'pass')
        return {
          verdict,
          gates: [{ id: 'G1', title: 'fake gate', status: verdict, detail: '' }],
          json: { runId: inputs.meta.runId },
          markdown: `# fake report ${inputs.meta.runId}\n`
        }
      },
      write: writeReport
    },
    cleanup: {
      removeCorpus: (layout) => removeOwnedCorpus(layout, { base: corpusBase }),
      removeDir: (dir) => rm(dir, { recursive: true, force: true })
    },
    tuning: { ...FAST_TUNING, ...options.tuning }
  }
  return { deps, seen }
}

export function runOptions(root: string, overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    embedding: 'off',
    ui: 'hidden',
    profile: 'smoke',
    seed: 1,
    keep: false,
    qps: 500,
    nice: 10,
    seedTimeoutSec: 30,
    searchTimeoutMs: 1000,
    runDir: path.join(root, 'run-1'),
    ...overrides
  }
}
