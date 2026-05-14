#!/usr/bin/env tsx
import { access, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  WINDOWS_ACCEPTANCE_CASE_EVIDENCE_SCHEMA_BY_CASE_ID,
  WINDOWS_ACCEPTANCE_EVIDENCE_SCHEMA_DESCRIPTIONS,
  WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA,
  validateWindowsAcceptanceCaseEvidence,
  validateWindowsAcceptancePerformanceEvidence,
  verifyWindowsAcceptanceManifest
} from '../src/main/modules/platform/windows-acceptance-manifest-verifier'
import { WINDOWS_ACCEPTANCE_MANUAL_EVIDENCE_LABELS } from './windows-acceptance-manual-evidence'
import type {
  WindowsAcceptanceEvidenceSchemaKey,
  WindowsAcceptanceGateOptions,
  WindowsAcceptanceManifest,
  WindowsRequiredCaseId
} from '../src/main/modules/platform/windows-acceptance-manifest-verifier'

interface CliOptions extends WindowsAcceptanceGateOptions {
  input?: string
  requireExistingEvidenceFiles?: boolean
  requireNonEmptyEvidenceFiles?: boolean
  requireCompletedManualEvidence?: boolean
  requireEvidenceGatePassed?: boolean
  requireCaseEvidenceSchemas?: boolean
  requireRecommendedCommandInputMatch?: boolean
  pretty: boolean
}

interface ParsedGateEvidence {
  gate?: {
    passed?: unknown
  }
}

interface EvidenceSchemaMismatch {
  caseId: string
  path: string
}

interface CaseSchemaCoverage {
  caseId: string
  foundSchemas: Set<WindowsAcceptanceEvidenceSchemaKey>
}

interface PerformanceEvidenceEntry {
  path: string
  expectedSchemaKey: 'search-trace-stats' | 'clipboard-stress-summary'
}

interface EvidenceGateFailure {
  path: string
  reasons: string[]
}

interface ManualEvidenceRequirement {
  path: string
  requiredEvidenceLabels: string[]
}

interface ManualEvidenceCompletionResult {
  complete: boolean
  failures: string[]
}

