import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { FsStep, ScenarioPlan } from '../types'
import type { RunOptions } from './args'
import { UsageError } from './args'
import { RunRefused } from './errors'
import { describeDiscovery, pickApps } from './installed-apps'
import type { RunLayout } from './layout'
import { buildLayout, resolveResumeTarget, segmentPaths } from './layout'
import { assertRunnable } from './preflight'
import type { ProfileSpec } from './profiles'
import { resolveProfile } from './profiles'
import { planResume } from './resume'
import { loadResults } from './results-store'
import type { SegmentRecord, StoredMeta } from './run-meta'
import { lastSegment, readMeta, writeJsonAtomic, writeMeta } from './run-meta'
import type { RunnerDeps } from './runner-deps'
import type { PreparedRun, RunSettings } from './runner-types'

function stepBytes(step: FsStep): number {
  switch (step.op) {
    case 'write':
    case 'write-atomic':
      return step.payload.bytes
    case 'parallel':
      return step.steps.reduce((sum, inner) => sum + stepBytes(inner), 0)
    default:
      return 0
  }
}

/** The seed corpus plus everything the scenarios write, for the disk and size checks. */
export function estimatePlannedBytes(plan: ScenarioPlan): number {
  let bytes = plan.corpus.files.reduce((sum, file) => sum + file.payload.bytes, 0)
  for (const scenario of plan.scenarios) for (const step of scenario.steps) bytes += stepBytes(step)
  return bytes
}

function settingsFromOptions(options: RunOptions, spec: ProfileSpec): RunSettings {
  return {
    embedding: options.embedding,
    ui: options.ui,
    qps: options.qps,
    nice: options.nice,
    steadyConcurrency: spec.steadyConcurrency,
    burstConcurrency: spec.burstConcurrency,
    searchTimeoutMs: options.searchTimeoutMs,
    seedTimeoutSec: options.seedTimeoutSec,
    ...(options.thresholds ? { thresholds: options.thresholds } : {}),
    keep: options.keep
  }
}

function settingsFromStored(stored: StoredMeta, keep: boolean): RunSettings {
  const { options } = stored
  return {
    embedding: options.embedding,
    ui: options.ui,
    qps: options.qps,
    nice: options.nice,
    steadyConcurrency: options.concurrency,
    burstConcurrency: options.burstConcurrency,
    searchTimeoutMs: options.searchTimeoutMs,
    seedTimeoutSec: options.seedTimeoutSec,
    ...(options.thresholds ? { thresholds: options.thresholds } : {}),
    keep
  }
}

function newSegment(layout: RunLayout, index: number, startedAt: number): SegmentRecord {
  return {
    index,
    profileDir: segmentPaths(layout, index).profileDir,
    startedAt,
    endedAt: null,
    cleanShutdown: null,
    appPid: null,
    leftPids: [],
    abortReason: null
  }
}

async function readPlan(file: string): Promise<ScenarioPlan> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as ScenarioPlan
  } catch (error) {
    throw new RunRefused(
      `${file} is missing or unreadable (${(error as Error).message}); the run cannot be resumed`
    )
  }
}

async function preflightOrRefuse(
  deps: RunnerDeps,
  plan: ScenarioPlan,
  input: { embedding: 'on' | 'off'; corpusRoot?: string; appCount: number; appsFromFile: boolean }
): Promise<void> {
  const items = await deps.preflight({
    embedding: input.embedding,
    ...(input.corpusRoot ? { corpusRoot: input.corpusRoot } : {}),
    plannedBytes: estimatePlannedBytes(plan),
    appCount: input.appCount,
    ...(input.appsFromFile ? { appsFromFile: true } : {})
  })
  for (const item of items)
    if (item.status === 'warn') deps.log(`warning: ${item.title}: ${item.detail}`)
  assertRunnable(items)
}

