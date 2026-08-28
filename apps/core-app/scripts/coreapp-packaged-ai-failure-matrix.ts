#!/usr/bin/env tsx
import { createClient } from '@libsql/client'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants, createReadStream, rmSync, writeFileSync } from 'node:fs'
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { createServer as createTcpServer, type Socket } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { readFile as readPlist } from 'simple-plist'
import {
  loadTargets,
  selectCoreBoxTarget,
  withTarget,
  type CdpSend,
  type CoreBoxProbeDom,
  type DevToolsTarget
} from './coreapp-packaged-ai-ask-probe'
import {
  AppEvents,
  CoreBoxEvents,
  PermissionEvents,
  PluginEvents
} from '@talex-touch/utils/transport/events'
import type {
  PluginApiGetStatusResponse,
  PluginApiOperationResponse,
  SearchProviderConfigResponse,
  SearchProviderConfigUpdateRequest,
  SearchProviderConfigUpdateResult
} from '@talex-touch/utils/transport/events/types'
import { intelligenceApiEvents } from '@talex-touch/utils/transport/sdk/domains/intelligence'

export const FAILURE_MATRIX_SCHEMA = 'tuff.packaged-ai-failure-matrix.v2'
export const FAILURE_PROFILE_SCHEMA = 'tuff.packaged-ai-failure-profile.v1'
export const FAILURE_PROFILE_PREFIX = 'tuff-ai-failure-matrix-'
export const FAILURE_PROFILE_MARKER = '.tuff-ai-failure-matrix.json'
export const FAILURE_PROVIDER_ID = 'failure-matrix-ollama'
export const FAILURE_PROVIDER_MODEL = 'failure-matrix-model'
export const FAILURE_CALLER_ID = 'plugin:touch-intelligence'
export const FAILURE_SEARCH_PROVIDER_ID = 'touch-intelligence.intelligence-ask'
export const FAILURE_FEATURE_ID = 'intelligence-ask'
const FAILURE_NO_AUDIT_OBSERVATION_MS = 32_000
const FAILURE_WIDGET_PREPARATION_TIMEOUT_MS = 30_000
const FAILURE_WIDGET_CANDIDATE_SAMPLE_MS = 750
const FAILURE_WIDGET_QUERY_REFRESH_MS = 4_000
const FAILURE_WIDGET_QUERY_REFRESH_GAP_MS = 100
const FAILURE_WIDGET_POLL_MS = 200
const FAILURE_WIDGET_STABLE_SAMPLE_COUNT = 2
const FAILURE_PROMPT_DISPATCH_TIMEOUT_MS = 5_000
const FAILURE_PROMPT_DISPATCH_POLL_MS = 100
const FAILURE_FEATURE_QUERY = 'ai'
const FAILURE_PROMPT = 'Controlled packaged failure matrix prompt.'
const PLUGIN_FEATURE_SOURCE_ID = 'plugin-features'
const FAILURE_CANDIDATE_EVIDENCE_LIMIT = 16
const FAILURE_SEARCH_EVENT = CoreBoxEvents.search.session.toEventName()
const FAILURE_SEARCH_OBSERVER_KEY = '__tuffPackagedAiFailureSearchObserverV1'
const FAILURE_SEARCH_OBSERVER_ITEM_LIMIT = 32
const FAILURE_VUE_COMPONENT_COLLECTOR_SOURCE = `
  const collectVueComponents = () => {
    const rootContainer = document.querySelector('#app')
    const rootInstance = rootContainer?._vnode?.component ?? rootContainer?.__vue_app__?._instance
    if (!rootInstance) return []
    const components = [rootInstance]
    const componentSeen = new Set(components)
    const vnodeSeen = new Set()
    const stack = []
    const enqueue = (value) => {
      if (Array.isArray(value)) {
        for (const child of value) enqueue(child)
      } else if (value && typeof value === 'object') {
        stack.push(value)
      }
    }
    enqueue(rootInstance.subTree)
    while (stack.length > 0) {
      const vnode = stack.pop()
      if (!vnode || vnodeSeen.has(vnode)) continue
      vnodeSeen.add(vnode)
      const component = vnode.component
      if (component && !componentSeen.has(component)) {
        componentSeen.add(component)
        components.push(component)
        enqueue(component.subTree)
      }
      enqueue(vnode.children)
      enqueue(vnode.dynamicChildren)
      enqueue(vnode.ssContent)
      enqueue(vnode.ssFallback)
      enqueue(vnode.suspense?.activeBranch)
      enqueue(vnode.suspense?.pendingBranch)
    }
    return components
  }
  const collectVueItemMap = () => {
    const itemMap = new Map()
    for (const component of collectVueComponents()) {
      const element = component?.vnode?.el
      const item = component?.props?.item
      if (element instanceof Element && item && typeof item === 'object') {
        itemMap.set(element, item)
      }
    }
    return itemMap
  }
`

export const FAILURE_SCENARIOS = [
  'no-provider',
  'quota-exhausted',
  'unsupported-model',
  'permission-denied',
  'timeout'
] as const

export const FAILURE_BUILTIN_FEATURE_IDS = [
  'intelligence-ask',
  'intelligence-rewrite',
  'intelligence-summarize',
  'intelligence-explain',
  'intelligence-command-registry'
] as const

export type FailureScenarioName = (typeof FAILURE_SCENARIOS)[number]
export type FailureErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'QUOTA_EXHAUSTED'
  | 'MODEL_UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'NETWORK_FAILURE'

export interface FailureFixtureEvidence {
  requests: number
  responseHeadersSent: boolean
  partialDeltaSent: boolean
  bodyHeldOpen: boolean
}

export interface FailureScenarioContract {
  name: FailureScenarioName
  errorCode: FailureErrorCode
  fixture: FailureFixtureEvidence
  auditDelta: number
  usageRequestDelta: number
  settingsAction: 'none' | 'intelligence' | 'permission'
}

export interface CallerLedgerSnapshot {
  auditCount: number
  auditSuccessCount: number
  auditFailureCount: number
  auditTotalTokens: number
  auditTotalCost: number
  usage: Record<
    'day' | 'month',
    {
      requestCount: number
      successCount: number
      failureCount: number
      totalTokens: number
      totalCost: number
    }
  >
}

export interface FailureUiPayload {
  code: string
  reason: string
  recovery: string
  noticeVisible: boolean
  busyCleared: boolean
  retryVisible: boolean
  intelligenceSettingsVisible: boolean
  permissionSettingsVisible: boolean
}

export interface FailureUiEvidence {
  code: FailureErrorCode | 'UNKNOWN'
  reasonPresent: boolean
  recoveryPresent: boolean
  noticeVisible: boolean
  busyCleared: boolean
  retryVisible: boolean
  intelligenceSettingsVisible: boolean
  permissionSettingsVisible: boolean
}

export interface FailureFeatureCandidate {
  domIndex: number
  itemId: string
  sourceId: string
  pluginName: string
  featureId: string
  visible: boolean
}

export interface FailureSearchResultIdentity {
  requestId: string
  sessionId: string
  resultRevision: number
}

export interface FailureSearchResultObservation extends FailureSearchResultIdentity {
  query: string
  settled: boolean
  candidates: FailureFeatureCandidate[]
}

export interface FailureWidgetReadiness {
  pluginName: string
  featureId: string
  hasAiChatbot: boolean
  hasPromptSendButton: boolean
  promptSendEnabled: boolean
  promptMatchesFailurePrompt: boolean
  updatedAt: string
  inputValue: string
  requestId: string
  status: string
}

export interface FailureWidgetPreparationDriver {
  bringToFront(): Promise<void>
  setInput(value: string): Promise<boolean>
  readSearchResult(): Promise<FailureSearchResultObservation | null>
  clickCandidate(
    candidate: FailureFeatureCandidate,
    identity: FailureSearchResultIdentity
  ): Promise<boolean>
  readReadiness(): Promise<FailureWidgetReadiness | null>
  now(): number
  wait(ms: number): Promise<void>
}

export interface FailurePromptSubmissionDriver {
  setInput(value: string): Promise<boolean>
  readReadiness(): Promise<FailureWidgetReadiness | null>
  clickSendButton(): Promise<boolean>
  now(): number
  wait(ms: number): Promise<void>
}

export interface FailurePollingTiming {
  now(): number
  wait(ms: number): Promise<void>
}

export interface FailureInteractionEvidence {
  queryAccepted: boolean
  candidateFeatureIds: string[]
  selectedFeatureId: string
  widgetFeatureId: string
  promptAccepted: boolean
  sendReady: boolean
}

export interface FailureScenarioEvidence {
  name: FailureScenarioName
  ok: boolean
  profile: 'fresh-isolated'
  fixture: FailureFixtureEvidence & { boundToLoopback: boolean; closed: boolean }
  ui: FailureUiEvidence
  ledger: {
    auditDelta: number
    auditSuccessDelta: number
    auditFailureDelta: number
    auditTokenDelta: number
    auditCostDelta: number
    day: {
      requestDelta: number
      successDelta: number
      failureDelta: number
      tokenDelta: number
      costDelta: number
    }
    month: {
      requestDelta: number
      successDelta: number
      failureDelta: number
      tokenDelta: number
      costDelta: number
    }
  }
  prerequisites: {
    requiredPermissionsGranted: boolean
    searchProviderEnabled: boolean
    pluginEnabled: boolean
    intelligencePermissionRevoked: boolean
    quotaDisabled: boolean
  }
  interaction: FailureInteractionEvidence
  processStopped: boolean
  profileRemoved: boolean
  failures: Array<{ stage: string; code: string }>
}

interface CliOptions {
  appBundle: string
  output?: string
  remoteDebuggingPort: number
  launchTimeoutMs: number
  scenarioTimeoutMs: number
  cleanup: boolean
  pretty: boolean
}

interface FailureMatrixReport {
  schema: typeof FAILURE_MATRIX_SCHEMA
  ok: boolean
  checkedAt: string
  app: { version: string; hash: string }
  runtime: {
    appBundle: string
    freshProfiles: number
    cleanupRequested: boolean
    cleanupComplete: boolean
  }
  scenarios: FailureScenarioEvidence[]
  failures: Array<{ stage: string; code: string }>
}

export interface LaunchPaths {
  userDataDir: string
  homeDir: string
  codexHome: string
  tempDir: string
  fileProviderRoot: string
  missingPiPath: string
  piAgentDir: string
}

export interface PreparedProfile {
  userDataDir: string
  paths: LaunchPaths
  ownershipToken: string
}

export interface FixtureHandle {
  port: number
  getRequestCount(): number
  getEvidence(): FailureFixtureEvidence
  close(): Promise<void>
}

export interface FailureScenarioSupervisorDependencies {
  launchPackagedApp: typeof launchPackagedApp
  waitForPackagedAppSpawn: typeof waitForPackagedAppSpawn
  stopOwnedProcess: typeof stopOwnedProcess
  waitForPortRelease: typeof waitForPortRelease
  cleanupFailureMatrixProfile: typeof cleanupFailureMatrixProfile
}

interface LedgerDelta {
  auditDelta: number
  auditSuccessDelta: number
  auditFailureDelta: number
  auditTokenDelta: number
  auditCostDelta: number
  day: FailureScenarioEvidence['ledger']['day']
  month: FailureScenarioEvidence['ledger']['month']
}

export class FailureMatrixError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

export class FailureUiObservationError extends FailureMatrixError {
  constructor(
    code: string,
    readonly lastPayload: FailureUiPayload | null
  ) {
    super(code)
  }
}

const PLUGIN_NAME = 'touch-intelligence'
const PLUGIN_SDK_API = 260713
const REQUIRED_PERMISSIONS = [
  'intelligence.basic',
  'search.root-results',
  'storage.plugin'
] as const
const CORE_BOX_SHOW_EVENT = CoreBoxEvents.ui.show.toEventName()
const PERMISSION_GRANT_MULTIPLE_EVENT = PermissionEvents.api.grantMultiple.toEventName()
const PERMISSION_REVOKE_EVENT = PermissionEvents.api.revoke.toEventName()
const PERMISSION_CHECK_EVENT = PermissionEvents.api.check.toEventName()
const SEARCH_PROVIDER_CONFIG_GET_EVENT = AppEvents.indexedSource.providerConfigGet.toEventName()
const SEARCH_PROVIDER_CONFIG_UPDATE_EVENT =
  AppEvents.indexedSource.providerConfigUpdate.toEventName()
