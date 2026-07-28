import type { PluginHostCapability } from './plugin-host-wire'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude, PluginHostChildError } from './plugin-host-child-runtime'

const pluginsRoot = path.resolve(process.cwd(), '../../plugins')
const SIMPLE_CAPABILITIES: readonly PluginHostCapability[] = [
  'permission.check',
  'feature.items.push',
  'feature.items.clear',
  'storage.file.read',
  'storage.file.write',
  'storage.file.remove',
  'storage.file.list',
  'clipboard.write',
  'open-url',
  'channel.invoke',
  'quick-ops.invoke',
  'flow.invoke'
]

interface HarnessState {
  items: Array<Record<string, unknown>>
  files: Map<string, unknown>
  clipboard: string[]
  opened: string[]
  denyClipboard: boolean
  denyOpenUrl: boolean
  denyNetwork: boolean
  denyFlow: boolean
  flowCalls: Array<Record<string, unknown>>
  grantedPermissions: Set<string>
}

function createHarness(
  pluginName: string,
  generation: number,
  files: Map<string, unknown> = new Map()
) {
  const state: HarnessState = {
    items: [],
    files,
    clipboard: [],
    opened: [],
    denyClipboard: false,
    denyOpenUrl: false,
    denyNetwork: false,
    denyFlow: false,
    flowCalls: [],
    grantedPermissions: new Set([
      'clipboard.write',
      'network.internet',
      'storage.plugin',
      'storage.shared'
    ])
  }
  const invokeCapability = vi.fn(
    async (capability: PluginHostCapability, payload: unknown): Promise<unknown> => {
      switch (capability) {
        case 'permission.check':
          return {
            granted: state.grantedPermissions.has(
              (payload as { permissionId: string }).permissionId
            )
          }
        case 'feature.items.clear': {
          const removed = state.items.length
          state.items = []
          return { removed }
        }
        case 'feature.items.push':
          state.items = (payload as { items: Array<Record<string, unknown>> }).items
          return { ok: true }
        case 'storage.file.read': {
          const name = (payload as { name: string }).name
          return state.files.has(name)
            ? { found: true, value: state.files.get(name) }
            : { found: false }
        }
        case 'storage.file.write': {
          const request = payload as { name: string; value: unknown }
          state.files.set(request.name, request.value)
          return { ok: true }
        }
        case 'storage.file.remove':
          return { removed: state.files.delete((payload as { name: string }).name) }
        case 'storage.file.list':
          return { names: [...state.files.keys()].sort() }
        case 'clipboard.write':
          if (state.denyClipboard) {
            throw Object.assign(new Error('/private/clipboard denied'), {
              code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            })
          }
          state.clipboard.push((payload as { content: { text: string } }).content.text)
          return { ok: true }
        case 'open-url':
          if (state.denyOpenUrl) {
            throw Object.assign(new Error('/private/open denied'), {
              code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            })
          }
          state.opened.push((payload as { url: string }).url)
          return { opened: true, protocol: 'https:' }
        case 'channel.invoke': {
          if (state.denyNetwork) {
            throw Object.assign(new Error('/private/network denied'), {
              code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            })
          }
          const request = payload as { operation: string; payload: Record<string, unknown> | null }
          if (request.operation === 'auth.session.get-state') {
            return {
              operation: request.operation,
              data: { isLoaded: true, isSignedIn: true, user: { id: 'user-1', name: 'Owner' } }
            }
          }
          if (request.operation === 'snippets.cloud.list') {
            return {
              operation: request.operation,
              data: {
                packages: [
                  {
                    id: 'pkg-1',
                    title: 'Fixture pack',
                    summary: 'Cloud fixture',
                    installCount: 1
                  }
                ],
                total: 1,
                limit: 10,
                offset: 0
              }
            }
          }
          if (request.operation === 'snippets.cloud.publish') {
            return { operation: request.operation, data: { package: { id: 'pkg-published' } } }
          }
          if (request.operation === 'snippets.cloud.install') {
            return {
              operation: request.operation,
              data: {
                installed: true,
                package: {
                  id: 'pkg-1',
                  contentInline: {
                    format: 'tuff.snippet-pack+json',
                    snippets: [{ id: 'cloud-one', title: 'Cloud One', content: 'cloud text' }]
                  }
                }
              }
            }
          }
          throw new Error(`unexpected channel operation: ${request.operation}`)
        }
        case 'quick-ops.invoke': {
          const request = payload as { operation: string; payload: unknown }
          const data =
            request.operation === 'capabilities.get'
              ? { platform: 'darwin', enabled: true, entries: [] }
              : request.operation === 'sessions.get'
                ? { state: 'idle', count: 0, text: 'idle', sessions: [] }
                : { state: 'degraded', degradedReason: 'fixture-unavailable' }
          return { operation: request.operation, data }
        }
        case 'flow.invoke': {
          if (state.denyFlow) {
            throw Object.assign(new Error('/private/flow denied'), {
              code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            })
          }
          const request = payload as {
            operation: string
            payload: { payload: Record<string, unknown>; options: Record<string, unknown> }
          }
          state.flowCalls.push(request.payload)
          return {
            operation: request.operation,
            data: { sessionId: `flow-${generation}`, state: 'ACKED', ackPayload: { stopped: true } }
          }
        }
        default:
          throw new Error(`unexpected capability: ${capability}`)
      }
    }
  )
  const scriptContent = readFileSync(path.join(pluginsRoot, pluginName, 'index.js'), 'utf8')
  const runtime = loadPluginPrelude(
    {
      scriptContent,
      snapshot: {
        platform: 'darwin',
        arch: 'arm64',
        locale: 'zh-CN',
        manifest: { name: pluginName, activationGeneration: generation }
      },
      capabilityManifest: SIMPLE_CAPABILITIES.map((id) => ({
        id,
        callbackLifetime: 'transient',
        callbackFields: []
      })),
      callbackLimits: {
        maxCallbacks: 64,
        maxConcurrentCallbacks: 16,
        maxResources: 32
      }
    },
    { invokeCapability }
  )
  return { invokeCapability, runtime, state }
}

