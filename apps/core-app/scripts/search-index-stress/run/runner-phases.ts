import { realpath } from 'node:fs/promises'
import type { StressMonitor } from '../eval-types'
import type { Scenario } from '../types'
import type { AbortState } from './abort-state'
import { describeError, RunAbort } from './errors'
import type { CheckEnv } from './evaluate-check'
import { DriverHealth } from './evaluate-check'
import { createFsExecutor } from './fs-exec'
import type { PacingStats } from './pacing'
import { createPacedLimiter, createPacer } from './pacing'
import type { Progress } from './progress'
import { createRateLimiter } from './rate-limiter'
import type { ResultsStore } from './results-store'
import type { RunnableApp, RunnerDeps } from './runner-deps'
import type { LiveRun, PreparedRun } from './runner-types'
import type { ScenarioRunContext } from './scenario-run'
import { runScenario, skipScenario } from './scenario-run'
import type { ItemState } from './scheduler'
import { runPhase } from './scheduler'
import { pickSeedProbes, waitForIndexIdle, waitForSeed } from './seed-wait'

export interface PhaseRunContext {
  prepared: PreparedRun
  deps: RunnerDeps
  abort: AbortState
  app: RunnableApp
  monitor: StressMonitor
  /** Counts every check outcome for the ticker on its way to the results file. */
  store: ResultsStore
  progress: Progress
  live: LiveRun
}

const asAbort = (error: unknown): RunAbort =>
  error instanceof RunAbort ? error : new RunAbort('internal-error', describeError(error))

function pacingSwitches(stats: PacingStats): Record<string, number> {
  return {
    throttledSeconds: stats.throttledSeconds,
    criticalHolds: stats.criticalHolds,
    criticalHoldSeconds: stats.criticalHoldSeconds,
    criticalTimeouts: stats.criticalTimeouts,
    degradedEpisodes: stats.degradedEpisodes
  }
}

async function every(
  ms: number,
  signal: AbortSignal,
  deps: RunnerDeps,
  tick: () => Promise<void> | void
): Promise<void> {
  while (!signal.aborted) {
    await deps.clock.sleep(ms, signal)
    if (signal.aborted) break
    await tick()
  }
}

