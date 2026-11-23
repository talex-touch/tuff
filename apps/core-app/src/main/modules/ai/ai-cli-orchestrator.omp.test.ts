import type {
  AcpMcpServerConfig,
  AcpPermissionRequestParams,
  AcpPermissionRequestResult,
  OmpStreamEvent
} from '@talex-touch/tuff-intelligence'
import type {
  AiAgentProfile,
  AiOrchestratorRunRecord
} from '@talex-touch/utils/types/ai-orchestrator'
import type { PiRuntimeRunEvent, PiRuntimeStartPayload } from './pi-agent-runtime-protocol'
import { createHash } from 'node:crypto'
import { structuredStrictStringify } from '@talex-touch/utils'
import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OmpAcpClient } from '@talex-touch/tuff-intelligence'

const mocks = vi.hoisted(() => {
  const profiles = new Map<string, AiAgentProfile>()
  const runs = new Map<string, AiOrchestratorRunRecord>()
  const runMessages = new Map<string, Array<{ seq: number; envelope: string }>>()
  const tools = new Map<string, unknown>()
  return {
    profiles,
    runs,
    runMessages,
    tools,
    resolveOmpExecutable: vi.fn(async (): Promise<string | null> => '/mock/bin/omp'),
    resolveCodexAcpExecutable: vi.fn(async (): Promise<string | null> => null),
    resolveCodexExecutable: vi.fn(async (): Promise<string | null> => null),
    resolveClaudeAcpExecutable: vi.fn(async (): Promise<string | null> => null),
    resolveClaudeExecutable: vi.fn(async (): Promise<string | null> => null),
    activeMcpServer: null as { url: string; token: string } | null,
    gatewayMode: 'review' as 'review' | 'full',
    requestConfirmation: vi.fn(async () => ({ approved: true, remember: false })),
    piExecute: vi.fn(),
    piStop: vi.fn(async () => undefined),
    piCancel: vi.fn(() => false),
    piIsRunActive: vi.fn(() => false),
    sealRunRecord: vi.fn(async (runId: string, seq: number, record: unknown) =>
      JSON.stringify({ runId, seq, record })
    ),
    appendOrchestratorEvent: vi.fn(
      async (
        _runId: string,
        _type: string,
        _payload?: Record<string, unknown>,
        _level?: 'debug' | 'error' | 'info' | 'warn'
      ) => undefined
    ),
    appendRunMessage: vi.fn(async (runId: string, envelope: string) => {
      const list = runMessages.get(runId) ?? []
      const seq = list.length + 1
      list.push({ seq, envelope })
      runMessages.set(runId, list)
      return seq
    }),
    listRunMessages: vi.fn(async (runId: string) => runMessages.get(runId) ?? []),
    deleteRunMessages: vi.fn(async (runId: string) => {
      runMessages.delete(runId)
    }),
    truncateRunMessages: vi.fn(async (runId: string, keepCount: number) => {
      const list = runMessages.get(runId) ?? []
      runMessages.set(runId, list.slice(0, keepCount))
    })
  }
})

vi.mock('electron', () => ({
  app: {
    isReady: vi.fn(() => true),
    getPath: vi.fn(() => '/tmp/tuff-omp-orchestrator-test'),
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
  utilityProcess: { fork: vi.fn() }
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

vi.mock('../../utils/logger', () => ({
  formatDuration: (ms: number) => `${ms}ms`,
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
    child: () => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      success: vi.fn()
    })
  })
}))

vi.mock('../../utils/i18n-helper', () => ({ t: (key: string) => key }))

vi.mock('../sentry/sentry-service', () => ({
  SentryServiceModule: class {},
  getSentryService: vi.fn(() => ({
    isTelemetryEnabled: vi.fn(() => false),
    isEnabled: vi.fn(() => false),
    queueNexusTelemetry: vi.fn()
  })),
  setSentryServiceInstance: vi.fn()
}))

