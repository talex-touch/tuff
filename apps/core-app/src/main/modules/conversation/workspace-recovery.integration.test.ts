import type { Client } from '@libsql/client'
import type {
  ConversationWorkspaceSettings,
  ConversationWorkspaceState,
  WorkspaceSubmitRequest
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceStreamEvent
} from '@talex-touch/utils/types/intelligence'
import type { MainDatabase } from '../../db/db-write'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiAgentProfiles, conversationWorkspaces } from '../../db/schema'
import * as schema from '../../db/schema'

type StreamHandler = (
  payload: IntelligenceChatPayload,
  options: IntelligenceInvokeOptions & { signal?: AbortSignal }
) => AsyncGenerator<IntelligenceStreamEvent<string>>

type ExecuteWorkspaceHandler = (
  request: {
    objective: string
    profileId: string
    sessionId: string
    cwd: string
    allowedToolIds: string[]
  },
  workspace: {
    conversationId: string
    turnId: string
    projectId: string | null
    assertAuthority: () => Promise<void>
    onRunCreated: (run: { id: string; profileId: string; updatedAt: number }) => Promise<void>
    onEvent: (event: { type: string; payload?: Record<string, unknown> }) => Promise<void>
    onRunResult: (
      run: {
        id: string
        profileId: string
        status: string
        output?: string
        error?: string
        approvalReason?: string
        updatedAt: number
      },
      failureDetail?: string
    ) => Promise<void>
  }
) => Promise<void>

const hoisted = vi.hoisted(() => ({
  directory: ''
}))

let db: MainDatabase
let client: Client
let directory: string
let scheduledWrites: Promise<void> = Promise.resolve()
let streamHandler: StreamHandler
let invokeHandler: (
  payload: IntelligenceChatPayload,
  options: IntelligenceInvokeOptions & { signal?: AbortSignal }
) => Promise<{ result: string; provider: string; model: string; usageReported: boolean }>
let executeWorkspaceHandler: ExecuteWorkspaceHandler
const cancelledLiveRuns: string[] = []
const cancelledPersistedRuns: string[] = []

vi.mock('../database', () => ({ databaseModule: { getDb: () => db, getClient: () => client } }))
vi.mock('../../db/db-write', () => ({
  scheduleDbWrite: (_name: string, task: () => Promise<unknown>) => {
    const result = scheduledWrites.then(task)
    scheduledWrites = result.then(
      () => {},
      () => {}
    )
    return result
  }
}))
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    isReady: () => true,
    getPath: () => hoisted.directory || tmpdir(),
    getAppPath: () => process.cwd(),
    commandLine: {
      appendSwitch: vi.fn(),
      hasSwitch: vi.fn(() => false),
      getSwitchValue: vi.fn(() => '')
    }
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
  MessageChannelMain: vi.fn(),
  powerMonitor: { on: vi.fn(), off: vi.fn(), getSystemIdleTime: vi.fn(() => 0) },
  utilityProcess: {},
  safeStorage: { isEncryptionAvailable: () => false }
}))
vi.mock('../sentry/sentry-service', () => ({
  SentryServiceModule: class {},
  getSentryService: () => ({
    isTelemetryEnabled: () => false,
    isEnabled: () => false,
    queueNexusTelemetry: () => {}
  }),
  setSentryServiceInstance: () => {}
}))
vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn(),
  getCurrentScope: vi.fn(() => ({ setTag: vi.fn(), setContext: vi.fn(), setUser: vi.fn() })),
  flush: vi.fn(async () => true)
}))
vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false, windows: false, macOS: false, linux: false }
}))
vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
}))
vi.mock('../ai/agents', () => ({ agentManager: {}, toolRegistry: {} }))
vi.mock('../ai/intelligence-mcp-registry', () => ({ intelligenceMcpRegistry: {} }))
vi.mock('../ai/intelligence-config', () => ({ ensureIntelligenceConfigLoaded: () => {} }))
vi.mock('../ai/intelligence-provider-model-options', () => ({
  getProviderModelOptions: () => [
    { providerId: 'provider-chat', available: true, models: ['chat-model'] }
  ]
}))
vi.mock('../ai/home-conversation-injection', () => ({
  applyHomeConversationInjection: async (payload: IntelligenceChatPayload) => payload
}))
vi.mock('../ai/intelligence-context-execution', () => ({
  intelligenceContextExecutionService: {
    prepareWorkspaceTurn: async (
      payload: IntelligenceChatPayload,
      options: IntelligenceInvokeOptions & { signal?: AbortSignal },
      meta: { conversationId: string; turnId: string }
    ) => ({
      payload,
      options,
      summary: {
        tokenBudget: 8192,
        tokenEstimate: 64,
        sourceTypes: [],
        turnId: meta.turnId
      }
    })
  }
}))
vi.mock('../ai/intelligence-context-hygiene', () => ({
  isContextInputProviderSafe: () => true,
  contextHygieneService: { cleanupWorkspaceConversation: async () => {} }
}))
vi.mock('../local-ai-cli/workspace-root', () => ({
  peekConversationWorkspaceRoot: async () => directory,
  resolveConversationWorkspaceRoot: async () => directory
}))
vi.mock('../ai/ai-cli-orchestrator', () => ({
  aiCliOrchestrator: {
    executeWorkspace: (
      request: Parameters<ExecuteWorkspaceHandler>[0],
      workspace: Parameters<ExecuteWorkspaceHandler>[1]
    ) => executeWorkspaceHandler(request, workspace),
    cancel: (runId: string) => {
      cancelledLiveRuns.push(runId)
      return true
    },
    cancelPersistedRun: async (runId: string) => {
      cancelledPersistedRuns.push(runId)
      return true
    },
    getRun: async () => null,
    approveRun: async () => null
  }
}))
vi.mock('../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    stream: (
      _capability: string,
      payload: IntelligenceChatPayload,
      options: IntelligenceInvokeOptions & { signal?: AbortSignal }
    ) => streamHandler(payload, options),
    invoke: (
      _capability: string,
      payload: IntelligenceChatPayload,
      options: IntelligenceInvokeOptions & { signal?: AbortSignal }
    ) => invokeHandler(payload, options)
  }
}))

