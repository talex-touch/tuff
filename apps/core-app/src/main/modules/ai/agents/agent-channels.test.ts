import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AgentsEvents,
  type HandlerContext,
  type ITuffTransportMain,
  type TuffEvent
} from '@talex-touch/utils/transport/main'

const { agentManagerMock, agentStoreServiceMock } = vi.hoisted(() => ({
  agentManagerMock: {
    getAvailableAgents: vi.fn(() => []),
    getAllAgents: vi.fn(() => []),
    getAgent: vi.fn(() => null),
    executeTask: vi.fn(async () => 'task-1'),
    executeTaskImmediate: vi.fn(async () => ({ success: true, output: 'ok' })),
    cancelTask: vi.fn(async () => true),
    getTaskStatus: vi.fn(() => 'idle'),
    updateTaskPriority: vi.fn(() => true),
    getTools: vi.fn(() => []),
    getTool: vi.fn(() => null),
    getStats: vi.fn(() => ({ agents: {}, scheduler: {}, tools: {} })),
    on: vi.fn(),
    removeAllListeners: vi.fn()
  },
  agentStoreServiceMock: {
    searchAgents: vi.fn(async () => []),
    getAgentDetails: vi.fn(async () => null),
    getFeaturedAgents: vi.fn(async () => []),
    getInstalledAgents: vi.fn(async () => []),
    getCategories: vi.fn(async () => []),
    installAgent: vi.fn(async () => ({ success: true, agentId: 'agent-1', version: '1.0.0' })),
    uninstallAgent: vi.fn(async () => ({ success: true, agentId: 'agent-1', version: '1.0.0' })),
    checkUpdates: vi.fn(async () => [])
  }
}))

vi.mock('./agent-manager', () => ({
  agentManager: agentManagerMock
}))

vi.mock('../../../service/agent-store.service', () => ({
  agentStoreService: agentStoreServiceMock
}))

import { registerAgentChannels } from './agent-channels'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createTransport() {
  const handlers = new Map<string, (payload?: unknown) => Promise<unknown> | unknown>()
  const transport = {
    on: vi.fn(
      <TReq, TRes>(
        event: TuffEvent<TReq, TRes> & { toEventName: () => string },
        handler: (payload: TReq, context: HandlerContext) => TRes | Promise<TRes>
      ) => {
        handlers.set(event.toEventName(), (payload?: unknown) =>
          handler(payload as TReq, {} as HandlerContext)
        )
        return () => {
          handlers.delete(event.toEventName())
        }
      }
    ),
    broadcast: vi.fn()
  } as unknown as ITuffTransportMain

  return { transport, handlers }
}

describe('registerAgentChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('waits for runtime readiness before agent execution handlers run', async () => {
    const ready = deferred()
    const { transport, handlers } = createTransport()

    registerAgentChannels(transport, { waitForRuntime: () => ready.promise })

    const executeImmediate = handlers.get(AgentsEvents.api.executeImmediate.toEventName())
    expect(executeImmediate).toBeDefined()

    const resultPromise = executeImmediate?.({ agentId: 'builtin.workflow-agent', input: {} })
    await Promise.resolve()

    expect(agentManagerMock.executeTaskImmediate).not.toHaveBeenCalled()

    ready.resolve()
    await expect(resultPromise).resolves.toEqual({ success: true, output: 'ok' })
    expect(agentManagerMock.executeTaskImmediate).toHaveBeenCalledWith({
      agentId: 'builtin.workflow-agent',
      input: {}
    })
  })

  it('does not block agent store handlers on runtime readiness', async () => {
    const waitForRuntime = vi.fn(async () => {
      throw new Error('runtime should not be awaited')
    })
    const { transport, handlers } = createTransport()

    registerAgentChannels(transport, { waitForRuntime })

    const search = handlers.get(AgentsEvents.store.search.toEventName())
    await expect(search?.({ query: 'workflow' })).resolves.toEqual([])

    expect(waitForRuntime).not.toHaveBeenCalled()
    expect(agentStoreServiceMock.searchAgents).toHaveBeenCalledWith({ query: 'workflow' })
  })
})
