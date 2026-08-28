#!/usr/bin/env tsx
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants as fsConstants, createReadStream } from 'node:fs'
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import type { AgentToolGatewayState } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { AgentToolEvents } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { readFile as readPlist } from 'simple-plist'
import {
  loadTargets,
  withTarget,
  type CdpSend,
  type DevToolsTarget
} from './coreapp-packaged-ai-ask-probe'

export const TOOL_ACCEPTANCE_SCHEMA = 'tuff.packaged-tool-confirmation-acceptance.v1'
export const TOOL_FIXTURE_SCHEMA = 'tuff.controlled-pi-tool-fixture.v1'
export const TOOL_ID = 'tuff_read_file'
export const TOOL_RISK = 'read'
export const PI_MODEL = 'controlled/tool-ui'
export const CONTROLLED_TURN_PROMPT = 'Run the controlled read check.'

export const PROFILE_MARKER_FILE = '.tuff-tool-confirmation-acceptance.json'
export const PROFILE_MARKER_SCHEMA = 'tuff.packaged-tool-confirmation-profile.v1'
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 10_000
const MAX_CONFIRMATION_TIMEOUT_MS = 120_000
const AGENT_TOOL_STATE_QUERY_TIMEOUT_MS = 1_000
const STARTUP_MODAL_SETTLE_TIMEOUT_MS = 8_000
const AGENT_TOOL_GET_STATE_EVENT = AgentToolEvents.getState.toEventName()
const FIXTURE_CANARY_PATH = '~/Documents/tuff-tool-canary.txt'
const EXPECTED_ASSISTANT_TEXT = 'Controlled check completed.'
const AGENT_TOOL_AUDIT_LOG_PATTERN =
  /\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[INFO\] \[agent-tools\] Agent tool audit (\{.*\})$/
const AGENT_TOOL_AUDIT_SCHEMA = 'agent-tool-audit/v1'
const AGENT_TOOL_AUDIT_CALL_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const AGENT_TOOL_AUDIT_FILE = /^D.*\.log$/
const RUNNER_PROFILE_BASENAME = /^tuff-tool-confirmation-[A-Za-z0-9_-]+$/
const SENSITIVE_ENVIRONMENT_NAME =
  /(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)(?:_|$)|^(?:TUFF|PI|CODEX|CLAUDE|OPENAI|ANTHROPIC|GEMINI|GOOGLE_AI|MISTRAL|GROQ|DEEPSEEK|OPENROUTER|AZURE|AWS)_|^(?:HTTP|HTTPS|ALL|NO)_PROXY$/i

export type ScenarioName = 'deny' | 'allow' | 'remember-replay' | 'reset' | 'timeout' | 'cancel'
type ScenarioStatus = 'passed' | 'failed' | 'blocked'
export type ScenarioDecision =
  | 'denied'
  | 'approved'
  | 'approved-remembered'
  | 'approved-after-reset'
  | 'timeout'
  | 'cancelled'

const FIXTURE_RESULT_CODES = [
  'TOOL_CALL_PENDING',
  'TOOL_OK',
  'TOOL_APPROVAL_DENIED',
  'TOOL_EXECUTION_ABORTED',
  'TOOL_GATEWAY_UNAUTHORIZED',
  'TOOL_GATEWAY_UNAVAILABLE',
  'TOOL_GATEWAY_RESPONSE_INVALID',
  'TOOL_EXECUTION_FAILED'
] as const

export type FixtureResultCode = (typeof FIXTURE_RESULT_CODES)[number]

export type TimeoutElapsedBucket = 'before-timeout' | 'timeout-window' | 'late'

const AGENT_TOOL_AUDIT_RESULT_CODES = [
  'TOOL_OK',
  'TOOL_NOT_FOUND',
  'TOOL_INPUT_INVALID',
  'TOOL_APPROVAL_DENIED',
  'TOOL_EXECUTION_ABORTED',
  'TOOL_EXECUTION_TIMEOUT',
  'TOOL_RESOURCE_NOT_FOUND',
  'TOOL_RESOURCE_ALREADY_EXISTS',
  'TOOL_RESOURCE_ACCESS_DENIED',
  'TOOL_SERVICE_UNAVAILABLE',
  'MCP_SERVER_UNAVAILABLE',
  'MCP_TOOL_FAILED',
  'TOOL_EXECUTION_FAILED'
] as const

export type AgentToolAuditDecision =
  | 'approved'
  | 'denied'
  | 'remembered'
  | 'failed'
  | 'not-required'
export type AgentToolAuditResultCode = (typeof AGENT_TOOL_AUDIT_RESULT_CODES)[number]
export type AgentToolAuditEvent =
  | {
      schema: typeof AGENT_TOOL_AUDIT_SCHEMA
      phase: 'call'
      callId: string
      toolId: string
      risk: 'read' | 'write' | 'execute' | 'unknown'
    }
  | {
      schema: typeof AGENT_TOOL_AUDIT_SCHEMA
      phase: 'decision'
      callId: string
      toolId: string
      risk: 'read' | 'write' | 'execute' | 'unknown'
      decision: AgentToolAuditDecision
    }
  | {
      schema: typeof AGENT_TOOL_AUDIT_SCHEMA
      phase: 'result'
      callId: string
      toolId: string
      risk: 'read' | 'write' | 'execute' | 'unknown'
      status: 'success' | 'error'
      durationMs: number
      code: AgentToolAuditResultCode
    }

export interface AgentToolAuditExpectation {
  decision: AgentToolAuditDecision
  code: AgentToolAuditResultCode
}

export interface AgentToolAuditEvidence {
  ok: boolean
  eventCount: number
  decision?: AgentToolAuditDecision
  status?: 'success' | 'error'
  code?: AgentToolAuditResultCode
  failureCode?: string
}

interface AgentToolAuditObservation {
  evidence: AgentToolAuditEvidence
  durationMs?: number
}

export interface AgentToolAuditLogCursor {
  offsets: Readonly<Record<string, number>>
}

export interface AssistantMessageSnapshot {
  id: string
  status: 'complete' | 'streaming' | 'failed' | 'unknown'
  ariaBusy: 'true' | 'false' | null
  hasError: boolean
  hasActions: boolean
  containsExpectedText: boolean
}

export interface AssistantMessageAssessment {
  ok: boolean
  failureCode?: string
}

interface CliOptions {
  appBundle: string
  userDataDir?: string
  remoteDebuggingPort: number
  launchTimeoutMs: number
  confirmationTimeoutMs: number
  outputDir: string
  cleanup: boolean
  pretty: boolean
}

interface AcceptanceFailure {
  stage: string
  code: string
}

export interface ControlledFixtureStatus {
  schema: typeof TOOL_FIXTURE_SCHEMA
  phase: 'started' | 'completed' | 'cancelled' | 'failed'
  toolId: typeof TOOL_ID
  risk: typeof TOOL_RISK
  code: FixtureResultCode
}

export interface ToolScenarioEvidence {
  name: ScenarioName
  status: ScenarioStatus
  toolId: typeof TOOL_ID
  risk: typeof TOOL_RISK
  confirmationCount: number
  cardVisible: boolean
  cardCleared: boolean
  decision: ScenarioDecision
  resultCode: FixtureResultCode
  requestEnded: boolean
  documentHidden?: false | true
  screenshot?: string
  rememberReplaySkipped?: boolean
  replayConfirmationCount?: number
  timeoutElapsedBucket?: TimeoutElapsedBucket
  audit?: AgentToolAuditEvidence
  replayAudit?: AgentToolAuditEvidence
  assistantFailureCode?: string
  cancelAuditElapsedMs?: number
  cancelAuditMaxElapsedMs?: number
  failureCode?: string
}

interface AcceptanceReport {
  schema: typeof TOOL_ACCEPTANCE_SCHEMA
  ok: boolean
  checkedAt: string
  scope: 'isolated-controlled'
  app: {
    version: string
    hash: string
  }
  runtime: {
    launches: number
    processTerminated: boolean
    profileRemoved: boolean
    confirmationTimeoutMode: 'production-default' | 'controlled-override'
  }
  scenarios: ToolScenarioEvidence[]
  failures: AcceptanceFailure[]
}

export interface ToolAcceptanceLaunchPaths {
  userDataDir: string
  homeDir: string
  codexHome: string
  tempDir: string
  fileProviderRoot: string
  piAgentDir: string
  fixturePath: string
  fixtureStatusDir: string
}

export interface PreparedToolAcceptanceProfile extends ToolAcceptanceLaunchPaths {
  runnerCreated: boolean
}

export interface CardSnapshot {
  confirmationCount: number
  visible: boolean
  unobscured: boolean
  toolId: string
  risk: string
  summary: string
  input: string
  documentHidden: boolean
}

interface ClickPoint {
  x: number
  y: number
}

type StartupModalOutcome =
  | { kind: 'ready' }
  | { kind: 'unexpected' }
  | { kind: 'blocked' }
  | ({ kind: 'click' } & ClickPoint)

interface TurnHandle {
  statusFile: string
  card: CardSnapshot
  assistantMessageIds: Set<string>
  auditCursor: AgentToolAuditLogCursor
}

export interface ScenarioAssessmentInput {
  name: ScenarioName
  confirmationCount: number
  cardVisible: boolean
  cardCleared: boolean
  decision: ScenarioDecision
  resultCode: FixtureResultCode
  requestEnded: boolean
  documentHidden: boolean
  screenshot?: string
  rememberReplaySkipped?: boolean
  replayConfirmationCount?: number
  timeoutElapsedBucket?: TimeoutElapsedBucket
  audit?: AgentToolAuditEvidence
  replayAudit?: AgentToolAuditEvidence
  assistantFailureCode?: string
  cancelAuditElapsedMs?: number
  confirmationTimeoutMs?: number
}

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
  corepack pnpm -C "apps/core-app" exec tsx "scripts/coreapp-packaged-tool-confirmation-acceptance.ts" -- [options]

Options:
  --appBundle <path>             Packaged macOS .app. Default: dist/mac-arm64/tuff.app.
  --userDataDir <path>          Dedicated profile. A non-empty directory needs the runner marker.
  --remoteDebuggingPort <n>     CDP port. Default: choose an unused loopback port.
  --launchTimeoutMs <n>         Renderer startup timeout. Default: 60000.
  --confirmationTimeoutMs <n>   Controlled confirmation timeout. Default: 10000; max: 120000.
  --outputDir <path>            Redacted report and card-only screenshots.
  --keepProfile                 Keep the marker-owned profile after the owned child exits.
  --compact                     Print single-line JSON.
  --help                        Show this help.

