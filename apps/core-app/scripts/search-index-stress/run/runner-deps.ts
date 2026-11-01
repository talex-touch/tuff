import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {
  AppHandles,
  BuildReport,
  CreateMonitor,
  DbIntegrity,
  RunMeta,
  WriteReport
} from '../eval-types'
import type { CorpusManifest, GenerateOptions, PayloadSpec, ScenarioPlan } from '../types'
import type { ShutdownOutcome } from './app-shutdown'
import type { AppLaunchDeps, LaunchConfig } from './app-launch'
import { defaultLaunchDeps, launchApp } from './app-launch'
import type { Clock } from './clock'
import { realClock } from './clock'
import type { CleanupResult } from './corpus'
import { removeOwnedCorpus } from './corpus'
import { checkDatabases } from './db-integrity'
import {
  buildReport,
  createMonitor,
  generatePlan,
  materializeCorpus,
  materializePayload,
  PROFILE_COUNTS,
  validatePlan,
  writeReport
} from './deps'
import type { PollPolicy } from './evaluate-check'
import type { DriverHealthOptions } from './evaluate-check'
import type { SearchDriver } from './driver-types'
import type { DiscoveredApps } from './installed-apps'
import { discoverInstalledApps, readAppsFile } from './installed-apps'
import type { RunLayout } from './layout'
import { newRunId, STRESS_ROOT } from './layout'
import { acquireRunLock } from './lock'
import type { AppControl } from './main-ipc'
import type { PreflightInput, PreflightItem } from './preflight'
import { defaultPreflightEnv, runPreflight } from './preflight'
import type { AppPorts } from './ports'
import { allocateAppPorts } from './ports'
import { createCpuSampler } from './progress'

/** The part of a running app the runner uses; `RunningApp` satisfies it, and tests supply fakes. */
export interface RunnableApp {
  handles: AppHandles
  wrapperPid: number
  /** The page the driver attached to, for the probe's findings. */
  target?: string
  driver: SearchDriver
  control: Pick<AppControl, 'fileIndexStatus' | 'fileIndexStats'>
  wrapperExit: () => { code: number | null; signal: string | null } | null
  isMainAlive: () => boolean
  shutdown: () => Promise<ShutdownOutcome>
}

export interface PlanTools {
  generatePlan: (options: GenerateOptions) => ScenarioPlan
  validatePlan: (plan: ScenarioPlan) => string[]
  materializePayload: (spec: PayloadSpec) => Buffer
  materializeCorpus: (
    root: string,
    corpus: CorpusManifest
  ) => Promise<{ files: number; bytes: number }>
  profileCounts: Partial<Record<string, number>>
}

/** Timings and sizes the run is paced by; tests shrink them. */
export interface RunnerTuning {
  /** Progress line period; 0 turns the ticker off. */
  tickerMs: number
  /** How often the app's main process is checked for being alive. */
  watchdogMs: number
  /** `scenario-batch:N` is marked on the monitor timeline every this many scenarios. */
  batchMark: number
  /** After a stop request, scenarios already in flight may go on this long. */
  abortGraceMs: number
  schedulerTickMs: number
  pacerOkHoldMs: number
  pacerHoldMaxMs: number
  poll?: PollPolicy
  health?: DriverHealthOptions
  seedPollMs: number
  seedAppGraceMs: number
  /** Informational wait for the file index to go quiet after the seed, and again after the last scenario. */
  idleCapMs: number
  drainCapMs: number
  startTimeoutMs?: number
}

export const DEFAULT_TUNING: RunnerTuning = {
  tickerMs: 10_000,
  watchdogMs: 2_000,
  batchMark: 50,
  abortGraceMs: 20_000,
  schedulerTickMs: 250,
  pacerOkHoldMs: 3_000,
  pacerHoldMaxMs: 60_000,
  seedPollMs: 5_000,
  seedAppGraceMs: 120_000,
  idleCapMs: 120_000,
  drainCapMs: 60_000
}

