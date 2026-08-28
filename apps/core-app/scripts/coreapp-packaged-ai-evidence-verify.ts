#!/usr/bin/env tsx
import { createHash, randomUUID } from 'node:crypto'
import { extractFile, getRawHeader, listPackage, statFile, uncache } from '@electron/asar'
import {
  accessSync,
  closeSync,
  constants as fsConstants,
  fstatSync,
  ftruncateSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  type Stats,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { parse as parsePlist } from 'simple-plist'

export const PACKAGED_AI_EVIDENCE_VERIFICATION_SCHEMA = 'tuff.packaged-ai-evidence-verification.v2'

const TOOL_REPORT_SCHEMA = 'tuff.packaged-tool-confirmation-acceptance.v1'
const FAILURE_MATRIX_REPORT_SCHEMA = 'tuff.packaged-ai-failure-matrix.v2'
const PROVIDER_REPORT_SCHEMA = 'tuff.packaged-ai-provider-acceptance.v1'
const LIVE_MCP_REPORT_SCHEMA = 'tuff.live-mcp-acceptance.v2'
const PRIVACY_LIFECYCLE_REPORT_SCHEMA = 'tuff.orchestrator-privacy-lifecycle-acceptance.v2'
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/
const SAFE_BASENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const MAX_REPORT_BYTES = 4 * 1024 * 1024
const MAX_SCREENSHOT_BYTES = 24 * 1024 * 1024
const MIN_SCREENSHOT_BYTES = 64
const MIN_SCREENSHOT_DIMENSION = 32
const MAX_SCREENSHOT_DIMENSION = 8_192
const MAX_SCREENSHOT_PIXELS = 16 * 1024 * 1024
const MAX_OUTPUT_DIRECTORY_RECOVERY_ENTRIES = 4096
const MAX_INFO_PLIST_BYTES = 1024 * 1024
const MAX_ASAR_PACKAGE_JSON_BYTES = 1024 * 1024

const REQUIRED_ASAR_ENTRIES = [
  'package.json',
  'out/main/index.js',
  'out/main/privacy-lifecycle-smoke.js',
  'out/main/live-mcp-smoke.js'
] as const

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  return crc >>> 0
})

const TOOL_SCENARIOS = ['deny', 'allow', 'remember-replay', 'reset', 'timeout', 'cancel'] as const
const FAILURE_SCENARIOS = [
  'no-provider',
  'quota-exhausted',
  'unsupported-model',
  'permission-denied',
  'timeout'
] as const
const FAILURE_REQUIRED_FEATURE_IDS = [
  'intelligence-ask',
  'intelligence-rewrite',
  'intelligence-summarize',
  'intelligence-explain',
  'intelligence-command-registry'
] as const
const FAILURE_FEATURE_ID = FAILURE_REQUIRED_FEATURE_IDS[0]
const FAILURE_CANDIDATE_EVIDENCE_LIMIT = 16

const PROVIDER_LIFECYCLE_BOOLEAN_KEYS = [
  'ollamaReachable',
  'modelAvailable',
  'credentialSaved',
  'credentialSavedExact',
  'connectionTested',
  'firstHomeStreamCompleted',
  'firstHomeObservedBusyDelta',
  'titleRequestStabilized',
  'credentialRestoredAfterRelaunch',
  'credentialRestoredExact',
  'secondHomeStreamCompleted',
  'secondHomeObservedBusyDelta',
  'cancellationObservedBusyDelta',
  'cancellationSettled',
  'cancellationFlushWindowObserved',
  'cancellationHomeAuditAbsent',
  'cancellationLedgerAccounted',
  'providerDeletedThroughUi',
  'secureStoreEnvelopeValid',
  'secureStoreKeyDeleted',
  'localSecretFilePresent',
  'credentialCanaryAbsent'
] as const
const LIVE_MCP_CHECK_KEYS = [
  'explicitOptIn',
  'realStdio',
  'launcherIdentityBound',
  'nodeHashMatched',
  'npxHashMatched',
  'pathShimExcluded',
  'initializeHandshake',
  'toolsListed',
  'readTextFileCalled',
  'roundTripCanaryMatched'
] as const
const PRIVACY_LIFECYCLE_CHECK_KEYS = [
  'typedDeletePreview',
  'authorityBoundOneShotDelete',
  'terminalRunDeletion',
  'activeRunProtected',
  'automaticRetention',
  'keysetPagination',
  'cancellationPartialCommit',
  'cascadeDelete',
  'journaledMigration',
  'utf8ByteAccounting',
  'productionSmoke'
] as const

type JsonRecord = Record<string, unknown>
type ToolScenarioName = (typeof TOOL_SCENARIOS)[number]
type FailureScenarioName = (typeof FAILURE_SCENARIOS)[number]
type ReportKind =
  | 'tool-confirmation'
  | 'failure-matrix'
  | 'provider-lifecycle'
  | 'live-mcp'
  | 'privacy-lifecycle'

export type PackagedAiEvidenceVerificationErrorCode =
  | 'ARGUMENT_INVALID'
  | 'APP_BUNDLE_INVALID'
  | 'APP_BUNDLE_CHANGED'
  | 'APP_VERSION_INVALID'
  | 'APP_EXECUTABLE_INVALID'
  | 'APP_ASAR_INVALID'
  | 'APP_ASAR_CHANGED'
  | 'APP_ASAR_HASH_MISMATCH'
  | 'TOOL_REPORT_READ_FAILED'
  | 'TOOL_REPORT_INVALID'
  | 'FAILURE_MATRIX_REPORT_READ_FAILED'
  | 'FAILURE_MATRIX_REPORT_INVALID'
  | 'PROVIDER_REPORT_READ_FAILED'
  | 'PROVIDER_REPORT_INVALID'
  | 'LIVE_MCP_REPORT_READ_FAILED'
  | 'LIVE_MCP_REPORT_INVALID'
  | 'PRIVACY_LIFECYCLE_REPORT_READ_FAILED'
  | 'PRIVACY_LIFECYCLE_REPORT_INVALID'
  | 'EVIDENCE_IDENTITY_MISMATCH'
  | 'SCREENSHOT_INVALID'
  | 'SCREENSHOT_READ_FAILED'
  | 'OUTPUT_WRITE_FAILED'
  | 'VERIFICATION_FAILED'

export class PackagedAiEvidenceVerificationError extends Error {
  constructor(readonly code: PackagedAiEvidenceVerificationErrorCode) {
    super(code)
    this.name = 'PackagedAiEvidenceVerificationError'
  }
}

interface CliOptions {
  appBundle: string
  toolReport: string
  failureMatrixReport: string
  providerReport: string
  liveMcpReport: string
  privacyLifecycleReport: string
  output: string
  pretty: boolean
}

interface AppIdentity {
  version: string
  hash: string
}

interface VerifiedToolReport {
  app: AppIdentity
  confirmationTimeoutMode: 'production-default' | 'controlled-override'
}

interface VerifiedFailureMatrixReport {
  app: AppIdentity
  appBundle: string
}

interface VerifiedProviderReport {
  app: AppIdentity
  appBundle: string
}

interface VerifiedAuxiliaryReport {
  app: AppIdentity
  checkedAt: string
}

export interface PackagedAiEvidenceArtifactDigest {
  sha256: string
  bytes: number
}

export interface PackagedAiEvidenceScreenshotDigest extends PackagedAiEvidenceArtifactDigest {
  scenario: ToolScenarioName
  basename: string
}

export interface PackagedAiEvidenceVerificationInput {
  toolReport: unknown
  failureMatrixReport: unknown
  providerReport: unknown
  liveMcpReport: unknown
  privacyLifecycleReport: unknown
  physicalApp: {
    version: string
    bundleBasename: string
    hashBefore: string
    hashAfter: string
  }
  reports: Record<ReportKind, PackagedAiEvidenceArtifactDigest>
  screenshots: readonly PackagedAiEvidenceScreenshotDigest[]
  checkedAt?: string
}

export interface PackagedAiEvidenceVerificationManifest {
  schema: typeof PACKAGED_AI_EVIDENCE_VERIFICATION_SCHEMA
  ok: true
  checkedAt: string
  scope: {
    packagedEvidenceSet: 'passed'
    overallAcceptance: 'passed'
    notVerified: []
  }
  app: AppIdentity
  checks: {
    physicalBundleValidated: true
    executableValidated: true
    appAsarHashStable: true
    reportIdentityBound: true
    toolConfirmationValidated: true
    failureMatrixValidated: true
    providerLifecycleValidated: true
    liveMcpValidated: true
    privacyLifecycleValidated: true
  }
  runtime: {
    toolConfirmationTimeoutMode: 'production-default' | 'controlled-override'
  }
  artifacts: {
    reports: Array<{
      kind: ReportKind
      schema:
        | typeof TOOL_REPORT_SCHEMA
        | typeof FAILURE_MATRIX_REPORT_SCHEMA
        | typeof PROVIDER_REPORT_SCHEMA
        | typeof LIVE_MCP_REPORT_SCHEMA
        | typeof PRIVACY_LIFECYCLE_REPORT_SCHEMA
      sha256: string
      bytes: number
    }>
    screenshots: PackagedAiEvidenceScreenshotDigest[]
  }
}

interface BoundedArtifact {
  value: unknown
  digest: PackagedAiEvidenceArtifactDigest
  parentDirectory: StableDirectoryReference
}

interface StableFileReference {
  path: string
  snapshot: Stats
}

interface PackagedAppInspection {
  inputPath: string
  bundlePath: string
  bundleBasename: string
  bundleSnapshot: Stats
  infoPlist: StableFileReference
  executable: StableFileReference
  appAsar: StableFileReference
  version: string
}

interface StableFileRead {
  buffer: Buffer
  digest: PackagedAiEvidenceArtifactDigest
}

interface StableDirectoryReference {
  path: string
  snapshot: Stats
}

export interface PackagedAiEvidenceVerificationDependencies {
  afterReportPathSnapshot?: (filePath: string, kind: ReportKind) => void
  afterScreenshotPathSnapshot?: (filePath: string, scenario: ToolScenarioName) => void
  beforeScreenshotDirectoryValidation?: (directoryPath: string) => void
  afterOutputDirectorySnapshot?: (directoryPath: string) => void
  afterOutputPublished?: (outputPath: string) => void
}