const PLUGIN_GET_STATUS_EVENT = PluginEvents.api.getStatus.toEventName()
const PLUGIN_ENABLE_EVENT = PluginEvents.api.enable.toEventName()
const QUOTA_SET_EVENT = intelligenceApiEvents.setQuota.toEventName()
const QUOTA_CHECK_EVENT = intelligenceApiEvents.checkQuota.toEventName()
const FAILURE_ERROR_CODES = new Set<FailureErrorCode>([
  'PROVIDER_UNAVAILABLE',
  'QUOTA_EXHAUSTED',
  'MODEL_UNSUPPORTED',
  'PERMISSION_DENIED',
  'NETWORK_FAILURE'
])

export const FAILURE_SCENARIO_CONTRACTS: Record<FailureScenarioName, FailureScenarioContract> = {
  'no-provider': {
    name: 'no-provider',
    errorCode: 'PROVIDER_UNAVAILABLE',
    fixture: {
      requests: 0,
      responseHeadersSent: false,
      partialDeltaSent: false,
      bodyHeldOpen: false
    },
    auditDelta: 0,
    usageRequestDelta: 0,
    settingsAction: 'intelligence'
  },
  'quota-exhausted': {
    name: 'quota-exhausted',
    errorCode: 'QUOTA_EXHAUSTED',
    fixture: {
      requests: 0,
      responseHeadersSent: false,
      partialDeltaSent: false,
      bodyHeldOpen: false
    },
    auditDelta: 0,
    usageRequestDelta: 0,
    settingsAction: 'none'
  },
  'unsupported-model': {
    name: 'unsupported-model',
    errorCode: 'MODEL_UNSUPPORTED',
    fixture: {
      requests: 1,
      responseHeadersSent: true,
      partialDeltaSent: false,
      bodyHeldOpen: false
    },
    auditDelta: 1,
    usageRequestDelta: 1,
    settingsAction: 'none'
  },
  'permission-denied': {
    name: 'permission-denied',
    errorCode: 'PERMISSION_DENIED',
    fixture: {
      requests: 0,
      responseHeadersSent: false,
      partialDeltaSent: false,
      bodyHeldOpen: false
    },
    auditDelta: 0,
    usageRequestDelta: 0,
    settingsAction: 'permission'
  },
  timeout: {
    name: 'timeout',
    errorCode: 'NETWORK_FAILURE',
    fixture: {
      requests: 1,
      responseHeadersSent: true,
      partialDeltaSent: true,
      bodyHeldOpen: true
    },
    auditDelta: 1,
    usageRequestDelta: 1,
    settingsAction: 'intelligence'
  }
}

function fail(code: string): never {
  throw new FailureMatrixError(code)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function selectFailureFeatureCandidate(
  candidates: readonly FailureFeatureCandidate[]
): FailureFeatureCandidate | null {
  const matches = candidates.filter(
    (candidate) =>
      candidate.visible &&
      candidate.itemId === `${PLUGIN_NAME}/${FAILURE_FEATURE_ID}` &&
      candidate.sourceId === PLUGIN_FEATURE_SOURCE_ID &&
      candidate.pluginName === PLUGIN_NAME &&
      candidate.featureId === FAILURE_FEATURE_ID
  )
  return matches.length === 1 ? matches[0] : null
}

export function failureFeatureCandidateSignature(
  candidates: readonly FailureFeatureCandidate[]
): string | null {
  const expected = new Set<string>(FAILURE_BUILTIN_FEATURE_IDS)
  const byFeatureId = new Map<string, FailureFeatureCandidate>()
  for (const candidate of candidates) {
    if (!expected.has(candidate.featureId)) continue
    if (
      !candidate.visible ||
      candidate.itemId !== `${PLUGIN_NAME}/${candidate.featureId}` ||
      candidate.sourceId !== PLUGIN_FEATURE_SOURCE_ID ||
      candidate.pluginName !== PLUGIN_NAME ||
      byFeatureId.has(candidate.featureId)
    ) {
      return null
    }
    byFeatureId.set(candidate.featureId, candidate)
  }
  if (byFeatureId.size !== FAILURE_BUILTIN_FEATURE_IDS.length) return null
  return FAILURE_BUILTIN_FEATURE_IDS.map((featureId) => {
    const candidate = byFeatureId.get(featureId)!
    return `${featureId}@${candidate.domIndex}`
  }).join('|')
}

function failureSearchResultIdentitySignature(
  observation: FailureSearchResultObservation | null
): string {
  if (!observation?.requestId || !observation.sessionId || observation.resultRevision <= 0) {
    return ''
  }
  return `${observation.requestId}|${observation.sessionId}|${observation.resultRevision}`
}

function isFailureSearchResultAfterBaseline(
  observation: FailureSearchResultObservation | null,
  baseline: FailureSearchResultObservation | null
): observation is FailureSearchResultObservation {
  if (
    observation?.query !== FAILURE_FEATURE_QUERY ||
    !observation.settled ||
    !failureSearchResultIdentitySignature(observation)
  ) {
    return false
  }
  if (!baseline) return true
  return (
    observation.requestId !== baseline.requestId &&
    observation.sessionId !== baseline.sessionId &&
    observation.resultRevision > baseline.resultRevision
  )
}

function projectFailureSearchResultIdentity(
  observation: FailureSearchResultObservation
): FailureSearchResultIdentity {
  return {
    requestId: observation.requestId,
    sessionId: observation.sessionId,
    resultRevision: observation.resultRevision
  }
}

export function isFailureWidgetReady(readiness: FailureWidgetReadiness | null): boolean {
  return (
    readiness?.pluginName === PLUGIN_NAME &&
    readiness.featureId === FAILURE_FEATURE_ID &&
    readiness.hasAiChatbot &&
    readiness.hasPromptSendButton &&
    readiness.promptSendEnabled
  )
}

function failureWidgetReadinessSignature(readiness: FailureWidgetReadiness | null): string | null {
  if (!isFailureWidgetReady(readiness)) return null
  return [
    readiness!.pluginName,
    readiness!.featureId,
    readiness!.hasAiChatbot,
    readiness!.hasPromptSendButton,
    readiness!.promptSendEnabled
  ].join('|')
}

export function isFailurePromptDispatched(
  previous: FailureWidgetReadiness | null,
  current: FailureWidgetReadiness | null
): boolean {
  if (
    current?.pluginName !== PLUGIN_NAME ||
    current.featureId !== FAILURE_FEATURE_ID ||
    !current.promptMatchesFailurePrompt ||
    !current.status
  ) {
    return false
  }
  const requestChanged =
    current.requestId.length > 0 && current.requestId !== (previous?.requestId ?? '')
  const widgetRevisionChanged =
    current.updatedAt.length > 0 && current.updatedAt !== (previous?.updatedAt ?? '')
  if (current.status === 'ocr-pending' || current.status === 'chat-pending') {
    return requestChanged
  }
  return (
    current.status === 'error' &&
    (previous?.status !== 'error' || requestChanged || widgetRevisionChanged)
  )
}

export function isFailureInteractionReady(
  evidence: FailureInteractionEvidence | null | undefined
): boolean {
  return (
    evidence?.queryAccepted === true &&
    Array.isArray(evidence.candidateFeatureIds) &&
    evidence.candidateFeatureIds.includes(FAILURE_FEATURE_ID) &&
    evidence.selectedFeatureId === FAILURE_FEATURE_ID &&
    evidence.widgetFeatureId === FAILURE_FEATURE_ID &&
    evidence.promptAccepted === true &&
    evidence.sendReady === true
  )
}

function printUsage(): void {
  process.stdout.write(
    `Usage:\n  corepack pnpm -C "apps/core-app" run acceptance:packaged:ai-failure-matrix -- --appBundle <path> [options]\n\nOptions:\n  --appBundle <path>          macOS .app bundle to test.\n  --output <path>             Write the redacted JSON report.\n  --remoteDebuggingPort <n>   First CDP port, or 0 for automatic selection. Default: 0.\n  --launchTimeoutMs <n>       Packaged launch timeout. Default: 30000.\n  --scenarioTimeoutMs <n>     Per-scenario UI/ledger timeout. Default: 45000.\n  --cleanup                   Remove every runner-created profile (default).\n  --no-cleanup                Retain profiles for local diagnosis.\n  --compact                   Print compact JSON.\n`
  )
}

function positiveInteger(value: string, flag: string, allowZero = false): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1) || parsed > 120_000) {
    throw new Error(`Invalid ${flag}`)
  }
  return parsed
}

export function parseFailureMatrixArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    appBundle: '',
    remoteDebuggingPort: 0,
    launchTimeoutMs: 30_000,
    scenarioTimeoutMs: 45_000,
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
    if (arg === '--appBundle' && argv[index + 1]) options.appBundle = argv[++index]
    else if (arg === '--output' && argv[index + 1]) options.output = argv[++index]
    else if (arg === '--remoteDebuggingPort' && argv[index + 1]) {
      options.remoteDebuggingPort = positiveInteger(argv[++index], arg, true)
    } else if (arg === '--launchTimeoutMs' && argv[index + 1]) {
      options.launchTimeoutMs = positiveInteger(argv[++index], arg)
    } else if (arg === '--scenarioTimeoutMs' && argv[index + 1]) {
      options.scenarioTimeoutMs = positiveInteger(argv[++index], arg)
    } else if (arg === '--cleanup') options.cleanup = true
    else if (arg === '--no-cleanup') options.cleanup = false
    else if (arg === '--compact') options.pretty = false
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.appBundle) throw new Error('--appBundle is required')
  return options
}

export function buildFailureMatrixConfig(
  scenario: FailureScenarioName,
  fixturePort: number
): Record<string, unknown> {
  const provider = {
    id: FAILURE_PROVIDER_ID,
    name: 'Failure Matrix Ollama',
    type: 'local',
    enabled: true,
    priority: 1,
    baseUrl: `http://127.0.0.1:${fixturePort}`,
    models: [FAILURE_PROVIDER_MODEL],
    defaultModel: FAILURE_PROVIDER_MODEL,
    timeout: 1_000,
    rateLimit: {},
    capabilities: ['text.chat'],
    metadata: { origin: 'packaged-failure-matrix', endpoint: 'loopback-ollama' }
  }
  const hasProvider = scenario !== 'no-provider'
  return {
    providers: hasProvider ? [provider] : [],
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
        description: 'Packaged AI failure matrix route',
        providers: hasProvider
          ? [{ providerId: FAILURE_PROVIDER_ID, priority: 1, enabled: true }]
          : []
      }
    },
    promptRegistry: [],
    promptBindings: [],
    version: 2
  }
}

export function projectFailureMatrixFailure(
  error: unknown,
  stage: string
): { stage: string; code: string } {
  return {
    stage,
    code: error instanceof FailureMatrixError ? error.code : 'FAILURE_MATRIX_STEP_FAILED'
  }
}

export function projectFailureUiEvidence(payload: FailureUiPayload): FailureUiEvidence {
  const code = FAILURE_ERROR_CODES.has(payload.code as FailureErrorCode)
    ? (payload.code as FailureErrorCode)
    : 'UNKNOWN'
  return {
    code,
    reasonPresent: payload.reason.trim().length > 0,
    recoveryPresent: payload.recovery.trim().length > 0,
    noticeVisible: payload.noticeVisible,
    busyCleared: payload.busyCleared,
    retryVisible: payload.retryVisible,
    intelligenceSettingsVisible: payload.intelligenceSettingsVisible,
    permissionSettingsVisible: payload.permissionSettingsVisible
  }
}

function emptyFailureUiPayload(): FailureUiPayload {
  return {
    code: '',
    reason: '',
    recovery: '',
    noticeVisible: false,
    busyCleared: false,
    retryVisible: false,
    intelligenceSettingsVisible: false,
    permissionSettingsVisible: false
  }
}

function emptyFailureFixtureEvidence(): FailureFixtureEvidence {
  return {
    requests: 0,
    responseHeadersSent: false,
    partialDeltaSent: false,
    bodyHeldOpen: false
  }
}

function emptyLedgerDelta(): LedgerDelta {
  const period = {
    requestDelta: 0,
    successDelta: 0,
    failureDelta: 0,
    tokenDelta: 0,
    costDelta: 0
  }
  return {
    auditDelta: 0,
    auditSuccessDelta: 0,
    auditFailureDelta: 0,
    auditTokenDelta: 0,
    auditCostDelta: 0,
    day: { ...period },
    month: { ...period }
  }
}

function emptyFailureInteractionEvidence(): FailureInteractionEvidence {
  return {
    queryAccepted: false,
    candidateFeatureIds: [],
    selectedFeatureId: '',
    widgetFeatureId: '',
    promptAccepted: false,
    sendReady: false
  }
}

