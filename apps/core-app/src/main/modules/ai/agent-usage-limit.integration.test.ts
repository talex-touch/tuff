import type { TuffEvent } from '@talex-touch/utils/transport/event/types'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { AgentResult } from '@talex-touch/utils'
import type { UsageLimitRefusalFixture } from './usage-ledger/usage-limit-refusal.test-harness'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import { SdkApi } from '@talex-touch/utils/plugin'
import { AgentsEvents } from '@talex-touch/utils/transport/events'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * An agent or workflow run that the user's own usage limit stops, from the run's first model
 * request to what the Agents and Workflows pages read:
 *
 * - the real SDK, whose usage gate refuses the request — the limit in the real quota manager on a
 *   migrated libSQL file, the day's usage in the real ledger (`usage-limit-refusal.test-harness`);
 * - the real Pi runtime host and the real Pi worker, joined in-process instead of over a utility
 *   process: the host sees exactly the messages the worker posts;
 * - the real orchestrator and orchestrator store, which write the run record;
 * - the real agent manager and agents channel, as a plugin with the agents permission reaches it.
 *
 * Only Electron, storage, telemetry and the plugin host are stood in for. No provider is
 * configured, so nothing could reach a model even if the gate let it through.
 */

let fixture: UsageLimitRefusalFixture | undefined

const bridge = vi.hoisted(() => {
  const hostListeners = new Map<string, Array<(payload: unknown) => void>>()
  let workerListener: ((event: { data: unknown }) => void) | null = null
  const emitToHost = (event: string, payload: unknown) => {
    for (const listener of hostListeners.get(event) ?? []) listener(payload)
  }
  // What the worker sees as `process.parentPort`: a message out reaches the host's child listener.
  ;(process as unknown as { parentPort: unknown }).parentPort = {
    on: (event: string, listener: (event: { data: unknown }) => void) => {
      if (event === 'message') workerListener = listener
    },
    postMessage: (message: unknown) => {
      queueMicrotask(() => emitToHost('message', structuredClone(message)))
    }
  }
  const child = {
    pid: 4242,
    on: (event: string, listener: (payload: unknown) => void) => {
      const listeners = hostListeners.get(event) ?? []
      listeners.push(listener)
      hostListeners.set(event, listeners)
      return child
    },
    // What the host posts to the child reaches the worker's parentPort listener.
    postMessage: (message: unknown) => {
      queueMicrotask(() => workerListener?.({ data: structuredClone(message) }))
    },
    kill: () => emitToHost('exit', 0),
    stdout: { on: () => undefined },
    stderr: { on: () => undefined }
  }
  return { child, forks: 0 }
})

vi.mock('electron', () => {
  const app = {
    commandLine: { appendSwitch: vi.fn() },
    getAppPath: vi.fn(() => '/tmp/app'),
    getPath: vi.fn(() => '/tmp'),
    getVersion: vi.fn(() => '0.0.0-test'),
    isPackaged: false,
    isReady: vi.fn(() => true),
    on: vi.fn(),
    once: vi.fn(),
    setAppLogsPath: vi.fn(),
    setPath: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined)
  }
  const utilityProcess = {
    fork: vi.fn(() => {
      bridge.forks += 1
      // The worker module wires itself to `process.parentPort` and posts `runtime.ready` as it
      // loads — after the host has attached its listeners to the child returned here.
      queueMicrotask(() => void import('./pi-agent-runtime-worker'))
      return bridge.child
    })
  }
  const electron = {
    app,
    utilityProcess,
    screen: { getPrimaryDisplay: vi.fn() },
    crashReporter: { start: vi.fn() },
    BrowserWindow: class BrowserWindow {},
    Tray: class Tray {},
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromPath: vi.fn() },
    ['ipc' + 'Main']: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
    powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
    MessageChannelMain: class MessageChannelMain {}
  }
  return { ...electron, default: electron }
})

// The host looks for the built worker before it forks; the in-process bridge needs none.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const existsSync = (path: unknown) =>
    (typeof path === 'string' && path.endsWith('pi-agent-runtime-worker.js')) ||
    actual.existsSync(path as string)
  return { ...actual, existsSync, default: { ...actual, existsSync } }
})

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true, macOS: false, windows: false, linux: true }
}))
vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
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
vi.mock('../../core/precore', () => ({
  rootPath: '/tmp/tuff-test',
  innerRootPath: '/tmp/tuff-test'
}))
vi.mock('../storage', () => ({
  getMainConfig: vi.fn(() => undefined),
  saveMainConfig: vi.fn(),
  subscribeMainConfig: vi.fn(),
  isMainStorageReady: vi.fn(() => false)
}))
vi.mock('../database', () => ({
  databaseModule: {
    getDb: () => fixture?.db,
    getClient: () => fixture?.client
  }
}))
vi.mock('../sentry/sentry-service', () => {
  const service = {
    isTelemetryEnabled: vi.fn(() => false),
    isEnabled: vi.fn(() => false),
    queueNexusTelemetry: vi.fn()
  }
  return {
    SentryServiceModule: class {},
    getSentryService: vi.fn(() => service),
    setSentryServiceInstance: vi.fn()
  }
})

