import { defineEvent } from '../event/builder'

export type HerdrConnectionState
  = | 'disconnected'
    | 'discovering'
    | 'bootstrapping'
    | 'connecting'
    | 'handshaking'
    | 'connected'
    | 'reconnecting'
    | 'fallback-pty'
    | 'unavailable'

export type HerdrOwnership = 'external' | 'managed' | 'none'

export type HerdrBinarySource
  = | 'custom'
    | 'system'
    | 'bundle'
    | 'packaged-resource'
    | 'missing'

export interface HerdrBinaryInfo {
  source: HerdrBinarySource
  path: string | null
  version: string | null
  platform: string
  arch: string
  supported: boolean
  installHint: string | null
}

export type HerdrOscState = 'idle' | 'working' | 'done' | 'blocked' | 'error'

export type HerdrBlockedKind = 'permission' | 'question' | 'auth'

export interface HerdrSessionStatus {
  state: HerdrOscState
  app?: string
  title?: string
  msg?: string
  /** Set when `state === 'blocked'` and reported by the program. */
  kind?: HerdrBlockedKind | null
  /** Optional 0..100 progress reported during `working` or `blocked`. */
  progress?: number | null
}

export interface HerdrSessionView {
  /** Immutable terminal address (`t7` locally, `machine/t7` remotely). */
  address: string
  /** Remote machine name, or `null` for local terminals. */
  machine: string | null
  name: string | null
  title: string
  argv: string[]
  cwd: string
  foregroundName: string | null
  foregroundCwd: string | null
  foregroundPid: number | null
  state: 'live' | 'finished'
  status: HerdrSessionStatus | null
  statusMs: number | null
  records?: Record<string, HerdrSessionStatus>
  reported: boolean
  turn: number
  keep: boolean
  template: string | null
  parent: string | null
  labels: Record<string, string>
  cols: number
  rows: number
  pid: number | null
  exitCode: number | null
  signal: number | null
  reason: string | null
  screen: 'exact' | 'inexact'
  createdMs: number
  finishedMs: number | null
}

export interface HerdrCoreSummary {
  id: string
  name: string
  version: string
  pid: number | null
  uptimeMs: number | null
  liveCount: number
  finishedCount: number
  socketPath: string
  session: string
  generation: number
  features: string[]
}

export type HerdrMachineState = 'connecting' | 'connected' | 'needs_login' | 'unreachable'

export interface HerdrMachineView {
  name: string
  target: string
  id: string
  host: string
  version: string
  state: HerdrMachineState
  session: string | null
  temporary: boolean
  via: boolean
  sinceMs: number | null
  why: string | null
}

export interface HerdrTemplateView {
  name: string
  description: string
  command: string
  error: string | null
}

export interface HerdrRuntimeSnapshot {
  /** Monotonic revision emitted by Tuff main-process store. */
  revision: number
  /** Last applied `events.subscribe` sequence number from herdr-core. */
  seq: number
  enabled: boolean
  connection: HerdrConnectionState
  ownership: HerdrOwnership
  socketPath: string | null
  session: string
  binaryPath: string | null
  binary?: HerdrBinaryInfo
  error: string | null
  core: HerdrCoreSummary | null
  sessions: HerdrSessionView[]
  machines: HerdrMachineView[]
  templates: HerdrTemplateView[]
  updatedAt: number
}

export interface HerdrTerminalDisplay {
  fg?: string | null
  bg?: string | null
  cursor?: string | null
  cell?: [number, number] | null
}

export interface HerdrTerminalRunRequest {
  argv?: string[]
  line?: string
  cwd?: string
  env?: Record<string, string>
  name?: string
  /** Target remote machine name (`null`/omitted for local). */
  on?: string | null
  labels?: Record<string, string>
  keep?: boolean
  rm?: boolean
  cols?: number
  rows?: number
  parent?: string | null
  noParent?: boolean
  noNotify?: boolean
  dieWithParent?: boolean
  outliveParent?: boolean
  wait?: boolean
  timeout?: number
  display?: HerdrTerminalDisplay | null
}

export interface HerdrTerminalSendRequest {
  terminal: string
  text: string
  force?: boolean
  ifState?: 'idle' | 'working'
  wait?: boolean
  timeout?: number
}

export interface HerdrSendResult {
  turn: number
  status: string | null
  started: boolean | null
}

export interface HerdrTerminalKeysRequest {
  terminal: string
  keys: string[]
}

export interface HerdrTerminalKeysResult {
  turn: number
  status: string | null
}

export type HerdrTerminalControlAction = 'interrupt' | 'kill' | 'rm' | 'keep-on' | 'keep-off'

