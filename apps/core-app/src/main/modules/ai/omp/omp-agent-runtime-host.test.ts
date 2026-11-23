import type {
  PiRuntimeRunEvent,
  PiRuntimeRunRecord,
  PiRuntimeStartPayload
} from '../pi-agent-runtime-protocol'
import type { AcpPermissionRequestParams, OmpStreamEvent } from '@talex-touch/tuff-intelligence'
import type { Mock } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OmpAcpClient } from '@talex-touch/tuff-intelligence'
import {
  isRunCancelledControlError,
  isRunInterruptedControlError,
  readRunFailureDetail
} from '../pi-agent-runtime-control-error'
import { resolveOmpExecutable } from '../providers/pi-cli-runtime'
import { OmpAgentRuntimeHost } from './omp-agent-runtime-host'

vi.mock('../providers/pi-cli-runtime', () => ({
  resolveOmpExecutable: vi.fn(async () => '/mock/bin/omp')
}))

function createPayload(overrides?: Partial<PiRuntimeStartPayload>): PiRuntimeStartPayload {
  const now = Date.now()
  return {
    run: {
      id: 'run-999',
      sessionId: 'session-1',
      objective: 'Count to 3',
      profileId: 'profile:cli:omp',
      runtimeProvider: 'pi-core',
      cwd: '/tmp',
      status: 'running',
      metadata: {},
      createdAt: now,
      updatedAt: now
    },
    request: {
      objective: 'Count to 3',
      cwd: '/tmp'
    },
    profile: {
      id: 'profile:cli:omp',
      name: 'OMP',
      description: 'Local OMP CLI agent',
      runtimeProvider: 'pi-core',
      enabled: true,
      modelPreference: ['cpa/gemini-3.8-flash'],
      allowedToolIds: [],
      enabledSkillIds: [],
      permissionPolicy: { mode: 'manual', allowedPermissions: [] },
      timeoutMs: 30_000,
      createdAt: now,
      updatedAt: now
    },
    tools: [],
    history: [],
    budget: {
      maxSteps: 10,
      maxToolCalls: 10,
      maxChildRuns: 0,
      maxConcurrency: 1
    },
    ...overrides
  }
}