const FAILURE_REPORT_FORBIDDEN_KEYS = new Set([
  'reason',
  'recovery',
  'message',
  'error',
  'rawError',
  'rawDom',
  'requestBody',
  'responseBody',
  'query',
  'inputValue',
  'credential',
  'credentials',
  'apiKey',
  'token',
  'secret',
  'stack',
  'endpoint',
  'path',
  'prompt',
  'response',
  'userDataDir',
  'homeDir',
  'codexHome',
  'tempDir',
  'fileProviderRoot',
  'missingPiPath',
  'piAgentDir',
  'cdpPort',
  'fixturePort',
  'output'
])

export function isFailureMatrixReportRedacted(value: unknown): boolean {
  const visiting = new Set<object>()
  const inspected = new Set<object>()
  const visit = (candidate: unknown): boolean => {
    if (typeof candidate === 'string') {
      return (
        !candidate.startsWith('/') &&
        !/^[A-Za-z]:[\\/]/.test(candidate) &&
        !candidate.startsWith('file:')
      )
    }
    if (candidate === null || typeof candidate !== 'object') return true
    if (inspected.has(candidate)) return true
    if (visiting.has(candidate)) return false
    visiting.add(candidate)
    const valid = Array.isArray(candidate)
      ? candidate.every(visit)
      : Object.entries(candidate as Record<string, unknown>).every(
          ([key, child]) => !FAILURE_REPORT_FORBIDDEN_KEYS.has(key) && visit(child)
        )
    visiting.delete(candidate)
    if (valid) inspected.add(candidate)
    return valid
  }
  return visit(value)
}

export async function hashFailureMatrixArtifact(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export async function readFailureMatrixBundleVersion(appBundlePath: string): Promise<string> {
  const infoPlistPath = path.join(appBundlePath, 'Contents', 'Info.plist')
  const document = await new Promise<Record<string, unknown>>((resolve, reject) => {
    readPlist(infoPlistPath, (error: Error | null, data: unknown) => {
      if (error) reject(error)
      else resolve((data ?? {}) as Record<string, unknown>)
    })
  })
  const version = document.CFBundleShortVersionString
  if (typeof version !== 'string' || !version.trim()) fail('PACKAGED_APP_VERSION_FAILED')
  return version.trim()
}

function isPathWithin(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isProtectedInstalledAppPath(candidate: string, userHome = homedir()): boolean {
  return (
    isPathWithin(candidate, '/Applications') ||
    isPathWithin(candidate, path.join(userHome, 'Applications'))
  )
}

function launchPaths(userDataDir: string): LaunchPaths {
  const acceptanceRoot = path.join(userDataDir, 'failure-matrix')
  return {
    userDataDir,
    homeDir: path.join(acceptanceRoot, 'home'),
    codexHome: path.join(acceptanceRoot, 'codex-home'),
    tempDir: path.join(acceptanceRoot, 'tmp'),
    fileProviderRoot: path.join(acceptanceRoot, 'file-provider-root'),
    missingPiPath: path.join(acceptanceRoot, 'missing-pi'),
    piAgentDir: path.join(acceptanceRoot, 'pi-agent')
  }
}

async function markerMatches(
  userDataDir: string,
  scenario?: FailureScenarioName,
  ownershipToken?: string
): Promise<boolean> {
  try {
    const marker = JSON.parse(
      await readFile(path.join(userDataDir, FAILURE_PROFILE_MARKER), 'utf8')
    ) as Record<string, unknown>
    return (
      marker.schema === FAILURE_PROFILE_SCHEMA &&
      (scenario === undefined || marker.scenario === scenario) &&
      (ownershipToken === undefined || marker.ownershipToken === ownershipToken)
    )
  } catch {
    return false
  }
}

export function isFailureMatrixProfileCleanupTarget(
  candidate: string,
  temporaryRoot = tmpdir()
): boolean {
  const resolved = path.resolve(candidate)
  const root = path.resolve(temporaryRoot)
  const basename = path.basename(resolved)
  return (
    path.dirname(resolved) === root &&
    basename.startsWith(FAILURE_PROFILE_PREFIX) &&
    basename.length > FAILURE_PROFILE_PREFIX.length
  )
}

export async function prepareFailureMatrixProfile(
  scenario: FailureScenarioName,
  fixturePort: number,
  onAllocated?: (profile: PreparedProfile) => void
): Promise<PreparedProfile> {
  const ownershipToken = randomUUID()
  const userDataDir = await mkdtemp(
    path.join(tmpdir(), `${FAILURE_PROFILE_PREFIX}${ownershipToken}-`)
  )
  const paths = launchPaths(userDataDir)
  const profile = { userDataDir, paths, ownershipToken }
  let exposed = false
  try {
    writeFileSync(
      path.join(userDataDir, FAILURE_PROFILE_MARKER),
      JSON.stringify({ schema: FAILURE_PROFILE_SCHEMA, scenario, ownershipToken }),
      { encoding: 'utf8', flag: 'wx', mode: 0o600 }
    )
    const configDir = path.join(userDataDir, 'tuff', 'modules', 'config')
    await Promise.all([
      mkdir(configDir, { recursive: true }),
      mkdir(paths.homeDir, { recursive: true }),
      mkdir(paths.codexHome, { recursive: true }),
      mkdir(paths.tempDir, { recursive: true }),
      mkdir(paths.fileProviderRoot, { recursive: true }),
      mkdir(paths.piAgentDir, { recursive: true })
    ])
    await writeFile(
      path.join(configDir, 'app-setting.ini'),
      JSON.stringify({ beginner: { init: true }, dev: { developerMode: true } }),
      'utf8'
    )
    await writeFile(
      path.join(configDir, 'aisdk-config'),
      JSON.stringify(buildFailureMatrixConfig(scenario, fixturePort)),
      'utf8'
    )
    exposed = true
    onAllocated?.(profile)
    return profile
  } catch (error) {
    if (!exposed) rmSync(userDataDir, { recursive: true, force: true })
    throw error
  }
}

export async function cleanupFailureMatrixProfile(
  profile: PreparedProfile,
  scenario: FailureScenarioName
): Promise<boolean> {
  const resolved = path.resolve(profile.userDataDir)
  const expectedPrefix = `${FAILURE_PROFILE_PREFIX}${profile.ownershipToken}-`
  if (
    !isFailureMatrixProfileCleanupTarget(resolved) ||
    !path.basename(resolved).startsWith(expectedPrefix)
  ) {
    fail('PROFILE_CLEANUP_TARGET_REJECTED')
  }
  const info = await lstat(resolved)
  const [canonical, canonicalTemp] = await Promise.all([realpath(resolved), realpath(tmpdir())])
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    path.dirname(canonical) !== canonicalTemp ||
    !(await markerMatches(canonical, scenario, profile.ownershipToken))
  ) {
    fail('PROFILE_CLEANUP_OWNERSHIP_REJECTED')
  }
  await rm(canonical, { recursive: true, force: false })
  return true
}

export function buildFailureMatrixLaunchEnv(
  baseEnv: NodeJS.ProcessEnv,
  paths: LaunchPaths
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ'] as const) {
    const value = baseEnv[key]
    if (value !== undefined) env[key] = value
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

export async function startFailureFixture(scenario: FailureScenarioName): Promise<FixtureHandle> {
  const evidence = emptyFailureFixtureEvidence()
  const sockets = new Set<Socket>()
  const server: Server = createServer((request, response) => {
    request.resume()
    if (request.method === 'GET' && request.url === '/api/tags') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          models: [{ name: FAILURE_PROVIDER_MODEL, model: FAILURE_PROVIDER_MODEL }]
        })
      )
      return
    }
    if (request.method !== 'POST' || request.url !== '/api/chat') {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end('{}')
      return
    }
    evidence.requests += 1
    if (scenario === 'unsupported-model') {
      response.writeHead(200, { 'content-type': 'application/x-ndjson' })
      response.end(`${JSON.stringify({ error: 'unsupported model' })}\n`)
      evidence.responseHeadersSent ||= response.headersSent
      return
    }
    if (scenario === 'timeout') {
      response.writeHead(200, { 'content-type': 'application/x-ndjson' })
      response.write(`${JSON.stringify({ message: { content: 'partial' }, done: false })}\n`)
      evidence.responseHeadersSent ||= response.headersSent
      evidence.partialDeltaSent = true
      evidence.bodyHeldOpen ||= !response.writableEnded
      return
    }
    response.writeHead(200, { 'content-type': 'application/x-ndjson' })
    response.end(`${JSON.stringify({ done: true, prompt_eval_count: 0, eval_count: 0 })}\n`)
    evidence.responseHeadersSent ||= response.headersSent
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1') {
    for (const socket of sockets) socket.destroy()
    server.close()
    fail('FIXTURE_LOOPBACK_BIND_FAILED')
  }
  return {
    port: address.port,
    getRequestCount: () => evidence.requests,
    getEvidence: () => ({ ...evidence }),
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  }
}

