#!/usr/bin/env tsx
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  WINDOWS_ACCEPTANCE_CASE_EVIDENCE_SCHEMA_BY_CASE_ID,
  WINDOWS_ACCEPTANCE_EVIDENCE_SCHEMA_DESCRIPTIONS,
  WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA,
  validateWindowsAcceptanceCaseEvidence,
  validateWindowsAcceptancePerformanceEvidence,
  verifyWindowsAcceptanceManifest
} from '../src/main/modules/platform/windows-acceptance-manifest-verifier'
import type {
  WindowsAcceptanceEvidenceSchemaKey,
  WindowsAcceptanceGateOptions,
  WindowsAcceptanceManifest,
  WindowsRequiredCaseId
} from '../src/main/modules/platform/windows-acceptance-manifest-verifier'

interface CliOptions extends WindowsAcceptanceGateOptions {
  input?: string
  requireExistingEvidenceFiles?: boolean
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

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run windows:acceptance:verify -- --input <manifest.json> [options]

Options:
  --input <path>                 Read Windows acceptance manifest JSON. Defaults to stdin.
  --strict                       Fail non-win32 manifests.
  --requireEvidencePath          Require evidence path for every required Windows case.
  --requireExistingEvidenceFiles Require case and performance evidence paths to exist on disk.
  --requireEvidenceGatePassed    Require case/performance evidence JSON files to contain gate.passed=true and known schemas.
  --requireCaseEvidenceSchemas   Require every required case to include all case-specific evidence schemas.
  --requireVerifierCommand       Require verifier command for every required Windows case.
  --requireVerifierCommandGateFlags
                                 Require verifier commands to include release gate flags.
  --requireRecommendedCommandGateFlags
                                 Require verification.recommendedCommand to include release gate flags.
  --requireRecommendedCommandInputMatch
                                 Require verification.recommendedCommand --input to match the current manifest path.
  --requireSearchTrace           Require search trace stats path and verifier command.
  --requireClipboardStress       Require clipboard stress summary path and verifier command.
  --requireCommonAppLaunchDetails
                                 Require each common app target to verify search/name/icon/launch/CoreBox hide.
  --requireCommonAppTargets <csv>
                                 Require launched app targets, e.g. WeChat,Codex,Apple Music.
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

async function findMissingEvidenceFiles(
  manifest: WindowsAcceptanceManifest,
  baseDir: string
): Promise<string[]> {
  const paths = manifest.cases.flatMap((testCase) =>
    (testCase.evidence ?? []).flatMap((item) => (item.path ? [item.path] : []))
  )
  if (manifest.performance?.searchTraceStatsPath) {
    paths.push(manifest.performance.searchTraceStatsPath)
  }
  if (manifest.performance?.clipboardStressSummaryPath) {
    paths.push(manifest.performance.clipboardStressSummaryPath)
  }
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