interface PreparedPackagedAiEvidenceVerification {
  manifest: PackagedAiEvidenceVerificationManifest
  outputTarget: string
  app: PackagedAppInspection
}

const TOOL_EXPECTATIONS: Record<
  ToolScenarioName,
  {
    screenshot: string
    decision: string
    resultCode: string
    audit: { decision: string; status: string; code: string }
    extras: readonly string[]
  }
> = {
  deny: {
    screenshot: 'deny-confirmation.png',
    decision: 'denied',
    resultCode: 'TOOL_APPROVAL_DENIED',
    audit: { decision: 'denied', status: 'error', code: 'TOOL_APPROVAL_DENIED' },
    extras: []
  },
  allow: {
    screenshot: 'allow-confirmation.png',
    decision: 'approved',
    resultCode: 'TOOL_OK',
    audit: { decision: 'approved', status: 'success', code: 'TOOL_OK' },
    extras: []
  },
  'remember-replay': {
    screenshot: 'remember-confirmation.png',
    decision: 'approved-remembered',
    resultCode: 'TOOL_OK',
    audit: { decision: 'approved', status: 'success', code: 'TOOL_OK' },
    extras: ['rememberReplaySkipped', 'replayConfirmationCount', 'replayAudit']
  },
  reset: {
    screenshot: 'reset-confirmation.png',
    decision: 'approved-after-reset',
    resultCode: 'TOOL_OK',
    audit: { decision: 'approved', status: 'success', code: 'TOOL_OK' },
    extras: []
  },
  timeout: {
    screenshot: 'timeout-confirmation.png',
    decision: 'timeout',
    resultCode: 'TOOL_APPROVAL_DENIED',
    audit: { decision: 'denied', status: 'error', code: 'TOOL_APPROVAL_DENIED' },
    extras: ['timeoutElapsedBucket']
  },
  cancel: {
    screenshot: 'cancel-confirmation.png',
    decision: 'cancelled',
    resultCode: 'TOOL_EXECUTION_ABORTED',
    audit: { decision: 'failed', status: 'error', code: 'TOOL_EXECUTION_ABORTED' },
    extras: ['cancelAuditElapsedMs', 'cancelAuditMaxElapsedMs']
  }
}

const FAILURE_EXPECTATIONS: Record<
  FailureScenarioName,
  {
    code: string
    fixture: {
      requests: number
      responseHeadersSent: boolean
      partialDeltaSent: boolean
      bodyHeldOpen: boolean
    }
    auditDelta: number
    usageRequestDelta: number
    settingsAction: 'none' | 'intelligence' | 'permission'
    intelligencePermissionRevoked: boolean
    quotaDisabled: boolean
  }
> = {
  'no-provider': {
    code: 'PROVIDER_UNAVAILABLE',
    fixture: {
      requests: 0,
      responseHeadersSent: false,
      partialDeltaSent: false,
      bodyHeldOpen: false
    },
    auditDelta: 0,
    usageRequestDelta: 0,
    settingsAction: 'intelligence',
    intelligencePermissionRevoked: false,
    quotaDisabled: false
  },
  'quota-exhausted': {
    code: 'QUOTA_EXHAUSTED',
    fixture: {
      requests: 0,
      responseHeadersSent: false,
      partialDeltaSent: false,
      bodyHeldOpen: false
    },
    auditDelta: 0,
    usageRequestDelta: 0,
    settingsAction: 'none',
    intelligencePermissionRevoked: false,
    quotaDisabled: true
  },
  'unsupported-model': {
    code: 'MODEL_UNSUPPORTED',
    fixture: {
      requests: 1,
      responseHeadersSent: true,
      partialDeltaSent: false,
      bodyHeldOpen: false
    },
    auditDelta: 1,
    usageRequestDelta: 1,
    settingsAction: 'none',
    intelligencePermissionRevoked: false,
    quotaDisabled: false
  },
  'permission-denied': {
    code: 'PERMISSION_DENIED',
    fixture: {
      requests: 0,
      responseHeadersSent: false,
      partialDeltaSent: false,
      bodyHeldOpen: false
    },
    auditDelta: 0,
    usageRequestDelta: 0,
    settingsAction: 'permission',
    intelligencePermissionRevoked: true,
    quotaDisabled: false
  },
  timeout: {
    code: 'NETWORK_FAILURE',
    fixture: {
      requests: 1,
      responseHeadersSent: true,
      partialDeltaSent: true,
      bodyHeldOpen: true
    },
    auditDelta: 1,
    usageRequestDelta: 1,
    settingsAction: 'intelligence',
    intelligencePermissionRevoked: false,
    quotaDisabled: false
  }
}

function fail(code: PackagedAiEvidenceVerificationErrorCode): never {
  throw new PackagedAiEvidenceVerificationError(code)
}

function isDataRecord(value: unknown): value is JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    const descriptors = Object.getOwnPropertyDescriptors(value)
    return Reflect.ownKeys(descriptors).every((key) => {
      if (typeof key !== 'string') return false
      const descriptor = descriptors[key]
      return descriptor.enumerable === true && 'value' in descriptor
    })
  } catch {
    return false
  }
}

function hasExactKeys(value: unknown, expectedKeys: readonly string[]): value is JsonRecord {
  if (!isDataRecord(value)) return false
  const actualKeys = Object.keys(value)
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => actualKeys.includes(key))
  )
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

function isSafeToken(value: unknown): value is string {
  return typeof value === 'string' && SAFE_TOKEN_PATTERN.test(value)
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_PATTERN.test(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isSafeBasename(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    SAFE_BASENAME_PATTERN.test(value) &&
    basename(value) === value &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.toLowerCase().startsWith('file:')
  )
}

function isPathWithin(candidate: string, root: string): boolean {
  const relativePath = relative(root, candidate)
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  )
}

function parseAppIdentity(
  value: unknown,
  code: PackagedAiEvidenceVerificationErrorCode
): AppIdentity {
  if (
    !hasExactKeys(value, ['version', 'hash']) ||
    !isSafeToken(value.version) ||
    !isSha256(value.hash)
  ) {
    fail(code)
  }
  return { version: value.version, hash: value.hash }
}

function verifyEmptyFailures(value: unknown, code: PackagedAiEvidenceVerificationErrorCode): void {
  if (!Array.isArray(value) || value.length !== 0) fail(code)
}

function verifyAuxiliaryReport(
  value: unknown,
  schema: typeof LIVE_MCP_REPORT_SCHEMA | typeof PRIVACY_LIFECYCLE_REPORT_SCHEMA,
  checkKeys: readonly string[],
  code: PackagedAiEvidenceVerificationErrorCode
): VerifiedAuxiliaryReport {
  const topLevelKeys =
    schema === LIVE_MCP_REPORT_SCHEMA
      ? ['schema', 'ok', 'checkedAt', 'app', 'launcher', 'checks', 'failures']
      : ['schema', 'ok', 'checkedAt', 'app', 'gateProvenance', 'checks', 'failures']
  if (
    !hasExactKeys(value, topLevelKeys) ||
    value.schema !== schema ||
    value.ok !== true ||
    !isCanonicalIsoTimestamp(value.checkedAt) ||
    !hasExactKeys(value.checks, checkKeys) ||
    checkKeys.some((key) => value.checks[key] !== true)
  ) {
    fail(code)
  }
  if (schema === LIVE_MCP_REPORT_SCHEMA) {
    if (
      !hasExactKeys(value.launcher, ['nodeSha256', 'npxCliSha256']) ||
      !isSha256(value.launcher.nodeSha256) ||
      !isSha256(value.launcher.npxCliSha256)
    ) {
      fail(code)
    }
  } else if (value.gateProvenance !== 'packaged-app-asar') {
    fail(code)
  }
  verifyEmptyFailures(value.failures, code)
  return {
    app: parseAppIdentity(value.app, code),
    checkedAt: value.checkedAt
  }
}

function verifyAuditEvidence(
  value: unknown,
  expectation: { decision: string; status: string; code: string },
  code: PackagedAiEvidenceVerificationErrorCode
): void {
  if (
    !hasExactKeys(value, ['ok', 'eventCount', 'decision', 'status', 'code']) ||
    value.ok !== true ||
    value.eventCount !== 3 ||
    value.decision !== expectation.decision ||
    value.status !== expectation.status ||
    value.code !== expectation.code
  ) {
    fail(code)
  }
}

function verifyToolScenario(value: unknown, scenario: ToolScenarioName): void {
  const code = 'TOOL_REPORT_INVALID' as const
  const expectation = TOOL_EXPECTATIONS[scenario]
  const baseKeys = [
    'name',
    'status',
    'toolId',
    'risk',
    'confirmationCount',
    'cardVisible',
    'cardCleared',
    'decision',
    'resultCode',
    'requestEnded',
    'documentHidden',
    'screenshot',
    'audit'
  ]
  if (
    !hasExactKeys(value, [...baseKeys, ...expectation.extras]) ||
    value.name !== scenario ||
    value.status !== 'passed' ||
    value.toolId !== 'tuff_read_file' ||
    value.risk !== 'read' ||
    value.confirmationCount !== 1 ||
    value.cardVisible !== true ||
    value.cardCleared !== true ||
    value.decision !== expectation.decision ||
    value.resultCode !== expectation.resultCode ||
    value.requestEnded !== true ||
    value.documentHidden !== false ||
    value.screenshot !== expectation.screenshot ||
    !isSafeBasename(value.screenshot)
  ) {
    fail(code)
  }
  verifyAuditEvidence(value.audit, expectation.audit, code)

  if (scenario === 'remember-replay') {
    if (value.rememberReplaySkipped !== true || value.replayConfirmationCount !== 0) fail(code)
    verifyAuditEvidence(
      value.replayAudit,
      { decision: 'remembered', status: 'success', code: 'TOOL_OK' },
      code
    )
  }
  if (scenario === 'timeout' && value.timeoutElapsedBucket !== 'timeout-window') fail(code)
  if (scenario === 'cancel') {
    if (
      !isNonNegativeInteger(value.cancelAuditElapsedMs) ||
      !isNonNegativeInteger(value.cancelAuditMaxElapsedMs) ||
      value.cancelAuditMaxElapsedMs < 1 ||
      value.cancelAuditElapsedMs > value.cancelAuditMaxElapsedMs ||
      value.cancelAuditMaxElapsedMs > 1_500
    ) {
      fail(code)
    }
  }
}