export interface HerdrTerminalControlRequest {
  terminal: string
  action: HerdrTerminalControlAction
  timeout?: number
}

export interface HerdrTerminalControlResult {
  terminal: string
  action: HerdrTerminalControlAction
  /** Outcome reported by `terminal.interrupt` (`stopped`, `exited`, `still_working`, `unknown`). */
  outcome?: string
  /** Stop key sent by `terminal.interrupt` (`esc` or `ctrl+c`). */
  key?: string
  /** Updated session view when returned by the action (`kill`, `keep-on`, `keep-off`). */
  session?: HerdrSessionView | null
  /** Removed terminal address when `action === 'rm'`. */
  removed?: string
}

export interface HerdrTerminalReadRequest {
  terminal: string
  lines?: number
}

export interface HerdrTerminalReadResult {
  text: string
  complete: boolean
  how: 'screen' | 'history' | 'stitched' | (string & {})
  why: string | null
}

export interface HerdrTerminalPutRequest {
  terminal: string
  name: string
  /** Base64-encoded file bytes (at most 8 MiB raw). */
  data: string
}

export interface HerdrTerminalPutResult {
  path: string
  bytes: number
}

export interface HerdrStreamAttachRequest {
  terminal: string
  cols: number
  rows: number
  history?: number
  observe?: boolean
  resumed?: boolean
  resizeNotifications?: boolean
  display?: HerdrTerminalDisplay | null
  /** SDK-issued correlation token for attach cancellation. Never caller authorization. */
  attachToken?: string
}

export interface HerdrStreamAttachResult {
  streamId: string
  terminal: HerdrSessionView
  automaticInput: boolean
  resizeNotifications: boolean
}

export type HerdrStreamIoRequest
  = | { streamId: string, op: 'write', data: string }
    | { streamId: string, op: 'auto-input', data: string }
    | { streamId: string, op: 'resize', cols: number, rows: number }
    | { streamId: string, op: 'focus', focused: boolean }
    | { streamId: string, op: 'ack', bytes: number }
    | { streamId: string, op: 'detach' }

export interface HerdrStreamDataPayload {
  streamId: string
  /** Decoded UTF-8 display text. */
  data: string
  /** Raw byte length of the herdr-core DATA frame for accurate CREDIT backpressure. */
  bytes: number
  /** Optional server-pushed RESIZE notification before a replacement paint. */
  resize?: { cols: number, rows: number }
}

export type HerdrStreamCloseReason
  = | 'detached'
    | 'exited'
    | 'lost'
    | 'restarted'
    | 'core-disconnected'
    | 'error'

export interface HerdrStreamClosedPayload {
  streamId: string
  terminal: string
  reason: HerdrStreamCloseReason | (string & {})
  exitCode?: number | null
  signal?: number | null
  error?: string | null
}

export type HerdrSessionEventKind
  = | 'created'
    | 'lost'
    | 'restarted'
    | 'keep'
    | 'finished'
    | 'removed'
    | 'status'
    | 'turn'
    | 'title'
    | 'labels'
    | 'size'
    | 'doc'
    | 'sync'

export interface HerdrSessionUpsertPayload {
  revision: number
  seq: number
  kind: HerdrSessionEventKind
  address: string
  /** Updated session view, or `null` when `kind === 'removed'`. */
  session: HerdrSessionView | null
}

export interface HerdrEnsureStartedRequest {
  /** Explicitly bootstrap a managed herdr-core even if autoStart is disabled. */
  forceBootstrap?: boolean
  socketPath?: string
  session?: string
  binaryPath?: string
}

export interface HerdrExecRequest {
  argv?: string[]
  line?: string
  cwd?: string | null
  env?: Record<string, string>
  /** Remote machine name, or `null`/omitted for local execution. */
  on?: string | null
  /** Optional stdin bytes encoded as base64 (at most 8 MiB raw). */
  input?: string | null
  /** Timeout in seconds (default 60, max 600 on herdr-core). */
  timeout?: number | null
}

export interface HerdrExecResult {
  code: number | null
  signal: number | null
  /** Stdout bytes encoded as base64 (first 8 MiB). */
  stdout: string
  /** Stderr bytes encoded as base64 (first 1 MiB). */
  stderr: string
  truncated: boolean
  timedOut: boolean
  ms: number
}

export interface HerdrFileReadRequest {
  path: string
  cwd?: string | null
  on?: string | null
  /** 1-based starting line offset. */
  offset?: number | null
  /** Maximum number of lines to return. */
  limit?: number | null
}

