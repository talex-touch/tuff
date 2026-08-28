#!/usr/bin/env tsx
import { createClient } from '@libsql/client'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { constants as fsConstants, createReadStream } from 'node:fs'
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { readFile as readPlist } from 'simple-plist'
import {
  INTELLIGENCE_CONVERSATION_TITLE_OPERATION,
  INTELLIGENCE_HOME_SURFACE
} from '@talex-touch/utils/types/intelligence'
import {
  providerCredentialSecureStoreKey,
  PROVIDER_SECURE_STORE_PURPOSE
} from '../src/main/modules/ai/provider-credential-service'
import { getSecureStoreValueStrict } from '../src/main/utils/secure-store'
import {
  loadTargets,
  withTarget,
  type CdpSend,
  type DevToolsTarget
} from './coreapp-packaged-ai-ask-probe'

export const ACCEPTANCE_PROVIDER_ID = 'acceptance-ollama'
export const ACCEPTANCE_PROVIDER_TYPE = 'custom'
export const ACCEPTANCE_PROVIDER_NAME = 'Acceptance Ollama'
export const ACCEPTANCE_PROVIDER_BASE_URL = 'http://127.0.0.1:11434/v1'
export const ACCEPTANCE_PROVIDER_MODEL = 'smollm2:135m'
export const PROVIDER_ACCEPTANCE_SCHEMA = 'tuff.packaged-ai-provider-acceptance.v1'

const PROFILE_TEMP_PREFIX = 'tuff-ai-provider-'
const PROFILE_MARKER_FILE = '.tuff-ai-provider-acceptance.json'
const PROFILE_MARKER_SCHEMA = 'tuff.packaged-ai-provider-acceptance.v1'
const STORAGE_KEY = 'storage:aisdk-config'
export const INTELLIGENCE_AUDIT_FLUSH_INTERVAL_MS = 30_000
export const CANCELLATION_LEDGER_OBSERVATION_MS = INTELLIGENCE_AUDIT_FLUSH_INTERVAL_MS + 2_000
const FIRST_HOME_PROMPT =
  'Explain why isolated software tests are useful in one paragraph of at least eighty words.'
const SECOND_HOME_PROMPT =
  'Continue with one paragraph of at least eighty words about deterministic test evidence.'
const CANCEL_HOME_PROMPT =
  'Write a detailed five-hundred-word guide to reliable desktop application testing.'

interface CliOptions {
  appBundle: string
  userDataDir?: string
  remoteDebuggingPort: number
  launchTimeoutMs: number
  output?: string
  cleanup: boolean
  pretty: boolean
}

interface AcceptanceFailure {
  stage: string
  code: string
}

interface ProviderStorageSnapshot {
  found: boolean
  hasCredential: boolean
  hasAuthRef: boolean
  hasOwnApiKey: boolean
  credentialInputEmpty: boolean
}

interface HomeStreamObservation {
  submittedAt: number
  completedAt: number
  observedBusyDelta: boolean
  busyDeltaSamples: number
}

interface ConversationRouteObservation {
  route: string
  workingTitleRetained: boolean
}

export interface SecureStoreInspection {
  keyPresent: boolean
  envelopeValid: boolean
}

export interface AuditRowLike {
  id?: unknown
  trace_id?: unknown
  timestamp?: unknown
  capability_id?: unknown
  provider?: unknown
  model?: unknown
  caller?: unknown
  prompt_tokens?: unknown
  completion_tokens?: unknown
  total_tokens?: unknown
  estimated_cost?: unknown
  latency?: unknown
  success?: unknown
  metadata?: unknown
}

export interface AuditSummary {
  matched: number
  success: number
  failure: number
  uniqueTraceCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
  invalidNumericRows: number
  invalidIdentityRows: number
  invalidOperationRows: number
  homeConversationRequests: number
  conversationTitleRequests: number
  expectedSuccessfulRequests: number
  expectedHomeConversationRequests: number
  expectedConversationTitleRequests: number
  passed: boolean
}

export interface UsageRowLike {
  caller_id?: unknown
  caller_type?: unknown
  period?: unknown
  period_type?: unknown
  request_count?: unknown
  success_count?: unknown
  failure_count?: unknown
  total_tokens?: unknown
  prompt_tokens?: unknown
  completion_tokens?: unknown
  total_cost?: unknown
}

export interface UsageDeltaSummary {
  dayRows: number
  monthRows: number
  requestCount: number
  successCount: number
  failureCount: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalCost: number
  invalidRows: number
  passed: boolean
}

export interface CancellationLedgerSummary {
  homeAuditUnchanged: boolean
  backgroundTitleRequests: number
  audit: AuditSummary
  usage: UsageDeltaSummary
  passed: boolean
}

export interface LedgerSnapshot {
  auditRowCount: number
  auditMaxId: number
  usageRows: UsageRowLike[]
}

interface AcceptanceReport {
  schema: typeof PROVIDER_ACCEPTANCE_SCHEMA
  ok: boolean
  checkedAt: string
  app: {
    version: string
    hash: string
  }
  provider: {
    id: string
    type: 'custom'
    endpoint: 'loopback-ollama'
    model: string
  }
  runtime: {
    appBundle: string
    cdpPort?: number
    launches: number
    targetReacquired: boolean
    profileRetained: boolean
    cleanupRequested: boolean
  }
  checks: {
    ollamaReachable: boolean
    modelAvailable: boolean
    credentialSaved: boolean
    credentialSavedExact: boolean
    connectionTested: boolean
    firstHomeStreamCompleted: boolean
    firstHomeObservedBusyDelta: boolean
    titleRequestStabilized: boolean
    credentialRestoredAfterRelaunch: boolean
    credentialRestoredExact: boolean
    secondHomeStreamCompleted: boolean
    secondHomeObservedBusyDelta: boolean
    cancellationObservedBusyDelta: boolean
    cancellationSettled: boolean
    cancellationFlushWindowObserved: boolean
    cancellationHomeAuditAbsent: boolean
    cancellationBackgroundTitleRequests: number
    cancellationLedgerAccounted: boolean
    providerDeletedThroughUi: boolean
    secureStoreEnvelopeValid: boolean
    secureStoreKeyDeleted: boolean
    localSecretFilePresent: boolean
    credentialCanaryAbsent: boolean
    audit?: AuditSummary
    usage?: UsageDeltaSummary
  }
  failures: AcceptanceFailure[]
}

interface LaunchPaths {
  userDataDir: string
  homeDir: string
  codexHome: string
  tempDir: string
  fileProviderRoot: string
  missingPiPath: string
  piAgentDir: string
}

interface PreparedProfile {
  userDataDir: string
  createdByRunner: boolean
}

type AcceptanceAuditOperation =
  | typeof INTELLIGENCE_HOME_SURFACE
  | typeof INTELLIGENCE_CONVERSATION_TITLE_OPERATION

class AcceptanceError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

function fail(code: string): never {
  throw new AcceptanceError(code)
}