async function isPortAvailable(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createTcpServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

async function resolveCdpPort(requestedPort: number, scenarioIndex: number): Promise<number> {
  if (requestedPort > 0) {
    const candidate = requestedPort + scenarioIndex
    if (candidate > 65_535) fail('CDP_PORT_OUT_OF_RANGE')
    if (!(await isPortAvailable(candidate))) fail('CDP_PORT_IN_USE')
    return candidate
  }
  for (let port = 9781; port <= 9880; port += 1) {
    if (await isPortAvailable(port)) return port
  }
  fail('CDP_PORT_UNAVAILABLE')
}

function launchPackagedApp(executablePath: string, port: number, paths: LaunchPaths): ChildProcess {
  return spawn(executablePath, [`--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: buildFailureMatrixLaunchEnv(process.env, paths),
    stdio: 'ignore',
    detached: process.platform !== 'win32'
  })
}

export async function waitForPackagedAppSpawn(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const observeRuntimeError = (): void => undefined
    const cleanup = (): void => {
      child.off('spawn', onSpawn)
      child.off('error', onError)
      child.on('error', observeRuntimeError)
    }
    const onSpawn = (): void => {
      cleanup()
      resolve()
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    child.once('spawn', onSpawn)
    child.once('error', onError)
  })
}

function processGroupAlive(pid: number): boolean {
  if (process.platform === 'win32') return false
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

async function waitForProcessExit(
  child: ChildProcess,
  pid: number,
  timeoutMs: number
): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (process.platform === 'win32') {
      if (child.exitCode !== null || child.signalCode !== null) return true
    } else if (!processGroupAlive(pid)) return true
    await sleep(100)
  }
  return process.platform === 'win32'
    ? child.exitCode !== null || child.signalCode !== null
    : !processGroupAlive(pid)
}

function signalOwnedProcess(child: ChildProcess, pid: number, signal: NodeJS.Signals): void {
  try {
    if (process.platform === 'win32') child.kill(signal)
    else process.kill(-pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

async function stopOwnedProcess(child: ChildProcess | null): Promise<boolean> {
  if (!child) return true
  const pid = child.pid
  if (!pid) fail('OWNED_CHILD_PID_MISSING')
  if (
    process.platform === 'win32'
      ? child.exitCode === null && child.signalCode === null
      : processGroupAlive(pid)
  ) {
    signalOwnedProcess(child, pid, 'SIGTERM')
  }
  if (await waitForProcessExit(child, pid, 8_000)) return true
  signalOwnedProcess(child, pid, 'SIGKILL')
  if (!(await waitForProcessExit(child, pid, 5_000))) fail('OWNED_CHILD_EXIT_TIMEOUT')
  return true
}

const DEFAULT_FAILURE_SUPERVISOR_DEPENDENCIES: FailureScenarioSupervisorDependencies = {
  launchPackagedApp,
  stopOwnedProcess,
  waitForPackagedAppSpawn,
  waitForPortRelease,
  cleanupFailureMatrixProfile
}

export class FailureScenarioSupervisor {
  private child: ChildProcess | null = null
  private fixture: FixtureHandle | null = null
  private profile: PreparedProfile | null = null
  private cdpPort: number | null = null
  private spawnInFlight: Promise<void> | null = null
  private stopInFlight: Promise<void> | null = null
  private fixtureCloseInFlight: Promise<void> | null = null
  private profileCleanupInFlight: Promise<void> | null = null
  private shutdownInFlight: Promise<FailureScenarioEvidence['failures']> | null = null
  private readonly cleanupFailures = new Map<string, { stage: string; code: string }>()
  private readonly dependencies: FailureScenarioSupervisorDependencies
  private closedFixtureEvidence = emptyFailureFixtureEvidence()
  private interrupted = false

  processStopped = true
  fixtureClosed = false
  profileRemoved = false

  constructor(
    private readonly scenario: FailureScenarioName,
    private readonly cleanupRequested: boolean,
    dependencies: Partial<FailureScenarioSupervisorDependencies> = {}
  ) {
    this.dependencies = { ...DEFAULT_FAILURE_SUPERVISOR_DEPENDENCIES, ...dependencies }
  }

  assertActive = (): void => {
    if (this.interrupted) fail('FAILURE_MATRIX_INTERRUPTED')
  }

  setFixture(fixture: FixtureHandle): void {
    if (this.fixture) fail('FIXTURE_ALREADY_REGISTERED')
    this.fixture = fixture
    this.fixtureClosed = false
    if (this.interrupted) void this.shutdown()
  }

  setProfile(profile: PreparedProfile): void {
    if (this.profile) fail('PROFILE_ALREADY_REGISTERED')
    this.profile = profile
    this.profileRemoved = false
    if (this.interrupted) void this.shutdown()
  }

  setCdpPort(port: number): void {
    if (this.cdpPort !== null) fail('CDP_PORT_ALREADY_REGISTERED')
    this.cdpPort = port
  }

  async launch(executablePath: string, port: number): Promise<ChildProcess> {
    this.assertActive()
    if (!this.profile) fail('PROFILE_NOT_REGISTERED')
    if (this.child) fail('OWNED_CHILD_ALREADY_RUNNING')
    let child: ChildProcess
    try {
      child = this.dependencies.launchPackagedApp(executablePath, port, this.profile.paths)
    } catch {
      fail('PACKAGED_APP_SPAWN_FAILED')
    }
    this.child = child
    this.processStopped = false
    const spawnInFlight = this.dependencies.waitForPackagedAppSpawn(child)
    this.spawnInFlight = spawnInFlight
    try {
      await spawnInFlight
    } catch {
      if (this.child === child) this.child = null
      this.processStopped = true
      fail('PACKAGED_APP_SPAWN_FAILED')
    } finally {
      if (this.spawnInFlight === spawnInFlight) this.spawnInFlight = null
    }
    this.assertActive()
    return child
  }

  interrupt(): Promise<FailureScenarioEvidence['failures']> {
    this.interrupted = true
    return this.shutdown()
  }

  async stop(): Promise<void> {
    if (this.processStopped && !this.child) return
    if (!this.stopInFlight) {
      const owned = this.child
      this.stopInFlight = (async () => {
        await this.spawnInFlight?.catch(() => undefined)
        if (!owned?.pid) {
          if (this.child === owned) this.child = null
          this.processStopped = true
          return
        }
        await this.dependencies.stopOwnedProcess(owned)
        if (this.child === owned) this.child = null
        this.processStopped = true
      })()
    }
    try {
      await this.stopInFlight
    } finally {
      this.stopInFlight = null
    }
  }

  async closeFixture(): Promise<void> {
    if (this.fixtureClosed || !this.fixture) {
      this.fixtureClosed = true
      return
    }
    if (!this.fixtureCloseInFlight) {
      const owned = this.fixture
      this.fixtureCloseInFlight = (async () => {
        this.closedFixtureEvidence = owned.getEvidence()
        await owned.close()
        if (this.fixture === owned) this.fixture = null
        this.fixtureClosed = true
      })()
    }
    try {
      await this.fixtureCloseInFlight
    } finally {
      if (!this.fixtureClosed) this.fixtureCloseInFlight = null
    }
  }

  async cleanupProfile(): Promise<void> {
    if (!this.cleanupRequested || this.profileRemoved || !this.profile) return
    if (!this.processStopped) fail('PROFILE_CLEANUP_WITH_LIVE_CHILD_REJECTED')
    if (!this.profileCleanupInFlight) {
      const owned = this.profile
      this.profileCleanupInFlight = this.dependencies
        .cleanupFailureMatrixProfile(owned, this.scenario)
        .then(() => {
          if (this.profile === owned) this.profile = null
          this.profileRemoved = true
        })
    }
    try {
      await this.profileCleanupInFlight
    } finally {
      if (!this.profileRemoved) this.profileCleanupInFlight = null
    }
  }

  private recordCleanupFailure(error: unknown, stage: string): void {
    if (!this.cleanupFailures.has(stage)) {
      this.cleanupFailures.set(stage, projectFailureMatrixFailure(error, stage))
    }
  }

  private async performShutdown(): Promise<FailureScenarioEvidence['failures']> {
    const processStage = `scenario:${this.scenario}:process-cleanup`
    try {
      await this.stop()
      if (this.cdpPort !== null) {
        await this.dependencies.waitForPortRelease(this.cdpPort)
        this.cdpPort = null
      }
    } catch (error) {
      this.recordCleanupFailure(error, processStage)
    }

    try {
      await this.closeFixture()
    } catch (error) {
      this.recordCleanupFailure(error, `scenario:${this.scenario}:fixture-cleanup`)
    }

    if (this.cleanupRequested) {
      try {
        await this.cleanupProfile()
      } catch (error) {
        this.recordCleanupFailure(error, `scenario:${this.scenario}:profile-cleanup`)
      }
    }
    return [...this.cleanupFailures.values()]
  }

  shutdown(): Promise<FailureScenarioEvidence['failures']> {
    if (!this.shutdownInFlight) {
      const shutdown = this.performShutdown()
      this.shutdownInFlight = shutdown
      void shutdown.finally(() => {
        if (this.shutdownInFlight === shutdown) this.shutdownInFlight = null
      })
    }
    return this.shutdownInFlight
  }

  get fixtureRequests(): number {
    return this.fixtureEvidence.requests
  }

  get fixtureEvidence(): FailureFixtureEvidence {
    return { ...(this.fixture?.getEvidence() ?? this.closedFixtureEvidence) }
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

function databasePathFor(userDataDir: string): string {
  return path.join(userDataDir, 'tuff', 'modules', 'database', 'database.db')
}

function finiteNumber(value: unknown): number {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function emptyUsagePeriod(): CallerLedgerSnapshot['usage']['day'] {
  return {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    totalTokens: 0,
    totalCost: 0
  }
}

async function queryCallerLedger(userDataDir: string): Promise<CallerLedgerSnapshot> {
  const client = createClient({ url: `file:${databasePathFor(userDataDir)}` })
  try {
    const [auditResult, usageResult] = await Promise.all([
      client.execute({
        sql: `SELECT COUNT(*) AS row_count,
                COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS success_count,
                COALESCE(SUM(CASE WHEN success = 1 THEN 0 ELSE 1 END), 0) AS failure_count,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(estimated_cost), 0) AS total_cost
              FROM intelligence_audit_logs
              WHERE caller = ? AND capability_id = ?`,
        args: [FAILURE_CALLER_ID, 'text.chat']
      }),
      client.execute({
        sql: `SELECT period_type,
                COALESCE(SUM(request_count), 0) AS request_count,
                COALESCE(SUM(success_count), 0) AS success_count,
                COALESCE(SUM(failure_count), 0) AS failure_count,
                COALESCE(SUM(total_tokens), 0) AS total_tokens,
                COALESCE(SUM(total_cost), 0) AS total_cost
              FROM intelligence_usage_stats
              WHERE caller_id = ? AND caller_type = ? AND period_type IN ('day', 'month')
              GROUP BY period_type`,
        args: [FAILURE_CALLER_ID, 'plugin']
      })
    ])
    const audit = auditResult.rows[0] as Record<string, unknown> | undefined
    const usage: CallerLedgerSnapshot['usage'] = {
      day: emptyUsagePeriod(),
      month: emptyUsagePeriod()
    }
    for (const row of usageResult.rows as unknown as Array<Record<string, unknown>>) {
      if (row.period_type !== 'day' && row.period_type !== 'month') continue
      usage[row.period_type] = {
        requestCount: finiteNumber(row.request_count),
        successCount: finiteNumber(row.success_count),
        failureCount: finiteNumber(row.failure_count),
        totalTokens: finiteNumber(row.total_tokens),
        totalCost: finiteNumber(row.total_cost)
      }
    }
    return {
      auditCount: finiteNumber(audit?.row_count),
      auditSuccessCount: finiteNumber(audit?.success_count),
      auditFailureCount: finiteNumber(audit?.failure_count),
      auditTotalTokens: finiteNumber(audit?.total_tokens),
      auditTotalCost: finiteNumber(audit?.total_cost),
      usage
    }
  } finally {
    client.close()
  }
}

function subtractUsagePeriod(
  before: CallerLedgerSnapshot['usage']['day'],
  after: CallerLedgerSnapshot['usage']['day']
): FailureScenarioEvidence['ledger']['day'] {
  return {
    requestDelta: after.requestCount - before.requestCount,
    successDelta: after.successCount - before.successCount,
    failureDelta: after.failureCount - before.failureCount,
    tokenDelta: after.totalTokens - before.totalTokens,
    costDelta: after.totalCost - before.totalCost
  }
}

export function summarizeFailureLedgerDelta(
  before: CallerLedgerSnapshot,
  after: CallerLedgerSnapshot
): LedgerDelta {
  return {
    auditDelta: after.auditCount - before.auditCount,
    auditSuccessDelta: after.auditSuccessCount - before.auditSuccessCount,
    auditFailureDelta: after.auditFailureCount - before.auditFailureCount,
    auditTokenDelta: after.auditTotalTokens - before.auditTotalTokens,
    auditCostDelta: after.auditTotalCost - before.auditTotalCost,
    day: subtractUsagePeriod(before.usage.day, after.usage.day),
    month: subtractUsagePeriod(before.usage.month, after.usage.month)
  }
}

function approximatelyZero(value: number): boolean {
  return Math.abs(value) <= Number.EPSILON * 16
}

export function failureLedgerMatchesContract(
  contract: FailureScenarioContract,
  delta: LedgerDelta
): boolean {
  const periodMatches = (period: FailureScenarioEvidence['ledger']['day']): boolean =>
    period.requestDelta === contract.usageRequestDelta &&
    period.successDelta === 0 &&
    period.failureDelta === contract.usageRequestDelta &&
    period.tokenDelta === 0 &&
    approximatelyZero(period.costDelta)
  return (
    delta.auditDelta === contract.auditDelta &&
    delta.auditSuccessDelta === 0 &&
    delta.auditFailureDelta === contract.auditDelta &&
    delta.auditTokenDelta === 0 &&
    approximatelyZero(delta.auditCostDelta) &&
    periodMatches(delta.day) &&
    periodMatches(delta.month)
  )
}

async function waitForLedgerBaseline(
  userDataDir: string,
  timeoutMs: number,
  assertActive: () => void = () => undefined
): Promise<CallerLedgerSnapshot> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    assertActive()
    try {
      return await queryCallerLedger(userDataDir)
    } catch {
      await sleep(200)
    }
  }
  fail('LEDGER_BASELINE_UNAVAILABLE')
}

async function waitForExpectedLedger(
  userDataDir: string,
  before: CallerLedgerSnapshot,
  contract: FailureScenarioContract,
  timeoutMs: number,
  assertActive: () => void = () => undefined
): Promise<{ snapshot: CallerLedgerSnapshot; delta: LedgerDelta }> {
  if (contract.auditDelta === 0) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < FAILURE_NO_AUDIT_OBSERVATION_MS) {
      assertActive()
      await sleep(100)
    }
    const snapshot = await queryCallerLedger(userDataDir)
    return { snapshot, delta: summarizeFailureLedgerDelta(before, snapshot) }
  }
  const startedAt = Date.now()
  let matchedFingerprint = ''
  let matchedAt = 0
  while (Date.now() - startedAt < timeoutMs) {
    assertActive()
    try {
      const snapshot = await queryCallerLedger(userDataDir)
      const delta = summarizeFailureLedgerDelta(before, snapshot)
      if (failureLedgerMatchesContract(contract, delta)) {
        const fingerprint = JSON.stringify(delta)
        if (fingerprint !== matchedFingerprint) {
          matchedFingerprint = fingerprint
          matchedAt = Date.now()
        } else if (Date.now() - matchedAt >= 750) {
          return { snapshot, delta }
        }
      } else {
        matchedFingerprint = ''
        matchedAt = 0
      }
    } catch {
      matchedFingerprint = ''
      matchedAt = 0
    }
    await sleep(250)
  }
  fail('EXPECTED_LEDGER_DELTA_NOT_OBSERVED')
}

async function evaluate<T>(send: CdpSend, expression: string): Promise<T> {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  return response.result?.result?.value as T
}

async function bringToFront(send: CdpSend): Promise<void> {
  await send('Page.bringToFront')
  await evaluate(send, `(() => { window.focus(); return true })()`)
}

async function pickMainRenderer(
  remoteDebuggingUrl: string,
  timeoutMs: number,
  assertActive: () => void = () => undefined
): Promise<DevToolsTarget> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    assertActive()
    const targets = await loadTargets(remoteDebuggingUrl).catch(() => [])
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
          await bringToFront(send)
          return await evaluate<{
            hasRouter: boolean
            hasChannel: boolean
            href: string
            area: number
          }>(
            send,
            `({
              hasRouter: Boolean(window.__VUE_ROUTER__?.push),
              hasChannel: Boolean(window.touchChannel?.send),
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
        // Renderers still booting are retried from a fresh target list.
      }
    }
    candidates.sort((left, right) => right.score - left.score)
    if (candidates[0]) return candidates[0].target
    await sleep(400)
  }
  fail('MAIN_RENDERER_NOT_FOUND')
}

async function sendMainEvent<T>(
  target: DevToolsTarget,
  eventName: string,
  payload?: unknown
): Promise<T> {
  return await withTarget(target, async (send) => {
    await bringToFront(send)
    return await evaluate<T>(
      send,
      `(async () => {
        const channel = window.touchChannel
        if (!channel?.send) throw new Error('CHANNEL_UNAVAILABLE')
        return await channel.send(${JSON.stringify(eventName)}, ${JSON.stringify(payload)}, { timeout: 12000 })
      })()`
    )
  })
}

async function grantRequiredPermissions(target: DevToolsTarget): Promise<boolean> {
  const result = await sendMainEvent<{ success?: unknown }>(
    target,
    PERMISSION_GRANT_MULTIPLE_EVENT,
    {
      pluginId: PLUGIN_NAME,
      permissionIds: [...REQUIRED_PERMISSIONS],
      grantedBy: 'user'
    }
  )
  if (result?.success !== true) return false
  const startedAt = Date.now()
  while (Date.now() - startedAt < 12_000) {
    const checks = await Promise.all(
      REQUIRED_PERMISSIONS.map((permissionId) =>
        sendMainEvent<boolean>(target, PERMISSION_CHECK_EVENT, {
          pluginId: PLUGIN_NAME,
          permissionId,
          sdkapi: PLUGIN_SDK_API
        }).catch(() => false)
      )
    )
    if (checks.every(Boolean)) return true
    await sleep(250)
  }
  return false
}

export type FailureMatrixMainEventSender = <T>(eventName: string, payload?: unknown) => Promise<T>

export async function enableFailureSearchProvider(
  send: FailureMatrixMainEventSender,
  updatedAt = Date.now()
): Promise<boolean> {
  const current = await send<SearchProviderConfigResponse>(SEARCH_PROVIDER_CONFIG_GET_EVENT)
  if (!Array.isArray(current?.providers)) return false
  if (!current.providers.some((provider) => provider.providerId === FAILURE_SEARCH_PROVIDER_ID)) {
    return false
  }

  const request: SearchProviderConfigUpdateRequest = {
    providers: current.providers.map((provider, index) => ({
      providerId: provider.providerId,
      enabled:
        provider.providerId === FAILURE_SEARCH_PROVIDER_ID ? true : provider.enabled === true,
      order: Number.isFinite(provider.order) ? provider.order : index + 1,
      updatedAt:
        provider.providerId === FAILURE_SEARCH_PROVIDER_ID
          ? updatedAt
          : Number.isFinite(provider.updatedAt)
            ? provider.updatedAt
            : undefined
    }))
  }
  const updated = await send<SearchProviderConfigUpdateResult>(
    SEARCH_PROVIDER_CONFIG_UPDATE_EVENT,
    request
  )
  return (
    updated?.providers?.some(
      (provider) => provider.providerId === FAILURE_SEARCH_PROVIDER_ID && provider.enabled === true
    ) === true
  )
}

export async function enableFailurePlugin(
  send: FailureMatrixMainEventSender,
  options: {
    attempts?: number
    pollIntervalMs?: number
    wait?: (ms: number) => Promise<void>
  } = {}
): Promise<boolean> {
  const attempts = Math.max(1, options.attempts ?? 48)
  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? 250)
  const wait = options.wait ?? sleep
  let enableRequested = false

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await send<PluginApiGetStatusResponse>(PLUGIN_GET_STATUS_EVENT, {
      name: PLUGIN_NAME
    })
    if (status === 3 || status === 4) return true

    const enableable = status === 0 || status === 2 || status === 6 || status === 7
    if (enableable && !enableRequested) {
      enableRequested = true
      await send<PluginApiOperationResponse>(PLUGIN_ENABLE_EVENT, {
        name: PLUGIN_NAME
      })
    }

    if (attempt + 1 < attempts) await wait(pollIntervalMs)
  }
  return false
}

