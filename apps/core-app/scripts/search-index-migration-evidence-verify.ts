#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { isSearchIndexDatabaseIdentity } from './search-index-evidence-source'

export const SEARCH_INDEX_MIGRATION_EVIDENCE_VERIFICATION_SCHEMA =
  'search-index-migration-evidence-verification/v1'

type JsonRecord = Record<string, unknown>
type CheckStatus = 'passed' | 'failed' | 'not-provided'

export interface SearchIndexMigrationEvidenceRequirements {
  requireRealProfilePreflight?: boolean
  requireSourceScopedScanProgress?: boolean
  requireProductionReadiness?: boolean
  requireFtsSimulation?: boolean
  requireScanProgressSimulation?: boolean
  requireScanProgressPlan?: boolean
  requireDatabaseEvidenceCorrelation?: boolean
  requireNaturalSettingsEvidence?: boolean
  requireSettingsVisibleArtifacts?: boolean
}

export interface SearchIndexMigrationEvidenceInputs {
  preflight?: unknown
  productionReadiness?: unknown
  ftsSimulation?: unknown
  scanProgressSimulation?: unknown
  scanProgressPlan?: unknown
  settingsVerification?: unknown
  settingsProbe?: unknown
  settingsVisibleArtifacts?: SearchIndexMigrationSettingsVisibleArtifactEvidence
}

interface CliOptions extends SearchIndexMigrationEvidenceRequirements {
  preflight?: string
  productionReadiness?: string
  ftsSimulation?: string
  scanProgressSimulation?: string
  scanProgressPlan?: string
  settingsVerification?: string
  settingsProbe?: string
  output?: string
  pretty: boolean
}

export interface SearchIndexMigrationSettingsVisibleArtifactEvidence {
  settingsVerification: string | null
  probeVerification: string | null
  verificationPathMatchesProbe: boolean | null
  verificationMatchesProbeEnvelope: boolean | null
  settingsScreenshot: string | null
  detailScreenshot: string | null
  settingsDom: string | null
  detailDom: string | null
  settingsScreenshotExists: boolean | null
  settingsScreenshotNonEmpty: boolean | null
  settingsScreenshotPng: boolean | null
  detailScreenshotExists: boolean | null
  detailScreenshotNonEmpty: boolean | null
  detailScreenshotPng: boolean | null
  settingsDomExists: boolean | null
  settingsDomNonEmpty: boolean | null
  settingsDomHasSourceDiagnosticsGroup: boolean | null
  detailDomExists: boolean | null
  detailDomNonEmpty: boolean | null
  detailDomDialogVisible: boolean | null
  detailDomHasRecentTasks: boolean | null
}

export interface SearchIndexMigrationEvidenceVerificationCheck {
  id: string
  status: CheckStatus
  summary: string
  failures: string[]
  evidence?: Record<string, string | number | boolean | null>
}