function printUsage(): void {
  console.log(`Usage:
  corepack pnpm -C "apps/core-app" run acceptance:packaged:ai-provider -- [options]

Options:
  --appBundle <path>          Packaged macOS .app. Default: dist/mac-arm64/tuff.app.
  --userDataDir <path>       Dedicated acceptance profile. A non-empty directory needs the runner marker.
  --remoteDebuggingPort <n>  CDP port. Default: choose an unused loopback port.
  --launchTimeoutMs <n>      Per-launch renderer timeout. Default: 60000.
  --output <path>            Write the redacted JSON report in addition to stdout.
  --cleanup                  Delete only a profile this run created with mkdtemp (default).
  --retain-profile           Keep the marker-owned profile for local debugging.
  --compact                  Print single-line JSON.
  --help                     Show this help.

An explicit --userDataDir is always retained. The runner never attaches to an existing Tuff
process and only terminates the child process group that it launches itself.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    appBundle: path.resolve(process.cwd(), 'dist/mac-arm64/tuff.app'),
    remoteDebuggingPort: 0,
    launchTimeoutMs: 60_000,
    cleanup: true,
    pretty: true
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--appBundle' && argv[index + 1]) {
      options.appBundle = path.resolve(process.cwd(), argv[++index])
      continue
    }
    if (arg === '--userDataDir' && argv[index + 1]) {
      options.userDataDir = path.resolve(process.cwd(), argv[++index])
      continue
    }
    if (arg === '--remoteDebuggingPort' && argv[index + 1]) {
      options.remoteDebuggingPort = parsePositiveInteger(argv[++index], arg, true)
      continue
    }
    if (arg === '--launchTimeoutMs' && argv[index + 1]) {
      options.launchTimeoutMs = parsePositiveInteger(argv[++index], arg)
      continue
    }
    if (arg === '--output' && argv[index + 1]) {
      options.output = path.resolve(process.cwd(), argv[++index])
      continue
    }
    if (arg === '--cleanup') {
      options.cleanup = true
      continue
    }
    if (arg === '--retain-profile') {
      options.cleanup = false
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

function parsePositiveInteger(value: string, flag: string, allowZero = false): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1) || parsed > 65_535) {
    throw new Error(`Invalid ${flag}`)
  }
  return parsed
}

export function isLoopbackOllamaBaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      url.port === '11434' &&
      url.pathname.replace(/\/+$/, '') === '/v1' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}

export function buildSeedIntelligenceConfig(): Record<string, unknown> {
  return {
    providers: [
      {
        id: ACCEPTANCE_PROVIDER_ID,
        name: ACCEPTANCE_PROVIDER_NAME,
        type: ACCEPTANCE_PROVIDER_TYPE,
        enabled: true,
        priority: 1,
        baseUrl: ACCEPTANCE_PROVIDER_BASE_URL,
        models: [ACCEPTANCE_PROVIDER_MODEL],
        defaultModel: ACCEPTANCE_PROVIDER_MODEL,
        timeout: 30_000,
        rateLimit: {},
        capabilities: ['text.chat'],
        metadata: {
          origin: 'packaged-acceptance',
          endpoint: 'loopback-ollama'
        }
      }
    ],
    globalConfig: {
      defaultStrategy: 'rule-based-default',
      enableAudit: true,
      enableCache: false,
      enableQuota: true,
      cacheExpiration: 3600
    },
    capabilities: {
      'text.chat': {
        id: 'text.chat',
        label: 'Chat',
        description: 'Packaged acceptance chat route',
        providers: [{ providerId: ACCEPTANCE_PROVIDER_ID, priority: 1, enabled: true }]
      }
    },
    promptRegistry: [],
    promptBindings: [],
    version: 2
  }
}

export function buildPackagedProviderLaunchEnv(
  baseEnv: NodeJS.ProcessEnv,
  paths: LaunchPaths
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  const forbiddenName =
    /(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)(?:_|$)|^(?:TUFF|PI|CODEX|CLAUDE|OPENAI|ANTHROPIC|GEMINI|GOOGLE_AI|MISTRAL|GROQ|DEEPSEEK|OPENROUTER|OLLAMA|NEXUS|AZURE|AWS|SSH)_|^(?:HTTP|HTTPS|ALL|NO)_PROXY$/i
  for (const [key, value] of Object.entries(baseEnv)) {
    if (
      value === undefined ||
      forbiddenName.test(key) ||
      key === 'ELECTRON_RUN_AS_NODE' ||
      key === 'NODE_OPTIONS' ||
      key === 'NODE_EXTRA_CA_CERTS' ||
      key === 'HOME' ||
      key === 'TMPDIR'
    ) {
      continue
    }
    env[key] = value
  }
  return {
    ...env,
    FORCE_COLOR: '0',
    HOME: paths.homeDir,
    CODEX_HOME: paths.codexHome,
    TMPDIR: paths.tempDir,
    XDG_CACHE_HOME: path.join(paths.homeDir, '.cache'),
    XDG_CONFIG_HOME: path.join(paths.homeDir, '.config'),
    XDG_DATA_HOME: path.join(paths.homeDir, '.local', 'share'),
    TUFF_PACKAGED_ACCEPTANCE_ISOLATED: '1',
    TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: paths.userDataDir,
    TUFF_FILE_PROVIDER_BASE_WATCH_PATHS: paths.fileProviderRoot,
    TUFF_PI_CLI_PATH: paths.missingPiPath,
    PI_CODING_AGENT_DIR: paths.piAgentDir,
    TUFF_DISABLE_NATIVE_OCR: '1'
  }
}

export function inspectSecureStoreDocument(
  rawDocument: string,
  secureStoreKey: string
): SecureStoreInspection {
  try {
    const document = JSON.parse(rawDocument) as unknown
    if (!document || typeof document !== 'object' || Array.isArray(document)) {
      return { keyPresent: false, envelopeValid: false }
    }
    const encrypted = (document as Record<string, unknown>)[secureStoreKey]
    if (typeof encrypted !== 'string') return { keyPresent: false, envelopeValid: false }
    const envelope = JSON.parse(encrypted) as Record<string, unknown>
    return {
      keyPresent: true,
      envelopeValid:
        envelope.v === 1 &&
        envelope.backend === 'local-secret' &&
        envelope.alg === 'A256GCM' &&
        typeof envelope.kid === 'string' &&
        typeof envelope.n === 'string' &&
        typeof envelope.c === 'string' &&
        typeof envelope.t === 'string'
    }
  } catch {
    return { keyPresent: false, envelopeValid: false }
  }
}

function asNonNegativeNumber(value: unknown): number | null {
  if (typeof value === 'bigint') {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return Number(value)
  }
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function auditOperationOf(value: unknown): AcceptanceAuditOperation | null {
  let metadata: unknown = value
  if (typeof value === 'string') {
    try {
      metadata = JSON.parse(value) as unknown
    } catch {
      return null
    }
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const descriptor = Object.getOwnPropertyDescriptor(metadata, 'operation')
  if (!descriptor || !('value' in descriptor)) return null
  return descriptor.value === INTELLIGENCE_HOME_SURFACE ||
    descriptor.value === INTELLIGENCE_CONVERSATION_TITLE_OPERATION
    ? descriptor.value
    : null
}

export function summarizeAuditRows(
  rows: AuditRowLike[],
  expectation: {
    minIdExclusive: number
    startedAt: number
    expectedHomeConversationRequests: number
    expectedConversationTitleRequests: number
  }
): AuditSummary {
  const matched = rows.filter(
    (row) =>
      asNonNegativeNumber(row.id) !== null &&
      Number(row.id) > expectation.minIdExclusive &&
      asNonNegativeNumber(row.timestamp) !== null &&
      Number(row.timestamp) >= expectation.startedAt &&
      row.capability_id === 'text.chat'
  )
  let success = 0
  let failure = 0
  let promptTokens = 0
  let completionTokens = 0
  let totalTokens = 0
  let estimatedCost = 0
  let invalidNumericRows = 0
  let invalidIdentityRows = 0
  let invalidOperationRows = 0
  let homeConversationRequests = 0
  let conversationTitleRequests = 0
  const traceIds = new Set<string>()

  for (const row of matched) {
    const values = [
      asNonNegativeNumber(row.prompt_tokens),
      asNonNegativeNumber(row.completion_tokens),
      asNonNegativeNumber(row.total_tokens),
      asNonNegativeNumber(row.estimated_cost),
      asNonNegativeNumber(row.latency)
    ]
    if (values.some((value) => value === null) || values[2] !== values[0]! + values[1]!) {
      invalidNumericRows += 1
      continue
    }
    const operation = auditOperationOf(row.metadata)
    const traceId = typeof row.trace_id === 'string' ? row.trace_id.trim() : ''
    const callerValid = row.caller == null || row.caller === 'system'
    if (
      !traceId ||
      traceIds.has(traceId) ||
      row.model !== ACCEPTANCE_PROVIDER_MODEL ||
      !callerValid ||
      (operation !== null && !isAcceptanceAuditProviderForOperation(row.provider, operation))
    ) {
      invalidIdentityRows += 1
    } else {
      traceIds.add(traceId)
    }
    if (operation === INTELLIGENCE_HOME_SURFACE) homeConversationRequests += 1
    else if (operation === INTELLIGENCE_CONVERSATION_TITLE_OPERATION) {
      conversationTitleRequests += 1
    } else invalidOperationRows += 1
    promptTokens += values[0]!
    completionTokens += values[1]!
    totalTokens += values[2]!
    estimatedCost += values[3]!
    if (row.success === true || row.success === 1 || row.success === '1') success += 1
    else failure += 1
  }

  const expectedSuccessfulRequests =
    expectation.expectedHomeConversationRequests + expectation.expectedConversationTitleRequests
  return {
    matched: matched.length,
    success,
    failure,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCost,
    invalidNumericRows,
    invalidIdentityRows,
    invalidOperationRows,
    homeConversationRequests,
    conversationTitleRequests,
    uniqueTraceCount: traceIds.size,
    expectedSuccessfulRequests,
    expectedHomeConversationRequests: expectation.expectedHomeConversationRequests,
    expectedConversationTitleRequests: expectation.expectedConversationTitleRequests,
    passed:
      matched.length === expectedSuccessfulRequests &&
      success === expectedSuccessfulRequests &&
      failure === 0 &&
      invalidNumericRows === 0 &&
      invalidIdentityRows === 0 &&
      invalidOperationRows === 0 &&
      homeConversationRequests === expectation.expectedHomeConversationRequests &&
      conversationTitleRequests === expectation.expectedConversationTitleRequests &&
      traceIds.size === expectedSuccessfulRequests
  }
}

interface NormalizedUsageRow {
  key: string
  callerType: 'system'
  periodType: 'day' | 'month'
  requestCount: number
  successCount: number
  failureCount: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalCost: number
}

function normalizeUsageRow(row: UsageRowLike): NormalizedUsageRow | null {
  const periodType = row.period_type
  const period = typeof row.period === 'string' ? row.period : ''
  if (
    row.caller_id !== 'system' ||
    row.caller_type !== 'system' ||
    (periodType !== 'day' && periodType !== 'month') ||
    !period.startsWith(`${periodType}:`)
  ) {
    return null
  }
  const values = [
    asNonNegativeNumber(row.request_count),
    asNonNegativeNumber(row.success_count),
    asNonNegativeNumber(row.failure_count),
    asNonNegativeNumber(row.total_tokens),
    asNonNegativeNumber(row.prompt_tokens),
    asNonNegativeNumber(row.completion_tokens),
    asNonNegativeNumber(row.total_cost)
  ]
  if (
    values.some((value) => value === null) ||
    values[0] !== values[1]! + values[2]! ||
    values[3] !== values[4]! + values[5]!
  ) {
    return null
  }
  return {
    key: `${row.caller_id}:${row.caller_type}:${periodType}:${period}`,
    callerType: 'system',
    periodType,
    requestCount: values[0]!,
    successCount: values[1]!,
    failureCount: values[2]!,
    totalTokens: values[3]!,
    promptTokens: values[4]!,
    completionTokens: values[5]!,
    totalCost: values[6]!
  }
}

export function summarizeUsageDelta(
  beforeRows: UsageRowLike[],
  afterRows: UsageRowLike[],
  audit: AuditSummary
): UsageDeltaSummary {
  const before = new Map<string, NormalizedUsageRow>()
  let invalidRows = 0
  for (const row of beforeRows) {
    const normalized = normalizeUsageRow(row)
    if (normalized) before.set(normalized.key, normalized)
    else invalidRows += 1
  }

  const byType = {
    day: {
      rows: 0,
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0
    },
    month: {
      rows: 0,
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0
    }
  }

  for (const row of afterRows) {
    const normalized = normalizeUsageRow(row)
    if (!normalized) {
      invalidRows += 1
      continue
    }
    const previous = before.get(normalized.key)
    const delta = {
      requestCount: normalized.requestCount - (previous?.requestCount ?? 0),
      successCount: normalized.successCount - (previous?.successCount ?? 0),
      failureCount: normalized.failureCount - (previous?.failureCount ?? 0),
      totalTokens: normalized.totalTokens - (previous?.totalTokens ?? 0),
      promptTokens: normalized.promptTokens - (previous?.promptTokens ?? 0),
      completionTokens: normalized.completionTokens - (previous?.completionTokens ?? 0),
      totalCost: normalized.totalCost - (previous?.totalCost ?? 0)
    }
    if (Object.values(delta).some((value) => !Number.isFinite(value) || value < 0)) {
      invalidRows += 1
      continue
    }
    if (Object.values(delta).every((value) => value === 0)) continue
    const target = byType[normalized.periodType]
    target.rows += 1
    for (const key of Object.keys(delta) as Array<keyof typeof delta>) {
      target[key] += delta[key]
    }
  }

  const approximatelyEqual = (left: number, right: number): boolean =>
    Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 16
  const matchesAudit = (value: (typeof byType)['day']): boolean =>
    value.requestCount === audit.matched &&
    value.successCount === audit.success &&
    value.failureCount === audit.failure &&
    value.totalTokens === audit.totalTokens &&
    value.promptTokens === audit.promptTokens &&
    value.completionTokens === audit.completionTokens &&
    approximatelyEqual(value.totalCost, audit.estimatedCost)

  return {
    dayRows: byType.day.rows,
    monthRows: byType.month.rows,
    requestCount: byType.day.requestCount,
    successCount: byType.day.successCount,
    failureCount: byType.day.failureCount,
    totalTokens: byType.day.totalTokens,
    promptTokens: byType.day.promptTokens,
    completionTokens: byType.day.completionTokens,
    totalCost: byType.day.totalCost,
    invalidRows,
    passed:
      audit.passed &&
      invalidRows === 0 &&
      byType.day.rows > 0 &&
      byType.month.rows > 0 &&
      matchesAudit(byType.day) &&
      matchesAudit(byType.month)
  }
}

export function summarizeCancellationLedger(
  rows: AuditRowLike[],
  before: LedgerSnapshot,
  after: LedgerSnapshot,
  expectation: {
    minIdExclusive: number
    startedAt: number
    expectedBackgroundTitleRequests: number
  }
): CancellationLedgerSummary {
  const expectedTitleCountValid =
    expectation.expectedBackgroundTitleRequests === 0 ||
    expectation.expectedBackgroundTitleRequests === 1
  const audit = summarizeAuditRows(rows, {
    minIdExclusive: expectation.minIdExclusive,
    startedAt: expectation.startedAt,
    expectedHomeConversationRequests: 0,
    expectedConversationTitleRequests: expectation.expectedBackgroundTitleRequests
  })
  const noLedgerDelta = ledgerSnapshotsEqual(before, after)
  const usage =
    expectation.expectedBackgroundTitleRequests === 0
      ? {
          dayRows: 0,
          monthRows: 0,
          requestCount: 0,
          successCount: 0,
          failureCount: 0,
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalCost: 0,
          invalidRows: 0,
          passed: noLedgerDelta
        }
      : summarizeUsageDelta(before.usageRows, after.usageRows, audit)
  const backgroundTitleRequests = audit.conversationTitleRequests
  const homeAuditUnchanged = audit.homeConversationRequests === 0
  const auditRowDelta = after.auditRowCount - before.auditRowCount
  return {
    homeAuditUnchanged,
    backgroundTitleRequests,
    audit,
    usage,
    passed:
      expectedTitleCountValid &&
      audit.passed &&
      usage.passed &&
      homeAuditUnchanged &&
      backgroundTitleRequests === expectation.expectedBackgroundTitleRequests &&
      auditRowDelta === expectation.expectedBackgroundTitleRequests
  }
}

function canonicalUsageRows(rows: UsageRowLike[]): string | null {
  const normalized = rows.map(normalizeUsageRow)
  if (normalized.some((row) => row === null)) return null
  return JSON.stringify(
    (normalized as NormalizedUsageRow[]).sort((left, right) => left.key.localeCompare(right.key))
  )
}

export function ledgerSnapshotsEqual(left: LedgerSnapshot, right: LedgerSnapshot): boolean {
  const leftUsage = canonicalUsageRows(left.usageRows)
  const rightUsage = canonicalUsageRows(right.usageRows)
  return (
    left.auditRowCount === right.auditRowCount &&
    left.auditMaxId === right.auditMaxId &&
    leftUsage !== null &&
    rightUsage !== null &&
    leftUsage === rightUsage
  )
}

export function projectAcceptanceFailure(error: unknown, stage: string): AcceptanceFailure {
  return {
    stage,
    code: error instanceof AcceptanceError ? error.code : 'ACCEPTANCE_STEP_FAILED'
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', resolve)
  })
  return hash.digest('hex')
}

export async function readAppBundleVersion(appBundlePath: string): Promise<string> {
  const infoPlistPath = path.join(appBundlePath, 'Contents', 'Info.plist')
  const document = await new Promise<Record<string, unknown>>((resolve, reject) => {
    readPlist(infoPlistPath, (error: Error | null, data: unknown) => {
      if (error) reject(error)
      else resolve((data ?? {}) as Record<string, unknown>)
    })
  })
  const version = document.CFBundleShortVersionString
  if (typeof version !== 'string' || !version.trim()) {
    fail('PACKAGED_APP_VERSION_FAILED')
  }
  return version.trim()
}

async function prepareProfile(requestedPath?: string): Promise<PreparedProfile> {
  const createdByRunner = requestedPath === undefined
  const userDataDir = requestedPath ?? (await mkdtemp(path.join(tmpdir(), PROFILE_TEMP_PREFIX)))
  await mkdir(userDataDir, { recursive: true })
  const entries = await readdir(userDataDir)
  const markerPath = path.join(userDataDir, PROFILE_MARKER_FILE)

  if (entries.length > 0) {
    const marker = await readProfileMarker(markerPath)
    if (!marker) fail('PROFILE_NOT_RUNNER_OWNED')
  } else {
    await writeFile(
      markerPath,
      JSON.stringify({ schema: PROFILE_MARKER_SCHEMA, providerId: ACCEPTANCE_PROVIDER_ID }),
      'utf8'
    )
  }

  const configDir = path.join(userDataDir, 'tuff', 'modules', 'config')
  const fileProviderRoot = path.join(userDataDir, 'acceptance', 'file-provider-root')
  const piAgentDir = path.join(userDataDir, 'acceptance', 'pi-agent')
  const isolatedHome = path.join(userDataDir, 'acceptance', 'home')
  const isolatedCodexHome = path.join(userDataDir, 'acceptance', 'codex-home')
  const isolatedTemp = path.join(userDataDir, 'acceptance', 'tmp')
  await mkdir(configDir, { recursive: true })
  await mkdir(fileProviderRoot, { recursive: true })
  await mkdir(piAgentDir, { recursive: true })
  await mkdir(isolatedHome, { recursive: true })
  await mkdir(isolatedCodexHome, { recursive: true })
  await mkdir(isolatedTemp, { recursive: true })
  await writeFile(
    path.join(configDir, 'app-setting.ini'),
    JSON.stringify({ beginner: { init: true }, dev: { developerMode: true } }),
    'utf8'
  )
  await writeFile(
    path.join(configDir, 'aisdk-config'),
    JSON.stringify(buildSeedIntelligenceConfig()),
    'utf8'
  )
  return { userDataDir, createdByRunner }
}

function isPathWithin(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function isProtectedInstalledAppPath(candidate: string, userHome = homedir()): boolean {
  return (
    isPathWithin(candidate, '/Applications') ||
    isPathWithin(candidate, path.join(userHome, 'Applications'))
  )
}

async function readProfileMarker(markerPath: string): Promise<boolean> {
  try {
    const marker = JSON.parse(await readFile(markerPath, 'utf8')) as Record<string, unknown>
    return marker.schema === PROFILE_MARKER_SCHEMA && marker.providerId === ACCEPTANCE_PROVIDER_ID
  } catch {
    return false
  }
}

export function isRunnerCreatedProfileCleanupTarget(
  candidate: string,
  createdByRunner: boolean,
  temporaryRoot = tmpdir()
): boolean {
  if (!createdByRunner) return false
  const resolved = path.resolve(candidate)
  const resolvedTemporaryRoot = path.resolve(temporaryRoot)
  const basename = path.basename(resolved)
  return (
    path.dirname(resolved) === resolvedTemporaryRoot &&
    basename.startsWith(PROFILE_TEMP_PREFIX) &&
    basename.length > PROFILE_TEMP_PREFIX.length
  )
}

async function cleanupOwnedProfile(userDataDir: string, createdByRunner: boolean): Promise<void> {
  const resolved = path.resolve(userDataDir)
  if (!isRunnerCreatedProfileCleanupTarget(resolved, createdByRunner)) {
    fail('PROFILE_CLEANUP_TARGET_REJECTED')
  }
  const info = await lstat(resolved)
  const [canonical, canonicalTemporaryRoot] = await Promise.all([
    realpath(resolved),
    realpath(tmpdir())
  ])
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    path.dirname(canonical) !== canonicalTemporaryRoot ||
    !path.basename(canonical).startsWith(PROFILE_TEMP_PREFIX) ||
    !(await readProfileMarker(path.join(canonical, PROFILE_MARKER_FILE)))
  ) {
    fail('PROFILE_CLEANUP_OWNERSHIP_REJECTED')
  }
  await rm(canonical, { recursive: true, force: false })
}

async function preflightOllama(): Promise<void> {
  if (!isLoopbackOllamaBaseUrl(ACCEPTANCE_PROVIDER_BASE_URL)) fail('PROVIDER_ENDPOINT_REJECTED')
  let response: Response
  try {
    response = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(5_000)
    })
  } catch {
    fail('OLLAMA_UNAVAILABLE')
  }
  if (!response.ok) fail('OLLAMA_UNAVAILABLE')
  const payload = (await response.json()) as { models?: Array<{ name?: unknown; model?: unknown }> }
  const available = (payload.models ?? []).some(
    (model) => model.name === ACCEPTANCE_PROVIDER_MODEL || model.model === ACCEPTANCE_PROVIDER_MODEL
  )
  if (!available) fail('OLLAMA_MODEL_UNAVAILABLE')
}

async function isPortAvailable(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

async function resolveCdpPort(requestedPort: number): Promise<number> {
  if (requestedPort > 0) {
    if (!(await isPortAvailable(requestedPort))) fail('CDP_PORT_IN_USE')
    return requestedPort
  }
  for (let port = 9681; port <= 9780; port += 1) {
    if (await isPortAvailable(port)) return port
  }
  fail('CDP_PORT_UNAVAILABLE')
}

function launchPackagedApp(executablePath: string, port: number, paths: LaunchPaths): ChildProcess {
  const child = spawn(executablePath, [`--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: buildPackagedProviderLaunchEnv(process.env, paths),
    stdio: 'ignore',
    detached: process.platform !== 'win32'
  })
  child.on('error', () => undefined)
  return child
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true
  return await new Promise((resolve) => {
    const onExit = (): void => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, timeoutMs)
    child.once('exit', onExit)
  })
}

