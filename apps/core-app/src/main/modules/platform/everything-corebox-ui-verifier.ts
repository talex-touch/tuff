import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { EverythingBackendType } from '../../../shared/events/everything'

export const EVERYTHING_COREBOX_UI_EVIDENCE_KIND = 'everything-corebox-ui-evidence'
export const EVERYTHING_COREBOX_UI_EVIDENCE_SCHEMA_VERSION = 1

export type EverythingCoreBoxSearchModeId = 'normal' | 'explicit-file' | 'structured-filter'

export const EVERYTHING_COREBOX_SEARCH_MODES: readonly EverythingCoreBoxSearchModeId[] = [
  'normal',
  'explicit-file',
  'structured-filter'
]

/**
 * The modes the real `SearchQueryOrchestrator` hands to the Everything provider once it is ready.
 *
 * A bare `<marker>` query and the `@file <marker>` category filter both reach Everything because
 * neither carries a structural filter (`fileProvider.hasSearchFilters()` is false). The
 * `structured-filter` mode is `ext:txt <stem>`: the `ext:` token is claimed by the local file
 * index, so the orchestrator routes it to `file-provider` and it must never be recorded or judged
 * as an Everything row. See `search-query-orchestrator.ts:routeWindowsFileProviders`.
 */
export const EVERYTHING_COREBOX_EVERYTHING_SOURCED_MODES: readonly EverythingCoreBoxSearchModeId[] = [
  'normal',
  'explicit-file'
]

/**
 * Which provider actually answered one mode. Resolved from the real session `sources` the main
 * process reports, never inferred from the global Everything status.
 */
export const EVERYTHING_COREBOX_RESULT_SOURCES = ['everything-provider', 'file-provider', 'none'] as const
export type EverythingCoreBoxResultSource = (typeof EVERYTHING_COREBOX_RESULT_SOURCES)[number]

/** Provider ids that own file results, so a non-file provider with rows is not mistaken for one. */
export const EVERYTHING_COREBOX_FILE_PROVIDER_IDS: readonly string[] = [
  'file-provider',
  'file-index',
  'macos-spotlight-provider',
  'linux-native-file-provider',
  'windows-shell-file-provider'
]

export interface EverythingCoreBoxProviderSource {
  providerId: string
  resultCount: number
}

/**
 * Attribute one mode's rendered rows to the provider that produced them.
 *
 * Everything wins when it is the file provider that reported rows; any other file provider is
 * recorded as `file-provider`; a mode whose rows came from nobody (or from a non-file provider) is
 * `none`, which the gate treats as an inconsistency rather than a silent pass.
 */
export function resolveCoreBoxResultSource(
  sources: readonly EverythingCoreBoxProviderSource[]
): EverythingCoreBoxResultSource {
  if (!Array.isArray(sources)) return 'none'
  const withRows = sources.filter(
    (entry) =>
      entry &&
      typeof entry.providerId === 'string' &&
      Number.isFinite(entry.resultCount) &&
      entry.resultCount > 0
  )
  if (withRows.some((entry) => entry.providerId === 'everything-provider')) {
    return 'everything-provider'
  }
  if (
    withRows.some(
      (entry) =>
        EVERYTHING_COREBOX_FILE_PROVIDER_IDS.includes(entry.providerId) ||
        entry.providerId.includes('file')
    )
  ) {
    return 'file-provider'
  }
  return 'none'
}

/**
 * Per-mode packaged CoreBox observation.
 *
 * `query` is the query text the probe typed into the real `#core-box-input`, and it is deliberately
 * a constant the probe owns (`tuff-everything-ci-marker.txt`, `@file <marker>`, `ext:txt <marker>`),
 * never user text: the Windows gate has to be reproducible and this artifact is uploaded.
 *
 * `rowCount`/`markerMatchCount` count only real file result rows. A degraded/unavailable notice row
 * (`.BoxItem--notice`, `kind: 'notification'`) is not a file result and is reported separately as
 * `noticeVisible`, so its presence never turns a zero-row degraded run into a failing one.
 */