vi.mock('../mcp-host', () => ({
  mcpHostModule: {
    getActiveServerConfig: () => mocks.activeMcpServer
  }
}))

vi.mock('../tool-gateway', () => ({
  toolGatewayModule: {
    getGatewayState: () => ({ enabled: true, mode: mocks.gatewayMode, ready: true, tools: [] }),
    requestConfirmation: mocks.requestConfirmation
  }
}))

vi.mock('./agents', () => ({
  agentManager: { getAgent: vi.fn() },
  toolRegistry: {
    hasTool: vi.fn((toolId: string) => mocks.tools.has(toolId)),
    registerTool: vi.fn((tool: { id: string }, handler: unknown) => {
      mocks.tools.set(tool.id, handler)
    })
  }
}))

vi.mock('./ai-orchestrator-store', () => ({
  DEFAULT_PROFILE_ID: 'default-pi',
  aiOrchestratorStore: {
    initialize: vi.fn(async () => undefined),
    getProfile: vi.fn(async (profileId: string) => mocks.profiles.get(profileId) ?? null),
    getAutomation: vi.fn(async () => null),
    createOrchestratorRun: vi.fn(async (run: AiOrchestratorRunRecord) => {
      mocks.runs.set(run.id, { ...run })
    }),
    getOrchestratorRun: vi.fn(async (runId: string) => mocks.runs.get(runId) ?? null),
    updateOrchestratorRun: vi.fn(
      async (runId: string, update: Partial<AiOrchestratorRunRecord>) => {
        const current = mocks.runs.get(runId)
        if (!current) throw new Error(`Unknown run ${runId}`)
        const next = { ...current, ...update, updatedAt: Date.now() }
        mocks.runs.set(runId, next)
        return next
      }
    ),
    appendOrchestratorEvent: mocks.appendOrchestratorEvent,
    appendRunMessage: mocks.appendRunMessage,
    listRunMessages: mocks.listRunMessages,
    deleteRunMessages: mocks.deleteRunMessages,
    truncateRunMessages: mocks.truncateRunMessages,
    listSessionHistory: vi.fn(async () => []),
    listOrchestratorRuns: vi.fn(async (options?: { status?: string }) =>
      Array.from(mocks.runs.values()).filter(
        (run) => !options?.status || run.status === options.status
      )
    )
  }
}))

vi.mock('./ai-automation-scheduler', () => ({
  aiAutomationScheduler: {
    setExecutor: vi.fn(),
    initialize: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined)
  }
}))

vi.mock('./ai-cli-import-service', () => ({
  aiCliImportService: { preview: vi.fn(), apply: vi.fn() }
}))

vi.mock('./ai-imported-config-runtime', () => ({
  aiImportedConfigRuntime: {
    initialize: vi.fn(async () => undefined),
    buildSystemPrompt: vi.fn(async () => ''),
    assertAgentProfileVisible: vi.fn(async () => undefined)
  }
}))

vi.mock('./ai-run-input-vault', () => ({
  saveRunInput: vi.fn(async () => true),
  loadRunInput: vi.fn(async () => null),
  discardRunInput: vi.fn(async () => undefined)
}))

vi.mock('./ai-run-record-seal', () => ({
  sealRunRecord: mocks.sealRunRecord,
  openRunRecords: vi.fn(async () => null)
}))

vi.mock('./providers/pi-cli-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./providers/pi-cli-runtime')>()
  return {
    ...actual,
    resolveOmpExecutable: mocks.resolveOmpExecutable,
    resolveCodexAcpExecutable: mocks.resolveCodexAcpExecutable,
    resolveCodexExecutable: mocks.resolveCodexExecutable,
    resolveClaudeAcpExecutable: mocks.resolveClaudeAcpExecutable,
    resolveClaudeExecutable: mocks.resolveClaudeExecutable
  }
})

