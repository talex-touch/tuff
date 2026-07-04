#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import type { IndexedSourceDiagnostics } from '@talex-touch/utils/search'
import {
  resolveIndexingSourceRecentTaskChips,
  type IndexingSourceRecentTaskChip
} from '../src/renderer/src/modules/search/indexing-source-diagnostics-display'

export const SETTINGS_INDEXING_DIAGNOSTICS_EVIDENCE_SCHEMA =
  'settings-indexing-diagnostics-evidence-verification/v1'
const auditFields = ['duration', 'trigger', 'reason', 'attempt', 'errorCode'] as const

export type SettingsIndexingDiagnosticsAuditField = (typeof auditFields)[number]

export interface SettingsIndexingDiagnosticsVerifierOptions {
  sourceId?: string
  minRecentTasks?: number
  requiredAuditFields?: SettingsIndexingDiagnosticsAuditField[]
}

interface CliOptions extends SettingsIndexingDiagnosticsVerifierOptions {
  input?: string
  minRecentTasks: number
  requiredAuditFields: SettingsIndexingDiagnosticsAuditField[]
  requireReadOnlyEnvelope: boolean
  requireNaturalRecentTaskEvidence: boolean
  pretty: boolean
}

export interface SettingsIndexingDiagnosticsParsedEvidence {
  sources: IndexedSourceDiagnostics[]
  envelope?: Record<string, unknown>
}

export interface SettingsIndexingDiagnosticsVerifiedSource {
  sourceId: string
  recentTaskChipCount: number
  visibleRecentTaskChipCount: number
  visibleAuditFields: Record<SettingsIndexingDiagnosticsAuditField, boolean>
  missingAuditFields: SettingsIndexingDiagnosticsAuditField[]
  sampleTaskLabelKeys: string[]
  sampleTaskTones: string[]
}