export interface EverythingCoreBoxModeEvidence {
  mode: EverythingCoreBoxSearchModeId
  query: string
  attempted: boolean
  /** Which provider answered this mode, resolved from the real session `sources`. */
  resultSource: EverythingCoreBoxResultSource
  /** Visible file result rows (`.BoxItem` that is not `.BoxItem--notice`). */
  rowCount: number
  markerMatchCount: number
  emptyResult: boolean
  /** A degraded/unavailable notice row was rendered in the CoreBox for this mode. */
  noticeVisible: boolean
  durationMs: number
  screenshot: string | null
  domSnapshot: string | null
}

export interface EverythingCoreBoxUiEvidencePayload {
  schemaVersion: typeof EVERYTHING_COREBOX_UI_EVIDENCE_SCHEMA_VERSION
  kind: typeof EVERYTHING_COREBOX_UI_EVIDENCE_KIND
  createdAt: string
  runtime: {
    /** Renderer came from the packaged app bundle, not a dev server. */
    packaged: boolean
    /** `packaged-app` launches the bundle; `attached-app` attaches to a running packaged app. */
    mode: 'packaged-app' | 'attached-app'
    platform: string
    /**
     * Version of the workspace package the launched bundle was built from. `null` when attaching to
     * an app the probe did not build, so the record never claims a version it did not observe.
     */
    appVersion: string | null
    profileIsolated: boolean
  }
  backend: {
    expected: EverythingBackendType
    observed: EverythingBackendType
    available: boolean
    health: string
    version: string | null
    errorCode: string | null
    fallbackChain: EverythingBackendType[]
    statusChannelAvailable: boolean
  }
  window: {
    coreBoxVisible: boolean
    visibilityState: string
    resultSurfaceVisible: boolean
    screenshotCount: number
  }
  emptyState: {
    query: string
    observed: boolean
    rowCount: number
    reason: string | null
  }
  degradedState: {
    /** The packaged runtime reported an unavailable Everything backend during collection. */
    observed: boolean
    /**
     * No mode is attributed to Everything, so nothing was fabricated for a dead backend. Modes
     * answered by the local file index are excluded: they are a legitimate fallback with their own
     * rows, not an Everything row, and their presence must never fail a degraded run.
     */
    zeroResultRows: boolean
    /** `#core-box-input` stayed mounted and the results surface stayed answerable. */
    coreBoxInteractive: boolean
    backend: EverythingBackendType
    /** Concrete reason the packaged runtime surfaced (`healthReason`/`error`/`errorCode`). */
    backendReason: string | null
    /** A degraded notice row (`.BoxItem--notice`) was observed in the real DOM. */
    noticeVisible: boolean
  }
  redaction: {
    queryIncluded: boolean
    resultPathsIncluded: boolean
    resultTitlesIncluded: boolean
    userHomeIncluded: boolean
  }
  modes: EverythingCoreBoxModeEvidence[]
  artifacts: {
    screenshots: string[]
    domSnapshots: string[]
  }
}

export interface EverythingCoreBoxUiGateOptions {
  requirePackaged?: boolean
  requirePlatform?: string
  requireModes?: EverythingCoreBoxSearchModeId[]
  requireBackend?: EverythingBackendType[]
  requireAvailable?: boolean
  requireDegraded?: boolean
  requireEmptyState?: boolean
  requireResultRows?: boolean
  requireMarkerMatches?: boolean
  requireScreenshots?: boolean
  maxModeDurationMs?: number
}