function verifyToolReport(value: unknown): VerifiedToolReport {
  const code = 'TOOL_REPORT_INVALID' as const
  if (
    !hasExactKeys(value, [
      'schema',
      'ok',
      'checkedAt',
      'scope',
      'app',
      'runtime',
      'scenarios',
      'failures'
    ]) ||
    value.schema !== TOOL_REPORT_SCHEMA ||
    value.ok !== true ||
    !isCanonicalIsoTimestamp(value.checkedAt) ||
    value.scope !== 'isolated-controlled' ||
    !hasExactKeys(value.runtime, [
      'launches',
      'processTerminated',
      'profileRemoved',
      'confirmationTimeoutMode'
    ]) ||
    value.runtime.launches !== 1 ||
    value.runtime.processTerminated !== true ||
    value.runtime.profileRemoved !== true ||
    (value.runtime.confirmationTimeoutMode !== 'production-default' &&
      value.runtime.confirmationTimeoutMode !== 'controlled-override') ||
    !Array.isArray(value.scenarios) ||
    value.scenarios.length !== TOOL_SCENARIOS.length
  ) {
    fail(code)
  }
  verifyEmptyFailures(value.failures, code)
  TOOL_SCENARIOS.forEach((scenario, index) => verifyToolScenario(value.scenarios[index], scenario))
  return {
    app: parseAppIdentity(value.app, code),
    confirmationTimeoutMode: value.runtime.confirmationTimeoutMode
  }
}

function verifyFailureFeatureCandidates(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= FAILURE_REQUIRED_FEATURE_IDS.length &&
    value.length <= FAILURE_CANDIDATE_EVIDENCE_LIMIT &&
    value.every(isSafeToken) &&
    FAILURE_REQUIRED_FEATURE_IDS.every(
      (featureId) => value.filter((candidate) => candidate === featureId).length === 1
    )
  )
}

function verifyFailureLedger(
  value: unknown,
  expectation: (typeof FAILURE_EXPECTATIONS)[FailureScenarioName]
): void {
  const code = 'FAILURE_MATRIX_REPORT_INVALID' as const
  if (
    !hasExactKeys(value, [
      'auditDelta',
      'auditSuccessDelta',
      'auditFailureDelta',
      'auditTokenDelta',
      'auditCostDelta',
      'day',
      'month'
    ]) ||
    value.auditDelta !== expectation.auditDelta ||
    value.auditSuccessDelta !== 0 ||
    value.auditFailureDelta !== expectation.auditDelta ||
    value.auditTokenDelta !== 0 ||
    value.auditCostDelta !== 0
  ) {
    fail(code)
  }
  for (const period of [value.day, value.month]) {
    if (
      !hasExactKeys(period, [
        'requestDelta',
        'successDelta',
        'failureDelta',
        'tokenDelta',
        'costDelta'
      ]) ||
      period.requestDelta !== expectation.usageRequestDelta ||
      period.successDelta !== 0 ||
      period.failureDelta !== expectation.usageRequestDelta ||
      period.tokenDelta !== 0 ||
      period.costDelta !== 0
    ) {
      fail(code)
    }
  }
}

function verifyFailureScenario(value: unknown, scenario: FailureScenarioName): void {
  const code = 'FAILURE_MATRIX_REPORT_INVALID' as const
  const expectation = FAILURE_EXPECTATIONS[scenario]
  if (
    !hasExactKeys(value, [
      'name',
      'ok',
      'profile',
      'fixture',
      'ui',
      'ledger',
      'prerequisites',
      'interaction',
      'processStopped',
      'profileRemoved',
      'failures'
    ]) ||
    value.name !== scenario ||
    value.ok !== true ||
    value.profile !== 'fresh-isolated' ||
    value.processStopped !== true ||
    value.profileRemoved !== true
  ) {
    fail(code)
  }
  verifyEmptyFailures(value.failures, code)
  if (
    !hasExactKeys(value.fixture, [
      'requests',
      'responseHeadersSent',
      'partialDeltaSent',
      'bodyHeldOpen',
      'boundToLoopback',
      'closed'
    ]) ||
    value.fixture.requests !== expectation.fixture.requests ||
    value.fixture.responseHeadersSent !== expectation.fixture.responseHeadersSent ||
    value.fixture.partialDeltaSent !== expectation.fixture.partialDeltaSent ||
    value.fixture.bodyHeldOpen !== expectation.fixture.bodyHeldOpen ||
    value.fixture.boundToLoopback !== true ||
    value.fixture.closed !== true
  ) {
    fail(code)
  }
  if (
    !hasExactKeys(value.ui, [
      'code',
      'reasonPresent',
      'recoveryPresent',
      'noticeVisible',
      'busyCleared',
      'retryVisible',
      'intelligenceSettingsVisible',
      'permissionSettingsVisible'
    ]) ||
    value.ui.code !== expectation.code ||
    value.ui.reasonPresent !== true ||
    value.ui.recoveryPresent !== true ||
    value.ui.noticeVisible !== true ||
    value.ui.busyCleared !== true ||
    value.ui.retryVisible !== true ||
    typeof value.ui.intelligenceSettingsVisible !== 'boolean' ||
    typeof value.ui.permissionSettingsVisible !== 'boolean' ||
    (expectation.settingsAction === 'intelligence' &&
      value.ui.intelligenceSettingsVisible !== true) ||
    (expectation.settingsAction === 'permission' && value.ui.permissionSettingsVisible !== true)
  ) {
    fail(code)
  }
  verifyFailureLedger(value.ledger, expectation)
  if (
    !hasExactKeys(value.prerequisites, [
      'requiredPermissionsGranted',
      'searchProviderEnabled',
      'pluginEnabled',
      'intelligencePermissionRevoked',
      'quotaDisabled'
    ]) ||
    value.prerequisites.requiredPermissionsGranted !== true ||
    value.prerequisites.searchProviderEnabled !== true ||
    value.prerequisites.pluginEnabled !== true ||
    value.prerequisites.intelligencePermissionRevoked !==
      expectation.intelligencePermissionRevoked ||
    value.prerequisites.quotaDisabled !== expectation.quotaDisabled
  ) {
    fail(code)
  }
  if (
    !hasExactKeys(value.interaction, [
      'queryAccepted',
      'candidateFeatureIds',
      'selectedFeatureId',
      'widgetFeatureId',
      'promptAccepted',
      'sendReady'
    ]) ||
    value.interaction.queryAccepted !== true ||
    !verifyFailureFeatureCandidates(value.interaction.candidateFeatureIds) ||
    value.interaction.selectedFeatureId !== FAILURE_FEATURE_ID ||
    value.interaction.widgetFeatureId !== FAILURE_FEATURE_ID ||
    value.interaction.promptAccepted !== true ||
    value.interaction.sendReady !== true
  ) {
    fail(code)
  }
}

function verifyFailureMatrixReport(value: unknown): VerifiedFailureMatrixReport {
  const code = 'FAILURE_MATRIX_REPORT_INVALID' as const
  if (
    !hasExactKeys(value, [
      'schema',
      'ok',
      'checkedAt',
      'app',
      'runtime',
      'scenarios',
      'failures'
    ]) ||
    value.schema !== FAILURE_MATRIX_REPORT_SCHEMA ||
    value.ok !== true ||
    !isCanonicalIsoTimestamp(value.checkedAt) ||
    !hasExactKeys(value.runtime, [
      'appBundle',
      'freshProfiles',
      'cleanupRequested',
      'cleanupComplete'
    ]) ||
    !isSafeBasename(value.runtime.appBundle) ||
    value.runtime.freshProfiles !== FAILURE_SCENARIOS.length ||
    value.runtime.cleanupRequested !== true ||
    value.runtime.cleanupComplete !== true ||
    !Array.isArray(value.scenarios) ||
    value.scenarios.length !== FAILURE_SCENARIOS.length
  ) {
    fail(code)
  }
  verifyEmptyFailures(value.failures, code)
  FAILURE_SCENARIOS.forEach((scenario, index) =>
    verifyFailureScenario(value.scenarios[index], scenario)
  )
  return {
    app: parseAppIdentity(value.app, code),
    appBundle: value.runtime.appBundle
  }
}

function costsMatch(left: number, right: number): boolean {
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 16
  return Math.abs(left - right) <= tolerance
}

function verifyProviderAudit(value: unknown): {
  matched: number
  success: number
  failure: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
} {
  const code = 'PROVIDER_REPORT_INVALID' as const
  const integerKeys = [
    'matched',
    'success',
    'failure',
    'uniqueTraceCount',
    'promptTokens',
    'completionTokens',
    'totalTokens',
    'invalidNumericRows',
    'invalidIdentityRows',
    'invalidOperationRows',
    'homeConversationRequests',
    'conversationTitleRequests',
    'expectedSuccessfulRequests',
    'expectedHomeConversationRequests',
    'expectedConversationTitleRequests'
  ] as const
  if (
    !hasExactKeys(value, [...integerKeys, 'estimatedCost', 'passed']) ||
    integerKeys.some((key) => !isNonNegativeInteger(value[key])) ||
    !isNonNegativeFinite(value.estimatedCost) ||
    value.passed !== true
  ) {
    fail(code)
  }
  if (
    value.expectedHomeConversationRequests !== 2 ||
    (value.expectedConversationTitleRequests !== 1 &&
      value.expectedConversationTitleRequests !== 2) ||
    value.expectedSuccessfulRequests !==
      value.expectedHomeConversationRequests + value.expectedConversationTitleRequests ||
    value.matched !== value.expectedSuccessfulRequests ||
    value.success !== value.expectedSuccessfulRequests ||
    value.failure !== 0 ||
    value.uniqueTraceCount !== value.expectedSuccessfulRequests ||
    value.homeConversationRequests !== value.expectedHomeConversationRequests ||
    value.conversationTitleRequests !== value.expectedConversationTitleRequests ||
    value.invalidNumericRows !== 0 ||
    value.invalidIdentityRows !== 0 ||
    value.invalidOperationRows !== 0 ||
    value.totalTokens !== value.promptTokens + value.completionTokens
  ) {
    fail(code)
  }
  return {
    matched: value.matched,
    success: value.success,
    failure: value.failure,
    promptTokens: value.promptTokens,
    completionTokens: value.completionTokens,
    totalTokens: value.totalTokens,
    estimatedCost: value.estimatedCost
  }
}