export interface SearchIndexMigrationEvidenceVerificationResult {
  schema: typeof SEARCH_INDEX_MIGRATION_EVIDENCE_VERIFICATION_SCHEMA
  generatedAt: string
  destructiveActions: false
  requirements: Required<SearchIndexMigrationEvidenceRequirements>
  gate: {
    passed: boolean
    failures: string[]
  }
  checks: SearchIndexMigrationEvidenceVerificationCheck[]
  nextActions: string[]
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run search:index-migration:evidence-verify -- [options]

Options:
  --preflight <file>               search:index-migration:preflight JSON.
  --productionReadiness <file>     search:production-migration-readiness JSON.
  --ftsSimulation <file>           search:fts-ownership-simulate JSON.
  --scanProgressSimulation <file>  search:scan-progress-simulate JSON.
  --scanProgressPlan <file>        search:scan-progress-migration plan JSON.
  --settingsVerification <file>    settings:indexing-diagnostics:verify JSON.
  --settingsProbe <file>            visible:experience:indexing-diagnostics-attach probe envelope JSON.
  --strict                         Require every R3 migration evidence family.
  --requireRealProfilePreflight    Require preflight evidenceSource.scope=real-profile.
  --requireSourceScopedScanProgress
                                  Require preflight scanProgressSourceScope=ready.
  --requireProductionReadiness     Require production readiness status=ready.
  --requireFtsSimulation           Require FTS copy simulation source snapshot unchanged.
  --requireScanProgressSimulation  Require scan_progress copy simulation source snapshot unchanged.
  --requireScanProgressPlan        Require read-only scan_progress migration plan evidence.
  --requireDatabaseEvidenceCorrelation
                                  Require DB evidence artifacts to share one dbIdentity.
  --requireNaturalSettingsEvidence Require attach-only/read-only natural Settings verification.
  --requireSettingsVisibleArtifacts
                                  Require attach-only Settings/source detail screenshot artifacts.
  --output <file>                  Write verification JSON to a file in addition to stdout.
  --compact                        Print single-line JSON.
  --help                           Show this help.

This verifier only reads JSON artifacts. It does not open SQLite, run migrations, rebuild FTS, or launch the app.
`)
}

function defaultRequirements(): Required<SearchIndexMigrationEvidenceRequirements> {
  return {
    requireRealProfilePreflight: false,
    requireSourceScopedScanProgress: false,
    requireProductionReadiness: false,
    requireFtsSimulation: false,
    requireScanProgressSimulation: false,
    requireScanProgressPlan: false,
    requireDatabaseEvidenceCorrelation: false,
    requireNaturalSettingsEvidence: false,
    requireSettingsVisibleArtifacts: false
  }
}

function normalizeRequirements(
  input: SearchIndexMigrationEvidenceRequirements = {}
): Required<SearchIndexMigrationEvidenceRequirements> {
  const defaults = defaultRequirements()
  return {
    requireRealProfilePreflight:
      input.requireRealProfilePreflight ?? defaults.requireRealProfilePreflight,
    requireSourceScopedScanProgress:
      input.requireSourceScopedScanProgress ?? defaults.requireSourceScopedScanProgress,
    requireProductionReadiness:
      input.requireProductionReadiness ?? defaults.requireProductionReadiness,
    requireFtsSimulation: input.requireFtsSimulation ?? defaults.requireFtsSimulation,
    requireScanProgressSimulation:
      input.requireScanProgressSimulation ?? defaults.requireScanProgressSimulation,
    requireScanProgressPlan: input.requireScanProgressPlan ?? defaults.requireScanProgressPlan,
    requireDatabaseEvidenceCorrelation:
      input.requireDatabaseEvidenceCorrelation ?? defaults.requireDatabaseEvidenceCorrelation,
    requireNaturalSettingsEvidence:
      input.requireNaturalSettingsEvidence ?? defaults.requireNaturalSettingsEvidence,
    requireSettingsVisibleArtifacts:
      input.requireSettingsVisibleArtifacts ?? defaults.requireSettingsVisibleArtifacts
  }
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    ...defaultRequirements(),
    pretty: true
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--preflight' && argv[index + 1]) {
      options.preflight = argv[++index]
      continue
    }
    if (arg === '--productionReadiness' && argv[index + 1]) {
      options.productionReadiness = argv[++index]
      continue
    }
    if (arg === '--ftsSimulation' && argv[index + 1]) {
      options.ftsSimulation = argv[++index]
      continue
    }
    if (arg === '--scanProgressSimulation' && argv[index + 1]) {
      options.scanProgressSimulation = argv[++index]
      continue
    }
    if (arg === '--scanProgressPlan' && argv[index + 1]) {
      options.scanProgressPlan = argv[++index]
      continue
    }
    if (arg === '--settingsVerification' && argv[index + 1]) {
      options.settingsVerification = argv[++index]
      continue
    }
    if (arg === '--settingsProbe' && argv[index + 1]) {
      options.settingsProbe = argv[++index]
      continue
    }
    if (arg === '--strict') {
      Object.assign(options, {
        requireRealProfilePreflight: true,
        requireSourceScopedScanProgress: true,
        requireProductionReadiness: true,
        requireFtsSimulation: true,
        requireScanProgressSimulation: true,
        requireScanProgressPlan: true,
        requireDatabaseEvidenceCorrelation: true,
        requireNaturalSettingsEvidence: true,
        requireSettingsVisibleArtifacts: true
      })
      continue
    }
    if (arg === '--requireRealProfilePreflight') {
      options.requireRealProfilePreflight = true
      continue
    }
    if (arg === '--requireSourceScopedScanProgress') {
      options.requireSourceScopedScanProgress = true
      continue
    }
    if (arg === '--requireProductionReadiness') {
      options.requireProductionReadiness = true
      continue
    }
    if (arg === '--requireFtsSimulation') {
      options.requireFtsSimulation = true
      continue
    }
    if (arg === '--requireScanProgressSimulation') {
      options.requireScanProgressSimulation = true
      continue
    }
    if (arg === '--requireScanProgressPlan') {
      options.requireScanProgressPlan = true
      continue
    }
    if (arg === '--requireDatabaseEvidenceCorrelation') {
      options.requireDatabaseEvidenceCorrelation = true
      continue
    }
    if (arg === '--requireNaturalSettingsEvidence') {
      options.requireNaturalSettingsEvidence = true
      continue
    }
    if (arg === '--requireSettingsVisibleArtifacts') {
      options.requireSettingsVisibleArtifacts = true
      continue
    }
    if (arg === '--output' && argv[index + 1]) {
      options.output = argv[++index]
      continue
    }
    if (arg === '--compact') {
      options.pretty = false
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function readRecord(value: unknown, path: string[]): JsonRecord | null {
  let current: unknown = value
  for (const key of path) {
    const record = asRecord(current)
    if (!record) return null
    current = record[key]
  }
  return asRecord(current)
}

function readString(value: unknown, path: string[]): string | null {
  let current: unknown = value
  for (const key of path) {
    const record = asRecord(current)
    if (!record) return null
    current = record[key]
  }
  return typeof current === 'string' ? current : null
}

function readBoolean(value: unknown, path: string[]): boolean | null {
  let current: unknown = value
  for (const key of path) {
    const record = asRecord(current)
    if (!record) return null
    current = record[key]
  }
  return typeof current === 'boolean' ? current : null
}

function readNumber(value: unknown, path: string[]): number | null {
  let current: unknown = value
  for (const key of path) {
    const record = asRecord(current)
    if (!record) return null
    current = record[key]
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : null
}

function readStringArray(value: unknown, path: string[]): string[] | null {
  let current: unknown = value
  for (const key of path) {
    const record = asRecord(current)
    if (!record) return null
    current = record[key]
  }
  return Array.isArray(current) && current.every((item) => typeof item === 'string')
    ? current
    : null
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`
  }
  const record = asRecord(value)
  if (record) {
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function jsonRecordsMatch(left: unknown, right: unknown): boolean {
  return (
    asRecord(left) !== null && asRecord(right) !== null && stableJson(left) === stableJson(right)
  )
}

function arrayLength(value: unknown, path: string[]): number | null {
  let current: unknown = value
  for (const key of path) {
    const record = asRecord(current)
    if (!record) return null
    current = record[key]
  }
  return Array.isArray(current) ? current.length : null
}

function readCheckById(value: unknown, id: string): JsonRecord | null {
  const record = asRecord(value)
  const checks = record?.checks
  if (!Array.isArray(checks)) return null
  return checks.map(asRecord).find((check) => readString(check, ['id']) === id) ?? null
}

function checkGatePassed(value: unknown): boolean {
  return readBoolean(value, ['gate', 'passed']) === true
}

function createCheck(
  id: string,
  artifact: unknown,
  required: boolean,
  verify: (value: unknown) => string[],
  evidence?: Record<string, string | number | boolean | null>
): SearchIndexMigrationEvidenceVerificationCheck {
  if (!artifact) {
    return {
      id,
      status: required ? 'failed' : 'not-provided',
      summary: required ? `${id} evidence is required.` : `${id} evidence was not provided.`,
      failures: required ? [`${id} evidence is required`] : [],
      evidence
    }
  }

  const failures = verify(artifact)
  return {
    id,
    status: failures.length === 0 ? 'passed' : 'failed',
    summary: failures.length === 0 ? `${id} evidence passed.` : `${id} evidence failed.`,
    failures,
    evidence
  }
}

function verifyPreflight(
  artifact: unknown,
  requirements: Required<SearchIndexMigrationEvidenceRequirements>
): string[] {
  const failures: string[] = []
  const taskHistoryCheck = readCheckById(artifact, 'task-history-store')
  if (!checkGatePassed(artifact)) failures.push('Preflight gate.passed must be true')
  if (readBoolean(artifact, ['destructiveActions']) !== false) {
    failures.push('Preflight destructiveActions must be false')
  }
  if (readBoolean(artifact, ['snapshot', 'sqliteRuntime', 'queryOnly']) !== true) {
    failures.push('Preflight sqliteRuntime.queryOnly must be true')
  }
  if (readString(artifact, ['migrationReadiness', 'sqliteFtsOwnership']) === 'blocked') {
    failures.push('Preflight sqliteFtsOwnership must not be blocked')
  }
  if (readString(artifact, ['migrationReadiness', 'scanProgressSourceScope']) === 'blocked') {
    failures.push('Preflight scanProgressSourceScope must not be blocked')
  }
  if (requirements.requireRealProfilePreflight) {
    if (readString(artifact, ['evidenceSource', 'scope']) !== 'real-profile') {
      failures.push('Preflight evidenceSource.scope must be real-profile')
    }
    if (readString(artifact, ['evidenceSource', 'dbPathClass']) !== 'non-temporary') {
      failures.push('Preflight evidenceSource.dbPathClass must be non-temporary')
    }
    if (readBoolean(artifact, ['evidenceSource', 'realProfileRequired']) !== true) {
      failures.push('Preflight evidenceSource.realProfileRequired must be true')
    }
  }
  if (requirements.requireNaturalSettingsEvidence) {
    if (readString(taskHistoryCheck, ['evidence', 'evidence']) !== 'durable-history-present') {
      failures.push('Preflight task-history-store evidence must be durable-history-present')
    }
    if ((readNumber(taskHistoryCheck, ['evidence', 'rows']) ?? 0) < 1) {
      failures.push('Preflight task-history-store rows must be at least 1')
    }
  }
  if (
    requirements.requireSourceScopedScanProgress &&
    readString(artifact, ['migrationReadiness', 'scanProgressSourceScope']) !== 'ready'
  ) {
    failures.push('Preflight scanProgressSourceScope must be ready')
  }
  return failures
}

function verifyProductionReadiness(artifact: unknown): string[] {
  const failures: string[] = []
  if (readString(artifact, ['kind']) !== 'search-index-production-migration-readiness') {
    failures.push('Production readiness kind mismatch')
  }
  if (readString(artifact, ['mode']) !== 'source-read-only') {
    failures.push('Production readiness mode must be source-read-only')
  }
  if (readBoolean(artifact, ['destructiveActions']) !== false) {
    failures.push('Production readiness destructiveActions must be false')
  }
  if (readString(artifact, ['readiness', 'status']) !== 'ready') {
    failures.push('Production readiness status must be ready')
  }
  if ((arrayLength(artifact, ['readiness', 'blockers']) ?? 1) !== 0) {
    failures.push('Production readiness blockers must be empty')
  }
  if (readString(artifact, ['checks', 'legacyFileFtsMigrationPolicy', 'status']) !== 'retained') {
    failures.push('Legacy file_fts migration policy must be retained')
  }
  if ((arrayLength(artifact, ['migrationJournal', 'journalEntriesWithoutSql']) ?? 1) !== 0) {
    failures.push('Drizzle journal entries without SQL must be empty')
  }
  if ((arrayLength(artifact, ['migrationJournal', 'sqlFilesWithoutJournalEntry']) ?? 1) !== 0) {
    failures.push('SQL files without Drizzle journal entry must be empty')
  }
  return failures
}

function verifyFtsSimulation(artifact: unknown, requireRealProfileEvidence: boolean): string[] {
  const failures: string[] = []
  if (readString(artifact, ['kind']) !== 'search-index-fts-ownership-simulation') {
    failures.push('FTS simulation kind mismatch')
  }
  if (!checkGatePassed(artifact)) failures.push('FTS simulation gate.passed must be true')
  if (readBoolean(artifact, ['destructiveActions']) !== false) {
    failures.push('FTS simulation destructiveActions must be false')
  }
  if (readBoolean(artifact, ['simulationMutatesCopy']) !== true) {
    failures.push('FTS simulation must mutate only the copy')
  }
  if (readString(artifact, ['sourceMutationPolicy']) !== 'source-not-mutated-copy-execute') {
    failures.push('FTS simulation sourceMutationPolicy must be source-not-mutated-copy-execute')
  }
  if (readBoolean(artifact, ['sourceSnapshotUnchanged']) !== true) {
    failures.push('FTS simulation sourceSnapshotUnchanged must be true')
  }
  if (requireRealProfileEvidence) {
    if (readString(artifact, ['evidenceSource', 'scope']) !== 'real-profile') {
      failures.push('FTS simulation evidenceSource.scope must be real-profile')
    }
    if (readString(artifact, ['evidenceSource', 'dbPathClass']) !== 'non-temporary') {
      failures.push('FTS simulation evidenceSource.dbPathClass must be non-temporary')
    }
    if (readBoolean(artifact, ['evidenceSource', 'realProfileRequired']) !== true) {
      failures.push('FTS simulation evidenceSource.realProfileRequired must be true')
    }
  }
  return failures
}

function verifyScanProgressSimulation(
  artifact: unknown,
  requireRealProfileEvidence: boolean
): string[] {
  const failures: string[] = []
  if (readString(artifact, ['kind']) !== 'scan-progress-source-scope-simulation') {
    failures.push('scan_progress simulation kind mismatch')
  }
  if (!checkGatePassed(artifact)) failures.push('scan_progress simulation gate.passed must be true')
  if (readBoolean(artifact, ['destructiveActions']) !== false) {
    failures.push('scan_progress simulation destructiveActions must be false')
  }
  if (readString(artifact, ['sourceMutationPolicy']) !== 'source-not-mutated-copy-execute') {
    failures.push(
      'scan_progress simulation sourceMutationPolicy must be source-not-mutated-copy-execute'
    )
  }
  if (readBoolean(artifact, ['sourceSnapshotUnchanged']) !== true) {
    failures.push('scan_progress simulation sourceSnapshotUnchanged must be true')
  }
  if (readBoolean(artifact, ['execution', 'executed']) !== true) {
    failures.push('scan_progress simulation must execute migration only on the copy')
  }
  if (requireRealProfileEvidence) {
    if (readString(artifact, ['evidenceSource', 'scope']) !== 'real-profile') {
      failures.push('scan_progress simulation evidenceSource.scope must be real-profile')
    }
    if (readString(artifact, ['evidenceSource', 'dbPathClass']) !== 'non-temporary') {
      failures.push('scan_progress simulation evidenceSource.dbPathClass must be non-temporary')
    }
    if (readBoolean(artifact, ['evidenceSource', 'realProfileRequired']) !== true) {
      failures.push('scan_progress simulation evidenceSource.realProfileRequired must be true')
    }
  }
  return failures
}

function verifyScanProgressPlan(artifact: unknown, requireRealProfileEvidence: boolean): string[] {
  const failures: string[] = []
  if (readString(artifact, ['mode']) !== 'plan')
    failures.push('scan_progress plan mode must be plan')
  if (readBoolean(artifact, ['executed']) !== false) {
    failures.push('scan_progress plan executed must be false')
  }
  if (readBoolean(artifact, ['queryOnly']) !== true) {
    failures.push('scan_progress plan queryOnly must be true')
  }
  if (readString(artifact, ['plan', 'mode']) !== 'read-only') {
    failures.push('scan_progress plan.plan.mode must be read-only')
  }
  if (readBoolean(artifact, ['plan', 'destructiveActions']) !== false) {
    failures.push('scan_progress plan.plan.destructiveActions must be false')
  }
  if (readBoolean(artifact, ['plan', 'requiresApproval']) !== true) {
    failures.push('scan_progress plan.plan.requiresApproval must be true')
  }
  if ((arrayLength(artifact, ['plan', 'blockers']) ?? 1) !== 0) {
    failures.push('scan_progress plan blockers must be empty')
  }
  if (requireRealProfileEvidence) {
    if (readString(artifact, ['evidenceSource', 'scope']) !== 'real-profile') {
      failures.push('scan_progress plan evidenceSource.scope must be real-profile')
    }
    if (readString(artifact, ['evidenceSource', 'dbPathClass']) !== 'non-temporary') {
      failures.push('scan_progress plan evidenceSource.dbPathClass must be non-temporary')
    }
    if (readBoolean(artifact, ['evidenceSource', 'realProfileRequired']) !== true) {
      failures.push('scan_progress plan evidenceSource.realProfileRequired must be true')
    }
  }
  return failures
}

function verifyDatabaseEvidenceCorrelation(inputs: SearchIndexMigrationEvidenceInputs): string[] {
  const identities = [
    ['preflight', readString(inputs.preflight, ['evidenceSource', 'dbIdentity'])],
    ['fts-simulation', readString(inputs.ftsSimulation, ['evidenceSource', 'dbIdentity'])],
    [
      'scan-progress-simulation',
      readString(inputs.scanProgressSimulation, ['evidenceSource', 'dbIdentity'])
    ],
    ['scan-progress-plan', readString(inputs.scanProgressPlan, ['evidenceSource', 'dbIdentity'])]
  ] as const
  const invalid = identities
    .filter(([, identity]) => !isSearchIndexDatabaseIdentity(identity))
    .map(([id]) => id)
  const failures: string[] = []

  if (invalid.length > 0) {
    failures.push(
      `Database evidence correlation requires valid evidenceSource.dbIdentity for: ${invalid.join(', ')}`
    )
  }

  const validIdentities = identities
    .map(([, identity]) => identity)
    .filter(isSearchIndexDatabaseIdentity)
  if (new Set(validIdentities).size > 1) {
    failures.push('Database evidence artifacts must share the same evidenceSource.dbIdentity')
  }

  return failures
}

function verifySettingsVerification(artifact: unknown): string[] {
  const failures: string[] = []
  const requiredAuditFields = readStringArray(artifact, ['options', 'requiredAuditFields']) ?? []
  if (
    readString(artifact, ['schema']) !== 'settings-indexing-diagnostics-evidence-verification/v1'
  ) {
    failures.push('Settings diagnostics verification schema mismatch')
  }
  if (!checkGatePassed(artifact)) {
    failures.push('Settings diagnostics verification gate.passed must be true')
  }
  if (readBoolean(artifact, ['options', 'requireReadOnlyEnvelope']) !== true) {
    failures.push('Settings diagnostics verification must require read-only envelope')
  }
  if (readBoolean(artifact, ['options', 'requireNaturalRecentTaskEvidence']) !== true) {
    failures.push('Settings diagnostics verification must require natural recent task evidence')
  }
  if (readString(artifact, ['options', 'sourceId']) !== 'file-provider') {
    failures.push('Settings diagnostics verification sourceId must be file-provider')
  }
  if ((readNumber(artifact, ['options', 'minRecentTasks']) ?? 0) < 1) {
    failures.push('Settings diagnostics verification minRecentTasks must be at least 1')
  }
  for (const field of ['duration', 'trigger', 'reason', 'attempt', 'errorCode']) {
    if (!requiredAuditFields.includes(field)) {
      failures.push(`Settings diagnostics verification must require ${field}`)
    }
  }
  return failures
}

function verifySettingsProbeVisibleArtifacts(artifact: unknown): string[] {
  const failures: string[] = []
  if (readBoolean(artifact, ['ok']) !== true) {
    failures.push('Settings probe ok must be true')
  }
  if (readString(artifact, ['mode']) !== 'attach-only') {
    failures.push('Settings probe mode must be attach-only')
  }
  if (readString(artifact, ['profileMutationPolicy']) !== 'read-only') {
    failures.push('Settings probe profileMutationPolicy must be read-only')
  }
  if (readString(artifact, ['sourceId']) !== 'file-provider') {
    failures.push('Settings probe sourceId must be file-provider')
  }
  if (readBoolean(artifact, ['seededRecentTaskEvidence']) === true) {
    failures.push('Settings probe must not use seeded recent task evidence')
  }
  if (readString(artifact, ['maintenanceAction']) !== null) {
    failures.push('Settings probe must not use maintenanceAction evidence')
  }
  if (readString(artifact, ['fixtureRoot']) !== null) {
    failures.push('Settings probe must not use fixtureRoot evidence')
  }
  if (readString(artifact, ['artifactPaths', 'settingsScreenshot']) === null) {
    failures.push('Settings probe must include a Settings screenshot artifact path')
  }
  if (readString(artifact, ['artifactPaths', 'detailScreenshot']) === null) {
    failures.push('Settings probe must include a source detail screenshot artifact path')
  }
  if (readString(artifact, ['artifactPaths', 'settingsDom']) === null) {
    failures.push('Settings probe must include a Settings DOM artifact path')
  }
  if (readString(artifact, ['artifactPaths', 'detailDom']) === null) {
    failures.push('Settings probe must include a source detail DOM artifact path')
  }
  return failures
}

function verifySettingsVisibleArtifactFiles(
  evidence: SearchIndexMigrationSettingsVisibleArtifactEvidence | undefined
): string[] {
  const failures: string[] = []
  if (!evidence) return failures
  if (!evidence.settingsScreenshot) {
    failures.push('Settings visible artifact evidence must include settingsScreenshot')
  }
  if (!evidence.detailScreenshot) {
    failures.push('Settings visible artifact evidence must include detailScreenshot')
  }
  if (!evidence.settingsDom) {
    failures.push('Settings visible artifact evidence must include settingsDom')
  }
  if (!evidence.detailDom) {
    failures.push('Settings visible artifact evidence must include detailDom')
  }
  if (evidence.verificationPathMatchesProbe !== true) {
    failures.push('Settings diagnostics verification artifact path must match the probe envelope')
  }
  if (evidence.verificationMatchesProbeEnvelope !== true) {
    failures.push('Settings diagnostics verification JSON must match the probe envelope')
  }
  if (evidence.settingsScreenshotExists !== true) {
    failures.push('Settings screenshot artifact file must exist')
  }
  if (evidence.settingsScreenshotNonEmpty !== true) {
    failures.push('Settings screenshot artifact file must be non-empty')
  }
  if (evidence.settingsScreenshotPng !== true) {
    failures.push('Settings screenshot artifact file must be a PNG image')
  }
  if (evidence.detailScreenshotExists !== true) {
    failures.push('Source detail screenshot artifact file must exist')
  }
  if (evidence.detailScreenshotNonEmpty !== true) {
    failures.push('Source detail screenshot artifact file must be non-empty')
  }
  if (evidence.detailScreenshotPng !== true) {
    failures.push('Source detail screenshot artifact file must be a PNG image')
  }
  if (evidence.settingsDomExists !== true) {
    failures.push('Settings DOM artifact file must exist')
  }
  if (evidence.settingsDomNonEmpty !== true) {
    failures.push('Settings DOM artifact file must be non-empty')
  }
  if (evidence.settingsDomHasSourceDiagnosticsGroup !== true) {
    failures.push('Settings DOM artifact must include the source diagnostics group')
  }
  if (evidence.detailDomExists !== true) {
    failures.push('Source detail DOM artifact file must exist')
  }
  if (evidence.detailDomNonEmpty !== true) {
    failures.push('Source detail DOM artifact file must be non-empty')
  }
  if (evidence.detailDomDialogVisible !== true) {
    failures.push('Source detail DOM artifact must show the detail dialog')
  }
  if (evidence.detailDomHasRecentTasks !== true) {
    failures.push('Source detail DOM artifact must include recent tasks')
  }
  return failures
}

export function verifySearchIndexMigrationEvidence(
  inputs: SearchIndexMigrationEvidenceInputs,
  requirementsInput: SearchIndexMigrationEvidenceRequirements = {}
): SearchIndexMigrationEvidenceVerificationResult {
  const requirements = normalizeRequirements(requirementsInput)
  const taskHistoryCheck = readCheckById(inputs.preflight, 'task-history-store')
  const checks = [
    createCheck(
      'preflight',
      inputs.preflight,
      requirements.requireRealProfilePreflight || requirements.requireSourceScopedScanProgress,
      (artifact) => verifyPreflight(artifact, requirements),
      {
        scope: readString(inputs.preflight, ['evidenceSource', 'scope']),
        scanProgressSourceScope: readString(inputs.preflight, [
          'migrationReadiness',
          'scanProgressSourceScope'
        ]),
        sqliteFtsOwnership: readString(inputs.preflight, [
          'migrationReadiness',
          'sqliteFtsOwnership'
        ]),
        taskHistoryEvidence: readString(taskHistoryCheck, ['evidence', 'evidence']),
        taskHistoryRows: readNumber(taskHistoryCheck, ['evidence', 'rows'])
      }
    ),
    createCheck(
      'production-readiness',
      inputs.productionReadiness,
      requirements.requireProductionReadiness,
      verifyProductionReadiness,
      {
        status: readString(inputs.productionReadiness, ['readiness', 'status']),
        blockerCount: arrayLength(inputs.productionReadiness, ['readiness', 'blockers'])
      }
    ),
    createCheck(
      'fts-simulation',
      inputs.ftsSimulation,
      requirements.requireFtsSimulation,
      (artifact) => verifyFtsSimulation(artifact, requirements.requireFtsSimulation),
      {
        scope: readString(inputs.ftsSimulation, ['evidenceSource', 'scope'])
      }
    ),
    createCheck(
      'scan-progress-simulation',
      inputs.scanProgressSimulation,
      requirements.requireScanProgressSimulation,
      (artifact) =>
        verifyScanProgressSimulation(artifact, requirements.requireScanProgressSimulation),
      {
        scope: readString(inputs.scanProgressSimulation, ['evidenceSource', 'scope'])
      }
    ),
    createCheck(
      'scan-progress-plan',
      inputs.scanProgressPlan,
      requirements.requireScanProgressPlan,
      (artifact) => verifyScanProgressPlan(artifact, requirements.requireScanProgressPlan),
      {
        mode: readString(inputs.scanProgressPlan, ['mode']),
        queryOnly: readBoolean(inputs.scanProgressPlan, ['queryOnly']),
        scope: readString(inputs.scanProgressPlan, ['evidenceSource', 'scope'])
      }
    ),
    createCheck(
      'database-evidence-correlation',
      requirements.requireDatabaseEvidenceCorrelation ? inputs : undefined,
      requirements.requireDatabaseEvidenceCorrelation,
      () => verifyDatabaseEvidenceCorrelation(inputs),
      {
        preflightDbIdentity: readString(inputs.preflight, ['evidenceSource', 'dbIdentity']),
        ftsSimulationDbIdentity: readString(inputs.ftsSimulation, ['evidenceSource', 'dbIdentity']),
        scanProgressSimulationDbIdentity: readString(inputs.scanProgressSimulation, [
          'evidenceSource',
          'dbIdentity'
        ]),
        scanProgressPlanDbIdentity: readString(inputs.scanProgressPlan, [
          'evidenceSource',
          'dbIdentity'
        ])
      }
    ),
    createCheck(
      'settings-natural-recent-task',
      inputs.settingsVerification,
      requirements.requireNaturalSettingsEvidence,
      verifySettingsVerification
    ),
    createCheck(
      'settings-visible-artifacts',
      inputs.settingsProbe,
      requirements.requireSettingsVisibleArtifacts,
      (artifact) => [
        ...verifySettingsProbeVisibleArtifacts(artifact),
        ...verifySettingsVisibleArtifactFiles(inputs.settingsVisibleArtifacts)
      ],
      {
        probeSourceId: readString(inputs.settingsProbe, ['sourceId']),
        settingsVerification: inputs.settingsVisibleArtifacts?.settingsVerification ?? null,
        probeVerification: inputs.settingsVisibleArtifacts?.probeVerification ?? null,
        verificationPathMatchesProbe:
          inputs.settingsVisibleArtifacts?.verificationPathMatchesProbe ?? null,
        verificationMatchesProbeEnvelope:
          inputs.settingsVisibleArtifacts?.verificationMatchesProbeEnvelope ?? null,
        settingsScreenshot: readString(inputs.settingsProbe, [
          'artifactPaths',
          'settingsScreenshot'
        ]),
        detailScreenshot: readString(inputs.settingsProbe, ['artifactPaths', 'detailScreenshot']),
        settingsDom: readString(inputs.settingsProbe, ['artifactPaths', 'settingsDom']),
        detailDom: readString(inputs.settingsProbe, ['artifactPaths', 'detailDom']),
        settingsScreenshotExists: inputs.settingsVisibleArtifacts?.settingsScreenshotExists ?? null,
        settingsScreenshotNonEmpty:
          inputs.settingsVisibleArtifacts?.settingsScreenshotNonEmpty ?? null,
        settingsScreenshotPng: inputs.settingsVisibleArtifacts?.settingsScreenshotPng ?? null,
        detailScreenshotExists: inputs.settingsVisibleArtifacts?.detailScreenshotExists ?? null,
        detailScreenshotNonEmpty: inputs.settingsVisibleArtifacts?.detailScreenshotNonEmpty ?? null,
        detailScreenshotPng: inputs.settingsVisibleArtifacts?.detailScreenshotPng ?? null,
        settingsDomExists: inputs.settingsVisibleArtifacts?.settingsDomExists ?? null,
        settingsDomNonEmpty: inputs.settingsVisibleArtifacts?.settingsDomNonEmpty ?? null,
        settingsDomHasSourceDiagnosticsGroup:
          inputs.settingsVisibleArtifacts?.settingsDomHasSourceDiagnosticsGroup ?? null,
        detailDomExists: inputs.settingsVisibleArtifacts?.detailDomExists ?? null,
        detailDomNonEmpty: inputs.settingsVisibleArtifacts?.detailDomNonEmpty ?? null,
        detailDomDialogVisible: inputs.settingsVisibleArtifacts?.detailDomDialogVisible ?? null,
        detailDomHasRecentTasks: inputs.settingsVisibleArtifacts?.detailDomHasRecentTasks ?? null
      }
    )
  ]

  const failures = checks.flatMap((check) => check.failures)
  return {
    schema: SEARCH_INDEX_MIGRATION_EVIDENCE_VERIFICATION_SCHEMA,
    generatedAt: new Date().toISOString(),
    destructiveActions: false,
    requirements,
    gate: {
      passed: failures.length === 0,
      failures
    },
    checks,
    nextActions:
      failures.length === 0
        ? [
            'Attach this verification result to the R3 SQLite/FTS and scan_progress evidence packet.'
          ]
        : [
            'Collect real-profile preflight with --evidenceScope real-profile --requireRealProfileEvidence.',
            'Collect real-profile preflight with non-empty indexed_source_task_state durable history rows.',
            'Collect real-profile FTS copy simulation with --evidenceScope real-profile --requireRealProfileEvidence.',
            'Collect real-profile scan_progress copy simulation with --evidenceScope real-profile --requireRealProfileEvidence.',
            'Collect real-profile scan_progress plan with --evidenceScope real-profile --requireRealProfileEvidence.',
            'Collect preflight, FTS simulation, scan_progress simulation, and scan_progress plan from the same source DB so evidenceSource.dbIdentity matches.',
            'Collect source-scoped post-migration preflight before closing scan_progress migration.',
            'Collect attach-only natural Settings recent task verification plus Settings/source detail screenshots before closing durable job history.'
          ]
  }
}

function readJsonFile(filePath: string | undefined): unknown {
  if (!filePath) return undefined
  const resolved = resolve(filePath)
  if (!existsSync(resolved)) {
    throw new Error(`Evidence artifact does not exist: ${filePath}`)
  }
  return JSON.parse(readFileSync(resolved, 'utf8')) as unknown
}

function resolveArtifactPath(
  artifactPath: string | null,
  baseFilePath: string | undefined
): string | null {
  if (!artifactPath) return null
  if (artifactPath.startsWith('/')) return artifactPath
  return resolve(baseFilePath ? dirname(resolve(baseFilePath)) : process.cwd(), artifactPath)
}

function artifactFileState(artifactPath: string | null): {
  exists: boolean | null
  nonEmpty: boolean | null
} {
  if (!artifactPath) return { exists: null, nonEmpty: null }
  try {
    const stats = statSync(artifactPath)
    return {
      exists: true,
      nonEmpty: stats.isFile() && stats.size > 0
    }
  } catch {
    return {
      exists: false,
      nonEmpty: false
    }
  }
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function artifactHasPngSignature(artifactPath: string | null): boolean | null {
  if (!artifactPath) return null
  try {
    const bytes = readFileSync(artifactPath).subarray(0, pngSignature.length)
    return bytes.equals(pngSignature)
  } catch {
    return false
  }
}

function readArtifactJsonRecord(artifactPath: string | null): JsonRecord | null {
  if (!artifactPath) return null
  try {
    return asRecord(JSON.parse(readFileSync(artifactPath, 'utf8')))
  } catch {
    return null
  }
}

function buildSettingsVisibleArtifactEvidence(
  settingsProbe: unknown,
  settingsProbePath: string | undefined,
  settingsVerificationPath: string | undefined
): SearchIndexMigrationSettingsVisibleArtifactEvidence | undefined {
  if (!settingsProbe) return undefined
  const settingsVerification = settingsVerificationPath ? resolve(settingsVerificationPath) : null
  const probeVerification = resolveArtifactPath(
    readString(settingsProbe, ['artifactPaths', 'verification']),
    settingsProbePath
  )
  const settingsScreenshot = resolveArtifactPath(
    readString(settingsProbe, ['artifactPaths', 'settingsScreenshot']),
    settingsProbePath
  )
  const detailScreenshot = resolveArtifactPath(
    readString(settingsProbe, ['artifactPaths', 'detailScreenshot']),
    settingsProbePath
  )
  const settingsDom = resolveArtifactPath(
    readString(settingsProbe, ['artifactPaths', 'settingsDom']),
    settingsProbePath
  )
  const detailDom = resolveArtifactPath(
    readString(settingsProbe, ['artifactPaths', 'detailDom']),
    settingsProbePath
  )
  const settingsScreenshotState = artifactFileState(settingsScreenshot)
  const detailScreenshotState = artifactFileState(detailScreenshot)
  const settingsDomState = artifactFileState(settingsDom)
  const detailDomState = artifactFileState(detailDom)
  const settingsDomSnapshot = readArtifactJsonRecord(settingsDom)
  const detailDomSnapshot = readArtifactJsonRecord(detailDom)

  return {
    settingsVerification,
    probeVerification,
    verificationPathMatchesProbe:
      settingsVerification !== null && probeVerification !== null
        ? settingsVerification === probeVerification
        : false,
    verificationMatchesProbeEnvelope: jsonRecordsMatch(
      readJsonFile(settingsVerificationPath),
      readRecord(settingsProbe, ['verification'])
    ),
    settingsScreenshot,
    detailScreenshot,
    settingsDom,
    detailDom,
    settingsScreenshotExists: settingsScreenshotState.exists,
    settingsScreenshotNonEmpty: settingsScreenshotState.nonEmpty,
    settingsScreenshotPng: artifactHasPngSignature(settingsScreenshot),
    detailScreenshotExists: detailScreenshotState.exists,
    detailScreenshotNonEmpty: detailScreenshotState.nonEmpty,
    detailScreenshotPng: artifactHasPngSignature(detailScreenshot),
    settingsDomExists: settingsDomState.exists,
    settingsDomNonEmpty: settingsDomState.nonEmpty,
    settingsDomHasSourceDiagnosticsGroup:
      readBoolean(settingsDomSnapshot, ['hasSourceDiagnosticsGroup']) ?? false,
    detailDomExists: detailDomState.exists,
    detailDomNonEmpty: detailDomState.nonEmpty,
    detailDomDialogVisible: readBoolean(detailDomSnapshot, ['dialog', 'visible']) ?? false,
    detailDomHasRecentTasks: readBoolean(detailDomSnapshot, ['dialog', 'hasRecentTasks']) ?? false
  }
}

function writeOutput(value: unknown, options: CliOptions): void {
  const serialized = JSON.stringify(value, null, options.pretty ? 2 : 0)
  if (options.output) {
    const outputPath = resolve(options.output)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${serialized}\n`, 'utf8')
  }
  console.log(serialized)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return
  const settingsProbe = readJsonFile(options.settingsProbe)

  const result = verifySearchIndexMigrationEvidence(
    {
      preflight: readJsonFile(options.preflight),
      productionReadiness: readJsonFile(options.productionReadiness),
      ftsSimulation: readJsonFile(options.ftsSimulation),
      scanProgressSimulation: readJsonFile(options.scanProgressSimulation),
      scanProgressPlan: readJsonFile(options.scanProgressPlan),
      settingsVerification: readJsonFile(options.settingsVerification),
      settingsProbe,
      settingsVisibleArtifacts: buildSettingsVisibleArtifactEvidence(
        settingsProbe,
        options.settingsProbe,
        options.settingsVerification
      )
    },
    options
  )
  writeOutput(result, options)

  if (!result.gate.passed) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
