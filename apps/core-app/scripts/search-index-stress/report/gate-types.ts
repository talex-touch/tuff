import type { GateResult, ReportInputs, ReportLimits } from '../eval-types'
import type { ClassReport } from './classes'
import type { Failures } from './failures'
import type { DatabaseSection, MonitorSection } from './monitor-section'
import type { Prepared } from './results'
import type { AnswerStats, IndexingStats } from './speed'

export type Status = GateResult['status']

export interface GateContext {
  inputs: ReportInputs
  limits: ReportLimits
  prepared: Prepared
  classes: ClassReport[]
  failures: Failures
  indexing: IndexingStats
  answers: AnswerStats
  monitor: MonitorSection
  database: DatabaseSection
}

export const gate = (id: string, title: string, status: Status, detail: string): GateResult => ({
  id,
  title,
  status,
  detail
})

/** The verdict fails on `fail` and on `unknown`: what was not proven did not pass. */
export const verdictOf = (gates: readonly GateResult[]): 'pass' | 'fail' =>
  gates.some((entry) => entry.status === 'fail' || entry.status === 'unknown') ? 'fail' : 'pass'