export interface SettingsIndexingDiagnosticsVerificationResult {
  schema: typeof SETTINGS_INDEXING_DIAGNOSTICS_EVIDENCE_SCHEMA
  gate: {
    passed: boolean
    failures: string[]
  }
  options: {
    sourceId?: string
    minRecentTasks: number
    requiredAuditFields: SettingsIndexingDiagnosticsAuditField[]
    requireReadOnlyEnvelope?: boolean
    requireNaturalRecentTaskEvidence?: boolean
  }
  summary: {
    sourceCount: number
    checkedSourceCount: number
    passingSourceCount: number
  }
  sources: SettingsIndexingDiagnosticsVerifiedSource[]
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run settings:indexing-diagnostics:verify -- --input <diagnostics.json> [options]

Options:
  --input <path>                 Read Settings indexing diagnostics evidence JSON. Defaults to stdin.
  --sourceId <id>                Require a specific indexing source id.
  --minRecentTasks <number>      Require visible recent task chips. Default: 1.
  --requireAuditFields <csv>     Require visible audit fields. Default: duration,trigger,reason,attempt,errorCode.
                                Use "none" to only require recent task chip basics.
  --requireReadOnlyEnvelope      Require a packaged probe envelope with mode=attach-only and profileMutationPolicy=read-only.
  --requireNaturalRecentTaskEvidence
                                Require attach-only/read-only evidence without seeded, maintenance action, or fixture-root markers.
  --compact                      Print single-line JSON.
  --help                         Show this help.

The input may be a CoreBox indexing diagnostics payload with "sources", or an envelope with
"diagnostics.sources", "sourceDiagnostics.sources", "payload.sources", or "evidence.sources".
`)
}

function parseAuditFields(value: string): SettingsIndexingDiagnosticsAuditField[] {
  if (value.trim().toLowerCase() === 'none') return []

  const allowed = new Set<string>(auditFields)
  const entries = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const invalid = entries.filter((entry) => !allowed.has(entry))
  if (invalid.length > 0) {
    throw new Error(`Invalid audit field: ${invalid.join(', ')}`)
  }
  return Array.from(new Set(entries)) as SettingsIndexingDiagnosticsAuditField[]
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    minRecentTasks: 1,
    requiredAuditFields: [...auditFields],
    requireReadOnlyEnvelope: false,
    requireNaturalRecentTaskEvidence: false,
    pretty: true
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--input' && argv[index + 1]) {
      options.input = argv[++index]
      continue
    }
    if (arg === '--sourceId' && argv[index + 1]) {
      options.sourceId = argv[++index]
      continue
    }
    if (arg === '--minRecentTasks' && argv[index + 1]) {
      options.minRecentTasks = parsePositiveInteger(argv[++index], '--minRecentTasks')
      continue
    }
    if (arg === '--requireAuditFields' && argv[index + 1]) {
      options.requiredAuditFields = parseAuditFields(argv[++index])
      continue
    }
    if (arg === '--requireReadOnlyEnvelope') {
      options.requireReadOnlyEnvelope = true
      continue
    }
    if (arg === '--requireNaturalRecentTaskEvidence') {
      options.requireNaturalRecentTaskEvidence = true
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function readInput(options: CliOptions): Promise<string> {
  if (options.input) return readFile(options.input, 'utf8')
  return readStdin()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readSourcesFromCandidate(candidate: unknown): IndexedSourceDiagnostics[] | null {
  if (!isRecord(candidate) || !Array.isArray(candidate.sources)) return null
  return candidate.sources as IndexedSourceDiagnostics[]
}

export function parseSettingsIndexingDiagnosticsEvidenceEnvelope(
  raw: string
): SettingsIndexingDiagnosticsParsedEvidence {
  const parsed = JSON.parse(raw) as unknown
  const direct = readSourcesFromCandidate(parsed)
  if (direct) {
    return {
      sources: direct,
      envelope: isRecord(parsed) ? parsed : undefined
    }
  }

  if (isRecord(parsed)) {
    for (const key of ['diagnostics', 'sourceDiagnostics', 'payload', 'evidence']) {
      const nested = readSourcesFromCandidate(parsed[key])
      if (nested) {
        return {
          sources: nested,
          envelope: parsed
        }
      }
    }
  }

  throw new Error('Settings indexing diagnostics evidence JSON is missing sources')
}

export function parseSettingsIndexingDiagnosticsEvidence(raw: string): IndexedSourceDiagnostics[] {
  return parseSettingsIndexingDiagnosticsEvidenceEnvelope(raw).sources
}

export function verifyReadOnlyProbeEnvelope(
  envelope: Record<string, unknown> | undefined
): string[] {
  if (!envelope) {
    return ['Read-only evidence gate requires a packaged probe envelope']
  }

  const failures: string[] = []
  if (envelope.mode !== 'attach-only') {
    failures.push('Probe envelope mode must be attach-only for read-only evidence')
  }
  if (envelope.profileMutationPolicy !== 'read-only') {
    failures.push('Probe envelope profileMutationPolicy must be read-only')
  }
  return failures
}

export function verifyNaturalRecentTaskProbeEnvelope(
  envelope: Record<string, unknown> | undefined
): string[] {
  const failures = verifyReadOnlyProbeEnvelope(envelope)
  if (!envelope) return failures

  if (envelope.seededRecentTaskEvidence === true) {
    failures.push(
      'Probe envelope must not use seeded recent task evidence for natural recent task evidence'
    )
  }
  if (typeof envelope.maintenanceAction === 'string' && envelope.maintenanceAction.length > 0) {
    failures.push('Probe envelope must not use maintenanceAction for natural recent task evidence')
  }
  if (typeof envelope.fixtureRoot === 'string' && envelope.fixtureRoot.length > 0) {
    failures.push('Probe envelope must not use fixtureRoot for natural recent task evidence')
  }

  return failures
}

export function applySettingsIndexingDiagnosticsEnvelopeGate(
  result: SettingsIndexingDiagnosticsVerificationResult,
  envelope: Record<string, unknown> | undefined,
  options: {
    requireReadOnlyEnvelope?: boolean
    requireNaturalRecentTaskEvidence?: boolean
  }
): SettingsIndexingDiagnosticsVerificationResult {
  if (!options.requireReadOnlyEnvelope && !options.requireNaturalRecentTaskEvidence) {
    return result
  }

  result.options.requireReadOnlyEnvelope = true
  if (options.requireNaturalRecentTaskEvidence) {
    result.options.requireNaturalRecentTaskEvidence = true
    result.gate.failures.push(...verifyNaturalRecentTaskProbeEnvelope(envelope))
  } else {
    result.gate.failures.push(...verifyReadOnlyProbeEnvelope(envelope))
  }
  result.gate.passed = result.gate.failures.length === 0
  return result
}

function readSourceId(source: IndexedSourceDiagnostics): string {
  const descriptorId = source.descriptor?.id
  if (typeof descriptorId === 'string' && descriptorId.trim()) return descriptorId

  const legacySourceId = (source as Partial<{ sourceId: string }>).sourceId
  if (typeof legacySourceId === 'string' && legacySourceId.trim()) return legacySourceId
  return 'unknown'
}

function hasVisibleValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed !== '-'
}

function hasVisibleTaskBasics(chip: IndexingSourceRecentTaskChip): boolean {
  return (
    hasVisibleValue(chip.values.jobId) &&
    hasVisibleValue(chip.values.time) &&
    hasVisibleValue(chip.values.summary)
  )
}

function getAuditSummaryMarker(
  field: SettingsIndexingDiagnosticsAuditField,
  value: string | number
): string {
  if (field === 'errorCode') return `code ${value}`
  if (field === 'duration') return `duration ${value}ms`
  return `${field} ${value}`
}

function isAuditFieldVisible(
  chip: IndexingSourceRecentTaskChip,
  field: SettingsIndexingDiagnosticsAuditField
): boolean {
  const value = chip.values[field]
  if (!hasVisibleValue(value)) return false

  const summary = chip.values.summary
  if (typeof summary !== 'string' || !summary.trim()) return false
  return summary.includes(getAuditSummaryMarker(field, value))
}

function emptyAuditFieldMap(): Record<SettingsIndexingDiagnosticsAuditField, boolean> {
  return {
    duration: false,
    trigger: false,
    reason: false,
    attempt: false,
    errorCode: false
  }
}

function normalizeVerifierOptions(
  options: SettingsIndexingDiagnosticsVerifierOptions
): Required<SettingsIndexingDiagnosticsVerifierOptions> {
  return {
    sourceId: options.sourceId ?? '',
    minRecentTasks: options.minRecentTasks ?? 1,
    requiredAuditFields: options.requiredAuditFields ?? [...auditFields]
  }
}

function verifySource(
  source: IndexedSourceDiagnostics,
  options: Required<SettingsIndexingDiagnosticsVerifierOptions>
): SettingsIndexingDiagnosticsVerifiedSource {
  const chips = resolveIndexingSourceRecentTaskChips(source, Math.max(3, options.minRecentTasks))
  const visibleChips = chips.filter(hasVisibleTaskBasics)
  const visibleAuditFields = emptyAuditFieldMap()

  for (const field of options.requiredAuditFields) {
    visibleAuditFields[field] = visibleChips.some((chip) => isAuditFieldVisible(chip, field))
  }

  const missingAuditFields = options.requiredAuditFields.filter(
    (field) => !visibleAuditFields[field]
  )

  return {
    sourceId: readSourceId(source),
    recentTaskChipCount: chips.length,
    visibleRecentTaskChipCount: visibleChips.length,
    visibleAuditFields,
    missingAuditFields,
    sampleTaskLabelKeys: chips.slice(0, 3).map((chip) => chip.labelKey),
    sampleTaskTones: chips.slice(0, 3).map((chip) => chip.tone)
  }
}

export function verifySettingsIndexingDiagnosticsEvidence(
  sources: IndexedSourceDiagnostics[],
  rawOptions: SettingsIndexingDiagnosticsVerifierOptions = {}
): SettingsIndexingDiagnosticsVerificationResult {
  const options = normalizeVerifierOptions(rawOptions)
  const failures: string[] = []
  const selectedSources = options.sourceId
    ? sources.filter((source) => readSourceId(source) === options.sourceId)
    : sources

  if (sources.length === 0) {
    failures.push('No indexing source diagnostics found')
  }
  if (options.sourceId && selectedSources.length === 0) {
    failures.push(`No indexing source matched --sourceId ${options.sourceId}`)
  }

  const verifiedSources = selectedSources.map((source) => verifySource(source, options))
  const passingSources = verifiedSources.filter(
    (source) =>
      source.visibleRecentTaskChipCount >= options.minRecentTasks &&
      source.missingAuditFields.length === 0
  )

  if (options.sourceId) {
    for (const source of verifiedSources) {
      if (source.visibleRecentTaskChipCount < options.minRecentTasks) {
        failures.push(
          `Source ${source.sourceId} has ${source.visibleRecentTaskChipCount} visible recent task chips; expected at least ${options.minRecentTasks}`
        )
      }
      if (source.missingAuditFields.length > 0) {
        failures.push(
          `Source ${source.sourceId} is missing visible audit fields: ${source.missingAuditFields.join(', ')}`
        )
      }
    }
  }

  if (selectedSources.length > 0 && passingSources.length === 0) {
    failures.push('No source satisfied the Settings recent task audit evidence gate')
  }

  return {
    schema: SETTINGS_INDEXING_DIAGNOSTICS_EVIDENCE_SCHEMA,
    gate: {
      passed: failures.length === 0,
      failures
    },
    options: {
      ...(options.sourceId ? { sourceId: options.sourceId } : {}),
      minRecentTasks: options.minRecentTasks,
      requiredAuditFields: options.requiredAuditFields
    },
    summary: {
      sourceCount: sources.length,
      checkedSourceCount: verifiedSources.length,
      passingSourceCount: passingSources.length
    },
    sources: verifiedSources
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const evidence = parseSettingsIndexingDiagnosticsEvidenceEnvelope(await readInput(options))
  const result = verifySettingsIndexingDiagnosticsEvidence(evidence.sources, options)
  applySettingsIndexingDiagnosticsEnvelopeGate(result, evidence.envelope, options)
  console.log(JSON.stringify(result, null, options.pretty ? 2 : 0))

  if (!result.gate.passed) {
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