async function prepareFresh(
  options: RunOptions,
  deps: RunnerDeps,
  runId: string
): Promise<Omit<PreparedRun, 'release'>> {
  let spec: ProfileSpec
  try {
    spec = resolveProfile(
      options.profile,
      {
        ...(options.count !== undefined ? { count: options.count } : {}),
        ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
        ...(options.burstConcurrency !== undefined
          ? { burstConcurrency: options.burstConcurrency }
          : {})
      },
      deps.plan.profileCounts
    )
  } catch (error) {
    throw new UsageError((error as Error).message)
  }
  const layout = buildLayout({
    runId,
    ...(options.runDir ? { runDir: options.runDir } : {}),
    ...(options.corpusRoot ? { corpusRoot: options.corpusRoot } : {}),
    ...(deps.corpusBase ? { corpusBase: deps.corpusBase } : {})
  })
  if (await readMeta(layout.metaFile)) {
    throw new RunRefused(
      `${layout.runDir} already holds a run; continue it with --resume or pick another --run-dir`
    )
  }

  let apps: string[]
  let found: number | null = null
  if (options.appsFile) {
    apps = await deps.readAppsFile(options.appsFile)
    deps.log(`apps: ${apps.length} names from ${options.appsFile}`)
  } else {
    const discovered = await deps.discoverApps()
    found = discovered.names.length
    apps = pickApps(discovered.names, options.seed)
    deps.log(describeDiscovery(discovered, apps.length))
  }

  const plan = deps.plan.generatePlan({
    seed: options.seed,
    count: spec.count,
    apps,
    ...(spec.mix ? { mix: spec.mix } : {})
  })
  const problems = deps.plan.validatePlan(plan)
  if (problems.length > 0) {
    throw new Error(
      `the generated plan is invalid (${problems.length} problem(s)): ${problems.slice(0, 5).join('; ')}`
    )
  }
  await preflightOrRefuse(deps, plan, {
    embedding: options.embedding,
    ...(options.corpusRoot ? { corpusRoot: options.corpusRoot } : {}),
    appCount: found ?? apps.length,
    appsFromFile: Boolean(options.appsFile)
  })

  const settings = settingsFromOptions(options, spec)
  const versions = await deps.versions()
  const startedAt = deps.clock.now()
  const stored: StoredMeta = {
    version: 1,
    runId,
    profile: options.profile,
    seed: options.seed,
    count: plan.scenarios.length,
    argv: [...deps.argv],
    startedAt,
    endedAt: null,
    status: 'running',
    abortReason: null,
    options: {
      embedding: settings.embedding,
      ui: settings.ui,
      qps: settings.qps,
      nice: settings.nice,
      concurrency: settings.steadyConcurrency,
      burstConcurrency: settings.burstConcurrency,
      searchTimeoutMs: settings.searchTimeoutMs,
      seedTimeoutSec: settings.seedTimeoutSec,
      ...(settings.thresholds ? { thresholds: settings.thresholds } : {})
    },
    corpus: { root: layout.corpusRoot, owned: layout.corpusOwnedDir !== null },
    host: deps.host(),
    ...versions,
    apps: { found, used: apps.length },
    switches: {},
    segments: [newSegment(layout, 1, startedAt)]
  }
  await mkdir(layout.runDir, { recursive: true })
  await writeJsonAtomic(layout.planFile, plan)
  await writeMeta(layout.metaFile, stored)
  return { layout, plan, stored, spec, settings, resume: null }
}

async function prepareResume(
  options: RunOptions,
  deps: RunnerDeps
): Promise<Omit<PreparedRun, 'release'>> {
  const target = resolveResumeTarget(options.resume as string)
  const stored = await readMeta(path.join(target.runDir, 'meta.json'))
  if (!stored)
    throw new RunRefused(
      `${target.runDir} is not a stress run (no readable meta.json); nothing to resume`
    )
  if (stored.status === 'finished')
    throw new RunRefused(
      `run ${stored.runId} already finished; "report ${target.runDir}" shows its report`
    )

  const layout = buildLayout({
    runId: stored.runId,
    runDir: target.runDir,
    ...(stored.corpus.owned ? {} : { corpusRoot: stored.corpus.root }),
    ...(deps.corpusBase ? { corpusBase: deps.corpusBase } : {})
  })
  const plan = await readPlan(layout.planFile)
  const resume = planResume(plan, loadResults(layout.resultsFile))
  if (resume.pending.length === 0) {
    throw new RunRefused(
      `every scenario of run ${stored.runId} has a result or was cut short; "report ${target.runDir}" shows what there is`
    )
  }

  let spec: ProfileSpec
  try {
    spec = resolveProfile(
      stored.profile,
      {
        count: stored.count,
        concurrency: stored.options.concurrency,
        burstConcurrency: stored.options.burstConcurrency
      },
      deps.plan.profileCounts
    )
  } catch (error) {
    throw new RunRefused(
      `the stored profile of run ${stored.runId} is unusable: ${(error as Error).message}`
    )
  }
  const settings = settingsFromStored(stored, options.keep)
  await preflightOrRefuse(deps, plan, {
    embedding: settings.embedding,
    ...(stored.corpus.owned ? {} : { corpusRoot: stored.corpus.root }),
    appCount: stored.apps.found ?? stored.apps.used,
    appsFromFile: stored.apps.found === null
  })

  const now = deps.clock.now()
  const previous = lastSegment(stored)
  if (previous && previous.endedAt === null) {
    previous.endedAt = Math.max(previous.startedAt, now)
    previous.cleanShutdown = false
    previous.shutdownDetail =
      'the runner stopped without finishing this segment (killed, crashed or power loss)'
  }
  stored.segments.push(newSegment(layout, stored.segments.length + 1, now))
  stored.status = 'running'
  stored.endedAt = null
  stored.abortReason = null
  delete stored.switches.abortDetail
  await writeMeta(layout.metaFile, stored)
  deps.log(
    `resuming run ${stored.runId}: segment ${stored.segments.length}, ${resume.pending.length} of ${plan.scenarios.length} scenarios still to run; settings come from the run's meta.json`
  )
  return { layout, plan, stored, spec, settings, resume }
}

/**
 * Takes the run lock, settles what is to be run (a fresh plan or the stored one), lets the
 * preflight refuse, and writes plan.json and meta.json. The lock is released again when it throws.
 */
export async function prepareRun(options: RunOptions, deps: RunnerDeps): Promise<PreparedRun> {
  const runId = options.resume ? resolveResumeTarget(options.resume).runId : deps.newRunId()
  const lock = await deps.acquireLock(runId)
  try {
    const prepared = options.resume
      ? await prepareResume(options, deps)
      : await prepareFresh(options, deps, runId)
    return { ...prepared, release: () => lock.release() }
  } catch (error) {
    await lock.release().catch(() => undefined)
    throw error
  }
}
