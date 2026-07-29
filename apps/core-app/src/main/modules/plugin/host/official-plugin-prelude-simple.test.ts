import type { PluginHostCapability } from './plugin-host-wire'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude, PluginHostChildError } from './plugin-host-child-runtime'

const pluginsRoot = path.resolve(process.cwd(), '../../plugins')
const SIMPLE_CAPABILITIES: readonly PluginHostCapability[] = [
  'permission.check',
  'feature.registry.add',
  'feature.items.push',
  'feature.items.clear',
  'storage.file.read',
  'storage.file.write',
  'storage.file.remove',
  'storage.file.list',
  'clipboard.write',
  'open-url',
  'http.request',
  'channel.invoke',
  'quick-ops.invoke',
  'flow.invoke',
  'process.spawn',
  'process.workspace-scripts',
  'system.invoke',
  'system.browser-open',
  'system.window-manager',
  'system.window-presets'
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
  systemActions: string[]
  snipasteActions: string[]
  windowPresetActions: string[]
  windowPresetStatusCalls: number
  windowManagerActions: string[]
  windowManagerListCalls: number
  browserOpenCalls: Array<{ url: string; browserToken?: string }>
  browserListCalls: number
  httpCalls: string[]
  workspaceScriptListCalls: number
  workspaceScriptRunTokens: string[]
  workspaceScriptSelectCalls: number
  grantedPermissions: Set<string>
}

