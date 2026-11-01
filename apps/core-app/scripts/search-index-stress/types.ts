/**
 * Contract between the scenario generator (`gen/`) and the runner (`run/`).
 *
 * A scenario is plain data: filesystem steps to perform, then search checks to evaluate. The
 * generator decides WHAT the situation is; the runner decides HOW to drive the app, how many
 * scenarios are in flight at once, and how to monitor the app while it does.
 *
 * All `path` fields are POSIX paths relative to the corpus root (no leading slash, no `..`).
 * Existing fields may be extended with optional ones; do not change or remove them.
 */

export type ScenarioClass =
  | 'search-app' // find an installed app by a name variant
  | 'search-file' // find a seeded non-image file by a name variant
  | 'search-image' // find a seeded image by a name variant
  | 'create-image' // add an image through some write mode, wait until it is searchable
  | 'change-image' // rename / overwrite / delete an image and check old and new names
  | 'ignore-image' // images that must NOT be indexed (hidden, excluded directory, symlink, ...)
  | 'search-created' // find an image that an earlier create-image scenario made (see `requires`)

export type PayloadKind =
  | 'png'
  | 'jpg'
  | 'gif'
  | 'bmp'
  | 'webp'
  | 'tiff'
  | 'heic'
  | 'svg'
  | 'fake-image' // image extension, undecodable bytes
  | 'text'
  | 'binary'

/** Deterministic file content: `materializePayload(spec)` must return identical bytes for identical specs. */
export interface PayloadSpec {
  kind: PayloadKind
  bytes: number
  seed: number
  /** Pixel size for decodable image kinds; ignored otherwise. */
  width?: number
  height?: number
  /** Lowercase extension without dot; lets `text`/`binary` payloads carry content a parser for that type accepts. */
  ext?: string
}

export type FsStep =
  | { op: 'mkdir'; path: string }
  /** `chunks > 1` writes the payload in pieces with `chunkDelayMs` between them (a slow writer). */
  | { op: 'write'; path: string; payload: PayloadSpec; chunks?: number; chunkDelayMs?: number }
  /** Write to a temp name in the same directory, then rename onto `path`. */
  | { op: 'write-atomic'; path: string; payload: PayloadSpec }
  | { op: 'copy'; from: string; to: string }
  | { op: 'move'; from: string; to: string }
  | { op: 'delete'; path: string; recursive?: boolean }
  | { op: 'symlink'; path: string; target: string }
  | { op: 'touch'; path: string }
  | { op: 'sleep'; ms: number }
  /** Start every step in the same tick; resolves when all are done. */
  | { op: 'parallel'; steps: FsStep[] }

export interface SearchTarget {
  kind: 'app' | 'file'
  /** Display name as the user would see it (apps) or the file name incl. extension (files). */
  name: string
  /** Files only: location relative to the corpus root. Used to tell same-named files apart. */
  path?: string
}

export interface SearchCheck {
  /** Exactly what is typed into CoreBox. */
  query: string
  target: SearchTarget
  expect: 'present' | 'absent'
  /** present: target must be within this many results. absent: target must not appear at all. */
  topK: number
  /** `hard` misses fail the run's correctness gate; `soft` misses are reported per class only. */
  tier: 'hard' | 'soft'
  /**
   * present: poll until seen or this many ms after the check started.
   * absent: first confirm absence, then confirm again after this many ms (no late indexing).
   */
  deadlineMs: number
  /** Delay after the last step finished before the first evaluation (default 0). */
  startAfterMs?: number
}

export interface Scenario {
  /** `${class}-${12 hex}` of the canonical JSON of {class, dims, steps, checks}. Unique per plan. */
  id: string
  /** Position in the plan's run order. */
  index: number
  class: ScenarioClass
  /**
   * The attribute tuple that makes this situation different from the others (format, name style,
   * placement, write mode, query transform, ...). Used for coverage accounting and report grouping.
   */
  dims: Record<string, string | number | boolean>
  steps: FsStep[]
  checks: SearchCheck[]
  /** Scenario ids whose steps must have completed before this one starts. */
  requires?: string[]
}

export interface CorpusFile {
  path: string
  payload: PayloadSpec
  /** Content the indexer can read for text files (for content search); optional. */
  text?: string
}

export interface CorpusManifest {
  /** Directories to create (relative), parents before children. */
  directories: string[]
  files: CorpusFile[]
}

export interface GenerateOptions {
  seed: number
  count: number
  /** Display names of installed apps to build search-app scenarios from. */
  apps: string[]
  /** Class weights; missing classes use the generator's defaults. Normalised internally. */
  mix?: Partial<Record<ScenarioClass, number>>
}

export interface ScenarioPlan {
  seed: number
  count: number
  options: GenerateOptions
  corpus: CorpusManifest
  scenarios: Scenario[]
}

// ---------------------------------------------------------------------------------------------
// What the runner records per check. The report aggregates these; the generator never reads them.
// ---------------------------------------------------------------------------------------------

export interface CheckResult {
  scenarioId: string
  checkIndex: number
  class: ScenarioClass
  tier: 'hard' | 'soft'
  outcome: 'pass' | 'fail' | 'error' | 'skipped'
  /** ms from check start to the observation that satisfied it (present) or confirmed absence. */
  latencyMs: number | null
  /** ms from the last fs step finishing to the same observation. */
  sinceStepsMs: number | null
  polls: number
  /** 1-based rank of the target in the answer that satisfied the check. */
  rank: number | null
  resultCount: number | null
  /** ms from typing to the search stream's end signal for the answer that satisfied the check. */
  answerMs: number | null
  detail?: string
  /** Longest wait between two consecutive answers of this check: how coarse `latencyMs` is. */
  maxPollGapMs?: number
  /** The check's `expect`; lets the report tell a missed present check from a late absent one. */
  expect?: 'present' | 'absent'
  /** Monitor phase (`seed`, `steady`, `burst`) the check finished in; the report judges search latency on `steady`. */
  phase?: string
}