describe('ompAgentRuntimeHost', () => {
  let mockSession: {
    sessionId: string
    promptStream: Mock
    cancel: Mock
    close: Mock
  }

  let mockClient: {
    agentInfo: { name: string; version: string }
    createSession: Mock
    close: Mock
    isClosed: Mock
    on: Mock
    emitClose: () => void
  }

  let capturedOnRequest: ((method: string, params: unknown) => Promise<unknown>) | undefined

  beforeEach(() => {
    vi.mocked(resolveOmpExecutable).mockResolvedValue('/mock/bin/omp')
    capturedOnRequest = undefined
    const closeListeners: Array<() => void> = []

    mockSession = {
      sessionId: 'test-session-123',
      promptStream: vi.fn(async function* (): AsyncIterable<OmpStreamEvent> {
        yield { type: 'thinking', text: 'analyzing request' }
        yield { type: 'delta', text: 'Hello from OMP runtime!' }
        yield {
          type: 'usage',
          usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 }
        }
      }),
      cancel: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined)
    }

    mockClient = {
      agentInfo: { name: 'omp', version: '18.14.2' },
      createSession: vi.fn(async () => mockSession),
      close: vi.fn(async () => undefined),
      isClosed: vi.fn(() => false),
      on: vi.fn((event: string, listener: () => void) => {
        if (event === 'close') closeListeners.push(listener)
        return mockClient
      }),
      emitClose: () => {
        mockClient.isClosed.mockReturnValue(true)
        for (const listener of closeListeners) listener()
      }
    }

    vi.spyOn(OmpAcpClient, 'spawn').mockImplementation(async (options) => {
      capturedOnRequest = options?.onRequest as
        | ((method: string, params: unknown) => Promise<unknown>)
        | undefined
      return mockClient as unknown as OmpAcpClient
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes and manages runtime lifecycle correctly', async () => {
    const host = new OmpAgentRuntimeHost()
    expect(host.isReady()).toBe(false)

    await host.start()
    expect(host.isReady()).toBe(true)

    await host.stop()
    expect(host.isReady()).toBe(false)
    expect(mockClient.close).toHaveBeenCalled()
  })

  it('executes a run, projects streaming/tool events, and emits a valid PiRuntimeRunRecord', async () => {
    const recordedEvents: PiRuntimeRunEvent[] = []
    const recordedRecords: PiRuntimeRunRecord[] = []

    mockSession.promptStream.mockImplementationOnce(
      async function* (): AsyncIterable<OmpStreamEvent> {
        yield { type: 'thinking', text: 'analyzing request' }
        yield {
          type: 'tool_call',
          toolCall: { toolCallId: 'tc-1', toolName: 'file.read', args: { path: 'a.txt' } }
        }
        yield {
          type: 'tool_result',
          toolCall: {
            toolCallId: 'tc-1',
            toolName: 'file.read',
            result: 'file contents',
            isError: false
          }
        }
        yield { type: 'delta', text: 'Hello from OMP runtime!' }
        yield {
          type: 'usage',
          usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cost: { total: 0.002 } }
        }
      }
    )

    const host = new OmpAgentRuntimeHost({
      onEvent: async (ev) => {
        recordedEvents.push(ev)
      },
      onRecord: async (_runId, record) => {
        recordedRecords.push(record)
      }
    })

    const result = await host.execute(createPayload())

    expect(result.runId).toBe('run-999')
    expect(result.output).toBe('Hello from OMP runtime!')
    expect(result.usage).toMatchObject({
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      cost: 0.002
    })

    expect(recordedEvents).toHaveLength(4)
    expect(recordedEvents[0]).toMatchObject({
      runId: 'run-999',
      type: 'reasoning',
      payload: { delta: 'analyzing request' }
    })
    expect(recordedEvents[1]).toMatchObject({
      runId: 'run-999',
      type: 'tool_execution_start',
      payload: { toolCallId: 'tc-1', toolName: 'file.read', args: { path: 'a.txt' } }
    })
    expect(recordedEvents[2]).toMatchObject({
      runId: 'run-999',
      type: 'tool_execution_end',
      payload: {
        toolCallId: 'tc-1',
        toolName: 'file.read',
        result: { content: [{ type: 'text', text: 'file contents' }] },
        isError: false
      }
    })
    expect(recordedEvents[3]).toMatchObject({
      runId: 'run-999',
      type: 'text',
      payload: { delta: 'Hello from OMP runtime!' }
    })

    expect(recordedRecords).toHaveLength(1)
    expect(recordedRecords[0]).toMatchObject({
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello from OMP runtime!' }],
        stopReason: 'stop'
      },
      modelSteps: 1,
      toolCalls: 1,
      costKnown: true
    })
    expect(mockSession.close).toHaveBeenCalled()
  })

  it('skips omp-cli provider sentinel in modelPreference, forwards MCP servers, and emits workspace lifecycle events', async () => {
    const recordedEvents: PiRuntimeRunEvent[] = []
    const assertAuthority = vi.fn(async () => undefined)
    const resolveMcpServers = vi.fn(async () => [
      {
        name: 'tuff-host',
        type: 'http' as const,
        url: 'http://127.0.0.1:43123/mcp',
        headers: [{ name: 'Authorization', value: 'Bearer secret' }]
      }
    ])

    const host = new OmpAgentRuntimeHost({
      onEvent: async (ev) => {
        recordedEvents.push(ev)
      },
      resolveMcpServers
    })

    const payload = createPayload({
      profile: {
        ...createPayload().profile,
        modelPreference: ['omp-cli']
      }
    })

    await host.execute(payload, {
      conversationId: 'conv-1',
      turnId: 'turn-1',
      projectId: null,
      history: [],
      assertAuthority
    })

    expect(assertAuthority).toHaveBeenCalledTimes(1)
    expect(mockClient.createSession).toHaveBeenCalledWith({
      cwd: '/tmp',
      mcpServers: [
        {
          name: 'tuff-host',
          type: 'http',
          url: 'http://127.0.0.1:43123/mcp',
          headers: [{ name: 'Authorization', value: 'Bearer secret' }]
        }
      ]
    })
    expect(recordedEvents.map((event) => event.type)).toEqual([
      'provider_response',
      'reasoning',
      'text',
      'message_end',
      'provider_response'
    ])
    expect(recordedEvents[0]?.payload).toMatchObject({
      provider: 'omp-cli',
      model: 'omp-acp',
      usageReported: false
    })
    expect(recordedEvents[4]?.payload).toMatchObject({
      provider: 'omp-cli',
      usageReported: true,
      usage: expect.objectContaining({ totalTokens: 120 })
    })
  })

  it('fails closed with redacted OMP_CLI_NOT_FOUND detail when omp executable is missing', async () => {
    vi.mocked(resolveOmpExecutable).mockResolvedValue(null)
    const host = new OmpAgentRuntimeHost()

    await expect(host.start()).rejects.toThrow('OMP_CLI_NOT_FOUND')

    let caught: unknown
    try {
      await host.execute(createPayload())
    } catch (error) {
      caught = error
    }
    expect(readRunFailureDetail(caught)).toContain('OMP_CLI_NOT_FOUND')
    expect(OmpAcpClient.spawn).not.toHaveBeenCalled()
    expect(host.isReady()).toBe(false)
    expect(host.isRunActive('run-999')).toBe(false)
  })

  it('routes session/request_permission to onPermissionRequest and fails closed without one', async () => {
    const onPermissionRequest = vi.fn(async () => ({
      outcome: { outcome: 'selected' as const, optionId: 'allow_once_id' }
    }))

    let releasePrompt: (() => void) | undefined
    mockSession.promptStream.mockImplementationOnce(
      async function* (): AsyncIterable<OmpStreamEvent> {
        await new Promise<void>((resolve) => {
          releasePrompt = resolve
        })
        yield { type: 'delta', text: 'permitted' }
      }
    )

    const host = new OmpAgentRuntimeHost({ onPermissionRequest })
    const runPromise = host.execute(createPayload())

    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(capturedOnRequest).toBeTypeOf('function')

    const permissionParams: AcpPermissionRequestParams = {
      sessionId: 'test-session-123',
      toolCall: { toolCallId: 'tc-perm', title: 'bash', kind: 'execute' },
      options: [{ optionId: 'allow_once_id', name: 'Allow once', kind: 'allow_once' }]
    }
    const decision = await capturedOnRequest!('session/request_permission', permissionParams)
    expect(decision).toEqual({ outcome: { outcome: 'selected', optionId: 'allow_once_id' } })
    expect(onPermissionRequest).toHaveBeenCalledTimes(1)

    releasePrompt?.()
    await expect(runPromise).resolves.toMatchObject({ output: 'permitted' })
  })

  it('settles cancelled runs with branded cancelled control error and closes session', async () => {
    mockSession.promptStream.mockImplementationOnce(async function* (
      _prompt: unknown,
      options?: { signal?: AbortSignal }
    ): AsyncIterable<OmpStreamEvent> {
      await new Promise<void>((resolve) => {
        options?.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    })

    const host = new OmpAgentRuntimeHost()
    const runPromise = host.execute(createPayload())

    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(host.isRunActive('run-999')).toBe(true)
    expect(host.cancel('run-999')).toBe(true)

    let caught: unknown
    try {
      await runPromise
    } catch (error) {
      caught = error
    }
    expect(isRunCancelledControlError(caught)).toBe(true)
    expect(host.isRunActive('run-999')).toBe(false)
    expect(mockSession.cancel).toHaveBeenCalled()
    expect(mockSession.close).toHaveBeenCalled()
  })

  it('interrupts active runs on stop(), resets readiness on unexpected client close, and closes late-spawned clients', async () => {
    mockSession.promptStream.mockImplementationOnce(async function* (
      _prompt: unknown,
      options?: { signal?: AbortSignal }
    ): AsyncIterable<OmpStreamEvent> {
      await new Promise<void>((resolve) => {
        options?.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    })

    const host = new OmpAgentRuntimeHost()
    const runPromise = host.execute(createPayload())

    await new Promise((resolve) => setTimeout(resolve, 15))
    await host.stop()

    let caught: unknown
    try {
      await runPromise
    } catch (error) {
      caught = error
    }
    expect(isRunInterruptedControlError(caught)).toBe(true)
    expect(host.isReady()).toBe(false)
    expect(host.isRunActive('run-999')).toBe(false)
    expect(mockClient.close).toHaveBeenCalled()

    // Unexpected client close marks host not ready so next start respawns
    await host.start()
    expect(host.isReady()).toBe(true)
    mockClient.emitClose()
    expect(host.isReady()).toBe(false)
  })
})
