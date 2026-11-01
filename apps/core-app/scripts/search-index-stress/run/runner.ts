import type { StressMonitor } from '../eval-types'
import type { RunOptions } from './args'
import { createAbortState } from './abort-state'
import { prepareCorpus } from './corpus'
import { describeError, RunAbort, RunRefused } from './errors'
import { segmentPaths } from './layout'
import { createProgress } from './progress'
import { loadResults, openResultsStore } from './results-store'
import type { ResultsStore } from './results-store'
import { lastSegment, writeMeta } from './run-meta'
import type { RunnableApp, RunnerDeps } from './runner-deps'
import { finalizeRun } from './runner-finalize'
import { runPhases } from './runner-phases'
import { prepareRun } from './runner-setup'
import type { LiveRun, PreparedRun, RunOutcome } from './runner-types'
import { skipScenario } from './scenario-run'

const mib = (bytes: number): string => `${Math.round(bytes / 1024 ** 2)} MiB`

async function startApp(
  prepared: PreparedRun,
  deps: RunnerDeps,
  live: LiveRun
): Promise<{ app: RunnableApp; monitor: StressMonitor }> {
  const { layout, plan, stored, settings } = prepared
  const segment = lastSegment(stored) as NonNullable<ReturnType<typeof lastSegment>>
  const ports = await deps.allocatePorts()
  const app = await deps.launch({
    appDir: deps.appDir,
    segment: segmentPaths(layout, segment.index),
    corpusRoot: layout.corpusRoot,
    ports,
    ui: settings.ui,
    embedding: settings.embedding,
    nice: settings.nice,
    ...(deps.tuning.startTimeoutMs !== undefined
      ? { startTimeoutMs: deps.tuning.startTimeoutMs }
      : {})
  })
  live.app = app
  segment.appPid = app.handles.mainPid
  await writeMeta(layout.metaFile, stored)
  deps.log(
    `app: pid ${app.handles.mainPid}, cdp ${app.handles.cdpPort}, ${settings.ui === 'show' ? 'visible' : 'hidden'}, nice ${settings.nice}, ${plan.scenarios.length} scenarios planned`
  )

  const monitor = deps.createMonitor(app.handles, {
    ...(settings.thresholds ? { thresholds: settings.thresholds } : {}),
    log: (line) => deps.log(`monitor: ${line}`)
  })
  live.monitor = monitor
  monitor.onBreach((breach) =>
    deps.log(
      `breach [${breach.severity}] ${breach.kind} ${Math.round(breach.value)} (limit ${breach.limit}) during ${breach.phase}`
    )
  )
  await monitor.start()
  return { app, monitor }
}

async function runSegment(
  prepared: PreparedRun,
  deps: RunnerDeps,
  abort: ReturnType<typeof createAbortState>,
  live: LiveRun,
  store: ResultsStore
): Promise<void> {
  const { layout, plan } = prepared
  const progress = createProgress(deps.clock)
  const counted: ResultsStore = {
    ...store,
    appendCheck: (result) => {
      progress.check(result.outcome)
      store.appendCheck(result)
    }
  }

  if (prepared.resume) {
    const loaded = loadResults(layout.resultsFile)
    for (const { scenario, missing } of prepared.resume.interrupted) {
      skipScenario(
        counted,
        scenario,
        'resume',
        'cut short by an earlier segment of this run; its filesystem steps may be half applied, so they are not repeated',
        missing
      )
    }
    deps.log(
      `resume: ${loaded.completed.size} scenarios finished earlier, ${prepared.resume.interrupted.length} cut short and skipped`
    )
  }

  const written = await prepareCorpus(layout, plan.corpus, {
    materialize: deps.plan.materializeCorpus,
    now: deps.clock.now
  })
  deps.log(
    written.reused
      ? `corpus: ${layout.corpusRoot} already complete`
      : `corpus: ${written.files} files, ${mib(written.bytes)} written to ${layout.corpusRoot}`
  )
  if (abort.stop.aborted) return

  const { app, monitor } = await startApp(prepared, deps, live)
  await runPhases({ prepared, deps, abort, app, monitor, store: counted, progress, live })
}

function failedOutcome(prepared: PreparedRun, error: unknown): RunOutcome {
  const planned = prepared.plan.scenarios.length
  return {
    exitCode: 3,
    status: 'error',
    runId: prepared.layout.runId,
    runDir: prepared.layout.runDir,
    abortReason: 'internal-error',
    abortDetail: describeError(error),
    verdict: null,
    gates: [],
    reportFiles: null,
    counts: { planned, withResults: 0, notRun: planned },
    problems: [`finishing the run failed: ${describeError(error)}`],
    kept: [prepared.layout.corpusRoot, prepared.layout.profileDir],
    removed: [],
    error: describeError(error)
  }
}

/** One run, start to end: the report is written and the app is stopped whichever way it goes. */
export async function runRun(options: RunOptions, deps: RunnerDeps): Promise<RunOutcome> {
  const prepared = await prepareRun(options, deps)
  try {
    const abort = createAbortState(deps.signal, deps.clock, deps.tuning.abortGraceMs)
    const live: LiveRun = { app: null, monitor: null, switches: {}, failure: null, refusal: null }
    const store = openResultsStore(prepared.layout.resultsFile, deps.clock.now)
    deps.log(
      `run ${prepared.layout.runId}: ${prepared.stored.profile}, ${prepared.plan.scenarios.length} scenarios, output ${prepared.layout.runDir}`
    )
    try {
      await runSegment(prepared, deps, abort, live, store)
    } catch (error) {
      if (error instanceof RunAbort) abort.request(error, 'immediate')
      else if (error instanceof RunRefused) {
        live.refusal = { message: error.message }
        abort.request(new RunAbort('refused', error.message), 'immediate')
      } else {
        live.failure = { error }
        abort.request(new RunAbort('internal-error', describeError(error)), 'immediate')
      }
    }
    try {
      return await finalizeRun({ prepared, deps, abort, live, store })
    } catch (error) {
      return failedOutcome(prepared, error)
    } finally {
      abort.dispose()
    }
  } finally {
    await prepared.release().catch(() => undefined)
  }
}