function ownedProcessGroupAlive(pid: number): boolean {
  if (process.platform === 'win32') return false
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code !== 'ESRCH'
  }
}

async function waitForOwnedRuntimeExit(
  child: ChildProcess,
  pid: number,
  timeoutMs: number
): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (process.platform === 'win32') {
      if (await waitForChildExit(child, Math.min(200, timeoutMs))) return true
    } else if (!ownedProcessGroupAlive(pid)) {
      return true
    }
    await sleep(100)
  }
  return process.platform === 'win32'
    ? child.exitCode !== null || child.signalCode !== null
    : !ownedProcessGroupAlive(pid)
}

function signalOwnedRuntime(child: ChildProcess, pid: number, signal: NodeJS.Signals): void {
  try {
    if (process.platform === 'win32') child.kill(signal)
    else process.kill(-pid, signal)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code !== 'ESRCH' && child.exitCode === null && child.signalCode === null) throw error
  }
}

async function stopOwnedChild(child: ChildProcess | null): Promise<void> {
  if (!child) return
  const pid = child.pid
  if (!pid) fail('OWNED_CHILD_PID_MISSING')
  try {
    if (
      process.platform === 'win32'
        ? child.exitCode === null && child.signalCode === null
        : ownedProcessGroupAlive(pid)
    ) {
      signalOwnedRuntime(child, pid, 'SIGTERM')
    }
  } catch {
    fail('OWNED_CHILD_TERMINATION_FAILED')
  }
  if (await waitForOwnedRuntimeExit(child, pid, 8_000)) return
  try {
    signalOwnedRuntime(child, pid, 'SIGKILL')
  } catch {
    fail('OWNED_CHILD_FORCE_TERMINATION_FAILED')
  }
  if (!(await waitForOwnedRuntimeExit(child, pid, 5_000))) fail('OWNED_CHILD_EXIT_TIMEOUT')
}