import { setAutoResumeOnStartupReader } from '../ai/auto-resume-setting'
import { getConversation } from './conversation-store'
import { ConversationWorkspaceRunner } from './workspace-runner'

afterAll(() => {
  for (const mod of [
    '../database',
    '../../db/db-write',
    'electron',
    '../sentry/sentry-service',
    '@sentry/electron/main',
    '@electron-toolkit/utils',
    'talex-mica-electron',
    '../ai/agents',
    '../ai/intelligence-mcp-registry',
    '../ai/intelligence-config',
    '../ai/intelligence-provider-model-options',
    '../ai/home-conversation-injection',
    '../ai/intelligence-context-execution',
    '../ai/intelligence-context-hygiene',
    '../local-ai-cli/workspace-root',
    '../ai/ai-cli-orchestrator',
    '../ai/intelligence-sdk'
  ]) {
    vi.doUnmock(mod)
  }
})

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../resources/db/migrations'
)

const chatSettings: ConversationWorkspaceSettings = {
  mode: 'chat',
  providerId: 'provider-chat',
  model: 'chat-model',
  reasoningEffort: 'auto',
  autoContext: false
}

const agentSettings: ConversationWorkspaceSettings = {
  mode: 'agent',
  profileId: 'agent-profile-1',
  providerId: 'provider-chat',
  model: 'chat-model',
  reasoningEffort: 'auto',
  autoContext: false
}

const sampleImage = {
  type: 'image' as const,
  name: 'capture.png',
  dataUrl: 'data:image/png;base64,aGVsbG8='
}

async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 4000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 15))
  }
  throw new Error('Timed out waiting for workspace recovery condition')
}

function submitReq(
  conversationId: string,
  id: string,
  text: string,
  settings: ConversationWorkspaceSettings = chatSettings,
  extra: Partial<WorkspaceSubmitRequest> = {}
): WorkspaceSubmitRequest {
  return {
    conversationId,
    id,
    text,
    settings: { ...settings },
    create: { projectId: null, title: conversationId },
    ...extra
  }
}

function makeRunner(options?: {
  autoResumeOnStartup?: boolean | (() => boolean)
  onChanged?: (state: ConversationWorkspaceState) => void
}) {
  return new ConversationWorkspaceRunner({
    onChanged: options?.onChanged ?? (() => {}),
    onMessageUpdate: () => {},
    ...(options?.autoResumeOnStartup !== undefined
      ? { autoResumeOnStartup: options.autoResumeOnStartup }
      : {})
  })
}

const activeRunners: ConversationWorkspaceRunner[] = []
const crashedRunners: Array<{ runner: ConversationWorkspaceRunner; release: () => void }> = []

function trackRunner(runner: ConversationWorkspaceRunner): ConversationWorkspaceRunner {
  activeRunners.push(runner)
  return runner
}

/**
 * Simulates SIGKILL on an in-process runner: keeps it parked on `gate.promise` while the
 * test runs subsequent boots against the same SQLite DB, then releases it cleanly during
 * teardown without writing to the closed DB.
 */
function registerCrashedBoot(
  runner: ConversationWorkspaceRunner,
  gate: PromiseWithResolvers<void>
): void {
  // Observe gate rejection even if submit() fails before the stream awaits gate.promise.
  void gate.promise.catch(() => undefined)
  crashedRunners.push({
    runner,
    release: () => {
      runner.beginShutdown()
      gate.reject(new Error('SIMULATED_SIGKILL_CLEANUP'))
    }
  })
}