export interface HerdrFileReadResult {
  text: string
  first: number
  last: number
  lines: number
}

export interface HerdrFileWriteRequest {
  path: string
  /** Base64-encoded file bytes (at most 8 MiB raw). */
  data: string
  cwd?: string | null
  on?: string | null
}

export interface HerdrFileWriteResult {
  path: string
  bytes: number
}

export interface HerdrFileEditPatch {
  old: string
  new: string
}

export interface HerdrFileEditRequest {
  path: string
  edits: HerdrFileEditPatch[]
  cwd?: string | null
  on?: string | null
}

export interface HerdrDocGetResult {
  value: unknown
  version: number
}

export interface HerdrDocSetResult {
  version: number
}

export type HerdrProjectedProvider = 'claude' | 'codex' | 'pi' | 'oh-my-pi'

export type HerdrProjectedRole = 'user' | 'assistant' | 'tool' | 'system'

export interface HerdrProjectedToolCall {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed'
  argsPreview?: string
  outputPreview?: string
  isError?: boolean
}

export type HerdrProjectedMessagePart
  = | { type: 'text', text: string }
    | { type: 'reasoning', text: string }
    | { type: 'tool-call', toolCallId: string }

export interface HerdrProjectedMessage {
  id: string
  role: HerdrProjectedRole
  text: string
  reasoning?: string
  toolCalls?: HerdrProjectedToolCall[]
  /**
   * Chronological interleaved blocks for assistant/tool turns.
   * Optional for backward compatibility with older emitters; consumers should fall back
   * to `reasoning` -> `text` -> `toolCalls` when omitted.
   */
  parts?: HerdrProjectedMessagePart[]
  timestamp: number | null
}

export interface HerdrProjectedConversation {
  address: string
  provider: HerdrProjectedProvider | null
  nativeSessionId: string | null
  filePath: string | null
  available: boolean
  messages: HerdrProjectedMessage[]
  truncated: boolean
  updatedAt: number
}

export interface HerdrProjectionGetRequest {
  address: string
  limit?: number
}

export interface HerdrProjectionWatchRequest {
  address: string
  limit?: number
}

export interface HerdrProjectionUnwatchRequest {
  address: string
}

const runtime = defineEvent('herdr').module('runtime')
const terminal = defineEvent('herdr').module('terminal')
const stream = defineEvent('herdr').module('stream')
const projection = defineEvent('herdr').module('projection')
const push = defineEvent('herdr').module('push')

export const HerdrEvents = {
  runtime: {
    getSnapshot: runtime.event('get-snapshot').define<void, HerdrRuntimeSnapshot>(),
    ensureStarted: runtime.event('ensure-started').define<HerdrEnsureStartedRequest | void, HerdrRuntimeSnapshot>(),
    reconnect: runtime.event('reconnect').define<void, HerdrRuntimeSnapshot>(),
  },
  terminal: {
    run: terminal.event('run').define<HerdrTerminalRunRequest, HerdrSessionView>(),
    send: terminal.event('send').define<HerdrTerminalSendRequest, HerdrSendResult>(),
    keys: terminal.event('keys').define<HerdrTerminalKeysRequest, HerdrTerminalKeysResult>(),
    control: terminal.event('control').define<HerdrTerminalControlRequest, HerdrTerminalControlResult>(),
    read: terminal.event('read').define<HerdrTerminalReadRequest, HerdrTerminalReadResult>(),
    put: terminal.event('put').define<HerdrTerminalPutRequest, HerdrTerminalPutResult>(),
  },
  stream: {
    attach: stream.event('attach').define<HerdrStreamAttachRequest, HerdrStreamAttachResult>(),
    io: stream.event('io').define<HerdrStreamIoRequest, void>(),
  },
  projection: {
    get: projection.event('get').define<HerdrProjectionGetRequest, HerdrProjectedConversation>(),
    watch: projection.event('watch').define<HerdrProjectionWatchRequest, HerdrProjectedConversation>(),
    unwatch: projection.event('unwatch').define<HerdrProjectionUnwatchRequest, void>(),
  },
  push: {
    snapshotChanged: push.event('snapshot-changed').define<HerdrRuntimeSnapshot, void>(),
    sessionUpsert: push.event('session-upsert').define<HerdrSessionUpsertPayload, void>(),
    streamData: push.event('stream-data').define<HerdrStreamDataPayload, void>(),
    streamClosed: push.event('stream-closed').define<HerdrStreamClosedPayload, void>(),
    projectionUpdated: push.event('projection-updated').define<HerdrProjectedConversation, void>(),
  },
} as const