async function revokeIntelligencePermission(target: DevToolsTarget): Promise<boolean> {
  const result = await sendMainEvent<{ success?: unknown }>(target, PERMISSION_REVOKE_EVENT, {
    pluginId: PLUGIN_NAME,
    permissionId: 'intelligence.basic'
  })
  if (result?.success !== true) return false
  return (
    (await sendMainEvent<boolean>(target, PERMISSION_CHECK_EVENT, {
      pluginId: PLUGIN_NAME,
      permissionId: 'intelligence.basic',
      sdkapi: PLUGIN_SDK_API
    })) === false
  )
}

async function disableCallerQuota(target: DevToolsTarget): Promise<boolean> {
  const config = {
    callerId: FAILURE_CALLER_ID,
    callerType: 'plugin',
    enabled: false
  }
  const setResult = await sendMainEvent<{ ok?: unknown }>(target, QUOTA_SET_EVENT, config)
  if (setResult?.ok !== true) return false
  const checked = await sendMainEvent<{ ok?: unknown; result?: { allowed?: unknown } }>(
    target,
    QUOTA_CHECK_EVENT,
    { callerId: FAILURE_CALLER_ID, callerType: 'plugin', estimatedTokens: 0 }
  )
  return checked?.ok === true && checked.result?.allowed === false
}

async function inspectCoreBoxTarget(target: DevToolsTarget): Promise<CoreBoxProbeDom> {
  return await withTarget(target, async (send) => {
    return await evaluate<CoreBoxProbeDom>(
      send,
      `(() => {
        const text = document.body?.innerText || ''
        const input = document.querySelector('#core-box-input input, input#core-box-input, input')
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          bodyText: text.slice(0, 2000),
          bodyClass: document.body?.className || '',
          hasCoreBoxClass: document.body?.classList?.contains('core-box') === true,
          inputIdExists: Boolean(input),
          inputValue: input && 'value' in input ? input.value : '',
          hasPromptSendButton: Boolean(document.querySelector('.CoreBox-SendButton')),
          hasAiChatbot: /智能问答|AI Ask|touch-intelligence/i.test(text),
          hasErrorNotice: Boolean(document.querySelector('.AiChatbot__errorNotice')),
          hasPermissionText: false,
          hasModelUnsupportedText: false,
          hasProviderUnavailableText: false,
          hasLoggedOutText: false,
          hasQuotaText: false,
          buttons: [],
          debug: {
            visibleInputKinds: [],
            visibleCapabilities: [],
            hasVisibleImageInput: false,
            hasVisibleOcrSignal: false,
            hasVisibleTextChatSignal: false,
            hasVisibleCopyFailureSignal: false,
            queryInputDebug: null
          }
        }
      })()`
    )
  })
}

async function pickCoreBoxTarget(
  remoteDebuggingUrl: string,
  timeoutMs: number,
  assertActive: () => void = () => undefined
): Promise<DevToolsTarget> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    assertActive()
    const targets = await loadTargets(remoteDebuggingUrl).catch(() => [])
    const inspected: Array<{ target: DevToolsTarget; dom: CoreBoxProbeDom }> = []
    for (const target of targets) {
      if (target.type !== 'page' || !target.webSocketDebuggerUrl) continue
      try {
        inspected.push({ target, dom: await inspectCoreBoxTarget(target) })
      } catch {
        // The target may be replaced while CoreBox is opening.
      }
    }
    const selected = selectCoreBoxTarget(inspected)
    if (selected) return selected.target
    await sleep(250)
  }
  fail('CORE_BOX_TARGET_NOT_FOUND')
}

export function buildCoreBoxInputMutationExpression(value: string): string {
  return `(() => {
      const input = document.querySelector('#core-box-input input, input#core-box-input, input')
      if (!(input instanceof HTMLInputElement)) return false
      input.focus()
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (setter) setter.call(input, ${JSON.stringify(value)})
      else input.value = ${JSON.stringify(value)}
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ${JSON.stringify(value)}
      }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`
}

async function setCoreBoxInput(send: CdpSend, value: string): Promise<boolean> {
  return await evaluate<boolean>(send, buildCoreBoxInputMutationExpression(value))
}