beforeEach(async () => {
  scheduledWrites = Promise.resolve()
  cancelledLiveRuns.length = 0
  cancelledPersistedRuns.length = 0
  activeRunners.length = 0
  crashedRunners.length = 0
  setAutoResumeOnStartupReader(() => true)
  directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'workspace-recovery-')))
  hoisted.directory = directory
  client = createClient({ url: `file:${join(directory, 'test.db')}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  await client.execute('PRAGMA foreign_keys = ON')

  await db.insert(aiAgentProfiles).values({
    id: 'agent-profile-1',
    name: 'Agent Profile',
    description: '',
    runtimeProvider: 'pi-core',
    enabled: true,
    modelPreference: '[]',
    allowedToolIds: '["file.read"]',
    enabledSkillIds: '[]',
    permissionPolicy: JSON.stringify({
      mode: 'manual',
      allowedPermissions: ['file:read']
    }),
    timeoutMs: 10_000,
    createdAt: 1,
    updatedAt: 10
  })

  streamHandler = async function* () {
    yield { type: 'delta', capabilityId: 'text.chat', delta: 'default' }
    yield { type: 'end', capabilityId: 'text.chat' }
  }
  invokeHandler = async () => ({
    result: 'fallback',
    provider: 'provider-chat',
    model: 'chat-model',
    usageReported: false
  })
  executeWorkspaceHandler = async () => {
    throw new Error('Unexpected executeWorkspace call')
  }
})

afterEach(async () => {
  for (const crashed of crashedRunners.splice(0)) {
    crashed.release()
  }
  for (const runner of activeRunners.splice(0)) {
    await runner.close().catch(() => undefined)
  }
  await scheduledWrites
  setAutoResumeOnStartupReader(null)
  vi.restoreAllMocks()
  client.close()
  await fs.rm(directory, { recursive: true, force: true })
})

describe('Home Conversation durable startup auto-recovery', () => {
  it('auto-resumes an unexpectedly crashed turn with partial output, persists recoveryAttempts before execution, and drains queued inputs', async () => {
    const partialPersisted = Promise.withResolvers<void>()
    const neverFinish = Promise.withResolvers<void>()
    const observedPayloads: IntelligenceChatPayload[] = []
    let persistedAttemptAtStreamStart: unknown

    streamHandler = async function* (payload) {
      observedPayloads.push(payload)
      if (observedPayloads.length === 1) {
        yield {
          type: 'start',
          capabilityId: 'text.chat',
          provider: 'provider-chat',
          model: 'chat-model'
        }
        yield { type: 'delta', capabilityId: 'text.chat', delta: 'Part 1 before crash.' }
        yield { type: 'part', capabilityId: 'text.chat', partEvent: { kind: 'message-commit' } }
        partialPersisted.resolve()
        await neverFinish.promise
        return
      }
      if (observedPayloads.length === 2) {
        const beforeFinish = await getConversation('conv-crash')
        persistedAttemptAtStreamStart = beforeFinish?.messages.find(
          (message) => message.id === 'assistant-t1'
        )?.meta?.recoveryAttempts
        yield { type: 'delta', capabilityId: 'text.chat', delta: ' Part 2 after recovery.' }
        yield { type: 'end', capabilityId: 'text.chat' }
        return
      }
      yield { type: 'delta', capabilityId: 'text.chat', delta: 'Queued answer.' }
      yield { type: 'end', capabilityId: 'text.chat' }
    }

    // Boot 1: submit turn 1, wait until partial output hits SQLite, enqueue turn 2, then simulate SIGKILL (no close()).
    const boot1 = makeRunner()
    registerCrashedBoot(boot1, neverFinish)
    await boot1.submit(submitReq('conv-crash', 't1', 'Explain recovery'))
    await partialPersisted.promise
    await waitFor(async () => {
      const conv = await getConversation('conv-crash')
      return (
        conv?.messages.some(
          (m) => m.id === 'assistant-t1' && m.content === 'Part 1 before crash.'
        ) ?? false
      )
    })
    await boot1.submit(submitReq('conv-crash', 't2', 'Follow-up queued question'))

    // Boot 2: fresh runner recovers crashed turn + drains queued turn.
    const boot2 = trackRunner(makeRunner())
    const recovery = await boot2.recoverOnStartup()
    expect(recovery).toEqual({
      enabled: true,
      resumedTurns: ['conv-crash'],
      resumedQueues: [],
      interruptedTurns: []
    })

    await waitFor(async () => {
      const state = await boot2.service.get('conv-crash')
      return (
        state?.status === 'idle' &&
        state.queue.length === 0 &&
        state.messages.some((m) => m.id === 'assistant-t2' && m.status === 'complete')
      )
    })

    expect(persistedAttemptAtStreamStart).toBe(1)
    // Continuation system prompt stays leading (before user turns) and final message remains role='user'.
    const recoveredMessages = observedPayloads[1]?.messages ?? []
    const continuationIndex = recoveredMessages.findIndex(
      (m) => m.role === 'system' && m.content.includes('Part 1 before crash.')
    )
    const lastUserIndex = recoveredMessages.findLastIndex((m) => m.role === 'user')
    expect(continuationIndex).toBeGreaterThanOrEqual(0)
    expect(continuationIndex).toBeLessThan(lastUserIndex)
    expect(recoveredMessages.at(-1)?.role).toBe('user')

    const finalState = (await boot2.service.get('conv-crash'))!
    expect(finalState.queueHeld).toBe(false)
    expect(finalState.messages.map((m) => [m.id, m.status, m.content])).toEqual([
      ['user-t1', 'complete', 'Explain recovery'],
      ['assistant-t1', 'complete', 'Part 1 before crash. Part 2 after recovery.'],
      ['user-t2', 'complete', 'Follow-up queued question'],
      ['assistant-t2', 'complete', 'Queued answer.']
    ])
    expect(finalState.messages[1]?.meta?.recoveryAttempts).toBe(1)
  })

  it('graceful shutdown flushes buffered partial output without cancelling activeTurnId and auto-resumes on restart', async () => {
    const secondDeltaArrived = Promise.withResolvers<void>()
    let attempt = 0

    streamHandler = async function* (_payload, options) {
      attempt += 1
      if (attempt === 1) {
        yield { type: 'delta', capabilityId: 'text.chat', delta: 'First chunk. ' }
        // Second delta arrives inside the 250ms persist debounce window; close() must flush it.
        yield { type: 'delta', capabilityId: 'text.chat', delta: 'Unflushed tail.' }
        secondDeltaArrived.resolve()
        if (!options.signal?.aborted) {
          await new Promise<void>((resolveAbort) => {
            options.signal?.addEventListener('abort', () => resolveAbort(), { once: true })
          })
        }
        return
      }
      yield { type: 'delta', capabilityId: 'text.chat', delta: ' Completed after restart.' }
      yield { type: 'end', capabilityId: 'text.chat' }
    }

    const boot1 = makeRunner()
    await boot1.submit(submitReq('conv-restart', 't-restart', 'Write long response'))
    await secondDeltaArrived.promise

    boot1.beginShutdown()
    await boot1.close()

    // On disk after graceful shutdown: active turn & flushed partial output are preserved.
    const [wsRow] = await db
      .select()
      .from(conversationWorkspaces)
      .where(eq(conversationWorkspaces.conversationId, 'conv-restart'))
    expect(wsRow?.status).toBe('running')
    expect(wsRow?.activeTurnId).toBe('t-restart')
    expect(wsRow?.queueHeld).toBe(false)

    const convAfterClose = await getConversation('conv-restart')
    expect(convAfterClose?.messages.find((m) => m.id === 'assistant-t-restart')).toMatchObject({
      status: 'streaming',
      content: 'First chunk. Unflushed tail.'
    })

    // Boot 2: resumes seamlessly from flushed partial output.
    const boot2 = trackRunner(makeRunner())
    const recovery = await boot2.recoverOnStartup()
    expect(recovery.resumedTurns).toEqual(['conv-restart'])

    await waitFor(async () => {
      const state = await boot2.service.get('conv-restart')
      return state?.status === 'idle'
    })

    const finalConv = await getConversation('conv-restart')
    expect(finalConv?.messages.find((m) => m.id === 'assistant-t-restart')).toMatchObject({
      status: 'complete',
      content: 'First chunk. Unflushed tail. Completed after restart.'
    })
  })

  it('explicit user pause (live slot and pre-recovery) never auto-resumes on restart', async () => {
    const streamEntered = Promise.withResolvers<void>()
    let streamCalls = 0
    streamHandler = async function* (_payload, options) {
      streamCalls += 1
      streamEntered.resolve()
      if (!options.signal?.aborted) {
        await new Promise<void>((resolveAbort) => {
          options.signal?.addEventListener('abort', () => resolveAbort(), { once: true })
        })
      }
    }

    // Subcase A: live user pause()
    const boot1 = makeRunner()
    await boot1.submit(submitReq('conv-paused', 't-paused', 'Stop me'))
    await streamEntered.promise
    await boot1.submit(submitReq('conv-paused', 't-queued', 'Queued after pause'))
    const pausedState = await boot1.pause('conv-paused')
    expect(pausedState.status).toBe('cancelled')
    expect(pausedState.activeTurnId).toBeUndefined()
    expect(pausedState.queueHeld).toBe(true)

    // Subcase B: crash another conversation, then user clicks pause() on next boot BEFORE recoverOnStartup()
    const streamEntered2 = Promise.withResolvers<void>()
    const neverFinish = Promise.withResolvers<void>()
    streamHandler = async function* () {
      streamCalls += 1
      streamEntered2.resolve()
      yield { type: 'delta', capabilityId: 'text.chat', delta: 'Halfway' }
      yield { type: 'part', capabilityId: 'text.chat', partEvent: { kind: 'message-commit' } }
      await neverFinish.promise
    }
    const boot1b = makeRunner()
    registerCrashedBoot(boot1b, neverFinish)
    await boot1b.submit(submitReq('conv-early-pause', 't-early', 'Pause before recovery'))
    await streamEntered2.promise
    await waitFor(async () => {
      const c = await getConversation('conv-early-pause')
      return (
        c?.messages.some((m) => m.id === 'assistant-t-early' && m.content === 'Halfway') ?? false
      )
    })

    const callsBeforeBoot2 = streamCalls
    const boot2 = trackRunner(makeRunner())
    const earlyPaused = await boot2.pause('conv-early-pause')
    expect(earlyPaused.status).toBe('cancelled')
    expect(earlyPaused.activeTurnId).toBeUndefined()
    expect(earlyPaused.queueHeld).toBe(true)

    const recovery = await boot2.recoverOnStartup()
    expect(recovery).toEqual({
      enabled: true,
      resumedTurns: [],
      resumedQueues: [],
      interruptedTurns: []
    })
    expect(streamCalls).toBe(callsBeforeBoot2)
    expect((await boot2.service.get('conv-paused'))?.queueHeld).toBe(true)
    expect((await boot2.service.get('conv-early-pause'))?.status).toBe('cancelled')
  })

  it('enforces crash-loop cap at recoveryAttempts >= 1 and falls back to interrupted', async () => {
    const hang1 = Promise.withResolvers<void>()
    const hang2 = Promise.withResolvers<void>()
    let calls = 0

    streamHandler = async function* () {
      calls += 1
      const currentCall = calls
      yield { type: 'delta', capabilityId: 'text.chat', delta: `Attempt ${currentCall}. ` }
      yield { type: 'part', capabilityId: 'text.chat', partEvent: { kind: 'message-commit' } }
      await (currentCall === 1 ? hang1.promise : hang2.promise)
    }

    // Crash #1: wait until attempt 1 has persisted its partial delta before simulating SIGKILL.
    const boot1 = makeRunner()
    registerCrashedBoot(boot1, hang1)
    await boot1.submit(submitReq('conv-loop', 't-loop', 'Trigger crash'))
    await waitFor(async () => {
      const conv = await getConversation('conv-loop')
      return (
        conv?.messages.some((m) => m.id === 'assistant-t-loop' && m.content === 'Attempt 1. ') ??
        false
      )
    })

    // Restart #1: auto-resumes once (recoveryAttempts becomes 1), persists more deltas, then crashes again!
    const boot2 = makeRunner()
    registerCrashedBoot(boot2, hang2)
    const rec1 = await boot2.recoverOnStartup()
    expect(rec1.resumedTurns).toEqual(['conv-loop'])
    await waitFor(async () => {
      const conv = await getConversation('conv-loop')
      const assistant = conv?.messages.find((m) => m.id === 'assistant-t-loop')
      return (
        assistant?.content === 'Attempt 1. Attempt 2. ' && assistant?.meta?.recoveryAttempts === 1
      )
    })

    // Restart #2: recoveryAttempts is already 1 -> MUST NOT auto-resume again!
    const boot3 = trackRunner(makeRunner())
    const rec2 = await boot3.recoverOnStartup()
    expect(rec2).toEqual({
      enabled: true,
      resumedTurns: [],
      resumedQueues: [],
      interruptedTurns: ['conv-loop']
    })
    expect(calls).toBe(2)

    const state = (await boot3.service.get('conv-loop'))!
    expect(state.status).toBe('interrupted')
    expect(state.activeTurnId).toBeUndefined()
    expect(state.queueHeld).toBe(true)
    const assistant = state.messages.find((m) => m.id === 'assistant-t-loop')
    expect(assistant?.status).toBe('failed')
    expect(assistant?.meta).toMatchObject({
      outcome: 'interrupted',
      errorCode: 'WORKSPACE_TURN_INTERRUPTED',
      recoveryAttempts: 1
    })
  })

  it('respects autoResumeOnStartup = false directly and also when early get() ran before setting bound to false', async () => {
    const entered = Promise.withResolvers<void>()
    const hang = Promise.withResolvers<void>()
    let calls = 0

    streamHandler = async function* () {
      calls += 1
      entered.resolve()
      yield { type: 'delta', capabilityId: 'text.chat', delta: 'Partial' }
      yield { type: 'part', capabilityId: 'text.chat', partEvent: { kind: 'message-commit' } }
      await hang.promise
    }

    // Seed one active crashed turn and one idle conversation with an unheld queued input.
    const boot1 = makeRunner()
    registerCrashedBoot(boot1, hang)
    await boot1.submit(submitReq('conv-off-active', 't-off', 'Do work'))
    await entered.promise
    await boot1.service.enqueue(submitReq('conv-off-queued', 't-q', 'Queued work'))
    await waitFor(async () => {
      const conv = await getConversation('conv-off-active')
      return (
        conv?.messages.some((m) => m.id === 'assistant-t-off' && m.content === 'Partial') ?? false
      )
    })

    // Simulate early renderer get() BEFORE IntelligenceModule bound reader -> false!
    let settingValue = true
    const changedEvents: ConversationWorkspaceState[] = []
    const boot2 = trackRunner(
      makeRunner({
        autoResumeOnStartup: () => settingValue,
        onChanged: (state) => changedEvents.push(state)
      })
    )
    const earlyActive = await boot2.service.get('conv-off-active')
    expect(earlyActive?.status).toBe('running')
    expect(earlyActive?.activeTurnId).toBe('t-off')

    // Now IntelligenceModule binds real setting = false and triggers recoverOnStartup().
    settingValue = false
    const recovery = await boot2.recoverOnStartup()
    expect(recovery).toEqual({
      enabled: false,
      resumedTurns: [],
      resumedQueues: [],
      interruptedTurns: ['conv-off-active']
    })
    expect(calls).toBe(1)

    const activeAfter = (await boot2.service.get('conv-off-active'))!
    expect(activeAfter.status).toBe('interrupted')
    expect(activeAfter.activeTurnId).toBeUndefined()
    expect(activeAfter.queueHeld).toBe(true)
    expect(activeAfter.messages[1]?.meta).toMatchObject({
      outcome: 'interrupted',
      errorCode: 'WORKSPACE_TURN_INTERRUPTED'
    })

    const queuedAfter = (await boot2.service.get('conv-off-queued'))!
    expect(queuedAfter.queueHeld).toBe(true)
    expect(queuedAfter.queue).toHaveLength(1)
    expect(
      changedEvents.some(
        (s) => s.conversationId === 'conv-off-active' && s.status === 'interrupted'
      )
    ).toBe(true)
  })

  it('never auto-resumes a pending_approval agent turn (fail-closed approval gate)', async () => {
    const approvalReached = Promise.withResolvers<void>()
    let agentExecutions = 0

    executeWorkspaceHandler = async (_request, workspace) => {
      agentExecutions += 1
      await workspace.onRunCreated({
        id: 'run-approval-1',
        profileId: 'agent-profile-1',
        updatedAt: 100
      })
      await workspace.onRunResult({
        id: 'run-approval-1',
        profileId: 'agent-profile-1',
        status: 'pending_approval',
        approvalReason: 'Needs write approval',
        updatedAt: 101
      })
      approvalReached.resolve()
    }

    const boot1 = makeRunner()
    await boot1.submit(submitReq('conv-approval', 't-approval', 'Edit file', agentSettings))
    await approvalReached.promise
    await boot1.close()

    const boot2 = trackRunner(makeRunner())
    const recovery = await boot2.recoverOnStartup()
    expect(recovery).toEqual({
      enabled: true,
      resumedTurns: [],
      resumedQueues: [],
      interruptedTurns: ['conv-approval']
    })
    expect(agentExecutions).toBe(1)

    const state = (await boot2.service.get('conv-approval'))!
    expect(state.status).toBe('interrupted')
    expect(state.activeTurnId).toBeUndefined()
    expect(state.pendingRun).toBeUndefined()
    expect(state.queueHeld).toBe(true)
  })

  it('recovers active agent turn with bounded continuation objective and fails closed if profile disabled', async () => {
    const partialAgentReady = Promise.withResolvers<void>()
    const hang = Promise.withResolvers<void>()
    const capturedObjectives: string[] = []
    let calls = 0

    executeWorkspaceHandler = async (request, workspace) => {
      calls += 1
      capturedObjectives.push(request.objective)
      await workspace.assertAuthority()
      await workspace.onRunCreated({
        id: `run-agent-${calls}`,
        profileId: 'agent-profile-1',
        updatedAt: 100 + calls
      })
      if (calls === 1) {
        await workspace.onEvent({
          type: 'tool_execution_start',
          payload: { toolCallId: 'tc-1', toolName: 'file.read', args: { path: 'README.md' } }
        })
        await workspace.onEvent({
          type: 'tool_execution_end',
          payload: {
            toolCallId: 'tc-1',
            toolName: 'file.read',
            result: { content: [{ type: 'text', text: 'Read README.md ok' }] },
            isError: false
          }
        })
        await workspace.onEvent({ type: 'text', payload: { delta: 'Checked README.' } })
        await workspace.onEvent({
          type: 'message_end',
          payload: { message: { role: 'assistant', stopReason: 'stop' } }
        })
        partialAgentReady.resolve()
        await hang.promise
        return
      }
      await workspace.onRunResult({
        id: `run-agent-${calls}`,
        profileId: 'agent-profile-1',
        status: 'completed',
        output: 'Finished agent verification.',
        updatedAt: 200
      })
    }

    const boot1 = makeRunner()
    registerCrashedBoot(boot1, hang)
    await boot1.submit(submitReq('conv-agent', 't-agent', 'Inspect repo', agentSettings))
    await partialAgentReady.promise
    await waitFor(async () => {
      const conv = await getConversation('conv-agent')
      return (
        conv?.messages.some(
          (m) => m.id === 'assistant-t-agent' && m.content === 'Checked README.'
        ) ?? false
      )
    })

    // Boot 2: resumes agent turn with continuation block and preserves prior text + tool part
    const boot2 = trackRunner(makeRunner())
    const rec = await boot2.recoverOnStartup()
    expect(rec.resumedTurns).toEqual(['conv-agent'])

    await waitFor(async () => {
      const state = await boot2.service.get('conv-agent')
      return state?.status === 'idle'
    })

    expect(capturedObjectives[1]).toContain('Inspect repo')
    expect(capturedObjectives[1]).toContain('[Recovery Continuation]')
    expect(capturedObjectives[1]).toContain('Checked README.')
    expect(capturedObjectives[1]).toContain('file.read (done)')
    expect(Buffer.byteLength(capturedObjectives[1]!, 'utf8')).toBeLessThanOrEqual(8192 + 128)

    const recoveredAgentState = (await boot2.service.get('conv-agent'))!
    const assistantMsg = recoveredAgentState.messages.find((m) => m.id === 'assistant-t-agent')
    expect(assistantMsg?.status).toBe('complete')
    expect(assistantMsg?.content).toBe('Checked README.\n\nFinished agent verification.')
    expect(
      assistantMsg?.parts?.some(
        (p) =>
          Boolean(p) &&
          typeof p === 'object' &&
          (p as Record<string, unknown>).type === 'tool-call' &&
          (p as Record<string, unknown>).id === 'tc-1'
      )
    ).toBe(true)

    // Subcase B: crash another agent turn, disable profile before restart -> fail closed cleanly
    const hangDisabled = Promise.withResolvers<void>()
    const partialAgent2 = Promise.withResolvers<void>()
    executeWorkspaceHandler = async (_request, workspace) => {
      calls += 1
      await workspace.onRunCreated({
        id: 'run-disabled',
        profileId: 'agent-profile-1',
        updatedAt: 300
      })
      partialAgent2.resolve()
      await hangDisabled.promise
    }
    const boot3 = makeRunner()
    registerCrashedBoot(boot3, hangDisabled)
    await boot3.submit(
      submitReq('conv-agent-disabled', 't-agent-2', 'Inspect again', agentSettings)
    )
    await partialAgent2.promise
    await db
      .update(aiAgentProfiles)
      .set({ enabled: false })
      .where(eq(aiAgentProfiles.id, 'agent-profile-1'))

    const callsBeforeDisabledRestart = calls
    const boot4 = trackRunner(makeRunner())
    const recDisabled = await boot4.recoverOnStartup()
    expect(recDisabled.resumedTurns).toEqual([])
    expect(recDisabled.interruptedTurns).toContain('conv-agent-disabled')
    expect(calls).toBe(callsBeforeDisabledRestart)
    expect((await boot4.service.get('conv-agent-disabled'))?.status).toBe('interrupted')
  })

  it('drains idle unheld queued inputs, preserves image attachments on crash recovery, and recovers crashed retry turns', async () => {
    const hang = Promise.withResolvers<void>()
    const attachEntered = Promise.withResolvers<void>()
    let receivedRecoveryAttachments: unknown

    streamHandler = async function* (payload) {
      const lastUser = payload.messages.findLast((m) => m.role === 'user')
      if (lastUser?.content === 'Describe image' && !receivedRecoveryAttachments) {
        if (!payload.messages.some((m) => m.role === 'system')) {
          attachEntered.resolve()
          yield { type: 'delta', capabilityId: 'text.chat', delta: 'Looking at image.' }
          yield { type: 'part', capabilityId: 'text.chat', partEvent: { kind: 'message-commit' } }
          await hang.promise
          return
        }
        receivedRecoveryAttachments = lastUser.attachments
        yield { type: 'delta', capabilityId: 'text.chat', delta: ' It says hello.' }
        yield { type: 'end', capabilityId: 'text.chat' }
        return
      }
      if (lastUser?.content === 'Idle queued prompt') {
        yield { type: 'delta', capabilityId: 'text.chat', delta: 'Drained queued response.' }
        yield { type: 'end', capabilityId: 'text.chat' }
        return
      }
      if (lastUser?.content === 'Original question for retry') {
        yield { type: 'delta', capabilityId: 'text.chat', delta: 'Recovered retry answer.' }
        yield { type: 'end', capabilityId: 'text.chat' }
        return
      }
      yield { type: 'end', capabilityId: 'text.chat' }
    }

    // 1. Seed crashed turn with image attachment
    const boot1 = makeRunner()
    registerCrashedBoot(boot1, hang)
    await boot1.submit(
      submitReq('conv-attach', 't-attach', 'Describe image', chatSettings, {
        attachments: [sampleImage]
      })
    )
    await attachEntered.promise
    await waitFor(async () => {
      const c = await getConversation('conv-attach')
      return (
        c?.messages.some(
          (m) => m.id === 'assistant-t-attach' && m.content === 'Looking at image.'
        ) ?? false
      )
    })

    // 2. Seed idle conversation with unheld queued input
    await boot1.service.enqueue(submitReq('conv-idle-queue', 't-idle-q', 'Idle queued prompt'))

    // 3. Seed crashed retry turn (where user-${activeTurnId} does not exist)
    await boot1.service.enqueue(submitReq('conv-retry', 't-orig', 'Original question for retry'))
    await boot1.service.takeNext('conv-retry')
    await boot1.service.mutateMessages('conv-retry', 't-orig', (messages) => {
      const assistant = messages.find((m) => m.id === 'assistant-t-orig')!
      assistant.status = 'failed'
      assistant.meta = { ...assistant.meta, outcome: 'failed', errorCode: 'NETWORK_ERROR' }
    })
    await boot1.service.finishTurn('conv-retry', 't-orig', 'failed')
    await boot1.service.resume('conv-retry')
    await boot1.service.admitDirectly({
      conversationId: 'conv-retry',
      id: 't-retry',
      text: 'Original question for retry',
      settings: { ...chatSettings },
      retryOfMessageId: 'assistant-t-orig'
    })

    // Boot 2: recovers attachment turn, retry turn, AND drains idle queue!
    const boot2 = trackRunner(makeRunner())
    const rec = await boot2.recoverOnStartup()
    expect(rec.enabled).toBe(true)
    expect(rec.resumedTurns.sort()).toEqual(['conv-attach', 'conv-retry'])
    expect(rec.resumedQueues).toEqual(['conv-idle-queue'])

    await waitFor(async () => {
      const [s1, s2, s3] = await Promise.all([
        boot2.service.get('conv-attach'),
        boot2.service.get('conv-idle-queue'),
        boot2.service.get('conv-retry')
      ])
      return s1?.status === 'idle' && s2?.status === 'idle' && s3?.status === 'idle'
    })

    expect(receivedRecoveryAttachments).toEqual([sampleImage])
    expect(
      (await getConversation('conv-attach'))?.messages.find((m) => m.id === 'assistant-t-attach')
        ?.content
    ).toBe('Looking at image. It says hello.')
    expect(
      (await getConversation('conv-idle-queue'))?.messages.find(
        (m) => m.id === 'assistant-t-idle-q'
      )?.content
    ).toBe('Drained queued response.')
    expect(
      (await getConversation('conv-retry'))?.messages.find((m) => m.id === 'assistant-t-retry')
        ?.content
    ).toBe('Recovered retry answer.')
  })

  it('preserves admitted turn settings and retry text, fails closed on legacy retries, holds restored queues on disabled submit, retains continuation tail, and persists pending_approval during shutdown', async () => {
    // Add second agent profile to test mid-turn configure() isolation
    await db.insert(aiAgentProfiles).values({
      id: 'agent-profile-2',
      name: 'Agent Profile 2',
      description: '',
      runtimeProvider: 'pi-core',
      enabled: true,
      modelPreference: '[]',
      allowedToolIds: '["file.write"]',
      enabledSkillIds: '[]',
      permissionPolicy: JSON.stringify({
        mode: 'manual',
        allowedPermissions: ['file:write']
      }),
      timeoutMs: 10_000,
      createdAt: 1,
      updatedAt: 10
    })

    // 1. Admitted settings (agent-profile-1) stay pinned even after configure() switches to agent-profile-2
    const seenAgentCalls: Array<{ objective: string; profileId?: string }> = []
    executeWorkspaceHandler = async (request, workspace) => {
      seenAgentCalls.push({ objective: request.objective, profileId: request.profileId })
      const run = {
        id: `run-${seenAgentCalls.length}`,
        profileId: request.profileId,
        status: 'completed',
        output: `done-${request.profileId}`,
        updatedAt: Date.now()
      }
      await workspace.onRunCreated(run)
      await workspace.onRunResult(run)
    }

    const boot1 = trackRunner(makeRunner())
    await boot1.service.admitDirectly(
      submitReq('conv-settings-pin', 't-pin', 'Run under profile 1', {
        mode: 'agent',
        profileId: 'agent-profile-1'
      })
    )
    // User switches workspace config to profile 2 while turn is active
    await boot1.service.configure('conv-settings-pin', {
      mode: 'agent',
      profileId: 'agent-profile-2'
    })

    // 2. Retry turn with narrowed text restores narrowed text; legacy retry without retryText interrupts
    await boot1.service.enqueue(
      submitReq('conv-retry-narrow', 't-wide', 'Inspect the entire project', {
        mode: 'agent',
        profileId: 'agent-profile-1'
      })
    )
    await boot1.service.takeNext('conv-retry-narrow')
    await boot1.service.mutateMessages('conv-retry-narrow', 't-wide', (messages) => {
      const assistant = messages.find((m) => m.id === 'assistant-t-wide')!
      assistant.status = 'failed'
      assistant.meta = { ...assistant.meta, outcome: 'failed', errorCode: 'ERR' }
    })
    await boot1.service.finishTurn('conv-retry-narrow', 't-wide', 'failed')
    await boot1.service.resume('conv-retry-narrow')
    await boot1.service.admitDirectly({
      conversationId: 'conv-retry-narrow',
      id: 't-narrow-retry',
      text: 'Inspect only src',
      settings: { mode: 'agent', profileId: 'agent-profile-1' },
      retryOfMessageId: 'assistant-t-wide'
    })

    // Legacy retry: strip retryText from assistant meta to simulate pre-PR retry row
    await boot1.service.enqueue(
      submitReq('conv-retry-legacy', 't-leg-orig', 'Broad legacy objective', {
        mode: 'agent',
        profileId: 'agent-profile-1'
      })
    )
    await boot1.service.takeNext('conv-retry-legacy')
    await boot1.service.mutateMessages('conv-retry-legacy', 't-leg-orig', (messages) => {
      const assistant = messages.find((m) => m.id === 'assistant-t-leg-orig')!
      assistant.status = 'failed'
      assistant.meta = { ...assistant.meta, outcome: 'failed', errorCode: 'ERR' }
    })
    await boot1.service.finishTurn('conv-retry-legacy', 't-leg-orig', 'failed')
    await boot1.service.resume('conv-retry-legacy')
    await boot1.service.admitDirectly({
      conversationId: 'conv-retry-legacy',
      id: 't-leg-retry',
      text: 'Narrowed legacy retry',
      settings: { mode: 'agent', profileId: 'agent-profile-1' },
      retryOfMessageId: 'assistant-t-leg-orig'
    })
    await boot1.service.mutateMessages('conv-retry-legacy', 't-leg-retry', (messages) => {
      const assistant = messages.find((m) => m.id === 'assistant-t-leg-retry')!
      const meta = { ...(assistant.meta ?? {}) }
      delete meta.retryText
      assistant.meta = meta
    })

    // 3. Long partial output (> 8 KiB) + verbose tool calls keeps the tail of assistant output
    let capturedContinuation = ''
    streamHandler = async function* (payload) {
      const sys = payload.messages.find((m) => m.role === 'system')
      if (sys) capturedContinuation = sys.content
      yield { type: 'delta', capabilityId: 'text.chat', delta: 'Final tail continuation.' }
      yield { type: 'end', capabilityId: 'text.chat' }
    }
    await boot1.service.admitDirectly(
      submitReq('conv-long-tail', 't-tail', 'Explain everything', chatSettings)
    )
    const longPartial = `${'A'.repeat(9000)}\nUNIQUE-RECENT-TAIL-MARKER-99`
    const noisyTools = Array.from({ length: 12 }, (_, idx) => ({
      type: 'tool-call',
      id: `call-${idx}`,
      name: `tool.inspect_${idx}`,
      status: 'done',
      output: 'X'.repeat(400)
    }))
    await boot1.service.mutateMessages('conv-long-tail', 't-tail', (messages) => {
      const assistant = messages.find((m) => m.id === 'assistant-t-tail')!
      assistant.content = longPartial
      assistant.meta = {
        ...assistant.meta,
        parts: [...noisyTools, { type: 'text', text: longPartial }]
      }
    })

    const boot2 = trackRunner(makeRunner())
    const rec2 = await boot2.recoverOnStartup()
    expect(rec2.resumedTurns).toContain('conv-settings-pin')
    expect(rec2.resumedTurns).toContain('conv-retry-narrow')
    expect(rec2.resumedTurns).toContain('conv-long-tail')
    expect(rec2.interruptedTurns).toContain('conv-retry-legacy')

    await waitFor(async () => {
      const [s1, s2, s3] = await Promise.all([
        boot2.service.get('conv-settings-pin'),
        boot2.service.get('conv-retry-narrow'),
        boot2.service.get('conv-long-tail')
      ])
      return s1?.status === 'idle' && s2?.status === 'idle' && s3?.status === 'idle'
    })

    expect(seenAgentCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objective: 'Run under profile 1',
          profileId: 'agent-profile-1'
        }),
        expect.objectContaining({
          objective: 'Inspect only src',
          profileId: 'agent-profile-1'
        })
      ])
    )
    expect(seenAgentCalls.some((c) => c.objective.includes('Broad legacy objective'))).toBe(false)
    expect(capturedContinuation).toContain('UNIQUE-RECENT-TAIL-MARKER-99')
    expect(Buffer.byteLength(capturedContinuation, 'utf8')).toBeLessThanOrEqual(8192)

    // 4. Early get() + submit() before recoverOnStartup() with autoResumeOnStartup=false holds old idle queue
    await boot2.service.enqueue(submitReq('conv-disabled-q', 't-old-q', 'Old restored queued msg'))
    const dispatchedPrompts: string[] = []
    streamHandler = async function* (payload) {
      const lastUser = payload.messages.findLast((m) => m.role === 'user')
      if (lastUser) dispatchedPrompts.push(lastUser.content)
      yield { type: 'delta', capabilityId: 'text.chat', delta: 'ok' }
      yield { type: 'end', capabilityId: 'text.chat' }
    }
    setAutoResumeOnStartupReader(() => true)
    const boot3 = trackRunner(makeRunner())
    // Simulate early read before IntelligenceModule binds false
    await boot3.service.get('conv-disabled-q')
    setAutoResumeOnStartupReader(() => false)
    const submitted = await boot3.submit(
      submitReq('conv-disabled-q', 't-new-q', 'New msg while disabled')
    )
    expect(submitted.disposition).toBe('queued')
    expect(submitted.state.queueHeld).toBe(true)
    expect(dispatchedPrompts).toEqual([])
    // Explicit user resume still drains the queue
    await boot3.resume('conv-disabled-q')
    await waitFor(async () => (await boot3.service.get('conv-disabled-q'))?.status === 'idle')
    expect(dispatchedPrompts).toEqual(['Old restored queued msg', 'New msg while disabled'])

    // 5. pending_approval arriving after beginShutdown() is still persisted and refused on next boot
    setAutoResumeOnStartupReader(() => true)
    const approvalGate = Promise.withResolvers<void>()
    executeWorkspaceHandler = async (request, workspace) => {
      const run = {
        id: 'run-shutdown-approval',
        profileId: request.profileId,
        status: 'pending_approval',
        approvalReason: 'Needs write permission',
        updatedAt: Date.now()
      }
      await workspace.onRunCreated(run)
      await approvalGate.promise
      await workspace.onRunResult(run)
    }
    const boot4 = trackRunner(makeRunner())
    await boot4.submit(
      submitReq('conv-shutdown-approval', 't-shut-app', 'Edit file', {
        mode: 'agent',
        profileId: 'agent-profile-1'
      })
    )
    boot4.beginShutdown()
    approvalGate.resolve()
    await boot4.close()

    const boot5 = trackRunner(makeRunner())
    const rec5 = await boot5.recoverOnStartup()
    expect(rec5.resumedTurns).not.toContain('conv-shutdown-approval')
    expect(rec5.interruptedTurns).toContain('conv-shutdown-approval')

    // 6. completed agent run finishing after beginShutdown() settles receipt without kicking next queued turn
    const completionGate = Promise.withResolvers<void>()
    const completedObjectives: string[] = []
    executeWorkspaceHandler = async (request, workspace) => {
      completedObjectives.push(request.objective)
      const run = {
        id: `run-${completedObjectives.length}`,
        profileId: request.profileId,
        status: 'completed',
        output: `Done: ${request.objective}`,
        updatedAt: Date.now()
      }
      await workspace.onRunCreated(run)
      if (completedObjectives.length === 1) {
        await completionGate.promise
      }
      await workspace.onRunResult(run)
    }
    const boot6 = trackRunner(makeRunner())
    await boot6.submit(
      submitReq('conv-shutdown-complete', 't-shut-comp-1', 'First objective', {
        mode: 'agent',
        profileId: 'agent-profile-1'
      })
    )
    await boot6.submit(
      submitReq('conv-shutdown-complete', 't-shut-comp-2', 'Second queued objective', {
        mode: 'agent',
        profileId: 'agent-profile-1'
      })
    )
    boot6.beginShutdown()
    completionGate.resolve()
    await boot6.close()

    // First turn settled cleanly; second turn was NOT started during shutdown
    expect(completedObjectives).toEqual(['First objective'])
    const stateAfterClose = await boot6.service.get('conv-shutdown-complete')
    expect(stateAfterClose?.status).toBe('idle')
    expect(stateAfterClose?.queue.map((q) => q.id)).toEqual(['t-shut-comp-2'])
    expect(
      (await getConversation('conv-shutdown-complete'))?.messages.find(
        (m) => m.id === 'assistant-t-shut-comp-1'
      )
    ).toMatchObject({ status: 'complete', content: 'Done: First objective' })

    // Next boot executes ONLY the queued second objective (never replays the completed first objective)
    const boot7 = trackRunner(makeRunner())
    const rec7 = await boot7.recoverOnStartup()
    expect(rec7.resumedTurns).not.toContain('conv-shutdown-complete')
    expect(rec7.resumedQueues).toContain('conv-shutdown-complete')
    await waitFor(
      async () =>
        (await boot7.service.get('conv-shutdown-complete'))?.status === 'idle' &&
        (await boot7.service.get('conv-shutdown-complete'))?.queue.length === 0
    )
    expect(completedObjectives).toEqual(['First objective', 'Second queued objective'])
  })
})
