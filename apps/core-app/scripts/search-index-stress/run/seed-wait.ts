import path from 'node:path'
import type { FsStep, ScenarioPlan, SearchTarget } from '../types'
import type { Clock } from './clock'
import type { SearchDriver } from './driver-types'
import { describeError, throwIfAborted } from './errors'
import type { AppControl } from './main-ipc'
import { createMatcher, findRank } from './matching'

export interface SeedProbe {
  kind: 'app' | 'file'
  /** Typed as is: the plain name, the easiest query the index can get. */
  query: string
  target: SearchTarget
  topK: number
}

export const MAX_APP_PROBES = 3
export const MAX_FILE_PROBES = 9
const FILE_PROBE_TOP_K = 20
const APP_PROBE_TOP_K = 10
const FALLBACK_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'tiff',
  'txt',
  'md',
  'pdf',
  'json',
  'csv'
])

function stepPaths(step: FsStep, into: Set<string>): void {
  switch (step.op) {
    case 'parallel':
      step.steps.forEach((inner) => stepPaths(inner, into))
      break
    case 'copy':
    case 'move':
      into.add(step.from)
      into.add(step.to)
      break
    case 'sleep':
      break
    default:
      into.add(step.path)
  }
}

/** Every corpus path a scenario writes, moves, deletes or touches. */
export function touchedPaths(plan: ScenarioPlan): Set<string> {
  const touched = new Set<string>()
  for (const scenario of plan.scenarios) scenario.steps.forEach((step) => stepPaths(step, touched))
  return touched
}

function isTouched(file: string, touched: ReadonlySet<string>): boolean {
  let end = file.length
  while (end > 0) {
    if (touched.has(file.slice(0, end))) return true
    end = file.lastIndexOf('/', end - 1)
  }
  return false
}

function spread<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items]
  return Array.from(
    { length: count },
    (_, index) => items[Math.floor((index * items.length) / count)]
  )
}

/**
 * Searches that must succeed once the seed corpus is indexed: a few apps, and files that no
 * scenario ever touches, so a later change cannot be mistaken for slow indexing.
 */
export function pickSeedProbes(plan: ScenarioPlan): SeedProbe[] {
  const touched = touchedPaths(plan)
  const apps = new Map<string, SeedProbe>()
  const files = new Map<string, SeedProbe>()
  for (const scenario of plan.scenarios) {
    for (const check of scenario.checks) {
      if (check.expect !== 'present') continue
      if (check.target.kind === 'app' && !apps.has(check.target.name)) {
        apps.set(check.target.name, {
          kind: 'app',
          query: check.target.name,
          target: { kind: 'app', name: check.target.name },
          topK: APP_PROBE_TOP_K
        })
      } else if (
        check.target.kind === 'file' &&
        check.target.path &&
        !files.has(check.target.path) &&
        !isTouched(check.target.path, touched)
      ) {
        files.set(check.target.path, {
          kind: 'file',
          query: check.target.name,
          target: { kind: 'file', name: check.target.name, path: check.target.path },
          topK: FILE_PROBE_TOP_K
        })
      }
    }
  }
  if (files.size < MAX_FILE_PROBES) {
    for (const file of plan.corpus.files) {
      const segments = file.path.split('/')
      const extension = (segments[segments.length - 1].split('.').pop() ?? '').toLowerCase()
      if (
        files.has(file.path) ||
        isTouched(file.path, touched) ||
        segments.some((part) => part.startsWith('.'))
      )
        continue
      if (!FALLBACK_EXTENSIONS.has(extension)) continue
      const name = segments[segments.length - 1]
      files.set(file.path, {
        kind: 'file',
        query: name,
        target: { kind: 'file', name, path: file.path },
        topK: FILE_PROBE_TOP_K
      })
    }
  }
  const byQuery = (a: SeedProbe, b: SeedProbe): number =>
    a.query < b.query ? -1 : a.query > b.query ? 1 : 0
  return [
    ...spread([...apps.values()].sort(byQuery), MAX_APP_PROBES),
    ...spread([...files.values()].sort(byQuery), MAX_FILE_PROBES)
  ]
}

export interface SeedEnv {
  driver: SearchDriver
  clock: Clock
  corpusRoots: readonly string[]
  signal: AbortSignal
  /** The whole budget: `--seed-timeout`. */
  timeoutMs: number
  searchTimeoutMs: number
  /** Between rounds of probes. */
  pollMs?: number
  /** Once the files are findable, how long to go on waiting for an app to be. */
  appGraceMs?: number
  mark: (label: string) => void
  log: (line: string) => void
}

export interface SeedOutcome {
  ready: boolean
  elapsedMs: number
  rounds: number
  files: { found: number; total: number }
  apps: { found: number; total: number }
  /** Queries still unanswered when the wait ended. */
  pending: string[]
  lastError?: string
}