The runner always launches its own packaged process and never attaches to an existing app.
It records timeout/cancel as failures when the confirmation card or request remains pending.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    appBundle: path.resolve(process.cwd(), 'dist/mac-arm64/tuff.app'),
    remoteDebuggingPort: 0,
    launchTimeoutMs: 60_000,
    confirmationTimeoutMs: DEFAULT_CONFIRMATION_TIMEOUT_MS,
    outputDir: path.resolve(
      process.cwd(),
      '../../output/playwright/ai-permission-sandbox-acceptance/tool-confirmation'
    ),
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
      options.remoteDebuggingPort = parsePositiveInteger(argv[++index], arg, 0, 65_535)
      continue
    }
    if (arg === '--launchTimeoutMs' && argv[index + 1]) {
      options.launchTimeoutMs = parsePositiveInteger(argv[++index], arg, 1, 300_000)
      continue
    }
    if (arg === '--confirmationTimeoutMs' && argv[index + 1]) {
      options.confirmationTimeoutMs = parsePositiveInteger(
        argv[++index],
        arg,
        250,
        MAX_CONFIRMATION_TIMEOUT_MS
      )
      continue
    }
    if (arg === '--outputDir' && argv[index + 1]) {
      options.outputDir = path.resolve(process.cwd(), argv[++index])
      continue
    }
    if (arg === '--keepProfile') {
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

function parsePositiveInteger(value: string, flag: string, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid ${flag}`)
  }
  return parsed
}

export function projectAcceptanceFailure(error: unknown, stage: string): AcceptanceFailure {
  return {
    stage,
    code: error instanceof AcceptanceError ? error.code : 'ACCEPTANCE_STEP_FAILED'
  }
}

export function bucketTimeoutElapsed(
  elapsedMs: number,
  configuredTimeoutMs: number
): TimeoutElapsedBucket {
  if (elapsedMs < configuredTimeoutMs * 0.9) return 'before-timeout'
  if (elapsedMs <= configuredTimeoutMs + 1_500) return 'timeout-window'
  return 'late'
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  )
}

export function isAgentToolGatewayState(value: unknown): value is AgentToolGatewayState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const state = value as Record<string, unknown>
  return (
    hasExactKeys(state, ['enabled', 'mode', 'ready', 'tools']) &&
    typeof state.enabled === 'boolean' &&
    (state.mode === 'review' || state.mode === 'full') &&
    typeof state.ready === 'boolean' &&
    Array.isArray(state.tools) &&
    state.tools.every((tool) => typeof tool === 'string')
  )
}

function isAgentToolAuditResultCode(value: unknown): value is AgentToolAuditResultCode {
  return typeof value === 'string' && AGENT_TOOL_AUDIT_RESULT_CODES.some((code) => code === value)
}

export function decodeAgentToolAuditLogLine(line: string): AgentToolAuditEvent | undefined {
  if (line.includes('\n') || line.includes('\r')) return undefined
  const match = AGENT_TOOL_AUDIT_LOG_PATTERN.exec(line)
  const jsonText = match?.[1]
  if (!jsonText) return undefined

  let value: unknown
  try {
    value = JSON.parse(jsonText)
  } catch {
    return undefined
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (
    record.schema !== AGENT_TOOL_AUDIT_SCHEMA ||
    typeof record.callId !== 'string' ||
    !AGENT_TOOL_AUDIT_CALL_ID.test(record.callId) ||
    record.toolId !== TOOL_ID ||
    record.risk !== TOOL_RISK
  ) {
    return undefined
  }

  const base = {
    schema: AGENT_TOOL_AUDIT_SCHEMA,
    callId: record.callId,
    toolId: record.toolId,
    risk: record.risk
  } as const
  if (record.phase === 'call') {
    if (!hasExactKeys(record, ['schema', 'phase', 'callId', 'toolId', 'risk'])) return undefined
    return { ...base, phase: 'call' }
  }
  if (record.phase === 'decision') {
    if (
      !hasExactKeys(record, ['schema', 'phase', 'callId', 'toolId', 'risk', 'decision']) ||
      (record.decision !== 'approved' &&
        record.decision !== 'denied' &&
        record.decision !== 'remembered' &&
        record.decision !== 'failed' &&
        record.decision !== 'not-required')
    ) {
      return undefined
    }
    return { ...base, phase: 'decision', decision: record.decision }
  }
  if (record.phase !== 'result') return undefined
  if (
    !hasExactKeys(record, [
      'schema',
      'phase',
      'callId',
      'toolId',
      'risk',
      'status',
      'durationMs',
      'code'
    ]) ||
    (record.status !== 'success' && record.status !== 'error') ||
    !Number.isInteger(record.durationMs) ||
    (record.durationMs as number) < 0 ||
    (record.durationMs as number) > 24 * 60 * 60 * 1_000 ||
    !isAgentToolAuditResultCode(record.code) ||
    (record.status === 'success') !== (record.code === 'TOOL_OK')
  ) {
    return undefined
  }
  return {
    ...base,
    phase: 'result',
    status: record.status,
    durationMs: record.durationMs as number,
    code: record.code
  }
}

export function assessAgentToolAuditSequence(
  events: readonly AgentToolAuditEvent[],
  expectation: AgentToolAuditExpectation
): AgentToolAuditEvidence {
  const decision = events.find(
    (event): event is Extract<AgentToolAuditEvent, { phase: 'decision' }> =>
      event.phase === 'decision'
  )
  const result = events.find(
    (event): event is Extract<AgentToolAuditEvent, { phase: 'result' }> => event.phase === 'result'
  )
  const evidence: AgentToolAuditEvidence = {
    ok: false,
    eventCount: events.length,
    ...(decision ? { decision: decision.decision } : {}),
    ...(result ? { status: result.status, code: result.code } : {})
  }
  const reject = (failureCode: string): AgentToolAuditEvidence => ({
    ...evidence,
    failureCode
  })

  if (events.length !== 3) return reject('AGENT_TOOL_AUDIT_EVENT_COUNT_MISMATCH')
  if (new Set(events.map((event) => event.callId)).size !== 1) {
    return reject('AGENT_TOOL_AUDIT_CORRELATION_MISMATCH')
  }
  const [callEvent, decisionEvent, resultEvent] = events
  if (
    callEvent?.phase !== 'call' ||
    decisionEvent?.phase !== 'decision' ||
    resultEvent?.phase !== 'result'
  ) {
    return reject('AGENT_TOOL_AUDIT_PHASE_MISMATCH')
  }
  if (events.some((event) => event.toolId !== TOOL_ID || event.risk !== TOOL_RISK)) {
    return reject('AGENT_TOOL_AUDIT_TOOL_MISMATCH')
  }
  if (decisionEvent.decision !== expectation.decision) {
    return reject('AGENT_TOOL_AUDIT_DECISION_MISMATCH')
  }
  const expectedStatus = expectation.code === 'TOOL_OK' ? 'success' : 'error'
  if (resultEvent.status !== expectedStatus || resultEvent.code !== expectation.code) {
    return reject('AGENT_TOOL_AUDIT_RESULT_MISMATCH')
  }
  return { ...evidence, ok: true }
}

export function assessAssistantMessage(
  snapshot: AssistantMessageSnapshot | undefined,
  newMessageCount = snapshot ? 1 : 0
): AssistantMessageAssessment {
  if (!snapshot?.id) return { ok: false, failureCode: 'ASSISTANT_MESSAGE_MISSING' }
  if (newMessageCount !== 1) {
    return { ok: false, failureCode: 'ASSISTANT_MESSAGE_COUNT_MISMATCH' }
  }
  if (snapshot.status === 'failed' || snapshot.hasError) {
    return { ok: false, failureCode: 'ASSISTANT_MESSAGE_FAILED' }
  }
  if (snapshot.status === 'streaming' || snapshot.ariaBusy === 'true') {
    return { ok: false, failureCode: 'ASSISTANT_MESSAGE_STILL_BUSY' }
  }
  if (snapshot.status !== 'complete') {
    return { ok: false, failureCode: 'ASSISTANT_MESSAGE_NOT_COMPLETE' }
  }
  if (snapshot.ariaBusy !== 'false') {
    return { ok: false, failureCode: 'ASSISTANT_MESSAGE_ARIA_BUSY_INVALID' }
  }
  if (!snapshot.hasActions) {
    return { ok: false, failureCode: 'ASSISTANT_MESSAGE_ACTIONS_MISSING' }
  }
  if (!snapshot.containsExpectedText) {
    return { ok: false, failureCode: 'ASSISTANT_MESSAGE_TEXT_MISMATCH' }
  }
  return { ok: true }
}

export function assessCancelledAssistantMessages(
  snapshots: readonly AssistantMessageSnapshot[]
): AssistantMessageAssessment {
  if (snapshots.length === 0) return { ok: true }
  if (snapshots.length !== 1) {
    return { ok: false, failureCode: 'CANCEL_ASSISTANT_MESSAGE_COUNT_MISMATCH' }
  }
  const snapshot = snapshots[0]!
  if (snapshot.status === 'failed' || snapshot.hasError) {
    return { ok: false, failureCode: 'CANCEL_ASSISTANT_MESSAGE_FAILED' }
  }
  if (snapshot.status === 'streaming' || snapshot.ariaBusy === 'true') {
    return { ok: false, failureCode: 'CANCEL_ASSISTANT_MESSAGE_STILL_BUSY' }
  }
  if (snapshot.status !== 'complete' || snapshot.ariaBusy !== 'false' || !snapshot.hasActions) {
    return { ok: false, failureCode: 'CANCEL_ASSISTANT_MESSAGE_NOT_SETTLED' }
  }
  return { ok: true }
}

export function cancelAuditMaxElapsedMs(confirmationTimeoutMs: number): number {
  return Math.max(1, Math.floor(Math.min(1_500, confirmationTimeoutMs * 0.5)))
}

export function isCancelAuditTimely(elapsedMs: number, confirmationTimeoutMs: number): boolean {
  return elapsedMs >= 0 && elapsedMs <= cancelAuditMaxElapsedMs(confirmationTimeoutMs)
}

function scenarioFailureCode(input: ScenarioAssessmentInput): string | undefined {
  if (input.documentHidden) return 'RENDERER_HIDDEN'
  if (!input.cardVisible) return 'CONFIRMATION_CARD_NOT_VISIBLE'
  if (input.confirmationCount !== 1) return 'CONFIRMATION_CARD_COUNT_MISMATCH'
  if (!input.cardCleared) return 'CONFIRMATION_CARD_NOT_CLEARED'
  if (!input.audit) return 'AGENT_TOOL_AUDIT_MISSING'
  if (!input.audit.ok) return input.audit.failureCode ?? 'AGENT_TOOL_AUDIT_MISMATCH'
  if (input.name === 'remember-replay') {
    if (!input.replayAudit) return 'AGENT_TOOL_REPLAY_AUDIT_MISSING'
    if (!input.replayAudit.ok) {
      return input.replayAudit.failureCode ?? 'AGENT_TOOL_REPLAY_AUDIT_MISMATCH'
    }
  }
  if (input.assistantFailureCode) return input.assistantFailureCode
  if (!input.requestEnded) return 'TOOL_REQUEST_NOT_ENDED'

  if (input.name === 'deny') {
    if (input.decision !== 'denied' || input.resultCode !== 'TOOL_APPROVAL_DENIED') {
      return 'DENY_RESULT_MISMATCH'
    }
  } else if (input.name === 'allow') {
    if (input.decision !== 'approved' || input.resultCode !== 'TOOL_OK') {
      return 'ALLOW_RESULT_MISMATCH'
    }
  } else if (input.name === 'remember-replay') {
    if (
      input.decision !== 'approved-remembered' ||
      input.resultCode !== 'TOOL_OK' ||
      input.rememberReplaySkipped !== true ||
      input.replayConfirmationCount !== 0
    ) {
      return 'REMEMBER_REPLAY_MISMATCH'
    }
  } else if (input.name === 'reset') {
    if (input.decision !== 'approved-after-reset' || input.resultCode !== 'TOOL_OK') {
      return 'RESET_RESULT_MISMATCH'
    }
  } else if (input.name === 'timeout') {
    if (
      input.decision !== 'timeout' ||
      input.resultCode !== 'TOOL_APPROVAL_DENIED' ||
      input.timeoutElapsedBucket !== 'timeout-window'
    ) {
      return 'TIMEOUT_RESULT_MISMATCH'
    }
  } else {
    if (input.decision !== 'cancelled' || input.resultCode !== 'TOOL_EXECUTION_ABORTED') {
      return 'CANCEL_RESULT_MISMATCH'
    }
    if (
      input.cancelAuditElapsedMs === undefined ||
      input.confirmationTimeoutMs === undefined ||
      !isCancelAuditTimely(input.cancelAuditElapsedMs, input.confirmationTimeoutMs)
    ) {
      return 'CANCEL_AUDIT_LATE'
    }
  }

  return undefined
}

export function assessScenario(input: ScenarioAssessmentInput): ToolScenarioEvidence {
  const failureCode = scenarioFailureCode(input)
  return {
    name: input.name,
    status: failureCode ? 'failed' : 'passed',
    toolId: TOOL_ID,
    risk: TOOL_RISK,
    confirmationCount: input.confirmationCount,
    cardVisible: input.cardVisible,
    cardCleared: input.cardCleared,
    decision: input.decision,
    resultCode: input.resultCode,
    requestEnded: input.requestEnded,
    documentHidden: input.documentHidden,
    ...(input.screenshot ? { screenshot: path.basename(input.screenshot) } : {}),
    ...(input.rememberReplaySkipped !== undefined
      ? { rememberReplaySkipped: input.rememberReplaySkipped }
      : {}),
    ...(input.replayConfirmationCount !== undefined
      ? { replayConfirmationCount: input.replayConfirmationCount }
      : {}),
    ...(input.timeoutElapsedBucket ? { timeoutElapsedBucket: input.timeoutElapsedBucket } : {}),
    ...(input.audit ? { audit: input.audit } : {}),
    ...(input.replayAudit ? { replayAudit: input.replayAudit } : {}),
    ...(input.assistantFailureCode ? { assistantFailureCode: input.assistantFailureCode } : {}),
    ...(input.cancelAuditElapsedMs !== undefined
      ? {
          cancelAuditElapsedMs: input.cancelAuditElapsedMs,
          cancelAuditMaxElapsedMs: cancelAuditMaxElapsedMs(input.confirmationTimeoutMs ?? 0)
        }
      : {}),
    ...(failureCode ? { failureCode } : {})
  }
}

export function buildControlledPiFixtureSource(): string {
  return `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SCHEMA = ${JSON.stringify(TOOL_FIXTURE_SCHEMA)}
const TOOL_ID = ${JSON.stringify(TOOL_ID)}
const TOOL_RISK = ${JSON.stringify(TOOL_RISK)}
const CANARY_PATH = ${JSON.stringify(FIXTURE_CANARY_PATH)}
const CONTROLLED_TURN_PROMPT = ${JSON.stringify(CONTROLLED_TURN_PROMPT)}
const EXPECTED_ASSISTANT_TEXT = ${JSON.stringify(EXPECTED_ASSISTANT_TEXT)}
const TITLE_TEXT = 'Controlled title'
const SAFE_CODES = new Set(${JSON.stringify(
    FIXTURE_RESULT_CODES.filter((code) => code !== 'TOOL_CALL_PENDING' && code !== 'TOOL_OK')
  )})

const statusDir = process.env.TUFF_TOOL_ACCEPTANCE_STATUS_DIR
const gatewayUrl = process.env.TUFF_TOOL_GATEWAY_URL
const gatewayToken = process.env.TUFF_TOOL_GATEWAY_TOKEN
if (!statusDir || !gatewayUrl || !gatewayToken) process.exit(2)

const prompt = process.argv.at(-1) || ''
const controlledTurn =
  prompt === CONTROLLED_TURN_PROMPT ||
  prompt.endsWith('\\n\\n---\\n\\nUser: ' + CONTROLLED_TURN_PROMPT)

mkdirSync(statusDir, { recursive: true })
const statusPath = path.join(statusDir, 'invocation-' + process.pid + '.json')
let terminal = false

function writeStatus(phase, code) {
  writeFileSync(statusPath, JSON.stringify({
    schema: SCHEMA,
    phase,
    toolId: TOOL_ID,
    risk: TOOL_RISK,
    code
  }))
}

function emit(value) {
  process.stdout.write(JSON.stringify(value) + '\\n')
}

function finishOnSignal() {
  if (terminal) return
  terminal = true
  if (controlledTurn) writeStatus('cancelled', 'TOOL_EXECUTION_ABORTED')
  process.exit(0)
}

process.once('SIGTERM', finishOnSignal)
process.once('SIGINT', finishOnSignal)

function emitAssistantCompletion(text) {
  emit({
    type: 'message_update',
    assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: text }
  })
  emit({
    type: 'message_end',
    message: {
      role: 'assistant',
      provider: 'controlled-fixture',
      model: 'tool-ui',
      stopReason: 'stop',
      usage: { input: 1, output: 1, totalTokens: 2, cost: { total: 0 } }
    }
  })
  emit({ type: 'agent_settled' })
}

async function main() {
  emit({ type: 'session', version: 3, id: 'controlled-tool-fixture' })
  emit({
    type: 'message_start',
    message: {
      role: 'assistant',
      provider: 'controlled-fixture',
      model: 'tool-ui',
      stopReason: 'pending'
    }
  })
  if (!controlledTurn) {
    terminal = true
    emitAssistantCompletion(TITLE_TEXT)
    return
  }

  writeStatus('started', 'TOOL_CALL_PENDING')
  const callId = 'controlled-' + process.pid
  emit({
    type: 'message_update',
    assistantMessageEvent: {
      type: 'toolcall_end',
      contentIndex: 0,
      toolCall: {
        type: 'toolCall',
        id: callId,
        name: TOOL_ID,
        arguments: { path: CANARY_PATH }
      }
    }
  })

  let code = 'TOOL_GATEWAY_UNAVAILABLE'
  let isError = true
  try {
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + gatewayToken
      },
      body: JSON.stringify({
        tool: TOOL_ID,
        callId,
        args: { path: CANARY_PATH }
      }),
      signal: AbortSignal.timeout(180000)
    })
    if (response.status === 401) {
      code = 'TOOL_GATEWAY_UNAUTHORIZED'
    } else if (!response.ok) {
      code = 'TOOL_GATEWAY_UNAVAILABLE'
    } else {
      let result
      try {
        result = await response.json()
      } catch {
        result = null
      }
      if (result && result.isError === false && typeof result.output === 'string') {
        code = 'TOOL_OK'
        isError = false
      } else if (result && result.isError === true && SAFE_CODES.has(result.code)) {
        code = result.code
      } else {
        code = 'TOOL_GATEWAY_RESPONSE_INVALID'
      }
    }
  } catch {
    code = 'TOOL_GATEWAY_UNAVAILABLE'
  }

  if (terminal) return
  terminal = true
  writeStatus('completed', code)
  emit({
    type: 'message_end',
    message: {
      role: 'toolResult',
      toolCallId: callId,
      toolName: TOOL_ID,
      content: [{ type: 'text', text: code }],
      isError
    }
  })
  emitAssistantCompletion(EXPECTED_ASSISTANT_TEXT)
}