function actionItem(
  items: Array<Record<string, unknown>>,
  actionId: string
): Record<string, unknown> {
  const item = items.find(
    (entry) =>
      Array.isArray(entry.actions) &&
      entry.actions.some((action) => (action as { id?: string }).id === actionId)
  )
  if (!item) throw new Error(`missing action item: ${actionId}`)
  return item
}

describe('official simple Prelude isolation regression', () => {
  it.each([
    ['touch-dev-utils', 'dev-utils', 'camel case'],
    ['touch-text-tools', 'text-tools-convert', 'abc']
  ] as const)(
    '%s enables, triggers, denies/grants clipboard and disables',
    async (name, featureId, query) => {
      const harness = createHarness(name, 1)
      await expect(
        harness.runtime.callLifecycle('onFeatureTriggered', [
          featureId,
          { text: query },
          { id: featureId }
        ]).promise
      ).resolves.toBe(true)
      const item = harness.state.items.find(
        (entry) => Array.isArray(entry.actions) && entry.actions.length > 0
      )!

      harness.state.denyClipboard = true
      await expect(
        harness.runtime.callLifecycle('onItemAction', [item]).promise
      ).resolves.toMatchObject({
        status: 'blocked',
        reason: 'permission-denied'
      })
      expect(harness.state.clipboard).toEqual([])

      harness.state.denyClipboard = false
      await expect(
        harness.runtime.callLifecycle('onItemAction', [item]).promise
      ).resolves.toMatchObject({
        status: 'started'
      })
      expect(harness.state.clipboard).toHaveLength(1)
      harness.runtime.shutdown()
    }
  )

  it('touch-browser-bookmarks isolates storage, permission checks, open and copy actions', async () => {
    const harness = createHarness('touch-browser-bookmarks', 1)
    await expect(harness.runtime.callLifecycle('onInit', []).promise).resolves.toBeUndefined()
    await expect(
      harness.runtime.callLifecycle('onFeatureTriggered', [
        'browser-bookmarks',
        { text: 'example.com' },
        { id: 'browser-bookmarks' }
      ]).promise
    ).resolves.toBe(true)

    harness.state.denyOpenUrl = true
    await expect(
      harness.runtime.callLifecycle('onItemAction', [actionItem(harness.state.items, 'open-url')])
        .promise
    ).resolves.toMatchObject({ status: 'blocked', reason: 'permission-denied' })
    harness.state.denyOpenUrl = false
    await expect(
      harness.runtime.callLifecycle('onItemAction', [actionItem(harness.state.items, 'open-url')])
        .promise
    ).resolves.toMatchObject({ status: 'started' })
    expect(harness.state.opened).toEqual(['https://example.com/'])
    expect(harness.state.files.get('recent-urls.json')).toMatchObject({
      items: [expect.objectContaining({ url: 'https://example.com/' })]
    })
    harness.runtime.shutdown()
  })

  it('touch-dev-toolbox reads storage and gates open-url through the host', async () => {
    const files = new Map<string, unknown>([
      ['toolbox.json', { links: [{ title: 'Docs', url: 'https://example.com/docs' }] }]
    ])
    const harness = createHarness('touch-dev-toolbox', 1, files)
    await expect(harness.runtime.callLifecycle('onInit', []).promise).resolves.toBeUndefined()
    await expect(
      harness.runtime.callLifecycle('onFeatureTriggered', [
        'dev-toolbox',
        { text: 'Docs' },
        { id: 'dev-toolbox' }
      ]).promise
    ).resolves.toBe(true)
    const item = actionItem(harness.state.items, 'open-link')

    harness.state.denyOpenUrl = true
    await expect(
      harness.runtime.callLifecycle('onItemAction', [item]).promise
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'permission-denied'
    })
    harness.state.denyOpenUrl = false
    await expect(
      harness.runtime.callLifecycle('onItemAction', [item]).promise
    ).resolves.toMatchObject({
      status: 'started'
    })
    expect(harness.state.opened).toEqual(['https://example.com/docs'])
    harness.runtime.shutdown()
  })

  it('touch-snippets isolates storage, host-owned cloud operations and clipboard grants', async () => {
    const files = new Map<string, unknown>()
    const first = createHarness('touch-snippets', 1, files)
    await expect(first.runtime.callLifecycle('onInit', []).promise).resolves.toBeUndefined()
    expect(files.has('snippets.json')).toBe(true)

    await first.runtime.callLifecycle('onFeatureTriggered', [
      'snippets-manage',
      { text: '' },
      { id: 'snippets-manage' }
    ]).promise
    const cloudList = actionItem(first.state.items, 'cloud-list')

    first.state.denyNetwork = true
    await expect(
      first.runtime.callLifecycle('onItemAction', [cloudList]).promise
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'permission-denied'
    })
    first.state.denyNetwork = false
    await expect(
      first.runtime.callLifecycle('onItemAction', [cloudList]).promise
    ).resolves.toMatchObject({
      status: 'started'
    })
    const cloudInstall = actionItem(first.state.items, 'cloud-install')
    await expect(
      first.runtime.callLifecycle('onItemAction', [cloudInstall]).promise
    ).resolves.toMatchObject({
      status: 'started'
    })
    expect(files.get('snippets.json')).toMatchObject({
      snippets: expect.arrayContaining([expect.objectContaining({ id: 'cloud-one' })])
    })

    await first.runtime.callLifecycle('onFeatureTriggered', [
      'snippets-search',
      { text: 'Cloud One' },
      { id: 'snippets-search' }
    ]).promise
    const copy = first.state.items.find(
      (entry) => (entry.meta as { defaultAction?: string } | undefined)?.defaultAction === 'copy'
    )!
    first.state.denyClipboard = true
    await expect(
      first.runtime.callLifecycle('onItemAction', [copy]).promise
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'permission-denied'
    })
    first.state.denyClipboard = false
    await expect(
      first.runtime.callLifecycle('onItemAction', [copy]).promise
    ).resolves.toMatchObject({
      status: 'started'
    })
    expect(first.state.clipboard).toContain('cloud text')

    first.runtime.shutdown()
    const second = createHarness('touch-snippets', 2, files)
    await expect(second.runtime.callLifecycle('onInit', []).promise).resolves.toBeUndefined()
    await expect(first.runtime.callLifecycle('onItemAction', [copy]).promise).rejects.toEqual(
      new PluginHostChildError('PLUGIN_HOST_CHILD_CLOSED')
    )
    expect(second.state.clipboard).toEqual([])
    second.runtime.shutdown()
  })

  it('touch-quickops reads through fixed operations and dispatches only granted Flow work', async () => {
    const harness = createHarness('touch-quickops', 1)
    await expect(
      harness.runtime.callLifecycle('onFeatureTriggered', [
        'quickops',
        { text: 'quickops' },
        { id: 'quickops' }
      ]).promise
    ).resolves.toBe(true)
    expect(harness.state.items[0]).toMatchObject({
      render: { basic: { title: 'QuickOps 能力摘要' } }
    })

    await harness.runtime.callLifecycle('onFeatureTriggered', [
      'quickops',
      { text: 'stop timer' },
      { id: 'quickops' }
    ]).promise
    const flowItem = actionItem(harness.state.items, 'quickops-flow-action')
    harness.state.denyFlow = true
    await expect(
      harness.runtime.callLifecycle('onItemAction', [flowItem]).promise
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'permission-denied'
    })
    expect(harness.state.flowCalls).toEqual([])

    harness.state.denyFlow = false
    await expect(
      harness.runtime.callLifecycle('onItemAction', [flowItem]).promise
    ).resolves.toMatchObject({
      status: 'ACKED',
      success: true
    })
    expect(harness.state.flowCalls).toHaveLength(1)
    harness.runtime.shutdown()
  })

  it('rotates generations and rejects work from a closed old runtime without state crossover', async () => {
    const first = createHarness('touch-dev-utils', 1)
    await first.runtime.callLifecycle('onFeatureTriggered', [
      'dev-utils',
      { text: 'first generation' },
      { id: 'dev-utils' }
    ]).promise
    const staleItem = first.state.items[0]
    first.runtime.shutdown()

    const second = createHarness('touch-dev-utils', 2)
    await second.runtime.callLifecycle('onFeatureTriggered', [
      'dev-utils',
      { text: 'second generation' },
      { id: 'dev-utils' }
    ]).promise
    await expect(first.runtime.callLifecycle('onItemAction', [staleItem]).promise).rejects.toEqual(
      new PluginHostChildError('PLUGIN_HOST_CHILD_CLOSED')
    )
    expect(second.state.clipboard).toEqual([])
    expect(second.state.items.length).toBeGreaterThan(0)
    second.runtime.shutdown()
  })
})