/** Polls the probes until the seed corpus is findable, or the budget is spent. */
export async function waitForSeed(
  probes: readonly SeedProbe[],
  env: SeedEnv
): Promise<SeedOutcome> {
  const { clock, signal } = env
  const pollMs = env.pollMs ?? 5_000
  const appGraceMs = env.appGraceMs ?? 120_000
  const startedAt = clock.now()
  const found = new Set<SeedProbe>()
  const state = {
    rounds: 0,
    lastError: undefined as string | undefined,
    filesReadyAt: null as number | null
  }
  const fileProbes = probes.filter((probe) => probe.kind === 'file')
  const appProbes = probes.filter((probe) => probe.kind === 'app')

  const outcome = (ready: boolean): SeedOutcome => ({
    ready,
    elapsedMs: clock.now() - startedAt,
    rounds: state.rounds,
    files: {
      found: fileProbes.filter((probe) => found.has(probe)).length,
      total: fileProbes.length
    },
    apps: { found: appProbes.filter((probe) => found.has(probe)).length, total: appProbes.length },
    pending: probes.filter((probe) => !found.has(probe)).map((probe) => probe.query),
    ...(state.lastError ? { lastError: state.lastError } : {})
  })

  env.mark('seed:waiting')
  for (;;) {
    throwIfAborted(signal)
    state.rounds += 1
    for (const probe of probes) {
      if (found.has(probe)) continue
      try {
        const answer = await env.driver.search(probe.query, {
          timeoutMs: env.searchTimeoutMs,
          signal
        })
        const rank = findRank(answer.rows, createMatcher(probe.target, env.corpusRoots))
        if (rank !== null && rank <= probe.topK) found.add(probe)
      } catch (error) {
        throwIfAborted(signal)
        state.lastError = describeError(error)
      }
    }
    const filesReady = fileProbes.every((probe) => found.has(probe))
    const appsReady = appProbes.length === 0 || appProbes.some((probe) => found.has(probe))
    if (filesReady) state.filesReadyAt ??= clock.now()
    if (filesReady && appsReady) {
      env.mark('seed:ready')
      return outcome(true)
    }
    if (
      filesReady &&
      state.filesReadyAt !== null &&
      clock.now() - state.filesReadyAt >= appGraceMs
    ) {
      env.log(
        `seed: no installed app became findable within ${Math.round(appGraceMs / 1000)} s of the files; search-app checks will show it`
      )
      env.mark('seed:ready-without-apps')
      return outcome(true)
    }
    if (clock.now() - startedAt >= env.timeoutMs) {
      env.mark('seed:timeout')
      return outcome(false)
    }
    await clock.sleep(pollMs, signal)
  }
}

export interface IdleEnv {
  clock: Clock
  signal: AbortSignal
  capMs: number
  pollMs?: number
  /** Samples in a row with an unchanged file count before the index counts as quiet. */
  stableSamples?: number
  mark: (label: string) => void
}

export interface IdleOutcome {
  idle: boolean
  waitedMs: number
  totalFiles: number
  note?: string
}

/** Waits (bounded, informational) for the file indexer to go quiet so the steady phase does not compete with the seed backlog. */
export async function waitForIndexIdle(
  control: Pick<AppControl, 'fileIndexStatus' | 'fileIndexStats'>,
  env: IdleEnv
): Promise<IdleOutcome> {
  const pollMs = env.pollMs ?? 2_000
  const needed = env.stableSamples ?? 3
  const startedAt = env.clock.now()
  let stable = 0
  let lastTotal = -1
  let totalFiles = 0
  env.mark('seed:waiting-for-index-idle')
  for (;;) {
    throwIfAborted(env.signal)
    try {
      const [status, stats] = await Promise.all([
        control.fileIndexStatus(),
        control.fileIndexStats()
      ])
      totalFiles = stats.totalFiles
      if (status.initializationFailed)
        return {
          idle: false,
          waitedMs: env.clock.now() - startedAt,
          totalFiles,
          note: 'file index initialization failed'
        }
      const quiet =
        !status.isInitializing &&
        !status.startupPending &&
        (status.stage === null || ['idle', 'completed'].includes(status.stage)) &&
        stats.totalFiles > 0
      stable = quiet && stats.totalFiles === lastTotal ? stable + 1 : quiet ? 1 : 0
      lastTotal = stats.totalFiles
      if (stable >= needed) {
        env.mark('seed:index-idle')
        return { idle: true, waitedMs: env.clock.now() - startedAt, totalFiles }
      }
    } catch (error) {
      throwIfAborted(env.signal)
      stable = 0
      if (env.clock.now() - startedAt >= env.capMs)
        return {
          idle: false,
          waitedMs: env.clock.now() - startedAt,
          totalFiles,
          note: describeError(error)
        }
    }
    if (env.clock.now() - startedAt >= env.capMs)
      return {
        idle: false,
        waitedMs: env.clock.now() - startedAt,
        totalFiles,
        note: 'still busy when the wait ended'
      }
    await env.clock.sleep(pollMs, env.signal)
  }
}

/** Where the probe's target sits under the corpus, for log lines. */
export function describeProbe(probe: SeedProbe): string {
  return probe.target.path
    ? `${probe.query} (${path.posix.dirname(probe.target.path)})`
    : probe.query
}
