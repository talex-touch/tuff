import type { GateResult, StressMonitor, Thresholds } from '../eval-types'
import type { ScenarioPlan } from '../types'
import type { RunLayout } from './layout'
import type { ProfileSpec } from './profiles'
import type { ResumePlan } from './resume'
import type { RunnableApp } from './runner-deps'
import type { StoredMeta } from './run-meta'

/** What the run actually uses: the command line on a fresh run, the stored values on a resumed one. */
export interface RunSettings {
  embedding: 'on' | 'off'
  ui: 'hidden' | 'show'
  qps: number
  nice: number
  steadyConcurrency: number
  burstConcurrency: number
  searchTimeoutMs: number
  seedTimeoutSec: number
  thresholds?: Partial<Thresholds>
  keep: boolean
}

export interface PreparedRun {
  layout: RunLayout
  plan: ScenarioPlan
  stored: StoredMeta
  spec: ProfileSpec
  settings: RunSettings
  /** Set when an earlier segment of this run left results behind. */
  resume: ResumePlan | null
  /** Frees the run lock; the runner calls it last. */
  release: () => Promise<void>
}

export type RunStatus = 'pass' | 'fail' | 'aborted' | 'refused' | 'error'

export interface RunOutcome {
  /** 0 pass, 1 fail or aborted, 2 refused, 3 internal error. */
  exitCode: 0 | 1 | 2 | 3
  status: RunStatus
  runId: string
  runDir: string
  abortReason: string | null
  abortDetail: string | null
  /** The report's verdict; null when no report could be built. */
  verdict: 'pass' | 'fail' | null
  gates: GateResult[]
  reportFiles: { jsonFile: string; markdownFile: string } | null
  counts: { planned: number; withResults: number; notRun: number }
  /** Things that are wrong besides the verdict: an app that would not quit, a failed cleanup. */
  problems: string[]
  kept: string[]
  removed: string[]
  error?: string
}

/** What the segment has in hand while it runs; the finalizer works from it whatever way the segment ended. */
export interface LiveRun {
  app: RunnableApp | null
  monitor: StressMonitor | null
  /** Figures the phases measured; they end up in the report's switches. */
  switches: Record<string, string | number | boolean>
  /** The first error that was not a deliberate abort. */
  failure: { error: unknown } | null
  refusal: { message: string } | null
}
