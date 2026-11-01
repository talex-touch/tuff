import type { AppHandles, Thresholds } from '../../eval-types'
import type { BlindTracker } from '../blind'
import type { Episodes } from '../episodes'
import type { PhaseBook } from '../phases'

export interface ProbeContext {
  handles: AppHandles
  thresholds: Thresholds
  intervalMs: number
  now: () => number
  log: (line: string) => void
  episodes: Episodes
  blind: BlindTracker
  phases: PhaseBook
  /** One NDJSON line; the monitor adds time and phase. */
  timeline: (kind: 'tick' | 'event', record: Record<string, unknown>) => void
  /** A caveat for the report's monitor section; repeated text is stored once. */
  note: (text: string) => void
}