export interface EverythingCoreBoxUiGate {
  passed: boolean
  failures: string[]
  warnings: string[]
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * The recorded query must stay a probe-owned label. A separator, a drive letter, or a home
 * directory in this field would mean real user text or a real path leaked into an uploaded
 * artifact, which is the one thing the Everything evidence contract forbids.
 */
export function isRedactedCoreBoxQuery(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false
  if (/[\\/]/.test(value)) return false
  if (/^[a-zA-Z]:/.test(value)) return false
  if (value.includes('~')) return false
  return true
}

export function isRedactedArtifactPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false
  if (value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return false
  if (value.includes('\\')) return false
  if (value.includes('..')) return false
  return true
}

export function evaluateEverythingCoreBoxUiEvidence(
  evidence: EverythingCoreBoxUiEvidencePayload,
  options: EverythingCoreBoxUiGateOptions = {}
): EverythingCoreBoxUiGate {
  const failures: string[] = []
  const warnings: string[] = []

  if (
    evidence?.schemaVersion !== EVERYTHING_COREBOX_UI_EVIDENCE_SCHEMA_VERSION ||
    evidence?.kind !== EVERYTHING_COREBOX_UI_EVIDENCE_KIND
  ) {
    return {
      passed: false,
      failures: ['unsupported Everything CoreBox UI evidence schema'],
      warnings
    }
  }

  const runtime = evidence.runtime
  const backend = evidence.backend
  const redaction = evidence.redaction

  if (options.requirePackaged !== false && runtime.packaged !== true) {
    failures.push('Everything CoreBox UI evidence was not collected from a packaged app')
  }
  if (runtime.mode !== 'packaged-app' && runtime.mode !== 'attached-app') {
    failures.push('Everything CoreBox UI evidence runtime mode is unknown')
  }
  if (runtime.profileIsolated !== true) {
    warnings.push('Everything CoreBox UI evidence was collected without an isolated profile')
  }
  if (options.requirePlatform && runtime.platform !== options.requirePlatform) {
    failures.push(
      `Everything CoreBox UI evidence platform ${runtime.platform} is not ${options.requirePlatform}`
    )
  }

  if (!redaction || typeof redaction !== 'object') {
    failures.push('Everything CoreBox UI evidence redaction block is missing')
  } else {
    const leaked = (
      [
        ['queryIncluded', 'query text'],
        ['resultPathsIncluded', 'result paths'],
        ['resultTitlesIncluded', 'result titles'],
        ['userHomeIncluded', 'user home paths']
      ] as const
    ).filter(([key]) => redaction[key] !== false)
    for (const [, label] of leaked) {
      failures.push(`Everything CoreBox UI evidence includes ${label}`)
    }
  }

  if (backend.expected !== backend.observed) {
    failures.push(
      `Everything CoreBox UI evidence backend ${backend.observed} does not match expected ${backend.expected}`
    )
  }
  if (backend.available !== (backend.observed !== 'unavailable')) {
    failures.push('Everything CoreBox UI evidence availability contradicts the observed backend')
  }
  if (backend.available && backend.errorCode) {
    failures.push('Everything CoreBox UI evidence reports an error code for an available backend')
  }
  if (backend.available && !backend.fallbackChain.includes(backend.observed)) {
    failures.push(
      'Everything CoreBox UI evidence active backend is missing from the fallback chain'
    )
  }
  if (options.requireBackend && !options.requireBackend.includes(backend.observed)) {
    failures.push(
      `Everything CoreBox UI evidence backend ${backend.observed} is not one of ${options.requireBackend.join(', ')}`
    )
  }
  if (options.requireAvailable === true && backend.available !== true) {
    failures.push('Everything CoreBox UI evidence expected an available backend')
  }
  if (options.requireDegraded === true) {
    if (backend.available) {
      failures.push('Everything CoreBox UI evidence expected a degraded backend')
    }
    if (evidence.degradedState?.observed !== true) {
      failures.push('Everything CoreBox UI evidence did not observe a degraded state')
    }
    if (evidence.degradedState?.coreBoxInteractive !== true) {
      failures.push('Everything CoreBox UI evidence degraded state left CoreBox unresponsive')
    }
    if (evidence.degradedState?.zeroResultRows !== true) {
      failures.push('Everything CoreBox UI evidence degraded state fabricated result rows')
    }
  }

  const modes = Array.isArray(evidence.modes) ? evidence.modes : []
  if (modes.length === 0) {
    failures.push('Everything CoreBox UI evidence has no search modes')
  }

  const screenshots = Array.isArray(evidence.artifacts?.screenshots)
    ? evidence.artifacts.screenshots
    : []
  const domSnapshots = Array.isArray(evidence.artifacts?.domSnapshots)
    ? evidence.artifacts.domSnapshots
    : []

  for (const artifact of [...screenshots, ...domSnapshots]) {
    if (!isRedactedArtifactPath(artifact)) {
      failures.push(`Everything CoreBox UI evidence artifact path is not redacted: ${artifact}`)
    }
  }

  const seenModes = new Set<string>()
  for (const entry of modes) {
    if (!EVERYTHING_COREBOX_SEARCH_MODES.includes(entry.mode)) {
      failures.push('Everything CoreBox UI evidence has an unknown search mode')
      continue
    }
    if (seenModes.has(entry.mode)) {
      failures.push(`Everything CoreBox UI evidence repeats the ${entry.mode} search mode`)
    }
    seenModes.add(entry.mode)

    if (!isRedactedCoreBoxQuery(entry.query)) {
      failures.push(`Everything CoreBox UI evidence ${entry.mode} query is not a redacted label`)
    }
    if (!EVERYTHING_COREBOX_RESULT_SOURCES.includes(entry.resultSource)) {
      failures.push(`Everything CoreBox UI evidence ${entry.mode} result source is unknown`)
    }
    if (typeof entry.noticeVisible !== 'boolean') {
      failures.push(`Everything CoreBox UI evidence ${entry.mode} notice flag is missing`)
    }
    if (entry.attempted !== true) {
      failures.push(`Everything CoreBox UI evidence ${entry.mode} search was not attempted`)
    }
    if (!isNonNegativeInteger(entry.rowCount)) {
      failures.push(`Everything CoreBox UI evidence ${entry.mode} row count is invalid`)
    }
    if (!isNonNegativeInteger(entry.markerMatchCount)) {
      failures.push(`Everything CoreBox UI evidence ${entry.mode} marker match count is invalid`)
    } else if (isNonNegativeInteger(entry.rowCount) && entry.markerMatchCount > entry.rowCount) {
      failures.push(
        `Everything CoreBox UI evidence ${entry.mode} marker matches exceed the rendered rows`
      )
    }
    if (!isNonNegativeFiniteNumber(entry.durationMs)) {
      failures.push(`Everything CoreBox UI evidence ${entry.mode} duration is invalid`)
    } else if (
      options.maxModeDurationMs !== undefined &&
      entry.durationMs > options.maxModeDurationMs
    ) {
      failures.push(
        `Everything CoreBox UI evidence ${entry.mode} took ${entry.durationMs}ms (max ${options.maxModeDurationMs}ms)`
      )
    }
    if (entry.emptyResult !== (entry.rowCount === 0)) {
      failures.push(
        `Everything CoreBox UI evidence ${entry.mode} empty flag contradicts the rendered rows`
      )
    }
    if (
      isNonNegativeInteger(entry.rowCount) &&
      entry.rowCount > 0 &&
      entry.resultSource === 'none'
    ) {
      failures.push(
        `Everything CoreBox UI evidence ${entry.mode} rendered rows without an attributed provider`
      )
    }
    if (
      entry.resultSource === 'everything-provider' &&
      backend.observed === 'unavailable' &&
      isNonNegativeInteger(entry.rowCount) &&
      entry.rowCount > 0
    ) {
      failures.push(
        `Everything CoreBox UI evidence ${entry.mode} claims Everything rows with an unavailable backend`
      )
    }
    if (entry.screenshot !== null && !isRedactedArtifactPath(entry.screenshot)) {
      failures.push(`Everything CoreBox UI evidence ${entry.mode} screenshot path is not redacted`)
    }
    if (entry.domSnapshot !== null && !isRedactedArtifactPath(entry.domSnapshot)) {
      failures.push(
        `Everything CoreBox UI evidence ${entry.mode} DOM snapshot path is not redacted`
      )
    }
    if (entry.screenshot && !screenshots.includes(entry.screenshot)) {
      failures.push(
        `Everything CoreBox UI evidence ${entry.mode} screenshot is missing from the artifact list`
      )
    }
    if (entry.domSnapshot && !domSnapshots.includes(entry.domSnapshot)) {
      failures.push(
        `Everything CoreBox UI evidence ${entry.mode} DOM snapshot is missing from the artifact list`
      )
    }
  }

  for (const requiredMode of options.requireModes ?? []) {
    const entry = modes.find((candidate) => candidate.mode === requiredMode)
    if (!entry) {
      failures.push(`Everything CoreBox UI evidence is missing the ${requiredMode} search mode`)
      continue
    }
    const everythingSourced = EVERYTHING_COREBOX_EVERYTHING_SOURCED_MODES.includes(requiredMode)
    if (options.requireResultRows === true && backend.available && entry.rowCount === 0) {
      failures.push(
        `Everything CoreBox UI evidence ${requiredMode} search rendered no packaged CoreBox rows`
      )
    }
    if (
      options.requireMarkerMatches === true &&
      backend.available &&
      entry.markerMatchCount === 0
    ) {
      failures.push(
        `Everything CoreBox UI evidence ${requiredMode} search did not render the marker result`
      )
    }
    if (
      options.requireMarkerMatches === true &&
      backend.available &&
      everythingSourced &&
      entry.resultSource !== 'everything-provider'
    ) {
      failures.push(
        `Everything CoreBox UI evidence ${requiredMode} search was not answered by Everything`
      )
    }
    if (options.requireScreenshots === true && !entry.screenshot) {
      failures.push(
        `Everything CoreBox UI evidence ${requiredMode} search has no packaged UI screenshot`
      )
    }
    if (
      options.requireResultRows === true &&
      !backend.available &&
      entry.resultSource === 'everything-provider' &&
      entry.rowCount > 0
    ) {
      failures.push(
        `Everything CoreBox UI evidence ${requiredMode} rendered rows with an unavailable backend`
      )
    }
  }

  if (options.requireEmptyState === true) {
    if (evidence.emptyState?.observed !== true) {
      failures.push('Everything CoreBox UI evidence did not observe an empty CoreBox state')
    }
    if (!isRedactedCoreBoxQuery(evidence.emptyState?.query)) {
      failures.push('Everything CoreBox UI evidence empty-state query is not a redacted label')
    }
    if (evidence.emptyState?.rowCount !== 0) {
      failures.push('Everything CoreBox UI evidence empty state rendered rows')
    }
  }

  if (options.requireScreenshots === true && evidence.window?.coreBoxVisible !== true) {
    failures.push('Everything CoreBox UI evidence was collected while CoreBox was hidden')
  }

  return { passed: failures.length === 0, failures, warnings }
}

export interface EverythingCoreBoxUiArtifactGateOptions {
  /** Directory the artifact names resolve against (the evidence file's own directory). */
  baseDir?: string
  /** Require at least one screenshot and validate every listed screenshot as a real PNG. */
  requireScreenshots?: boolean
}

export interface EverythingCoreBoxUiArtifactGate {
  passed: boolean
  failures: string[]
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

async function realpathOrSelf(target: string): Promise<string> {
  try {
    return await realpath(target)
  } catch {
    return path.resolve(target)
  }
}

/**
 * Resolve one artifact name strictly inside the evidence root.
 *
 * Both the lexical path and its canonical (symlink-resolved) form must stay under the root, so a
 * relative name that is really a symlink out of the evidence directory is rejected before any read.
 */
async function resolveArtifactWithin(baseDir: string, name: string): Promise<string> {
  const root = path.resolve(baseDir)
  const target = path.resolve(root, name)
  const relative = path.relative(root, target)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`is outside the evidence root ${root}`)
  }
  const [canonicalRoot, canonicalTarget] = await Promise.all([
    realpathOrSelf(root),
    realpathOrSelf(target)
  ])
  const canonicalRelative = path.relative(canonicalRoot, canonicalTarget)
  if (
    canonicalRelative === '' ||
    canonicalRelative.startsWith('..') ||
    path.isAbsolute(canonicalRelative)
  ) {
    throw new Error(`resolves to ${canonicalTarget}, outside the evidence root ${canonicalRoot}`)
  }
  return canonicalTarget
}

