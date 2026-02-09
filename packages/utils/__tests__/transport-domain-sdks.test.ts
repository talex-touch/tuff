import { describe, expect, it, vi } from 'vitest'
import { AgentsEvents, AppEvents, PermissionEvents, UpdateEvents } from '../transport/events'
import { createAgentMarketSdk } from '../transport/sdk/domains/agents-market'
import { createAppSdk } from '../transport/sdk/domains/app'
import { createAgentsSdk } from '../transport/sdk/domains/agents'
import { createIntelligenceSdk } from '../transport/sdk/domains/intelligence'
import { createPermissionSdk } from '../transport/sdk/domains/permission'
import { createSettingsSdk } from '../transport/sdk/domains/settings'
import { createUpdateSdk } from '../transport/sdk/domains/update'

function createTransportMock() {
  return {
    send: vi.fn<(...args: any[]) => Promise<any>>(async () => undefined),
    on: vi.fn<(...args: any[]) => any>(() => vi.fn()),
    stream: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      cancel: vi.fn(),
      cancelled: false,
      streamId: 'mock-stream',
    })),
  }
}

describe('transport domain sdk mappings', () => {
  it('update sdk maps check and settings events', async () => {
    const transport = createTransportMock()
    const sdk = createUpdateSdk(transport as any)

    await sdk.check({ force: true })
    await sdk.updateSettings({ autoDownload: true })

    expect(transport.send).toHaveBeenNthCalledWith(1, UpdateEvents.check, { force: true })
    expect(transport.send).toHaveBeenNthCalledWith(2, UpdateEvents.updateSettings, {
      settings: { autoDownload: true },
    })
  })

  it('settings sdk maps file index stream to typed transport stream', async () => {
    const transport = createTransportMock()
    const sdk = createSettingsSdk(transport as any)
    const onData = vi.fn()

    await sdk.fileIndex.streamProgress({ onData })

    expect(transport.stream).toHaveBeenCalledWith(
      AppEvents.fileIndex.progress,
      undefined,
      { onData },
    )
  })

  it('app sdk maps openPromptsFolder to typed system event', async () => {
    const transport = createTransportMock()
    const sdk = createAppSdk(transport as any)

    await sdk.openPromptsFolder()

    expect(transport.send).toHaveBeenCalledWith(AppEvents.system.openPromptsFolder)
  })

  it('intelligence sdk throws typed error when main returns failed ApiResponse', async () => {
    const transport = createTransportMock()
    transport.send.mockResolvedValueOnce({ ok: false, error: 'quota exceeded' })

    const sdk = createIntelligenceSdk(transport as any)

    await expect(sdk.invoke('text.chat', { messages: [] })).rejects.toThrow('quota exceeded')
  })

  it('permission sdk maps grant + push subscription', async () => {
    const transport = createTransportMock()
    const dispose = vi.fn()
    transport.on.mockReturnValue(dispose)

    const sdk = createPermissionSdk(transport as any)

    await sdk.grant({ pluginId: 'demo', permissionId: 'ai.basic', grantedBy: 'user' })
    const unsubscribe = sdk.onUpdated(() => {})
    unsubscribe()

    expect(transport.send).toHaveBeenCalledWith(PermissionEvents.api.grant, {
      pluginId: 'demo',
      permissionId: 'ai.basic',
      grantedBy: 'user',
    })
    expect(transport.on).toHaveBeenCalledWith(
      PermissionEvents.push.updated,
      expect.any(Function),
    )
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('agent market sdk maps market event names through typed events', async () => {
    const transport = createTransportMock()
    const sdk = createAgentMarketSdk(transport as any)

    await sdk.searchAgents({ keyword: 'workflow' })
    await sdk.installAgent('community.workflow-agent', '1.0.0')
    await sdk.checkUpdates()

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      AgentsEvents.market.search,
      { keyword: 'workflow' },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AgentsEvents.market.install,
      { agentId: 'community.workflow-agent', version: '1.0.0' },
    )
    expect(transport.send).toHaveBeenNthCalledWith(3, AgentsEvents.market.checkUpdates)
  })

  it('agents sdk maps api list/execute-immediate/update-priority events', async () => {
    const transport = createTransportMock()
    const sdk = createAgentsSdk(transport as any)

    await sdk.listAll()
    await sdk.executeImmediate({
      agentId: 'builtin.search-agent',
      type: 'execute',
      input: { query: 'hello' },
    })
    await sdk.updatePriority('task-1', 9)

    expect(transport.send).toHaveBeenNthCalledWith(1, AgentsEvents.api.listAll)
    expect(transport.send).toHaveBeenNthCalledWith(2, AgentsEvents.api.executeImmediate, {
      agentId: 'builtin.search-agent',
      type: 'execute',
      input: { query: 'hello' },
    })
    expect(transport.send).toHaveBeenNthCalledWith(3, AgentsEvents.api.updatePriority, {
      taskId: 'task-1',
      priority: 9,
    })
  })

  it('agents sdk maps task push subscriptions', async () => {
    const transport = createTransportMock()
    const dispose = vi.fn()
    transport.on.mockReturnValue(dispose)
    const sdk = createAgentsSdk(transport as any)

    const unsubscribe = sdk.onTaskStarted(() => {})
    unsubscribe()

    expect(transport.on).toHaveBeenCalledWith(
      AgentsEvents.push.taskStarted,
      expect.any(Function),
    )
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