main().catch(() => {
  if (!terminal) writeStatus('failed', 'TOOL_EXECUTION_FAILED')
  process.exitCode = 1
})
`
}

export function buildToolAcceptanceLaunchEnv(
  baseEnv: NodeJS.ProcessEnv,
  paths: ToolAcceptanceLaunchPaths,
  confirmationTimeoutMs: number
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv }
  for (const key of Object.keys(env)) {
    const normalizedKey = key.toUpperCase()
    if (
      SENSITIVE_ENVIRONMENT_NAME.test(key) ||
      normalizedKey === 'HOME' ||
      normalizedKey === 'TMPDIR' ||
      normalizedKey === 'INIT_CWD' ||
      normalizedKey.startsWith('ELECTRON_') ||
      normalizedKey.startsWith('NODE_') ||
      normalizedKey.startsWith('TSX_') ||
      normalizedKey.startsWith('NPM_') ||
      normalizedKey.startsWith('PNPM_') ||
      normalizedKey.startsWith('XDG_') ||
      normalizedKey.startsWith('DYLD_')
    ) {
      delete env[key]
    }
  }
  if (env.PATH) {
    env.PATH = env.PATH.split(path.delimiter)
      .filter((entry) => entry && path.isAbsolute(entry) && !entry.includes('node_modules/.bin'))
      .join(path.delimiter)
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
    TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: paths.userDataDir,
    TUFF_PACKAGED_ACCEPTANCE_ISOLATED: '1',
    TUFF_FILE_PROVIDER_BASE_WATCH_PATHS: paths.fileProviderRoot,
    TUFF_PI_CLI_PATH: paths.fixturePath,
    PI_CODING_AGENT_DIR: paths.piAgentDir,
    TUFF_TOOL_ACCEPTANCE_STATUS_DIR: paths.fixtureStatusDir,
    ...(confirmationTimeoutMs < MAX_CONFIRMATION_TIMEOUT_MS
      ? { TUFF_AGENT_TOOL_CONFIRM_TIMEOUT_MS: String(confirmationTimeoutMs) }
      : {}),
    TUFF_DISABLE_NATIVE_OCR: '1'
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function agentToolAuditLogsDir(userDataDir: string): string {
  return path.join(userDataDir, 'tuff', 'logs')
}

async function listAgentToolAuditLogFiles(userDataDir: string): Promise<string[]> {
  const logsDir = agentToolAuditLogsDir(userDataDir)
  const files = await readdir(logsDir).catch(() => [])
  const regularFiles = await Promise.all(
    files
      .filter((file) => AGENT_TOOL_AUDIT_FILE.test(file))
      .map(async (file) => ({
        file,
        regular: await lstat(path.join(logsDir, file))
          .then((info) => info.isFile())
          .catch(() => false)
      }))
  )
  return regularFiles
    .filter((entry) => entry.regular)
    .map((entry) => entry.file)
    .sort()
}

export async function captureAgentToolAuditLogCursor(
  userDataDir: string
): Promise<AgentToolAuditLogCursor> {
  const logsDir = agentToolAuditLogsDir(userDataDir)
  const offsets: Record<string, number> = {}
  for (const file of await listAgentToolAuditLogFiles(userDataDir)) {
    const contents = await readFile(path.join(logsDir, file)).catch(() => undefined)
    if (!contents) continue
    offsets[file] = contents.lastIndexOf(0x0a) + 1
  }
  return { offsets }
}

export async function readAgentToolAuditsSince(
  userDataDir: string,
  cursor: AgentToolAuditLogCursor
): Promise<AgentToolAuditEvent[]> {
  const logsDir = agentToolAuditLogsDir(userDataDir)
  const events: AgentToolAuditEvent[] = []
  for (const file of await listAgentToolAuditLogFiles(userDataDir)) {
    const contents = await readFile(path.join(logsDir, file)).catch(() => undefined)
    if (!contents) continue
    const previousOffset = cursor.offsets[file] ?? 0
    const offset = previousOffset <= contents.length ? previousOffset : 0
    const appendedText = contents.subarray(offset).toString('utf8')
    const lines = appendedText.split(/\r?\n/)
    if (!appendedText.endsWith('\n')) lines.pop()
    for (const line of lines) {
      const event = decodeAgentToolAuditLogLine(line)
      if (event) events.push(event)
      else if (line.includes('[INFO] [agent-tools] Agent tool audit ')) {
        fail('AGENT_TOOL_AUDIT_INVALID')
      }
    }
  }
  return events
}

async function waitForAgentToolAudit(
  userDataDir: string,
  cursor: AgentToolAuditLogCursor,
  expectation: AgentToolAuditExpectation,
  timeoutMs: number
): Promise<AgentToolAuditObservation> {
  const events = await waitForValue(
    () => readAgentToolAuditsSince(userDataDir, cursor),
    (observed) =>
      observed.some((event) => event.phase === 'result') ||
      observed.filter((event) => event.phase === 'call').length > 1 ||
      observed.length > 3,
    timeoutMs,
    'AGENT_TOOL_AUDIT_TIMEOUT',
    50
  )
  const result = events.find(
    (event): event is Extract<AgentToolAuditEvent, { phase: 'result' }> => event.phase === 'result'
  )
  return {
    evidence: assessAgentToolAuditSequence(events, expectation),
    ...(result ? { durationMs: result.durationMs } : {})
  }
}

function crossCheckFixtureAudit(
  audit: AgentToolAuditEvidence,
  terminal: ControlledFixtureStatus,
  expectedPhase: ControlledFixtureStatus['phase']
): AgentToolAuditEvidence {
  if (!audit.ok) return audit
  if (terminal.phase !== expectedPhase) {
    return { ...audit, ok: false, failureCode: 'FIXTURE_TERMINAL_PHASE_MISMATCH' }
  }
  if (audit.code === terminal.code) return audit
  return { ...audit, ok: false, failureCode: 'FIXTURE_AUDIT_RESULT_MISMATCH' }
}

async function prepareProfile(requestedPath?: string): Promise<PreparedToolAcceptanceProfile> {
  const runnerCreated = requestedPath === undefined
  const userDataDir =
    requestedPath ?? (await mkdtemp(path.join(tmpdir(), 'tuff-tool-confirmation-')))
  await mkdir(userDataDir, { recursive: true })
  const entries = await readdir(userDataDir)
  const markerPath = path.join(userDataDir, PROFILE_MARKER_FILE)

  if (entries.length > 0) {
    if (!(await readProfileMarker(markerPath))) fail('PROFILE_NOT_RUNNER_OWNED')
  } else {
    await writeFile(markerPath, JSON.stringify({ schema: PROFILE_MARKER_SCHEMA }), 'utf8')
  }

  const configDir = path.join(userDataDir, 'tuff', 'modules', 'config')
  const homeDir = path.join(userDataDir, 'home')
  const codexHome = path.join(userDataDir, 'controlled', 'codex-home')
  const tempDir = path.join(userDataDir, 'controlled', 'tmp')
  const fileProviderRoot = path.join(homeDir, 'Documents')
  const piAgentDir = path.join(userDataDir, 'controlled', 'pi-agent')
  const fixtureStatusDir = path.join(userDataDir, 'controlled', 'fixture-status')
  const fixturePath = path.join(userDataDir, 'controlled', 'pi-tool-fixture.mjs')
  await mkdir(configDir, { recursive: true })
  await mkdir(fileProviderRoot, { recursive: true })
  await mkdir(codexHome, { recursive: true })
  await mkdir(tempDir, { recursive: true })
  await mkdir(piAgentDir, { recursive: true })
  await mkdir(fixtureStatusDir, { recursive: true })
  await writeFile(
    path.join(configDir, 'app-setting.ini'),
    JSON.stringify({
      beginner: { init: true },
      dev: { developerMode: true },
      tools: { autoContext: false, agentTools: false, agentToolsMode: 'off' }
    }),
    'utf8'
  )
  await writeFile(
    path.join(piAgentDir, 'models-store.json'),
    JSON.stringify({ controlled: { models: [{ id: 'tool-ui' }] } }),
    'utf8'
  )
  await writeFile(path.join(fileProviderRoot, 'tuff-tool-canary.txt'), 'controlled fixture\n', {
    encoding: 'utf8',
    mode: 0o600
  })
  await writeFile(fixturePath, buildControlledPiFixtureSource(), {
    encoding: 'utf8',
    mode: 0o700
  })
  await chmod(fixturePath, 0o700)

  return {
    userDataDir,
    homeDir,
    codexHome,
    tempDir,
    fileProviderRoot,
    piAgentDir,
    fixturePath,
    fixtureStatusDir,
    runnerCreated
  }
}

async function readProfileMarker(markerPath: string): Promise<boolean> {
  try {
    const marker = JSON.parse(await readFile(markerPath, 'utf8')) as Record<string, unknown>
    return marker.schema === PROFILE_MARKER_SCHEMA && hasExactKeys(marker, ['schema'])
  } catch {
    return false
  }
}

export async function cleanupPreparedToolAcceptanceProfile(
  profile: Pick<PreparedToolAcceptanceProfile, 'userDataDir' | 'runnerCreated'>
): Promise<boolean> {
  if (!profile.runnerCreated) return false
  const resolved = await realpath(profile.userDataDir)
  const resolvedTempDir = await realpath(tmpdir())
  if (
    resolved === path.parse(resolved).root ||
    path.dirname(resolved) !== resolvedTempDir ||
    !RUNNER_PROFILE_BASENAME.test(path.basename(resolved))
  ) {
    fail('PROFILE_CLEANUP_TARGET_REJECTED')
  }
  const info = await stat(resolved)
  if (!info.isDirectory() || !(await readProfileMarker(path.join(resolved, PROFILE_MARKER_FILE)))) {
    fail('PROFILE_CLEANUP_OWNERSHIP_REJECTED')
  }
  await rm(resolved, { recursive: true, force: false })
  return true
}

async function hashFile(filePath: string): Promise<string> {
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
  for (let port = 9781; port <= 9880; port += 1) {
    if (await isPortAvailable(port)) return port
  }
  fail('CDP_PORT_UNAVAILABLE')
}

function launchPackagedApp(
  executablePath: string,
  port: number,
  paths: ToolAcceptanceLaunchPaths,
  confirmationTimeoutMs: number
): ChildProcess {
  const child = spawn(executablePath, [`--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: buildToolAcceptanceLaunchEnv(process.env, paths, confirmationTimeoutMs),
    stdio: 'ignore',
    detached: process.platform !== 'win32'
  })
  child.on('error', () => undefined)
  return child
}

