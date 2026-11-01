import { readFile } from 'node:fs/promises'
import type { DbIntegrity, MonitorSummary, ReportInputs, RunMeta, Thresholds } from '../eval-types'
import type { CheckResult, ScenarioClass, ScenarioPlan } from '../types'
import { DEFAULT_THRESHOLDS } from './deps'
import type { RunLayout } from './layout'
import { segmentPaths } from './layout'
import type { LoadedResults } from './results-store'
import { loadResults } from './results-store'
import type { StoredMeta } from './run-meta'
import { lastSegment, readMeta, toRunMeta } from './run-meta'

export function countPlanned(plan: ScenarioPlan): Partial<Record<ScenarioClass, number>> {
  const counts: Partial<Record<ScenarioClass, number>> = {}
  for (const scenario of plan.scenarios) counts[scenario.class] = (counts[scenario.class] ?? 0) + 1
  return counts
}

export function dimsOf(plan: ScenarioPlan): ReportInputs['dims'] {
  return Object.fromEntries(plan.scenarios.map((scenario) => [scenario.id, scenario.dims]))
}

/** Scenarios that left no trace: neither a result nor a finished record. */
export function scenariosNotRun(
  plan: ScenarioPlan,
  loaded: Pick<LoadedResults, 'checks' | 'completed'>
): string[] {
  const withResults = new Set(loaded.checks.map((result) => result.scenarioId))
  return plan.scenarios
    .filter((scenario) => !loaded.completed.has(scenario.id) && !withResults.has(scenario.id))
    .map((scenario) => scenario.id)
}

/** What the report shows when the monitor produced nothing (the run died before `stop`, or the monitor itself failed). */
export function emptyMonitorSummary(
  at: number,
  thresholds: Partial<Thresholds> | undefined,
  note: string
): MonitorSummary {
  return {
    startedAt: at,
    endedAt: at,
    phases: [],
    breaches: [],
    blindMs: 0,
    samplesWritten: 0,
    timelineFile: '',
    dbRepairMarkers: [],
    thresholds: { ...DEFAULT_THRESHOLDS, ...thresholds },
    notes: [note]
  }
}

export interface ReportSources {
  meta: RunMeta
  plan: ScenarioPlan
  results: LoadedResults
  monitor: MonitorSummary
  db: DbIntegrity
}

export function buildReportInputs(sources: ReportSources): ReportInputs {
  const { plan, results } = sources
  return {
    meta: sources.meta,
    results: results.checks as CheckResult[],
    monitor: sources.monitor,
    db: sources.db,
    planned: countPlanned(plan),
    dims: dimsOf(plan),
    notRun: scenariosNotRun(plan, results)
  }
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

export interface LoadedRun {
  stored: StoredMeta
  inputs: ReportInputs
}

/** Everything `report <runDir>` needs, read from the files a run leaves behind; the monitor figures are those of the last app start. */
export async function loadRunForReport(
  layout: RunLayout,
  now: () => number = Date.now
): Promise<LoadedRun> {
  const stored = await readMeta(layout.metaFile)
  if (!stored) throw new Error(`${layout.metaFile} is missing or not a stress run's meta.json`)
  const plan = await readJson<ScenarioPlan>(layout.planFile)
  if (!plan) throw new Error(`${layout.planFile} is missing or unreadable`)
  const results = loadResults(layout.resultsFile)
  const monitorFile = segmentPaths(layout, lastSegment(stored)?.index ?? 1).monitorSummaryFile
  const monitor =
    (await readJson<MonitorSummary>(monitorFile)) ??
    emptyMonitorSummary(
      stored.startedAt,
      stored.options.thresholds,
      'no monitor summary was written: the run ended before the monitor stopped'
    )
  const db = (await readJson<DbIntegrity>(layout.dbFile)) ?? { checked: false, results: [] }
  const meta = toRunMeta(stored, plan.scenarios.length, stored.endedAt ?? now())
  return { stored, inputs: buildReportInputs({ meta, plan, results, monitor, db }) }
}