export function buildFailureSearchObserverInstallExpression(): string {
  return `(() => {
    const observerKey = ${JSON.stringify(FAILURE_SEARCH_OBSERVER_KEY)}
    const existing = window[observerKey]
    if (existing?.version === 1) return existing.channelCount > 0

    ${FAILURE_VUE_COMPONENT_COLLECTOR_SOURCE}
    const searchEvent = ${JSON.stringify(FAILURE_SEARCH_EVENT)}
    const streamStartEvent = searchEvent + ':stream:start'
    const streamDataPrefix = searchEvent + ':stream:data:'
    const streamEndPrefix = searchEvent + ':stream:end:'
    const streamErrorPrefix = searchEvent + ':stream:error:'
    const expectedFeatureIds = new Set(${JSON.stringify(FAILURE_BUILTIN_FEATURE_IDS)})
    const itemLimit = ${FAILURE_SEARCH_OBSERVER_ITEM_LIMIT}
    const featureQuery = ${JSON.stringify(FAILURE_FEATURE_QUERY)}
    const text = (value) => typeof value === 'string' ? value : ''
    const isObject = (value) => value !== null && typeof value === 'object'
    const unwrapChannelPayload = (raw) =>
      isObject(raw) && 'data' in raw && 'header' in raw ? raw.data : raw
    const unwrapVueItem = (item) => {
      let current = item
      for (let depth = 0; depth < 3 && isObject(current); depth += 1) {
        const raw = current.__v_raw
        if (!isObject(raw) || raw === current) break
        current = raw
      }
      return current
    }
    const isFailureFeatureItem = (item) => {
      const raw = unwrapVueItem(item)
      return isObject(raw) &&
        raw.source?.id === ${JSON.stringify(PLUGIN_FEATURE_SOURCE_ID)} &&
        raw.meta?.pluginName === ${JSON.stringify(PLUGIN_NAME)} &&
        expectedFeatureIds.has(text(raw.meta?.featureId))
    }
    const remembersItem = (record, item) => {
      const raw = unwrapVueItem(item)
      if (!isFailureFeatureItem(raw) || record.items.size >= itemLimit) return
      record.items.add(raw)
    }
    const rememberItems = (record, items, reset) => {
      if (reset) record.items.clear()
      if (!Array.isArray(items)) return
      for (const item of items) remembersItem(record, item)
    }
    const itemBelongsToRecord = (record, item) => {
      let current = item
      for (let depth = 0; depth < 4 && isObject(current); depth += 1) {
        if (record.items.has(current)) return true
        const raw = current.__v_raw
        if (!isObject(raw) || raw === current) break
        current = raw
      }
      return false
    }
    const collectCandidateEntries = (record) => {
      if (!record?.valid || !record.snapshotObserved) return []
      const itemMap = collectVueItemMap()
      const nodes = Array.from(
        document.querySelectorAll('.BoxGridItem, .item-list > .CoreBoxRender')
      )
      const entries = []
      nodes.forEach((node, domIndex) => {
        if (!(node instanceof HTMLElement)) return
        const item = itemMap.get(node)
        if (!itemBelongsToRecord(record, item)) return
        const style = getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        entries.push({
          node,
          candidate: {
            domIndex,
            itemId: text(item?.id),
            sourceId: text(item?.source?.id),
            pluginName: text(item?.meta?.pluginName),
            featureId: text(item?.meta?.featureId),
            visible:
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              rect.width > 0 &&
              rect.height > 0
          }
        })
      })
      return entries
    }

    const state = {
      version: 1,
      channelCount: 0,
      revision: 0,
      active: null,
      wrappedChannels: new WeakSet(),
      bump(record) {
        this.revision += 1
        record.resultRevision = this.revision
      },
      begin(payload) {
        const requestId = text(payload?.streamId)
        if (!requestId) return
        this.active = {
          requestId,
          requestedQuery: text(payload?.query?.text),
          query: '',
          sessionId: '',
          resultRevision: this.revision,
          snapshotObserved: false,
          terminalObserved: false,
          settled: false,
          valid: true,
          items: new Set()
        }
      },
      invalidate(requestId) {
        const record = this.active
        if (!record || record.requestId !== requestId) return
        record.valid = false
        record.settled = false
        record.items.clear()
        this.bump(record)
      },
      consumeChunk(requestId, chunk) {
        const record = this.active
        if (!record || record.requestId !== requestId || !isObject(chunk)) return
        if (record.terminalObserved) return this.invalidate(requestId)
        const sessionId = text(chunk.sessionId)
        const sessionMatches = () =>
          Boolean(sessionId) && (!record.sessionId || record.sessionId === sessionId)
        if (chunk.type === 'session') {
          if (!sessionMatches()) return this.invalidate(requestId)
          record.sessionId = sessionId
          record.settled = false
          this.bump(record)
          return
        }
        if (chunk.type === 'snapshot') {
          if (!sessionMatches() || !isObject(chunk.result)) return this.invalidate(requestId)
          const resultSessionId = text(chunk.result.sessionId)
          if (resultSessionId && resultSessionId !== sessionId) return this.invalidate(requestId)
          record.sessionId = sessionId
          record.query = text(chunk.result.query?.text)
          record.snapshotObserved = true
          record.settled = false
          rememberItems(record, chunk.result.items, true)
          this.bump(record)
          return
        }
        if (!record.snapshotObserved || !sessionMatches()) return this.invalidate(requestId)
        if (chunk.type === 'update') {
          rememberItems(record, chunk.items, false)
          record.settled = false
          this.bump(record)
          return
        }
        if (chunk.type === 'no-results') {
          record.settled = false
          this.bump(record)
          return
        }
        if (chunk.type === 'complete') {
          record.terminalObserved = true
          this.bump(record)
          record.settled =
            record.valid &&
            chunk.cancelled !== true &&
            record.requestedQuery === record.query
        }
      },
      consumeChannel(eventName, raw) {
        const payload = unwrapChannelPayload(raw)
        if (eventName.startsWith(streamDataPrefix)) {
          const requestId = eventName.slice(streamDataPrefix.length)
          this.consumeChunk(requestId, payload?.chunk)
          return
        }
        if (eventName.startsWith(streamErrorPrefix)) {
          this.invalidate(eventName.slice(streamErrorPrefix.length))
          return
        }
        if (eventName.startsWith(streamEndPrefix)) {
          const requestId = eventName.slice(streamEndPrefix.length)
          const record = this.active
          if (record?.requestId === requestId && !record.settled) this.invalidate(requestId)
        }
      },
      consumePort(raw) {
        if (!isObject(raw) || raw.channel !== searchEvent) return
        const requestId = text(raw.streamId)
        if (!requestId) return
        if (raw.type === 'data') {
          this.consumeChunk(requestId, raw.chunk ?? raw.payload?.chunk)
          return
        }
        if (raw.type === 'error') this.invalidate(requestId)
        if (raw.type === 'end' || raw.type === 'close') {
          const record = this.active
          if (record?.requestId === requestId && !record.settled) this.invalidate(requestId)
        }
      },
      read() {
        const record = this.active
        if (!record) return null
        return {
          query: record.query,
          requestId: record.requestId,
          sessionId: record.sessionId,
          resultRevision: record.resultRevision,
          settled: Boolean(record.settled),
          candidates: collectCandidateEntries(record).map((entry) => entry.candidate)
        }
      },
      click(identity, expected) {
        const record = this.active
        if (
          !record?.settled ||
          record.query !== featureQuery ||
          record.requestId !== identity?.requestId ||
          record.sessionId !== identity?.sessionId ||
          record.resultRevision !== identity?.resultRevision
        ) {
          return false
        }
        const matches = collectCandidateEntries(record).filter(({ candidate }) =>
          candidate.domIndex === expected?.domIndex &&
          candidate.itemId === expected?.itemId &&
          candidate.sourceId === expected?.sourceId &&
          candidate.pluginName === expected?.pluginName &&
          candidate.featureId === expected?.featureId &&
          candidate.visible === true
        )
        if (matches.length !== 1) return false
        matches[0].node.click()
        return true
      }
    }

    Object.defineProperty(window, observerKey, {
      configurable: true,
      enumerable: false,
      value: state
    })

    const wrapChannel = (channel) => {
      if (
        !isObject(channel) ||
        state.wrappedChannels.has(channel) ||
        typeof channel.send !== 'function' ||
        typeof channel.regChannel !== 'function'
      ) {
        return
      }
      const originalSend = channel.send
      const originalRegChannel = channel.regChannel
      const wrappedSend = function(eventName, payload, ...rest) {
        if (eventName === streamStartEvent) state.begin(payload)
        return Reflect.apply(originalSend, this, [eventName, payload, ...rest])
      }
      const wrappedRegChannel = function(eventName, callback, ...rest) {
        const observed =
          typeof eventName === 'string' &&
          (eventName.startsWith(streamDataPrefix) ||
            eventName.startsWith(streamEndPrefix) ||
            eventName.startsWith(streamErrorPrefix)) &&
          typeof callback === 'function'
        const nextCallback = observed
          ? function(...args) {
              state.consumeChannel(eventName, args[0])
              return Reflect.apply(callback, this, args)
            }
          : callback
        return Reflect.apply(originalRegChannel, this, [eventName, nextCallback, ...rest])
      }
      try {
        channel.send = wrappedSend
        channel.regChannel = wrappedRegChannel
        if (channel.send !== wrappedSend || channel.regChannel !== wrappedRegChannel) return
        state.wrappedChannels.add(channel)
        state.channelCount += 1
      } catch {}
    }

    const channels = [window.touchChannel, window.$touchChannel, window.$channel]
    for (const channel of channels) wrapChannel(channel)
    window.addEventListener('message', (event) => {
      const message = event.data
      if (
        event.source !== window ||
        !isObject(message) ||
        message.marker !== 'talex-touch:transport-port-handoff:v1' ||
        message.payload?.channel !== searchEvent ||
        event.ports?.length !== 1
      ) {
        return
      }
      const port = event.ports[0]
      if (!port || typeof port.addEventListener !== 'function') return
      port.addEventListener('message', (portEvent) => state.consumePort(portEvent.data))
      port.start?.()
    })
    return state.channelCount > 0
  })()`
}

export function buildFailureSearchResultObservationExpression(): string {
  return `(() => window[${JSON.stringify(FAILURE_SEARCH_OBSERVER_KEY)}]?.read?.() ?? null)()`
}

export function buildFailureFeatureCandidateClickExpression(
  candidate: FailureFeatureCandidate,
  identity: FailureSearchResultIdentity
): string {
  return `(() => window[${JSON.stringify(FAILURE_SEARCH_OBSERVER_KEY)}]?.click?.(
    ${JSON.stringify(identity)},
    ${JSON.stringify(candidate)}
  ) === true)()`
}

async function installFailureSearchObserver(send: CdpSend): Promise<boolean> {
  return await evaluate<boolean>(send, buildFailureSearchObserverInstallExpression())
}

async function readFailureSearchResult(
  send: CdpSend
): Promise<FailureSearchResultObservation | null> {
  return await evaluate<FailureSearchResultObservation | null>(
    send,
    buildFailureSearchResultObservationExpression()
  )
}

async function clickFailureFeatureCandidate(
  send: CdpSend,
  candidate: FailureFeatureCandidate,
  identity: FailureSearchResultIdentity
): Promise<boolean> {
  return await evaluate<boolean>(
    send,
    buildFailureFeatureCandidateClickExpression(candidate, identity)
  )
}

async function readFailureWidgetReadiness(send: CdpSend): Promise<FailureWidgetReadiness | null> {
  return await evaluate<FailureWidgetReadiness | null>(
    send,
    `(() => {
      ${FAILURE_VUE_COMPONENT_COLLECTOR_SOURCE}
      const text = (value) => typeof value === 'string' ? value : ''
      const revision = (value) =>
        typeof value === 'string' || typeof value === 'number' ? String(value) : ''
      const widget = document.querySelector('.CoreBoxRender-Widget')
      if (!(widget instanceof HTMLElement)) return null
      const item = collectVueItemMap().get(widget)
      const askPanelComponent = collectVueComponents().find((component) => {
        const root = component?.vnode?.el
        return root instanceof Element && root.matches('.AiChatbot') && widget.contains(root)
      })
      const payloadCandidates = askPanelComponent
        ? [
            askPanelComponent.props?.payload,
            askPanelComponent.setupState?.widgetPayload?.value
              ?? askPanelComponent.setupState?.widgetPayload,
            askPanelComponent.ctx?.widgetPayload?.value ?? askPanelComponent.ctx?.widgetPayload
          ]
        : []
      const payload = payloadCandidates.find((value) => {
        return value && typeof value === 'object' && typeof value.status === 'string'
      })
      const input = document.querySelector('#core-box-input input, input#core-box-input, input')
      const sendButton = document.querySelector(
        'button.CoreBox-SendButton:not(.CoreBox-LocalAiButton)'
      )
      return {
        pluginName: text(item?.meta?.pluginName),
        featureId: text(item?.meta?.featureId),
        hasAiChatbot: Boolean(askPanelComponent),
        hasPromptSendButton: sendButton instanceof HTMLButtonElement,
        promptSendEnabled: sendButton instanceof HTMLButtonElement && !sendButton.disabled,
        promptMatchesFailurePrompt:
          text(payload?.prompt) === ${JSON.stringify(FAILURE_PROMPT)},
        updatedAt: revision(payload?.updatedAt),
        inputValue: input instanceof HTMLInputElement ? input.value : '',
        requestId: text(payload?.requestId ?? item?.meta?.intelligence?.requestId),
        status: text(payload?.status ?? item?.meta?.status)
      }
    })()`
  )
}

export async function prepareFailureWidgetWithDriver(
  driver: FailureWidgetPreparationDriver,
  interaction: FailureInteractionEvidence,
  assertActive: () => void = () => undefined
): Promise<void> {
  await driver.bringToFront()
  let queryBaseline = await driver.readSearchResult().catch(() => null)
  if (!(await driver.setInput(FAILURE_FEATURE_QUERY))) {
    fail('CORE_BOX_INPUT_UNAVAILABLE')
  }

  const startedAt = driver.now()
  let activationTriggered = false
  let lastCandidateScanAt = Number.NEGATIVE_INFINITY
  let lastQueryRefreshAt = startedAt
  let lastObservedIdentitySignature = ''
  let lastCandidateSignature = ''
  let stableCandidateSamples = 0
  let lastReadinessSignature = ''
  let stableReadinessSamples = 0

  while (driver.now() - startedAt < FAILURE_WIDGET_PREPARATION_TIMEOUT_MS) {
    assertActive()
    const now = driver.now()
    const searchResult = await driver.readSearchResult().catch(() => null)
    const observedIdentitySignature = failureSearchResultIdentitySignature(searchResult)
    if (observedIdentitySignature !== lastObservedIdentitySignature) {
      lastObservedIdentitySignature = observedIdentitySignature
      lastCandidateSignature = ''
      stableCandidateSamples = 0
    }
    const queryAccepted = isFailureSearchResultAfterBaseline(searchResult, queryBaseline)
    interaction.queryAccepted ||= queryAccepted
    const widgetReadiness = await driver.readReadiness().catch(() => null)
    if (widgetReadiness) interaction.widgetFeatureId = widgetReadiness.featureId

    if (activationTriggered) {
      const readinessSignature = failureWidgetReadinessSignature(widgetReadiness)
      if (readinessSignature && readinessSignature === lastReadinessSignature) {
        stableReadinessSamples += 1
      } else {
        lastReadinessSignature = readinessSignature ?? ''
        stableReadinessSamples = readinessSignature ? 1 : 0
      }
      if (stableReadinessSamples >= FAILURE_WIDGET_STABLE_SAMPLE_COUNT) return
    } else if (
      widgetReadiness === null &&
      queryAccepted &&
      now - lastCandidateScanAt >= FAILURE_WIDGET_CANDIDATE_SAMPLE_MS
    ) {
      lastCandidateScanAt = now
      const candidates = searchResult.candidates
      interaction.candidateFeatureIds = candidates
        .map((candidate) => candidate.featureId)
        .filter(Boolean)
        .slice(0, FAILURE_CANDIDATE_EVIDENCE_LIMIT)
      const candidateSetSignature = failureFeatureCandidateSignature(candidates)
      const candidateSignature = candidateSetSignature
        ? `${observedIdentitySignature}|${candidateSetSignature}`
        : null
      if (candidateSignature && candidateSignature === lastCandidateSignature) {
        stableCandidateSamples += 1
      } else {
        lastCandidateSignature = candidateSignature ?? ''
        stableCandidateSamples = candidateSignature ? 1 : 0
      }

      if (stableCandidateSamples >= FAILURE_WIDGET_STABLE_SAMPLE_COUNT) {
        const candidate = selectFailureFeatureCandidate(candidates)
        if (
          candidate &&
          (await driver.clickCandidate(candidate, projectFailureSearchResultIdentity(searchResult)))
        ) {
          interaction.selectedFeatureId = candidate.featureId
          activationTriggered = true
          lastReadinessSignature = ''
          stableReadinessSamples = 0
        } else {
          lastCandidateSignature = ''
          stableCandidateSamples = 0
        }
      }
    }

    const candidateSetSignature = searchResult
      ? failureFeatureCandidateSignature(searchResult.candidates)
      : null
    if (
      !activationTriggered &&
      now - lastQueryRefreshAt >= FAILURE_WIDGET_QUERY_REFRESH_MS &&
      (!queryAccepted || !candidateSetSignature)
    ) {
      // A missing/invalid first stream is just as stale as a settled result without registered
      // features. Preserve any observed identity as the baseline, then force a fresh Vue search.
      if (searchResult) queryBaseline = { ...searchResult, candidates: [] }
      interaction.candidateFeatureIds = []
      if (!(await driver.setInput(''))) fail('CORE_BOX_INPUT_UNAVAILABLE')
      await driver.wait(FAILURE_WIDGET_QUERY_REFRESH_GAP_MS)
      assertActive()
      if (!(await driver.setInput(FAILURE_FEATURE_QUERY))) fail('CORE_BOX_INPUT_UNAVAILABLE')
      lastQueryRefreshAt = driver.now()
      lastCandidateScanAt = lastQueryRefreshAt
      lastObservedIdentitySignature = ''
      lastCandidateSignature = ''
      stableCandidateSamples = 0
    }
    await driver.wait(FAILURE_WIDGET_POLL_MS)
  }
  fail('INTELLIGENCE_WIDGET_NOT_READY')
}

