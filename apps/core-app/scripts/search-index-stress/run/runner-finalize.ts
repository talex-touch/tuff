import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { DbIntegrity, MonitorSummary, Report } from '../eval-types'
import type { ShutdownOutcome } from './app-shutdown'
import type { AbortState } from './abort-state'
import { describeError } from './errors'
import { segmentPaths } from './layout'
import { buildReportInputs, emptyMonitorSummary } from './report-inputs'
import { loadResults } from './results-store'
import type { ResultsStore } from './results-store'
import { lastSegment, toRunMeta, writeJsonAtomic, writeMeta } from './run-meta'
import type { RunnerDeps } from './runner-deps'
import type { LiveRun, PreparedRun, RunOutcome, RunStatus } from './runner-types'

export interface FinalizeInput {
  prepared: PreparedRun
  deps: RunnerDeps
  abort: AbortState
  live: LiveRun
  store: ResultsStore
}

async function readDb(file: string): Promise<DbIntegrity | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as DbIntegrity
  } catch {
    return null
  }
}

/** Earlier segments' results stay; this segment's files carry its profile directory name once it is not the first. */
export function mergeDb(
  previous: DbIntegrity | null,
  current: DbIntegrity,
  segmentIndex: number
): DbIntegrity {
  const label = (file: string): string =>
    segmentIndex > 1 ? path.join(`profile-${segmentIndex}`, file) : file
  const results = [
    ...(segmentIndex > 1 ? (previous?.results ?? []) : []),
    ...current.results.map((entry) => ({ ...entry, file: label(entry.file) }))
  ]
  return { checked: current.checked || (segmentIndex > 1 && previous?.checked === true), results }
}

function unreachable(mainPid: number | null, reason: string): ShutdownOutcome {
  return {
    clean: false,
    how: 'left-running',
    leftPids: mainPid === null ? [] : [mainPid],
    markers: [],
    detail: reason
  }
}

/**
 * Everything after the phases, whatever way they ended: the monitor and the app are stopped, the
 * databases are checked, the report is written, and the scratch data goes only after a clean pass.
 */