function verifyProviderUsage(value: unknown, audit: ReturnType<typeof verifyProviderAudit>): void {
  const code = 'PROVIDER_REPORT_INVALID' as const
  const integerKeys = [
    'dayRows',
    'monthRows',
    'requestCount',
    'successCount',
    'failureCount',
    'totalTokens',
    'promptTokens',
    'completionTokens',
    'invalidRows'
  ] as const
  if (
    !hasExactKeys(value, [...integerKeys, 'totalCost', 'passed']) ||
    integerKeys.some((key) => !isNonNegativeInteger(value[key])) ||
    !isNonNegativeFinite(value.totalCost) ||
    value.passed !== true ||
    value.dayRows < 1 ||
    value.monthRows < 1 ||
    value.invalidRows !== 0 ||
    value.requestCount !== audit.matched ||
    value.successCount !== audit.success ||
    value.failureCount !== audit.failure ||
    value.totalTokens !== audit.totalTokens ||
    value.promptTokens !== audit.promptTokens ||
    value.completionTokens !== audit.completionTokens ||
    value.requestCount !== value.successCount + value.failureCount ||
    value.totalTokens !== value.promptTokens + value.completionTokens ||
    !costsMatch(value.totalCost, audit.estimatedCost)
  ) {
    fail(code)
  }
}

function verifyProviderReport(value: unknown): VerifiedProviderReport {
  const code = 'PROVIDER_REPORT_INVALID' as const
  if (
    !hasExactKeys(value, [
      'schema',
      'ok',
      'checkedAt',
      'app',
      'provider',
      'runtime',
      'checks',
      'failures'
    ]) ||
    value.schema !== PROVIDER_REPORT_SCHEMA ||
    value.ok !== true ||
    !isCanonicalIsoTimestamp(value.checkedAt) ||
    !hasExactKeys(value.provider, ['id', 'type', 'endpoint', 'model']) ||
    value.provider.id !== 'acceptance-ollama' ||
    value.provider.type !== 'custom' ||
    value.provider.endpoint !== 'loopback-ollama' ||
    value.provider.model !== 'smollm2:135m' ||
    !hasExactKeys(value.runtime, [
      'appBundle',
      'launches',
      'targetReacquired',
      'profileRetained',
      'cleanupRequested',
      'cdpPort'
    ]) ||
    !isSafeBasename(value.runtime.appBundle) ||
    value.runtime.launches !== 3 ||
    value.runtime.targetReacquired !== true ||
    value.runtime.profileRetained !== false ||
    value.runtime.cleanupRequested !== true ||
    !isNonNegativeInteger(value.runtime.cdpPort) ||
    value.runtime.cdpPort < 1 ||
    value.runtime.cdpPort > 65_535 ||
    !hasExactKeys(value.checks, [
      ...PROVIDER_LIFECYCLE_BOOLEAN_KEYS,
      'cancellationBackgroundTitleRequests',
      'audit',
      'usage'
    ]) ||
    PROVIDER_LIFECYCLE_BOOLEAN_KEYS.some((key) => value.checks[key] !== true) ||
    (value.checks.cancellationBackgroundTitleRequests !== 0 &&
      value.checks.cancellationBackgroundTitleRequests !== 1)
  ) {
    fail(code)
  }
  verifyEmptyFailures(value.failures, code)
  const audit = verifyProviderAudit(value.checks.audit)
  verifyProviderUsage(value.checks.usage, audit)
  return {
    app: parseAppIdentity(value.app, code),
    appBundle: value.runtime.appBundle
  }
}

function verifyArtifactDigest(
  value: unknown,
  code: PackagedAiEvidenceVerificationErrorCode
): asserts value is PackagedAiEvidenceArtifactDigest {
  if (
    !hasExactKeys(value, ['sha256', 'bytes']) ||
    !isSha256(value.sha256) ||
    !isNonNegativeInteger(value.bytes) ||
    value.bytes < 1
  ) {
    fail(code)
  }
}

export function verifyPackagedAiEvidence(
  input: PackagedAiEvidenceVerificationInput
): PackagedAiEvidenceVerificationManifest {
  const tool = verifyToolReport(input.toolReport)
  const failureMatrix = verifyFailureMatrixReport(input.failureMatrixReport)
  const provider = verifyProviderReport(input.providerReport)
  const liveMcp = verifyAuxiliaryReport(
    input.liveMcpReport,
    LIVE_MCP_REPORT_SCHEMA,
    LIVE_MCP_CHECK_KEYS,
    'LIVE_MCP_REPORT_INVALID'
  )
  const privacyLifecycle = verifyAuxiliaryReport(
    input.privacyLifecycleReport,
    PRIVACY_LIFECYCLE_REPORT_SCHEMA,
    PRIVACY_LIFECYCLE_CHECK_KEYS,
    'PRIVACY_LIFECYCLE_REPORT_INVALID'
  )
  const { physicalApp } = input
  if (
    !isSafeToken(physicalApp.version) ||
    !isSafeBasename(physicalApp.bundleBasename) ||
    !isSha256(physicalApp.hashBefore) ||
    !isSha256(physicalApp.hashAfter)
  ) {
    fail('APP_BUNDLE_INVALID')
  }
  if (physicalApp.hashBefore !== physicalApp.hashAfter) fail('APP_ASAR_CHANGED')
  const identities = [tool.app, failureMatrix.app, provider.app, liveMcp.app, privacyLifecycle.app]
  if (
    identities.some(
      (identity) =>
        identity.version !== physicalApp.version || identity.hash !== physicalApp.hashBefore
    )
  ) {
    fail('EVIDENCE_IDENTITY_MISMATCH')
  }
  if (
    failureMatrix.appBundle.toLowerCase() !== physicalApp.bundleBasename.toLowerCase() ||
    provider.appBundle.toLowerCase() !== physicalApp.bundleBasename.toLowerCase()
  ) {
    fail('EVIDENCE_IDENTITY_MISMATCH')
  }
  if (liveMcp.checkedAt !== privacyLifecycle.checkedAt) {
    fail('EVIDENCE_IDENTITY_MISMATCH')
  }

  const reportKinds: ReportKind[] = [
    'tool-confirmation',
    'failure-matrix',
    'provider-lifecycle',
    'live-mcp',
    'privacy-lifecycle'
  ]
  for (const kind of reportKinds) verifyArtifactDigest(input.reports[kind], 'VERIFICATION_FAILED')

  if (input.screenshots.length !== TOOL_SCENARIOS.length) fail('SCREENSHOT_INVALID')
  TOOL_SCENARIOS.forEach((scenario, index) => {
    const screenshot = input.screenshots[index]
    if (
      !hasExactKeys(screenshot, ['scenario', 'basename', 'sha256', 'bytes']) ||
      screenshot?.scenario !== scenario ||
      screenshot.basename !== TOOL_EXPECTATIONS[scenario].screenshot ||
      !isSafeBasename(screenshot.basename) ||
      !isSha256(screenshot.sha256) ||
      !isNonNegativeInteger(screenshot.bytes) ||
      screenshot.bytes < MIN_SCREENSHOT_BYTES ||
      screenshot.bytes > MAX_SCREENSHOT_BYTES
    ) {
      fail('SCREENSHOT_INVALID')
    }
  })
  if (
    new Set(input.screenshots.map((screenshot) => screenshot.sha256)).size !== TOOL_SCENARIOS.length
  ) {
    fail('SCREENSHOT_INVALID')
  }

  const checkedAt = input.checkedAt ?? new Date().toISOString()
  if (!isCanonicalIsoTimestamp(checkedAt)) fail('VERIFICATION_FAILED')
  return {
    schema: PACKAGED_AI_EVIDENCE_VERIFICATION_SCHEMA,
    ok: true,
    checkedAt,
    scope: {
      packagedEvidenceSet: 'passed',
      overallAcceptance: 'passed',
      notVerified: []
    },
    app: {
      version: physicalApp.version,
      hash: physicalApp.hashBefore
    },
    checks: {
      physicalBundleValidated: true,
      executableValidated: true,
      appAsarHashStable: true,
      reportIdentityBound: true,
      toolConfirmationValidated: true,
      failureMatrixValidated: true,
      providerLifecycleValidated: true,
      liveMcpValidated: true,
      privacyLifecycleValidated: true
    },
    runtime: {
      toolConfirmationTimeoutMode: tool.confirmationTimeoutMode
    },
    artifacts: {
      reports: [
        {
          kind: 'tool-confirmation',
          schema: TOOL_REPORT_SCHEMA,
          sha256: input.reports['tool-confirmation'].sha256,
          bytes: input.reports['tool-confirmation'].bytes
        },
        {
          kind: 'failure-matrix',
          schema: FAILURE_MATRIX_REPORT_SCHEMA,
          sha256: input.reports['failure-matrix'].sha256,
          bytes: input.reports['failure-matrix'].bytes
        },
        {
          kind: 'provider-lifecycle',
          schema: PROVIDER_REPORT_SCHEMA,
          sha256: input.reports['provider-lifecycle'].sha256,
          bytes: input.reports['provider-lifecycle'].bytes
        },
        {
          kind: 'live-mcp',
          schema: LIVE_MCP_REPORT_SCHEMA,
          sha256: input.reports['live-mcp'].sha256,
          bytes: input.reports['live-mcp'].bytes
        },
        {
          kind: 'privacy-lifecycle',
          schema: PRIVACY_LIFECYCLE_REPORT_SCHEMA,
          sha256: input.reports['privacy-lifecycle'].sha256,
          bytes: input.reports['privacy-lifecycle'].bytes
        }
      ],
      screenshots: input.screenshots.map((screenshot) => ({
        scenario: screenshot.scenario,
        basename: screenshot.basename,
        sha256: screenshot.sha256,
        bytes: screenshot.bytes
      }))
    }
  }
}

