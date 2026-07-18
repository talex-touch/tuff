import type {
  LegacyAliasFamily,
  RemovedLegacyAlias,
} from '../packages/utils/transport/events/legacy-alias-tombstones.ts'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tombstoneModule from '../packages/utils/transport/events/legacy-alias-tombstones.ts'

const { REMOVED_LEGACY_ALIASES } = tombstoneModule as unknown as {
  REMOVED_LEGACY_ALIASES: readonly RemovedLegacyAlias[]
}

const SCHEMA_VERSION = 'legacy-alias-evidence/v1' as const
const EXPECTED_ALIAS_COUNT = 71
const EXPECTED_FAMILY_COUNTS: Readonly<Record<LegacyAliasFamily, number>> = {
  'core-box': 40,
  'auth': 14,
  'account': 4,
  'sync': 3,
  'terminal': 5,
  'opener': 5,
}
const SOURCE_ROOTS = [
  'apps/core-app/src',
  'packages/utils',
  'plugins',
] as const
const SOURCE_EXTENSIONS: Readonly<Record<string, true>> = {
  '.ts': true,
  '.tsx': true,
  '.js': true,
  '.jsx': true,
  '.vue': true,
}
const IGNORED_DIRECTORIES: Readonly<Record<string, true>> = {
  coverage: true,
  dist: true,
  docs: true,
  node_modules: true,
}
const TEST_FIXTURE_DIRECTORIES: Readonly<Record<string, true>> = {
  __tests__: true,
  fixtures: true,
  test: true,
  tests: true,
}
const TOMBSTONE_SOURCE = 'packages/utils/transport/events/legacy-alias-tombstones.ts'
const RETIRED_SYMBOL_PATTERN
  = /CoreBoxRetainedEvents|(?:Auth|Account|Sync|Terminal|Opener)Events\.legacy\.|withLegacyAliasTelemetry|recordLegacyAliasHit|core-box-retained/g
const FORBIDDEN_EVIDENCE_KEYS: Readonly<Record<string, true>> = {
  payload: true,
  data: true,
  userInput: true,
  token: true,
  deviceId: true,
  absolutePath: true,
  filePath: true,
}

interface SourceAuditHit {
  detector: 'legacy-event-literal' | 'retired-symbol'
  eventName?: string
  relativeFile: string
  line: number
}

interface SourceAudit {
  roots: readonly string[]
  scannedProductionFiles: number
  scannedTestFixtureFiles: number
  productionHits: SourceAuditHit[]
  testFixtureHits: SourceAuditHit[]
}

interface LegacyAliasEvidenceEntry extends RemovedLegacyAlias {
  sourceHits: {
    production: number
    testFixture: number
  }
}

interface LegacyAliasEvidence {
  schemaVersion: typeof SCHEMA_VERSION
  generatedAt: string
  repository: {
    version: string
    revision: string
  }
  registry: {
    aliasCount: number
    familyCounts: Record<LegacyAliasFamily, number>
  }
  aliases: LegacyAliasEvidenceEntry[]
  sourceAudit: SourceAudit
  runtimeObservation:
    | {
      status: 'not-collected'
      hitCount: null
      observedFrom: null
      observedUntil: null
      source: null
    }
    | {
      status: 'collected'
      hitCount: number
      observedFrom: string
      observedUntil: string
      source: string
    }
  operatorDecision: {
    type: 'explicit-hard-cut'
    decidedAt: string
  }
  warnings: string[]
}

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

