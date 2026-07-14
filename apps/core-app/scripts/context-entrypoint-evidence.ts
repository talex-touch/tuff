#!/usr/bin/env tsx
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export const CONTEXT_ENTRYPOINT_EVIDENCE_SCHEMA = 'tuff.context-entrypoint-evidence.v1'

export type ContextEvidenceLevel = 'unit' | 'controlled' | 'packaged' | 'real-profile'
export type ContextEvidenceStatus = 'passed' | 'failed' | 'blocked' | 'open'
export type ContextEvidenceEntrypoint =
  | 'corebox'
  | 'workflow'
  | 'omni-panel'
  | 'assistant'
  | 'cross-entrypoint'

export interface ContextEntrypointEvidenceCase {
  id: string
  entrypoint: ContextEvidenceEntrypoint
  level: ContextEvidenceLevel
  status: ContextEvidenceStatus
  source: string
  timestamp: string
  buildVersion: string
  runtimeVersion: string
  expected: Record<string, unknown>
  observed: Record<string, unknown>
  redaction: {
    status: 'passed' | 'failed' | 'not-run'
    scanner: string
  }
  artifactPaths: string[]
}

export interface ContextEntrypointEvidenceManifest {
  schema: typeof CONTEXT_ENTRYPOINT_EVIDENCE_SCHEMA
  generatedAt: string
  cases: ContextEntrypointEvidenceCase[]
}

export interface ContextEntrypointEvidenceSummary {
  schema: typeof CONTEXT_ENTRYPOINT_EVIDENCE_SCHEMA
  caseCount: number
  passedCount: number
  statusByLevel: Record<ContextEvidenceLevel, Record<ContextEvidenceStatus, number>>
  packagedEntrypoints: ContextEvidenceEntrypoint[]
  privacyScan: 'passed'
}

