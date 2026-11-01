import type { GateResult, ReportInputs, ReportLimits } from '../eval-types'
import type { ScenarioClass } from '../types'
import type { ClassReport } from './classes'
import { reproductionCommand } from './command'
import type { ClassComparison, Slowest } from './compare'
import type { Failures } from './failures'
import type { FoundRow } from './found'
import { finiteOrNull, iso } from './format'
import type { DatabaseSection, MonitorSection } from './monitor-section'
import type { AnswerStats, IndexingStats } from './speed'

export const REPORT_SCHEMA_VERSION = 1
export const NOT_RUN_IDS_SHOWN = 20

/** `null` marks a percentile that was not reached within the check's deadline. */
export type IndexingJson = Omit<IndexingStats, 'censored'> & {
  censored: { p50: number | null; p95: number | null; p99: number | null }
}

export interface ReportJson {
  schemaVersion: typeof REPORT_SCHEMA_VERSION
  verdict: 'pass' | 'fail'
  /** Gates that are not `pass`, most severe first. */
  attention: Array<{ id: string; status: GateResult['status']; title: string }>
  gates: GateResult[]
  run: {
    id: string
    profile: string
    seed: number
    scenarioCount: number
    startedAt: number
    endedAt: number
    startedAtIso: string
    endedAtIso: string
    durationMs: number
    host: ReportInputs['meta']['host']
    appVersion?: string
    gitSha?: string
    argv: string[]
    switches: ReportInputs['meta']['switches']
    command: string
  }
  limits: ReportLimits
  coverage: {
    planned: Partial<Record<ScenarioClass, number>>
    notRun: { total: number; ids: string[] }
    duplicates: number
    withoutDims: number
  }
  classes: ClassReport[]
  found: FoundRow[]
  indexing: IndexingJson
  answers: AnswerStats
  comparison: ClassComparison[]
  slowest: Slowest
  failures: Failures
  monitor: MonitorSection
  database: DatabaseSection
}

const ATTENTION_ORDER: Record<GateResult['status'], number> = {
  fail: 0,
  unknown: 1,
  warn: 2,
  pass: 3
}

export interface Parts {
  inputs: ReportInputs
  limits: ReportLimits
  verdict: 'pass' | 'fail'
  gates: GateResult[]
  duplicates: number
  withoutDims: number
  classes: ClassReport[]
  found: FoundRow[]
  indexing: IndexingStats
  answers: AnswerStats
  comparison: ClassComparison[]
  slowest: ReportJson['slowest']
  failures: Failures
  monitor: MonitorSection
  database: DatabaseSection
}

export function assemble(parts: Parts): ReportJson {
  const { meta } = parts.inputs
  const censored = parts.indexing.censored
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    verdict: parts.verdict,
    attention: parts.gates
      .filter((entry) => entry.status !== 'pass')
      .sort((a, b) => ATTENTION_ORDER[a.status] - ATTENTION_ORDER[b.status])
      .map(({ id, status, title }) => ({ id, status, title })),
    gates: parts.gates,
    run: {
      id: meta.runId,
      profile: meta.profile,
      seed: meta.seed,
      scenarioCount: meta.scenarioCount,
      startedAt: meta.startedAt,
      endedAt: meta.endedAt,
      startedAtIso: iso(meta.startedAt),
      endedAtIso: iso(meta.endedAt),
      durationMs: Math.max(0, meta.endedAt - meta.startedAt),
      host: meta.host,
      ...(meta.appVersion ? { appVersion: meta.appVersion } : {}),
      ...(meta.gitSha ? { gitSha: meta.gitSha } : {}),
      argv: meta.argv,
      switches: meta.switches,
      command: reproductionCommand(meta)
    },
    limits: parts.limits,
    coverage: {
      planned: parts.inputs.planned,
      notRun: {
        total: parts.inputs.notRun.length,
        ids: parts.inputs.notRun.slice(0, NOT_RUN_IDS_SHOWN)
      },
      duplicates: parts.duplicates,
      withoutDims: parts.withoutDims
    },
    classes: parts.classes,
    found: parts.found,
    indexing: {
      ...parts.indexing,
      censored: {
        p50: finiteOrNull(censored.p50),
        p95: finiteOrNull(censored.p95),
        p99: finiteOrNull(censored.p99)
      }
    },
    answers: parts.answers,
    comparison: parts.comparison,
    slowest: parts.slowest,
    failures: parts.failures,
    monitor: parts.monitor,
    database: parts.database
  }
}