function parseArguments(argv: string[]): {
  decision?: string
  output?: string
  strict: boolean
  verify?: string
} {
  const options: {
    decision?: string
    output?: string
    strict: boolean
    verify?: string
  } = {
    strict: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--strict') {
      options.strict = true
      continue
    }
    if (
      argument === '--decision'
      || argument === '--output'
      || argument === '--verify'
    ) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${argument}`)
      }
      index += 1
      if (argument === '--decision')
        options.decision = value
      if (argument === '--output')
        options.output = value
      if (argument === '--verify')
        options.verify = value
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }

  return options
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lineAt(source: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10)
      line += 1
  }
  return line
}

function shouldSkipFile(relativeFile: string): boolean {
  return (
    relativeFile === TOMBSTONE_SOURCE
    || relativeFile.split('/').some(part => IGNORED_DIRECTORIES[part])
  )
}

function isTestFixtureFile(relativeFile: string): boolean {
  return (
    /\.(?:spec|test)\.[^.]+$/.test(relativeFile)
    || relativeFile.split('/').some(part => TEST_FIXTURE_DIRECTORIES[part])
  )
}

async function collectSourceFiles(root: string): Promise<string[]> {
  const files: string[] = []

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES[entry.name])
        continue
      const entryPath = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
        continue
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS[extname(entry.name)])
        continue
      const relativeFile = relative(REPO_ROOT, entryPath).replaceAll('\\', '/')
      if (!shouldSkipFile(relativeFile))
        files.push(entryPath)
    }
  }

  await walk(resolve(REPO_ROOT, root))
  return files
}

function sortSourceHits(hits: SourceAuditHit[]): void {
  hits.sort((left, right) =>
    `${left.relativeFile}:${left.line}:${left.detector}`.localeCompare(
      `${right.relativeFile}:${right.line}:${right.detector}`,
    ),
  )
}

async function auditSource(): Promise<SourceAudit> {
  const files = (
    await Promise.all(SOURCE_ROOTS.map(root => collectSourceFiles(root)))
  ).flat()
  const productionHits: SourceAuditHit[] = []
  const testFixtureHits: SourceAuditHit[] = []
  let scannedProductionFiles = 0
  let scannedTestFixtureFiles = 0

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const relativeFile = relative(REPO_ROOT, file).replaceAll('\\', '/')
    const isTestFixture = isTestFixtureFile(relativeFile)
    const targetHits = isTestFixture ? testFixtureHits : productionHits
    if (isTestFixture)
      scannedTestFixtureFiles += 1
    else
      scannedProductionFiles += 1

    RETIRED_SYMBOL_PATTERN.lastIndex = 0
    for (const match of source.matchAll(RETIRED_SYMBOL_PATTERN)) {
      targetHits.push({
        detector: 'retired-symbol',
        relativeFile,
        line: lineAt(source, match.index),
      })
    }

    for (const alias of REMOVED_LEGACY_ALIASES) {
      const literalPattern = new RegExp(
        `([\"'\u0060])${escapeRegExp(alias.legacyEvent)}\\1`,
        'g',
      )
      for (const match of source.matchAll(literalPattern)) {
        targetHits.push({
          detector: 'legacy-event-literal',
          eventName: alias.legacyEvent,
          relativeFile,
          line: lineAt(source, match.index),
        })
      }
    }
  }

  sortSourceHits(productionHits)
  sortSourceHits(testFixtureHits)

  return {
    roots: SOURCE_ROOTS,
    scannedProductionFiles,
    scannedTestFixtureFiles,
    productionHits,
    testFixtureHits,
  }
}

async function readOptionalText(file: string): Promise<string | null> {
  try {
    return (await readFile(file, 'utf8')).trim()
  }
  catch {
    return null
  }
}

