import { mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { ScenarioPlan, SearchTarget } from '../types'
import type { ShutdownOutcome } from './app-shutdown'
import type { AbortState } from './abort-state'
import { createAbortState } from './abort-state'
import type { CommonOptions } from './args'
import { prepareCorpus } from './corpus'
import { describeError, RunRefused } from './errors'
import { describeDiscovery, pickApps } from './installed-apps'
import type { RunLayout } from './layout'
import { buildLayout, segmentPaths } from './layout'
import { createMatcher, findRank } from './matching'
import { assertRunnable } from './preflight'
import type { RunnerDeps } from './runner-deps'
import { estimatePlannedBytes } from './runner-setup'
import type { SeedOutcome } from './seed-wait'
import { pickSeedProbes, waitForSeed } from './seed-wait'

export interface ProbeOptions extends CommonOptions {
  keep: boolean
  nice: number
  appsFile?: string
  /** Tests only; the command line always uses a fresh directory under the stress root. */
  runDir?: string
  /** Tests only; the command line waits SEED_TIMEOUT_MS. */
  seedTimeoutMs?: number
}

export interface ProbeSearch {
  label: string
  query: string
  /** What the search should bring up; absent for queries that only show behaviour. */
  target?: SearchTarget
  topK: number
}

export interface ProbeFinding {
  label: string
  query: string
  rows: number | null
  answerMs: number | null
  endSignalSeen: boolean | null
  top: string[]
  /** Rank of the target: null when it was not among the rows, absent when the search has no target. */
  rank?: number | null
  error?: string
}

export interface ProbeResult {
  exitCode: 0 | 1
  runId: string
  runDir: string
  seed: SeedOutcome | null
  findings: ProbeFinding[]
  shutdown: ShutdownOutcome | null
  problems: string[]
  removed: string[]
  kept: string[]
}

const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|webp|bmp|tiff?|heic)$/i
const DOCUMENT_EXTENSION = /\.(?:txt|md|pdf|json|csv)$/i
const CJK_PAIR = /[\u3400-\u9fff]{2}/
const PREFERRED_APPS = ['Safari', 'Notes', 'Calendar', 'Finder']
const PROBE_SCENARIOS = 20
const SEED_TIMEOUT_MS = 300_000
const SEARCH_TIMEOUT_MS = 8_000
const SEARCH_COUNT = 8

/** Swaps two neighbouring letters inside the word, the way a hurried typist does. */
export function withTypo(text: string): string {
  const chars = [...text]
  for (let index = 1; index < chars.length - 2; index += 1) {
    if (chars[index] !== chars[index + 1]) {
      ;[chars[index], chars[index + 1]] = [chars[index + 1], chars[index]]
      return chars.join('')
    }
  }
  return `${text}x`
}

const search = (
  label: string,
  query: string,
  topK: number,
  target?: SearchTarget
): ProbeSearch => ({ label, query, topK, ...(target ? { target } : {}) })

/** The eight searches of a probe: what the corpus seeds and the machine has, plus the awkward inputs. */
export function cannedSearches(plan: ScenarioPlan, available: readonly string[]): ProbeSearch[] {
  const app = PREFERRED_APPS.find((name) => available.includes(name)) ?? available[0] ?? 'Safari'
  const appTarget: SearchTarget = { kind: 'app', name: app }
  const shown = plan.corpus.files.filter(
    (file) => !file.path.split('/').some((part) => part.startsWith('.'))
  )
  const targetOf = (file: { path: string }): SearchTarget => ({
    kind: 'file',
    name: path.posix.basename(file.path),
    path: file.path
  })
  const document = shown.find((file) => DOCUMENT_EXTENSION.test(file.path))
  const image = shown.find((file) => IMAGE_EXTENSION.test(file.path))
  const cjk = shown.find((file) => CJK_PAIR.test(path.posix.basename(file.path)))
  const imageName = image ? path.posix.basename(image.path) : null
  return [
    search('installed app', app, 10, appTarget),
    search(
      'seeded file',
      document ? path.posix.basename(document.path) : 'readme',
      20,
      document ? targetOf(document) : undefined
    ),
    search('seeded image', imageName ?? 'image', 20, image ? targetOf(image) : undefined),
    search(
      'name with a typo',
      withTypo(imageName ? imageName.replace(IMAGE_EXTENSION, '') : app),
      20,
      image ? targetOf(image) : appTarget
    ),
    search('nonsense', 'zzqxjv-no-such-thing-0', 1),
    search('very short query', app.slice(0, 2).toLowerCase(), 10, appTarget),
    search(
      'CJK query',
      cjk ? (path.posix.basename(cjk.path).match(CJK_PAIR) as RegExpMatchArray)[0] : '截图',
      20,
      cjk ? targetOf(cjk) : undefined
    ),
    search('empty query', '', 1)
  ]
}

