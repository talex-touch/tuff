import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'
import type { PluginHostCapability } from './plugin-host-wire'

const pluginsRoot = fileURLToPath(new URL('../../../../../../../plugins/', import.meta.url))
const callbackLimits = { maxCallbacks: 64, maxConcurrentCallbacks: 16, maxResources: 32 }

const facadeCases = [
  {
    name: 'hosts',
    pluginName: 'touch-hosts',
    capability: 'system.hosts' as PluginHostCapability,
    facade: 'hosts',
    script: `
      module.exports = { async onInit() {
        const read = await plugin.hosts.read()
        const applied = await plugin.hosts.apply({
          operation: 'upsert', hostname: 'example.com', addresses: ['192.0.2.4'],
          expectedRevision: 'rev-1', actionToken: '00000000-0000-4000-8000-000000000001'
        })
        return {
          read, applied, keys: Object.keys(plugin.hosts), frozen: Object.isFrozen(plugin.hosts),
          nullPrototype: Object.getPrototypeOf(plugin.hosts) === null,
          raw: typeof hostCapabilities
        }
      } }
    `,
    expectedPayloads: [
      { operation: 'read' },
      {
        operation: 'upsert',
        hostname: 'example.com',
        addresses: ['192.0.2.4'],
        expectedRevision: 'rev-1',
        actionToken: '00000000-0000-4000-8000-000000000001'
      }
    ],
    response: (payload: { operation: string }) =>
      payload.operation === 'read' ? { status: 'ready', entries: [] } : { status: 'started' }
  },
  {
    name: 'VS Code projects',
    pluginName: 'touch-vscode-projects',
    capability: 'filesystem.vscode-projects' as PluginHostCapability,
    facade: 'vscodeProjects',
    script: `
      module.exports = { async onInit() {
        const listed = await plugin.vscodeProjects.list()
        const opened = await plugin.vscodeProjects.open('vsp_12345678901234567890123456789012')
        return {
          listed, opened, keys: Object.keys(plugin.vscodeProjects), frozen: Object.isFrozen(plugin.vscodeProjects),
          nullPrototype: Object.getPrototypeOf(plugin.vscodeProjects) === null,
          raw: typeof hostCapabilities
        }
      } }
    `,
    expectedPayloads: [
      { operation: 'list' },
      { operation: 'open', token: 'vsp_12345678901234567890123456789012' }
    ],
    response: (payload: { operation: string }) =>
      payload.operation === 'list' ? { status: 'ready', projects: [] } : { status: 'started' }
  },
  {
    name: 'Orca',
    pluginName: 'touch-orca',
    capability: 'orchestration.orca' as PluginHostCapability,
    facade: 'orca',
    script: `
      module.exports = { async onInit() {
        const snapshot = await plugin.orca.snapshot()
        const opened = await plugin.orca.open()
        return {
          snapshot, opened, keys: Object.keys(plugin.orca), frozen: Object.isFrozen(plugin.orca),
          nullPrototype: Object.getPrototypeOf(plugin.orca) === null,
          raw: typeof hostCapabilities
        }
      } }
    `,
    expectedPayloads: [{ operation: 'snapshot' }, { operation: 'open' }],
    response: (payload: { operation: string }) =>
      payload.operation === 'snapshot'
        ? { status: 'ready', workspaces: 1, terminals: 2, tasks: 3, tasksAvailable: true }
        : { status: 'started' }
  },
  {
    name: 'Image tools',
    pluginName: 'touch-image',
    capability: 'media.image-tools' as PluginHostCapability,
    facade: 'imageTools',
    script: `
      module.exports = { async onInit() {
        const saved = await plugin.imageTools.save({
          token: 'img_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', format: 'webp', width: 64, height: 64, quality: 82
        })
        return {
          saved, keys: Object.keys(plugin.imageTools), frozen: Object.isFrozen(plugin.imageTools),
          nullPrototype: Object.getPrototypeOf(plugin.imageTools) === null, raw: typeof hostCapabilities
        }
      } }
    `,
    expectedPayloads: [
      {
        token: 'img_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        format: 'webp',
        width: 64,
        height: 64,
        quality: 82
      }
    ],
    response: () => ({
      status: 'saved',
      name: 'image.webp',
      format: 'webp',
      width: 64,
      height: 64,
      bytes: 42
    })
  },
  {
    name: 'AI sessions',
    pluginName: 'touch-ai-sessions',
    capability: 'intelligence.sessions' as PluginHostCapability,
    facade: 'aiSessions',
    script: `
      module.exports = { async onInit() {
        const listed = await plugin.aiSessions.list({ query: 'demo', limit: 4 })
        return {
          listed, keys: Object.keys(plugin.aiSessions), frozen: Object.isFrozen(plugin.aiSessions),
          nullPrototype: Object.getPrototypeOf(plugin.aiSessions) === null,
          raw: typeof hostCapabilities
        }
      } }
    `,
    expectedPayloads: [{ operation: 'list', query: 'demo', limit: 4 }],
    response: () => ({ status: 'ready', sessions: [], total: 0, incomplete: false })
  }
] as const

