import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export const PLUGIN_RELEASE_EVIDENCE_CONTRACT = 'talex.plugin-release-evidence/v1'

export const PLUGIN_RELEASE_REQUIRED_RECORDS = Object.freeze({
  'source-build': { kind: 'build', minimumLevel: 'packaged' },
  'package-policy': { kind: 'policy', minimumLevel: 'packaged' },
  'security-scan': { kind: 'scan', minimumLevel: 'packaged' },
  'publisher-signature': { kind: 'publisher-signature', minimumLevel: 'packaged' },
  'real-upload': { kind: 'upload', minimumLevel: 'real-upload' },
  'store-eligibility': { kind: 'eligibility', minimumLevel: 'deployed' },
  'nexus-attestation': { kind: 'nexus-attestation', minimumLevel: 'deployed' },
  'artifact-download': { kind: 'download', minimumLevel: 'real-upload' },
  'coreapp-install': { kind: 'install', minimumLevel: 'real-upload' },
  'duplicate-upload': { kind: 'duplicate-upload', minimumLevel: 'real-upload' },
  'retention': { kind: 'retention', minimumLevel: 'deployed' },
})

const EVIDENCE_LEVELS = ['focused', 'controlled', 'packaged', 'deployed', 'real-upload']
const RECORD_STATUSES = new Set(['passed', 'failed', 'blocked'])
const SHA256_RE = /^[a-f0-9]{64}$/
const REVISION_RE = /^[a-f0-9]{40}$/
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Z.-]+)?(?:\+[0-9A-Z.-]+)?$/i
const FORBIDDEN_REFERENCE_EXTENSIONS = new Set([
  '.cjs',
  '.cpuprofile',
  '.cts',
  '.har',
  '.heapsnapshot',
  '.js',
  '.jsx',
  '.log',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])
const FORBIDDEN_STRING_PATTERNS = [
  { label: 'absolute user path', pattern: /(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Z]:\\Users\\[^\\\s]+)/i },
  { label: 'private key', pattern: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/i },
  { label: 'authorization header', pattern: /authorization\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/i },
  { label: 'cookie header', pattern: /(?:set-)?cookie\s*[:=]\s*[^\s,;]+/i },
  { label: 'Tuff credential', pattern: /\btuff_[\w-]{12,}\b/ },
  { label: 'JWT credential', pattern: /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/ },
]

const TOP_LEVEL_KEYS = new Set([
  'artifact',
  'contractVersion',
  'documents',
  'environment',
  'gate',
  'generatedAt',
  'nexus',
  'plugin',
  'records',
  'source',
])
const RECORD_KEYS = new Set([
  'artifactSha256',
  'completedAt',
  'dependencies',
  'facts',
  'id',
  'identity',
  'kind',
  'level',
  'refs',
  'sourceRevision',
  'startedAt',
  'status',
])
const IDENTITY_KEYS = new Set(['channel', 'id', 'name', 'version'])
const DOCUMENT_KEYS = new Set(['checklistRef', 'exitCodeRef', 'strictOutputRef', 'summaryRef'])
const ENVIRONMENT_KEYS = new Set([
  'database',
  'deploymentId',
  'deploymentUrl',
  'kind',
  'objectStorage',
  'publicBaseUrl',
])
const DATABASE_KEYS = new Set(['binding', 'colo', 'databaseId', 'kind', 'region', 'servedBy'])
const STORAGE_KEYS = new Set(['binding', 'bucket', 'kind', 'provider'])
const SOURCE_KEYS = new Set(['dirty', 'pluginSource', 'repository', 'revision'])
const ARTIFACT_KEYS = new Set(['pathRef', 'sha256', 'size'])
const NEXUS_KEYS = new Set([
  'packageKey',
  'pluginId',
  'reviewAuditEventId',
  'uploadAuditEventId',
  'versionId',
])
const GATE_KEYS = new Set(['checkedAt', 'failures', 'passed'])

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function compareKnownKeys(value, allowed, location, issues) {
  if (!isObject(value)) {
    issues.push(`${location} must be an object`)
    return false
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key))
      issues.push(`${location}.${key} is not allowed`)
  }
  return true
}