const permissionMocks = vi.hoisted(() => ({
  checkPermission: vi.fn(() => ({ allowed: true })),
  getPluginByName: vi.fn(() => ({ sdkapi: 260817 }))
}))
vi.mock('../permission/permission-module-ref', () => ({
  getPermissionModule: vi.fn(() => ({ checkPermission: permissionMocks.checkPermission }))
}))
vi.mock('../plugin/plugin-module', () => ({
  pluginModule: { pluginManager: { getPluginByName: permissionMocks.getPluginByName } }
}))
vi.mock('./ai-automation-scheduler', () => ({
  aiAutomationScheduler: {
    setExecutor: vi.fn(),
    initialize: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined)
  }
}))

import { AgentStatus } from '@talex-touch/utils'
import { agentManager } from './agents'
import { registerAgentChannels } from './agents/agent-channels'
import { aiCliOrchestrator } from './ai-cli-orchestrator'
import { aiOrchestratorStore } from './ai-orchestrator-store'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import {
  closeUsageLimitRefusalDatabase,
  openUsageLimitRefusalDatabase,
  reachDailyRequestLimit
} from './usage-ledger/usage-limit-refusal.test-harness'
import { setUsageLimits } from './usage-ledger/usage-limits'

type EventDefinition = TuffEvent<unknown, unknown> & { toEventName: () => string }
type Handler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown

const AGENT_ID = 'usage-limit-test-agent'
const REFUSED = 'USAGE_LIMIT_REACHED: AI usage limit reached.'
const PLUGIN = {
  plugin: createTrustedTestPluginContext({
    name: 'usage-limit-agent-plugin',
    pluginInstanceId: 'usage-limit-agent-instance',
    uniqueKey: 'usage-limit-agent-key'
  })
} as HandlerContext

/** The agents channel as the app registers it; what it broadcasts is collected. */
function registerAgents(): {
  handlers: Map<string, Handler>
  broadcasts: Array<{ event: string; data: unknown }>
} {
  const handlers = new Map<string, Handler>()
  const broadcasts: Array<{ event: string; data: unknown }> = []
  const transport = {
    on: (event: EventDefinition, handler: Handler) => {
      handlers.set(event.toEventName(), handler)
      return () => handlers.delete(event.toEventName())
    },
    broadcast: (event: EventDefinition, data: unknown) => {
      broadcasts.push({ event: event.toEventName(), data })
    }
  } as unknown as ITuffTransportMain
  registerAgentChannels(transport)
  return { handlers, broadcasts }
}

async function waitFor<T>(read: () => T | undefined, timeoutMs = 20_000): Promise<T> {
  const started = Date.now()
  for (;;) {
    const value = read()
    if (value !== undefined) return value
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting')
    await new Promise((settle) => setTimeout(settle, 25))
  }
}

beforeAll(async () => {
  fixture = await openUsageLimitRefusalDatabase()
  intelligenceCapabilityRegistry.clear()
  intelligenceCapabilityRegistry.register({
    id: 'text.chat',
    type: IntelligenceCapabilityType.CHAT,
    name: 'text.chat',
    description: 'usage limit agent test',
    supportedProviders: [IntelligenceProviderType.CUSTOM]
  })
  agentManager.registerAgent(
    {
      id: AGENT_ID,
      name: 'Usage limit test agent',
      description: 'Answers one question.',
      version: '1.0.0',
      capabilities: [],
      enabled: true
    },
    { execute: async () => ({}) }
  )
  agentManager.setTaskRuntime(
    (task) => aiCliOrchestrator.executeAgentTask(task),
    (taskId) => aiCliOrchestrator.cancelAgentTask(taskId)
  )
  await agentManager.init()
  await aiCliOrchestrator.initialize()
}, 60_000)

beforeEach(async () => {
  await setUsageLimits({})
})

afterAll(async () => {
  await aiCliOrchestrator.shutdown().catch(() => undefined)
  intelligenceCapabilityRegistry.clear()
  await closeUsageLimitRefusalDatabase(fixture)
}, 60_000)

