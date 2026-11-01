import type { PiRuntimeRunEvent, PiRuntimeStartPayload } from '../pi-agent-runtime-protocol'
import type { Mock } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OmpAgentRuntimeHost } from './omp-agent-runtime-host'
import { OmpAcpClient } from '@talex-touch/tuff-intelligence'

vi.mock('../providers/pi-cli-runtime', () => ({
  resolveOmpExecutable: vi.fn(async () => '/mock/bin/omp')
}))

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
  }

  beforeEach(() => {
    mockSession = {
      sessionId: 'test-session-123',
      promptStream: vi.fn(async function* () {
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
      close: vi.fn(async () => undefined)
    }

    vi.spyOn(OmpAcpClient, 'spawn').mockImplementation(
      async () => mockClient as unknown as OmpAcpClient
    )
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

  it('executes a run and routes streaming events to onEvent callback', async () => {
    const recordedEvents: PiRuntimeRunEvent[] = []
    const recordedRecords: unknown[] = []

    const host = new OmpAgentRuntimeHost({
      onEvent: async (ev) => {
        recordedEvents.push(ev)
      },
      onRecord: async (_runId, record) => {
        recordedRecords.push(record)
      }
    })

    const payload: PiRuntimeStartPayload = {
      run: {
        id: 'run-999',
        sessionId: 'session-1',
        objective: 'Count to 3',
        profileId: 'default',
        runtimeProvider: 'omp-core',
        cwd: '/tmp',
        status: 'running',
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      request: {
        objective: 'Count to 3',
        cwd: '/tmp'
      },
      profile: {
        id: 'default',
        name: 'Default Agent',
        description: 'Default',
        runtimeProvider: 'omp-core',
        enabled: true,
        modelPreference: ['cpa/gemini-3.8-flash'],
        allowedToolIds: []
      },
      tools: [],
      history: [],
      budget: {
        maxTimeMs: 60000,
        maxSteps: 10,
        maxToolCalls: 10
      }
    }

    const result = await host.execute(payload)

    expect(result.runId).toBe('run-999')
    expect(result.output).toBe('Hello from OMP runtime!')
    expect(result.usage.totalTokens).toBe(120)

    expect(recordedEvents).toHaveLength(2)
    expect(recordedEvents[0]).toMatchObject({
      runId: 'run-999',
      type: 'reasoning',
      payload: { delta: 'analyzing request' }
    })
    expect(recordedEvents[1]).toMatchObject({
      runId: 'run-999',
      type: 'text',
      payload: { delta: 'Hello from OMP runtime!' }
    })

    expect(recordedRecords).toHaveLength(1)
    expect(mockSession.close).toHaveBeenCalled()
  })
})