async function checkArtifact(
  baseDir: string,
  name: string,
  kind: 'screenshot' | 'dom-snapshot'
): Promise<string[]> {
  if (!isRedactedArtifactPath(name)) {
    return [`Everything CoreBox UI evidence ${kind} path is not redacted: ${name}`]
  }
  let target: string
  try {
    target = await resolveArtifactWithin(baseDir, name)
  } catch (error) {
    return [
      `Everything CoreBox UI evidence ${kind} ${name} ${error instanceof Error ? error.message : String(error)}`
    ]
  }

  let info: Awaited<ReturnType<typeof stat>>
  try {
    info = await stat(target)
  } catch {
    return [`Everything CoreBox UI evidence ${kind} is missing: ${name}`]
  }
  if (!info.isFile() || info.size === 0) {
    return [`Everything CoreBox UI evidence ${kind} is empty: ${name}`]
  }

  if (kind === 'screenshot') {
    let bytes: Buffer
    try {
      bytes = await readFile(target)
    } catch {
      return [`Everything CoreBox UI evidence screenshot could not be read: ${name}`]
    }
    if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
      return [`Everything CoreBox UI evidence screenshot is not a PNG: ${name}`]
    }
  }

  return []
}

/**
 * Filesystem half of the screenshot/DOM gate. Kept out of `evaluateEverythingCoreBoxUiEvidence`
 * so that pure function stays pure: a name in the artifact array is not evidence that a file
 * exists, is inside the evidence root, is non-empty and is a real PNG.
 */