/** Seed, steady, burst, drain. Returns early, with the abort state set, when the run cannot go on. */
export async function runPhases(ctx: PhaseRunContext): Promise<void> {
  const { prepared, deps, abort, app, monitor, store, progress, live } = ctx
  const { layout, plan, settings } = prepared
  const { clock, tuning } = deps
  const phase = { name: 'seed' }
  const inflight = { count: 0 }
  const setPhase = (name: string): void => {
    phase.name = name
    monitor.setPhase(name)
    progress.setPhase(name)
  }

  const states = new Map<string, ItemState>(prepared.resume?.settled ?? [])
  const pending = prepared.resume ? prepared.resume.pending : plan.scenarios
  const steadyIds = new Set(
    plan.scenarios
      .slice(0, Math.round(plan.scenarios.length * prepared.spec.steadyShare))
      .map((scenario) => scenario.id)
  )
  const stages: Array<{ name: 'steady' | 'burst'; items: Scenario[]; concurrency: number }> = [
    {
      name: 'steady',
      items: pending.filter((scenario) => steadyIds.has(scenario.id)),
      concurrency: settings.steadyConcurrency
    },
    {
      name: 'burst',
      items: pending.filter((scenario) => !steadyIds.has(scenario.id)),
      concurrency: settings.burstConcurrency
    }
  ]
  progress.setTotal(pending.length)

  const pacer = createPacer({
    clock,
    base: settings.steadyConcurrency,
    pressure: () => monitor.pressure(),
    mark: (label) => monitor.mark(label),
    okHoldMs: tuning.pacerOkHoldMs,
    holdMaxMs: tuning.pacerHoldMaxMs
  })
  const limiter = createPacedLimiter(
    createRateLimiter(settings.qps, clock),
    createRateLimiter(Math.max(0.1, settings.qps / 2), clock),
    () => pacer.level()
  )
  const health = new DriverHealth(tuning.health)

  const background = new AbortController()
  const loops: Array<Promise<void>> = [
    every(tuning.watchdogMs, background.signal, deps, () => {
      if (app.isMainAlive()) return
      abort.request(
        new RunAbort('app-exited', `the app's main process (pid ${app.handles.mainPid}) is gone`),
        'immediate'
      )
      background.abort()
    })
  ]
  if (tuning.tickerMs > 0) {
    loops.push(
      every(tuning.tickerMs, background.signal, deps, async () => {
        const cpuPct = await deps.sampleCpu(app.handles.mainPid)
        deps.progress(
          progress.line({ pressure: monitor.pressure().level, cpuPct, inflight: inflight.count })
        )
      })
    )
  }

  try {
    const real = await realpath(layout.corpusRoot).catch(() => layout.corpusRoot)
    const corpusRoots = [...new Set([layout.corpusRoot, real])]

    setPhase('seed')
    const probes = pickSeedProbes(plan)
    deps.log(
      `seed: waiting for ${probes.length} probe searches to find the seed corpus (up to ${settings.seedTimeoutSec} s)`
    )
    const seed = await waitForSeed(probes, {
      driver: app.driver,
      clock,
      corpusRoots,
      signal: abort.stop,
      timeoutMs: settings.seedTimeoutSec * 1000,
      searchTimeoutMs: settings.searchTimeoutMs,
      pollMs: tuning.seedPollMs,
      appGraceMs: tuning.seedAppGraceMs,
      mark: (label) => monitor.mark(label),
      log: deps.log
    })
    Object.assign(live.switches, {
      seedReady: seed.ready,
      seedWaitMs: seed.elapsedMs,
      seedRounds: seed.rounds,
      seedFilesFound: seed.files.found,
      seedFilesProbed: seed.files.total,
      seedAppsFound: seed.apps.found,
      seedAppsProbed: seed.apps.total
    })
    if (!seed.ready) {
      const lost = seed.pending.slice(0, 5).join(', ')
      abort.request(
        new RunAbort(
          'seed-timeout',
          `the seed corpus was not findable after ${Math.round(seed.elapsedMs / 1000)} s (${seed.files.found}/${seed.files.total} files, ${seed.apps.found}/${seed.apps.total} apps); still missing: ${lost}${seed.lastError ? `; last error: ${seed.lastError}` : ''}`
        ),
        'immediate'
      )
      return
    }
    deps.log(
      `seed: findable after ${Math.round(seed.elapsedMs / 1000)} s (${seed.files.found}/${seed.files.total} files, ${seed.apps.found}/${seed.apps.total} apps)`
    )

    const idle = await waitForIndexIdle(app.control, {
      clock,
      signal: abort.stop,
      capMs: tuning.idleCapMs,
      pollMs: Math.min(2_000, tuning.seedPollMs),
      mark: (label) => monitor.mark(label)
    })
    Object.assign(live.switches, {
      seedIdle: idle.idle,
      seedIdleWaitMs: idle.waitedMs,
      indexedFiles: idle.totalFiles
    })
    if (!idle.idle)
      deps.log(`seed: the file index did not go quiet (${idle.note ?? 'unknown'}); going on`)

    const fs = await createFsExecutor({
      root: layout.corpusRoot,
      materialize: deps.plan.materializePayload,
      clock
    })
    const checkEnv: CheckEnv = {
      driver: app.driver,
      clock,
      limiter,
      health,
      corpusRoots,
      searchTimeoutMs: settings.searchTimeoutMs,
      ...(tuning.poll ? { policy: tuning.poll } : {}),
      signal: abort.hard
    }
    const scenarioContext: ScenarioRunContext = {
      clock,
      fs,
      checkEnv,
      store,
      phase: () => phase.name
    }

    for (const stage of stages) {
      if (abort.stop.aborted) return
      if (stage.items.length === 0) continue
      setPhase(stage.name)
      pacer.setBase(stage.concurrency)
      monitor.mark(
        `${stage.name}:start (${stage.items.length} scenarios, concurrency ${stage.concurrency})`
      )
      deps.log(
        `${stage.name}: ${stage.items.length} scenarios, up to ${stage.concurrency} at a time`
      )
      await runPhase(stage.items, {
        clock,
        pacer,
        signal: abort.stop,
        states,
        tickMs: tuning.schedulerTickMs,
        execute: async (scenario) => {
          inflight.count += 1
          try {
            return await runScenario(scenarioContext, scenario)
          } finally {
            inflight.count -= 1
          }
        },
        block: (scenario, reason) => skipScenario(store, scenario, stage.name, reason),
        fail: (error) => abort.request(asAbort(error), 'immediate'),
        onSettled: () => {
          const settled = progress.scenarioSettled()
          if (settled % tuning.batchMark === 0) monitor.mark(`scenario-batch:${settled}`)
        }
      })
    }
    if (abort.stop.aborted) return

    setPhase('drain')
    const drained = await waitForIndexIdle(app.control, {
      clock,
      signal: abort.stop,
      capMs: tuning.drainCapMs,
      pollMs: Math.min(2_000, tuning.seedPollMs),
      mark: (label) => monitor.mark(label)
    })
    Object.assign(live.switches, {
      drainIdle: drained.idle,
      drainIdleWaitMs: drained.waitedMs,
      indexedFilesAfter: drained.totalFiles
    })
  } finally {
    background.abort()
    await Promise.allSettled(loops)
    Object.assign(live.switches, pacingSwitches(pacer.stats()), {
      searches: limiter.issued,
      searchAttempts: health.attempts,
      searchErrors: health.errors
    })
  }
}
