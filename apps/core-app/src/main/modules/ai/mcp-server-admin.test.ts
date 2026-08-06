import type { AiImportedConfigItem } from '@talex-touch/utils/types/ai-orchestrator'
import type { ManualImportedItemInput } from './ai-orchestrator-store'
import type { IntelligenceMcpProfile } from './intelligence-mcp-registry'
import type { McpServerAdminDeps } from './mcp-server-admin'
import { describe, expect, it, vi } from 'vitest'

// The projection reader is the real one — a manual entry is only correct if the
// runtime that reconciles imported servers accepts what we wrote. Its module
// pulls in Electron and the database, neither of which this suite needs.
vi.mock('./ai-orchestrator-store', () => ({ aiOrchestratorStore: {} }))
vi.mock('./ai-import-content-store', () => ({ aiImportContentStore: {} }))
vi.mock('./intelligence-mcp-registry', () => ({ intelligenceMcpRegistry: {} }))

import { mcpProfilesFromItem } from './ai-imported-config-runtime'
import { createMcpServerAdmin } from './mcp-server-admin'

function itemFromManual(
  input: ManualImportedItemInput,
  overrides: Partial<AiImportedConfigItem> = {}
): AiImportedConfigItem {
  return {
    id: input.itemId,
    candidateId: input.itemId,
    sourceId: 'manual',
    provider: 'manual',
    sourceScope: 'user',
    targetScope: 'global',
    kind: input.kind,
    name: input.name,
    sourceKey: input.itemId,
    // Round-trips through JSON the way the row does.
    normalizedProjection: JSON.parse(JSON.stringify(input.projection)),
    secrets: input.secrets,
    state: 'active',
    revisionId: 'manual',
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function createHarness() {
  const items = new Map<string, AiImportedConfigItem>()
  const persisted: ManualImportedItemInput[] = []
  const secureStore = new Map<string, string>()
  const registered = new Map<string, IntelligenceMcpProfile>()
  const unregistered: string[] = []
  const serverTools = new Map<string, unknown[] | Error>()
  const state = {
    secureStoreAvailable: true,
    failWriteFor: undefined as string | undefined,
    failPersist: false,
    refreshes: 0
  }

  const deps: McpServerAdminDeps = {
    getItem: async (itemId) => items.get(itemId) ?? null,
    persistManualItem: async (input) => {
      if (state.failPersist) throw new Error('database is offline')
      persisted.push(input)
      const item = itemFromManual(input, { active: items.get(input.itemId)?.active ?? true })
      items.set(input.itemId, item)
      return item
    },
    mcpProfilesFromItem,
    registerProfile: (profile) => {
      registered.set(profile.id, profile)
    },
    unregisterProfile: async (profileId) => {
      unregistered.push(profileId)
      return registered.delete(profileId)
    },
    listServerTools: async (profileId) => {
      const result = serverTools.get(profileId)
      if (result instanceof Error) throw result
      return result ?? []
    },
    secureStore: {
      isAvailable: () => state.secureStoreAvailable,
      read: async (authRef) => secureStore.get(authRef) ?? null,
      write: async (authRef, value) => {
        if (state.failWriteFor === authRef) return false
        if (value === null) secureStore.delete(authRef)
        else secureStore.set(authRef, value)
        return true
      }
    },
    refreshRuntime: async () => {
      state.refreshes += 1
    },
    newItemId: () => 'fixed'
  }

  return {
    admin: createMcpServerAdmin(deps),
    items,
    persisted,
    secureStore,
    registered,
    unregistered,
    serverTools,
    state
  }
}

function stdioProfileOf(item: AiImportedConfigItem) {
  const profile = mcpProfilesFromItem(item)[0]
  if (!profile || profile.transport.type !== 'stdio') throw new Error('expected a stdio profile')
  return profile.transport
}

function httpProfileOf(item: AiImportedConfigItem) {
  const profile = mcpProfilesFromItem(item)[0]
  if (!profile || profile.transport.type !== 'streamable-http')
    throw new Error('expected an http profile')
  return profile.transport
}

describe('mcp server admin: manual entry', () => {
  it('stores a stdio server the imported-config runtime can read back as a profile', async () => {
    const harness = createHarness()

    const { itemId } = await harness.admin.upsertManual({
      name: 'Filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: { FS_TOKEN: 's3cret-value' }
    })

    expect(itemId).toBe('manual:fixed')
    const transport = stdioProfileOf(harness.items.get(itemId)!)
    expect(transport.command).toBe('npx')
    expect(transport.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp'])
    expect(transport.env).toEqual({})
    expect(harness.state.refreshes).toBe(1)
  })

  it('keeps env values in the secure store instead of the stored row', async () => {
    const harness = createHarness()

    const { itemId } = await harness.admin.upsertManual({
      name: 'Filesystem',
      transport: 'stdio',
      command: 'npx',
      env: { FS_TOKEN: 's3cret-value' }
    })

    const authRef = stdioProfileOf(harness.items.get(itemId)!).envAuthRefs?.FS_TOKEN
    expect(authRef).toBeTruthy()
    expect(harness.secureStore.get(authRef!)).toBe('s3cret-value')
    expect(JSON.stringify(harness.persisted[0])).not.toContain('s3cret-value')
    expect(harness.persisted[0]!.secrets).toEqual([
      { keyPath: 'env.FS_TOKEN', fingerprint: expect.any(String), authRef }
    ])
  })

  it('keeps http header values out of the stored row', async () => {
    const harness = createHarness()

    const { itemId } = await harness.admin.upsertManual({
      name: 'Remote',
      transport: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'Bearer header-secret' }
    })

    const transport = httpProfileOf(harness.items.get(itemId)!)
    expect(transport.url).toBe('https://mcp.example.com/mcp')
    expect(transport.headers).toEqual({})
    expect(harness.secureStore.get(transport.headerAuthRefs!.Authorization!)).toBe(
      'Bearer header-secret'
    )
    expect(JSON.stringify(harness.persisted[0])).not.toContain('header-secret')
  })

  it('refuses credentials when secure storage is unavailable, but still takes a server without them', async () => {
    const harness = createHarness()
    harness.state.secureStoreAvailable = false

    await expect(
      harness.admin.upsertManual({
        name: 'Filesystem',
        transport: 'stdio',
        command: 'npx',
        env: { FS_TOKEN: 's3cret-value' }
      })
    ).rejects.toThrow(/Secure storage is unavailable/)
    expect(harness.persisted).toHaveLength(0)
    expect(harness.secureStore.size).toBe(0)

    await harness.admin.upsertManual({ name: 'Filesystem', transport: 'stdio', command: 'npx' })
    expect(harness.persisted).toHaveLength(1)
  })

  it('restores the previous credential when the row fails to persist', async () => {
    const harness = createHarness()
    const { itemId } = await harness.admin.upsertManual({
      name: 'Filesystem',
      transport: 'stdio',
      command: 'npx',
      env: { FS_TOKEN: 'first-value' }
    })
    const authRef = stdioProfileOf(harness.items.get(itemId)!).envAuthRefs!.FS_TOKEN!

    harness.state.failPersist = true
    await expect(
      harness.admin.upsertManual({
        itemId,
        name: 'Filesystem',
        transport: 'stdio',
        command: 'npx',
        env: { FS_TOKEN: 'second-value' }
      })
    ).rejects.toThrow('database is offline')

    expect(harness.secureStore.get(authRef)).toBe('first-value')
  })

  it('reports a credential that could not be stored instead of persisting a broken server', async () => {
    const harness = createHarness()
    // The reference is derived from the item id, which is fixed by the harness.
    const { itemId } = await harness.admin.upsertManual({
      name: 'Filesystem',
      transport: 'stdio',
      command: 'npx',
      env: { FS_TOKEN: 'first-value' }
    })
    harness.state.failWriteFor = stdioProfileOf(harness.items.get(itemId)!).envAuthRefs!.FS_TOKEN!

    await expect(
      harness.admin.upsertManual({
        itemId,
        name: 'Filesystem',
        transport: 'stdio',
        command: 'npx',
        env: { FS_TOKEN: 'second-value' }
      })
    ).rejects.toThrow(/env\.FS_TOKEN/)
    expect(harness.persisted).toHaveLength(1)
  })

  it('rejects an update that names something other than a configured MCP server', async () => {
    const harness = createHarness()
    harness.items.set(
      'skill-item',
      itemFromManual({
        itemId: 'skill-item',
        kind: 'skill',
        name: 'Release',
        projection: {},
        snapshot: {},
        secrets: [],
        fingerprint: 'x'
      })
    )

    await expect(
      harness.admin.upsertManual({
        itemId: 'missing',
        name: 'Filesystem',
        transport: 'stdio',
        command: 'npx'
      })
    ).rejects.toThrow(/not configured/)
    await expect(
      harness.admin.upsertManual({
        itemId: 'skill-item',
        name: 'Filesystem',
        transport: 'stdio',
        command: 'npx'
      })
    ).rejects.toThrow(/not configured/)
  })

  it('rejects malformed input before anything is written', async () => {
    const harness = createHarness()

    await expect(
      harness.admin.upsertManual({ name: '  ', transport: 'stdio', command: 'npx' })
    ).rejects.toThrow(/name is required/)
    await expect(
      harness.admin.upsertManual({ name: 'Filesystem', transport: 'stdio', command: ' ' })
    ).rejects.toThrow(/command is required/)
    await expect(
      harness.admin.upsertManual({
        name: 'Remote',
        transport: 'streamable-http',
        url: 'ftp://mcp.example.com'
      })
    ).rejects.toThrow(/http or https/)
    await expect(
      harness.admin.upsertManual({
        name: 'Filesystem',
        transport: 'stdio',
        command: 'npx',
        env: { 'not a name': 'value' }
      })
    ).rejects.toThrow(/env name/)
    expect(harness.persisted).toHaveLength(0)
    expect(harness.secureStore.size).toBe(0)
  })
})

describe('mcp server admin: probe', () => {
  async function withServer(harness: ReturnType<typeof createHarness>, active = true) {
    const { itemId } = await harness.admin.upsertManual({
      name: 'Filesystem',
      transport: 'stdio',
      command: 'npx'
    })
    const item = harness.items.get(itemId)!
    harness.items.set(itemId, { ...item, active })
    return { itemId, profileId: mcpProfilesFromItem(item)[0]!.id }
  }

  it('reports the tool count of a reachable server', async () => {
    const harness = createHarness()
    const { itemId, profileId } = await withServer(harness)
    harness.serverTools.set(profileId, [{}, {}, {}])

    await expect(harness.admin.probe(itemId)).resolves.toEqual({ ok: true, toolCount: 3 })
    expect(harness.unregistered).toEqual([])
  })

  it('reports why a server could not be reached', async () => {
    const harness = createHarness()
    const { itemId, profileId } = await withServer(harness)
    harness.serverTools.set(profileId, new Error('spawn npx ENOENT'))

    await expect(harness.admin.probe(itemId)).resolves.toEqual({
      ok: false,
      error: 'Filesystem: spawn npx ENOENT'
    })
  })

  it('drops the registration again when probing a switched-off server', async () => {
    const harness = createHarness()
    const { itemId, profileId } = await withServer(harness, false)
    harness.serverTools.set(profileId, [{}])

    await expect(harness.admin.probe(itemId)).resolves.toEqual({ ok: true, toolCount: 1 })
    expect(harness.unregistered).toEqual([profileId])
    expect(harness.registered.has(profileId)).toBe(false)
  })

  it('probes every server of a multi-server entry and names only the failing one', async () => {
    const harness = createHarness()
    const item = itemFromManual({
      itemId: 'import-item',
      kind: 'mcp',
      name: 'Imported',
      projection: {
        mcpProfiles: [
          { id: 'one', name: 'Docs', transport: { type: 'stdio', command: 'docs' } },
          { id: 'two', name: 'Issues', transport: { type: 'stdio', command: 'issues' } }
        ]
      },
      snapshot: {},
      secrets: [],
      fingerprint: 'x'
    })
    harness.items.set(item.id, item)
    harness.serverTools.set('one', new Error('connection refused'))
    harness.serverTools.set('two', [{}, {}])

    await expect(harness.admin.probe(item.id)).resolves.toEqual({
      ok: false,
      error: 'Docs: connection refused'
    })
    expect([...harness.registered.keys()]).toEqual(['one', 'two'])
  })

  it('does not call a server that is disabled pending re-authentication', async () => {
    const harness = createHarness()
    const item = itemFromManual({
      itemId: 'import-item',
      kind: 'mcp',
      name: 'Imported',
      projection: {
        mcpProfiles: [
          {
            id: 'one',
            name: 'Docs',
            enabled: false,
            transport: { type: 'stdio', command: 'docs' }
          }
        ]
      },
      snapshot: {},
      secrets: [],
      fingerprint: 'x'
    })
    harness.items.set(item.id, item)
    harness.serverTools.set('one', new Error('should not be called'))

    await expect(harness.admin.probe(item.id)).resolves.toEqual({
      ok: false,
      error: 'Docs: disabled until its credentials are re-entered'
    })
    expect(harness.registered.size).toBe(0)
  })

  it('reports an entry that is not a configured MCP server', async () => {
    const harness = createHarness()

    await expect(harness.admin.probe('missing')).resolves.toEqual({
      ok: false,
      error: 'MCP server missing is not configured'
    })
  })

  it('reports an entry whose projection defines no server', async () => {
    const harness = createHarness()
    const item = itemFromManual({
      itemId: 'empty',
      kind: 'mcp',
      name: 'Empty',
      projection: { mcpProfiles: [] },
      snapshot: {},
      secrets: [],
      fingerprint: 'x'
    })
    harness.items.set(item.id, item)

    await expect(harness.admin.probe(item.id)).resolves.toEqual({
      ok: false,
      error: 'This entry defines no MCP server'
    })
  })
})