function requireString(value, location, issues) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(`${location} must be a non-empty string`)
    return null
  }
  return value
}

function parseTimestamp(value, location, issues) {
  const text = requireString(value, location, issues)
  if (!text)
    return null
  const timestamp = Date.parse(text)
  if (!Number.isFinite(timestamp)) {
    issues.push(`${location} must be an ISO-8601 timestamp`)
    return null
  }
  return timestamp
}

function validateIdentity(identity, expected, location, issues) {
  if (!compareKnownKeys(identity, IDENTITY_KEYS, location, issues))
    return
  for (const key of IDENTITY_KEYS) {
    if (identity[key] !== expected[key])
      issues.push(`${location}.${key} must match plugin.${key}`)
  }
}

function validateRelativeReference(reference, location, issues) {
  const value = requireString(reference, location, issues)
  if (!value)
    return null
  if (value.includes('\\') || path.isAbsolute(value) || value.split('/').includes('..')) {
    issues.push(`${location} must be a report-relative POSIX path`)
    return null
  }
  const normalized = path.posix.normalize(value)
  if (normalized === '.' || normalized.startsWith('../') || normalized.startsWith('/')) {
    issues.push(`${location} must stay inside the report directory`)
    return null
  }
  const firstSegment = normalized.split('/')[0]
  if (firstSegment === 'raw' || firstSegment === '_local') {
    issues.push(`${location} cannot reference ${firstSegment}/`)
    return null
  }
  const extension = path.posix.extname(normalized).toLowerCase()
  if (FORBIDDEN_REFERENCE_EXTENSIONS.has(extension)) {
    issues.push(`${location} cannot reference ${extension} source/profile/log files`)
    return null
  }
  return normalized
}

function scanStrings(value, location, issues) {
  if (typeof value === 'string') {
    for (const { label, pattern } of FORBIDDEN_STRING_PATTERNS) {
      if (pattern.test(value))
        issues.push(`${location} contains forbidden ${label}`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanStrings(item, `${location}[${index}]`, issues))
    return
  }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) scanStrings(item, `${location}.${key}`, issues)
  }
}