async function resolveRepositoryMetadata(): Promise<{
  version: string
  revision: string
}> {
  const packageJson = JSON.parse(
    await readFile(resolve(REPO_ROOT, 'package.json'), 'utf8'),
  ) as { version?: unknown }
  const version = typeof packageJson.version === 'string' ? packageJson.version : ''

  let gitDirectory = resolve(REPO_ROOT, '.git')
  const dotGitFile = await readOptionalText(gitDirectory)
  if (dotGitFile?.startsWith('gitdir:')) {
    gitDirectory = resolve(REPO_ROOT, dotGitFile.slice('gitdir:'.length).trim())
  }

  const head = await readOptionalText(resolve(gitDirectory, 'HEAD'))
  let revision = head ?? ''
  if (head?.startsWith('ref:')) {
    const refName = head.slice('ref:'.length).trim()
    revision = (await readOptionalText(resolve(gitDirectory, refName))) ?? ''
    if (!revision) {
      const packedRefs = await readOptionalText(resolve(gitDirectory, 'packed-refs'))
      revision
        = packedRefs
          ?.split('\n')
          .find(line => line.endsWith(` ${refName}`))
          ?.split(' ')[0] ?? ''
    }
  }

  if (!version)
    throw new Error('Repository package version is unavailable')
  if (!/^[0-9a-f]{40,64}$/i.test(revision))
    throw new Error('Repository revision is unavailable')
  return { version, revision }
}

function sourceHitsForAlias(
  alias: RemovedLegacyAlias,
  sourceAudit: SourceAudit,
): LegacyAliasEvidenceEntry['sourceHits'] {
  const matchesAlias = (hit: SourceAuditHit): boolean =>
    hit.detector === 'legacy-event-literal' && hit.eventName === alias.legacyEvent
  return {
    production: sourceAudit.productionHits.filter(matchesAlias).length,
    testFixture: sourceAudit.testFixtureHits.filter(matchesAlias).length,
  }
}

function familyCounts(
  aliases: readonly RemovedLegacyAlias[],
): Record<LegacyAliasFamily, number> {
  const counts: Record<LegacyAliasFamily, number> = {
    'core-box': 0,
    'auth': 0,
    'account': 0,
    'sync': 0,
    'terminal': 0,
    'opener': 0,
  }
  for (const alias of aliases) counts[alias.family] += 1
  return counts
}

function validateRegistry(): string[] {
  const errors: string[] = []
  const legacyNames = new Set<string>()
  const canonicalNames = new Set<string>()

  if (REMOVED_LEGACY_ALIASES.length !== EXPECTED_ALIAS_COUNT) {
    errors.push(
      `Expected ${EXPECTED_ALIAS_COUNT} tombstones, found ${REMOVED_LEGACY_ALIASES.length}`,
    )
  }

  for (const [index, alias] of REMOVED_LEGACY_ALIASES.entries()) {
    for (const field of [
      'family',
      'legacyEvent',
      'canonicalEvent',
      'direction',
      'sourceModule',
      'removedIn',
    ] as const) {
      if (typeof alias[field] !== 'string' || alias[field].length === 0) {
        errors.push(`Tombstone ${index} has invalid ${field}`)
      }
    }
    if (legacyNames.has(alias.legacyEvent)) {
      errors.push(`Duplicate legacy event: ${alias.legacyEvent}`)
    }
    if (canonicalNames.has(alias.canonicalEvent)) {
      errors.push(`Duplicate canonical event: ${alias.canonicalEvent}`)
    }
    legacyNames.add(alias.legacyEvent)
    canonicalNames.add(alias.canonicalEvent)
  }

  const counts = familyCounts(REMOVED_LEGACY_ALIASES)
  for (const [family, expected] of Object.entries(
    EXPECTED_FAMILY_COUNTS,
  ) as Array<[LegacyAliasFamily, number]>) {
    if (counts[family] !== expected) {
      errors.push(
        `Expected ${expected} ${family} aliases, found ${counts[family]}`,
      )
    }
  }

  return errors
}