export async function finalizeRun(input: FinalizeInput): Promise<RunOutcome> {
  const { prepared, deps, abort, live, store } = input
  const { layout, plan, stored, settings } = prepared
  const segment = lastSegment(stored) as NonNullable<ReturnType<typeof lastSegment>>
  const seg = segmentPaths(layout, segment.index)
  const problems: string[] = []
  const failure = { error: live.failure?.error as unknown, set: live.failure !== null }
  const fail = (what: string, error: unknown, internal = false): void => {
    problems.push(`${what}: ${describeError(error)}`)
    if (internal && !failure.set) {
      failure.error = error
      failure.set = true
    }
  }
  const cause = abort.cause()

  let monitorSummary: MonitorSummary
  try {
    if (!live.monitor) throw new Error('the app was never started, so nothing was monitored')
    monitorSummary = await live.monitor.stop()
  } catch (error) {
    if (live.monitor) fail('monitor', error)
    monitorSummary = emptyMonitorSummary(
      deps.clock.now(),
      settings.thresholds,
      `no monitor figures: ${describeError(error)}`
    )
  }
  try {
    await writeJsonAtomic(seg.monitorSummaryFile, monitorSummary)
  } catch (error) {
    fail('monitor-summary.json', error)
  }

  let shutdown: ShutdownOutcome | null = null
  if (live.app) {
    try {
      shutdown = await live.app.shutdown()
    } catch (error) {
      shutdown = unreachable(
        live.app.handles.mainPid,
        `the shutdown itself failed: ${describeError(error)}`
      )
    }
    if (!shutdown.clean)
      problems.push(`the app did not shut down cleanly (${shutdown.how}): ${shutdown.detail}`)
  }
  store.close()

  const endedAt = deps.clock.now()
  segment.endedAt = endedAt
  segment.cleanShutdown = shutdown ? shutdown.clean : true
  segment.shutdownDetail = shutdown ? shutdown.detail : 'the app was not started'
  segment.leftPids = shutdown?.leftPids ?? []
  segment.abortReason = cause?.reason ?? null
  if (live.app) segment.appPid = live.app.handles.mainPid
  stored.status = failure.set ? 'failed' : cause ? 'aborted' : 'finished'
  stored.endedAt = endedAt
  stored.abortReason = cause?.reason ?? null
  stored.switches = {
    ...stored.switches,
    ...live.switches,
    ...(cause ? { abortDetail: cause.message } : {})
  }
  try {
    await writeMeta(layout.metaFile, stored)
  } catch (error) {
    fail('meta.json', error)
  }

  let db: DbIntegrity = { checked: false, results: [] }
  if (live.app && segment.leftPids.length === 0) {
    try {
      db = await deps.checkDatabases(seg.profileDir)
    } catch (error) {
      fail('database check', error)
    }
  }
  try {
    db = mergeDb(await readDb(layout.dbFile), db, segment.index)
    await writeJsonAtomic(layout.dbFile, db)
  } catch (error) {
    fail('db-integrity.json', error)
  }

  const results = loadResults(layout.resultsFile)
  const inputs = buildReportInputs({
    meta: toRunMeta(stored, plan.scenarios.length, endedAt),
    plan,
    results,
    monitor: monitorSummary,
    db
  })
  let report: Report | null = null
  let reportFiles: RunOutcome['reportFiles'] = null
  try {
    report = deps.report.build(inputs)
    reportFiles = await deps.report.write(layout.runDir, report)
  } catch (error) {
    fail('report', error, true)
  }

  const verdict = report?.verdict ?? null
  const clean = shutdown === null || (shutdown.clean && shutdown.leftPids.length === 0)
  const kept: string[] = []
  const removed: string[] = []
  const scratch = [
    ...(layout.corpusOwnedDir ? [layout.corpusOwnedDir] : [layout.corpusRoot]),
    ...stored.segments.map((entry) => segmentPaths(layout, entry.index).profileDir)
  ]
  const mayClean =
    verdict === 'pass' &&
    !cause &&
    !failure.set &&
    clean &&
    problems.length === 0 &&
    stored.segments.every((entry) => entry.leftPids.length === 0)
  if (!mayClean || settings.keep) {
    kept.push(...scratch)
  } else {
    const corpus = await deps.cleanup.removeCorpus(layout).catch((error: unknown) => ({
      removed: false as const,
      dir: layout.corpusOwnedDir,
      reason: describeError(error)
    }))
    if (corpus.removed) removed.push(corpus.dir)
    else {
      kept.push(corpus.dir ?? layout.corpusRoot)
      if (layout.corpusOwnedDir !== null)
        problems.push(`the corpus was not deleted: ${corpus.reason}`)
    }
    for (const entry of stored.segments) {
      const dir = segmentPaths(layout, entry.index).profileDir
      try {
        await deps.cleanup.removeDir(dir)
        removed.push(dir)
      } catch (error) {
        kept.push(dir)
        problems.push(`could not delete ${dir}: ${describeError(error)}`)
      }
    }
  }

  const status: RunStatus = failure.set
    ? 'error'
    : live.refusal
      ? 'refused'
      : cause
        ? 'aborted'
        : !clean || verdict !== 'pass'
          ? 'fail'
          : 'pass'
  const notRun = inputs.notRun.length
  return {
    exitCode: status === 'pass' ? 0 : status === 'error' ? 3 : status === 'refused' ? 2 : 1,
    status,
    runId: stored.runId,
    runDir: layout.runDir,
    abortReason: cause?.reason ?? null,
    abortDetail: cause?.message ?? null,
    verdict,
    gates: report?.gates ?? [],
    reportFiles,
    counts: { planned: plan.scenarios.length, withResults: plan.scenarios.length - notRun, notRun },
    problems,
    kept,
    removed,
    ...(failure.set ? { error: describeError(failure.error) } : {})
  }
}
