import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { McpServerDeclaredProbeRequest } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import type { AiImportedConfigItem } from '@talex-touch/utils/types/ai-orchestrator'
import type { McpInventoryRuntimeDeps } from './mcp-inventory-runtime'
import { McpServerEvents } from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../ai-orchestrator-store', () => ({ aiOrchestratorStore: {} }))
vi.mock('../intelligence-mcp-registry', () => ({ intelligenceMcpRegistry: {} }))
vi.mock('../ai-cli-import-service', () => ({ aiCliImportService: { preview: vi.fn() } }))

import { registerMcpInventoryChannels } from './mcp-inventory-runtime'

type Handler = (payload: unknown, context: HandlerContext) => Promise<unknown>

function fakeTransport(): { transport: ITuffTransportMain; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>()
  const transport = {
    on: (event: { toEventName: () => string }, handler: Handler) => {
      handlers.set(event.toEventName(), handler)
      return () => handlers.delete(event.toEventName())
    }
  } as unknown as ITuffTransportMain
  return { transport, handlers }
}

const hostContext = { sender: {}, eventName: 'host' } as unknown as HandlerContext
const pluginContext = {
  sender: {},
  eventName: 'plugin',
  plugin: { name: 'curious-plugin', uniqueKey: 'activation-key' }
} as unknown as HandlerContext

function manualServer(): AiImportedConfigItem {
  return {
    id: 'manual:1',
    candidateId: 'manual:1',
    sourceId: 'manual',
    provider: 'manual',
    sourceScope: 'user',
    targetScope: 'global',
    kind: 'mcp',
    name: 'notes',
    sourceKey: 'manual:1',
    normalizedProjection: {
      mcpProfiles: [
        {
          id: 'manual.notes',
          name: 'notes',
          enabled: true,
          transport: { type: 'stdio', command: 'node', args: ['notes.js'] }
        }
      ]
    },
    secrets: [],
    state: 'active',
    revisionId: 'manual',
    active: true,
    createdAt: 1,
    updatedAt: 1
  }
}

function spyDeps() {
  return {
    preview: vi.fn(async () => ({
      scanId: 'scan-1',
      scannedAt: 1,
      cwd: '/',
      sources: [],
      candidates: []
    })),
    listImportedItems: vi.fn(async () => [manualServer()]),
    setProfileEnabled: vi.fn(async (_itemId: string, _profileId: string, _enabled: boolean) => {}),
    setItemActive: vi.fn(async (_itemId: string, _active: boolean) => {}),
    probeDeclared: vi.fn(async (_request: McpServerDeclaredProbeRequest) => ({
      ok: true,
      toolCount: 2
    }))
  } satisfies McpInventoryRuntimeDeps
}

describe('MCP inventory channels', () => {
  it('registers the inventory, the per-server switch and the declared probe, and nothing else', () => {
    const { transport, handlers } = fakeTransport()
    const cleanup = registerMcpInventoryChannels(transport, spyDeps())

    expect([...handlers.keys()].sort()).toEqual([
      'mcp-servers:api:inventory',
      'mcp-servers:api:probe-declared',
      'mcp-servers:api:set-server-enabled'
    ])
    cleanup()
    expect(handlers.size).toBe(0)
  })

  it('refuses a plugin caller before scanning, reading the store, switching or starting anything', async () => {
    const { transport, handlers } = fakeTransport()
    const deps = spyDeps()
    registerMcpInventoryChannels(transport, deps)

    await expect(
      handlers.get(McpServerEvents.inventory.toEventName())!(undefined, pluginContext)
    ).rejects.toThrow('INTELLIGENCE_HOST_ONLY_CAPABILITY')
    await expect(
      handlers.get(McpServerEvents.setServerEnabled.toEventName())!(
        { key: 'mcp:any', enabled: true },
        pluginContext
      )
    ).rejects.toThrow('INTELLIGENCE_HOST_ONLY_CAPABILITY')
    await expect(
      handlers.get(McpServerEvents.probeDeclared.toEventName())!(
        {
          scanId: 'scan-1',
          candidateId: 'claude:mcp',
          server: 'context7',
          key: 'mcp:any',
          confirmSecrets: true
        },
        pluginContext
      )
    ).rejects.toThrow('INTELLIGENCE_HOST_ONLY_CAPABILITY')

    for (const spy of [
      deps.preview,
      deps.listImportedItems,
      deps.setProfileEnabled,
      deps.setItemActive,
      deps.probeDeclared
    ])
      expect(spy).not.toHaveBeenCalled()
  })

  it('hands the host’s declared probe through as asked and answers with its result', async () => {
    const { transport, handlers } = fakeTransport()
    const deps = spyDeps()
    registerMcpInventoryChannels(transport, deps)
    const request = {
      scanId: 'scan-1',
      candidateId: 'claude:mcp',
      server: 'context7',
      key: 'mcp:context7'
    }

    await expect(
      handlers.get(McpServerEvents.probeDeclared.toEventName())!(request, hostContext)
    ).resolves.toEqual({ ok: true, toolCount: 2 })
    expect(deps.probeDeclared).toHaveBeenCalledExactlyOnceWith(request)
    for (const spy of [deps.listImportedItems, deps.setProfileEnabled, deps.setItemActive])
      expect(spy).not.toHaveBeenCalled()
  })

  it('answers the host with a fresh scan merged with what Tuff holds', async () => {
    const { transport, handlers } = fakeTransport()
    const deps = spyDeps()
    registerMcpInventoryChannels(transport, deps)

    const inventory = (await handlers.get(McpServerEvents.inventory.toEventName())!(
      undefined,
      hostContext
    )) as { scanId: string; rows: Array<{ name: string; tuff: { state: string } }> }

    expect(deps.preview).toHaveBeenCalledTimes(1)
    expect(inventory.scanId).toBe('scan-1')
    expect(inventory.rows.map((row) => [row.name, row.tuff.state])).toEqual([['notes', 'enabled']])
  })

  it('refuses a key Tuff holds no server for, without writing', async () => {
    const { transport, handlers } = fakeTransport()
    const deps = spyDeps()
    registerMcpInventoryChannels(transport, deps)

    await expect(
      handlers.get(McpServerEvents.setServerEnabled.toEventName())!(
        { key: 'mcp:unknown', enabled: true },
        hostContext
      )
    ).rejects.toThrow('MCP_SERVER_NOT_IMPORTED')
    expect(deps.setProfileEnabled).not.toHaveBeenCalled()
    expect(deps.setItemActive).not.toHaveBeenCalled()
  })
})