async function prepareFailureWidget(
  send: CdpSend,
  interaction: FailureInteractionEvidence,
  assertActive: () => void = () => undefined
): Promise<void> {
  if (!(await installFailureSearchObserver(send))) {
    fail('CORE_BOX_SEARCH_OBSERVER_UNAVAILABLE')
  }
  await prepareFailureWidgetWithDriver(
    {
      bringToFront: () => bringToFront(send),
      setInput: (value) => setCoreBoxInput(send, value),
      readSearchResult: () => readFailureSearchResult(send),
      clickCandidate: (candidate, identity) =>
        clickFailureFeatureCandidate(send, candidate, identity),
      readReadiness: () => readFailureWidgetReadiness(send),
      now: () => Date.now(),
      wait: sleep
    },
    interaction,
    assertActive
  )
}

async function clickFailurePromptSendButton(send: CdpSend): Promise<boolean> {
  return await evaluate<boolean>(
    send,
    `(() => {
      ${FAILURE_VUE_COMPONENT_COLLECTOR_SOURCE}
      const widget = document.querySelector('.CoreBoxRender-Widget')
      if (!(widget instanceof HTMLElement)) return false
      const item = collectVueItemMap().get(widget)
      const input = document.querySelector('#core-box-input input, input#core-box-input, input')
      const button = document.querySelector(
        'button.CoreBox-SendButton:not(.CoreBox-LocalAiButton)'
      )
      if (
        item?.meta?.pluginName !== ${JSON.stringify(PLUGIN_NAME)} ||
        item?.meta?.featureId !== ${JSON.stringify(FAILURE_FEATURE_ID)} ||
        !(input instanceof HTMLInputElement) ||
        input.value !== ${JSON.stringify(FAILURE_PROMPT)} ||
        !(button instanceof HTMLButtonElement) ||
        button.disabled
      ) {
        return false
      }
      button.click()
      return true
    })()`
  )
}

const DEFAULT_FAILURE_POLLING_TIMING: FailurePollingTiming = {
  now: () => Date.now(),
  wait: sleep
}

export async function waitForFailurePromptDispatch(
  readReadiness: () => Promise<FailureWidgetReadiness | null>,
  previous: FailureWidgetReadiness | null,
  timeoutMs: number = FAILURE_PROMPT_DISPATCH_TIMEOUT_MS,
  assertActive: () => void = () => undefined,
  timing: FailurePollingTiming = DEFAULT_FAILURE_POLLING_TIMING
): Promise<FailureWidgetReadiness> {
  const startedAt = timing.now()
  while (timing.now() - startedAt < timeoutMs) {
    assertActive()
    const readiness = await readReadiness().catch(() => null)
    if (isFailurePromptDispatched(previous, readiness)) return readiness!
    await timing.wait(FAILURE_PROMPT_DISPATCH_POLL_MS)
  }
  fail('FAILURE_PROMPT_NOT_DISPATCHED')
}

export async function submitFailurePromptWithDriver(
  driver: FailurePromptSubmissionDriver,
  interaction: FailureInteractionEvidence,
  assertActive: () => void = () => undefined
): Promise<void> {
  if (!(await driver.setInput(FAILURE_PROMPT))) {
    fail('CORE_BOX_INPUT_UNAVAILABLE')
  }
  interaction.sendReady = false

  const startedAt = driver.now()
  while (driver.now() - startedAt < FAILURE_PROMPT_DISPATCH_TIMEOUT_MS) {
    assertActive()
    const readiness = await driver.readReadiness().catch(() => null)
    if (readiness) interaction.widgetFeatureId = readiness.featureId
    interaction.promptAccepted =
      isFailureWidgetReady(readiness) && readiness?.inputValue === FAILURE_PROMPT
    const sendButtonReady =
      interaction.promptAccepted === true && readiness?.promptSendEnabled === true
    if (sendButtonReady && (await driver.clickSendButton())) {
      await waitForFailurePromptDispatch(
        () => driver.readReadiness(),
        readiness,
        FAILURE_PROMPT_DISPATCH_TIMEOUT_MS,
        assertActive,
        driver
      )
      interaction.sendReady = true
      return
    }
    await driver.wait(FAILURE_PROMPT_DISPATCH_POLL_MS)
  }
  fail('FAILURE_PROMPT_SEND_NOT_READY')
}

async function submitFailurePrompt(
  send: CdpSend,
  interaction: FailureInteractionEvidence,
  assertActive: () => void = () => undefined
): Promise<void> {
  await submitFailurePromptWithDriver(
    {
      setInput: (value) => setCoreBoxInput(send, value),
      readReadiness: () => readFailureWidgetReadiness(send),
      clickSendButton: () => clickFailurePromptSendButton(send),
      now: () => Date.now(),
      wait: sleep
    },
    interaction,
    assertActive
  )
}

async function readFailureUiPayload(send: CdpSend): Promise<FailureUiPayload | null> {
  return await evaluate<FailureUiPayload | null>(
    send,
    `(() => {
      ${FAILURE_VUE_COMPONENT_COLLECTOR_SOURCE}
      const notice = document.querySelector('.AiChatbot__errorNotice')
      if (!(notice instanceof HTMLElement)) return null
      const candidates = []
      for (const component of collectVueComponents()) {
        const root = component?.vnode?.el
        if (!(root instanceof Element) || (root !== notice && !root.contains(notice))) continue
        candidates.push(component?.props?.payload)
        candidates.push(component?.setupState?.widgetPayload?.value ?? component?.setupState?.widgetPayload)
        candidates.push(component?.ctx?.widgetPayload?.value ?? component?.ctx?.widgetPayload)
      }
      const payload = candidates.find((value) => {
        return value && typeof value === 'object' && typeof value.errorCode === 'string'
      })
      const safeText = (value) => typeof value === 'string' ? value.trim().slice(0, 240) : ''
      const buttons = Array.from(notice.querySelectorAll('button')).filter((button) => {
        const style = getComputedStyle(button)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
      const buttonText = buttons.map((button) => (button.textContent || '').trim())
      const root = notice.closest('.AiChatbot') || notice.parentElement
      return {
        code: safeText(payload?.errorCode),
        reason: safeText(payload?.errorReason),
        recovery: safeText(payload?.errorRecovery),
        noticeVisible: true,
        busyCleared: !root?.querySelector('.AiChatbot__requestNotice'),
        retryVisible: Boolean(notice.querySelector('.AiChatbot__retryAction')),
        intelligenceSettingsVisible: buttonText.some((text) => /AI 渠道|Intelligence.*设置/i.test(text)),
        permissionSettingsVisible: buttonText.some((text) => /插件权限|permission/i.test(text))
      }
    })()`
  )
}

export async function waitForExpectedFailureUi(
  readPayload: () => Promise<FailureUiPayload | null>,
  expectedCode: FailureErrorCode,
  timeoutMs: number,
  assertActive: () => void = () => undefined,
  timing: FailurePollingTiming = DEFAULT_FAILURE_POLLING_TIMING
): Promise<FailureUiPayload> {
  const startedAt = timing.now()
  let lastPayload: FailureUiPayload | null = null
  while (timing.now() - startedAt < timeoutMs) {
    assertActive()
    const payload = await readPayload().catch(() => null)
    if (payload) lastPayload = payload
    if (
      payload?.code === expectedCode &&
      payload.reason.length > 0 &&
      payload.recovery.length > 0 &&
      payload.noticeVisible &&
      payload.busyCleared
    ) {
      return payload
    }
    await timing.wait(FAILURE_WIDGET_POLL_MS)
  }
  throw new FailureUiObservationError('EXPECTED_CORE_BOX_FAILURE_NOT_OBSERVED', lastPayload)
}

async function waitForFailureUi(
  send: CdpSend,
  expectedCode: FailureErrorCode,
  timeoutMs: number,
  assertActive: () => void = () => undefined
): Promise<FailureUiPayload> {
  return await waitForExpectedFailureUi(
    () => readFailureUiPayload(send),
    expectedCode,
    timeoutMs,
    assertActive
  )
}

export function assessFailureScenario(input: {
  contract: FailureScenarioContract
  ui: FailureUiPayload
  fixture: FailureFixtureEvidence
  ledger: LedgerDelta
  requiredPermissionsGranted: boolean
  searchProviderEnabled: boolean
  pluginEnabled: boolean
  intelligencePermissionRevoked: boolean
  quotaDisabled: boolean
  interaction: FailureInteractionEvidence
  processStopped: boolean
  profileRemoved: boolean
  fixtureClosed: boolean
  cleanupRequested: boolean
}): boolean {
  const expectsPermissionRevoke = input.contract.name === 'permission-denied'
  const expectsQuotaDisabled = input.contract.name === 'quota-exhausted'
  const settingsMatches =
    input.contract.settingsAction === 'none' ||
    (input.contract.settingsAction === 'intelligence' && input.ui.intelligenceSettingsVisible) ||
    (input.contract.settingsAction === 'permission' && input.ui.permissionSettingsVisible)
  return (
    input.ui.code === input.contract.errorCode &&
    input.ui.reason.length > 0 &&
    input.ui.recovery.length > 0 &&
    input.ui.noticeVisible &&
    input.ui.busyCleared &&
    input.ui.retryVisible &&
    settingsMatches &&
    failureFixtureMatchesContract(input.contract, input.fixture) &&
    failureLedgerMatchesContract(input.contract, input.ledger) &&
    input.requiredPermissionsGranted &&
    input.searchProviderEnabled &&
    input.pluginEnabled &&
    input.intelligencePermissionRevoked === expectsPermissionRevoke &&
    input.quotaDisabled === expectsQuotaDisabled &&
    isFailureInteractionReady(input.interaction) &&
    input.fixtureClosed &&
    input.processStopped &&
    input.cleanupRequested &&
    input.profileRemoved
  )
}

export function failureFixtureMatchesContract(
  contract: FailureScenarioContract,
  evidence: Partial<FailureFixtureEvidence> | null | undefined
): boolean {
  return (
    evidence?.requests === contract.fixture.requests &&
    evidence.responseHeadersSent === contract.fixture.responseHeadersSent &&
    evidence.partialDeltaSent === contract.fixture.partialDeltaSent &&
    evidence.bodyHeldOpen === contract.fixture.bodyHeldOpen
  )
}

interface FailureScenarioRunOptions {
  options: CliOptions
  executablePath: string
  scenario: FailureScenarioName
  scenarioIndex: number
  isInterrupted: () => boolean
  onProfilePrepared: () => void
  setActiveSupervisor: (supervisor: FailureScenarioSupervisor | null) => void
}