interface ManualEvidenceCompletionFailure {
  path: string
  failures: string[]
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run windows:acceptance:verify -- --input <manifest.json> [options]

Options:
  --input <path>                 Read Windows acceptance manifest JSON. Defaults to stdin.
  --strict                       Fail non-win32 manifests.
  --requireEvidencePath          Require evidence path for every required Windows case.
  --requireExistingEvidenceFiles Require case, performance, and manual evidence files to exist on disk.
  --requireNonEmptyEvidenceFiles Require case, performance, and manual evidence paths to be non-empty files.
  --requireCompletedManualEvidence
                                 Require manual evidence Markdown checklists to be checked and evidence fields to be filled.
  --requireEvidenceGatePassed    Require case/performance evidence JSON files to contain gate.passed=true and known schemas.
  --requireCaseEvidenceSchemas   Require every required case to include all case-specific evidence schemas.
  --requireVerifierCommand       Require verifier command for every required Windows case.
  --requireVerifierCommandGateFlags
                                 Require case verifier commands and performance sampling/verifier commands to include release gate flags.
  --requireRecommendedCommandGateFlags
                                 Require verification.recommendedCommand to include release gate flags.
  --requireRecommendedCommandInputMatch
                                 Require verification.recommendedCommand --input to match the current manifest path.
  --requireSearchTrace           Require search trace stats path and verifier command.
  --requireClipboardStress       Require clipboard stress summary path and verifier command.
  --requireCommonAppLaunchDetails
                                 Require each common app target to verify search/name/icon/launch/CoreBox hide.
  --requireCopiedAppPathManualChecks
                                 Require copied app path add-to-local-launch-area/index manual checks.
  --requireUpdateInstallManualChecks
                                 Require Windows update UAC/installer exit/relaunch/rollback manual checks.
  --requireDivisionBoxDetachedWidgetManualChecks
                                 Require DivisionBox detached widget restore manual checks.
  --requireTimeAwareRecommendationManualChecks
                                 Require time-aware recommendation manual checks.
  --requireCommonAppTargets <csv>
                                 Require launched app targets, e.g. ChatApp,Codex,Apple Music.
  --compact                      Print single-line JSON.
  --help                         Show this help.
`)
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  const entries = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return entries.length > 0 ? Array.from(new Set(entries)) : undefined
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    pretty: true
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue

    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--input' && argv[i + 1]) {
      options.input = argv[++i]
      continue
    }
    if (arg === '--strict') {
      options.strict = true
      continue
    }
    if (arg === '--requireEvidencePath') {
      options.requireEvidencePath = true
      continue
    }
    if (arg === '--requireExistingEvidenceFiles') {
      options.requireExistingEvidenceFiles = true
      options.requireEvidencePath = true
      continue
    }
    if (arg === '--requireNonEmptyEvidenceFiles') {
      options.requireNonEmptyEvidenceFiles = true
      options.requireExistingEvidenceFiles = true
      options.requireEvidencePath = true
      continue
    }
    if (arg === '--requireCompletedManualEvidence') {
      options.requireCompletedManualEvidence = true
      options.requireNonEmptyEvidenceFiles = true
      options.requireExistingEvidenceFiles = true
      options.requireEvidencePath = true
      continue
    }
    if (arg === '--requireEvidenceGatePassed') {
      options.requireEvidenceGatePassed = true
      options.requireExistingEvidenceFiles = true
      options.requireEvidencePath = true
      continue
    }
    if (arg === '--requireCaseEvidenceSchemas') {
      options.requireCaseEvidenceSchemas = true
      options.requireEvidenceGatePassed = true
      options.requireExistingEvidenceFiles = true
      options.requireEvidencePath = true
      continue
    }
    if (arg === '--requireVerifierCommand') {
      options.requireVerifierCommand = true
      continue
    }
    if (arg === '--requireVerifierCommandGateFlags') {
      options.requireVerifierCommandGateFlags = true
      options.requireVerifierCommand = true
      continue
    }
    if (arg === '--requireRecommendedCommandGateFlags') {
      options.requireRecommendedCommandGateFlags = true
      continue
    }
    if (arg === '--requireRecommendedCommandInputMatch') {
      options.requireRecommendedCommandInputMatch = true
      options.requireRecommendedCommandGateFlags = true
      continue
    }
    if (arg === '--requireSearchTrace') {
      options.requireSearchTrace = true
      continue
    }
    if (arg === '--requireClipboardStress') {
      options.requireClipboardStress = true
      continue
    }
    if (arg === '--requireCommonAppLaunchDetails') {
      options.requireCommonAppLaunchDetails = true
      continue
    }
    if (arg === '--requireCopiedAppPathManualChecks') {
      options.requireCopiedAppPathManualChecks = true
      continue
    }
    if (arg === '--requireUpdateInstallManualChecks') {
      options.requireUpdateInstallManualChecks = true
      continue
    }
    if (arg === '--requireDivisionBoxDetachedWidgetManualChecks') {
      options.requireDivisionBoxDetachedWidgetManualChecks = true
      continue
    }
    if (arg === '--requireTimeAwareRecommendationManualChecks') {
      options.requireTimeAwareRecommendationManualChecks = true
      continue
    }
    if (arg === '--requireCommonAppTargets' && argv[i + 1]) {
      options.requireCommonAppTargets = parseCsv(argv[++i])
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
  if (options.input) {
    return readFile(options.input, 'utf8')
  }
  return readStdin()
}

function parseManifest(raw: string): WindowsAcceptanceManifest {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Windows acceptance manifest JSON must be an object')
  }

  const manifest = parsed as Partial<WindowsAcceptanceManifest>
  if (manifest.schema !== WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA) {
    throw new Error(`Unsupported Windows acceptance manifest schema: ${String(manifest.schema)}`)
  }
  if (!Array.isArray(manifest.cases) || typeof manifest.platform !== 'string') {
    throw new Error('Windows acceptance manifest JSON is missing required fields')
  }

  return manifest as WindowsAcceptanceManifest
}

function resolveEvidenceBaseDir(options: CliOptions): string {
  return options.input ? path.dirname(path.resolve(options.input)) : process.cwd()
}

function resolveEvidencePath(evidencePath: string, baseDir: string): string {
  return path.isAbsolute(evidencePath) ? evidencePath : path.resolve(baseDir, evidencePath)
}

function normalizeCommandInputPath(inputPath: string, baseDir: string): string {
  const unquoted = inputPath.replace(/^['"]|['"]$/g, '')
  return path.resolve(path.isAbsolute(unquoted) ? unquoted : path.resolve(baseDir, unquoted))
}

function extractCommandInputPath(command: string): string | null {
  const match = command.match(/(?:^|\s)--input(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/)
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null
}

function validateRecommendedCommandInputPath(
  manifest: WindowsAcceptanceManifest,
  options: CliOptions
): string[] {
  if (!options.requireRecommendedCommandInputMatch) return []

  if (!options.input) {
    return ['Windows acceptance recommended command input match requires --input']
  }

  const recommendedCommand = manifest.verification?.recommendedCommand
  if (!recommendedCommand) {
    return ['Windows acceptance recommended command is missing']
  }

  const commandInput = extractCommandInputPath(recommendedCommand)
  if (!commandInput) {
    return ['Windows acceptance recommended command --input is missing']
  }

  const expectedPath = path.resolve(options.input)
  const actualPath = normalizeCommandInputPath(commandInput, resolveEvidenceBaseDir(options))
  return actualPath === expectedPath
    ? []
    : [
        `Windows acceptance recommended command --input mismatch: expected ${expectedPath}, got ${actualPath}`
      ]
}

function formatCaseEvidenceSchemaExpectation(caseId: string): string {
  const schemas =
    WINDOWS_ACCEPTANCE_CASE_EVIDENCE_SCHEMA_BY_CASE_ID[caseId as WindowsRequiredCaseId]
  return (schemas ?? [])
    .map((schema) => WINDOWS_ACCEPTANCE_EVIDENCE_SCHEMA_DESCRIPTIONS[schema])
    .join(', ')
}

function isPerformanceEvidenceEntry(
  entry: Omit<PerformanceEvidenceEntry, 'path'> & { path?: string }
): entry is PerformanceEvidenceEntry {
  return Boolean(entry.path)
}

function appendGateFailure(failures: EvidenceGateFailure[], path: string, reasons: string[]): void {
  failures.push({ path, reasons: reasons.length > 0 ? reasons : ['unknown gate failure'] })
}

function formatGateFailure(path: string, reasons: string[]): string {
  return `${path} (${reasons.join('; ')})`
}

async function readEvidenceJson(
  evidencePath: string,
  baseDir: string
): Promise<ParsedGateEvidence> {
  const raw = await readFile(resolveEvidencePath(evidencePath, baseDir), 'utf8')
  return JSON.parse(raw) as ParsedGateEvidence
}

function collectEvidencePaths(manifest: WindowsAcceptanceManifest): string[] {
  const paths = manifest.cases.flatMap((testCase) =>
    (testCase.evidence ?? []).flatMap((item) => (item.path ? [item.path] : []))
  )
  if (manifest.performance?.searchTraceStatsPath) {
    paths.push(manifest.performance.searchTraceStatsPath)
  }
  if (manifest.performance?.clipboardStressSummaryPath) {
    paths.push(manifest.performance.clipboardStressSummaryPath)
  }
  for (const check of manifest.manualChecks?.commonAppLaunch?.checks ?? []) {
    if (check.evidencePath) {
      paths.push(check.evidencePath)
    }
  }
  if (manifest.manualChecks?.copiedAppPath?.evidencePath) {
    paths.push(manifest.manualChecks.copiedAppPath.evidencePath)
  }
  if (manifest.manualChecks?.updateInstall?.evidencePath) {
    paths.push(manifest.manualChecks.updateInstall.evidencePath)
  }
  if (manifest.manualChecks?.divisionBoxDetachedWidget?.evidencePath) {
    paths.push(manifest.manualChecks.divisionBoxDetachedWidget.evidencePath)
  }
  if (manifest.manualChecks?.timeAwareRecommendation?.evidencePath) {
    paths.push(manifest.manualChecks.timeAwareRecommendation.evidencePath)
  }

  return paths
}

function appendManualEvidenceRequirement(
  requirements: ManualEvidenceRequirement[],
  path: string | undefined,
  requiredEvidenceLabels: string[]
): void {
  if (!path) return

  const existing = requirements.find((requirement) => requirement.path === path)
  if (existing) {
    existing.requiredEvidenceLabels = Array.from(
      new Set([...existing.requiredEvidenceLabels, ...requiredEvidenceLabels])
    )
    return
  }

  requirements.push({ path, requiredEvidenceLabels })
}

function collectManualEvidenceRequirements(
  manifest: WindowsAcceptanceManifest
): ManualEvidenceRequirement[] {
  const requirements: ManualEvidenceRequirement[] = []

  for (const check of manifest.manualChecks?.commonAppLaunch?.checks ?? []) {
    appendManualEvidenceRequirement(requirements, check.evidencePath, [
      ...WINDOWS_ACCEPTANCE_MANUAL_EVIDENCE_LABELS.commonAppLaunch
    ])
  }
  appendManualEvidenceRequirement(
    requirements,
    manifest.manualChecks?.copiedAppPath?.evidencePath,
    [...WINDOWS_ACCEPTANCE_MANUAL_EVIDENCE_LABELS.copiedAppPath]
  )
  appendManualEvidenceRequirement(
    requirements,
    manifest.manualChecks?.updateInstall?.evidencePath,
    [...WINDOWS_ACCEPTANCE_MANUAL_EVIDENCE_LABELS.updateInstall]
  )
  appendManualEvidenceRequirement(
    requirements,
    manifest.manualChecks?.divisionBoxDetachedWidget?.evidencePath,
    [...WINDOWS_ACCEPTANCE_MANUAL_EVIDENCE_LABELS.divisionBoxDetachedWidget]
  )
  appendManualEvidenceRequirement(
    requirements,
    manifest.manualChecks?.timeAwareRecommendation?.evidencePath,
    [...WINDOWS_ACCEPTANCE_MANUAL_EVIDENCE_LABELS.timeAwareRecommendation]
  )

  return requirements
}

async function findMissingEvidenceFiles(
  manifest: WindowsAcceptanceManifest,
  baseDir: string
): Promise<string[]> {
  const paths = collectEvidencePaths(manifest)
  const missing: string[] = []

  for (const evidencePath of Array.from(new Set(paths))) {
    const resolvedPath = resolveEvidencePath(evidencePath, baseDir)
    try {
      await access(resolvedPath)
    } catch {
      missing.push(evidencePath)
    }
  }

  return missing
}

async function findEmptyEvidenceFiles(
  manifest: WindowsAcceptanceManifest,
  baseDir: string,
  missingEvidencePaths = new Set<string>()
): Promise<string[]> {
  const paths = collectEvidencePaths(manifest).filter(
    (evidencePath) => !missingEvidencePaths.has(evidencePath)
  )
  const empty: string[] = []

  for (const evidencePath of Array.from(new Set(paths))) {
    const resolvedPath = resolveEvidencePath(evidencePath, baseDir)
    const evidenceStat = await stat(resolvedPath)
    if (!evidenceStat.isFile() || evidenceStat.size === 0) {
      empty.push(evidencePath)
    }
  }

  return empty
}

async function findIncompleteManualEvidenceFiles(
  manifest: WindowsAcceptanceManifest,
  baseDir: string,
  missingEvidencePaths = new Set<string>()
): Promise<ManualEvidenceCompletionFailure[]> {
  const incomplete: ManualEvidenceCompletionFailure[] = []

  for (const requirement of collectManualEvidenceRequirements(manifest)) {
    const evidencePath = requirement.path
    if (missingEvidencePaths.has(evidencePath)) continue

    const raw = await readFile(resolveEvidencePath(evidencePath, baseDir), 'utf8')
    const result = evaluateManualEvidenceCompletion(raw, requirement.requiredEvidenceLabels)
    if (!result.complete) {
      incomplete.push({ path: evidencePath, failures: result.failures })
    }
  }

  return incomplete
}

export function isManualEvidenceComplete(
  raw: string,
  requiredEvidenceLabels: string[] = []
): boolean {
  return evaluateManualEvidenceCompletion(raw, requiredEvidenceLabels).complete
}

export function evaluateManualEvidenceCompletion(
  raw: string,
  requiredEvidenceLabels: string[] = []
): ManualEvidenceCompletionResult {
  const failures: string[] = []
  const checklistFailures = findChecklistCompletionFailures(raw)
  if (checklistFailures.length > 0) {
    failures.push(...checklistFailures)
  }

  const missingEvidenceLabels = findMissingEvidenceLabels(raw, requiredEvidenceLabels)
  if (missingEvidenceLabels.length > 0) {
    failures.push(`missing evidence fields: ${missingEvidenceLabels.join(', ')}`)
  }

  return { complete: failures.length === 0, failures }
}

function findChecklistCompletionFailures(raw: string): string[] {
  const checklistLines = raw.split(/\r?\n/).filter((line) => /^-\s+\[[ xX]\]\s+/.test(line))
  if (checklistLines.length === 0) return ['missing completed checklist']

  const incompleteCount = checklistLines.filter((line) => !/^-\s+\[[xX]\]\s+/.test(line)).length
  return incompleteCount > 0 ? [`unchecked checklist items: ${incompleteCount}`] : []
}

function findMissingEvidenceLabels(raw: string, requiredEvidenceLabels: string[]): string[] {
  const filledLabels = collectFilledEvidenceLabels(raw)

  if (requiredEvidenceLabels.length === 0) {
    return filledLabels.size > 0 ? [] : ['non-notes evidence value']
  }

  return requiredEvidenceLabels.filter((label) => !filledLabels.has(normalizeEvidenceLabel(label)))
}

function collectFilledEvidenceLabels(raw: string): Set<string> {
  const evidenceLines = extractEvidenceSectionLines(raw)
  const labels = new Set<string>()

  for (const line of evidenceLines) {
    const match = line.match(/^-\s+([^:]+):\s*(.+)$/)
    if (!match) continue

    const label = match[1].trim().toLowerCase()
    const value = match[2].trim()
    if (label !== 'notes' && value.length > 0 && !isPlaceholderEvidenceValue(value)) {
      labels.add(normalizeEvidenceLabel(label))
    }
  }

  return labels
}

function normalizeEvidenceLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

function extractEvidenceSectionLines(raw: string): string[] {
  const lines = raw.split(/\r?\n/)
  const evidenceLines: string[] = []
  let inEvidenceSection = false

  for (const line of lines) {
    if (/^##\s+Evidence\b/i.test(line)) {
      inEvidenceSection = true
      continue
    }
    if (inEvidenceSection && /^##\s+/.test(line)) break
    if (inEvidenceSection) evidenceLines.push(line)
  }

  return evidenceLines
}

function isPlaceholderEvidenceValue(value: string): boolean {
  const trimmed = value.trim()
  if (/^<[^<>]+>$/.test(trimmed)) return true
  return /^(n\/a|na|none|todo|tbd|-|待补|无)$/i.test(trimmed)
}

async function findFailedEvidenceGates(
  manifest: WindowsAcceptanceManifest,
  baseDir: string,
  missingEvidencePaths = new Set<string>()
): Promise<{
  failedGates: EvidenceGateFailure[]
  schemaMismatches: EvidenceSchemaMismatch[]
  coverage: CaseSchemaCoverage[]
}> {
  const evidenceEntries = manifest.cases.flatMap((testCase) =>
    (testCase.evidence ?? []).flatMap((item) =>
      item.path ? [{ caseId: testCase.caseId, path: item.path }] : []
    )
  )
  const failedGates: EvidenceGateFailure[] = []
  const schemaMismatches: EvidenceSchemaMismatch[] = []
  const coverage = new Map<string, Set<WindowsAcceptanceEvidenceSchemaKey>>()
  const scanned = new Set<string>()

  for (const entry of evidenceEntries) {
    const scanKey = `${entry.caseId}:${entry.path}`
    if (scanned.has(scanKey)) continue
    scanned.add(scanKey)
    if (missingEvidencePaths.has(entry.path)) continue

    try {
      const evidence = await readEvidenceJson(entry.path, baseDir)
      const result = validateWindowsAcceptanceCaseEvidence(entry.caseId, evidence)
      if (result.gateFailures.length > 0) {
        appendGateFailure(failedGates, entry.path, result.gateFailures)
      }
      if (result.schemaMismatch) {
        schemaMismatches.push({ caseId: entry.caseId, path: entry.path })
      } else if (result.schemaKey) {
        const caseCoverage =
          coverage.get(entry.caseId) ?? new Set<WindowsAcceptanceEvidenceSchemaKey>()
        caseCoverage.add(result.schemaKey)
        coverage.set(entry.caseId, caseCoverage)
      }
    } catch (error) {
      appendGateFailure(failedGates, entry.path, [
        error instanceof Error ? error.message : String(error)
      ])
      schemaMismatches.push({ caseId: entry.caseId, path: entry.path })
    }
  }

  return {
    failedGates,
    schemaMismatches,
    coverage: [...coverage.entries()].map(([caseId, foundSchemas]) => ({
      caseId,
      foundSchemas
    }))
  }
}

function findMissingRequiredCaseEvidenceSchemas(coverage: CaseSchemaCoverage[]): string[] {
  const coverageByCaseId = new Map(coverage.map((entry) => [entry.caseId, entry.foundSchemas]))
  const failures: string[] = []

  for (const [caseId, requiredSchemas] of Object.entries(
    WINDOWS_ACCEPTANCE_CASE_EVIDENCE_SCHEMA_BY_CASE_ID
  )) {
    const foundSchemas = coverageByCaseId.get(caseId)
    if (!foundSchemas) continue

    const missingSchemas = requiredSchemas.filter((schema) => !foundSchemas.has(schema))
    if (missingSchemas.length > 0) {
      failures.push(
        `Windows acceptance required evidence schema missing: ${caseId} (${missingSchemas
          .map((schema) => WINDOWS_ACCEPTANCE_EVIDENCE_SCHEMA_DESCRIPTIONS[schema])
          .join(', ')})`
      )
    }
  }

  return failures
}

async function findFailedPerformanceGates(
  manifest: WindowsAcceptanceManifest,
  baseDir: string,
  missingEvidencePaths = new Set<string>()
): Promise<{ failedGates: EvidenceGateFailure[]; schemaMismatches: string[] }> {
  const evidenceEntries = [
    {
      path: manifest.performance?.searchTraceStatsPath,
      expectedSchemaKey: 'search-trace-stats' as const
    },
    {
      path: manifest.performance?.clipboardStressSummaryPath,
      expectedSchemaKey: 'clipboard-stress-summary' as const
    }
  ].filter(isPerformanceEvidenceEntry)
  const failedGates: EvidenceGateFailure[] = []
  const schemaMismatches: string[] = []

  for (const entry of evidenceEntries) {
    if (missingEvidencePaths.has(entry.path)) continue
    try {
      const evidence = await readEvidenceJson(entry.path, baseDir)
      const result = validateWindowsAcceptancePerformanceEvidence(entry.expectedSchemaKey, evidence)
      if (result.gateFailures.length > 0) {
        appendGateFailure(failedGates, entry.path, result.gateFailures)
      }
      if (result.schemaMismatch) schemaMismatches.push(entry.path)
    } catch (error) {
      appendGateFailure(failedGates, entry.path, [
        error instanceof Error ? error.message : String(error)
      ])
      schemaMismatches.push(entry.path)
    }
  }

  return { failedGates, schemaMismatches }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const manifest = parseManifest(await readInput(options))
  const verified = verifyWindowsAcceptanceManifest(manifest, options)
  verified.gate.failures.push(...validateRecommendedCommandInputPath(manifest, options))
  verified.gate.passed = verified.gate.failures.length === 0

  if (options.requireExistingEvidenceFiles) {
    const baseDir = resolveEvidenceBaseDir(options)
    const missing = await findMissingEvidenceFiles(manifest, baseDir)
    const missingEvidencePaths = new Set(missing)
    for (const evidencePath of missing) {
      verified.gate.failures.push(`Windows acceptance evidence file is missing: ${evidencePath}`)
    }
    verified.gate.passed = verified.gate.failures.length === 0

    if (options.requireNonEmptyEvidenceFiles) {
      const empty = await findEmptyEvidenceFiles(manifest, baseDir, missingEvidencePaths)
      for (const evidencePath of empty) {
        verified.gate.failures.push(`Windows acceptance evidence file is empty: ${evidencePath}`)
      }
      verified.gate.passed = verified.gate.failures.length === 0
    }

    if (options.requireCompletedManualEvidence) {
      const incomplete = await findIncompleteManualEvidenceFiles(
        manifest,
        baseDir,
        missingEvidencePaths
      )
      for (const failure of incomplete) {
        verified.gate.failures.push(
          `Windows acceptance manual evidence checklist or fields are incomplete: ${formatGateFailure(
            failure.path,
            failure.failures
          )}`
        )
      }
      verified.gate.passed = verified.gate.failures.length === 0
    }

    if (options.requireEvidenceGatePassed) {
      const { failedGates, schemaMismatches, coverage } = await findFailedEvidenceGates(
        manifest,
        baseDir,
        missingEvidencePaths
      )
      for (const failure of failedGates) {
        verified.gate.failures.push(
          `Windows acceptance evidence gate did not pass: ${formatGateFailure(
            failure.path,
            failure.reasons
          )}`
        )
      }
      for (const mismatch of schemaMismatches) {
        verified.gate.failures.push(
          `Windows acceptance evidence schema mismatch: ${mismatch.caseId}:${mismatch.path} (expected ${formatCaseEvidenceSchemaExpectation(mismatch.caseId)})`
        )
      }
      const { failedGates: failedPerformanceGates, schemaMismatches: performanceSchemaMismatches } =
        await findFailedPerformanceGates(manifest, baseDir, missingEvidencePaths)
      for (const failure of failedPerformanceGates) {
        verified.gate.failures.push(
          `Windows acceptance performance gate did not pass: ${formatGateFailure(
            failure.path,
            failure.reasons
          )}`
        )
      }
      for (const evidencePath of performanceSchemaMismatches) {
        verified.gate.failures.push(
          `Windows acceptance performance schema mismatch: ${evidencePath}`
        )
      }
      if (options.requireCaseEvidenceSchemas) {
        verified.gate.failures.push(...findMissingRequiredCaseEvidenceSchemas(coverage))
      }
      verified.gate.passed = verified.gate.failures.length === 0
    }
  }

  console.log(JSON.stringify(verified, null, options.pretty ? 2 : 0))

  if (!verified.gate.passed) {
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