const LEVELS: readonly ContextEvidenceLevel[] = ['unit', 'controlled', 'packaged', 'real-profile']
const FORBIDDEN_EVIDENCE_KEYS = new Set([
  'answer',
  'body',
  'content',
  'messages',
  'memory',
  'prompt',
  'response',
  'retrievalchunk',
  'turn'
])
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'credential-assignment',
    pattern: /(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*\S+/i
  },
  { name: 'bearer-token', pattern: /\bbearer\s+[a-z0-9._-]{8,}/i },
  { name: 'provider-token', pattern: /\b(?:sk|pk)[_-][a-z0-9_-]{12,}\b/i },
  { name: 'data-url', pattern: /data:(?:image|audio|video)\//i },
  { name: 'mac-home-path', pattern: /\/Users\/[^/\s]+/ },
  { name: 'linux-home-path', pattern: /\/home\/[^/\s]+/ },
  { name: 'windows-home-path', pattern: /[A-Za-z]:\\Users\\[^\\\s]+/ },
  { name: 'email-address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i }
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isEvidenceLevel(value: unknown): value is ContextEvidenceLevel {
  return (
    value === 'unit' || value === 'controlled' || value === 'packaged' || value === 'real-profile'
  )
}

function isEvidenceStatus(value: unknown): value is ContextEvidenceStatus {
  return value === 'passed' || value === 'failed' || value === 'blocked' || value === 'open'
}

function isEvidenceEntrypoint(value: unknown): value is ContextEvidenceEntrypoint {
  return (
    value === 'corebox' ||
    value === 'workflow' ||
    value === 'omni-panel' ||
    value === 'assistant' ||
    value === 'cross-entrypoint'
  )
}

function assertIsoTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO-compatible timestamp`)
  }
}

function assertSafeEvidenceValue(value: unknown, location: string): void {
  if (typeof value === 'string') {
    if (value.length > 512) {
      throw new Error(`${location} exceeds the 512-character evidence limit`)
    }
    for (const secret of SECRET_PATTERNS) {
      if (secret.pattern.test(value)) {
        throw new Error(`${location} contains forbidden ${secret.name} material`)
      }
    }
    return
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertSafeEvidenceValue(value[index], `${location}[${index}]`)
    }
    return
  }
  if (!isRecord(value)) return

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_KEYS.has(key.toLowerCase())) {
      throw new Error(`${location}.${key} is forbidden in metadata-only evidence`)
    }
    assertSafeEvidenceValue(nested, `${location}.${key}`)
  }
}

function assertEvidenceCase(
  value: unknown,
  index: number
): asserts value is ContextEntrypointEvidenceCase {
  if (!isRecord(value)) throw new Error(`cases[${index}] must be an object`)
  const location = `cases[${index}]`
  if (typeof value.id !== 'string' || !value.id.trim())
    throw new Error(`${location}.id is required`)
  if (!isEvidenceEntrypoint(value.entrypoint)) throw new Error(`${location}.entrypoint is invalid`)
  if (!isEvidenceLevel(value.level)) throw new Error(`${location}.level is invalid`)
  if (!isEvidenceStatus(value.status)) throw new Error(`${location}.status is invalid`)
  if (typeof value.source !== 'string' || !value.source.trim())
    throw new Error(`${location}.source is required`)
  assertIsoTimestamp(value.timestamp, `${location}.timestamp`)
  if (typeof value.buildVersion !== 'string' || !value.buildVersion.trim()) {
    throw new Error(`${location}.buildVersion is required`)
  }
  if (typeof value.runtimeVersion !== 'string' || !value.runtimeVersion.trim()) {
    throw new Error(`${location}.runtimeVersion is required`)
  }
  if (!isRecord(value.expected) || !isRecord(value.observed)) {
    throw new Error(`${location}.expected and observed must be metadata objects`)
  }
  if (!isRecord(value.redaction)) throw new Error(`${location}.redaction is required`)
  if (
    value.redaction.status !== 'passed' &&
    value.redaction.status !== 'failed' &&
    value.redaction.status !== 'not-run'
  ) {
    throw new Error(`${location}.redaction.status is invalid`)
  }
  if (typeof value.redaction.scanner !== 'string' || !value.redaction.scanner.trim()) {
    throw new Error(`${location}.redaction.scanner is required`)
  }
  if (!isStringArray(value.artifactPaths)) throw new Error(`${location}.artifactPaths is invalid`)

  if (value.status === 'passed') {
    if (value.redaction.status !== 'passed') {
      throw new Error(`${location} cannot pass without a passed redaction scan`)
    }
    if (value.artifactPaths.length === 0) {
      throw new Error(`${location} cannot pass without an artifact path`)
    }
  }
  if (
    value.level === 'packaged' &&
    value.status === 'passed' &&
    value.source !== 'packaged-electron'
  ) {
    throw new Error(`${location} packaged evidence must come from packaged-electron`)
  }
  if (
    value.level === 'real-profile' &&
    value.status === 'passed' &&
    value.source !== 'real-profile'
  ) {
    throw new Error(`${location} real-profile evidence must come from real-profile`)
  }

  assertSafeEvidenceValue(value.expected, `${location}.expected`)
  assertSafeEvidenceValue(value.observed, `${location}.observed`)
  assertSafeEvidenceValue(value.artifactPaths, `${location}.artifactPaths`)
}

function parseManifest(value: unknown): ContextEntrypointEvidenceManifest {
  if (!isRecord(value)) throw new Error('Evidence manifest must be an object')
  if (value.schema !== CONTEXT_ENTRYPOINT_EVIDENCE_SCHEMA) {
    throw new Error(`Unsupported evidence schema: ${String(value.schema)}`)
  }
  assertIsoTimestamp(value.generatedAt, 'generatedAt')
  if (!Array.isArray(value.cases)) throw new Error('Evidence manifest cases must be an array')
  value.cases.forEach(assertEvidenceCase)
  return {
    schema: CONTEXT_ENTRYPOINT_EVIDENCE_SCHEMA,
    generatedAt: value.generatedAt,
    cases: value.cases
  }
}

function resolveArtifactPath(rootDir: string, artifactPath: string): string {
  if (!artifactPath || path.isAbsolute(artifactPath)) {
    throw new Error(`Artifact path must be repository-relative: ${artifactPath}`)
  }
  const normalized = path.normalize(artifactPath)
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`Artifact path escapes the repository: ${artifactPath}`)
  }
  return path.join(rootDir, normalized)
}

function emptyStatusCounts(): Record<ContextEvidenceStatus, number> {
  return { passed: 0, failed: 0, blocked: 0, open: 0 }
}

async function scanEvidenceArtifact(rootDir: string, artifactPath: string): Promise<void> {
  const resolvedPath = resolveArtifactPath(rootDir, artifactPath)
  if (path.extname(resolvedPath).toLowerCase() !== '.json') {
    throw new Error(`Evidence artifacts must be metadata-only JSON: ${artifactPath}`)
  }
  await access(resolvedPath)
  const raw = await readFile(resolvedPath, 'utf8')
  if (raw.length > 256_000) {
    throw new Error(`Evidence artifact exceeds 256 KB: ${artifactPath}`)
  }
  const parsed: unknown = JSON.parse(raw)
  assertSafeEvidenceValue(parsed, `artifact:${artifactPath}`)
}

export async function verifyContextEntrypointEvidence(
  rawManifest: unknown,
  rootDir: string
): Promise<ContextEntrypointEvidenceSummary> {
  const manifest = parseManifest(rawManifest)
  const ids = new Set<string>()
  const statusByLevel: Record<ContextEvidenceLevel, Record<ContextEvidenceStatus, number>> = {
    unit: emptyStatusCounts(),
    controlled: emptyStatusCounts(),
    packaged: emptyStatusCounts(),
    'real-profile': emptyStatusCounts()
  }

  for (const evidenceCase of manifest.cases) {
    if (ids.has(evidenceCase.id)) throw new Error(`Duplicate evidence case id: ${evidenceCase.id}`)
    ids.add(evidenceCase.id)
    statusByLevel[evidenceCase.level][evidenceCase.status] += 1
    if (evidenceCase.status !== 'passed') continue
    for (const artifactPath of evidenceCase.artifactPaths) {
      await scanEvidenceArtifact(rootDir, artifactPath)
    }
  }

  for (const level of LEVELS) {
    const total = Object.values(statusByLevel[level]).reduce((sum, count) => sum + count, 0)
    if (total === 0) throw new Error(`Evidence manifest is missing level: ${level}`)
  }
  for (const level of ['unit', 'controlled', 'packaged'] as const) {
    if (statusByLevel[level].passed === 0) {
      throw new Error(`Evidence manifest requires a passed ${level} case`)
    }
  }

  const packagedEntrypoints = Array.from(
    new Set(
      manifest.cases
        .filter((item) => item.level === 'packaged' && item.status === 'passed')
        .map((item) => item.entrypoint)
    )
  )
  if (!packagedEntrypoints.includes('corebox')) {
    throw new Error('Packaged evidence must include the CoreBox baseline')
  }
  if (!packagedEntrypoints.some((entrypoint) => entrypoint !== 'corebox')) {
    throw new Error('Packaged evidence must include at least one non-CoreBox entrypoint')
  }

  return {
    schema: CONTEXT_ENTRYPOINT_EVIDENCE_SCHEMA,
    caseCount: manifest.cases.length,
    passedCount: manifest.cases.filter((item) => item.status === 'passed').length,
    statusByLevel,
    packagedEntrypoints,
    privacyScan: 'passed'
  }
}

async function main(): Promise<void> {
  const inputIndex = process.argv.indexOf('--input')
  const rootIndex = process.argv.indexOf('--root')
  if (inputIndex < 0 || !process.argv[inputIndex + 1]) {
    throw new Error(
      'Usage: context-entrypoint-evidence.ts --input <manifest.json> [--root <repo-root>]'
    )
  }
  const rootDir = path.resolve(
    rootIndex >= 0 && process.argv[rootIndex + 1] ? process.argv[rootIndex + 1] : '../..'
  )
  const inputPath = path.resolve(process.argv[inputIndex + 1])
  const raw: unknown = JSON.parse(await readFile(inputPath, 'utf8'))
  const summary = await verifyContextEntrypointEvidence(raw, rootDir)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