export async function verifyEverythingCoreBoxUiArtifacts(
  evidence: EverythingCoreBoxUiEvidencePayload,
  options: EverythingCoreBoxUiArtifactGateOptions = {}
): Promise<EverythingCoreBoxUiArtifactGate> {
  const failures: string[] = []
  const baseDir = options.baseDir
  if (!baseDir) {
    if (options.requireScreenshots) {
      failures.push(
        'Everything CoreBox UI evidence artifact root is required to verify screenshots'
      )
    }
    return { passed: failures.length === 0, failures }
  }

  const screenshots = Array.isArray(evidence?.artifacts?.screenshots)
    ? evidence.artifacts.screenshots
    : []
  const domSnapshots = Array.isArray(evidence?.artifacts?.domSnapshots)
    ? evidence.artifacts.domSnapshots
    : []

  for (const name of screenshots) {
    failures.push(...(await checkArtifact(baseDir, name, 'screenshot')))
  }
  for (const name of domSnapshots) {
    failures.push(...(await checkArtifact(baseDir, name, 'dom-snapshot')))
  }

  const modes = Array.isArray(evidence?.modes) ? evidence.modes : []
  for (const entry of modes) {
    if (typeof entry?.screenshot === 'string' && !screenshots.includes(entry.screenshot)) {
      failures.push(
        `Everything CoreBox UI evidence ${entry.mode} screenshot ${entry.screenshot} is outside the screenshot artifact list`
      )
    }
    if (typeof entry?.domSnapshot === 'string' && !domSnapshots.includes(entry.domSnapshot)) {
      failures.push(
        `Everything CoreBox UI evidence ${entry.mode} DOM snapshot ${entry.domSnapshot} is outside the DOM snapshot artifact list`
      )
    }
  }

  if (options.requireScreenshots === true && screenshots.length === 0) {
    failures.push('Everything CoreBox UI evidence carries no screenshot artifacts')
  }

  return { passed: failures.length === 0, failures }
}