async function runFailureScenario({
  options,
  executablePath,
  scenario,
  scenarioIndex,
  isInterrupted,
  onProfilePrepared,
  setActiveSupervisor
}: FailureScenarioRunOptions): Promise<FailureScenarioEvidence> {
  const contract = FAILURE_SCENARIO_CONTRACTS[scenario]
  const supervisor = new FailureScenarioSupervisor(scenario, options.cleanup)
  setActiveSupervisor(supervisor)
  const failures: FailureScenarioEvidence['failures'] = []
  let stage = `scenario:${scenario}:fixture`
  let port: number | undefined
  let fixtureBoundToLoopback = false
  let fixtureEvidence = emptyFailureFixtureEvidence()
  let ui = emptyFailureUiPayload()
  let ledger = emptyLedgerDelta()
  let requiredPermissionsGranted = false
  let searchProviderEnabled = false
  let pluginEnabled = false
  let intelligencePermissionRevoked = false
  let quotaDisabled = false
  const interaction = emptyFailureInteractionEvidence()

  const assertActive = (): void => {
    if (isInterrupted()) supervisor.interrupt()
    supervisor.assertActive()
  }

  try {
    assertActive()
    const fixture = await startFailureFixture(scenario)
    supervisor.setFixture(fixture)
    supervisor.assertActive()
    fixtureBoundToLoopback = true

    stage = `scenario:${scenario}:profile`
    const profile = await prepareFailureMatrixProfile(scenario, fixture.port, (allocated) => {
      supervisor.setProfile(allocated)
      onProfilePrepared()
      supervisor.assertActive()
    })

    stage = `scenario:${scenario}:cdp-port`
    port = await resolveCdpPort(options.remoteDebuggingPort, scenarioIndex)
    supervisor.setCdpPort(port)
    const remoteDebuggingUrl = `http://127.0.0.1:${port}/json/list`

    stage = `scenario:${scenario}:launch`
    await supervisor.launch(executablePath, port)
    const mainTarget = await pickMainRenderer(
      remoteDebuggingUrl,
      options.launchTimeoutMs,
      assertActive
    )

    stage = `scenario:${scenario}:permissions`
    requiredPermissionsGranted = await grantRequiredPermissions(mainTarget)
    if (!requiredPermissionsGranted) fail('REQUIRED_PERMISSIONS_NOT_GRANTED')

    stage = `scenario:${scenario}:search-provider-consent`
    searchProviderEnabled = await enableFailureSearchProvider(
      <T>(eventName: string, payload?: unknown) => sendMainEvent<T>(mainTarget, eventName, payload)
    )
    if (!searchProviderEnabled) fail('SEARCH_PROVIDER_NOT_ENABLED')

    stage = `scenario:${scenario}:plugin-enable`
    pluginEnabled = await enableFailurePlugin(<T>(eventName: string, payload?: unknown) =>
      sendMainEvent<T>(mainTarget, eventName, payload)
    )
    if (!pluginEnabled) fail('INTELLIGENCE_PLUGIN_NOT_ENABLED')

    stage = `scenario:${scenario}:core-box-show`
    await sendMainEvent<void>(mainTarget, CORE_BOX_SHOW_EVENT)
    const coreBoxTarget = await pickCoreBoxTarget(
      remoteDebuggingUrl,
      options.launchTimeoutMs,
      assertActive
    )

    let ledgerBefore: CallerLedgerSnapshot | undefined
    await withTarget(coreBoxTarget, async (send) => {
      stage = `scenario:${scenario}:widget`
      await prepareFailureWidget(send, interaction, assertActive)
      assertActive()

      stage = `scenario:${scenario}:ledger-baseline`
      ledgerBefore = await waitForLedgerBaseline(
        profile.userDataDir,
        options.scenarioTimeoutMs,
        assertActive
      )

      if (scenario === 'quota-exhausted') {
        stage = `scenario:${scenario}:quota`
        quotaDisabled = await disableCallerQuota(mainTarget)
        if (!quotaDisabled) fail('CALLER_QUOTA_NOT_DISABLED')
      } else if (scenario === 'permission-denied') {
        stage = `scenario:${scenario}:permission-revoke`
        intelligencePermissionRevoked = await revokeIntelligencePermission(mainTarget)
        if (!intelligencePermissionRevoked) fail('INTELLIGENCE_PERMISSION_NOT_REVOKED')
      }

      stage = `scenario:${scenario}:submit`
      await submitFailurePrompt(send, interaction, assertActive)
      stage = `scenario:${scenario}:ui`
      ui = await waitForFailureUi(send, contract.errorCode, options.scenarioTimeoutMs, assertActive)
    })

    if (!ledgerBefore) fail('LEDGER_BASELINE_UNAVAILABLE')
    stage = `scenario:${scenario}:ledger`
    const observedLedger = await waitForExpectedLedger(
      profile.userDataDir,
      ledgerBefore,
      contract,
      options.scenarioTimeoutMs,
      assertActive
    )
    ledger = observedLedger.delta
    fixtureEvidence = supervisor.fixtureEvidence
    if (!failureFixtureMatchesContract(contract, fixtureEvidence)) {
      fail('FIXTURE_EVIDENCE_MISMATCH')
    }
  } catch (error) {
    if (error instanceof FailureUiObservationError && error.lastPayload) {
      ui = error.lastPayload
    }
    failures.push(projectFailureMatrixFailure(error, stage))
  } finally {
    fixtureEvidence = supervisor.fixtureEvidence
    const cleanupFailures = await supervisor.shutdown()
    fixtureEvidence = supervisor.fixtureEvidence
    for (const failure of cleanupFailures) {
      if (!failures.some((item) => item.stage === failure.stage && item.code === failure.code)) {
        failures.push(failure)
      }
    }
    setActiveSupervisor(null)
  }

  const ok =
    failures.length === 0 &&
    assessFailureScenario({
      contract,
      ui,
      fixture: fixtureEvidence,
      ledger,
      requiredPermissionsGranted,
      searchProviderEnabled,
      pluginEnabled,
      intelligencePermissionRevoked,
      quotaDisabled,
      interaction,
      processStopped: supervisor.processStopped,
      profileRemoved: supervisor.profileRemoved,
      fixtureClosed: supervisor.fixtureClosed,
      cleanupRequested: options.cleanup
    })

  return {
    name: scenario,
    ok,
    profile: 'fresh-isolated',
    fixture: {
      ...fixtureEvidence,
      boundToLoopback: fixtureBoundToLoopback,
      closed: supervisor.fixtureClosed
    },
    ui: projectFailureUiEvidence(ui),
    ledger,
    prerequisites: {
      requiredPermissionsGranted,
      searchProviderEnabled,
      pluginEnabled,
      intelligencePermissionRevoked,
      quotaDisabled
    },
    interaction,
    processStopped: supervisor.processStopped,
    profileRemoved: supervisor.profileRemoved,
    failures
  }
}

function createFailureMatrixReport(options: CliOptions): FailureMatrixReport {
  return {
    schema: FAILURE_MATRIX_SCHEMA,
    ok: false,
    checkedAt: new Date().toISOString(),
    app: { version: '', hash: '' },
    runtime: {
      appBundle: path.basename(options.appBundle),
      freshProfiles: 0,
      cleanupRequested: options.cleanup,
      cleanupComplete: false
    },
    scenarios: [],
    failures: []
  }
}

export type FailureMatrixSignal = 'SIGINT' | 'SIGTERM'

export interface FailureMatrixSignalSource {
  on(signal: FailureMatrixSignal, listener: () => void): unknown
  off(signal: FailureMatrixSignal, listener: () => void): unknown
}

export function failureMatrixSignalExitCode(signal: FailureMatrixSignal): number {
  return signal === 'SIGINT' ? 130 : 143
}

export function installFailureMatrixSignalHandlers(
  onSignal: (signal: FailureMatrixSignal) => void,
  source: FailureMatrixSignalSource = process
): () => void {
  const onSigint = (): void => onSignal('SIGINT')
  const onSigterm = (): void => onSignal('SIGTERM')
  source.on('SIGINT', onSigint)
  source.on('SIGTERM', onSigterm)
  return () => {
    source.off('SIGINT', onSigint)
    source.off('SIGTERM', onSigterm)
  }
}

async function runFailureMatrix(options: CliOptions): Promise<FailureMatrixReport> {
  const report = createFailureMatrixReport(options)
  let stage = 'preflight'
  let interrupted = false
  let activeSupervisor: FailureScenarioSupervisor | null = null
  let signalShutdown: Promise<FailureScenarioEvidence['failures']> | null = null
  const removeSignalHandlers = installFailureMatrixSignalHandlers((signal) => {
    interrupted = true
    process.exitCode = failureMatrixSignalExitCode(signal)
    signalShutdown = activeSupervisor?.interrupt() ?? signalShutdown
  })

  try {
    if (process.platform !== 'darwin') fail('MACOS_PACKAGED_APP_REQUIRED')
    const appBundle = await realpath(options.appBundle).catch(() => fail('PACKAGED_APP_NOT_FOUND'))
    if (isProtectedInstalledAppPath(appBundle)) fail('INSTALLED_APP_BUNDLE_REJECTED')

    const executablePath = await realpath(path.join(appBundle, 'Contents', 'MacOS', 'tuff')).catch(
      () => fail('PACKAGED_APP_NOT_EXECUTABLE')
    )
    if (!isPathWithin(executablePath, appBundle)) fail('PACKAGED_APP_EXECUTABLE_REJECTED')
    await access(executablePath, fsConstants.X_OK).catch(() => fail('PACKAGED_APP_NOT_EXECUTABLE'))

    const appAsarPath = await realpath(
      path.join(appBundle, 'Contents', 'Resources', 'app.asar')
    ).catch(() => fail('PACKAGED_APP_HASH_FAILED'))
    if (!isPathWithin(appAsarPath, appBundle)) fail('PACKAGED_APP_HASH_FAILED')
    report.app.version = await readFailureMatrixBundleVersion(appBundle)
    report.app.hash = await hashFailureMatrixArtifact(appAsarPath)

    for (let index = 0; index < FAILURE_SCENARIOS.length; index += 1) {
      if (interrupted) break
      const scenario = FAILURE_SCENARIOS[index]
      stage = `scenario:${scenario}`
      const evidence = await runFailureScenario({
        options,
        executablePath,
        scenario,
        scenarioIndex: index,
        isInterrupted: () => interrupted,
        onProfilePrepared: () => {
          report.runtime.freshProfiles += 1
        },
        setActiveSupervisor: (supervisor) => {
          activeSupervisor = supervisor
        }
      })
      report.scenarios.push(evidence)
      report.failures.push(...evidence.failures)
    }
  } catch (error) {
    report.failures.push(projectFailureMatrixFailure(error, stage))
  } finally {
    if (signalShutdown) await signalShutdown
    if (
      interrupted &&
      !report.failures.some((failure) => failure.code === 'FAILURE_MATRIX_INTERRUPTED')
    ) {
      report.failures.push({ stage: 'signal', code: 'FAILURE_MATRIX_INTERRUPTED' })
    }
    removeSignalHandlers()
  }

  report.runtime.cleanupComplete = report.scenarios.every(
    (scenario) =>
      options.cleanup &&
      scenario.processStopped &&
      scenario.fixture.closed &&
      scenario.profileRemoved
  )
  const scenarioOrderMatches = report.scenarios.every(
    (scenario, index) => scenario.name === FAILURE_SCENARIOS[index]
  )
  report.ok =
    !interrupted &&
    report.scenarios.length === FAILURE_SCENARIOS.length &&
    scenarioOrderMatches &&
    report.scenarios.every((scenario) => scenario.ok) &&
    report.failures.length === 0 &&
    report.runtime.cleanupComplete
  return report
}

async function main(): Promise<void> {
  const options = parseFailureMatrixArgs(process.argv.slice(2))
  if (!options) return
  const report = await runFailureMatrix(options)
  if (!isFailureMatrixReportRedacted(report)) fail('FAILURE_MATRIX_REPORT_REDACTION_FAILED')
  const output = `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`
  if (options.output) {
    await mkdir(path.dirname(options.output), { recursive: true })
    await writeFile(options.output, output, 'utf8')
  }
  process.stdout.write(output)
  if (!report.ok) process.exitCode = Math.max(Number(process.exitCode ?? 0), 1)
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (entryPath && import.meta.url === entryPath) {
  main().catch(() => {
    process.stdout.write(
      `${JSON.stringify({
        schema: FAILURE_MATRIX_SCHEMA,
        ok: false,
        failures: [{ stage: 'main', code: 'FAILURE_MATRIX_FATAL' }]
      })}\n`
    )
    process.exitCode = 1
  })
}