function payload(pluginName: string, capabilityManifest: readonly PluginHostCapability[]) {
  return {
    scriptContent: '',
    snapshot: {
      platform: 'darwin',
      arch: 'arm64',
      locale: 'zh-CN',
      manifest: { name: pluginName }
    },
    capabilityManifest: capabilityManifest.map((id) => ({
      id,
      callbackLifetime: 'transient' as const,
      callbackFields: []
    })),
    callbackLimits
  }
}

describe('classic utility plugin host facades', () => {
  it.each(facadeCases)(
    '$name exposes only the matching fixed facade and payloads',
    async (entry) => {
      const calls: Array<[PluginHostCapability, unknown]> = []
      const invokeCapability = vi.fn(async (capability: PluginHostCapability, request: unknown) => {
        calls.push([capability, request])
        const requestRecord = request as { operation: string }
        return entry.response(requestRecord)
      })
      const runtime = loadPluginPrelude(
        { ...payload(entry.pluginName, [entry.capability]), scriptContent: entry.script },
        { invokeCapability }
      )

      await expect(runtime.callLifecycle('onInit', []).promise).resolves.toMatchObject({
        keys: expect.arrayContaining(
          entry.name === 'AI sessions'
            ? ['list']
            : entry.name === 'Image tools'
              ? ['save']
              : entry.name === 'VS Code projects'
                ? ['list', 'open']
                : entry.name === 'Orca'
                  ? ['snapshot', 'open']
                  : ['read', 'apply']
        ),
        frozen: true,
        nullPrototype: true,
        raw: 'undefined',
        ...(entry.name === 'Orca'
          ? {
              snapshot: {
                status: 'ready',
                workspaces: 1,
                terminals: 2,
                tasks: 3,
                tasksAvailable: true
              }
            }
          : {})
      })
      expect(calls).toEqual(entry.expectedPayloads.map((request) => [entry.capability, request]))
      runtime.shutdown()
    }
  )

  it.each(facadeCases)(
    '$name stays hidden for a foreign manifest or undeclared capability',
    async (entry) => {
      const script = `module.exports = { onInit() {
      return { facade: typeof plugin.${entry.facade}, raw: typeof hostCapabilities }
    } }`
      for (const [pluginName, capabilities] of [
        ['unrelated-plugin', [entry.capability]],
        [entry.pluginName, []]
      ] as const) {
        const runtime = loadPluginPrelude({
          ...payload(pluginName, capabilities),
          scriptContent: script
        })
        await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
          facade: 'undefined',
          raw: 'undefined'
        })
        runtime.shutdown()
      }
    }
  )
})

const lifecycleCases = [
  {
    pluginName: 'touch-hosts',
    featureId: 'hosts',
    capability: 'system.hosts' as PluginHostCapability,
    listResponse: {
      status: 'ready',
      entries: [{ hostname: 'example.com', addresses: ['192.0.2.4'] }],
      revision: 'rev-1'
    },
    actionResponse: { status: 'started' },
    actionCapability: 'system.hosts' as PluginHostCapability,
    script: readFileSync(path.join(pluginsRoot, 'touch-hosts', 'index.js'), 'utf8')
  },
  {
    pluginName: 'touch-vscode-projects',
    featureId: 'vscode-projects',
    capability: 'filesystem.vscode-projects' as PluginHostCapability,
    listResponse: {
      status: 'ready',
      projects: [
        {
          token: 'vsp_12345678901234567890123456789012',
          label: 'Demo',
          kind: 'folder',
          lastOpenedAt: '2026-09-01'
        }
      ]
    },
    actionResponse: { status: 'started' },
    actionCapability: 'filesystem.vscode-projects' as PluginHostCapability,
    script: readFileSync(path.join(pluginsRoot, 'touch-vscode-projects', 'index.js'), 'utf8')
  },
  {
    pluginName: 'touch-orca',
    featureId: 'orca',
    capability: 'orchestration.orca' as PluginHostCapability,
    listResponse: { status: 'ready', workspaces: 1, terminals: 2, tasks: 3, tasksAvailable: true },
    actionResponse: { status: 'started' },
    actionCapability: 'orchestration.orca' as PluginHostCapability,
    script: readFileSync(path.join(pluginsRoot, 'touch-orca', 'index.js'), 'utf8')
  },
  {
    pluginName: 'touch-ai-sessions',
    featureId: 'ai-sessions',
    capability: 'intelligence.sessions' as PluginHostCapability,
    listResponse: {
      status: 'ready',
      total: 1,
      incomplete: false,
      sessions: [
        {
          id: '0123456789abcdef',
          platform: 'codex',
          project: 'Demo',
          updatedAt: '2026-09-01T10:00:00.000Z',
          state: 'active',
          turnCount: 2
        }
      ]
    },
    actionResponse: { ok: true },
    actionCapability: 'clipboard.write' as PluginHostCapability,
    script: readFileSync(path.join(pluginsRoot, 'touch-ai-sessions', 'index.js'), 'utf8')
  }
] as const