function isOwnedProcessTreeAlive(child: ChildProcess): boolean {
  if (process.platform === 'win32') {
    return child.exitCode === null && child.signalCode === null
  }
  const pid = child.pid
  if (!pid) return false
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function waitForOwnedProcessTreeExit(
  child: ChildProcess,
  timeoutMs: number
): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (!isOwnedProcessTreeAlive(child)) return true
    await sleep(100)
  }
  return !isOwnedProcessTreeAlive(child)
}

async function stopOwnedChild(child: ChildProcess | null): Promise<void> {
  if (!child || !isOwnedProcessTreeAlive(child)) return
  const pid = child.pid
  if (!pid) fail('OWNED_CHILD_PID_MISSING')
  try {
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-pid, 'SIGTERM')
  } catch {
    if (!isOwnedProcessTreeAlive(child)) return
    fail('OWNED_CHILD_TERMINATION_FAILED')
  }
  if (await waitForOwnedProcessTreeExit(child, 8_000)) return
  try {
    if (process.platform === 'win32') child.kill('SIGKILL')
    else process.kill(-pid, 'SIGKILL')
  } catch {
    if (!isOwnedProcessTreeAlive(child)) return
    fail('OWNED_CHILD_FORCE_TERMINATION_FAILED')
  }
  if (!(await waitForOwnedProcessTreeExit(child, 5_000))) fail('OWNED_CHILD_EXIT_TIMEOUT')
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
  code: string,
  intervalMs = 150
): Promise<T> {
  const startedAt = Date.now()
  let latest!: T
  while (Date.now() - startedAt < timeoutMs) {
    latest = await read()
    if (accept(latest)) return latest
    await sleep(intervalMs)
  }
  throw new AcceptanceError(code)
}

async function bringToFrontAndWait(send: CdpSend): Promise<void> {
  await send('Page.bringToFront')
  await evaluate(send, `(() => { window.focus(); return true })()`)
  await waitForValue(
    () => evaluate<boolean>(send, 'document.hidden === false'),
    Boolean,
    8_000,
    'RENDERER_NOT_VISIBLE'
  )
}