export function formatFinding(finding: ProbeFinding, index: number): string {
  const head = `${index + 1}. ${finding.label} ${JSON.stringify(finding.query)}`
  if (finding.error) return `${head}: FAILED ${finding.error}`
  const rank =
    finding.rank === undefined
      ? ''
      : finding.rank === null
        ? ', target not in the rows'
        : `, target at rank ${finding.rank}`
  const signal = finding.endSignalSeen ? 'end signal seen' : 'cut at the timeout'
  const top = finding.top.length > 0 ? `; top: ${finding.top.join(' | ')}` : ''
  return `${head}: ${finding.rows} rows in ${finding.answerMs} ms, ${signal}${rank}${top}`
}

interface ProbeSetup {
  layout: RunLayout
  plan: ScenarioPlan
  available: string[]
}

async function setUp(
  options: ProbeOptions,
  deps: RunnerDeps,
  out: (line: string) => void,
  runId: string
): Promise<ProbeSetup> {
  let available: string[]
  let used: string[]
  if (options.appsFile) {
    available = await deps.readAppsFile(options.appsFile)
    used = available
    out(`apps: ${available.length} names from ${options.appsFile}`)
  } else {
    const discovered = await deps.discoverApps()
    available = discovered.names
    used = pickApps(discovered.names, 1)
    out(describeDiscovery(discovered, used.length))
  }
  const plan = deps.plan.generatePlan({ seed: 1, count: PROBE_SCENARIOS, apps: used })
  const invalid = deps.plan.validatePlan(plan)
  if (invalid.length > 0)
    throw new Error(
      `the generated plan is invalid (${invalid.length} problem(s)): ${invalid.slice(0, 3).join('; ')}`
    )

  const items = await deps.preflight({
    embedding: options.embedding,
    ...(options.corpusRoot ? { corpusRoot: options.corpusRoot } : {}),
    plannedBytes: estimatePlannedBytes(plan),
    appCount: available.length,
    ...(options.appsFile ? { appsFromFile: true } : {})
  })
  for (const item of items)
    if (item.status === 'warn') out(`warning: ${item.title}: ${item.detail}`)
  assertRunnable(items)

  const layout = buildLayout({
    runId,
    ...(options.runDir ? { runDir: options.runDir } : {}),
    ...(options.corpusRoot ? { corpusRoot: options.corpusRoot } : {}),
    ...(deps.corpusBase ? { corpusBase: deps.corpusBase } : {})
  })
  await mkdir(layout.runDir, { recursive: true })
  out(`probe ${runId}: output ${layout.runDir}`)
  const written = await prepareCorpus(layout, plan.corpus, {
    materialize: deps.plan.materializeCorpus,
    now: deps.clock.now
  })
  out(`corpus: ${written.files} files written to ${layout.corpusRoot}`)
  return { layout, plan, available }
}

/** Deletes what the probe made; a corpus root given with --corpus-root is never touched. */
async function discard(
  layout: RunLayout,
  deps: RunnerDeps
): Promise<{ removed: string[]; kept: string[] }> {
  const removed: string[] = []
  const kept: string[] = []
  const corpus = await deps.cleanup.removeCorpus(layout).catch(() => null)
  if (corpus?.removed) removed.push(corpus.dir)
  else kept.push(corpus?.dir ?? layout.corpusRoot)
  try {
    await deps.cleanup.removeDir(layout.runDir)
    removed.push(layout.runDir)
  } catch {
    kept.push(layout.runDir)
  }
  return { removed, kept }
}

async function runSearches(
  app: Awaited<ReturnType<RunnerDeps['launch']>>,
  searches: readonly ProbeSearch[],
  roots: readonly string[],
  abort: AbortState,
  out: (line: string) => void
): Promise<ProbeFinding[]> {
  const findings: ProbeFinding[] = []
  for (const probe of searches) {
    if (abort.stop.aborted) break
    const finding: ProbeFinding = {
      label: probe.label,
      query: probe.query,
      rows: null,
      answerMs: null,
      endSignalSeen: null,
      top: []
    }
    try {
      const answer = await app.driver.search(probe.query, {
        timeoutMs: SEARCH_TIMEOUT_MS,
        signal: abort.stop
      })
      finding.rows = answer.rows.length
      finding.answerMs = answer.answerMs
      finding.endSignalSeen = answer.endSignalSeen
      finding.top = answer.rows.slice(0, 3).map((row) => row.name)
      if (probe.target) finding.rank = findRank(answer.rows, createMatcher(probe.target, roots))
    } catch (error) {
      if (abort.stop.aborted) break
      finding.error = describeError(error)
    }
    findings.push(finding)
    out(formatFinding(finding, findings.length - 1))
  }
  return findings
}