function validateRecordFacts(record, manifest, issues) {
  const facts = record.facts
  if (!isObject(facts)) {
    issues.push(`records.${record.id}.facts must be an object`)
    return
  }
  const requireFact = (key, expected) => {
    if (facts[key] !== expected)
      issues.push(`records.${record.id}.facts.${key} must equal ${JSON.stringify(expected)}`)
  }
  switch (record.id) {
    case 'source-build':
      requireString(facts.auditId, `records.${record.id}.facts.auditId`, issues)
      requireFact('cleanBuild', true)
      requireFact('testsPassed', true)
      break
    case 'package-policy':
      requireFact('decision', 'passed')
      requireString(facts.policyVersion, `records.${record.id}.facts.policyVersion`, issues)
      break
    case 'security-scan':
      requireFact('decision', 'passed')
      requireFact('findingCount', 0)
      if (!SHA256_RE.test(String(facts.reportSha256 ?? '')))
        issues.push(`records.${record.id}.facts.reportSha256 must be SHA-256`)
      break
    case 'publisher-signature':
      requireFact('decision', 'verified')
      requireFact('algorithm', 'Ed25519')
      requireString(facts.keyId, `records.${record.id}.facts.keyId`, issues)
      break
    case 'real-upload':
      requireFact('dryRun', false)
      requireFact('database', 'd1')
      requireFact('objectStorage', 'r2')
      requireFact('pluginId', manifest.nexus?.pluginId)
      requireFact('versionId', manifest.nexus?.versionId)
      requireFact('packageKey', manifest.nexus?.packageKey)
      requireString(facts.requestAuditId, `records.${record.id}.facts.requestAuditId`, issues)
      break
    case 'store-eligibility':
      requireFact('status', 'approved')
      requireFact('admission', 'eligible')
      requireFact('publicVisible', false)
      requireFact('betaVisible', true)
      break
    case 'nexus-attestation':
      requireFact('decision', 'verified')
      requireString(facts.keyId, `records.${record.id}.facts.keyId`, issues)
      requireFact('deploymentId', manifest.environment?.deploymentId)
      break
    case 'artifact-download':
      requireFact('statusCode', 200)
      requireFact('sha256', manifest.artifact?.sha256)
      requireFact('size', manifest.artifact?.size)
      requireFact('objectStorage', 'r2')
      break
    case 'coreapp-install':
      requireFact('provider', 'tpex')
      requireFact('installed', true)
      requireFact('featureResult', true)
      requireFact('logsSanitized', true)
      break
    case 'duplicate-upload':
      requireFact('rejected', true)
      if (facts.statusCode !== 400 && facts.statusCode !== 409)
        issues.push(`records.${record.id}.facts.statusCode must be 400 or 409`)
      requireFact('versionRowCount', 1)
      requireFact('targetObjectCount', 1)
      requireFact('orphanCount', 0)
      break
    case 'retention':
      requireFact('policy', 'retained-beta-evidence')
      requireFact('versionExists', true)
      requireFact('objectExists', true)
      break
    default:
      break
  }
}

async function validateReferenceFile(reportDir, reference, record, manifest, issues) {
  const absolute = path.resolve(reportDir, reference)
  const relative = path.relative(reportDir, absolute)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    issues.push(`reference ${reference} resolves outside the report directory`)
    return
  }
  let content
  try {
    content = await readFile(absolute)
  }
  catch {
    issues.push(`reference ${reference} does not exist`)
    return
  }
  if (path.extname(reference).toLowerCase() !== '.json') {
    if (path.extname(reference).toLowerCase() !== '.tpex')
      scanStrings(content.toString('utf8'), `reference.${reference}`, issues)
    return
  }
  let projection
  try {
    projection = JSON.parse(content.toString('utf8'))
  }
  catch {
    issues.push(`reference ${reference} is not valid JSON`)
    return
  }
  scanStrings(projection, `reference.${reference}`, issues)
  if (!record)
    return
  if (projection.recordId !== record.id)
    issues.push(`reference ${reference}.recordId must match ${record.id}`)
  validateIdentity(projection.identity, manifest.plugin, `reference.${reference}.identity`, issues)
  if (projection.artifact?.sha256 !== manifest.artifact.sha256)
    issues.push(`reference ${reference}.artifact.sha256 must match artifact.sha256`)
  if (projection.artifact?.size !== manifest.artifact.size)
    issues.push(`reference ${reference}.artifact.size must match artifact.size`)
  if (projection.sourceRevision !== undefined && projection.sourceRevision !== manifest.source.revision) {
    issues.push(`reference ${reference}.sourceRevision must match source.revision`)
  }
}

function buildStrictSummary(manifest, records) {
  return {
    contractVersion: PLUGIN_RELEASE_EVIDENCE_CONTRACT,
    status: 'passed',
    checkedAt: manifest.gate.checkedAt,
    artifactSha256: manifest.artifact.sha256,
    plugin: manifest.plugin,
    environment: {
      kind: manifest.environment.kind,
      deploymentId: manifest.environment.deploymentId,
      database: manifest.environment.database.kind,
      objectStorage: manifest.environment.objectStorage.kind,
    },
    records: records.map(record => ({
      id: record.id,
      kind: record.kind,
      level: record.level,
      status: record.status,
    })),
  }
}