function findForbiddenEvidenceKeys(value: unknown, location = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findForbiddenEvidenceKeys(item, `${location}[${index}]`),
    )
  }
  if (!value || typeof value !== 'object')
    return []

  const errors: string[] = []
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_KEYS[key])
      errors.push(`Forbidden evidence field ${location}.${key}`)
    errors.push(...findForbiddenEvidenceKeys(child, `${location}.${key}`))
  }
  return errors
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function validateEvidenceShape(evidence: LegacyAliasEvidence): string[] {
  const errors = validateRegistry()
  if (evidence.schemaVersion !== SCHEMA_VERSION) {
    errors.push(
      `Unsupported schema version: ${String(evidence.schemaVersion)}`,
    )
  }
  if (!isIsoTimestamp(evidence.generatedAt))
    errors.push('generatedAt must be an ISO timestamp')
  if (!evidence.repository?.version)
    errors.push('repository.version is missing')
  if (!/^[0-9a-f]{40,64}$/i.test(evidence.repository?.revision ?? ''))
    errors.push('repository.revision is invalid')
  if (evidence.operatorDecision?.type !== 'explicit-hard-cut') {
    errors.push('operatorDecision.type must be explicit-hard-cut')
  }
  if (!isIsoTimestamp(evidence.operatorDecision?.decidedAt)) {
    errors.push('operatorDecision.decidedAt must be an ISO timestamp')
  }

  const aliases = Array.isArray(evidence.aliases) ? evidence.aliases : []
  const evidenceMappings = aliases.map(alias => ({
    family: alias.family,
    legacyEvent: alias.legacyEvent,
    canonicalEvent: alias.canonicalEvent,
    direction: alias.direction,
    sourceModule: alias.sourceModule,
    removedIn: alias.removedIn,
  }))
  if (JSON.stringify(evidenceMappings) !== JSON.stringify(REMOVED_LEGACY_ALIASES)) {
    errors.push('Evidence aliases do not exactly cover the tombstone registry')
  }
  if (evidence.registry?.aliasCount !== EXPECTED_ALIAS_COUNT) {
    errors.push(`Evidence registry aliasCount must be ${EXPECTED_ALIAS_COUNT}`)
  }
  if (
    JSON.stringify(evidence.registry?.familyCounts)
    !== JSON.stringify(EXPECTED_FAMILY_COUNTS)
  ) {
    errors.push('Evidence family counts do not match the tombstone registry')
  }

  const sourceAudit = evidence.sourceAudit
  const sourceAuditIsComplete
    = Array.isArray(sourceAudit?.productionHits)
      && Array.isArray(sourceAudit?.testFixtureHits)
      && Number.isInteger(sourceAudit?.scannedProductionFiles)
      && Number.isInteger(sourceAudit?.scannedTestFixtureFiles)
  if (!sourceAuditIsComplete) {
    errors.push('Evidence sourceAudit is incomplete')
  }
  else {
    if (sourceAudit.productionHits.length > 0) {
      errors.push(
        `Evidence reports ${sourceAudit.productionHits.length} production alias hits`,
      )
    }
    for (const alias of aliases) {
      const expectedHits = sourceHitsForAlias(alias, sourceAudit)
      if (
        alias.sourceHits?.production !== expectedHits.production
        || alias.sourceHits?.testFixture !== expectedHits.testFixture
      ) {
        errors.push(`Source hit counts do not match for ${alias.legacyEvent}`)
      }
      if (Object.keys(alias).length !== 7) {
        errors.push(`Unexpected evidence fields for ${alias.legacyEvent}`)
      }
    }
  }
  const runtime = evidence.runtimeObservation
  if (runtime?.status === 'not-collected') {
    if (
      runtime.hitCount !== null
      || runtime.observedFrom !== null
      || runtime.observedUntil !== null
      || runtime.source !== null
    ) {
      errors.push(
        'not-collected runtime observation must not claim a window, source, or hit count',
      )
    }
  }
  else if (runtime?.status === 'collected') {
    if (!Number.isInteger(runtime.hitCount) || runtime.hitCount < 0) {
      errors.push(
        'collected runtime observation requires a non-negative integer hitCount',
      )
    }
    if (
      !isIsoTimestamp(runtime.observedFrom)
      || !isIsoTimestamp(runtime.observedUntil)
      || !runtime.source
    ) {
      errors.push(
        'collected runtime observation requires source and valid timestamps',
      )
    }
    if (
      isIsoTimestamp(runtime.observedFrom)
      && isIsoTimestamp(runtime.observedUntil)
      && Date.parse(runtime.observedUntil) <= Date.parse(runtime.observedFrom)
    ) {
      errors.push('runtime observation window must have positive duration')
    }
    if (runtime.hitCount > 0) {
      errors.push(
        `Runtime observation reports ${runtime.hitCount} production alias hits`,
      )
    }
  }
  else {
    errors.push('runtimeObservation.status must be not-collected or collected')
  }

  errors.push(...findForbiddenEvidenceKeys(evidence))
  return errors
}