async function getUnobscuredClickPoint(
  send: CdpSend,
  selector: string
): Promise<ClickPoint | null> {
  const point = await evaluate<unknown>(
    send,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!(element instanceof HTMLElement)) return null
      if (element instanceof HTMLButtonElement && element.disabled) return null
      const rect = element.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        x <= 0 ||
        y <= 0 ||
        x >= innerWidth ||
        y >= innerHeight
      ) return null
      const hit = document.elementFromPoint(x, y)
      if (!(hit instanceof Element) || (hit !== element && !element.contains(hit))) return null
      return { x, y }
    })()`
  )
  if (!point || typeof point !== 'object' || Array.isArray(point)) return null
  const candidate = point as Partial<ClickPoint>
  return typeof candidate.x === 'number' && typeof candidate.y === 'number'
    ? { x: candidate.x, y: candidate.y }
    : null
}

async function dispatchMouseClick(send: CdpSend, point: ClickPoint): Promise<void> {
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1
  })
}

async function pickMainRenderer(
  remoteDebuggingUrl: string,
  timeoutMs: number,
  isInterrupted: () => boolean
): Promise<DevToolsTarget> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (isInterrupted()) fail('ACCEPTANCE_INTERRUPTED')
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
        // A renderer still booting is retried from a fresh target list.
      }
    }
    candidates.sort((left, right) => right.score - left.score)
    if (candidates[0]) return candidates[0].target
    await sleep(500)
  }
  fail('MAIN_RENDERER_NOT_FOUND')
}

async function openHome(send: CdpSend): Promise<void> {
  await bringToFrontAndWait(send)
  await evaluate(
    send,
    `(async () => {
      if (window.__VUE_ROUTER__?.push) await window.__VUE_ROUTER__.push('/home')
      else location.hash = '#/home'
      window.focus()
      return true
    })()`
  )
  await waitForValue(
    () =>
      evaluate<boolean>(
        send,
        `document.hidden === false && Boolean(
          document.querySelector('.HomePage textarea.HomePage-Input') &&
          document.querySelector('.HomePage .HomePermissionMenu-Pill') &&
          document.querySelector('.HomePage .HomePage-ModelPill')
        )`
      ),
    Boolean,
    20_000,
    'HOME_NOT_READY'
  )
  await dismissOwnedStartupModal(send)
}

export async function dismissOwnedStartupModal(send: CdpSend): Promise<void> {
  await bringToFrontAndWait(send)
  const startedAt = Date.now()
  let outcome: StartupModalOutcome
  while (true) {
    const current = await evaluate<StartupModalOutcome>(
      send,
      `(() => {
      const overlays = Array.from(
        document.querySelectorAll('.tx-modal__overlay[role="dialog"][aria-modal="true"]')
      )
      const releaseNotes = Array.from(document.querySelectorAll('.whats-changed-dialog'))
      if (releaseNotes.length === 0) {
        return { kind: overlays.length === 0 ? 'ready' : 'unexpected' }
      }
      if (releaseNotes.length !== 1 || overlays.length !== 1) return { kind: 'blocked' }
      const body = releaseNotes[0]
      const content = body.closest('.tx-modal__content')
      const modalBody = body.closest('.tx-modal__body')
      const overlay = content?.closest(
        '.tx-modal__overlay[role="dialog"][aria-modal="true"]'
      )
      const buttons = content?.querySelectorAll(
        '.tx-modal__footer .whats-changed-dialog__actions > button.tx-button.variant-primary'
      )
      if (
        !(content instanceof HTMLElement) ||
        !(modalBody instanceof HTMLElement) ||
        modalBody.parentElement !== content ||
        !(overlay instanceof HTMLElement) ||
        overlay !== overlays[0] ||
        buttons?.length !== 1
      ) {
        return { kind: 'blocked' }
      }
      const button = buttons[0]
      if (!(button instanceof HTMLButtonElement) || button.disabled) return { kind: 'blocked' }
      const rect = button.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        x <= 0 ||
        y <= 0 ||
        x >= innerWidth ||
        y >= innerHeight
      ) return { kind: 'blocked' }
      const hit = document.elementFromPoint(x, y)
      if (!(hit instanceof Element) || (hit !== button && !button.contains(hit))) {
        return { kind: 'blocked' }
      }
      return { kind: 'click', x, y }
    })()`
    )

    if (!current || typeof current !== 'object' || !('kind' in current)) {
      fail('STARTUP_MODAL_STATE_INVALID')
    }
    outcome = current
    if (outcome.kind !== 'blocked') break
    if (Date.now() - startedAt >= STARTUP_MODAL_SETTLE_TIMEOUT_MS) {
      fail('STARTUP_RELEASE_NOTES_NOT_DISMISSIBLE')
    }
    await sleep(100)
  }

  if (outcome.kind === 'unexpected') fail('UNEXPECTED_STARTUP_MODAL')
  if (outcome.kind === 'ready') return
  if (outcome.kind !== 'click') fail('STARTUP_MODAL_STATE_INVALID')

  await dispatchMouseClick(send, outcome)
  await waitForValue(
    () =>
      evaluate<boolean>(
        send,
        `
          document.querySelectorAll('.whats-changed-dialog').length === 0 &&
          document.querySelectorAll('.tx-modal__overlay[role="dialog"][aria-modal="true"]').length === 0
        `
      ),
    Boolean,
    8_000,
    'STARTUP_RELEASE_NOTES_STALE'
  )
}

async function enableReviewMode(send: CdpSend): Promise<void> {
  await bringToFrontAndWait(send)
  const opened = await evaluate<boolean>(
    send,
    `(() => {
      const button = document.querySelector('.HomePage .HomePermissionMenu-Pill')
      if (!(button instanceof HTMLButtonElement)) return false
      button.click()
      return true
    })()`
  )
  if (!opened) fail('PERMISSION_MENU_UNAVAILABLE')
  await waitForValue(
    () =>
      evaluate<boolean>(
        send,
        `(() => {
          const button = document.querySelector('.HomePermissionMenu-Option[data-mode="review"]')
          if (!(button instanceof HTMLButtonElement)) return false
          button.click()
          return true
        })()`
      ),
    Boolean,
    8_000,
    'REVIEW_MODE_UNAVAILABLE'
  )
  await waitForValue(
    () =>
      evaluate<boolean>(
        send,
        `document.hidden === false && document.querySelector('.HomePermissionMenu-Pill')?.classList.contains('active') === true`
      ),
    Boolean,
    8_000,
    'REVIEW_MODE_NOT_APPLIED'
  )
  await waitForReviewModeGatewayReady(send)
}

export async function readAgentToolGatewayState(
  send: CdpSend
): Promise<AgentToolGatewayState | null> {
  const value = await evaluate<unknown>(
    send,
    `(async () => {
      const channel = window.touchChannel
      if (!channel?.send) return null
      try {
        const request = Promise.resolve(
          channel.send(
            ${JSON.stringify(AGENT_TOOL_GET_STATE_EVENT)},
            undefined,
            { timeout: ${AGENT_TOOL_STATE_QUERY_TIMEOUT_MS} }
          )
        ).catch(() => null)
        const state = await Promise.race([
          request,
          new Promise((resolve) => setTimeout(() => resolve(null), ${AGENT_TOOL_STATE_QUERY_TIMEOUT_MS}))
        ])
        if (!state || typeof state !== 'object' || Array.isArray(state)) return null
        const keys = Object.keys(state).sort()
        if (
          keys.length !== 4 ||
          keys[0] !== 'enabled' ||
          keys[1] !== 'mode' ||
          keys[2] !== 'ready' ||
          keys[3] !== 'tools' ||
          typeof state.enabled !== 'boolean' ||
          (state.mode !== 'review' && state.mode !== 'full') ||
          typeof state.ready !== 'boolean' ||
          !Array.isArray(state.tools) ||
          !state.tools.every((tool) => typeof tool === 'string')
        ) return null
        return {
          enabled: state.enabled,
          mode: state.mode,
          ready: state.ready,
          tools: [...state.tools]
        }
      } catch {
        return null
      }
    })()`
  )
  return isAgentToolGatewayState(value) ? value : null
}

function isReviewModeGatewayReady(
  state: AgentToolGatewayState | null
): state is AgentToolGatewayState {
  return (
    state?.enabled === true &&
    state.mode === 'review' &&
    state.ready === true &&
    state.tools.includes(TOOL_ID)
  )
}

export async function waitForReviewModeGatewayReady(
  send: CdpSend,
  timeoutMs = 8_000
): Promise<AgentToolGatewayState> {
  return (await waitForValue(
    () => readAgentToolGatewayState(send),
    isReviewModeGatewayReady,
    timeoutMs,
    'REVIEW_MODE_GATEWAY_NOT_READY'
  )) as AgentToolGatewayState
}

async function selectControlledPiModel(send: CdpSend): Promise<void> {
  await bringToFrontAndWait(send)
  const opened = await evaluate<boolean>(
    send,
    `(() => {
      const button = document.querySelector('.HomePage .HomePage-ModelPill')
      if (!(button instanceof HTMLButtonElement)) return false
      button.click()
      return true
    })()`
  )
  if (!opened) fail('MODEL_MENU_UNAVAILABLE')
  await waitForValue(
    () =>
      evaluate<boolean>(
        send,
        `(() => {
          const group = document.querySelector('#home-model-group-pi-cli-default')?.closest('.HomeModelMenu-Group')
          const button = Array.from(group?.querySelectorAll('.HomeModelMenu-Item') || []).find(
            (item) => item.querySelector('.HomeModelMenu-Model')?.textContent?.trim() === ${JSON.stringify(PI_MODEL)}
          )
          if (!(button instanceof HTMLButtonElement)) return false
          button.click()
          return true
        })()`
      ),
    Boolean,
    30_000,
    'CONTROLLED_PI_MODEL_UNAVAILABLE'
  )
  await waitForValue(
    () =>
      evaluate<boolean>(
        send,
        `document.hidden === false && document.querySelector('.HomePage-ModelName')?.textContent?.trim() === ${JSON.stringify(PI_MODEL)}`
      ),
    Boolean,
    8_000,
    'CONTROLLED_PI_MODEL_NOT_SELECTED'
  )
}

async function readStatusFiles(statusDir: string): Promise<Map<string, ControlledFixtureStatus>> {
  const files = await readdir(statusDir).catch(() => [])
  const statuses = new Map<string, ControlledFixtureStatus>()
  for (const file of files) {
    if (!/^invocation-\d+\.json$/.test(file)) continue
    try {
      const value = JSON.parse(await readFile(path.join(statusDir, file), 'utf8')) as unknown
      if (isControlledFixtureStatus(value)) statuses.set(file, value)
    } catch {
      // A fixture may be replacing its tiny status file while this poll runs.
    }
  }
  return statuses
}

export function isControlledFixtureStatus(value: unknown): value is ControlledFixtureStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const status = value as Partial<ControlledFixtureStatus>
  return (
    hasExactKeys(status as Record<string, unknown>, [
      'schema',
      'phase',
      'toolId',
      'risk',
      'code'
    ]) &&
    status.schema === TOOL_FIXTURE_SCHEMA &&
    (status.phase === 'started' ||
      status.phase === 'completed' ||
      status.phase === 'cancelled' ||
      status.phase === 'failed') &&
    status.toolId === TOOL_ID &&
    status.risk === TOOL_RISK &&
    typeof status.code === 'string' &&
    FIXTURE_RESULT_CODES.some((code) => code === status.code)
  )
}

export function isExpectedConfirmationCard(snapshot: CardSnapshot): boolean {
  return (
    snapshot.confirmationCount === 1 &&
    !snapshot.documentHidden &&
    snapshot.visible &&
    snapshot.unobscured &&
    snapshot.toolId === TOOL_ID &&
    snapshot.risk === TOOL_RISK &&
    snapshot.summary === `Read ${FIXTURE_CANARY_PATH}` &&
    snapshot.input.includes(FIXTURE_CANARY_PATH)
  )
}

async function getCardSnapshot(send: CdpSend): Promise<CardSnapshot> {
  return await evaluate<CardSnapshot>(
    send,
    `(() => {
      const cards = Array.from(document.querySelectorAll('.HomePage-ConfirmSlot .tx-tool-confirmation'))
      const card = cards.find((candidate) => candidate.getAttribute('data-risk') === 'read')
      const rect = card?.getBoundingClientRect()
      const viewport = window.visualViewport
      const viewportLeft = viewport?.offsetLeft ?? 0
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportRight = viewportLeft + (viewport?.width ?? innerWidth)
      const viewportBottom = viewportTop + (viewport?.height ?? innerHeight)
      const visible = Boolean(
        card && rect && rect.width > 0 && rect.height > 0 &&
        rect.left >= viewportLeft &&
        rect.top >= viewportTop &&
        rect.right <= viewportRight &&
        rect.bottom <= viewportBottom
      )
      const ownsPoint = (element, x, y) => {
        if (!(element instanceof HTMLElement)) return false
        const hit = document.elementFromPoint(x, y)
        return hit instanceof Element && (hit === element || element.contains(hit))
      }
      const ownsCenterPoint = (element) => {
        if (!(element instanceof HTMLElement)) return false
        const elementRect = element.getBoundingClientRect()
        if (elementRect.width <= 0 || elementRect.height <= 0) return false
        return ownsPoint(
          element,
          elementRect.left + elementRect.width / 2,
          elementRect.top + elementRect.height / 2
        )
      }
      const deny = card?.querySelector('.tx-tool-confirmation__deny')
      const allow = card?.querySelector('.tx-tool-confirmation__allow')
      const remember = card?.querySelector('.tx-tool-confirmation__remember')
      const inset = 4
      const cardPointsVisible = Boolean(
        card && rect &&
        [
          [rect.left + inset, rect.top + inset],
          [rect.right - inset, rect.top + inset],
          [rect.left + inset, rect.bottom - inset],
          [rect.right - inset, rect.bottom - inset],
          [rect.left + rect.width / 2, rect.top + rect.height / 2]
        ].every(([x, y]) => ownsPoint(card, x, y))
      )
      const unobscured = Boolean(
        visible &&
        cardPointsVisible &&
        ownsCenterPoint(remember) &&
        ownsCenterPoint(deny) &&
        ownsCenterPoint(allow)
      )
      return {
        confirmationCount: cards.length,
        visible,
        unobscured,
        toolId: card?.querySelector('.tx-tool-confirmation__name')?.textContent?.trim() || '',
        risk: card?.getAttribute('data-risk') || '',
        summary: card?.querySelector('.tx-tool-confirmation__summary')?.textContent?.trim() || '',
        input: card?.querySelector('.tx-tool-confirmation__input')?.textContent?.trim() || '',
        documentHidden: document.hidden
      }
    })()`
  )
}

export async function withTemporaryCardRedaction<State, Result>(
  redact: () => Promise<State>,
  capture: (state: State) => Promise<Result>,
  restore: (state: State | undefined) => Promise<void>
): Promise<Result> {
  let state: State | undefined
  try {
    state = await redact()
    return await capture(state)
  } finally {
    await restore(state)
  }
}

async function captureCardScreenshot(send: CdpSend, outputPath: string): Promise<void> {
  const redactionStyleId = 'tuff-tool-acceptance-screenshot-redaction'
  await bringToFrontAndWait(send)
  if (!isExpectedConfirmationCard(await getCardSnapshot(send))) {
    fail('CONFIRMATION_CARD_OCCLUDED')
  }
  await withTemporaryCardRedaction<boolean, void>(
    () =>
      evaluate<boolean>(
        send,
        `(() => {
          const card = document.querySelector('.HomePage-ConfirmSlot .tx-tool-confirmation[data-risk="read"]')
          const summary = card?.querySelector('.tx-tool-confirmation__summary')
          const input = card?.querySelector('.tx-tool-confirmation__input')
          if (!(summary instanceof HTMLElement) || !(input instanceof HTMLElement)) return false
          document.getElementById(${JSON.stringify(redactionStyleId)})?.remove()
          const style = document.createElement('style')
          style.id = ${JSON.stringify(redactionStyleId)}
          style.textContent = [
            '.tx-tool-confirmation__summary',
            '.tx-tool-confirmation__input'
          ].join(',') + '{visibility:hidden!important}'
          document.head.append(style)
          return true
        })()`
      ),
    async (redacted) => {
      if (!redacted) fail('CONFIRMATION_CARD_REDACTION_UNAVAILABLE')
      const clip = await evaluate<{ x: number; y: number; width: number; height: number } | null>(
        send,
        `(() => {
          const card = document.querySelector('.HomePage-ConfirmSlot .tx-tool-confirmation[data-risk="read"]')
          if (!(card instanceof HTMLElement)) return null
          const rect = card.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return null
          return {
            x: Math.max(0, rect.left + scrollX),
            y: Math.max(0, rect.top + scrollY),
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height)
          }
        })()`
      )
      if (!clip) fail('CONFIRMATION_CARD_SCREENSHOT_UNAVAILABLE')
      const response = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { ...clip, scale: 1 },
        captureBeyondViewport: false
      })
      const data = response.result?.data
      if (!data) fail('CONFIRMATION_CARD_SCREENSHOT_EMPTY')
      await writeFile(outputPath, Buffer.from(data, 'base64'))
    },
    async () => {
      await evaluate(
        send,
        `(() => { document.getElementById(${JSON.stringify(redactionStyleId)})?.remove(); return true })()`
      )
    }
  )
}

async function getAssistantMessageSnapshots(send: CdpSend): Promise<AssistantMessageSnapshot[]> {
  return await evaluate<AssistantMessageSnapshot[]>(
    send,
    `(() => Array.from(document.querySelectorAll('.HomePage-Message.assistant')).map((message) => {
      const id = message.getAttribute('data-message-id') || ''
      const ariaBusy = message.getAttribute('aria-busy')
      const hasError = Boolean(message.querySelector('.HomePage-Error[role="alert"]'))
      const hasActions = Boolean(message.querySelector('.HomePage-MsgActions'))
      const status = hasError
        ? 'failed'
        : ariaBusy === 'true'
          ? 'streaming'
          : hasActions
            ? 'complete'
            : 'unknown'
      return {
        id,
        status,
        ariaBusy: ariaBusy === 'true' || ariaBusy === 'false' ? ariaBusy : null,
        hasError,
        hasActions,
        containsExpectedText: (message.textContent || '').includes(${JSON.stringify(
          EXPECTED_ASSISTANT_TEXT
        )})
      }
    }))()`
  )
}

async function getAssistantMessageIds(send: CdpSend): Promise<Set<string>> {
  return new Set((await getAssistantMessageSnapshots(send)).map((message) => message.id))
}

async function waitForAssistantMessageCompletion(
  send: CdpSend,
  before: ReadonlySet<string>,
  timeoutMs = 15_000
): Promise<AssistantMessageAssessment> {
  const startedAt = Date.now()
  let latest: AssistantMessageSnapshot | undefined
  while (Date.now() - startedAt < timeoutMs) {
    const candidates = (await getAssistantMessageSnapshots(send)).filter(
      (message) => message.id && !before.has(message.id)
    )
    latest = candidates.at(-1) ?? latest
    if (candidates.length > 1) return assessAssistantMessage(latest, candidates.length)
    if (latest?.status === 'complete' || latest?.status === 'failed') {
      return assessAssistantMessage(latest, candidates.length)
    }
    await sleep(100)
  }
  return assessAssistantMessage(latest)
}

export async function submitControlledTurn(send: CdpSend): Promise<void> {
  await bringToFrontAndWait(send)
  const assertReviewModeActive = async (): Promise<void> => {
    const reviewModeActive = await evaluate<boolean>(
      send,
      `document.querySelector('.HomePage .HomePermissionMenu-Pill')?.classList.contains('active') === true`
    )
    if (!reviewModeActive) fail('REVIEW_MODE_ROLLED_BACK')
  }
  const assertGatewayReady = async (): Promise<void> => {
    if (!isReviewModeGatewayReady(await readAgentToolGatewayState(send))) {
      fail('REVIEW_MODE_GATEWAY_NOT_READY')
    }
  }

  await assertReviewModeActive()
  await assertGatewayReady()
  const inputUpdated = await evaluate<boolean>(
    send,
    `(() => {
      const input = document.querySelector('.HomePage textarea.HomePage-Input')
      if (!(input instanceof HTMLTextAreaElement)) return false
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      const value = ${JSON.stringify(CONTROLLED_TURN_PROMPT)}
      input.focus()
      if (setter) setter.call(input, value)
      else input.value = value
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return input.value === value
    })()`
  )
  if (!inputUpdated) fail('CONTROLLED_TURN_NOT_SUBMITTED')
  await waitForValue(
    () =>
      evaluate<boolean>(
        send,
        `(() => {
      const input = document.querySelector('.HomePage textarea.HomePage-Input')
      const button = document.querySelector('.HomePage .HomePage-SendBtn')
      return !(
        !(input instanceof HTMLTextAreaElement) ||
        input.value !== ${JSON.stringify(CONTROLLED_TURN_PROMPT)} ||
        !(button instanceof HTMLButtonElement) ||
        button.disabled
      )
    })()`
      ),
    Boolean,
    8_000,
    'CONTROLLED_TURN_NOT_SUBMITTED'
  )
  await assertGatewayReady()
  const clickOutcome = await evaluate<'submitted' | 'review-mode-inactive' | 'not-ready'>(
    send,
    `(() => {
      const input = document.querySelector('.HomePage textarea.HomePage-Input')
      const button = document.querySelector('.HomePage .HomePage-SendBtn')
      const permission = document.querySelector('.HomePage .HomePermissionMenu-Pill')
      if (!permission?.classList.contains('active')) return 'review-mode-inactive'
      if (
        !(input instanceof HTMLTextAreaElement) ||
        input.value !== ${JSON.stringify(CONTROLLED_TURN_PROMPT)} ||
        !(button instanceof HTMLButtonElement) ||
        button.disabled
      ) return 'not-ready'
      button.click()
      return 'submitted'
    })()`
  )
  if (clickOutcome === 'review-mode-inactive') fail('REVIEW_MODE_ROLLED_BACK')
  if (clickOutcome !== 'submitted') fail('CONTROLLED_TURN_NOT_SUBMITTED')
}

async function waitForNewInvocation(
  statusDir: string,
  before: Set<string>,
  timeoutMs = 15_000
): Promise<string> {
  return await waitForValue<string>(
    async () => {
      const statuses = await readStatusFiles(statusDir)
      return [...statuses.keys()].find((file) => !before.has(file)) ?? ''
    },
    Boolean,
    timeoutMs,
    'FIXTURE_INVOCATION_NOT_STARTED'
  )
}

async function beginTurnRequiringCard(
  send: CdpSend,
  paths: ToolAcceptanceLaunchPaths
): Promise<TurnHandle> {
  const [statuses, assistantMessageIds, auditCursor] = await Promise.all([
    readStatusFiles(paths.fixtureStatusDir),
    getAssistantMessageIds(send),
    captureAgentToolAuditLogCursor(paths.userDataDir)
  ])
  const before = new Set(statuses.keys())
  await submitControlledTurn(send)
  const [statusFile, card] = await Promise.all([
    waitForNewInvocation(paths.fixtureStatusDir, before),
    waitForValue(
      () => getCardSnapshot(send),
      isExpectedConfirmationCard,
      15_000,
      'CONFIRMATION_CARD_NOT_VISIBLE'
    )
  ])
  return { statusFile, card, assistantMessageIds, auditCursor }
}

async function waitForTerminalStatus(
  statusDir: string,
  statusFile: string,
  timeoutMs: number
): Promise<ControlledFixtureStatus> {
  return await waitForValue(
    async () => (await readStatusFiles(statusDir)).get(statusFile),
    (status) => Boolean(status && status.phase !== 'started'),
    timeoutMs,
    'FIXTURE_TERMINAL_STATUS_TIMEOUT'
  ).then((status) => status!)
}

async function waitForCardCleared(send: CdpSend, timeoutMs = 8_000): Promise<boolean> {
  try {
    await waitForValue(
      () => getCardSnapshot(send),
      (snapshot) => snapshot.confirmationCount === 0,
      timeoutMs,
      'CONFIRMATION_CARD_STALE'
    )
    return true
  } catch {
    return false
  }
}

async function waitForCancelledAssistantState(
  send: CdpSend,
  before: ReadonlySet<string>,
  timeoutMs = 15_000
): Promise<AssistantMessageAssessment> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const [snapshots, ui] = await Promise.all([
      getAssistantMessageSnapshots(send),
      evaluate<{ documentHidden: boolean; streamRunning: boolean }>(
        send,
        `({
          documentHidden: document.hidden,
          streamRunning: Boolean(
            document.querySelector('.HomePage .HomePage-SendBtn .i-ri-stop-fill') ||
            document.querySelector('.HomePage-Message.assistant[aria-busy="true"]')
          )
        })`
      )
    ])
    if (!ui.documentHidden && !ui.streamRunning) {
      return assessCancelledAssistantMessages(
        snapshots.filter((message) => message.id && !before.has(message.id))
      )
    }
    await sleep(100)
  }
  return { ok: false, failureCode: 'CANCEL_ASSISTANT_MESSAGE_STILL_BUSY' }
}

async function clickCardDecision(
  send: CdpSend,
  decision: 'allow' | 'deny',
  remember = false
): Promise<void> {
  await bringToFrontAndWait(send)
  if (!isExpectedConfirmationCard(await getCardSnapshot(send))) {
    fail('CONFIRMATION_CARD_OCCLUDED')
  }
  if (remember) {
    const checkboxChecked = await evaluate<boolean>(
      send,
      `document.querySelector(
        '.HomePage-ConfirmSlot .tx-tool-confirmation[data-risk="read"] .tx-tool-confirmation__remember input'
      )?.checked === true`
    )
    if (!checkboxChecked) {
      const rememberPoint = await getUnobscuredClickPoint(
        send,
        '.HomePage-ConfirmSlot .tx-tool-confirmation[data-risk="read"] .tx-tool-confirmation__remember'
      )
      if (!rememberPoint) fail('CONFIRMATION_REMEMBER_UNAVAILABLE')
      await dispatchMouseClick(send, rememberPoint)
      const remembered = await evaluate<boolean>(
        send,
        `document.querySelector(
          '.HomePage-ConfirmSlot .tx-tool-confirmation[data-risk="read"] .tx-tool-confirmation__remember input'
        )?.checked === true`
      )
      if (!remembered) fail('CONFIRMATION_REMEMBER_UNAVAILABLE')
    }
  }
  const decisionPoint = await getUnobscuredClickPoint(
    send,
    `.HomePage-ConfirmSlot .tx-tool-confirmation[data-risk="read"] ${
      decision === 'allow' ? '.tx-tool-confirmation__allow' : '.tx-tool-confirmation__deny'
    }`
  )
  if (!decisionPoint) fail('CONFIRMATION_DECISION_UNAVAILABLE')
  await dispatchMouseClick(send, decisionPoint)
}

async function resetRememberedApprovals(send: CdpSend): Promise<void> {
  await bringToFrontAndWait(send)
  const seenToastAttribute = 'data-tuff-tool-acceptance-reset-seen'
  const opened = await evaluate<boolean>(
    send,
    `(() => {
      const button = document.querySelector('.HomePage .HomePermissionMenu-Pill')
      if (!(button instanceof HTMLButtonElement)) return false
      document.querySelectorAll('[data-sonner-toast]').forEach((toast) => {
        toast.setAttribute(${JSON.stringify(seenToastAttribute)}, 'true')
      })
      button.click()
      return true
    })()`
  )
  if (!opened) fail('PERMISSION_MENU_UNAVAILABLE')
  await waitForValue(
    () =>
      evaluate<boolean>(
        send,
        `(() => {
          const button = document.querySelector('.HomePermissionMenu-Reset')
          if (!(button instanceof HTMLButtonElement)) return false
          button.click()
          return true
        })()`
      ),
    Boolean,
    8_000,
    'RESET_APPROVALS_UNAVAILABLE'
  )
  let toastType = ''
  try {
    toastType = await waitForValue<string>(
      () =>
        evaluate<string>(
          send,
          `document.querySelector('[data-sonner-toast]:not([${seenToastAttribute}])[data-type="success"], [data-sonner-toast]:not([${seenToastAttribute}])[data-type="error"]')?.getAttribute('data-type') || ''`
        ),
      (value) => value === 'success' || value === 'error',
      8_000,
      'RESET_APPROVALS_ACK_UNAVAILABLE'
    )
  } finally {
    await evaluate(
      send,
      `(() => {
        document.querySelectorAll('[${seenToastAttribute}]').forEach((toast) => {
          toast.removeAttribute(${JSON.stringify(seenToastAttribute)})
        })
        return true
      })()`
    ).catch(() => undefined)
  }
  if (toastType !== 'success') fail('RESET_APPROVALS_FAILED')
}

async function recoverHome(send: CdpSend): Promise<void> {
  await evaluate(
    send,
    `(() => {
      const stop = document.querySelector('.HomePage .HomePage-SendBtn .i-ri-stop-fill')?.closest('button')
      if (stop instanceof HTMLButtonElement) stop.click()
      const deny = document.querySelector('.HomePage-ConfirmSlot .tx-tool-confirmation__deny')
      if (deny instanceof HTMLButtonElement) deny.click()
      return true
    })()`
  ).catch(() => undefined)
  await sleep(300)
}

async function runDecisionScenario(
  send: CdpSend,
  paths: ToolAcceptanceLaunchPaths,
  outputDir: string,
  name: 'deny' | 'allow' | 'reset',
  decision: 'allow' | 'deny'
): Promise<ToolScenarioEvidence> {
  const handle = await beginTurnRequiringCard(send, paths)
  const screenshotPath = path.join(outputDir, `${name}-confirmation.png`)
  await captureCardScreenshot(send, screenshotPath)
  await clickCardDecision(send, decision)
  const expectation: AgentToolAuditExpectation =
    decision === 'allow'
      ? { decision: 'approved', code: 'TOOL_OK' }
      : { decision: 'denied', code: 'TOOL_APPROVAL_DENIED' }
  const [terminal, observedAudit] = await Promise.all([
    waitForTerminalStatus(paths.fixtureStatusDir, handle.statusFile, 15_000),
    waitForAgentToolAudit(paths.userDataDir, handle.auditCursor, expectation, 15_000)
  ])
  const audit = crossCheckFixtureAudit(observedAudit.evidence, terminal, 'completed')
  const cardCleared = await waitForCardCleared(send)
  const assistant = await waitForAssistantMessageCompletion(send, handle.assistantMessageIds)
  return assessScenario({
    name,
    confirmationCount: handle.card.confirmationCount,
    cardVisible: handle.card.visible,
    cardCleared,
    decision:
      name === 'reset' ? 'approved-after-reset' : decision === 'allow' ? 'approved' : 'denied',
    resultCode: terminal.code,
    requestEnded: assistant.ok,
    documentHidden: handle.card.documentHidden,
    screenshot: screenshotPath,
    audit,
    assistantFailureCode: assistant.failureCode
  })
}

async function runRememberScenario(
  send: CdpSend,
  paths: ToolAcceptanceLaunchPaths,
  outputDir: string
): Promise<ToolScenarioEvidence> {
  const handle = await beginTurnRequiringCard(send, paths)
  const screenshotPath = path.join(outputDir, 'remember-confirmation.png')
  await captureCardScreenshot(send, screenshotPath)
  await clickCardDecision(send, 'allow', true)
  const [firstTerminal, observedFirstAudit] = await Promise.all([
    waitForTerminalStatus(paths.fixtureStatusDir, handle.statusFile, 15_000),
    waitForAgentToolAudit(
      paths.userDataDir,
      handle.auditCursor,
      { decision: 'approved', code: 'TOOL_OK' },
      15_000
    )
  ])
  const firstAudit = crossCheckFixtureAudit(observedFirstAudit.evidence, firstTerminal, 'completed')
  const firstCardCleared = await waitForCardCleared(send)
  const firstAssistant = await waitForAssistantMessageCompletion(send, handle.assistantMessageIds)

  const [replayStatuses, replayAssistantMessageIds, replayAuditCursor] = await Promise.all([
    readStatusFiles(paths.fixtureStatusDir),
    getAssistantMessageIds(send),
    captureAgentToolAuditLogCursor(paths.userDataDir)
  ])
  const before = new Set(replayStatuses.keys())
  await submitControlledTurn(send)
  const replayFile = await waitForNewInvocation(paths.fixtureStatusDir, before)
  let replayConfirmationCount = 0
  let replayDecisionSent = false
  const replayStartedAt = Date.now()
  let replayTerminal: ControlledFixtureStatus | undefined
  while (Date.now() - replayStartedAt < 15_000) {
    const card = await getCardSnapshot(send)
    if (card.visible) {
      replayConfirmationCount = Math.max(replayConfirmationCount, card.confirmationCount)
      if (!replayDecisionSent) {
        replayDecisionSent = true
        await clickCardDecision(send, 'deny')
      }
    }
    const status = (await readStatusFiles(paths.fixtureStatusDir)).get(replayFile)
    if (status && status.phase !== 'started') {
      replayTerminal = status
      break
    }
    await sleep(100)
  }
  if (!replayTerminal) fail('FIXTURE_TERMINAL_STATUS_TIMEOUT')
  const observedReplayAudit = await waitForAgentToolAudit(
    paths.userDataDir,
    replayAuditCursor,
    { decision: 'remembered', code: 'TOOL_OK' },
    15_000
  )
  const replayAudit = crossCheckFixtureAudit(
    observedReplayAudit.evidence,
    replayTerminal,
    'completed'
  )
  const replayAssistant = await waitForAssistantMessageCompletion(send, replayAssistantMessageIds)
  const cardCleared = firstCardCleared && (await waitForCardCleared(send))
  const rememberReplaySkipped =
    replayConfirmationCount === 0 &&
    replayTerminal.code === 'TOOL_OK' &&
    replayAudit.ok &&
    replayAssistant.ok
  return assessScenario({
    name: 'remember-replay',
    confirmationCount: handle.card.confirmationCount,
    cardVisible: handle.card.visible,
    cardCleared,
    decision: 'approved-remembered',
    resultCode: firstTerminal.code,
    requestEnded: firstAssistant.ok && replayAssistant.ok,
    documentHidden: handle.card.documentHidden,
    screenshot: screenshotPath,
    rememberReplaySkipped,
    replayConfirmationCount,
    audit: firstAudit,
    replayAudit,
    assistantFailureCode: firstAssistant.failureCode ?? replayAssistant.failureCode
  })
}

async function runTimeoutScenario(
  send: CdpSend,
  paths: ToolAcceptanceLaunchPaths,
  outputDir: string,
  confirmationTimeoutMs: number
): Promise<ToolScenarioEvidence> {
  const handle = await beginTurnRequiringCard(send, paths)
  const screenshotPath = path.join(outputDir, 'timeout-confirmation.png')
  await captureCardScreenshot(send, screenshotPath)
  const observedAudit = await waitForAgentToolAudit(
    paths.userDataDir,
    handle.auditCursor,
    { decision: 'denied', code: 'TOOL_APPROVAL_DENIED' },
    confirmationTimeoutMs + 3_000
  )
  if (observedAudit.durationMs === undefined) fail('AGENT_TOOL_AUDIT_DURATION_MISSING')
  const elapsedBucket = bucketTimeoutElapsed(observedAudit.durationMs, confirmationTimeoutMs)
  const terminal = await waitForTerminalStatus(
    paths.fixtureStatusDir,
    handle.statusFile,
    confirmationTimeoutMs + 3_000
  )
  const audit = crossCheckFixtureAudit(observedAudit.evidence, terminal, 'completed')
  const cardCleared = await waitForCardCleared(send)
  const assistant = await waitForAssistantMessageCompletion(send, handle.assistantMessageIds)
  if (!cardCleared) await recoverHome(send)
  return assessScenario({
    name: 'timeout',
    confirmationCount: handle.card.confirmationCount,
    cardVisible: handle.card.visible,
    cardCleared,
    decision: 'timeout',
    resultCode: terminal.code,
    requestEnded: assistant.ok,
    documentHidden: handle.card.documentHidden,
    screenshot: screenshotPath,
    timeoutElapsedBucket: elapsedBucket,
    audit,
    assistantFailureCode: assistant.failureCode
  })
}

async function runCancelScenario(
  send: CdpSend,
  paths: ToolAcceptanceLaunchPaths,
  outputDir: string,
  confirmationTimeoutMs: number
): Promise<ToolScenarioEvidence> {
  const handle = await beginTurnRequiringCard(send, paths)
  const screenshotPath = path.join(outputDir, 'cancel-confirmation.png')
  await captureCardScreenshot(send, screenshotPath)
  const cancelStartedAt = await evaluate<number>(
    send,
    `(() => {
      const button = document.querySelector('.HomePage .HomePage-SendBtn .i-ri-stop-fill')?.closest('button')
      if (!(button instanceof HTMLButtonElement)) return 0
      button.click()
      return Date.now()
    })()`
  )
  if (!cancelStartedAt) fail('HOME_CANCEL_UNAVAILABLE')
  const observedAudit = await waitForAgentToolAudit(
    paths.userDataDir,
    handle.auditCursor,
    { decision: 'failed', code: 'TOOL_EXECUTION_ABORTED' },
    confirmationTimeoutMs + 3_000
  )
  const cancelAuditElapsedMs = Math.max(0, Date.now() - cancelStartedAt)
  const terminal = await waitForTerminalStatus(paths.fixtureStatusDir, handle.statusFile, 15_000)
  const audit = crossCheckFixtureAudit(observedAudit.evidence, terminal, 'cancelled')
  const cardCleared = await waitForCardCleared(send)
  const assistant = await waitForCancelledAssistantState(send, handle.assistantMessageIds)
  if (!cardCleared || !assistant.ok) await recoverHome(send)
  return assessScenario({
    name: 'cancel',
    confirmationCount: handle.card.confirmationCount,
    cardVisible: handle.card.visible,
    cardCleared,
    decision: 'cancelled',
    resultCode: terminal.code,
    requestEnded: assistant.ok,
    documentHidden: handle.card.documentHidden,
    screenshot: screenshotPath,
    audit,
    assistantFailureCode: assistant.failureCode,
    cancelAuditElapsedMs,
    confirmationTimeoutMs
  })
}

function blockedScenario(name: ScenarioName, code: string): ToolScenarioEvidence {
  const decisions: Record<ScenarioName, ScenarioDecision> = {
    deny: 'denied',
    allow: 'approved',
    'remember-replay': 'approved-remembered',
    reset: 'approved-after-reset',
    timeout: 'timeout',
    cancel: 'cancelled'
  }
  return {
    name,
    status: 'blocked',
    toolId: TOOL_ID,
    risk: TOOL_RISK,
    confirmationCount: 0,
    cardVisible: false,
    cardCleared: false,
    decision: decisions[name],
    resultCode: 'TOOL_EXECUTION_FAILED',
    requestEnded: false,
    failureCode: code
  }
}

function createReport(options: CliOptions): AcceptanceReport {
  return {
    schema: TOOL_ACCEPTANCE_SCHEMA,
    ok: false,
    checkedAt: new Date().toISOString(),
    scope: 'isolated-controlled',
    app: {
      version: '',
      hash: ''
    },
    runtime: {
      launches: 0,
      processTerminated: false,
      profileRemoved: false,
      confirmationTimeoutMode:
        options.confirmationTimeoutMs === MAX_CONFIRMATION_TIMEOUT_MS
          ? 'production-default'
          : 'controlled-override'
    },
    scenarios: [],
    failures: []
  }
}

async function runAcceptance(options: CliOptions): Promise<AcceptanceReport> {
  const report = createReport(options)
  let stage = 'preflight'
  let child: ChildProcess | null = null
  let paths: PreparedToolAcceptanceProfile | undefined
  let interrupted = false
  let interruptStop: Promise<void> | null = null
  const assertNotInterrupted = (): void => {
    if (interrupted) fail('ACCEPTANCE_INTERRUPTED')
  }
  const onSignal = (): void => {
    if (interrupted) return
    interrupted = true
    process.exitCode = 130
    if (child) {
      // The normal finally block awaits this attempt and independently proves
      // the group is gone before it removes the profile.
      interruptStop = stopOwnedChild(child).catch(() => undefined)
    }
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  try {
    assertNotInterrupted()
    if (process.platform !== 'darwin') fail('MACOS_PACKAGED_APP_REQUIRED')
    const executablePath = path.resolve(options.appBundle, 'Contents', 'MacOS', 'tuff')
    const appAsarPath = path.resolve(options.appBundle, 'Contents', 'Resources', 'app.asar')
    const extensionPath = path.resolve(
      options.appBundle,
      'Contents',
      'Resources',
      'pi-extension-tuff',
      'index.ts'
    )
    await access(executablePath, fsConstants.X_OK).catch(() => fail('PACKAGED_APP_NOT_EXECUTABLE'))
    await access(extensionPath, fsConstants.R_OK).catch(() => fail('PACKAGED_PI_EXTENSION_MISSING'))
    report.app.version = await readAppBundleVersion(options.appBundle).catch(() =>
      fail('PACKAGED_APP_VERSION_FAILED')
    )
    report.app.hash = await hashFile(appAsarPath).catch(() => fail('PACKAGED_APP_HASH_FAILED'))

    stage = 'profile'
    paths = await prepareProfile(options.userDataDir)
    assertNotInterrupted()
    await mkdir(options.outputDir, { recursive: true })
    const port = await resolveCdpPort(options.remoteDebuggingPort)
    const remoteDebuggingUrl = `http://127.0.0.1:${port}/json/list`

    stage = 'launch'
    child = launchPackagedApp(executablePath, port, paths, options.confirmationTimeoutMs)
    report.runtime.launches = 1
    assertNotInterrupted()
    const target = await pickMainRenderer(
      remoteDebuggingUrl,
      options.launchTimeoutMs,
      () => interrupted
    )

    await withTarget(target, async (send) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false
      })
      stage = 'home'
      await openHome(send)
      stage = 'review-mode'
      await enableReviewMode(send)
      stage = 'pi-model'
      await selectControlledPiModel(send)

      const scenarioOrder: ScenarioName[] = [
        'deny',
        'allow',
        'remember-replay',
        'reset',
        'timeout',
        'cancel'
      ]
      for (const name of scenarioOrder) {
        stage = `scenario:${name}`
        try {
          let evidence: ToolScenarioEvidence
          if (name === 'deny' || name === 'allow') {
            evidence = await runDecisionScenario(
              send,
              paths!,
              options.outputDir,
              name,
              name === 'deny' ? 'deny' : 'allow'
            )
          } else if (name === 'remember-replay') {
            evidence = await runRememberScenario(send, paths!, options.outputDir)
          } else if (name === 'reset') {
            await resetRememberedApprovals(send)
            evidence = await runDecisionScenario(send, paths!, options.outputDir, 'reset', 'allow')
          } else if (name === 'timeout') {
            evidence = await runTimeoutScenario(
              send,
              paths!,
              options.outputDir,
              options.confirmationTimeoutMs
            )
          } else {
            evidence = await runCancelScenario(
              send,
              paths!,
              options.outputDir,
              options.confirmationTimeoutMs
            )
          }
          report.scenarios.push(evidence)
          if (evidence.failureCode) {
            report.failures.push({ stage, code: evidence.failureCode })
          }
        } catch (error) {
          const failure = projectAcceptanceFailure(error, stage)
          report.failures.push(failure)
          report.scenarios.push(blockedScenario(name, failure.code))
          await recoverHome(send)
        }
      }
    })

    report.ok =
      report.scenarios.length === 6 &&
      report.scenarios.every((scenario) => scenario.status === 'passed') &&
      report.failures.length === 0
  } catch (error) {
    report.failures.push(projectAcceptanceFailure(error, stage))
  } finally {
    if (interrupted) {
      report.ok = false
      if (!report.failures.some((failure) => failure.code === 'ACCEPTANCE_INTERRUPTED')) {
        report.failures.push({ stage: 'signal', code: 'ACCEPTANCE_INTERRUPTED' })
      }
    }
    let ownedRuntimeStopped = child === null
    try {
      if (child) {
        await interruptStop
        await stopOwnedChild(child)
        report.runtime.processTerminated = true
        child = null
      }
      ownedRuntimeStopped = true
    } catch (error) {
      report.failures.push(projectAcceptanceFailure(error, 'owned-child-cleanup'))
      report.ok = false
    }
    if (options.cleanup && paths?.runnerCreated && ownedRuntimeStopped) {
      try {
        report.runtime.profileRemoved = await cleanupPreparedToolAcceptanceProfile(paths)
      } catch (error) {
        report.failures.push(projectAcceptanceFailure(error, 'profile-cleanup'))
        report.ok = false
      }
    }
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }

  return report
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return
  const report = await runAcceptance(options)
  const output = `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`
  await mkdir(options.outputDir, { recursive: true })
  await writeFile(path.join(options.outputDir, 'tool-confirmation-acceptance.json'), output, 'utf8')
  process.stdout.write(output)
  if (!report.ok) process.exitCode = Math.max(Number(process.exitCode ?? 0), 1)
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (entryPath && import.meta.url === entryPath) {
  main().catch(() => {
    process.stdout.write(
      `${JSON.stringify({
        schema: TOOL_ACCEPTANCE_SCHEMA,
        ok: false,
        failures: [{ stage: 'main', code: 'ACCEPTANCE_FATAL' }]
      })}\n`
    )
    process.exitCode = 1
  })
}
