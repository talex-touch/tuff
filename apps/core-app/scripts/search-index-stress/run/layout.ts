import path from 'node:path'

/** Under /private/tmp so the scratch data never lands in the repository or the boss's home. */
export const STRESS_ROOT = '/private/tmp/tuff-stress'
/** Outside /tmp, /private and ~/Workspace: the file traversal policy excludes those silently. */
export const DEFAULT_CORPUS_BASE = '/Users/Shared/tuff-stress'

/** Written into every corpus the runner creates; cleanup refuses to delete a directory without it. */
export const CORPUS_MARKER = '.tuff-stress-corpus'

export interface RunLayout {
  runId: string
  runDir: string
  evidenceDir: string
  profileDir: string
  /** Where the app writes its log4js files; inside the profile. */
  logsDir: string
  corpusRoot: string
  /** The directory removed on cleanup when the corpus root is one the runner created itself. */
  corpusOwnedDir: string | null
  planFile: string
  resultsFile: string
  metaFile: string
  monitorSummaryFile: string
  dbFile: string
  appLogFile: string
  reportMarkdown: string
  reportJson: string
}

export function newRunId(now: Date = new Date(), randomHex = ''): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')
  return randomHex ? `${stamp}-${randomHex}` : stamp
}

export function isValidRunId(value: string): boolean {
  return /^[0-9A-Za-z][0-9A-Za-z._-]{2,79}$/.test(value) && !value.includes('..')
}

export function buildLayout(options: {
  runId: string
  runDir?: string
  corpusRoot?: string
  corpusBase?: string
}): RunLayout {
  if (!isValidRunId(options.runId)) throw new Error(`invalid run id: ${options.runId}`)
  const runDir = path.resolve(options.runDir ?? path.join(STRESS_ROOT, options.runId))
  const profileDir = path.join(runDir, 'profile')
  const evidenceDir = path.join(runDir, 'evidence')
  const ownedDir = options.corpusRoot
    ? null
    : path.join(options.corpusBase ?? DEFAULT_CORPUS_BASE, options.runId)
  const corpusRoot = path.resolve(options.corpusRoot ?? path.join(ownedDir as string, 'corpus'))
  return {
    runId: options.runId,
    runDir,
    evidenceDir,
    profileDir,
    logsDir: path.join(profileDir, 'tuff-dev', 'logs'),
    corpusRoot,
    corpusOwnedDir: ownedDir,
    planFile: path.join(runDir, 'plan.json'),
    resultsFile: path.join(runDir, 'results.ndjson'),
    metaFile: path.join(runDir, 'meta.json'),
    monitorSummaryFile: path.join(runDir, 'monitor-summary.json'),
    dbFile: path.join(runDir, 'db-integrity.json'),
    appLogFile: path.join(evidenceDir, 'app-stdout.log'),
    reportMarkdown: path.join(runDir, 'report.md'),
    reportJson: path.join(runDir, 'report.json')
  }
}

/** A `--resume` argument is either a run id under STRESS_ROOT or a path to a run directory. */
export function resolveResumeTarget(value: string): { runId: string; runDir: string } {
  if (value.includes('/')) {
    const runDir = path.resolve(value)
    return { runId: path.basename(runDir), runDir }
  }
  return { runId: value, runDir: path.join(STRESS_ROOT, value) }
}

export interface SegmentPaths {
  index: number
  profileDir: string
  logsDir: string
  evidenceDir: string
  appLogFile: string
  monitorSummaryFile: string
}

/** One app start of a run. After an unclean stop a resumed run starts a new segment on a fresh profile. */
export function segmentPaths(layout: RunLayout, index: number): SegmentPaths {
  if (index <= 1) {
    return {
      index: 1,
      profileDir: layout.profileDir,
      logsDir: layout.logsDir,
      evidenceDir: layout.evidenceDir,
      appLogFile: layout.appLogFile,
      monitorSummaryFile: layout.monitorSummaryFile
    }
  }
  const profileDir = path.join(layout.runDir, `profile-${index}`)
  const evidenceDir = path.join(layout.runDir, `evidence-${index}`)
  return {
    index,
    profileDir,
    logsDir: path.join(profileDir, 'tuff-dev', 'logs'),
    evidenceDir,
    appLogFile: path.join(evidenceDir, 'app-stdout.log'),
    monitorSummaryFile: path.join(layout.runDir, `monitor-summary-${index}.json`)
  }
}
