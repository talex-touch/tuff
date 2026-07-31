import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { describe, expect, it, vi } from 'vitest'
import {
  createPluginHostNexusService,
  createPluginRequestReplyCapabilities,
  type PluginHostNexusRequest
} from './plugin-host-request-reply'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import { HOST_PROTOCOL_VERSION, type HostMessageOwner } from './plugin-host-wire'

const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'request-reply-owner',
  hostGeneration: 11
}

const activation: PluginActivationIdentity = {
  name: 'touch-snippets',
  pluginInstanceId: 'snippets-instance',
  activationGeneration: 3,
  key: 'snippets-key'
}

const contentPackage = Object.freeze({
  id: 'pkg-1',
  pluginId: 'touch-snippets',
  kind: 'snippet-pack',
  title: 'Shared snippets',
  summary: 'Bounded fixture',
  schemaVersion: 1,
  visibility: 'public',
  manifest: Object.freeze({
    importTarget: 'touch-snippets',
    format: 'tuff.snippet-pack+json'
  }),
  contentInline: Object.freeze({
    format: 'tuff.snippet-pack+json',
    version: 1,
    title: 'Shared snippets',
    summary: 'Bounded fixture',
    pluginId: 'touch-snippets',
    kind: 'snippet-pack',
    schemaVersion: 1,
    createdAt: 1,
    snippets: Object.freeze([
      Object.freeze({
        id: 'snippet-1',
        type: 'text',
        title: 'Greeting',
        language: '',
        tags: Object.freeze(['shared']),
        content: 'hello',
        createdAt: 1,
        updatedAt: 1,
        useCount: 0
      })
    ]),
    skippedSensitiveCount: 0
  }),
  createdBy: 'account-1',
  status: 'published',
  installCount: 2,
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
  publishedAt: '2026-07-27T00:00:00.000Z'
})

function createNexusHarness(responseFor: (request: PluginHostNexusRequest) => unknown) {
  const requests: PluginHostNexusRequest[] = []
  const requestPinned = vi.fn(async (request: PluginHostNexusRequest) => {
    requests.push(request)
    return {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      data: await responseFor(request),
      url: request.url,
      ok: true
    }
  })
  const service = createPluginHostNexusService({
    getBaseUrl: () => 'https://nexus.example.test',
    getCredential: () => 'host-only-token',
    resolveAddresses: async () => ['203.0.113.10'],
    requestPinned
  })
  return { requestPinned, requests, service }
}

function createRegistry(
  options: {
    current?: PluginActivationIdentity
    authorize?: (pluginName: string, permissionId: string) => boolean
    authState?: () => unknown
    nexusResponse?: (request: PluginHostNexusRequest) => unknown
    quickOpsInvoke?: (operation: string, payload: unknown, signal: AbortSignal) => unknown
    flowDispatch?: (
      senderId: string,
      payload: unknown,
      options: unknown,
      signal: AbortSignal
    ) => unknown
  } = {}
) {
  const nexus = createNexusHarness(
    options.nexusResponse ??
      ((request) => {
        if (request.method === 'GET' && request.url.includes('?')) {
          return { packages: [contentPackage], total: 1, limit: 10, offset: 0 }
        }
        if (request.url.endsWith('/install')) return { package: contentPackage, installed: true }
        return { package: contentPackage }
      })
  )
  const capabilities = createPluginRequestReplyCapabilities({
    resolveCurrentActivation: () => options.current ?? activation,
    resolveHostGeneration: () => owner.hostGeneration,
    authState:
      options.authState ??
      (() => ({ isLoaded: true, isSignedIn: true, user: { id: 'user-1', name: 'Owner' } })),
    nexus: nexus.service,
    quickOps: Object.freeze({
      invoke:
        options.quickOpsInvoke ??
        (async (operation, payload) => ({ operation, payload, available: true }))
    }),
    flow: Object.freeze({
      dispatch:
        options.flowDispatch ??
        (async () => ({ sessionId: 'flow-1', state: 'ACKED', ackPayload: { stopped: true } }))
    })
  })
  const registry = new PluginHostCapabilityRegistry({
    owner,
    activation,
    resolveCurrentActivation: () => options.current ?? activation,
    authorize: options.authorize ?? (() => true),
    watchPermissionRevoked: () => () => undefined,
    onFatalViolation: () => undefined
  })
  for (const definition of capabilities.definitions) registry.register(definition)
  return { capabilities, nexus, registry }
}