function createHarness(
  pluginName: string,
  generation: number,
  files: Map<string, unknown> = new Map(),
  snapshotPlatform = 'darwin'
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
    systemActions: [],
    snipasteActions: [],
    windowPresetActions: [],
    windowPresetStatusCalls: 0,
    windowManagerActions: [],
    windowManagerListCalls: 0,
    browserOpenCalls: [],
    browserListCalls: 0,
    httpCalls: [],
    workspaceScriptListCalls: 0,
    workspaceScriptRunTokens: [],
    workspaceScriptSelectCalls: 0,
    grantedPermissions: new Set([
      'clipboard.write',
      'fs.read',
      'network.internet',
      'storage.plugin',
      'storage.shared',
      'system.shell'
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
        case 'feature.registry.add':
          return { added: true }
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
        case 'http.request': {
          if (state.denyNetwork) {
            throw Object.assign(new Error('/private/network denied'), {
              code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            })
          }
          const request = payload as { url: string }
          state.httpCalls.push(request.url)
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            data: ['tuff', ['tuff app', 'tuff plugin']],
            url: request.url,
            ok: true
          }
        }
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
        case 'process.spawn': {
          if (!state.grantedPermissions.has('system.shell')) {
            throw Object.assign(new Error('/private/process denied'), {
              code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            })
          }
          const request = payload as { operation: string; actionId: string }
          if (request.operation !== 'snipaste-action')
            throw new Error('unexpected process operation')
          state.snipasteActions.push(request.actionId)
          return { actionId: request.actionId, status: 'started' }
        }
        case 'process.workspace-scripts': {
          const request = payload as {
            operation: string
            workspaceToken?: string
            scriptToken?: string
          }
          const tokenCharacter = generation === 1 ? 'A' : 'B'
          const workspaceToken = `ws_${tokenCharacter.repeat(32)}`
          const scriptToken = `wss_${generation === 1 ? 'C'.repeat(32) : 'D'.repeat(32)}`
          if (request.operation === 'select-workspace') {
            state.workspaceScriptSelectCalls += 1
            return {
              operation: 'select-workspace',
              status: 'selected',
              workspace: { token: workspaceToken, name: `workspace-${generation}` }
            }
          }
          if (request.operation === 'list-scripts' && request.workspaceToken === workspaceToken) {
            state.workspaceScriptListCalls += 1
            return {
              operation: 'list-scripts',
              status: 'available',
              workspace: { token: workspaceToken, name: `workspace-${generation}` },
              scripts: [{ token: scriptToken, name: 'lint' }]
            }
          }
          if (request.operation === 'run-script' && request.scriptToken === scriptToken) {
            if (!state.grantedPermissions.has('system.shell')) {
              return { operation: 'run-script', status: 'blocked', reason: 'permission-denied' }
            }
            state.workspaceScriptRunTokens.push(request.scriptToken)
            return { operation: 'run-script', status: 'started', scriptName: 'lint' }
          }
          throw new Error('unexpected workspace script operation')
        }
        case 'system.browser-open': {
          const request = payload as { operation: string; url?: string; browserToken?: string }
          if (request.operation === 'list') {
            state.browserListCalls += 1
            return {
              operation: 'list',
              status: 'available',
              defaultAvailable: true,
              browsers: [
                {
                  id: 'chrome',
                  name: 'Chrome',
                  token: `bo_${generation === 1 ? 'A'.repeat(32) : 'B'.repeat(32)}`
                }
              ]
            }
          }
          if (request.operation !== 'open' || typeof request.url !== 'string') {
            throw new Error('unexpected browser-open operation')
          }
          state.browserOpenCalls.push({
            url: request.url,
            ...(request.browserToken ? { browserToken: request.browserToken } : {})
          })
          return { operation: 'open', status: 'completed' }
        }
        case 'system.invoke': {
          const request = payload as { operation: string; actionId: string }
          if (request.operation !== 'run-action') throw new Error('unexpected system operation')
          if (
            request.actionId !== 'open-main-window' &&
            !state.grantedPermissions.has('system.shell')
          ) {
            throw Object.assign(new Error('/private/system denied'), {
              code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            })
          }
          state.systemActions.push(request.actionId)
          return { actionId: request.actionId, status: 'started' }
        }
        case 'system.window-manager': {
          if (!state.grantedPermissions.has('system.shell')) {
            throw Object.assign(new Error('/private/window-manager denied'), {
              code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            })
          }
          const request = payload as { operation: string; action?: string; token?: string }
          if (request.operation === 'list') {
            state.windowManagerListCalls += 1
            const tokenCharacter = generation === 1 ? 'A' : 'B'
            return {
              operation: 'list',
              status: 'available',
              platform: 'win32',
              items: [
                {
                  kind: 'window',
                  token: `wm_${tokenCharacter.repeat(32)}`,
                  name: 'Terminal',
                  title: 'Workspace',
                  isFront: true,
                  topmost: false,
                  actions: ['activate', 'snap-left', 'close']
                },
                {
                  kind: 'app',
                  token: `wm_${generation === 1 ? 'C'.repeat(32) : 'D'.repeat(32)}`,
                  name: 'Terminal',
                  running: true,
                  actions: ['launch']
                }
              ]
            }
          }
          if (request.operation !== 'act' || !request.action || typeof request.token !== 'string') {
            throw new Error('unexpected window manager operation')
          }
          state.windowManagerActions.push(request.action)
          return { operation: 'act', action: request.action, status: 'completed' }
        }
        case 'system.window-presets': {
          if (!state.grantedPermissions.has('system.shell')) {
            throw Object.assign(new Error('/private/window-preset denied'), {
              code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            })
          }
          const request = payload as { operation: string; actionId?: string }
          if (request.operation === 'status') {
            state.windowPresetStatusCalls += 1
            return { operation: 'status', status: 'available', windowCount: 3 }
          }
          if (
            request.operation !== 'run-action' ||
            !request.actionId ||
            !['preset-two-column', 'preset-dev-split', 'preset-clear-topmost'].includes(
              request.actionId
            )
          ) {
            throw new Error('unexpected window preset operation')
          }
          state.windowPresetActions.push(request.actionId)
          return {
            operation: 'run-action',
            actionId: request.actionId,
            status: 'completed',
            affectedWindows: request.actionId === 'preset-clear-topmost' ? 3 : 2
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
        platform: snapshotPlatform,
        arch: snapshotPlatform === 'win32' ? 'x64' : 'arm64',
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

function fixedSystemActionItem(
  items: Array<Record<string, unknown>>,
  actionId: string
): Record<string, unknown> {
  const item = items.find(
    (entry) =>
      Array.isArray(entry.actions) &&
      entry.actions.some(
        (action) => (action as { payload?: { actionId?: string } }).payload?.actionId === actionId
      )
  )
  if (!item) throw new Error(`missing fixed system action item: ${actionId}`)
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

  it('touch-browser-open uses fresh opaque tokens, typed HTTP and default/specific browser actions', async () => {
    const files = new Map<string, unknown>([
      [
        'recent-browsers.json',
        {
          items: [
            {
              id: 'chrome',
              name: 'Stored Name',
              target: '/Applications/Calculator.app',
              lastUsedAt: Date.now()
            }
          ]
        }
      ]
    ])
    const first = createHarness('touch-browser-open', 1, files)
    await expect(first.runtime.callLifecycle('onInit', []).promise).resolves.toBeUndefined()
    await expect(
      first.runtime.callLifecycle('onFeatureTriggered', [
        'browser-open',
        { text: 'example.com' },
        { id: 'browser-open' }
      ]).promise
    ).resolves.toBe(true)
    expect(first.state.browserListCalls).toBe(1)
    expect(JSON.stringify(first.state.items)).not.toMatch(/Calculator|Applications|target/i)
    const browserItem = actionItem(first.state.items, 'open-browser')
    const browserAction = (browserItem.actions as Array<{ payload: Record<string, unknown> }>)[0]
    expect(browserAction.payload).toEqual({
      url: 'https://example.com/',
      browserToken: `bo_${'A'.repeat(32)}`
    })
    await expect(
      first.runtime.callLifecycle('onItemAction', [browserItem]).promise
    ).resolves.toMatchObject({ status: 'completed', success: true })
    expect(first.state.browserOpenCalls).toEqual([
      { url: 'https://example.com/', browserToken: `bo_${'A'.repeat(32)}` }
    ])
    expect(files.get('recent-browsers.json')).toMatchObject({
      items: [expect.objectContaining({ id: 'chrome', name: 'Chrome' })]
    })
    expect(JSON.stringify(files.get('recent-browsers.json'))).not.toMatch(
      /token|target|Applications/i
    )

    await expect(
      first.runtime.callLifecycle('onFeatureTriggered', [
        'search-engine-google',
        { text: 'google tuff' },
        { id: 'search-engine-google' }
      ]).promise
    ).resolves.toBe(true)
    expect(first.state.httpCalls).toHaveLength(1)
    await expect(
      first.runtime.callLifecycle('onItemAction', [actionItem(first.state.items, 'search-web')])
        .promise
    ).resolves.toMatchObject({ status: 'completed', success: true })
    expect(first.state.browserOpenCalls.at(-1)).toEqual({
      url: 'https://www.google.com/search?q=tuff'
    })

    const second = createHarness('touch-browser-open', 2, files)
    await second.runtime.callLifecycle('onFeatureTriggered', [
      'browser-open',
      { text: 'example.com' },
      { id: 'browser-open' }
    ]).promise
    const secondAction = (
      actionItem(second.state.items, 'open-browser').actions as Array<{
        payload: { browserToken: string }
      }>
    )[0]
    expect(secondAction.payload.browserToken).toBe(`bo_${'B'.repeat(32)}`)
    expect(secondAction.payload.browserToken).not.toBe(`bo_${'A'.repeat(32)}`)
    first.runtime.shutdown()
    second.runtime.shutdown()
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

  it('touch-quick-actions initializes, publishes and executes only fixed system action IDs', async () => {
    const first = createHarness('touch-quick-actions', 1)
    await expect(first.runtime.callLifecycle('onInit', []).promise).resolves.toBeUndefined()
    await expect(
      first.runtime.callLifecycle('onFeatureTriggered', [
        'quick-actions',
        { text: '' },
        { id: 'quick-actions' }
      ]).promise
    ).resolves.toBe(true)
    const lockItem = actionItem(first.state.items, 'run-action')

    first.state.grantedPermissions.delete('system.shell')
    await expect(
      first.runtime.callLifecycle('onItemAction', [lockItem, { actionId: 'run-action' }]).promise
    ).resolves.toMatchObject({ status: 'blocked', reason: 'permission-denied' })
    expect(first.state.systemActions).toEqual([])

    first.state.grantedPermissions.add('system.shell')
    await expect(
      first.runtime.callLifecycle('onItemAction', [lockItem, { actionId: 'run-action' }]).promise
    ).resolves.toMatchObject({ status: 'started', success: true })
    expect(first.state.systemActions).toEqual(['restart'])
    first.runtime.shutdown()

    const second = createHarness('touch-quick-actions', 2)
    await second.runtime.callLifecycle('onInit', []).promise
    await second.runtime.callLifecycle('onFeatureTriggered', [
      'quick-action-lock-screen',
      { text: '' },
      { id: 'quick-action-lock-screen' }
    ]).promise
    expect(second.state.systemActions).toEqual(['lock-screen'])
    await expect(first.runtime.callLifecycle('onItemAction', [lockItem]).promise).rejects.toEqual(
      new PluginHostChildError('PLUGIN_HOST_CHILD_CLOSED')
    )
    second.runtime.shutdown()
  })

  it('touch-snipaste publishes and executes only fixed process actions across generations', async () => {
    const first = createHarness('touch-snipaste', 1)
    await expect(first.runtime.callLifecycle('onInit', []).promise).resolves.toBeUndefined()
    await expect(
      first.runtime.callLifecycle('onFeatureTriggered', [
        'snipaste-quick',
        { text: '截图' },
        { id: 'snipaste-quick' }
      ]).promise
    ).resolves.toBe(true)
    const snipItem = fixedSystemActionItem(first.state.items, 'snip')

    first.state.grantedPermissions.delete('system.shell')
    await expect(
      first.runtime.callLifecycle('onItemAction', [snipItem, { actionId: 'run-action' }]).promise
    ).resolves.toMatchObject({ status: 'blocked', reason: 'permission-denied' })
    expect(first.state.snipasteActions).toEqual([])

    first.state.grantedPermissions.add('system.shell')
    await expect(
      first.runtime.callLifecycle('onItemAction', [snipItem, { actionId: 'run-action' }]).promise
    ).resolves.toMatchObject({ status: 'started', success: true })
    expect(first.state.snipasteActions).toEqual(['snip'])
    first.runtime.shutdown()

    const second = createHarness('touch-snipaste', 2)
    await second.runtime.callLifecycle('onFeatureTriggered', [
      'snipaste-quick',
      { text: '贴图' },
      { id: 'snipaste-quick' }
    ]).promise
    const pasteItem = fixedSystemActionItem(second.state.items, 'paste')
    await expect(
      second.runtime.callLifecycle('onItemAction', [pasteItem, { actionId: 'run-action' }]).promise
    ).resolves.toMatchObject({ status: 'started' })
    await expect(
      first.runtime.callLifecycle('onItemAction', [snipItem, { actionId: 'run-action' }]).promise
    ).rejects.toEqual(new PluginHostChildError('PLUGIN_HOST_CHILD_CLOSED'))
    expect(second.state.snipasteActions).toEqual(['paste'])
    second.runtime.shutdown()
  })

  it('touch-system-actions isolates fixed shell and main-window actions across generations', async () => {
    const first = createHarness('touch-system-actions', 1)
    await expect(first.runtime.callLifecycle('onInit', []).promise).resolves.toBeUndefined()
    await expect(
      first.runtime.callLifecycle('onFeatureTriggered', [
        'system-actions',
        { text: '' },
        { id: 'system-actions' }
      ]).promise
    ).resolves.toBe(true)

    first.state.grantedPermissions.delete('system.shell')
    await expect(
      first.runtime.callLifecycle('onItemAction', [
        fixedSystemActionItem(first.state.items, 'open-main-window'),
        { actionId: 'run-action' }
      ]).promise
    ).resolves.toMatchObject({ status: 'started', success: true })
    expect(first.state.systemActions).toEqual(['open-main-window'])

    await expect(
      first.runtime.callLifecycle('onItemAction', [
        fixedSystemActionItem(first.state.items, 'lock-screen'),
        { actionId: 'run-action' }
      ]).promise
    ).resolves.toMatchObject({ status: 'blocked', reason: 'permission-denied' })
    expect(first.state.systemActions).toEqual(['open-main-window'])

    first.state.grantedPermissions.add('system.shell')
    await expect(
      first.runtime.callLifecycle('onItemAction', [
        fixedSystemActionItem(first.state.items, 'volume-up'),
        { actionId: 'run-action' }
      ]).promise
    ).resolves.toMatchObject({ status: 'started', success: true })
    expect(first.state.systemActions).toEqual(['open-main-window', 'volume-up'])
    first.runtime.shutdown()

    const second = createHarness('touch-system-actions', 2)
    await second.runtime.callLifecycle('onInit', []).promise
    await second.runtime.callLifecycle('onFeatureTriggered', [
      'system-actions',
      { text: '主窗口' },
      { id: 'system-actions' }
    ]).promise
    await expect(
      second.runtime.callLifecycle('onItemAction', [
        fixedSystemActionItem(second.state.items, 'open-main-window'),
        { actionId: 'run-action' }
      ]).promise
    ).resolves.toMatchObject({ status: 'started' })
    await expect(
      first.runtime.callLifecycle('onFeatureTriggered', ['system-actions', { text: '' }]).promise
    ).rejects.toEqual(new PluginHostChildError('PLUGIN_HOST_CHILD_CLOSED'))
    expect(second.state.systemActions).toEqual(['open-main-window'])
    second.runtime.shutdown()
  })

  it('touch-workspace-scripts selects, lists and runs only generation-local opaque tokens', async () => {
    const first = createHarness('touch-workspace-scripts', 1)
    await expect(
      first.runtime.callLifecycle('onFeatureTriggered', [
        'workspace-scripts',
        { text: '' },
        { id: 'workspace-scripts' }
      ]).promise
    ).resolves.toBe(true)
    const selectItem = actionItem(first.state.items, 'select-workspace')
    await expect(
      first.runtime.callLifecycle('onItemAction', [selectItem, { actionId: 'select-workspace' }])
        .promise
    ).resolves.toMatchObject({ status: 'completed', success: true })
    expect(first.state.workspaceScriptSelectCalls).toBe(1)
    expect(first.state.workspaceScriptListCalls).toBe(1)
    expect(JSON.stringify(first.state.items)).not.toMatch(/command|cwd|path|executable|args|env/i)
    const runItem = actionItem(first.state.items, 'run-script')

    first.state.grantedPermissions.delete('system.shell')
    await expect(
      first.runtime.callLifecycle('onItemAction', [runItem, { actionId: 'run-script' }]).promise
    ).resolves.toMatchObject({ status: 'blocked', reason: 'permission-denied' })
    expect(first.state.workspaceScriptRunTokens).toEqual([])

    first.state.grantedPermissions.add('system.shell')
    await expect(
      first.runtime.callLifecycle('onItemAction', [runItem, { actionId: 'run-script' }]).promise
    ).resolves.toMatchObject({ status: 'started', success: true })
    expect(first.state.workspaceScriptRunTokens).toEqual([`wss_${'C'.repeat(32)}`])
    first.runtime.shutdown()

    const second = createHarness('touch-workspace-scripts', 2)
    await second.runtime.callLifecycle('onFeatureTriggered', [
      'workspace-scripts',
      { text: '' },
      { id: 'workspace-scripts' }
    ]).promise
    const secondSelect = actionItem(second.state.items, 'select-workspace')
    await second.runtime.callLifecycle('onItemAction', [
      secondSelect,
      { actionId: 'select-workspace' }
    ]).promise
    await expect(
      first.runtime.callLifecycle('onItemAction', [runItem, { actionId: 'run-script' }]).promise
    ).rejects.toEqual(new PluginHostChildError('PLUGIN_HOST_CHILD_CLOSED'))
    expect(second.state.workspaceScriptRunTokens).toEqual([])
    second.runtime.shutdown()
  })

  it('touch-window-manager publishes redacted tokens and dispatches fixed actions across generations', async () => {
    const first = createHarness('touch-window-manager', 1, new Map(), 'win32')
    await expect(
      first.runtime.callLifecycle('onFeatureTriggered', [
        'window-app',
        { text: 'Terminal' },
        { id: 'window-app' }
      ]).promise
    ).resolves.toBe(true)
    expect(first.state.windowManagerListCalls).toBe(1)
    expect(JSON.stringify(first.state.items)).not.toMatch(
      /nativeId|handle|pid|appPath|Program Files/i
    )
    const windowItem = first.state.items.find(
      (item) =>
        Array.isArray(item.actions) && item.actions.some((action) => action.id === 'snap-left')
    )
    expect(windowItem).toBeDefined()

    first.state.grantedPermissions.delete('system.shell')
    await expect(
      first.runtime.callLifecycle('onItemAction', [windowItem, { actionId: 'snap-left' }]).promise
    ).resolves.toMatchObject({ status: 'blocked', reason: 'permission-denied' })
    expect(first.state.windowManagerActions).toEqual([])

    first.state.grantedPermissions.add('system.shell')
    await expect(
      first.runtime.callLifecycle('onItemAction', [windowItem, { actionId: 'snap-left' }]).promise
    ).resolves.toMatchObject({ status: 'completed', success: true })
    expect(first.state.windowManagerActions).toEqual(['snap-left'])
    first.runtime.shutdown()

    const second = createHarness('touch-window-manager', 2, new Map(), 'win32')
    await second.runtime.callLifecycle('onFeatureTriggered', [
      'window-app',
      { text: '' },
      { id: 'window-app' }
    ]).promise
    const launchItem = second.state.items.find(
      (item) => Array.isArray(item.actions) && item.actions.some((action) => action.id === 'launch')
    )
    await expect(
      second.runtime.callLifecycle('onItemAction', [launchItem, { actionId: 'launch' }]).promise
    ).resolves.toMatchObject({ status: 'completed' })
    await expect(
      first.runtime.callLifecycle('onItemAction', [windowItem, { actionId: 'activate' }]).promise
    ).rejects.toEqual(new PluginHostChildError('PLUGIN_HOST_CHILD_CLOSED'))
    expect(second.state.windowManagerActions).toEqual(['launch'])
    second.runtime.shutdown()
  })

  it('touch-window-presets publishes status and dispatches only fixed presets across generations', async () => {
    const first = createHarness('touch-window-presets', 1, new Map(), 'win32')
    await expect(first.runtime.callLifecycle('onInit', []).promise).resolves.toBeUndefined()
    await expect(
      first.runtime.callLifecycle('onFeatureTriggered', [
        'window-presets',
        { text: 'dev' },
        { id: 'window-presets' }
      ]).promise
    ).resolves.toBe(true)
    expect(first.state.windowPresetStatusCalls).toBe(1)
    const devPreset = first.state.items.find(
      (item) => item.actions?.[0]?.payload?.actionId === 'preset-dev-split'
    )
    expect(devPreset).toBeDefined()

    first.state.grantedPermissions.delete('system.shell')
    await expect(
      first.runtime.callLifecycle('onItemAction', [devPreset, { actionId: 'run-action' }]).promise
    ).resolves.toMatchObject({ status: 'blocked', reason: 'permission-denied' })
    expect(first.state.windowPresetActions).toEqual([])

    first.state.grantedPermissions.add('system.shell')
    await expect(
      first.runtime.callLifecycle('onItemAction', [devPreset, { actionId: 'run-action' }]).promise
    ).resolves.toMatchObject({ status: 'completed', success: true })
    expect(first.state.windowPresetActions).toEqual(['preset-dev-split'])
    first.runtime.shutdown()

    const second = createHarness('touch-window-presets', 2, new Map(), 'win32')
    await second.runtime.callLifecycle('onFeatureTriggered', [
      'window-presets',
      { text: 'topmost' },
      { id: 'window-presets' }
    ]).promise
    const clearPreset = second.state.items.find(
      (item) => item.actions?.[0]?.payload?.actionId === 'preset-clear-topmost'
    )
    await expect(
      second.runtime.callLifecycle('onItemAction', [clearPreset, { actionId: 'run-action' }])
        .promise
    ).resolves.toMatchObject({ status: 'completed' })
    await expect(
      first.runtime.callLifecycle('onItemAction', [devPreset, { actionId: 'run-action' }]).promise
    ).rejects.toEqual(new PluginHostChildError('PLUGIN_HOST_CHILD_CLOSED'))
    expect(second.state.windowPresetActions).toEqual(['preset-clear-topmost'])
    second.runtime.shutdown()
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