/**
 * Starts one isolated app on a small seeded corpus, runs the eight searches, prints what came
 * back and stops the app. It measures nothing; it shows whether the harness can see the app at all.
 */
export async function runProbe(
  options: ProbeOptions,
  deps: RunnerDeps,
  out: (line: string) => void
): Promise<ProbeResult> {
  const runId = `probe-${deps.newRunId()}`
  const lock = await deps.acquireLock(runId)
  const abort = createAbortState(deps.signal, deps.clock, deps.tuning.abortGraceMs)
  try {
    const { layout, plan, available } = await setUp(options, deps, out, runId)
    const result: ProbeResult = {
      exitCode: 1,
      runId,
      runDir: layout.runDir,
      seed: null,
      findings: [],
      shutdown: null,
      problems: [],
      removed: [],
      kept: []
    }

    let app: Awaited<ReturnType<RunnerDeps['launch']>>
    try {
      app = await deps.launch({
        appDir: deps.appDir,
        segment: segmentPaths(layout, 1),
        corpusRoot: layout.corpusRoot,
        ports: await deps.allocatePorts(),
        ui: options.ui,
        embedding: options.embedding,
        nice: options.nice,
        ...(deps.tuning.startTimeoutMs !== undefined
          ? { startTimeoutMs: deps.tuning.startTimeoutMs }
          : {})
      })
    } catch (error) {
      if (error instanceof RunRefused) await discard(layout, deps)
      throw error
    }
    out(
      `app: pid ${app.handles.mainPid}, ${options.ui === 'show' ? 'visible' : 'hidden'}, nice ${options.nice}`
    )

    const roots = [
      ...new Set([
        layout.corpusRoot,
        await realpath(layout.corpusRoot).catch(() => layout.corpusRoot)
      ])
    ]
    try {
      const seed = await waitForSeed(pickSeedProbes(plan), {
        driver: app.driver,
        clock: deps.clock,
        corpusRoots: roots,
        signal: abort.stop,
        timeoutMs: options.seedTimeoutMs ?? SEED_TIMEOUT_MS,
        searchTimeoutMs: SEARCH_TIMEOUT_MS,
        pollMs: deps.tuning.seedPollMs,
        appGraceMs: deps.tuning.seedAppGraceMs,
        mark: () => undefined,
        log: out
      })
      result.seed = seed
      out(
        `seed: ${seed.ready ? 'findable' : 'NOT findable'} after ${Math.round(seed.elapsedMs / 1000)} s (${seed.files.found}/${seed.files.total} files, ${seed.apps.found}/${seed.apps.total} apps)`
      )
      if (!seed.ready)
        result.problems.push(
          `the seeded corpus was not findable (still missing: ${seed.pending.join(', ') || 'none listed'}${seed.lastError ? `; last error: ${seed.lastError}` : ''})`
        )
      result.findings = await runSearches(app, cannedSearches(plan, available), roots, abort, out)
    } catch (error) {
      if (!abort.stop.aborted) result.problems.push(`the probe failed: ${describeError(error)}`)
    } finally {
      result.shutdown = await app.shutdown().catch(
        (error: unknown): ShutdownOutcome => ({
          clean: false,
          how: 'left-running',
          leftPids: [app.handles.mainPid],
          markers: [],
          detail: `the shutdown itself failed: ${describeError(error)}`
        })
      )
    }

    const shutdown = result.shutdown
    out(`shutdown: ${shutdown.clean ? 'clean' : 'NOT clean'} (${shutdown.how}) ${shutdown.detail}`)
    const cause = abort.cause()
    if (cause) result.problems.push(cause.message)
    else if (result.findings.length < SEARCH_COUNT && result.problems.length === 0)
      result.problems.push(`only ${result.findings.length} of ${SEARCH_COUNT} searches ran`)
    for (const finding of result.findings)
      if (finding.error)
        result.problems.push(
          `${finding.label} ${JSON.stringify(finding.query)} failed: ${finding.error}`
        )
    if (!shutdown.clean || shutdown.leftPids.length > 0)
      result.problems.push(
        `the app did not shut down cleanly (${shutdown.how}): ${shutdown.detail}`
      )

    if (result.problems.length === 0 && !options.keep) {
      const { removed, kept } = await discard(layout, deps)
      result.removed.push(...removed)
      result.kept.push(...kept)
    } else {
      result.kept.push(
        layout.runDir,
        ...(layout.corpusOwnedDir ? [layout.corpusOwnedDir] : [layout.corpusRoot])
      )
    }
    result.exitCode = result.problems.length === 0 ? 0 : 1
    if (result.kept.length > 0) out(`kept: ${result.kept.join(', ')}`)
    return result
  } finally {
    abort.dispose()
    await lock.release().catch(() => undefined)
  }
}