export interface RunnerDeps {
  clock: Clock
  /** Aborting it asks the run to stop: no new scenarios, a bounded wait for the ones in flight, then the usual shutdown and report. */
  signal?: AbortSignal
  log: (line: string) => void
  /** Where the one-line progress ticker goes. */
  progress: (line: string) => void
  /** The command line as typed, kept in meta.json so the report can print the repeating command. */
  argv: readonly string[]
  /** `apps/core-app`. */
  appDir: string
  newRunId: () => string
  /** Parent of the per-run corpus directory the runner creates; tests point it at a scratch directory. */
  corpusBase?: string
  host: () => RunMeta['host']
  versions: () => Promise<{ appVersion?: string; gitSha?: string }>
  plan: PlanTools
  discoverApps: () => Promise<DiscoveredApps>
  readAppsFile: (file: string) => Promise<string[]>
  preflight: (input: PreflightInput) => Promise<PreflightItem[]>
  acquireLock: (runId: string) => Promise<{ release: () => Promise<void> }>
  allocatePorts: () => Promise<AppPorts>
  launch: (config: LaunchConfig) => Promise<RunnableApp>
  createMonitor: CreateMonitor
  /** Percent of one core used by the app tree since the previous call, for the ticker. */
  sampleCpu: (rootPid: number) => Promise<number | null>
  checkDatabases: (profileDir: string) => Promise<DbIntegrity>
  report: { build: BuildReport; write: WriteReport }
  cleanup: {
    removeCorpus: (
      layout: Pick<RunLayout, 'runId' | 'corpusRoot' | 'corpusOwnedDir'>
    ) => Promise<CleanupResult>
    removeDir: (dir: string) => Promise<void>
  }
  tuning: RunnerTuning
}

function git(args: string[], cwd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 5_000 }, (error, stdout) =>
      resolve(error ? undefined : String(stdout).trim() || undefined)
    )
  })
}

export async function readVersions(
  appDir: string
): Promise<{ appVersion?: string; gitSha?: string }> {
  const [version, gitSha] = await Promise.all([
    readFile(path.join(appDir, 'package.json'), 'utf8').then(
      (text) => (JSON.parse(text) as { version?: unknown }).version,
      () => undefined
    ),
    git(['rev-parse', '--short=12', 'HEAD'], appDir)
  ])
  return {
    ...(typeof version === 'string' ? { appVersion: version } : {}),
    ...(gitSha ? { gitSha } : {})
  }
}

export interface DefaultDepsOptions {
  appDir: string
  argv: readonly string[]
  log: (line: string) => void
  progress?: (line: string) => void
  signal?: AbortSignal
  launchDeps?: AppLaunchDeps
}

export function defaultRunnerDeps(options: DefaultDepsOptions): RunnerDeps {
  const clock = realClock
  const cpu = createCpuSampler(clock)
  const preflightEnv = defaultPreflightEnv(options.appDir)
  return {
    clock,
    ...(options.signal ? { signal: options.signal } : {}),
    log: options.log,
    progress: options.progress ?? options.log,
    argv: options.argv,
    appDir: options.appDir,
    newRunId: () => newRunId(new Date(), randomBytes(2).toString('hex')),
    host: () => ({
      os: `${os.type()} ${os.release()} ${os.arch()}`,
      cpus: os.cpus().length,
      memGb: Math.round(os.totalmem() / 2 ** 30)
    }),
    versions: () => readVersions(options.appDir),
    plan: {
      generatePlan,
      validatePlan,
      materializePayload,
      materializeCorpus,
      profileCounts: PROFILE_COUNTS
    },
    discoverApps: () => discoverInstalledApps(),
    readAppsFile: (file) => readAppsFile(file),
    preflight: (input) => runPreflight(input, preflightEnv),
    acquireLock: (runId) => acquireRunLock(path.join(STRESS_ROOT, '.lock'), runId),
    allocatePorts: allocateAppPorts,
    launch: async (config) => {
      const app = await launchApp(config, options.launchDeps ?? defaultLaunchDeps(options.log))
      return { ...app, target: app.session.target }
    },
    createMonitor,
    sampleCpu: (rootPid) => cpu.sample(rootPid),
    checkDatabases: (profileDir) => checkDatabases(profileDir),
    report: { build: buildReport, write: writeReport },
    cleanup: {
      removeCorpus: (layout) => removeOwnedCorpus(layout),
      removeDir: (dir) => rm(dir, { recursive: true, force: true })
    },
    tuning: DEFAULT_TUNING
  }
}