class OwnedRuntimeSupervisor {
  private child: ChildProcess | null = null
  private userDataDir: string | undefined
  private profileCreatedByRunner = false
  private stopInFlight: Promise<void> | null = null
  private cleanupInFlight: Promise<void> | null = null
  private interrupted = false
  profileRemoved = false

  constructor(private readonly cleanupRequested: boolean) {}

  setProfile(profile: PreparedProfile): void {
    this.userDataDir = profile.userDataDir
    this.profileCreatedByRunner = profile.createdByRunner
  }

  launch(executablePath: string, port: number, paths: LaunchPaths): ChildProcess {
    if (this.interrupted) fail('ACCEPTANCE_INTERRUPTED')
    if (this.child) fail('OWNED_CHILD_ALREADY_RUNNING')
    this.child = launchPackagedApp(executablePath, port, paths)
    return this.child
  }

  async stop(): Promise<void> {
    if (!this.child) return
    if (!this.stopInFlight) {
      const owned = this.child
      this.stopInFlight = stopOwnedChild(owned).then(() => {
        if (this.child === owned) this.child = null
      })
    }
    try {
      await this.stopInFlight
    } finally {
      this.stopInFlight = null
    }
  }

  interrupt(): void {
    this.interrupted = true
  }

  async cleanup(): Promise<void> {
    if (this.cleanupInFlight) return await this.cleanupInFlight
    this.cleanupInFlight = (async () => {
      await this.stop()
      if (!this.cleanupRequested || !this.userDataDir) return
      if (!this.profileCreatedByRunner) return
      if (this.child) fail('PROFILE_CLEANUP_WITH_LIVE_CHILD_REJECTED')
      await cleanupOwnedProfile(this.userDataDir, this.profileCreatedByRunner)
      this.profileRemoved = true
    })()
    return await this.cleanupInFlight
  }
}

async function waitForPortRelease(port: number, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortAvailable(port)) return
    await sleep(200)
  }
  fail('CDP_PORT_RELEASE_TIMEOUT')
}

async function evaluate<T>(send: CdpSend, expression: string): Promise<T> {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  return response.result?.result?.value as T
}

async function waitForValue<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs: number,
  code: string
): Promise<T> {
  const startedAt = Date.now()
  let latest!: T
  while (Date.now() - startedAt < timeoutMs) {
    latest = await read()
    if (accept(latest)) return latest
    await sleep(200)
  }
  throw new AcceptanceError(code)
}

async function bringToFrontAndWait(send: CdpSend): Promise<void> {
  await send('Page.bringToFront')
  await evaluate<boolean>(send, `(() => { window.focus(); return true })()`)
  await waitForValue(
    () =>
      evaluate<{ visible: boolean; focused: boolean }>(
        send,
        `({ visible: document.hidden === false, focused: document.hasFocus() === true })`
      ),
    (state) => state.visible && state.focused,
    8_000,
    'RENDERER_NOT_FOREGROUNDED'
  )
}

async function pickMainRenderer(
  remoteDebuggingUrl: string,
  timeoutMs: number
): Promise<DevToolsTarget> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - startedAt)
    const targets = await loadTargets(
      remoteDebuggingUrl,
      Math.max(1, Math.min(5_000, remaining))
    ).catch(() => [])
    const candidates: Array<{ target: DevToolsTarget; score: number }> = []
    for (const target of targets) {
      if (
        target.type !== 'page' ||
        !target.webSocketDebuggerUrl ||
        !target.url.includes('/renderer/index.html')
      ) {
        continue
      }
      try {
        const snapshot = await withTarget(target, async (send) => {
          await bringToFrontAndWait(send)
          return await evaluate<{
            hasRouter: boolean
            hasChannel: boolean
            href: string
            area: number
          }>(
            send,
            `({
              hasRouter: Boolean(window.__VUE_ROUTER__?.push),
              hasChannel: Boolean((window.$channel || window.touchChannel || window.$touchChannel)?.send),
              href: location.href,
              area: Math.max(0, innerWidth) * Math.max(0, innerHeight)
            })`
          )
        })
        if (!snapshot.hasRouter || !snapshot.hasChannel) continue
        const excluded = /#\/(meta-overlay|core-box|division-box|assistant|voice)/.test(
          snapshot.href
        )
        candidates.push({ target, score: snapshot.area + (excluded ? -1_000_000 : 1_000_000) })
      } catch {
        // A renderer still booting is retried from a fresh target list.
      }
    }
    candidates.sort((left, right) => right.score - left.score)
    if (candidates[0]) return candidates[0].target
    await sleep(500)
  }
  fail('MAIN_RENDERER_NOT_FOUND')
}