async function buildEvidence(
  decision: string | undefined,
): Promise<LegacyAliasEvidence> {
  if (decision !== 'explicit-hard-cut') {
    throw new Error('Building evidence requires --decision explicit-hard-cut')
  }

  const [sourceAudit, repository] = await Promise.all([
    auditSource(),
    resolveRepositoryMetadata(),
  ])
  const errors = [...validateRegistry()]
  if (sourceAudit.productionHits.length > 0) {
    errors.push(
      `Current source contains ${sourceAudit.productionHits.length} production alias hits`,
    )
  }
  if (errors.length > 0)
    throw new Error(errors.join('\n'))

  const now = new Date().toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now,
    repository,
    registry: {
      aliasCount: REMOVED_LEGACY_ALIASES.length,
      familyCounts: familyCounts(REMOVED_LEGACY_ALIASES),
    },
    aliases: REMOVED_LEGACY_ALIASES.map(alias => ({
      ...alias,
      sourceHits: sourceHitsForAlias(alias, sourceAudit),
    })),
    sourceAudit,
    runtimeObservation: {
      status: 'not-collected',
      hitCount: null,
      observedFrom: null,
      observedUntil: null,
      source: null,
    },
    operatorDecision: {
      type: 'explicit-hard-cut',
      decidedAt: now,
    },
    warnings: [
      'Runtime legacy-hit observation was not collected; no zero-hit claim is made.',
    ],
  }
}

async function verifyEvidence(file: string, strict: boolean): Promise<void> {
  const evidence = JSON.parse(
    await readFile(resolve(process.cwd(), file), 'utf8'),
  ) as LegacyAliasEvidence
  const errors = validateEvidenceShape(evidence)

  if (strict) {
    const [currentAudit, currentRepository] = await Promise.all([
      auditSource(),
      resolveRepositoryMetadata(),
    ])
    if (currentAudit.productionHits.length > 0) {
      errors.push(
        `Current source contains ${currentAudit.productionHits.length} production alias hits`,
      )
    }
    if (JSON.stringify(currentAudit) !== JSON.stringify(evidence.sourceAudit))
      errors.push('Evidence source audit is stale')
    if (JSON.stringify(currentRepository) !== JSON.stringify(evidence.repository))
      errors.push('Evidence repository metadata is stale')
  }

  if (errors.length > 0)
    throw new Error(errors.join('\n'))
  if (evidence.runtimeObservation.status === 'not-collected') {
    console.warn(evidence.warnings[0])
  }
  console.log(
    `Verified ${file}: ${evidence.aliases.length} aliases, zero production hits`,
  )
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2))
  if (options.verify) {
    if (options.output || options.decision) {
      throw new Error(
        '--verify cannot be combined with --output or --decision',
      )
    }
    await verifyEvidence(options.verify, options.strict)
    return
  }

  if (!options.output)
    throw new Error('Building evidence requires --output <file>')
  const evidence = await buildEvidence(options.decision)
  const outputFile = resolve(process.cwd(), options.output)
  await mkdir(dirname(outputFile), { recursive: true })
  await writeFile(outputFile, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(
    `Wrote ${options.output}: ${evidence.aliases.length} aliases, zero production hits`,
  )
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