function statIdentityMatches(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  )
}

function nodeIdentityMatches(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function readStableDirectoryReference(
  directoryPath: string,
  code: PackagedAiEvidenceVerificationErrorCode
): StableDirectoryReference {
  const resolvedPath = resolve(directoryPath)
  try {
    const snapshot = lstatSync(resolvedPath)
    if (
      snapshot.isSymbolicLink() ||
      !snapshot.isDirectory() ||
      realpathSync(resolvedPath) !== resolvedPath
    ) {
      fail(code)
    }
    return { path: resolvedPath, snapshot }
  } catch (error) {
    if (error instanceof PackagedAiEvidenceVerificationError) throw error
    fail(code)
  }
}

function assertStableDirectoryReference(
  reference: StableDirectoryReference,
  code: PackagedAiEvidenceVerificationErrorCode
): void {
  const current = readStableDirectoryReference(reference.path, code)
  if (!nodeIdentityMatches(reference.snapshot, current.snapshot)) fail(code)
}

function readStablePathSnapshot(
  filePath: string,
  code: PackagedAiEvidenceVerificationErrorCode
): Stats {
  try {
    const snapshot = lstatSync(filePath)
    if (snapshot.isSymbolicLink() || !snapshot.isFile()) fail(code)
    return snapshot
  } catch (error) {
    if (error instanceof PackagedAiEvidenceVerificationError) throw error
    fail(code)
  }
}

function readStableFile(
  filePath: string,
  options: {
    maxBytes?: number
    readCode: PackagedAiEvidenceVerificationErrorCode
    changedCode: PackagedAiEvidenceVerificationErrorCode
    verifyPathIdentity?: boolean
    afterPathSnapshot?: () => void
  }
): StableFileRead {
  let descriptor: number | undefined
  try {
    const pathBefore = options.verifyPathIdentity
      ? readStablePathSnapshot(filePath, options.changedCode)
      : undefined
    options.afterPathSnapshot?.()
    const noFollowFlag = options.verifyPathIdentity ? (fsConstants.O_NOFOLLOW ?? 0) : 0
    descriptor = openSync(filePath, fsConstants.O_RDONLY | noFollowFlag)
    const before = fstatSync(descriptor)
    if (
      !before.isFile() ||
      before.size < 1 ||
      (options.maxBytes && before.size > options.maxBytes) ||
      (pathBefore && !statIdentityMatches(pathBefore, before))
    ) {
      fail(pathBefore ? options.changedCode : options.readCode)
    }
    const buffer = Buffer.allocUnsafe(before.size)
    let offset = 0
    while (offset < buffer.length) {
      const bytesRead = readSync(descriptor, buffer, offset, buffer.length - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    const after = fstatSync(descriptor)
    if (offset !== buffer.length || !statIdentityMatches(before, after)) fail(options.changedCode)
    if (options.verifyPathIdentity) {
      const pathAfter = readStablePathSnapshot(filePath, options.changedCode)
      if (!statIdentityMatches(after, pathAfter)) fail(options.changedCode)
    }
    return {
      buffer,
      digest: {
        sha256: createHash('sha256').update(buffer).digest('hex'),
        bytes: buffer.length
      }
    }
  } catch (error) {
    if (error instanceof PackagedAiEvidenceVerificationError) throw error
    if (options.verifyPathIdentity) readStablePathSnapshot(filePath, options.changedCode)
    fail(options.readCode)
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch {
        // The verifier reports only the owning stable code.
      }
    }
  }
}

function hashStableFile(
  reference: StableFileReference,
  readCode: PackagedAiEvidenceVerificationErrorCode,
  changedCode: PackagedAiEvidenceVerificationErrorCode
): PackagedAiEvidenceArtifactDigest {
  let descriptor: number | undefined
  try {
    const pathBefore = readStablePathSnapshot(reference.path, changedCode)
    if (
      !statIdentityMatches(reference.snapshot, pathBefore) ||
      realpathSync(reference.path) !== reference.path
    ) {
      fail(changedCode)
    }
    descriptor = openSync(reference.path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const before = fstatSync(descriptor)
    if (!before.isFile() || before.size < 1 || !statIdentityMatches(reference.snapshot, before)) {
      fail(changedCode)
    }
    const hash = createHash('sha256')
    const chunk = Buffer.allocUnsafe(64 * 1024)
    let bytes = 0
    while (true) {
      const bytesRead = readSync(descriptor, chunk, 0, chunk.length, null)
      if (bytesRead === 0) break
      hash.update(chunk.subarray(0, bytesRead))
      bytes += bytesRead
    }
    const after = fstatSync(descriptor)
    const pathAfter = readStablePathSnapshot(reference.path, changedCode)
    if (
      bytes !== before.size ||
      !statIdentityMatches(before, after) ||
      !statIdentityMatches(reference.snapshot, pathAfter) ||
      realpathSync(reference.path) !== reference.path
    ) {
      fail(changedCode)
    }
    return { sha256: hash.digest('hex'), bytes }
  } catch (error) {
    if (error instanceof PackagedAiEvidenceVerificationError) throw error
    try {
      assertStableFileReference(reference, changedCode)
    } catch (stableError) {
      if (stableError instanceof PackagedAiEvidenceVerificationError) throw stableError
    }
    fail(readCode)
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch {
        // The verifier reports only the owning stable code.
      }
    }
  }
}

function readStableFileReference(
  filePath: string,
  code: PackagedAiEvidenceVerificationErrorCode
): StableFileReference {
  const resolvedPath = resolve(filePath)
  try {
    const snapshot = lstatSync(resolvedPath)
    if (
      snapshot.isSymbolicLink() ||
      !snapshot.isFile() ||
      realpathSync(resolvedPath) !== resolvedPath
    ) {
      fail(code)
    }
    return { path: resolvedPath, snapshot }
  } catch (error) {
    if (error instanceof PackagedAiEvidenceVerificationError) throw error
    fail(code)
  }
}

function assertStableFileReference(
  reference: StableFileReference,
  code: PackagedAiEvidenceVerificationErrorCode
): void {
  const current = readStableFileReference(reference.path, code)
  if (!statIdentityMatches(reference.snapshot, current.snapshot)) fail(code)
}

function resolveRealPath(inputPath: string, code: PackagedAiEvidenceVerificationErrorCode): string {
  try {
    return realpathSync(resolve(inputPath))
  } catch {
    fail(code)
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  )
}

function resolvePotentialRealPath(
  inputPath: string,
  code: PackagedAiEvidenceVerificationErrorCode
): string {
  let currentPath = resolve(inputPath)
  const missingSegments: string[] = []
  while (true) {
    try {
      return resolve(realpathSync(currentPath), ...missingSegments)
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT')) fail(code)
      const parentPath = dirname(currentPath)
      if (parentPath === currentPath) fail(code)
      missingSegments.unshift(basename(currentPath))
      currentPath = parentPath
    }
  }
}

function assertFreshOutputTarget(outputPathInput: string, bundlePath: string): string {
  const outputPath = resolve(outputPathInput)
  const canonicalTarget = resolvePotentialRealPath(outputPath, 'OUTPUT_WRITE_FAILED')
  if (canonicalTarget === bundlePath || isPathWithin(canonicalTarget, bundlePath)) {
    fail('OUTPUT_WRITE_FAILED')
  }
  try {
    lstatSync(outputPath)
    fail('OUTPUT_WRITE_FAILED')
  } catch (error) {
    if (error instanceof PackagedAiEvidenceVerificationError) throw error
    if (!hasErrorCode(error, 'ENOENT')) fail('OUTPUT_WRITE_FAILED')
  }
  return canonicalTarget
}

function resolveContainedPath(
  root: string,
  segments: readonly string[],
  code: PackagedAiEvidenceVerificationErrorCode
): string {
  try {
    const target = realpathSync(join(root, ...segments))
    if (!isPathWithin(target, root)) fail(code)
    return target
  } catch (error) {
    if (error instanceof PackagedAiEvidenceVerificationError) throw error
    fail(code)
  }
}

function readStableInfoPlist(reference: StableFileReference): {
  version: string
  executableName: string
} {
  assertStableFileReference(reference, 'APP_VERSION_INVALID')
  const artifact = readStableFile(reference.path, {
    maxBytes: MAX_INFO_PLIST_BYTES,
    readCode: 'APP_VERSION_INVALID',
    changedCode: 'APP_VERSION_INVALID',
    verifyPathIdentity: true
  })
  assertStableFileReference(reference, 'APP_VERSION_INVALID')
  let plist: unknown
  try {
    plist = parsePlist(artifact.buffer) as unknown
  } catch {
    fail('APP_VERSION_INVALID')
  }
  if (!isDataRecord(plist)) fail('APP_VERSION_INVALID')
  const version = plist.CFBundleShortVersionString
  const executableName = plist.CFBundleExecutable
  if (!isSafeToken(version) || !isSafeBasename(executableName)) fail('APP_VERSION_INVALID')
  return { version, executableName }
}

function validateAppAsar(reference: StableFileReference, expectedVersion: string): void {
  try {
    assertStableFileReference(reference, 'APP_ASAR_CHANGED')
    uncache(reference.path)
    const entries = new Set(
      listPackage(reference.path, { isPack: false }).map((entry) =>
        entry.replace(/^[/\\]+/, '').replaceAll('\\', '/')
      )
    )
    const { headerSize } = getRawHeader(reference.path)
    if (!Number.isSafeInteger(headerSize) || headerSize < 1) fail('APP_ASAR_INVALID')
    let packageJsonBuffer: Buffer | undefined
    for (const requiredEntry of REQUIRED_ASAR_ENTRIES) {
      if (!entries.has(requiredEntry)) fail('APP_ASAR_INVALID')
      const metadata = statFile(reference.path, requiredEntry, false)
      if (
        !('size' in metadata) ||
        metadata.unpacked === true ||
        !Number.isSafeInteger(metadata.size) ||
        metadata.size < 1
      ) {
        fail('APP_ASAR_INVALID')
      }
      if (!/^(?:0|[1-9]\d*)$/.test(metadata.offset)) fail('APP_ASAR_INVALID')
      const entryOffset = Number(metadata.offset)
      const dataOffset = 8 + headerSize + entryOffset
      if (
        !Number.isSafeInteger(entryOffset) ||
        !Number.isSafeInteger(dataOffset) ||
        dataOffset > reference.snapshot.size ||
        metadata.size > reference.snapshot.size - dataOffset
      ) {
        fail('APP_ASAR_INVALID')
      }
      if (requiredEntry === 'package.json') {
        if (metadata.size > MAX_ASAR_PACKAGE_JSON_BYTES) fail('APP_ASAR_INVALID')
        packageJsonBuffer = extractFile(reference.path, requiredEntry, false)
        if (packageJsonBuffer.length !== metadata.size) fail('APP_ASAR_INVALID')
      }
    }
    if (!packageJsonBuffer || packageJsonBuffer.length > MAX_ASAR_PACKAGE_JSON_BYTES) {
      fail('APP_ASAR_INVALID')
    }
    let packageJson: unknown
    try {
      packageJson = JSON.parse(packageJsonBuffer.toString('utf8')) as unknown
    } catch {
      fail('APP_ASAR_INVALID')
    }
    if (!isDataRecord(packageJson) || !isSafeToken(packageJson.version)) {
      fail('APP_VERSION_INVALID')
    }
    if (packageJson.version !== expectedVersion) fail('APP_VERSION_INVALID')
    assertStableFileReference(reference, 'APP_ASAR_CHANGED')
  } catch (error) {
    if (error instanceof PackagedAiEvidenceVerificationError) throw error
    fail('APP_ASAR_INVALID')
  } finally {
    try {
      uncache(reference.path)
    } catch {
      // A parser failure is reported through the stable ASAR code above.
    }
  }
}

function crc32(buffer: Buffer, start: number, end: number): number {
  let crc = 0xffffffff
  for (let index = start; index < end; index += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function validateScreenshotPng(buffer: Buffer): void {
  if (
    buffer.length < MIN_SCREENSHOT_BYTES ||
    buffer.length > MAX_SCREENSHOT_BYTES ||
    !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    fail('SCREENSHOT_INVALID')
  }

  let offset = PNG_SIGNATURE.length
  let chunkIndex = 0
  let width = 0
  let height = 0
  let channels = 0
  let seenIhdr = false
  let seenPlte = false
  let seenIdat = false
  let idatEnded = false
  let seenIend = false
  const idatChunks: Buffer[] = []

  while (offset < buffer.length) {
    if (buffer.length - offset < 12) fail('SCREENSHOT_INVALID')
    const length = buffer.readUInt32BE(offset)
    const typeStart = offset + 4
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const chunkEnd = dataEnd + 4
    if (dataEnd < dataStart || chunkEnd > buffer.length) fail('SCREENSHOT_INVALID')
    const type = buffer.toString('ascii', typeStart, dataStart)
    if (!/^[A-Za-z]{4}$/.test(type)) fail('SCREENSHOT_INVALID')
    if (buffer.readUInt32BE(dataEnd) !== crc32(buffer, typeStart, dataEnd)) {
      fail('SCREENSHOT_INVALID')
    }
    if (chunkIndex === 0 && type !== 'IHDR') fail('SCREENSHOT_INVALID')

    if (type === 'IHDR') {
      if (seenIhdr || length !== 13 || chunkIndex !== 0) fail('SCREENSHOT_INVALID')
      width = buffer.readUInt32BE(dataStart)
      height = buffer.readUInt32BE(dataStart + 4)
      const bitDepth = buffer[dataStart + 8]
      const colorType = buffer[dataStart + 9]
      const compression = buffer[dataStart + 10]
      const filter = buffer[dataStart + 11]
      const interlace = buffer[dataStart + 12]
      channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0
      if (
        width < MIN_SCREENSHOT_DIMENSION ||
        width > MAX_SCREENSHOT_DIMENSION ||
        height < MIN_SCREENSHOT_DIMENSION ||
        height > MAX_SCREENSHOT_DIMENSION ||
        width * height > MAX_SCREENSHOT_PIXELS ||
        bitDepth !== 8 ||
        channels === 0 ||
        compression !== 0 ||
        filter !== 0 ||
        interlace !== 0
      ) {
        fail('SCREENSHOT_INVALID')
      }
      seenIhdr = true
    } else if (type === 'PLTE') {
      if (!seenIhdr || seenPlte || seenIdat || length < 3 || length > 768 || length % 3 !== 0) {
        fail('SCREENSHOT_INVALID')
      }
      seenPlte = true
    } else if (type === 'IDAT') {
      if (!seenIhdr || seenIend || idatEnded) fail('SCREENSHOT_INVALID')
      seenIdat = true
      idatChunks.push(buffer.subarray(dataStart, dataEnd))
    } else if (type === 'IEND') {
      if (!seenIhdr || !seenIdat || seenIend || length !== 0) fail('SCREENSHOT_INVALID')
      seenIend = true
    } else {
      if (seenIdat) idatEnded = true
      if (type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90) fail('SCREENSHOT_INVALID')
    }

    offset = chunkEnd
    chunkIndex += 1
    if (seenIend) break
  }

  if (!seenIhdr || !seenIdat || !seenIend || offset !== buffer.length) {
    fail('SCREENSHOT_INVALID')
  }
  const rowBytes = width * channels
  const expectedBytes = (rowBytes + 1) * height
  let pixels: Buffer
  try {
    pixels = inflateSync(Buffer.concat(idatChunks), { maxOutputLength: expectedBytes })
  } catch {
    fail('SCREENSHOT_INVALID')
  }
  if (pixels.length !== expectedBytes) fail('SCREENSHOT_INVALID')
  for (let row = 0; row < height; row += 1) {
    if (pixels[row * (rowBytes + 1)] > 4) fail('SCREENSHOT_INVALID')
  }
}

function inspectPackagedApp(inputPath: string): PackagedAppInspection {
  const resolvedInputPath = resolve(inputPath)
  let bundleSnapshot: Stats
  let bundlePath: string
  try {
    bundleSnapshot = lstatSync(resolvedInputPath)
    if (bundleSnapshot.isSymbolicLink() || !bundleSnapshot.isDirectory()) {
      fail('APP_BUNDLE_INVALID')
    }
    bundlePath = realpathSync(resolvedInputPath)
    const canonicalSnapshot = lstatSync(bundlePath)
    if (
      canonicalSnapshot.isSymbolicLink() ||
      !canonicalSnapshot.isDirectory() ||
      !nodeIdentityMatches(bundleSnapshot, canonicalSnapshot) ||
      !bundlePath.toLowerCase().endsWith('.app')
    ) {
      fail('APP_BUNDLE_INVALID')
    }
  } catch (error) {
    if (error instanceof PackagedAiEvidenceVerificationError) throw error
    fail('APP_BUNDLE_INVALID')
  }
  const infoPlist = readStableFileReference(
    join(bundlePath, 'Contents', 'Info.plist'),
    'APP_VERSION_INVALID'
  )
  const { version, executableName } = readStableInfoPlist(infoPlist)

  const macOsRoot = resolveContainedPath(
    bundlePath,
    ['Contents', 'MacOS'],
    'APP_EXECUTABLE_INVALID'
  )
  const executable = readStableFileReference(
    join(macOsRoot, executableName),
    'APP_EXECUTABLE_INVALID'
  )
  try {
    if (!isPathWithin(executable.path, macOsRoot)) fail('APP_EXECUTABLE_INVALID')
    accessSync(executable.path, fsConstants.X_OK)
  } catch (error) {
    if (error instanceof PackagedAiEvidenceVerificationError) throw error
    fail('APP_EXECUTABLE_INVALID')
  }

  const resourcesRoot = resolveContainedPath(
    bundlePath,
    ['Contents', 'Resources'],
    'APP_ASAR_INVALID'
  )
  const appAsar = readStableFileReference(join(resourcesRoot, 'app.asar'), 'APP_ASAR_INVALID')
  if (!isPathWithin(appAsar.path, resourcesRoot)) fail('APP_ASAR_INVALID')
  validateAppAsar(appAsar, version)
  return {
    inputPath: resolvedInputPath,
    bundlePath,
    bundleBasename: basename(bundlePath),
    bundleSnapshot,
    infoPlist,
    executable,
    appAsar,
    version
  }
}

function readJsonArtifact(
  inputPath: string,
  code: PackagedAiEvidenceVerificationErrorCode,
  afterPathSnapshot?: (filePath: string) => void
): BoundedArtifact {
  const realPath = resolveRealPath(inputPath, code)
  const parentDirectory = readStableDirectoryReference(dirname(realPath), code)
  const artifact = readStableFile(realPath, {
    maxBytes: MAX_REPORT_BYTES,
    readCode: code,
    changedCode: code,
    verifyPathIdentity: true,
    afterPathSnapshot: () => afterPathSnapshot?.(realPath)
  })
  let value: unknown
  try {
    value = JSON.parse(artifact.buffer.toString('utf8')) as unknown
  } catch {
    fail(code)
  }
  assertStableDirectoryReference(parentDirectory, code)
  return { value, digest: artifact.digest, parentDirectory }
}

function readScreenshots(
  toolReport: BoundedArtifact,
  dependencies: PackagedAiEvidenceVerificationDependencies
): PackagedAiEvidenceScreenshotDigest[] {
  const reportDirectory = toolReport.parentDirectory.path
  dependencies.beforeScreenshotDirectoryValidation?.(reportDirectory)
  assertStableDirectoryReference(toolReport.parentDirectory, 'SCREENSHOT_INVALID')
  const screenshots = TOOL_SCENARIOS.map((scenario) => {
    assertStableDirectoryReference(toolReport.parentDirectory, 'SCREENSHOT_INVALID')
    const screenshotBasename = TOOL_EXPECTATIONS[scenario].screenshot
    const candidate = join(reportDirectory, screenshotBasename)
    if (dirname(candidate) !== reportDirectory) fail('SCREENSHOT_INVALID')
    const artifact = readStableFile(candidate, {
      maxBytes: MAX_SCREENSHOT_BYTES,
      readCode: 'SCREENSHOT_READ_FAILED',
      changedCode: 'SCREENSHOT_INVALID',
      verifyPathIdentity: true,
      afterPathSnapshot: () => dependencies.afterScreenshotPathSnapshot?.(candidate, scenario)
    })
    assertStableDirectoryReference(toolReport.parentDirectory, 'SCREENSHOT_INVALID')
    validateScreenshotPng(artifact.buffer)
    return {
      scenario,
      basename: screenshotBasename,
      sha256: artifact.digest.sha256,
      bytes: artifact.digest.bytes
    }
  })
  assertStableDirectoryReference(toolReport.parentDirectory, 'SCREENSHOT_INVALID')
  if (new Set(screenshots.map((screenshot) => screenshot.sha256)).size !== screenshots.length) {
    fail('SCREENSHOT_INVALID')
  }
  return screenshots
}

function verifyPhysicalPathsRemainStable(app: PackagedAppInspection): void {
  try {
    const currentBundle = lstatSync(app.inputPath)
    if (
      currentBundle.isSymbolicLink() ||
      !currentBundle.isDirectory() ||
      !nodeIdentityMatches(app.bundleSnapshot, currentBundle) ||
      realpathSync(app.inputPath) !== app.bundlePath
    ) {
      fail('APP_BUNDLE_CHANGED')
    }
  } catch (error) {
    if (error instanceof PackagedAiEvidenceVerificationError) throw error
    fail('APP_BUNDLE_CHANGED')
  }

  const plist = readStableInfoPlist(app.infoPlist)
  if (plist.version !== app.version) fail('APP_VERSION_INVALID')
  assertStableFileReference(app.executable, 'APP_EXECUTABLE_INVALID')
  if (plist.executableName !== basename(app.executable.path)) fail('APP_EXECUTABLE_INVALID')
  try {
    accessSync(app.executable.path, fsConstants.X_OK)
  } catch {
    fail('APP_EXECUTABLE_INVALID')
  }
  assertStableFileReference(app.appAsar, 'APP_ASAR_CHANGED')
}

function verifyPackagedAppIdentity(app: PackagedAppInspection, expected: AppIdentity): void {
  verifyPhysicalPathsRemainStable(app)
  if (app.version !== expected.version) fail('APP_VERSION_INVALID')
  const digest = hashStableFile(app.appAsar, 'APP_ASAR_INVALID', 'APP_ASAR_CHANGED')
  if (digest.sha256 !== expected.hash) fail('APP_ASAR_CHANGED')
  verifyPhysicalPathsRemainStable(app)
}

function preparePackagedAiEvidenceVerification(
  options: Omit<CliOptions, 'pretty'>,
  checkedAt: string,
  dependencies: PackagedAiEvidenceVerificationDependencies
): PreparedPackagedAiEvidenceVerification {
  const app = inspectPackagedApp(options.appBundle)
  const outputTarget = assertFreshOutputTarget(options.output, app.bundlePath)
  const hashBefore = hashStableFile(app.appAsar, 'APP_ASAR_INVALID', 'APP_ASAR_CHANGED')
  const tool = readJsonArtifact(options.toolReport, 'TOOL_REPORT_READ_FAILED', (filePath) =>
    dependencies.afterReportPathSnapshot?.(filePath, 'tool-confirmation')
  )
  const failureMatrix = readJsonArtifact(
    options.failureMatrixReport,
    'FAILURE_MATRIX_REPORT_READ_FAILED',
    (filePath) => dependencies.afterReportPathSnapshot?.(filePath, 'failure-matrix')
  )
  const provider = readJsonArtifact(
    options.providerReport,
    'PROVIDER_REPORT_READ_FAILED',
    (filePath) => dependencies.afterReportPathSnapshot?.(filePath, 'provider-lifecycle')
  )
  const liveMcp = readJsonArtifact(
    options.liveMcpReport,
    'LIVE_MCP_REPORT_READ_FAILED',
    (filePath) => dependencies.afterReportPathSnapshot?.(filePath, 'live-mcp')
  )
  const privacyLifecycle = readJsonArtifact(
    options.privacyLifecycleReport,
    'PRIVACY_LIFECYCLE_REPORT_READ_FAILED',
    (filePath) => dependencies.afterReportPathSnapshot?.(filePath, 'privacy-lifecycle')
  )
  const screenshots = readScreenshots(tool, dependencies)
  verifyPhysicalPathsRemainStable(app)
  const hashAfter = hashStableFile(app.appAsar, 'APP_ASAR_INVALID', 'APP_ASAR_CHANGED')
  if (hashBefore.sha256 !== hashAfter.sha256) fail('APP_ASAR_CHANGED')
  const manifest = verifyPackagedAiEvidence({
    toolReport: tool.value,
    failureMatrixReport: failureMatrix.value,
    providerReport: provider.value,
    liveMcpReport: liveMcp.value,
    privacyLifecycleReport: privacyLifecycle.value,
    physicalApp: {
      version: app.version,
      bundleBasename: app.bundleBasename,
      hashBefore: hashBefore.sha256,
      hashAfter: hashAfter.sha256
    },
    reports: {
      'tool-confirmation': tool.digest,
      'failure-matrix': failureMatrix.digest,
      'provider-lifecycle': provider.digest,
      'live-mcp': liveMcp.digest,
      'privacy-lifecycle': privacyLifecycle.digest
    },
    screenshots,
    checkedAt
  })
  if (manifest.app.hash !== hashBefore.sha256) fail('APP_ASAR_HASH_MISMATCH')
  return { manifest, outputTarget, app }
}

export function runPackagedAiEvidenceVerification(
  options: Omit<CliOptions, 'pretty'>,
  checkedAt = new Date().toISOString(),
  dependencies: PackagedAiEvidenceVerificationDependencies = {}
): PackagedAiEvidenceVerificationManifest {
  return preparePackagedAiEvidenceVerification(options, checkedAt, dependencies).manifest
}

function resolveOutputDirectoryForCleanup(
  directoryReference: StableDirectoryReference,
  parentReference: StableDirectoryReference | undefined
): string | undefined {
  try {
    const current = lstatSync(directoryReference.path)
    if (
      !current.isSymbolicLink() &&
      current.isDirectory() &&
      nodeIdentityMatches(directoryReference.snapshot, current)
    ) {
      return directoryReference.path
    }
  } catch {
    // A renamed directory may still be recoverable through its stable parent.
  }
  if (!parentReference) return undefined
  try {
    assertStableDirectoryReference(parentReference, 'OUTPUT_WRITE_FAILED')
    const entries = readdirSync(parentReference.path)
    if (entries.length > MAX_OUTPUT_DIRECTORY_RECOVERY_ENTRIES) return undefined
    for (const entry of entries) {
      const candidate = join(parentReference.path, entry)
      const snapshot = lstatSync(candidate)
      if (
        !snapshot.isSymbolicLink() &&
        snapshot.isDirectory() &&
        nodeIdentityMatches(directoryReference.snapshot, snapshot)
      ) {
        return candidate
      }
    }
  } catch {
    // Cleanup remains fail-closed if the original directory cannot be located safely.
  }
  return undefined
}

function unlinkOwnedArtifact(
  directoryPath: string | undefined,
  artifactBasename: string,
  artifactIdentity: Stats,
  directoryIdentity: Stats
): void {
  if (!directoryPath) return
  try {
    const directoryBefore = lstatSync(directoryPath)
    if (
      directoryBefore.isSymbolicLink() ||
      !directoryBefore.isDirectory() ||
      !nodeIdentityMatches(directoryIdentity, directoryBefore)
    ) {
      return
    }
    const artifactPath = join(directoryPath, artifactBasename)
    const artifactSnapshot = lstatSync(artifactPath)
    if (
      artifactSnapshot.isSymbolicLink() ||
      !artifactSnapshot.isFile() ||
      !nodeIdentityMatches(artifactIdentity, artifactSnapshot)
    ) {
      return
    }
    const directoryAfter = lstatSync(directoryPath)
    if (!nodeIdentityMatches(directoryBefore, directoryAfter)) return
    unlinkSync(artifactPath)
  } catch {
    // Never remove a path that cannot be proven to belong to this invocation.
  }
}

function writePackagedAiEvidenceOutputAtomicWithApp(
  outputPathInput: string,
  serialized: string,
  expectedOutputTarget: string,
  app: PackagedAppInspection,
  expectedAppIdentity: AppIdentity,
  dependencies: PackagedAiEvidenceVerificationDependencies = {}
): void {
  const bundlePath = app.bundlePath
  const outputPath = resolve(outputPathInput)
  const requestedOutputDirectory = dirname(outputPath)
  const expectedOutputDirectory = dirname(expectedOutputTarget)
  let canonicalOutputPath: string | undefined
  let temporaryPath: string | undefined
  let descriptor: number | undefined
  let directoryDescriptor: number | undefined
  let directoryReference: StableDirectoryReference | undefined
  let parentDirectoryReference: StableDirectoryReference | undefined
  let published = false
  let publishedIdentity: Stats | undefined
  try {
    verifyPackagedAppIdentity(app, expectedAppIdentity)
    const prospectiveOutputDirectory = resolvePotentialRealPath(
      requestedOutputDirectory,
      'OUTPUT_WRITE_FAILED'
    )
    if (
      prospectiveOutputDirectory !== expectedOutputDirectory ||
      prospectiveOutputDirectory === bundlePath ||
      isPathWithin(prospectiveOutputDirectory, bundlePath)
    ) {
      fail('OUTPUT_WRITE_FAILED')
    }
    mkdirSync(requestedOutputDirectory, { recursive: true })
    const canonicalOutputDirectory = resolveRealPath(
      requestedOutputDirectory,
      'OUTPUT_WRITE_FAILED'
    )
    if (
      canonicalOutputDirectory !== expectedOutputDirectory ||
      canonicalOutputDirectory === bundlePath ||
      isPathWithin(canonicalOutputDirectory, bundlePath)
    ) {
      fail('OUTPUT_WRITE_FAILED')
    }
    directoryReference = readStableDirectoryReference(
      canonicalOutputDirectory,
      'OUTPUT_WRITE_FAILED'
    )
    const parentDirectory = dirname(canonicalOutputDirectory)
    if (parentDirectory !== canonicalOutputDirectory) {
      parentDirectoryReference = readStableDirectoryReference(
        parentDirectory,
        'OUTPUT_WRITE_FAILED'
      )
    }
    canonicalOutputPath = join(canonicalOutputDirectory, basename(outputPath))
    if (
      assertFreshOutputTarget(canonicalOutputPath, bundlePath) !== expectedOutputTarget ||
      expectedOutputTarget === bundlePath ||
      isPathWithin(expectedOutputTarget, bundlePath)
    ) {
      fail('OUTPUT_WRITE_FAILED')
    }
    directoryDescriptor = openSync(
      canonicalOutputDirectory,
      fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0)
    )
    if (!nodeIdentityMatches(directoryReference.snapshot, fstatSync(directoryDescriptor))) {
      fail('OUTPUT_WRITE_FAILED')
    }
    dependencies.afterOutputDirectorySnapshot?.(canonicalOutputDirectory)
    assertStableDirectoryReference(directoryReference, 'OUTPUT_WRITE_FAILED')
    temporaryPath = join(
      canonicalOutputDirectory,
      `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`
    )
    descriptor = openSync(temporaryPath, 'wx', 0o600)
    assertStableDirectoryReference(directoryReference, 'OUTPUT_WRITE_FAILED')
    writeFileSync(descriptor, `${serialized}\n`, 'utf8')
    fsyncSync(descriptor)
    verifyPackagedAppIdentity(app, expectedAppIdentity)
    linkSync(temporaryPath, canonicalOutputPath)
    published = true
    publishedIdentity = fstatSync(descriptor)
    assertStableDirectoryReference(directoryReference, 'OUTPUT_WRITE_FAILED')
    const outputSnapshot = readStablePathSnapshot(canonicalOutputPath, 'OUTPUT_WRITE_FAILED')
    if (
      !nodeIdentityMatches(publishedIdentity, outputSnapshot) ||
      resolveRealPath(canonicalOutputPath, 'OUTPUT_WRITE_FAILED') !== expectedOutputTarget
    ) {
      fail('OUTPUT_WRITE_FAILED')
    }
    fsyncSync(directoryDescriptor)
    unlinkSync(temporaryPath)
    temporaryPath = undefined
    fsyncSync(directoryDescriptor)
    dependencies.afterOutputPublished?.(canonicalOutputPath)
    verifyPackagedAppIdentity(app, expectedAppIdentity)
    assertStableDirectoryReference(directoryReference, 'OUTPUT_WRITE_FAILED')
    const finalOutputSnapshot = readStablePathSnapshot(canonicalOutputPath, 'OUTPUT_WRITE_FAILED')
    if (
      !nodeIdentityMatches(publishedIdentity, finalOutputSnapshot) ||
      resolveRealPath(canonicalOutputPath, 'OUTPUT_WRITE_FAILED') !== expectedOutputTarget
    ) {
      fail('OUTPUT_WRITE_FAILED')
    }
    fsyncSync(directoryDescriptor)
    try {
      closeSync(descriptor)
    } catch {
      // The inode is already durable; a close error must not create a false failed run.
    }
    descriptor = undefined
    try {
      closeSync(directoryDescriptor)
    } catch {
      // The directory was synced before close.
    }
    directoryDescriptor = undefined
  } catch (error) {
    let artifactIdentity = publishedIdentity
    if (!artifactIdentity && descriptor !== undefined) {
      try {
        artifactIdentity = fstatSync(descriptor)
      } catch {
        // Cleanup below remains fail-closed when the published inode is unknown.
      }
    }
    if (published && descriptor !== undefined) {
      try {
        ftruncateSync(descriptor, 0)
        fsyncSync(descriptor)
      } catch {
        // Best effort still prefers an invalid inode over a residual ok:true manifest.
      }
    }
    const cleanupDirectory =
      directoryReference &&
      resolveOutputDirectoryForCleanup(directoryReference, parentDirectoryReference)
    if (published && artifactIdentity && canonicalOutputPath && directoryReference) {
      unlinkOwnedArtifact(
        cleanupDirectory,
        basename(canonicalOutputPath),
        artifactIdentity,
        directoryReference.snapshot
      )
    }
    if (temporaryPath && artifactIdentity && directoryReference) {
      unlinkOwnedArtifact(
        cleanupDirectory,
        basename(temporaryPath),
        artifactIdentity,
        directoryReference.snapshot
      )
    }
    if (directoryDescriptor !== undefined) {
      try {
        fsyncSync(directoryDescriptor)
      } catch {
        // The stable output code owns cleanup sync failures.
      }
    }
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch {
        // The stable output code owns close failures.
      }
    }
    if (directoryDescriptor !== undefined) {
      try {
        closeSync(directoryDescriptor)
      } catch {
        // The stable output code owns directory close failures.
      }
    }
    if (error instanceof PackagedAiEvidenceVerificationError) throw error
    fail('OUTPUT_WRITE_FAILED')
  }
}

function readSerializedManifestIdentity(serialized: string): AppIdentity {
  let manifest: unknown
  try {
    manifest = JSON.parse(serialized) as unknown
  } catch {
    fail('OUTPUT_WRITE_FAILED')
  }
  if (!isDataRecord(manifest)) fail('OUTPUT_WRITE_FAILED')
  return parseAppIdentity(manifest.app, 'OUTPUT_WRITE_FAILED')
}

export function writePackagedAiEvidenceOutputAtomic(
  outputPathInput: string,
  serialized: string,
  expectedOutputTarget: string,
  bundlePath: string,
  dependencies: PackagedAiEvidenceVerificationDependencies = {}
): void {
  const app = inspectPackagedApp(bundlePath)
  writePackagedAiEvidenceOutputAtomicWithApp(
    outputPathInput,
    serialized,
    expectedOutputTarget,
    app,
    readSerializedManifestIdentity(serialized),
    dependencies
  )
}

function printUsage(): void {
  process.stdout.write(`Usage:
  corepack pnpm -C "apps/core-app" run acceptance:packaged:ai-verify -- [options]

Options:
  --appBundle <path>            Packaged macOS .app bundle.
  --toolReport <file>           Tool confirmation acceptance JSON.
  --failureMatrixReport <file>  Fixed failure matrix acceptance JSON.
  --providerReport <file>       Real Provider lifecycle acceptance JSON.
  --liveMcpReport <file>        Opt-in live MCP acceptance JSON.
  --privacyLifecycleReport <file> Durable orchestrator Privacy lifecycle JSON.
  --output <file>               New atomic manifest path; existing files are never replaced.
  --compact                     Print compact JSON.
  --help                        Show this help.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const values: Partial<Omit<CliOptions, 'pretty'>> = {}
  const seen = new Set<string>()
  let pretty = true
  const valueOptions = [
    '--appBundle',
    '--toolReport',
    '--failureMatrixReport',
    '--providerReport',
    '--liveMcpReport',
    '--privacyLifecycleReport',
    '--output'
  ] as const
  const propertyByOption = {
    '--appBundle': 'appBundle',
    '--toolReport': 'toolReport',
    '--failureMatrixReport': 'failureMatrixReport',
    '--providerReport': 'providerReport',
    '--liveMcpReport': 'liveMcpReport',
    '--privacyLifecycleReport': 'privacyLifecycleReport',
    '--output': 'output'
  } as const

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--') continue
    if (argument === '--help' || argument === '-h') {
      printUsage()
      return null
    }
    if (argument === '--compact') {
      if (seen.has(argument)) fail('ARGUMENT_INVALID')
      seen.add(argument)
      pretty = false
      continue
    }
    if ((valueOptions as readonly string[]).includes(argument)) {
      if (seen.has(argument)) fail('ARGUMENT_INVALID')
      const next = argv[index + 1]
      if (!next || next.startsWith('--')) fail('ARGUMENT_INVALID')
      seen.add(argument)
      values[propertyByOption[argument as (typeof valueOptions)[number]]] = next
      index += 1
      continue
    }
    fail('ARGUMENT_INVALID')
  }

  if (
    !values.appBundle ||
    !values.toolReport ||
    !values.failureMatrixReport ||
    !values.providerReport ||
    !values.liveMcpReport ||
    !values.privacyLifecycleReport ||
    !values.output
  ) {
    fail('ARGUMENT_INVALID')
  }
  return { ...values, pretty } as CliOptions
}

function errorCodeOf(error: unknown): PackagedAiEvidenceVerificationErrorCode {
  return error instanceof PackagedAiEvidenceVerificationError ? error.code : 'VERIFICATION_FAILED'
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return
  const dependencies: PackagedAiEvidenceVerificationDependencies = {}
  const prepared = preparePackagedAiEvidenceVerification(
    options,
    new Date().toISOString(),
    dependencies
  )
  const manifest = prepared.manifest
  const serialized = JSON.stringify(manifest, null, options.pretty ? 2 : 0)
  writePackagedAiEvidenceOutputAtomicWithApp(
    options.output,
    serialized,
    prepared.outputTarget,
    prepared.app,
    manifest.app,
    dependencies
  )
  process.stdout.write(`${serialized}\n`)
}

function isMainEntryFallback(): boolean {
  if (!process.argv[1]) return false
  const entryPath = resolve(process.argv[1])
  const modulePath = fileURLToPath(import.meta.url)
  if (entryPath === modulePath) return true
  try {
    return realpathSync(entryPath) === realpathSync(modulePath)
  } catch {
    return false
  }
}

try {
  if (import.meta.main || isMainEntryFallback()) {
    main()
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      schema: PACKAGED_AI_EVIDENCE_VERIFICATION_SCHEMA,
      ok: false,
      code: errorCodeOf(error)
    })}\n`
  )
  process.exitCode = 1
}