vi.mock('./pi-agent-runtime-host', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pi-agent-runtime-host')>()
  return {
    ...actual,
    PiAgentRuntimeHost: class {
      start = vi.fn(async () => undefined)
      stop = mocks.piStop
      isReady = vi.fn(() => true)
      isRunActive = mocks.piIsRunActive
      execute = mocks.piExecute
      cancel = mocks.piCancel
    },
    resolvePiRuntimeToolSpecs: vi.fn(() => [])
  }
})

import { AiCliOrchestrator } from './ai-cli-orchestrator'
import { setAutoResumeOnStartupReader } from './auto-resume-setting'
import {
  CLAUDE_CLI_PROFILE_ID,
  CODEX_CLI_PROFILE_ID,
  OMP_CLI_PROFILE_ID,
  OMP_CLI_PROVIDER_ID
} from './providers/pi-cli-runtime'

const AUTHORITY_VERSION = 1_700_000_000_000

function makeProfile(id: string, overrides?: Partial<AiAgentProfile>): AiAgentProfile {
  return {
    id,
    name: id,
    description: `Profile ${id}`,
    runtimeProvider: 'pi-core',
    enabled: true,
    systemPrompt: `System prompt for ${id}`,
    modelPreference: id === OMP_CLI_PROFILE_ID ? [OMP_CLI_PROVIDER_ID] : ['cpa/gemini-3.8-flash'],
    allowedToolIds: ['file.read'],
    enabledSkillIds: [],
    permissionPolicy: { mode: 'manual', allowedPermissions: [] },
    timeoutMs: 30_000,
    createdAt: AUTHORITY_VERSION,
    updatedAt: AUTHORITY_VERSION,
    ...overrides
  }
}

function profileAuthorityDigest(profile: AiAgentProfile): string {
  return createHash('sha256')
    .update(
      structuredStrictStringify({
        id: profile.id,
        runtimeProvider: profile.runtimeProvider,
        enabled: profile.enabled,
        allowedToolIds: profile.allowedToolIds,
        enabledSkillIds: profile.enabledSkillIds,
        permissionPolicy: profile.permissionPolicy,
        timeoutMs: profile.timeoutMs,
        updatedAt: profile.updatedAt
      })
    )
    .digest('hex')
}

function opaqueRef(namespace: 'pi-call' | 'pi-tool', value: string): string {
  return `${namespace}:${createHash('sha256')
    .update(`${namespace}\0${value}`)
    .digest('hex')
    .slice(0, 32)}`
}