export function serializeCanonicalPluginReleaseEvidence(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export async function validatePluginReleaseEvidence(manifest, options = {}) {
  const issues = []
  const reportDir = path.resolve(options.reportDir ?? process.cwd())
  if (!compareKnownKeys(manifest, TOP_LEVEL_KEYS, 'manifest', issues)) {
    return { valid: false, issues: sortedUnique(issues), summary: null }
  }
  if (manifest.contractVersion !== PLUGIN_RELEASE_EVIDENCE_CONTRACT)
    issues.push(`contractVersion must equal ${PLUGIN_RELEASE_EVIDENCE_CONTRACT}`)
  parseTimestamp(manifest.generatedAt, 'generatedAt', issues)

  if (compareKnownKeys(manifest.environment, ENVIRONMENT_KEYS, 'environment', issues)) {
    if (manifest.environment.kind !== 'production')
      issues.push('environment.kind must equal production')
    requireString(manifest.environment.deploymentId, 'environment.deploymentId', issues)
    requireString(manifest.environment.deploymentUrl, 'environment.deploymentUrl', issues)
    requireString(manifest.environment.publicBaseUrl, 'environment.publicBaseUrl', issues)
    if (compareKnownKeys(manifest.environment.database, DATABASE_KEYS, 'environment.database', issues)) {
      if (manifest.environment.database.kind !== 'd1')
        issues.push('environment.database.kind must equal d1')
      for (const key of ['binding', 'databaseId', 'servedBy', 'region', 'colo']) requireString(manifest.environment.database[key], `environment.database.${key}`, issues)
    }
    if (compareKnownKeys(manifest.environment.objectStorage, STORAGE_KEYS, 'environment.objectStorage', issues)) {
      if (manifest.environment.objectStorage.kind !== 'r2')
        issues.push('environment.objectStorage.kind must equal r2')
      if (manifest.environment.objectStorage.provider !== 'cloudflare-r2')
        issues.push('environment.objectStorage.provider must equal cloudflare-r2')
      for (const key of ['binding', 'bucket']) requireString(manifest.environment.objectStorage[key], `environment.objectStorage.${key}`, issues)
    }
  }

  if (compareKnownKeys(manifest.source, SOURCE_KEYS, 'source', issues)) {
    if (!REVISION_RE.test(String(manifest.source.revision ?? '')))
      issues.push('source.revision must be a full Git revision')
    if (manifest.source.dirty !== false)
      issues.push('source.dirty must equal false')
    requireString(manifest.source.repository, 'source.repository', issues)
    requireString(manifest.source.pluginSource, 'source.pluginSource', issues)
  }

  if (compareKnownKeys(manifest.plugin, IDENTITY_KEYS, 'plugin', issues)) {
    requireString(manifest.plugin.id, 'plugin.id', issues)
    requireString(manifest.plugin.name, 'plugin.name', issues)
    if (!SEMVER_RE.test(String(manifest.plugin.version ?? '')))
      issues.push('plugin.version must be SemVer')
    if (!['SNAPSHOT', 'BETA', 'RELEASE'].includes(manifest.plugin.channel))
      issues.push('plugin.channel is invalid')
  }

  let artifactReference = null
  if (compareKnownKeys(manifest.artifact, ARTIFACT_KEYS, 'artifact', issues)) {
    if (!SHA256_RE.test(String(manifest.artifact.sha256 ?? '')))
      issues.push('artifact.sha256 must be SHA-256')
    if (!Number.isSafeInteger(manifest.artifact.size) || manifest.artifact.size <= 0)
      issues.push('artifact.size must be a positive safe integer')
    artifactReference = validateRelativeReference(manifest.artifact.pathRef, 'artifact.pathRef', issues)
  }

  if (compareKnownKeys(manifest.nexus, NEXUS_KEYS, 'nexus', issues)) {
    for (const key of NEXUS_KEYS) requireString(manifest.nexus[key], `nexus.${key}`, issues)
  }
  if (compareKnownKeys(manifest.gate, GATE_KEYS, 'gate', issues)) {
    if (manifest.gate.passed !== true)
      issues.push('gate.passed must equal true')
    if (!Array.isArray(manifest.gate.failures) || manifest.gate.failures.length !== 0)
      issues.push('gate.failures must be an empty array')
    parseTimestamp(manifest.gate.checkedAt, 'gate.checkedAt', issues)
  }

  const documentReferences = []
  if (compareKnownKeys(manifest.documents, DOCUMENT_KEYS, 'documents', issues)) {
    for (const key of DOCUMENT_KEYS) {
      const reference = validateRelativeReference(manifest.documents[key], `documents.${key}`, issues)
      if (reference)
        documentReferences.push({ key, reference })
    }
  }

  const records = Array.isArray(manifest.records) ? manifest.records : []
  if (!Array.isArray(manifest.records))
    issues.push('records must be an array')
  const byId = new Map()
  for (const [index, record] of records.entries()) {
    const location = `records[${index}]`
    if (!compareKnownKeys(record, RECORD_KEYS, location, issues))
      continue
    const id = requireString(record.id, `${location}.id`, issues)
    if (!id)
      continue
    if (byId.has(id))
      issues.push(`${location}.id must be unique`)
    byId.set(id, record)
    const required = PLUGIN_RELEASE_REQUIRED_RECORDS[id]
    if (required && record.kind !== required.kind)
      issues.push(`${location}.kind must equal ${required.kind}`)
    if (!EVIDENCE_LEVELS.includes(record.level))
      issues.push(`${location}.level is invalid`)
    if (!RECORD_STATUSES.has(record.status))
      issues.push(`${location}.status is invalid`)
    if (record.status !== 'passed')
      issues.push(`${location}.status must equal passed`)
    const startedAt = parseTimestamp(record.startedAt, `${location}.startedAt`, issues)
    const completedAt = parseTimestamp(record.completedAt, `${location}.completedAt`, issues)
    if (startedAt !== null && completedAt !== null && completedAt < startedAt)
      issues.push(`${location}.completedAt precedes startedAt`)
    if (record.artifactSha256 !== manifest.artifact?.sha256)
      issues.push(`${location}.artifactSha256 must match artifact.sha256`)
    if (record.sourceRevision !== manifest.source?.revision)
      issues.push(`${location}.sourceRevision must match source.revision`)
    validateIdentity(record.identity, manifest.plugin, `${location}.identity`, issues)
    if (!Array.isArray(record.dependencies))
      issues.push(`${location}.dependencies must be an array`)
    if (!Array.isArray(record.refs) || record.refs.length === 0)
      issues.push(`${location}.refs must be a non-empty array`)
    validateRecordFacts(record, manifest, issues)
  }

  for (const [id, requirement] of Object.entries(PLUGIN_RELEASE_REQUIRED_RECORDS)) {
    const record = byId.get(id)
    if (!record) {
      issues.push(`required record ${id} is missing`)
      continue
    }
    const actualLevel = EVIDENCE_LEVELS.indexOf(record.level)
    const minimumLevel = EVIDENCE_LEVELS.indexOf(requirement.minimumLevel)
    if (actualLevel < minimumLevel)
      issues.push(`record ${id} requires ${requirement.minimumLevel} evidence`)
  }

  const referencedFiles = new Map()
  for (const record of records) {
    for (const [index, rawReference] of (Array.isArray(record.refs) ? record.refs : []).entries()) {
      const reference = validateRelativeReference(rawReference, `records.${record.id}.refs[${index}]`, issues)
      if (!reference)
        continue
      if (referencedFiles.has(reference))
        issues.push(`reference ${reference} is declared more than once`)
      referencedFiles.set(reference, record)
    }
    for (const dependencyId of (Array.isArray(record.dependencies) ? record.dependencies : [])) {
      const dependency = byId.get(dependencyId)
      if (!dependency) {
        issues.push(`records.${record.id}.dependencies references missing ${dependencyId}`)
        continue
      }
      const dependencyCompletedAt = Date.parse(dependency.completedAt)
      const startedAt = Date.parse(record.startedAt)
      if (Number.isFinite(dependencyCompletedAt) && Number.isFinite(startedAt) && dependencyCompletedAt > startedAt) {
        issues.push(`records.${record.id} starts before dependency ${dependencyId} completed`)
      }
    }
  }

  scanStrings(manifest, 'manifest', issues)

  if (artifactReference) {
    const artifactPath = path.resolve(reportDir, artifactReference)
    try {
      const [bytes, artifactStat] = await Promise.all([readFile(artifactPath), stat(artifactPath)])
      const digest = createHash('sha256').update(bytes).digest('hex')
      if (digest !== manifest.artifact.sha256)
        issues.push('artifact.pathRef SHA-256 does not match artifact.sha256')
      if (artifactStat.size !== manifest.artifact.size)
        issues.push('artifact.pathRef size does not match artifact.size')
    }
    catch {
      issues.push(`artifact ${artifactReference} does not exist`)
    }
  }

  await Promise.all([...referencedFiles.entries()].map(([reference, record]) =>
    validateReferenceFile(reportDir, reference, record, manifest, issues)))
  for (const { key, reference } of documentReferences) {
    if (key === 'strictOutputRef' || key === 'exitCodeRef')
      continue
    await validateReferenceFile(reportDir, reference, null, manifest, issues)
  }

  const orderedRecords = Object.keys(PLUGIN_RELEASE_REQUIRED_RECORDS).map(id => byId.get(id)).filter(Boolean)
  const summary = orderedRecords.length === Object.keys(PLUGIN_RELEASE_REQUIRED_RECORDS).length
    ? buildStrictSummary(manifest, orderedRecords)
    : null

  if (!options.skipStrictOutput && manifest.documents) {
    const strictOutputRef = validateRelativeReference(manifest.documents.strictOutputRef, 'documents.strictOutputRef', issues)
    const exitCodeRef = validateRelativeReference(manifest.documents.exitCodeRef, 'documents.exitCodeRef', issues)
    if (strictOutputRef && summary) {
      try {
        const output = await readFile(path.resolve(reportDir, strictOutputRef), 'utf8')
        if (output !== serializeCanonicalPluginReleaseEvidence(summary))
          issues.push('strict output does not match the deterministic summary')
      }
      catch {
        issues.push(`strict output ${strictOutputRef} does not exist`)
      }
    }
    if (exitCodeRef) {
      try {
        const exitCode = await readFile(path.resolve(reportDir, exitCodeRef), 'utf8')
        if (exitCode !== '0\n')
          issues.push('strict exit-code capture must equal 0')
      }
      catch {
        issues.push(`strict exit-code capture ${exitCodeRef} does not exist`)
      }
    }
  }

  const normalizedIssues = sortedUnique(issues)
  return {
    valid: normalizedIssues.length === 0,
    issues: normalizedIssues,
    summary: normalizedIssues.length === 0 ? summary : null,
  }
}

export async function verifyPluginReleaseEvidenceFile(manifestPath, options = {}) {
  const absoluteManifestPath = path.resolve(manifestPath)
  const raw = await readFile(absoluteManifestPath, 'utf8')
  const manifest = JSON.parse(raw)
  if (raw !== serializeCanonicalPluginReleaseEvidence(manifest)) {
    return {
      valid: false,
      issues: ['manifest must use canonical JSON bytes'],
      summary: null,
      manifest,
    }
  }
  const result = await validatePluginReleaseEvidence(manifest, {
    ...options,
    reportDir: path.dirname(absoluteManifestPath),
  })
  return { ...result, manifest }
}