describe('plugin host fixed request/reply capabilities', () => {
  it('registers only three fixed capability IDs with canonical permissions', () => {
    const { capabilities } = createRegistry()

    expect(
      capabilities.definitions.map((definition) => [definition.id, definition.permission])
    ).toEqual([
      ['channel.invoke', 'network.internet'],
      ['quick-ops.invoke', undefined],
      ['flow.invoke', 'storage.shared']
    ])
    expect(Object.isFrozen(capabilities.definitions)).toBe(true)
  })

  it('returns sanitized auth state and rejects credential-bearing host results', async () => {
    const clean = createRegistry()
    await expect(
      clean.registry.dispatch('channel.invoke', {
        operation: 'auth.session.get-state',
        payload: null
      })
    ).resolves.toEqual({
      operation: 'auth.session.get-state',
      data: { isLoaded: true, isSignedIn: true, user: { id: 'user-1', name: 'Owner' } }
    })

    const leaking = createRegistry({
      authState: () => ({
        isLoaded: true,
        isSignedIn: true,
        user: null,
        token: 'must-not-cross'
      })
    })
    await expect(
      leaking.registry.dispatch('channel.invoke', {
        operation: 'auth.session.get-state',
        payload: null
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_RESULT' })
  })

  it('owns CloudShare routes, credentials and base URL in main', async () => {
    const { nexus, registry } = createRegistry()

    await expect(
      registry.dispatch('channel.invoke', {
        operation: 'snippets.cloud.publish',
        payload: { pack: contentPackage.contentInline, visibility: 'public' }
      })
    ).resolves.toEqual({
      operation: 'snippets.cloud.publish',
      data: { package: contentPackage }
    })

    expect(nexus.requestPinned).toHaveBeenCalledTimes(1)
    expect(nexus.requests[0]).toMatchObject({
      method: 'POST',
      url: 'https://nexus.example.test/api/store/plugin-content',
      headers: {
        authorization: 'Bearer host-only-token',
        'content-type': 'application/json'
      }
    })
    expect(
      JSON.stringify(
        await registry.dispatch('channel.invoke', {
          operation: 'snippets.cloud.list',
          payload: { limit: 10 }
        })
      )
    ).not.toMatch(/host-only-token|authorization|cookie|api.?key/i)
  })

  it('accepts only strict IPv4 or parsed IPv6 resolver results before pinned requests', async () => {
    const createService = (addresses: readonly string[]) => {
      const requestPinned = vi.fn(async (request: PluginHostNexusRequest) => ({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: null,
        url: request.url,
        ok: true
      }))
      return {
        requestPinned,
        service: createPluginHostNexusService({
          getBaseUrl: () => 'https://nexus.example.test',
          getCredential: () => null,
          resolveAddresses: async () => addresses,
          requestPinned
        })
      }
    }

    for (const address of ['203.0.113.10', '2001:db8::1', '::ffff:192.0.2.1']) {
      const { requestPinned, service } = createService([address])
      await expect(
        service.listSnippets({ limit: 1 }, new AbortController().signal)
      ).resolves.toBeNull()
      expect(requestPinned).toHaveBeenCalledWith(
        expect.objectContaining({ resolvedAddresses: [address] })
      )
    }

    for (const address of ['nexus.example.test', '127.1', '01.2.3.4', '256.1.1.1', '1::2::3']) {
      const { requestPinned, service } = createService([address])
      await expect(
        service.listSnippets({ limit: 1 }, new AbortController().signal)
      ).rejects.toThrow('PLUGIN_HOST_OPERATION_UNAVAILABLE')
      expect(requestPinned).not.toHaveBeenCalled()
    }
  })

  it.each([
    {
      operation: 'snippets.cloud.list',
      payload: { limit: 10, baseUrl: 'http://127.0.0.1:8080' }
    },
    {
      operation: 'snippets.cloud.install',
      payload: { packageId: 'http://169.254.169.254/latest/meta-data' }
    },
    {
      operation: 'snippets.cloud.publish',
      payload: {
        pack: contentPackage.contentInline,
        headers: { authorization: 'Bearer child-token' }
      }
    }
  ])(
    'rejects child-selected route, SSRF or credential fields before network access',
    async (request) => {
      const { nexus, registry } = createRegistry()

      await expect(registry.dispatch('channel.invoke', request)).rejects.toMatchObject({
        code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
      })
      expect(nexus.requestPinned).not.toHaveBeenCalled()
    }
  )

  it('rejects sensitive and oversized packs before network access', async () => {
    const { nexus, registry } = createRegistry()
    const baseSnippet = contentPackage.contentInline.snippets[0]

    for (const content of ['api_key = hidden', 'x'.repeat(600 * 1024)]) {
      await expect(
        registry.dispatch('channel.invoke', {
          operation: 'snippets.cloud.publish',
          payload: {
            pack: {
              ...contentPackage.contentInline,
              snippets: [{ ...baseSnippet, content }]
            },
            visibility: 'public'
          }
        })
      ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' })
    }
    expect(nexus.requestPinned).not.toHaveBeenCalled()
  })

  it('propagates AbortSignal to the bounded Nexus request', async () => {
    let observedSignal: AbortSignal | undefined
    const { registry } = createRegistry({
      nexusResponse: (request) => {
        observedSignal = request.signal
        return new Promise(() => undefined)
      }
    })
    const controller = new AbortController()
    const pending = registry.dispatch(
      'channel.invoke',
      { operation: 'snippets.cloud.list', payload: { limit: 10 } },
      controller.signal
    )
    await vi.waitFor(() => expect(observedSignal).toBeDefined())
    controller.abort()

    await expect(pending).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_CANCELLED' })
    expect(observedSignal?.aborted).toBe(true)
  })

  it('denies stale authority before calling an operation service', async () => {
    const quickOpsInvoke = vi.fn()
    const { registry } = createRegistry({
      current: { ...activation, activationGeneration: activation.activationGeneration + 1 },
      quickOpsInvoke
    })

    await expect(
      registry.dispatch('quick-ops.invoke', { operation: 'capabilities.get', payload: null })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION' })
    expect(quickOpsInvoke).not.toHaveBeenCalled()
  })

  it('maps only fixed QuickOps operations and rejects unknown methods', async () => {
    const quickOpsInvoke = vi.fn(async (operation, payload) => ({ operation, payload }))
    const { registry } = createRegistry({ quickOpsInvoke })

    await expect(
      registry.dispatch('quick-ops.invoke', {
        operation: 'format-text.get',
        payload: { mode: 'snake', text: 'Hello World' }
      })
    ).resolves.toEqual({
      operation: 'format-text.get',
      data: { operation: 'format-text.get', payload: { mode: 'snake', text: 'Hello World' } }
    })
    await expect(
      registry.dispatch('quick-ops.invoke', {
        operation: 'transport.invoke',
        payload: { event: 'quick-ops:anything' }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' })
    expect(quickOpsInvoke).toHaveBeenCalledTimes(1)
  })

  it('binds Flow sender identity, fixed target allowlist and storage.shared permission', async () => {
    const flowDispatch = vi.fn(async () => ({ sessionId: 'flow-1', state: 'ACKED' }))
    const authorize = vi.fn(() => true)
    const { registry } = createRegistry({ authorize, flowDispatch })
    const payload = {
      type: 'json',
      data: {
        action: 'stop-timer',
        targetId: 'quickops.stop-timer',
        cleanup: true,
        statefulRuntime: true
      },
      context: { sourcePluginId: 'forged-plugin' }
    }
    const options = {
      preferredTarget: 'quickops.stop-timer',
      skipSelector: true,
      requireAck: true
    }

    await expect(
      registry.dispatch('flow.invoke', {
        operation: 'quickops.dispatch',
        payload: { payload, options }
      })
    ).resolves.toEqual({
      operation: 'quickops.dispatch',
      data: { sessionId: 'flow-1', state: 'ACKED' }
    })
    expect(authorize).toHaveBeenCalledWith('touch-snippets', 'storage.shared')
    expect(flowDispatch).toHaveBeenCalledWith(
      'touch-snippets',
      { ...payload, context: { sourcePluginId: 'touch-snippets' } },
      options,
      expect.any(AbortSignal)
    )

    await expect(
      registry.dispatch('flow.invoke', {
        operation: 'quickops.dispatch',
        payload: {
          payload,
          options: { ...options, preferredTarget: 'other-plugin.arbitrary-command' }
        }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' })
    expect(flowDispatch).toHaveBeenCalledTimes(1)
  })
})
