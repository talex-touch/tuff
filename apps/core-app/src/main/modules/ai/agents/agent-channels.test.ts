import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AgentsEvents,
  type HandlerContext,
  type ITuffTransportMain,
  type TuffEvent
} from '@talex-touch/utils/transport/main'

interface PermissionOptions {
  permissionId: string
  failClosedForPlugin?: boolean
  unavailableCode?: string
  deniedCode?: string
}

type PermissionHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown

const { agentManagerMock, agentStoreServiceMock, permissionMocks } = vi.hoisted(() => ({
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
  },
  permissionMocks: {
    runtimeAvailable: false,
    permissionGranted: false,
    withPermission: vi.fn(
      (options: PermissionOptions, callback: PermissionHandler): PermissionHandler => {
        return async (payload, context) => {
          if (
            context.plugin &&
            options.permissionId === 'intelligence.agents' &&
            options.failClosedForPlugin
          ) {
            if (!permissionMocks.runtimeAvailable) {
              const error = new Error(
                `Permission runtime is unavailable for '${options.permissionId}'`
              ) as Error & { code?: string }
              error.code = options.unavailableCode
              throw error
            }
            if (!permissionMocks.permissionGranted) {
              const error = new Error(`Permission '${options.permissionId}' denied`) as Error & {
                code?: string
              }
              error.code = options.deniedCode
              throw error
            }
          }
          return await callback(payload, context)
        }
      }
    )
  }
}))

vi.mock('./agent-manager', () => ({
  agentManager: agentManagerMock
}))

vi.mock('../../../service/agent-store.service', () => ({
  agentStoreService: agentStoreServiceMock
}))

vi.mock('../../permission/channel-guard', () => ({
  withPermission: permissionMocks.withPermission
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
  const handlers = new Map<
    string,
    (payload?: unknown, context?: HandlerContext) => Promise<unknown> | unknown
  >()
  const transport = {
    on: vi.fn(
      <TReq, TRes>(
        event: TuffEvent<TReq, TRes> & { toEventName: () => string },
        handler: (payload: TReq, context: HandlerContext) => TRes | Promise<TRes>
      ) => {
        handlers.set(
          event.toEventName(),
          (payload?: unknown, context: HandlerContext = {} as HandlerContext) =>
            handler(payload as TReq, context)
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
    permissionMocks.runtimeAvailable = false
    permissionMocks.permissionGranted = false
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
      input: {},
      caller: 'intelligence.agent-executor'
    })
  })

  it.each([
    {
      name: 'permission runtime is unavailable for immediate execution',
      event: AgentsEvents.api.executeImmediate,
      errorCode: 'INTELLIGENCE_AGENTS_PERMISSION_UNAVAILABLE',
      permissionGranted: false,
      runtimeAvailable: false
    },
    {
      name: 'permission is denied for queued execution',
      event: AgentsEvents.api.execute,
      errorCode: 'INTELLIGENCE_AGENTS_PERMISSION_DENIED',
      permissionGranted: false,
      runtimeAvailable: true
    }
  ])(
    'fails closed before runtime readiness or agent execution when $name',
    async ({ event, errorCode, permissionGranted, runtimeAvailable }) => {
      const waitForRuntime = vi.fn(async () => undefined)
      const { transport, handlers } = createTransport()
      const pluginContext = {
        plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true }
      } as HandlerContext
      permissionMocks.runtimeAvailable = runtimeAvailable
      permissionMocks.permissionGranted = permissionGranted

      registerAgentChannels(transport, { waitForRuntime })

      const handler = handlers.get(event.toEventName())
      if (!handler) {
        throw new Error('Agent execution handler was not registered')
      }

      await expect(
        handler({ agentId: 'builtin.workflow-agent', input: {} }, pluginContext)
      ).rejects.toMatchObject({
        code: errorCode
      })
      expect(waitForRuntime).not.toHaveBeenCalled()
      expect(agentManagerMock.executeTask).not.toHaveBeenCalled()
      expect(agentManagerMock.executeTaskImmediate).not.toHaveBeenCalled()
    }
  )

  it.each([
    {
      caller: undefined,
      event: AgentsEvents.api.execute,
      expectedResult: { taskId: 'task-1' },
      manager: agentManagerMock.executeTask,
      name: 'missing caller for queued execution'
    },
    {
      caller: 'host:spoofed',
      event: AgentsEvents.api.executeImmediate,
      expectedResult: { success: true, output: 'ok' },
      manager: agentManagerMock.executeTaskImmediate,
      name: 'spoofed caller for immediate execution'
    }
  ])(
    'binds a granted plugin to its canonical caller with $name',
    async ({ caller, event, expectedResult, manager }) => {
      const { transport, handlers } = createTransport()
      const pluginContext = {
        plugin: { name: 'third-party-plugin', uniqueKey: 'plugin-key', verified: true }
      } as HandlerContext
      const task = {
        agentId: 'builtin.workflow-agent',
        input: { operation: 'summarize' },
        ...(caller === undefined ? {} : { caller })
      }
      permissionMocks.runtimeAvailable = true
      permissionMocks.permissionGranted = true

      registerAgentChannels(transport)

      const handler = handlers.get(event.toEventName())
      if (!handler) {
        throw new Error('Agent execution handler was not registered')
      }

      await expect(handler(task, pluginContext)).resolves.toEqual(expectedResult)
      expect(manager).toHaveBeenCalledWith({ ...task, caller: 'plugin:third-party-plugin' })
    }
  )

  it('preserves an explicit host caller for queued execution', async () => {
    const { transport, handlers } = createTransport()
    const task = {
      agentId: 'builtin.workflow-agent',
      input: { operation: 'summarize' },
      caller: 'host:corebox'
    }

    registerAgentChannels(transport)

    const execute = handlers.get(AgentsEvents.api.execute.toEventName())
    if (!execute) {
      throw new Error('Queued agent execution handler was not registered')
    }

    await expect(execute(task, {} as HandlerContext)).resolves.toEqual({ taskId: 'task-1' })
    expect(agentManagerMock.executeTask).toHaveBeenCalledWith(task)
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