describe('classic utility lifecycle action transport', () => {
  it.each(lifecycleCases)(
    '$pluginName keeps its action usable after item serialization clone',
    async (entry) => {
      const items: unknown[] = []
      const calls: Array<[PluginHostCapability, unknown]> = []
      const invokeCapability = vi.fn(async (capability: PluginHostCapability, request: unknown) => {
        calls.push([capability, request])
        if (capability === entry.capability) {
          const requestRecord = request as { operation: string }
          const operation = requestRecord.operation
          return operation === 'list' || operation === 'read' || operation === 'snapshot'
            ? entry.listResponse
            : entry.actionResponse
        }
        if (capability === 'feature.items.push') {
          const requestRecord = request as { items: unknown[] }
          items.push(...requestRecord.items)
        }
        return capability === 'feature.items.clear' ? { removed: items.length } : { ok: true }
      })
      const capabilities = [
        entry.capability,
        'feature.items.clear' as PluginHostCapability,
        'feature.items.push' as PluginHostCapability
      ]
      if (entry.pluginName === 'touch-ai-sessions')
        capabilities.push('clipboard.write' as PluginHostCapability)
      const runtime = loadPluginPrelude(
        { ...payload(entry.pluginName, capabilities), scriptContent: entry.script },
        { invokeCapability }
      )

      await expect(
        runtime.callLifecycle('onFeatureTriggered', [entry.featureId]).promise
      ).resolves.toBe(true)
      expect(items).toHaveLength(1)
      const clonedItem = JSON.parse(JSON.stringify(items[0]))
      await expect(
        runtime.callLifecycle('onItemAction', [clonedItem]).promise
      ).resolves.toMatchObject({
        externalAction: true,
        ...(entry.pluginName === 'touch-ai-sessions'
          ? { success: true, status: 'copied' }
          : { status: 'started' })
      })
      expect(calls.some(([capability]) => capability === entry.actionCapability)).toBe(true)
      runtime.shutdown()
    }
  )
})

describe('touch-image lifecycle transport', () => {
  it('passes only the sanitized image token to the fixed save facade and preserves the save result', async () => {
    const items: Array<Record<string, unknown>> = []
    const calls: Array<[PluginHostCapability, unknown]> = []
    const runtime = loadPluginPrelude(
      {
        ...payload('touch-image', [
          'media.image-tools' as PluginHostCapability,
          'feature.items.clear' as PluginHostCapability,
          'feature.items.push' as PluginHostCapability
        ]),
        scriptContent: readFileSync(path.join(pluginsRoot, 'touch-image', 'index.js'), 'utf8')
      },
      {
        invokeCapability: async (capability: PluginHostCapability, request: unknown) => {
          calls.push([capability, request])
          if (capability === 'feature.items.push') {
            items.push(...(request as { items: Array<Record<string, unknown>> }).items)
            return { ok: true }
          }
          if (capability === 'feature.items.clear') return { removed: 0 }
          return {
            status: 'saved',
            name: 'image.webp',
            format: 'webp',
            width: 64,
            height: 64,
            bytes: 42
          }
        }
      }
    )

    await runtime.callLifecycle('onInit', []).promise
    await expect(
      runtime.callLifecycle('onFeatureTriggered', [
        'image-tools',
        {
          text: '64x64 q82',
          inputs: [
            {
              type: 'image',
              content: 'img_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              metadata: { name: 'portrait.png' }
            }
          ]
        }
      ]).promise
    ).resolves.toBe(true)
    const webp = items.find((item) =>
      (item.actions as Array<{ id: string }> | undefined)?.some(
        (action) => action.id === 'image-tools.save-webp'
      )
    )
    if (!webp) throw new Error('IMAGE_TOOLS_WEBP_ACTION_MISSING')
    expect(JSON.stringify(items)).not.toMatch(/rawContent|thumbnail|\"path\"|data:image/)
    await expect(
      runtime.callLifecycle('onItemAction', [JSON.parse(JSON.stringify(webp))]).promise
    ).resolves.toEqual({
      externalAction: true,
      success: true,
      status: 'saved',
      name: 'image.webp',
      format: 'webp',
      width: 64,
      height: 64,
      bytes: 42
    })
    expect(calls).toContainEqual([
      'media.image-tools',
      {
        token: 'img_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        format: 'webp',
        width: 64,
        height: 64,
        quality: 82
      }
    ])
    runtime.shutdown()
  })
})