async function navigate(target: DevToolsTarget, route: string, selector: string): Promise<void> {
  await withTarget(target, async (send) => {
    await bringToFrontAndWait(send)
    const routed = await evaluate<boolean>(
      send,
      `(() => {
        if (window.__VUE_ROUTER__?.push) {
          void window.__VUE_ROUTER__.push(${JSON.stringify(route)}).catch(() => undefined)
        }
        else location.hash = ${JSON.stringify(`#${route}`)}
        return true
      })()`
    )
    if (!routed) fail('ROUTE_NAVIGATION_FAILED')
    await waitForValue(
      () =>
        evaluate<boolean>(
          send,
          `document.hidden === false && document.hasFocus() === true && Boolean(document.querySelector(${JSON.stringify(selector)}))`
        ),
      Boolean,
      15_000,
      'ROUTE_CONTENT_NOT_READY'
    )
  })
}

function storageProviderExpression(): string {
  return `(() => {
    const storage = window.__talex_touch_storage_singletons__?.get?.(${JSON.stringify(STORAGE_KEY)})
    const data = storage?.data || storage?.get?.()
    const provider = Array.isArray(data?.providers)
      ? data.providers.find((item) => item?.id === ${JSON.stringify(ACCEPTANCE_PROVIDER_ID)})
      : undefined
    const input = document.querySelector('.aisdk-api-config .FlatInput-Container input[type="password"]')
    return {
      found: Boolean(provider),
      hasCredential: provider?.hasCredential === true,
      hasAuthRef: typeof provider?.authRef === 'string' && provider.authRef.length > 0,
      hasOwnApiKey: Boolean(provider && Object.prototype.hasOwnProperty.call(provider, 'apiKey')),
      credentialInputEmpty: !(input instanceof HTMLInputElement) || input.value.length === 0
    }
  })()`
}

async function openAcceptanceProvider(target: DevToolsTarget): Promise<void> {
  await navigate(
    target,
    '/setting/intelligence/channels',
    '[role="main"][aria-label="AI Intelligence Channels"] .IntelligenceList'
  )
  await withTarget(target, async (send) => {
    await bringToFrontAndWait(send)
    const seededProvider = await evaluate<ProviderStorageSnapshot>(
      send,
      storageProviderExpression()
    )
    if (!seededProvider?.found) fail('SEEDED_PROVIDER_NOT_LOADED')
    await waitForValue(
      () =>
        evaluate<boolean>(
          send,
          `(() => {
            const item = Array.from(document.querySelectorAll('.IntelligenceList .TuffItemTemplate'))
              .find((candidate) => candidate.querySelector('.TuffItemTemplate-TitleText')?.textContent?.trim() === ${JSON.stringify(ACCEPTANCE_PROVIDER_NAME)})
            if (!(item instanceof HTMLElement)) return false
            item.click()
            return true
          })()`
        ),
      Boolean,
      15_000,
      'ACCEPTANCE_PROVIDER_NOT_SELECTABLE'
    )
    await waitForValue(
      () =>
        evaluate<boolean>(
          send,
          `document.querySelector('#provider-name')?.textContent?.trim() === ${JSON.stringify(ACCEPTANCE_PROVIDER_NAME)}`
        ),
      Boolean,
      15_000,
      'ACCEPTANCE_PROVIDER_DETAILS_NOT_READY'
    )
  })
}

async function saveCredentialThroughUi(
  target: DevToolsTarget,
  credential: string
): Promise<ProviderStorageSnapshot> {
  let phase: 'connect' | 'input' | 'commit' = 'connect'
  try {
    return await withTarget(target, async (send) => {
      await bringToFrontAndWait(send)
      phase = 'input'
      const inputFocused = await evaluate<boolean>(
        send,
        `(() => {
          const input = document.querySelector('.aisdk-api-config .FlatInput-Container input[type="password"]')
          if (!(input instanceof HTMLInputElement)) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
          const credential = ${JSON.stringify(credential)}
          input.focus()
          if (setter) setter.call(input, credential)
          else input.value = credential
          input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: credential }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
          return document.activeElement === input && input.value.length === credential.length
        })()`
      )
      if (!inputFocused) fail('CREDENTIAL_INPUT_NOT_FOUND')
      const inputUpdated = await evaluate<boolean>(
        send,
        `(() => {
          const input = document.querySelector('.aisdk-api-config .FlatInput-Container input[type="password"]')
          if (!(input instanceof HTMLInputElement) || input.value.length !== ${credential.length}) return false
          input.blur()
          return true
        })()`
      )
      if (!inputUpdated) fail('CREDENTIAL_INPUT_NOT_UPDATED')
      phase = 'commit'
      return await waitForValue(
        () => evaluate<ProviderStorageSnapshot>(send, storageProviderExpression()),
        (snapshot) =>
          Boolean(snapshot) &&
          snapshot.found &&
          snapshot.hasCredential &&
          snapshot.hasAuthRef &&
          !snapshot.hasOwnApiKey &&
          snapshot.credentialInputEmpty,
        20_000,
        'CREDENTIAL_SAVE_NOT_COMMITTED'
      )
    })
  } catch (error) {
    if (error instanceof AcceptanceError) throw error
    fail(`CREDENTIAL_SAVE_${phase.toUpperCase()}_FAILED`)
  }
}

async function testConnectionThroughUi(target: DevToolsTarget): Promise<void> {
  await withTarget(target, async (send) => {
    await bringToFrontAndWait(send)
    const clicked = await evaluate<boolean>(
      send,
      `(() => {
        const button = document.querySelector('.aisdk-api-config__test-row button.tx-button')
        if (!(button instanceof HTMLButtonElement) || button.disabled) return false
        button.click()
        return true
      })()`
    )
    if (!clicked) fail('CONNECTION_TEST_BUTTON_UNAVAILABLE')

    const startedAt = Date.now()
    let quietSince = 0
    while (Date.now() - startedAt < 60_000) {
      const state = await evaluate<{ success: boolean; failure: boolean; dialogCount: number }>(
        send,
        `(() => {
          const dialogs = Array.from(document.querySelectorAll('[id^="dialog-mention-"] .TDialogTip-Container[role="dialog"]'))
          for (const dialog of dialogs) {
            const button = dialog.querySelector('.TDialogTip-Btn button.tx-button')
            if (button instanceof HTMLButtonElement) button.click()
          }
          return {
            success: Boolean(document.querySelector('.aisdk-api-config__test-success')),
            failure: Boolean(document.querySelector('.aisdk-api-config__test-error')),
            dialogCount: dialogs.length
          }
        })()`
      )
      if (state.failure) fail('CONNECTION_TEST_FAILED')
      if (state.success && state.dialogCount === 0) {
        if (quietSince === 0) quietSince = Date.now()
        if (Date.now() - quietSince >= 1_000) return
      } else {
        quietSince = 0
      }
      await sleep(200)
    }
    fail('CONNECTION_TEST_TIMEOUT')
  })
}

async function waitForHomeHistory(send: CdpSend, minimumAssistantMessages: number): Promise<void> {
  if (minimumAssistantMessages <= 0) return
  await waitForValue(
    () =>
      evaluate<number>(
        send,
        `document.querySelectorAll('.HomePage-Message.assistant[data-message-id]').length`
      ),
    (count) => count >= minimumAssistantMessages,
    20_000,
    'HOME_HISTORY_NOT_RESTORED'
  )
}

async function runHomeStream(
  target: DevToolsTarget,
  prompt: string,
  route: string,
  minimumAssistantMessages: number
): Promise<HomeStreamObservation> {
  await navigate(target, route, '.HomePage')
  return await withTarget(target, async (send) => {
    await bringToFrontAndWait(send)
    await waitForHomeHistory(send, minimumAssistantMessages)
    const beforeIds = await evaluate<string[]>(
      send,
      `Array.from(document.querySelectorAll('.HomePage-Message.assistant[data-message-id]')).map((node) => node.getAttribute('data-message-id')).filter(Boolean)`
    )
    const inputUpdated = await evaluate<boolean>(
      send,
      `(() => {
        const input = document.querySelector('textarea.HomePage-Input')
        if (!(input instanceof HTMLTextAreaElement)) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        const prompt = ${JSON.stringify(prompt)}
        input.focus()
        if (setter) setter.call(input, prompt)
        else input.value = prompt
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })()`
    )
    if (!inputUpdated) fail('HOME_INPUT_UNAVAILABLE')
    const submittedAt = Date.now()
    await waitForValue(
      () =>
        evaluate<boolean>(
          send,
          `(() => {
            const button = document.querySelector('.HomePage-SendBtn')
            if (!(button instanceof HTMLButtonElement) || button.disabled) return false
            button.click()
            return true
          })()`
        ),
      Boolean,
      8_000,
      'HOME_SUBMIT_UNAVAILABLE'
    )
    const previousIds = JSON.stringify(beforeIds)
    const startedAt = Date.now()
    let observedBusyDelta = false
    let busyDeltaSamples = 0
    let previousBusyCharacters = 0
    while (Date.now() - startedAt < 90_000) {
      const state = await evaluate<{
        found: boolean
        busy: boolean
        failed: boolean
        hasActions: boolean
        visibleCharacters: number
      }>(
        send,
        `(() => {
            const previous = new Set(${previousIds})
            const message = Array.from(document.querySelectorAll('.HomePage-Message.assistant[data-message-id]'))
              .find((node) => !previous.has(node.getAttribute('data-message-id')))
            const reply = message?.querySelector('.HomePage-Reply')
            return {
              found: Boolean(message),
              busy: message?.getAttribute('aria-busy') === 'true',
              failed: Boolean(message?.querySelector('.HomePage-Error')),
              hasActions: Boolean(message?.querySelector('.HomePage-MsgActions')),
              visibleCharacters: reply?.textContent?.trim().length || 0
            }
          })()`
      )
      if (state.failed) fail('HOME_STREAM_FAILED')
      if (state.busy && state.visibleCharacters > 0) {
        observedBusyDelta = true
        if (state.visibleCharacters !== previousBusyCharacters) {
          busyDeltaSamples += 1
          previousBusyCharacters = state.visibleCharacters
        }
      }
      if (state.found && !state.busy && state.hasActions && state.visibleCharacters > 0) {
        if (!observedBusyDelta) fail('HOME_STREAM_NOT_VISIBLY_STREAMED')
        return {
          submittedAt,
          completedAt: Date.now(),
          observedBusyDelta,
          busyDeltaSamples
        }
      }
      await sleep(50)
    }
    fail('HOME_STREAM_TIMEOUT')
  })
}

export function isVisibleConversationTitle(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return value.trim().length > 0
}

export function isAcceptanceAuditProviderForOperation(
  provider: unknown,
  operation: unknown
): boolean {
  return (
    (operation === INTELLIGENCE_HOME_SURFACE ||
      operation === INTELLIGENCE_CONVERSATION_TITLE_OPERATION) &&
    provider === ACCEPTANCE_PROVIDER_ID
  )
}

async function waitForConversationRoute(
  target: DevToolsTarget,
  userDataDir: string,
  minAuditIdExclusive: number
): Promise<ConversationRouteObservation> {
  return await withTarget(target, async (send) => {
    await bringToFrontAndWait(send)
    return await waitForValue(
      async () => {
        const [state, auditRows] = await Promise.all([
          evaluate<{ route: string; title: string }>(
            send,
            `(() => ({
              route: location.hash.replace(/^#/, ''),
              title: document.querySelector('.HomeTopBar-Title')?.getAttribute('title')?.trim() || ''
            }))()`
          ),
          queryAcceptanceAuditRows(userDataDir, minAuditIdExclusive).catch(() => [])
        ])
        return {
          ...state,
          titleAuditPresent: auditRows.some((row) => {
            const operation = auditOperationOf(row.metadata)
            return (
              operation === INTELLIGENCE_CONVERSATION_TITLE_OPERATION &&
              isAcceptanceAuditProviderForOperation(row.provider, operation)
            )
          })
        }
      },
      (state) =>
        /^\/home\/c\/[A-Za-z0-9_-]{8,}$/.test(state.route) &&
        // Title generation is deliberately fail-soft. A provider may return prose that the
        // product rejects, in which case the non-empty working title remains the valid UI state.
        isVisibleConversationTitle(state.title) &&
        state.titleAuditPresent,
      75_000,
      'HOME_TITLE_NOT_STABILIZED'
    ).then((state) => ({
      route: state.route,
      workingTitleRetained: state.title === FIRST_HOME_PROMPT
    }))
  })
}

async function runHomeCancellation(
  target: DevToolsTarget,
  prompt: string,
  route: string,
  minimumAssistantMessages: number
): Promise<{ submittedAt: number; observedBusyDelta: boolean; settled: boolean }> {
  await navigate(target, route, '.HomePage')
  return await withTarget(target, async (send) => {
    await bringToFrontAndWait(send)
    await waitForHomeHistory(send, minimumAssistantMessages)
    const beforeIds = await evaluate<string[]>(
      send,
      `Array.from(document.querySelectorAll('.HomePage-Message.assistant[data-message-id]')).map((node) => node.getAttribute('data-message-id')).filter(Boolean)`
    )
    const prepared = await evaluate<boolean>(
      send,
      `(() => {
        const input = document.querySelector('textarea.HomePage-Input')
        if (!(input instanceof HTMLTextAreaElement)) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        const prompt = ${JSON.stringify(prompt)}
        input.focus()
        if (setter) setter.call(input, prompt)
        else input.value = prompt
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })()`
    )
    if (!prepared) fail('HOME_CANCEL_INPUT_UNAVAILABLE')
    const submittedAt = Date.now()
    const submitted = await evaluate<boolean>(
      send,
      `(() => {
        const button = document.querySelector('.HomePage-SendBtn')
        if (!(button instanceof HTMLButtonElement) || button.disabled) return false
        button.click()
        return true
      })()`
    )
    if (!submitted) fail('HOME_CANCEL_SUBMIT_UNAVAILABLE')

    const previousIds = JSON.stringify(beforeIds)
    await waitForValue(
      () =>
        evaluate<{ clicked: boolean; failed: boolean }>(
          send,
          `(() => {
            const previous = new Set(${previousIds})
            const message = Array.from(document.querySelectorAll('.HomePage-Message.assistant[data-message-id]'))
              .find((node) => !previous.has(node.getAttribute('data-message-id')))
            const reply = message?.querySelector('.HomePage-Reply')
            const stop = document.querySelector('.HomePage-SendBtn .i-ri-stop-fill')?.closest('button')
            const failed = Boolean(message?.querySelector('.HomePage-Error'))
            if (
              !failed &&
              message?.getAttribute('aria-busy') === 'true' &&
              (reply?.textContent?.trim().length || 0) > 0 &&
              stop instanceof HTMLButtonElement
            ) {
              stop.click()
              return { clicked: true, failed: false }
            }
            return { clicked: false, failed }
          })()`
        ),
      (state) => {
        if (state.failed) fail('HOME_CANCEL_STREAM_FAILED')
        return state.clicked
      },
      90_000,
      'HOME_CANCEL_DELTA_TIMEOUT'
    )

    await waitForValue(
      () =>
        evaluate<{ busy: boolean; failed: boolean; hasActions: boolean; stopVisible: boolean }>(
          send,
          `(() => {
            const previous = new Set(${previousIds})
            const message = Array.from(document.querySelectorAll('.HomePage-Message.assistant[data-message-id]'))
              .find((node) => !previous.has(node.getAttribute('data-message-id')))
            return {
              busy: message?.getAttribute('aria-busy') === 'true',
              failed: Boolean(message?.querySelector('.HomePage-Error')),
              hasActions: Boolean(message?.querySelector('.HomePage-MsgActions')),
              stopVisible: Boolean(document.querySelector('.HomePage-SendBtn .i-ri-stop-fill'))
            }
          })()`
        ),
      (state) => !state.busy && !state.failed && state.hasActions && !state.stopVisible,
      15_000,
      'HOME_CANCEL_NOT_SETTLED'
    )
    return { submittedAt, observedBusyDelta: true, settled: true }
  })
}

async function readProviderStorageSnapshot(
  target: DevToolsTarget
): Promise<ProviderStorageSnapshot> {
  return await withTarget(target, async (send) => {
    await bringToFrontAndWait(send)
    return await evaluate<ProviderStorageSnapshot>(send, storageProviderExpression())
  })
}

async function deleteProviderThroughUi(target: DevToolsTarget): Promise<void> {
  await withTarget(target, async (send) => {
    await bringToFrontAndWait(send)
    const menuOpened = await evaluate<boolean>(
      send,
      `(() => {
        const button = document.querySelector('.IntelligenceHeader button[aria-label="更多操作"], .IntelligenceHeader button[aria-label="More Actions"]')
        if (!(button instanceof HTMLButtonElement)) return false
        button.click()
        return true
      })()`
    )
    if (!menuOpened) fail('PROVIDER_ACTION_MENU_UNAVAILABLE')
    await waitForValue(
      () =>
        evaluate<boolean>(
          send,
          `(() => {
            const item = document.querySelector('.tx-dropdown__panel[role="menu"] [role="menuitem"].provider-action-item--danger')
            if (!(item instanceof HTMLElement)) return false
            item.click()
            return true
          })()`
        ),
      Boolean,
      8_000,
      'PROVIDER_DELETE_ACTION_UNAVAILABLE'
    )
    await waitForValue(
      () =>
        evaluate<boolean>(
          send,
          `(() => {
            const button = document.querySelector('.tx-bottom-dialog[role="dialog"] .tx-bottom-dialog__buttons button.tx-bottom-dialog__btn:last-of-type')
            if (!(button instanceof HTMLButtonElement)) return false
            button.click()
            return true
          })()`
        ),
      Boolean,
      8_000,
      'PROVIDER_DELETE_CONFIRM_UNAVAILABLE'
    )
    await waitForValue(
      () => evaluate<ProviderStorageSnapshot>(send, storageProviderExpression()),
      (snapshot) => !snapshot.found,
      20_000,
      'PROVIDER_DELETE_NOT_COMMITTED'
    )
  })
}

async function readSecureStoreInspection(
  userDataDir: string,
  secureStoreKey: string
): Promise<SecureStoreInspection> {
  const secureStorePath = path.join(userDataDir, 'tuff', 'config', 'secure-store.json')
  try {
    return inspectSecureStoreDocument(await readFile(secureStorePath, 'utf8'), secureStoreKey)
  } catch {
    return { keyPresent: false, envelopeValid: false }
  }
}

async function storedCredentialMatches(
  userDataDir: string,
  secureStoreKey: string,
  expectedCredential: string
): Promise<boolean> {
  const value = await getSecureStoreValueStrict(
    path.join(userDataDir, 'tuff'),
    secureStoreKey,
    PROVIDER_SECURE_STORE_PURPOSE
  )
  return value === expectedCredential
}

async function fileContainsNeedle(filePath: string, needle: Buffer): Promise<boolean> {
  const handle = await open(filePath, 'r')
  const chunk = Buffer.allocUnsafe(64 * 1024)
  let carry = Buffer.alloc(0)
  let position = 0
  try {
    while (true) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, position)
      if (bytesRead === 0) return false
      position += bytesRead
      const current = carry.length
        ? Buffer.concat([carry, chunk.subarray(0, bytesRead)])
        : chunk.subarray(0, bytesRead)
      if (current.includes(needle)) return true
      const carryLength = Math.min(Math.max(needle.length - 1, 0), current.length)
      carry = Buffer.from(current.subarray(current.length - carryLength))
    }
  } finally {
    carry.fill(0)
    chunk.fill(0)
    await handle.close()
  }
}

export async function credentialCanaryAbsent(
  userDataDir: string,
  canary: string,
  limits: { maxFiles?: number; maxBytes?: number } = {}
): Promise<boolean> {
  const maxFiles = limits.maxFiles ?? 20_000
  const maxBytes = limits.maxBytes ?? 256 * 1024 * 1024
  const needle = Buffer.from(canary, 'utf8')
  const directories = [path.resolve(userDataDir)]
  let fileCount = 0
  let totalBytes = 0

  while (directories.length > 0) {
    const directory = directories.pop()!
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        directories.push(entryPath)
        continue
      }
      if (!entry.isFile()) continue
      const info = await lstat(entryPath)
      fileCount += 1
      totalBytes += info.size
      if (fileCount > maxFiles || totalBytes > maxBytes) {
        fail('CREDENTIAL_SCAN_BOUNDS_EXCEEDED')
      }
      if (await fileContainsNeedle(entryPath, needle)) return false
    }
  }
  return true
}

function databasePathFor(userDataDir: string): string {
  return path.join(userDataDir, 'tuff', 'modules', 'database', 'database.db')
}

async function queryUsageRows(userDataDir: string): Promise<UsageRowLike[]> {
  const client = createClient({ url: `file:${databasePathFor(userDataDir)}` })
  try {
    const result = await client.execute({
      sql: `SELECT caller_id, caller_type, period, period_type,
              request_count, success_count, failure_count,
              total_tokens, prompt_tokens, completion_tokens, total_cost
            FROM intelligence_usage_stats
            WHERE caller_id = ? AND caller_type = ? AND period_type IN ('day', 'month')
            ORDER BY caller_type ASC, period_type ASC, period ASC`,
      args: ['system', 'system']
    })
    return result.rows as unknown as UsageRowLike[]
  } finally {
    client.close()
  }
}

async function queryLedgerSnapshot(userDataDir: string): Promise<LedgerSnapshot> {
  const client = createClient({ url: `file:${databasePathFor(userDataDir)}` })
  try {
    const result = await client.execute(
      'SELECT COUNT(*) AS row_count, COALESCE(MAX(id), 0) AS max_id FROM intelligence_audit_logs'
    )
    const row = result.rows[0] as Record<string, unknown> | undefined
    return {
      auditRowCount: Number(row?.row_count ?? 0),
      auditMaxId: Number(row?.max_id ?? 0),
      usageRows: await queryUsageRows(userDataDir)
    }
  } finally {
    client.close()
  }
}

async function waitForAuditRowCount(
  userDataDir: string,
  minimumRowCount: number,
  timeoutMs = 30_000
): Promise<void> {
  await waitForValue(
    () => queryLedgerSnapshot(userDataDir),
    (snapshot) => snapshot.auditRowCount >= minimumRowCount,
    timeoutMs,
    'EXPECTED_AUDIT_ROWS_NOT_FLUSHED'
  )
}

export async function waitForLedgerQuietSnapshot(
  readSnapshot: () => Promise<LedgerSnapshot>,
  options: { timeoutMs?: number; quietWindowMs?: number; pollIntervalMs?: number } = {}
): Promise<LedgerSnapshot> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const quietWindowMs = options.quietWindowMs ?? 1_000
  const pollIntervalMs = options.pollIntervalMs ?? 200
  const startedAt = Date.now()
  let quietSince = 0
  let previous = ''
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const latest = await readSnapshot()
      const fingerprint = `${latest.auditRowCount}:${latest.auditMaxId}:${canonicalUsageRows(latest.usageRows)}`
      if (fingerprint === previous) {
        if (quietSince === 0) quietSince = Date.now()
        if (Date.now() - quietSince >= quietWindowMs) return latest
      } else {
        previous = fingerprint
        quietSince = 0
      }
    } catch {
      quietSince = 0
    }
    await sleep(pollIntervalMs)
  }
  fail('LEDGER_NOT_QUIET')
}

async function waitForLedgerQuiet(
  userDataDir: string,
  timeoutMs = 20_000
): Promise<LedgerSnapshot> {
  return await waitForLedgerQuietSnapshot(() => queryLedgerSnapshot(userDataDir), { timeoutMs })
}

async function queryAcceptanceAuditRows(
  userDataDir: string,
  minIdExclusive: number
): Promise<AuditRowLike[]> {
  const databasePath = path.join(userDataDir, 'tuff', 'modules', 'database', 'database.db')
  const client = createClient({ url: `file:${databasePath}` })
  try {
    const result = await client.execute({
      sql: `SELECT id, trace_id, timestamp, capability_id, provider, model, caller,
              prompt_tokens, completion_tokens, total_tokens, estimated_cost, latency, success,
              metadata
            FROM intelligence_audit_logs
            WHERE id > ? AND capability_id = ?
            ORDER BY id ASC`,
      args: [minIdExclusive, 'text.chat']
    })
    return result.rows as unknown as AuditRowLike[]
  } finally {
    client.close()
  }
}

function createReport(options: CliOptions): AcceptanceReport {
  return {
    schema: PROVIDER_ACCEPTANCE_SCHEMA,
    ok: false,
    checkedAt: new Date().toISOString(),
    app: {
      version: '',
      hash: ''
    },
    provider: {
      id: ACCEPTANCE_PROVIDER_ID,
      type: ACCEPTANCE_PROVIDER_TYPE,
      endpoint: 'loopback-ollama',
      model: ACCEPTANCE_PROVIDER_MODEL
    },
    runtime: {
      appBundle: path.basename(options.appBundle),
      launches: 0,
      targetReacquired: false,
      profileRetained: true,
      cleanupRequested: options.cleanup
    },
    checks: {
      ollamaReachable: false,
      modelAvailable: false,
      credentialSaved: false,
      credentialSavedExact: false,
      connectionTested: false,
      firstHomeStreamCompleted: false,
      firstHomeObservedBusyDelta: false,
      titleRequestStabilized: false,
      credentialRestoredAfterRelaunch: false,
      credentialRestoredExact: false,
      secondHomeStreamCompleted: false,
      secondHomeObservedBusyDelta: false,
      cancellationObservedBusyDelta: false,
      cancellationSettled: false,
      cancellationFlushWindowObserved: false,
      cancellationHomeAuditAbsent: false,
      cancellationBackgroundTitleRequests: 0,
      cancellationLedgerAccounted: false,
      providerDeletedThroughUi: false,
      secureStoreEnvelopeValid: false,
      secureStoreKeyDeleted: false,
      localSecretFilePresent: false,
      credentialCanaryAbsent: false
    },
    failures: []
  }
}

async function runAcceptance(
  options: CliOptions,
  supervisor: OwnedRuntimeSupervisor
): Promise<AcceptanceReport> {
  const report = createReport(options)
  let stage = 'preflight'
  let userDataDir: string | undefined
  const credential = `acceptance-${randomBytes(24).toString('hex')}`

  try {
    if (process.platform !== 'darwin') fail('MACOS_PACKAGED_APP_REQUIRED')
    const appBundle = await realpath(options.appBundle).catch(() => fail('PACKAGED_APP_NOT_FOUND'))
    if (isProtectedInstalledAppPath(appBundle)) fail('INSTALLED_APP_BUNDLE_REJECTED')
    const executablePath = await realpath(path.join(appBundle, 'Contents', 'MacOS', 'tuff')).catch(
      () => fail('PACKAGED_APP_NOT_EXECUTABLE')
    )
    if (!isPathWithin(executablePath, appBundle) || isProtectedInstalledAppPath(executablePath)) {
      fail('PACKAGED_APP_EXECUTABLE_REJECTED')
    }
    await access(executablePath, fsConstants.X_OK).catch(() => fail('PACKAGED_APP_NOT_EXECUTABLE'))
    const appAsarPath = path.join(appBundle, 'Contents', 'Resources', 'app.asar')
    report.app.version = await readAppBundleVersion(appBundle).catch(() =>
      fail('PACKAGED_APP_VERSION_FAILED')
    )
    report.app.hash = await hashFile(appAsarPath).catch(() => fail('PACKAGED_APP_HASH_FAILED'))
    await preflightOllama()
    report.checks.ollamaReachable = true
    report.checks.modelAvailable = true

    stage = 'profile'
    const profile = await prepareProfile(options.userDataDir)
    userDataDir = profile.userDataDir
    supervisor.setProfile(profile)
    const paths: LaunchPaths = {
      userDataDir,
      homeDir: path.join(userDataDir, 'acceptance', 'home'),
      codexHome: path.join(userDataDir, 'acceptance', 'codex-home'),
      tempDir: path.join(userDataDir, 'acceptance', 'tmp'),
      fileProviderRoot: path.join(userDataDir, 'acceptance', 'file-provider-root'),
      missingPiPath: path.join(userDataDir, 'acceptance', 'missing-pi'),
      piAgentDir: path.join(userDataDir, 'acceptance', 'pi-agent')
    }
    const port = await resolveCdpPort(options.remoteDebuggingPort)
    report.runtime.cdpPort = port
    const remoteDebuggingUrl = `http://127.0.0.1:${port}/json/list`

    stage = 'first-launch'
    supervisor.launch(executablePath, port, paths)
    report.runtime.launches += 1
    const firstTarget = await pickMainRenderer(remoteDebuggingUrl, options.launchTimeoutMs)
    const secureStoreKey = providerCredentialSecureStoreKey(ACCEPTANCE_PROVIDER_ID)

    stage = 'provider-open'
    await openAcceptanceProvider(firstTarget)
    stage = 'credential-save'
    await saveCredentialThroughUi(firstTarget, credential)
    report.checks.credentialSaved = true
    report.checks.credentialSavedExact = await storedCredentialMatches(
      userDataDir,
      secureStoreKey,
      credential
    )
    if (!report.checks.credentialSavedExact) fail('CREDENTIAL_SAVE_VALUE_MISMATCH')

    stage = 'connection-test'
    await testConnectionThroughUi(firstTarget)
    report.checks.connectionTested = true

    stage = 'ledger-baseline'
    const ledgerBeforeHome = await waitForLedgerQuiet(userDataDir)

    stage = 'first-home-stream'
    const firstStream = await runHomeStream(firstTarget, FIRST_HOME_PROMPT, '/home', 0)
    report.checks.firstHomeStreamCompleted = true
    report.checks.firstHomeObservedBusyDelta = firstStream.observedBusyDelta

    stage = 'title-stabilization'
    const { route: conversationRoute, workingTitleRetained } = await waitForConversationRoute(
      firstTarget,
      userDataDir,
      ledgerBeforeHome.auditMaxId
    )
    await waitForAuditRowCount(userDataDir, ledgerBeforeHome.auditRowCount + 2)
    const afterFirstTurn = await waitForLedgerQuiet(userDataDir)
    if (afterFirstTurn.auditRowCount - ledgerBeforeHome.auditRowCount !== 2) {
      fail('FIRST_TURN_AUDIT_COUNT_MISMATCH')
    }
    const firstTurnAudit = summarizeAuditRows(
      await queryAcceptanceAuditRows(userDataDir, ledgerBeforeHome.auditMaxId),
      {
        minIdExclusive: ledgerBeforeHome.auditMaxId,
        startedAt: firstStream.submittedAt,
        expectedHomeConversationRequests: 1,
        expectedConversationTitleRequests: 1
      }
    )
    if (!firstTurnAudit.passed) fail('FIRST_TURN_AUDIT_OPERATION_MISMATCH')
    report.checks.titleRequestStabilized = true

    stage = 'second-home-stream'
    const secondStream = await runHomeStream(firstTarget, SECOND_HOME_PROMPT, conversationRoute, 1)
    report.checks.secondHomeStreamCompleted = true
    report.checks.secondHomeObservedBusyDelta = secondStream.observedBusyDelta
    const expectedConversationTitleRequests = workingTitleRetained ? 2 : 1
    const expectedCompletedAuditRows = 2 + expectedConversationTitleRequests
    await waitForAuditRowCount(
      userDataDir,
      ledgerBeforeHome.auditRowCount + expectedCompletedAuditRows
    )
    const afterSecondTurn = await waitForLedgerQuiet(userDataDir)
    if (
      afterSecondTurn.auditRowCount - ledgerBeforeHome.auditRowCount !==
      expectedCompletedAuditRows
    ) {
      fail('SECOND_TURN_AUDIT_COUNT_MISMATCH')
    }
    const secondTurnAudit = summarizeAuditRows(
      await queryAcceptanceAuditRows(userDataDir, ledgerBeforeHome.auditMaxId),
      {
        minIdExclusive: ledgerBeforeHome.auditMaxId,
        startedAt: firstStream.submittedAt,
        expectedHomeConversationRequests: 2,
        expectedConversationTitleRequests
      }
    )
    if (!secondTurnAudit.passed) fail('SECOND_TURN_AUDIT_OPERATION_MISMATCH')
    const afterSecondTitleState = await waitForConversationRoute(
      firstTarget,
      userDataDir,
      ledgerBeforeHome.auditMaxId
    )
    const expectedBackgroundTitleRequests = afterSecondTitleState.workingTitleRetained ? 1 : 0

    stage = 'completed-turns-stop'
    await supervisor.stop()
    await waitForPortRelease(port)

    stage = 'completed-turns-evidence'
    const completedLedger = await waitForLedgerQuiet(userDataDir)
    const auditRows = await queryAcceptanceAuditRows(userDataDir, ledgerBeforeHome.auditMaxId)
    report.checks.audit = summarizeAuditRows(auditRows, {
      minIdExclusive: ledgerBeforeHome.auditMaxId,
      startedAt: firstStream.submittedAt,
      expectedHomeConversationRequests: 2,
      expectedConversationTitleRequests
    })
    if (!report.checks.audit.passed) fail('AUDIT_ACCEPTANCE_FAILED')
    report.checks.usage = summarizeUsageDelta(
      ledgerBeforeHome.usageRows,
      completedLedger.usageRows,
      report.checks.audit
    )
    if (!report.checks.usage.passed) fail('USAGE_ACCEPTANCE_FAILED')

    const savedStore = await readSecureStoreInspection(userDataDir, secureStoreKey)
    report.checks.secureStoreEnvelopeValid = savedStore.keyPresent && savedStore.envelopeValid
    if (!report.checks.secureStoreEnvelopeValid) fail('SECURE_STORE_ENVELOPE_INVALID')
    const localSecretPath = path.join(userDataDir, 'tuff', 'config', 'local-secret.v1.key')
    report.checks.localSecretFilePresent = await fileExists(localSecretPath)
    if (!report.checks.localSecretFilePresent) fail('LOCAL_SECRET_FILE_MISSING')
    if (!(await credentialCanaryAbsent(userDataDir, credential))) fail('CREDENTIAL_CANARY_EXPOSED')

    stage = 'cancellation-relaunch'
    supervisor.launch(executablePath, port, paths)
    report.runtime.launches += 1
    const cancellationTarget = await pickMainRenderer(remoteDebuggingUrl, options.launchTimeoutMs)
    report.runtime.targetReacquired = true

    stage = 'home-cancellation'
    const cancellation = await runHomeCancellation(
      cancellationTarget,
      CANCEL_HOME_PROMPT,
      conversationRoute,
      2
    )
    report.checks.cancellationObservedBusyDelta = cancellation.observedBusyDelta
    report.checks.cancellationSettled = cancellation.settled
    await sleep(CANCELLATION_LEDGER_OBSERVATION_MS)
    report.checks.cancellationFlushWindowObserved = true

    stage = 'cancellation-running-evidence'
    const runningCancelledLedger = await waitForLedgerQuiet(userDataDir)
    const cancellationExpectation = {
      minIdExclusive: completedLedger.auditMaxId,
      startedAt: cancellation.submittedAt,
      expectedBackgroundTitleRequests
    }
    const runningCancellationLedger = summarizeCancellationLedger(
      await queryAcceptanceAuditRows(userDataDir, completedLedger.auditMaxId),
      completedLedger,
      runningCancelledLedger,
      cancellationExpectation
    )
    report.checks.cancellationHomeAuditAbsent = runningCancellationLedger.homeAuditUnchanged
    report.checks.cancellationBackgroundTitleRequests =
      runningCancellationLedger.backgroundTitleRequests
    report.checks.cancellationLedgerAccounted = runningCancellationLedger.passed
    if (!runningCancellationLedger.passed) fail('CANCELLED_HOME_AUDIT_OR_LEDGER_MISMATCH')

    stage = 'cancellation-stop'
    await supervisor.stop()
    await waitForPortRelease(port)
    const cancelledLedger = await waitForLedgerQuiet(userDataDir)
    const stoppedCancellationLedger = summarizeCancellationLedger(
      await queryAcceptanceAuditRows(userDataDir, completedLedger.auditMaxId),
      completedLedger,
      cancelledLedger,
      cancellationExpectation
    )
    report.checks.cancellationHomeAuditAbsent =
      report.checks.cancellationHomeAuditAbsent && stoppedCancellationLedger.homeAuditUnchanged
    report.checks.cancellationLedgerAccounted =
      report.checks.cancellationLedgerAccounted &&
      stoppedCancellationLedger.passed &&
      ledgerSnapshotsEqual(runningCancelledLedger, cancelledLedger)
    if (!report.checks.cancellationLedgerAccounted) fail('CANCELLED_LEDGER_CHANGED')

    stage = 'credential-restore-relaunch'
    supervisor.launch(executablePath, port, paths)
    report.runtime.launches += 1
    const finalTarget = await pickMainRenderer(remoteDebuggingUrl, options.launchTimeoutMs)

    stage = 'credential-restore-open'
    await openAcceptanceProvider(finalTarget)
    stage = 'credential-restore'
    const restored = await readProviderStorageSnapshot(finalTarget)
    report.checks.credentialRestoredAfterRelaunch =
      restored.found &&
      restored.hasCredential &&
      restored.hasAuthRef &&
      !restored.hasOwnApiKey &&
      restored.credentialInputEmpty
    if (!report.checks.credentialRestoredAfterRelaunch) fail('CREDENTIAL_NOT_RESTORED')
    report.checks.credentialRestoredExact = await storedCredentialMatches(
      userDataDir,
      secureStoreKey,
      credential
    )
    if (!report.checks.credentialRestoredExact) fail('CREDENTIAL_RESTORE_VALUE_MISMATCH')

    stage = 'provider-delete'
    await deleteProviderThroughUi(finalTarget)
    report.checks.providerDeletedThroughUi = true

    stage = 'final-stop'
    await supervisor.stop()
    await waitForPortRelease(port)

    stage = 'final-evidence'
    const deletedStore = await readSecureStoreInspection(userDataDir, secureStoreKey)
    report.checks.secureStoreKeyDeleted = !deletedStore.keyPresent
    if (!report.checks.secureStoreKeyDeleted) fail('SECURE_STORE_KEY_NOT_DELETED')
    report.checks.credentialCanaryAbsent = await credentialCanaryAbsent(userDataDir, credential)
    if (!report.checks.credentialCanaryAbsent) fail('CREDENTIAL_CANARY_EXPOSED')

    report.ok = true
  } catch (error) {
    report.failures.push(projectAcceptanceFailure(error, stage))
  } finally {
    try {
      await supervisor.cleanup()
      report.runtime.profileRetained = !supervisor.profileRemoved
    } catch (error) {
      report.failures.push(projectAcceptanceFailure(error, 'runtime-cleanup'))
      report.ok = false
    }
  }

  return report
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return
  const supervisor = new OwnedRuntimeSupervisor(options.cleanup)
  let exitCode = 0
  const onSignal = (): void => {
    supervisor.interrupt()
    void supervisor.cleanup().finally(() => {
      process.exitCode = 130
    })
  }
  const onUncaughtException = (): void => {
    supervisor.interrupt()
    void supervisor.cleanup().finally(() => {
      process.stdout.write(
        `${JSON.stringify({ ok: false, failures: [{ stage: 'main', code: 'ACCEPTANCE_FATAL' }] })}\n`
      )
      process.exitCode = 1
    })
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  process.once('uncaughtException', onUncaughtException)
  const report = await runAcceptance(options, supervisor)
  process.off('SIGINT', onSignal)
  process.off('SIGTERM', onSignal)
  process.off('uncaughtException', onUncaughtException)
  const output = `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`
  if (options.output) {
    await mkdir(path.dirname(options.output), { recursive: true })
    await writeFile(options.output, output, 'utf8')
  }
  process.stdout.write(output)
  if (!report.ok) exitCode = 1
  process.exitCode = Math.max(Number(process.exitCode ?? 0), exitCode)
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (entryPath && import.meta.url === entryPath) {
  main().catch(() => {
    process.stdout.write(
      `${JSON.stringify({ ok: false, failures: [{ stage: 'main', code: 'ACCEPTANCE_FATAL' }] })}\n`
    )
    process.exitCode = 1
  })
}