describe('AiCliOrchestrator OMP ACP runtime wiring', () => {
  let orchestrator: AiCliOrchestrator
  let capturedMcpServers: AcpMcpServerConfig[] | undefined
  let capturedOnRequest:
    | ((method: string, params: unknown) => Promise<AcpPermissionRequestResult>)
    | undefined
  let promptStreamImpl: (
    prompt: unknown,
    options?: { signal?: AbortSignal }
  ) => AsyncIterable<OmpStreamEvent>
  let sessionCloseSpy: ReturnType<typeof vi.fn>
  let sessionCancelSpy: ReturnType<typeof vi.fn>
  let clientCloseSpy: ReturnType<typeof vi.fn>
  let spawnSpy: MockInstance

  beforeEach(async () => {
    mocks.profiles.clear()
    mocks.runs.clear()
    mocks.runMessages.clear()
    mocks.tools.clear()
    mocks.activeMcpServer = null
    mocks.gatewayMode = 'review'
    mocks.resolveOmpExecutable.mockReset().mockResolvedValue('/mock/bin/omp')
    mocks.resolveCodexAcpExecutable.mockReset().mockResolvedValue(null)
    mocks.resolveCodexExecutable.mockReset().mockResolvedValue(null)
    mocks.resolveClaudeAcpExecutable.mockReset().mockResolvedValue(null)
    mocks.resolveClaudeExecutable.mockReset().mockResolvedValue(null)
    mocks.requestConfirmation.mockReset().mockResolvedValue({ approved: true, remember: false })
    mocks.piExecute.mockReset().mockImplementation(async (payload: PiRuntimeStartPayload) => ({
      runId: payload.run.id,
      output: 'pi-output',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
    }))
    mocks.piStop.mockReset().mockResolvedValue(undefined)
    mocks.piCancel.mockReset().mockReturnValue(false)
    mocks.piIsRunActive.mockReset().mockReturnValue(false)
    mocks.sealRunRecord.mockClear()
    mocks.appendOrchestratorEvent.mockClear()
    mocks.appendRunMessage.mockClear()
    mocks.listRunMessages.mockClear()
    mocks.deleteRunMessages.mockClear()

    capturedMcpServers = undefined
    capturedOnRequest = undefined
    sessionCloseSpy = vi.fn(async () => undefined)
    sessionCancelSpy = vi.fn(async () => undefined)
    clientCloseSpy = vi.fn(async () => undefined)

    promptStreamImpl = async function* () {
      yield { type: 'thinking', text: 'omp-thinking-secret' }
      yield {
        type: 'tool_call',
        toolCall: {
          toolCallId: 'call-omp-1',
          toolName: 'file.read',
          args: { path: '/Users/me/secret.env' }
        }
      }
      yield {
        type: 'tool_result',
        toolCall: { toolCallId: 'call-omp-1', toolName: 'file.read', result: 'ok', isError: false }
      }
      yield { type: 'delta', text: 'omp-answer' }
      yield {
        type: 'usage',
        usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 }
      }
    }

    spawnSpy = vi.spyOn(OmpAcpClient, 'spawn').mockImplementation(async (options) => {
      capturedOnRequest = options?.onRequest as
        | ((method: string, params: unknown) => Promise<AcpPermissionRequestResult>)
        | undefined
      return {
        agentInfo: { name: 'omp', version: '18.14.2' },
        isClosed: vi.fn(() => false),
        on: vi.fn(),
        close: clientCloseSpy,
        createSession: vi.fn(async (sessionOptions) => {
          capturedMcpServers = sessionOptions?.mcpServers
          return {
            sessionId: 'omp-session-1',
            promptStream: (prompt: unknown, streamOptions?: { signal?: AbortSignal }) =>
              promptStreamImpl(prompt, streamOptions),
            cancel: sessionCancelSpy,
            close: sessionCloseSpy
          }
        })
      } as unknown as OmpAcpClient
    })

    mocks.profiles.set('default-pi', makeProfile('default-pi'))
    mocks.profiles.set(OMP_CLI_PROFILE_ID, makeProfile(OMP_CLI_PROFILE_ID))
    mocks.profiles.set(CODEX_CLI_PROFILE_ID, makeProfile(CODEX_CLI_PROFILE_ID))
    mocks.profiles.set(CLAUDE_CLI_PROFILE_ID, makeProfile(CLAUDE_CLI_PROFILE_ID))
    mocks.profiles.set(
      'custom-omp-model-profile',
      makeProfile('custom-omp-model-profile', {
        modelPreference: [OMP_CLI_PROVIDER_ID, 'cpa/gemini-3.8-flash']
      })
    )

    orchestrator = new AiCliOrchestrator()
    await orchestrator.initialize()
  })

  afterEach(async () => {
    setAutoResumeOnStartupReader(null)
    await orchestrator.shutdown().catch(() => undefined)
    vi.restoreAllMocks()
  })

  describe('scheduler-decides-executor runtime invariant', () => {
    it('routes ONLY profile:cli:omp to OmpAgentRuntimeHost and never touches PiAgentRuntimeHost', async () => {
      const run = await orchestrator.execute({
        objective: 'Analyze repo',
        profileId: OMP_CLI_PROFILE_ID
      })

      expect(run.status).toBe('completed')
      expect(run.output).toBe('omp-answer')
      expect(run.usage).toMatchObject({ promptTokens: 12, completionTokens: 8, totalTokens: 20 })
      expect(spawnSpy).toHaveBeenCalledTimes(1)
      expect(mocks.piExecute).not.toHaveBeenCalled()

      // Sealed PiRuntimeRunRecord written to run message log for non-workspace OMP runs
      expect(mocks.sealRunRecord).toHaveBeenCalledTimes(1)
      expect(mocks.sealRunRecord).toHaveBeenCalledWith(
        run.id,
        1,
        expect.objectContaining({
          message: expect.objectContaining({ role: 'assistant', stopReason: 'stop' }),
          modelSteps: 1,
          toolCalls: 1
        })
      )
    })

    it.each([
      ['default-pi (Tuff scheduler)', 'default-pi'],
      ['no profileId (defaults to Tuff scheduler)', undefined],
      ['custom profile with omp model preference', 'custom-omp-model-profile']
    ])(
      'never routes %s to OmpAgentRuntimeHost even when handed an omp-sourced model',
      async (_label, profileId) => {
        const run = await orchestrator.executeWorkspace(
          {
            objective: 'Use omp model under non-omp scheduler',
            profileId
          },
          {
            conversationId: `conv-${profileId ?? 'default'}`,
            turnId: 'turn-1',
            projectId: null,
            providerId: OMP_CLI_PROVIDER_ID,
            model: 'cpa/gemini-3.8-flash',
            history: [],
            assertAuthority: async () => undefined
          }
        )

        expect(run.status).toBe('completed')
        expect(run.output).toBe('pi-output')
        expect(mocks.piExecute).toHaveBeenCalledTimes(1)
        expect(spawnSpy).not.toHaveBeenCalled()
      }
    )

    it.each([
      ['profile:cli:codex', CODEX_CLI_PROFILE_ID, 'CODEX_CLI_NOT_FOUND'],
      ['profile:cli:claude', CLAUDE_CLI_PROFILE_ID, 'CLAUDE_CLI_NOT_FOUND']
    ])(
      'never spawns OMP for %s even when handed an omp-sourced model (fails on its own missing binary)',
      async (_label, profileId, expectedDetail) => {
        const onRunResult = vi.fn(async () => undefined)
        const run = await orchestrator.executeWorkspace(
          {
            objective: 'Use omp model under another CLI scheduler',
            profileId
          },
          {
            conversationId: `conv-${profileId}`,
            turnId: 'turn-1',
            projectId: null,
            providerId: OMP_CLI_PROVIDER_ID,
            model: 'cpa/gemini-3.8-flash',
            history: [],
            assertAuthority: async () => undefined,
            onRunResult
          }
        )

        expect(run.status).toBe('failed')
        expect(onRunResult).toHaveBeenCalledWith(
          expect.objectContaining({ id: run.id, status: 'failed' }),
          expect.stringContaining(expectedDetail)
        )
        expect(spawnSpy).not.toHaveBeenCalled()
        expect(mocks.piExecute).not.toHaveBeenCalled()
      }
    )
  })

  it('projects OMP events safely to observers, workspace authority, and redacted orchestrator events', async () => {
    const workspaceEvents: PiRuntimeRunEvent[] = []
    const onRunCreated = vi.fn(async () => undefined)
    const onRunResult = vi.fn(async () => undefined)

    const run = await orchestrator.executeWorkspace(
      {
        objective: 'Inspect workspace',
        profileId: OMP_CLI_PROFILE_ID
      },
      {
        conversationId: 'conv-omp-ws',
        turnId: 'turn-omp-ws',
        projectId: null,
        providerId: OMP_CLI_PROVIDER_ID,
        model: 'cpa/gemini-3.8-flash',
        history: [],
        assertAuthority: async () => undefined,
        onRunCreated,
        onRunResult,
        onEvent: async (ev) => {
          workspaceEvents.push(ev)
        }
      }
    )

    expect(run.status).toBe('completed')
    expect(onRunCreated).toHaveBeenCalledTimes(1)
    expect(onRunResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: run.id, status: 'completed' }),
      undefined
    )
    expect(workspaceEvents.map((ev) => ev.type)).toEqual([
      'provider_response',
      'reasoning',
      'tool_execution_start',
      'tool_execution_end',
      'text',
      'message_end',
      'provider_response'
    ])
    // Workspace runs never persist run message logs
    expect(mocks.sealRunRecord).not.toHaveBeenCalled()

    // Persisted orchestrator events carry only safe projections (zero raw text, args, or paths)
    const persistedForRun = mocks.appendOrchestratorEvent.mock.calls.filter(([id]) => id === run.id)
    const serialized = JSON.stringify(persistedForRun)
    expect(serialized).not.toContain('omp-thinking-secret')
    expect(serialized).not.toContain('omp-answer')
    expect(serialized).not.toContain('/Users/me/secret.env')
    expect(serialized).not.toContain('call-omp-1')
    expect(serialized).toContain(opaqueRef('pi-call', 'call-omp-1'))
    expect(serialized).toContain(opaqueRef('pi-tool', 'file.read'))
  })

  it('streams profile:cli:omp runs through streamAgentCapability with ruff/omp stream parity', async () => {
    const events = []
    for await (const event of orchestrator.streamAgentCapability(
      { task: 'Stream via OMP' },
      { metadata: { profileId: OMP_CLI_PROFILE_ID } }
    )) {
      events.push(event)
    }

    expect(events.map((ev) => ev.type)).toEqual([
      'start',
      'part',
      'part',
      'part',
      'part',
      'delta',
      'end'
    ])
    expect(events.at(-1)).toMatchObject({
      type: 'end',
      provider: 'tuff-omp-runtime',
      model: 'omp-acp',
      content: 'omp-answer'
    })
  })

  it('bridges active Tuff MCP host server and shared toolGateway confirmation gate for OMP runs', async () => {
    mocks.activeMcpServer = { url: 'http://127.0.0.1:44221/mcp', token: 'tok-mcp-secret' }

    let releasePrompt: (() => void) | undefined
    promptStreamImpl = async function* () {
      await new Promise<void>((resolve) => {
        releasePrompt = resolve
      })
      yield { type: 'delta', text: 'done' }
    }

    const runPromise = orchestrator.execute({
      objective: 'Run with MCP and approval',
      profileId: OMP_CLI_PROFILE_ID
    })

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(capturedMcpServers).toEqual([
      {
        name: 'tuff-host',
        type: 'http',
        url: 'http://127.0.0.1:44221/mcp',
        headers: [{ name: 'Authorization', value: 'Bearer tok-mcp-secret' }]
      }
    ])

    // Review mode -> asks toolGatewayModule.requestConfirmation
    const permParams: AcpPermissionRequestParams = {
      sessionId: 'omp-session-1',
      toolCall: { toolCallId: 'c-perm', title: 'bash', kind: 'execute', rawInput: { cmd: 'ls' } },
      options: [
        { optionId: 'opt-allow', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'opt-reject', name: 'Reject', kind: 'reject_once' }
      ]
    }
    mocks.requestConfirmation.mockResolvedValueOnce({ approved: true, remember: false })
    await expect(capturedOnRequest!('session/request_permission', permParams)).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'opt-allow' }
    })
    expect(mocks.requestConfirmation).toHaveBeenCalledTimes(1)

    // Denied -> selects reject_once
    mocks.requestConfirmation.mockResolvedValueOnce({ approved: false, remember: false })
    await expect(capturedOnRequest!('session/request_permission', permParams)).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'opt-reject' }
    })

    // Unavailable confirmation surface -> fails closed
    mocks.requestConfirmation.mockRejectedValueOnce(new Error('Confirmation surface unmounted'))
    await expect(capturedOnRequest!('session/request_permission', permParams)).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'opt-reject' }
    })

    // Full mode -> auto-approves without prompting
    mocks.gatewayMode = 'full'
    await expect(capturedOnRequest!('session/request_permission', permParams)).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'opt-allow' }
    })
    expect(mocks.requestConfirmation).toHaveBeenCalledTimes(3)

    releasePrompt?.()
    await expect(runPromise).resolves.toMatchObject({ status: 'completed', output: 'done' })
  })

  it('fails closed cleanly when omp binary is missing and releases all leases and observers', async () => {
    mocks.resolveOmpExecutable.mockResolvedValue(null)
    const onRunResult = vi.fn(async () => undefined)

    const run = await orchestrator.executeWorkspace(
      {
        objective: 'Attempt OMP without binary',
        profileId: OMP_CLI_PROFILE_ID
      },
      {
        conversationId: 'conv-missing-omp',
        turnId: 'turn-missing-omp',
        projectId: null,
        history: [],
        assertAuthority: async () => undefined,
        onRunResult
      }
    )

    expect(run.status).toBe('failed')
    expect(run.error).toBe('AI_RUN_FAILED: AI run failed.')
    expect(onRunResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: run.id, status: 'failed' }),
      expect.stringContaining('OMP_CLI_NOT_FOUND')
    )
    expect(spawnSpy).not.toHaveBeenCalled()
    expect(orchestrator.isPrivacyRunProtected(run.id)).toBe(false)
  })

  it('protects active OMP runs from privacy deletion, cancels cleanly, and drains on shutdown()', async () => {
    promptStreamImpl = async function* (_prompt, options) {
      await new Promise<void>((resolve) => {
        options?.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    }

    const runPromise = orchestrator.execute({
      objective: 'Long running OMP turn',
      profileId: OMP_CLI_PROFILE_ID
    })

    await new Promise((resolve) => setTimeout(resolve, 20))
    const activeRun = Array.from(mocks.runs.values())[0]!
    expect(orchestrator.isPrivacyRunProtected(activeRun.id)).toBe(true)
    expect(orchestrator.cancel(activeRun.id)).toBe(true)

    const cancelledRun = await runPromise
    expect(cancelledRun.status).toBe('cancelled')
    expect(cancelledRun.error).toBe('AI_RUN_CANCELLED: AI run was cancelled.')
    expect(orchestrator.isPrivacyRunProtected(activeRun.id)).toBe(false)
    expect(sessionCancelSpy).toHaveBeenCalled()
    expect(sessionCloseSpy).toHaveBeenCalled()

    // Now test shutdown() draining an active OMP run with zero leaked processes
    const shutdownRunPromise = orchestrator.execute({
      objective: 'OMP turn interrupted by shutdown',
      profileId: OMP_CLI_PROFILE_ID
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    await orchestrator.shutdown()

    const interruptedRun = await shutdownRunPromise
    expect(interruptedRun.status).toBe('interrupted')
    expect(clientCloseSpy).toHaveBeenCalled()
  })

  it('auto-resumes running and queued OMP runs once with crash-loop cap and respects autoResumeOnStartup=false', async () => {
    await orchestrator.shutdown()
    const ompProfile = makeProfile(OMP_CLI_PROFILE_ID)
    const baseMetadata = {
      schemaVersion: 1,
      executionBudget: { maxSteps: 10, maxChildRuns: 0, maxConcurrency: 1 },
      allowedToolRefs: [opaqueRef('pi-tool', 'file.read')],
      requestInputPresent: false,
      profileAuthorityVersion: ompProfile.updatedAt,
      profileAuthorityDigest: profileAuthorityDigest(ompProfile)
    }

    const promptsSeen: string[] = []
    promptStreamImpl = async function* (prompt) {
      promptsSeen.push(typeof prompt === 'string' ? prompt : JSON.stringify(prompt))
      yield { type: 'delta', text: 'omp-answer' }
      yield {
        type: 'usage',
        usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 }
      }
    }

    mocks.runs.set('omp-running-before-crash', {
      id: 'omp-running-before-crash',
      sessionId: 'sess-crash-1',
      objective: 'Already started OMP run',
      profileId: OMP_CLI_PROFILE_ID,
      runtimeProvider: 'pi-core',
      cwd: '/tmp',
      status: 'running',
      metadata: baseMetadata,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    mocks.runs.set('omp-queued-before-crash', {
      id: 'omp-queued-before-crash',
      sessionId: 'sess-crash-2',
      objective: 'Queued OMP run',
      profileId: OMP_CLI_PROFILE_ID,
      runtimeProvider: 'pi-core',
      cwd: '/tmp',
      status: 'queued',
      metadata: baseMetadata,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    mocks.runs.set('omp-crash-loop-capped', {
      id: 'omp-crash-loop-capped',
      sessionId: 'sess-crash-3',
      objective: 'Already recovered once',
      profileId: OMP_CLI_PROFILE_ID,
      runtimeProvider: 'pi-core',
      cwd: '/tmp',
      status: 'running',
      metadata: { ...baseMetadata, recoveryAttempts: 1 },
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    const restarted = new AiCliOrchestrator()
    await restarted.initialize()
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (
        mocks.runs.get('omp-running-before-crash')?.status === 'completed' &&
        mocks.runs.get('omp-queued-before-crash')?.status === 'completed'
      ) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    await restarted.shutdown()

    // Both running and queued OMP runs auto-resumed with recoveryAttempts persisted as 1
    expect(mocks.runs.get('omp-running-before-crash')?.status).toBe('completed')
    expect(mocks.runs.get('omp-running-before-crash')?.output).toBe('omp-answer')
    expect(mocks.runs.get('omp-running-before-crash')?.metadata?.recoveryAttempts).toBe(1)
    expect(mocks.runs.get('omp-queued-before-crash')?.status).toBe('completed')
    expect(mocks.runs.get('omp-queued-before-crash')?.metadata?.recoveryAttempts).toBe(1)
    expect(promptsSeen.some((p) => p.includes('[Recovery Notice]'))).toBe(true)

    // Crash-loop cap stops runs that already had recoveryAttempts >= 1
    expect(mocks.runs.get('omp-crash-loop-capped')?.status).toBe('interrupted')
    expect(mocks.appendOrchestratorEvent).toHaveBeenCalledWith(
      'omp-crash-loop-capped',
      'run.interrupted',
      expect.objectContaining({ reason: 'recovery_limit_reached', recoveryAttempt: 1 })
    )
    expect(mocks.piExecute).not.toHaveBeenCalled()
    expect(mocks.listRunMessages).not.toHaveBeenCalled()

    // When autoResumeOnStartup is false, all persisted queued/running OMP runs are interrupted cleanly
    setAutoResumeOnStartupReader(() => false)
    mocks.runs.set('omp-disabled-1', {
      id: 'omp-disabled-1',
      sessionId: 'sess-disabled-1',
      objective: 'Should not auto-resume',
      profileId: OMP_CLI_PROFILE_ID,
      runtimeProvider: 'pi-core',
      cwd: '/tmp',
      status: 'running',
      metadata: baseMetadata,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    const disabledBoot = new AiCliOrchestrator()
    await disabledBoot.initialize()
    await disabledBoot.shutdown()

    expect(mocks.runs.get('omp-disabled-1')?.status).toBe('interrupted')
    expect(mocks.appendOrchestratorEvent).toHaveBeenCalledWith(
      'omp-disabled-1',
      'run.interrupted',
      expect.objectContaining({ reason: 'auto_resume_disabled', previousStatus: 'running' })
    )
  })
})