describe('a run the usage limit stops', () => {
  it('is recorded with the stable code alone, and only when the limit refused it', async () => {
    // Positive control: without a limit the same run gets past the gate and fails on something
    // else (no channel is configured), recorded as the generic failure.
    const unlimited = await aiCliOrchestrator.execute({ objective: 'Say hello.' })
    expect(unlimited.status).toBe('failed')
    expect(unlimited.error).toBe('AI_RUN_FAILED: AI run failed.')

    await reachDailyRequestLimit(fixture!)
    const refused = await aiCliOrchestrator.execute({ objective: 'Say hello.' })
    expect(refused.status).toBe('failed')
    expect(refused.error).toBe(REFUSED)

    // What the record keeps — read back from the database, as every reader gets it.
    const stored = await aiOrchestratorStore.getOrchestratorRun(refused.id)
    expect(stored?.status).toBe('failed')
    expect(stored?.error).toBe(REFUSED)
    expect(JSON.stringify(stored)).not.toMatch(/requestsPerDay|resets at/)
    expect(bridge.forks).toBe(1)
    const events = await fixture!.client.execute({
      sql: 'SELECT type FROM ai_orchestrator_events WHERE run_id = ? ORDER BY seq',
      args: [refused.id]
    })
    // The real worker ran the agent loop — its own events are in the log — and ended it on the
    // refused model request.
    expect(events.rows.map((row) => row.type)).toEqual([
      'run.queued',
      'run.started',
      'agent_start',
      'turn_start',
      'message_start',
      'message_end',
      'message_start',
      'message_end',
      'turn_end',
      'agent_end',
      'run.failed'
    ])
  })

  it('reaches an agent task and a workflow run with the same code', async () => {
    await reachDailyRequestLimit(fixture!)

    const result = await aiCliOrchestrator.executeAgentTask({
      id: 'usage-limit-task-1',
      agentId: AGENT_ID,
      type: 'execute',
      input: { query: 'Say hello.' }
    })
    expect(result).toMatchObject({ success: false, status: AgentStatus.FAILED, error: REFUSED })

    const workflowRun = await aiCliOrchestrator.executeWorkflowRun({
      workflow: {
        id: 'usage-limit-workflow',
        name: 'Usage limit workflow',
        steps: [{ id: 'step-1', kind: 'prompt', name: 'Say hello', prompt: 'Say hello.' }]
      },
      run: {
        id: 'usage-limit-workflow-run',
        workflowId: 'usage-limit-workflow',
        workflowName: 'Usage limit workflow',
        status: 'pending',
        triggerType: 'manual',
        inputs: {},
        steps: [],
        startedAt: Date.now()
      },
      inputs: {},
      triggerType: 'manual',
      continueOnError: false,
      onUpdate: async () => undefined
    } as unknown as Parameters<typeof aiCliOrchestrator.executeWorkflowRun>[0])
    expect(workflowRun.status).toBe('failed')
    expect(workflowRun.error).toBe(REFUSED)
    expect(workflowRun.steps.map((step) => step.error)).toEqual([REFUSED])
  })

  it('gives a plugin with the agents permission the stable code and nothing else', async () => {
    await reachDailyRequestLimit(fixture!)
    const { handlers, broadcasts } = registerAgents()
    const immediate = handlers.get(AgentsEvents.api.executeImmediate.toEventName())!
    const queued = handlers.get(AgentsEvents.api.execute.toEventName())!
    const task = {
      agentId: AGENT_ID,
      type: 'execute',
      input: { query: 'Say hello.' },
      _sdkapi: SdkApi.V260817
    }

    const answer = (await immediate({ ...task, id: 'plugin-immediate' }, PLUGIN)) as AgentResult
    expect(answer).toMatchObject({ success: false, error: REFUSED })

    await expect(queued({ ...task, id: 'plugin-queued' }, PLUGIN)).resolves.toEqual({
      taskId: 'plugin-queued'
    })
    const failed = await waitFor(() =>
      broadcasts.find((entry) => entry.event === AgentsEvents.push.taskFailed.toEventName())
    )
    expect(failed.data).toEqual({ taskId: 'plugin-queued', error: REFUSED })

    for (const seen of [answer, failed.data])
      expect(JSON.stringify(seen)).not.toMatch(/requestsPerDay|resets at|\d{4}-\d{2}-\d{2}T/)
    expect(permissionMocks.checkPermission).toHaveBeenCalledWith(
      'usage-limit-agent-plugin',
      'intelligence.agents',
      SdkApi.V260817
    )
  })
})
