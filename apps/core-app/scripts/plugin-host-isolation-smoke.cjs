const { existsSync, mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { app } = require('electron')
const { buildSync } = require('esbuild')

const SUCCESS = 'PLUGIN_HOST_ISOLATION_SMOKE_OK'
const FAILURE = 'PLUGIN_HOST_ISOLATION_SMOKE_FAILED'

function assert(condition) {
  if (!condition) throw new Error(FAILURE)
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(FAILURE)
    await delay(20)
  }
}

function createObservedFactory(realFactory) {
  const observers = []
  return {
    observers,
    artifactExists: (artifactPath) => realFactory.artifactExists(artifactPath),
    spawn(options) {
      const spawned = realFactory.spawn(options)
      const listeners = new Set()
      const sent = []
      const controlPort = {
        postMessage(message) {
          sent.push(message)
          spawned.controlPort.postMessage(message)
        },
        onMessage(listener) {
          listeners.add(listener)
          const dispose = spawned.controlPort.onMessage(listener)
          return () => {
            listeners.delete(listener)
            dispose()
          }
        },
        start: () => spawned.controlPort.start(),
        close: () => spawned.controlPort.close()
      }
      observers.push({
        sent,
        listenerCount: () => listeners.size,
        inject(message) {
          for (const listener of [...listeners]) listener(message)
        }
      })
      return { ...spawned, controlPort }
    }
  }
}

function activation(name, generation) {
  return {
    name,
    pluginInstanceId: `${name}-instance`,
    activationGeneration: generation,
    key: `${name}-activation-key-${generation}`
  }
}

const PRELUDE = `
let initialized = false
let subscription = null
module.exports = {
  onInit(signal) {
    initialized = true
    return { initialized, aborted: signal.aborted }
  },
  async onMessage(command) {
    if (command === 'capability') {
      return hostCapabilities.invoke('plugin.info.get', { source: 'alpha-child' })
    }
    if (command === 'scoped-cancel') {
      return hostCapabilities.invoke('plugin.info.get', { scopedCancel: true })
    }
    if (command === 'callback') {
      return hostCapabilities.invoke('plugin.info.get', {
        callback: async (value) => ({ value, processType: typeof process })
      })
    }
    if (command === 'callback-throw') {
      return hostCapabilities.invoke('plugin.info.get', {
        callback: () => { throw new Error('/private/child-callback-detail') }
      })
    }
    if (command === 'callback-scoped-cancel') {
      return hostCapabilities.invoke('plugin.info.get', {
        callback: () => hostCapabilities.invoke('plugin.info.get', { callbackScopedCancel: true })
      })
    }
    if (command === 'subscribe') {
      subscription = await hostCapabilities.invoke('channel.subscribe', {
        callback: async (value) => ({ retained: value, processType: typeof process })
      })
      return { id: subscription.id, kind: subscription.kind, frozen: Object.isFrozen(subscription) }
    }
    if (command === 'dispose-subscription') {
      await subscription.dispose()
      await subscription.dispose()
      return { disposed: true }
    }
    if (command === 'denied-capability') {
      try {
        await hostCapabilities.invoke('plugin.info.get', { source: 'beta-child' })
        return { denied: false }
      } catch (error) {
        return { denied: true, code: error.code }
      }
    }
    if (command === 'hang') return new Promise(() => {})
    if (command && typeof command.delay === 'number') {
      return new Promise((resolve) => setTimeout(() => resolve({ tag: command.tag }), command.delay))
    }
    return { initialized, echo: command }
  },
  onDestroy() {
    initialized = false
  }
}
`

async function run() {
  const appRoot = path.resolve(__dirname, '..')
  const artifactPath = path.join(appRoot, 'out', 'main', 'plugin-host.js')
  const bundleRoot = mkdtempSync(path.join(tmpdir(), 'tuff-plugin-host-smoke-'))
  const supportPath = path.join(bundleRoot, 'plugin-host-smoke-support.cjs')
  let hosts = []

  try {
    buildSync({
      stdin: {
        contents: `
          export { PluginRuntimeHost } from '../src/main/modules/plugin/host/plugin-runtime-host'
          export { PluginHostCapabilityRegistry } from '../src/main/modules/plugin/host/plugin-host-capabilities'
          export { createPluginBusinessCapabilities } from '../src/main/modules/plugin/host/plugin-business-capabilities'
          export { createPluginRequestReplyCapabilities } from '../src/main/modules/plugin/host/plugin-host-request-reply'
          export { PluginHostResourceRegistry } from '../src/main/modules/plugin/host/plugin-host-resources'
          export { ElectronPluginRuntimeProcessFactory } from '../src/main/modules/plugin/host/plugin-runtime-electron-process'
        `,
        resolveDir: __dirname,
        sourcefile: 'plugin-host-smoke-support.ts'
      },
      bundle: true,
      external: ['electron'],
      format: 'cjs',
      logLevel: 'silent',
      outfile: supportPath,
      platform: 'node',
      target: 'node22'
    })

    const {
      createPluginBusinessCapabilities,
      createPluginRequestReplyCapabilities,
      ElectronPluginRuntimeProcessFactory,
      PluginHostCapabilityRegistry,
      PluginHostResourceRegistry,
      PluginRuntimeHost
    } = require(supportPath)
    const factory = createObservedFactory(new ElectronPluginRuntimeProcessFactory())
    const limits = {
      handshakeTimeoutMs: 3000,
      loadTimeoutMs: 3000,
      lifecycleTimeoutMs: 2000,
      shutdownTimeoutMs: 500,
      cancelGraceMs: 100,
      callbackTimeoutMs: 100
    }

    const capabilityCalls = new Map()
    const createHost = (name, generation, capabilityManifest) => {
      const calls = []
      let retainedCallback = null
      let disposedResources = 0
      const activationIdentity = activation(name, generation)
      const runtimeOwner = {
        protocolVersion: 2,
        activationHandle: `${name}-host-handle-${generation}`,
        hostGeneration: generation
      }
      capabilityCalls.set(name, calls)
      let host
      const resourceRegistry = new PluginHostResourceRegistry({
        owner: runtimeOwner,
        activation: activationIdentity,
        resolveCurrentActivation: () => activationIdentity,
        isActive: () => !host || host.state === 'starting' || host.state === 'active',
        createResourceId: () => `${name}-resource-${generation}`
      })
      host = new PluginRuntimeHost({
        activation: activationIdentity,
        ...runtimeOwner,
        artifactPath,
        factory,
        resourceLimits: limits,
        capabilityDispatcher: {
          owner: runtimeOwner,
          activation: activationIdentity,
          async dispatch(capability, payload, signal) {
            assert(signal.aborted === false)
            calls.push({ capability, payload })
            if (capability === 'plugin.info.get' && payload && payload.scopedCancel) {
              return new Promise((resolve) => {
                signal.addEventListener('abort', () => resolve('ignored-after-cancel'), {
                  once: true
                })
              })
            }
            if (capability === 'plugin.info.get' && payload && payload.callbackScopedCancel) {
              return new Promise((resolve) => {
                signal.addEventListener('abort', () => resolve('ignored-callback-scope'), {
                  once: true
                })
              })
            }
            if (capability === 'plugin.info.get' && payload && payload.callback) {
              try {
                return await payload.callback('transient-roundtrip')
              } catch (error) {
                return { callbackCode: error.code }
              }
            }
            if (capability === 'channel.subscribe' && payload && payload.callback) {
              retainedCallback = payload.callback
              const invocation = resourceRegistry.beginInvocation({
                capabilityId: 'channel.subscribe'
              })
              const handle = invocation.resources.register('subscription', () => {
                disposedResources += 1
              })
              await invocation.commit(handle)
              return handle
            }
            return { pluginName: name, payload }
          },
          getCallbackLifetime(capability) {
            return capability === 'channel.subscribe' ? 'resource' : 'transient'
          }
        },
        resourceDispatcher: resourceRegistry,
        ownsResourceDispatcher: true,
        invalidateAuthority() {},
        closeResources() {}
      })
      return {
        host,
        capabilityManifest,
        invokeRetained(value) {
          return retainedCallback(value)
        },
        disposedResources: () => disposedResources
      }
    }

    const firstRuntime = createHost('plugin.smoke.alpha', 1, [
      { id: 'plugin.info.get', callbackLifetime: 'transient', callbackFields: ['callback'] },
      { id: 'channel.subscribe', callbackLifetime: 'resource', callbackFields: ['callback'] }
    ])
    const secondRuntime = createHost('plugin.smoke.beta', 1, [])
    const first = firstRuntime.host
    const second = secondRuntime.host
    hosts = [first, second]
    await Promise.all([
      first.start({
        loadPayload: {
          scriptContent: PRELUDE,
          snapshot: {
            platform: process.platform,
            arch: process.arch,
            locale: 'en-US',
            manifest: { name: first.activation.name }
          },
          capabilityManifest: firstRuntime.capabilityManifest,
          callbackLimits: {
            maxCallbacks: 64,
            maxConcurrentCallbacks: 16,
            maxResources: 32
          }
        }
      }),
      second.start({
        loadPayload: {
          scriptContent: PRELUDE,
          snapshot: {
            platform: process.platform,
            arch: process.arch,
            locale: 'en-US',
            manifest: { name: second.activation.name }
          },
          capabilityManifest: secondRuntime.capabilityManifest,
          callbackLimits: {
            maxCallbacks: 64,
            maxConcurrentCallbacks: 16,
            maxResources: 32
          }
        }
      })
    ])

    assert(Number.isSafeInteger(first.processId))
    assert(Number.isSafeInteger(second.processId))
    assert(first.processId !== second.processId)
    assert(factory.observers.length === 2)

    const capabilityResult = await first.callLifecycle('onMessage', ['capability'])
    assert(capabilityResult && capabilityResult.pluginName === first.activation.name)
    assert(capabilityResult.payload && capabilityResult.payload.source === 'alpha-child')
    assert(capabilityCalls.get(first.activation.name).length === 1)

    const callbackResult = await first.callLifecycle('onMessage', ['callback'])
    assert(callbackResult && callbackResult.value === 'transient-roundtrip')
    assert(callbackResult.processType === 'undefined')
    const callbackThrow = await first.callLifecycle('onMessage', ['callback-throw'])
    assert(callbackThrow && callbackThrow.callbackCode === 'PLUGIN_HOST_CALLBACK_FAILED')
    assert(JSON.stringify(callbackThrow).includes('/private') === false)
    const callbackCancellation = await first.callLifecycle('onMessage', ['callback-scoped-cancel'])
    assert(
      callbackCancellation && callbackCancellation.callbackCode === 'PLUGIN_HOST_CALLBACK_FAILED'
    )
    await delay(limits.cancelGraceMs * 2)
    assert(first.state === 'active')

    const subscription = await first.callLifecycle('onMessage', ['subscribe'])
    assert(subscription && subscription.kind === 'subscription' && subscription.frozen === true)
    const retainedResult = await firstRuntime.invokeRetained('retained-roundtrip')
    assert(retainedResult && retainedResult.retained === 'retained-roundtrip')
    assert(retainedResult.processType === 'undefined')
    const disposed = await first.callLifecycle('onMessage', ['dispose-subscription'])
    assert(disposed && disposed.disposed === true)
    await waitFor(() => firstRuntime.disposedResources() === 1, 1000)
    await firstRuntime.invokeRetained('late').then(
      () => {
        throw new Error(FAILURE)
      },
      (error) => assert(error && error.code === 'PLUGIN_HOST_CALLBACK_DISPOSED')
    )

    const deniedCapability = await second.callLifecycle('onMessage', ['denied-capability'])
    assert(deniedCapability && deniedCapability.denied === true)
    assert(deniedCapability.code === 'PLUGIN_HOST_CAPABILITY_NOT_DECLARED')
    assert(capabilityCalls.get(second.activation.name).length === 0)

    const scopedCancellation = new AbortController()
    const cancelledCall = first.callLifecycle('onMessage', ['scoped-cancel'], {
      signal: scopedCancellation.signal
    })
    const concurrentCall = first.callLifecycle('onMessage', [{ delay: 120, tag: 'concurrent' }])
    await waitFor(
      () =>
        capabilityCalls
          .get(first.activation.name)
          .some((entry) => entry.payload && entry.payload.scopedCancel === true),
      1000
    )
    scopedCancellation.abort()
    await cancelledCall.then(
      () => {
        throw new Error(FAILURE)
      },
      (error) => assert(error && error.code === 'PLUGIN_RUNTIME_HOST_CANCELLED')
    )
    const concurrentResult = await concurrentCall
    assert(concurrentResult && concurrentResult.tag === 'concurrent')
    await delay(limits.cancelGraceMs * 2)
    assert(first.state === 'active')

    const initial = await second.callLifecycle('onMessage', ['ready'])
    assert(initial && initial.initialized === true && initial.echo === 'ready')

    const officialPluginRoot = path.resolve(appRoot, '../../plugins')
    const emojiScript = readFileSync(
      path.join(officialPluginRoot, 'touch-emoji-symbols', 'index.js'),
      'utf8'
    )
    const devUtilsScript = readFileSync(
      path.join(officialPluginRoot, 'touch-dev-utils', 'index.js'),
      'utf8'
    )
    const simpleFeatureCapabilityIds = new Set([
      'permission.check',
      'feature.items.push',
      'feature.items.update',
      'feature.items.remove',
      'feature.items.clear',
      'feature.items.list',
      'storage.file.read',
      'storage.file.write',
      'storage.file.remove',
      'storage.file.list',
      'clipboard.read',
      'clipboard.write',
      'clipboard.copy-and-paste',
      'open-url'
    ])
    const createOfficialFeatureRuntime = (name, generation) => {
      const activationIdentity = activation(name, generation)
      const runtimeOwner = {
        protocolVersion: 2,
        activationHandle: `${name}-feature-handle-${generation}`,
        hostGeneration: generation
      }
      const state = {
        items: [],
        clipboardWrites: [],
        files: new Map(),
        openedUrls: [],
        deniedPermissions: new Set(),
        nexusCalls: [],
        quickOpsCalls: [],
        flowCalls: []
      }
      const featureHost = {
        async pushItems(_scope, items) {
          state.items = items
        },
        async updateItem(_scope, id, patch) {
          const index = state.items.findIndex((item) => item.id === id)
          if (index < 0) return false
          state.items[index] = { ...state.items[index], ...patch }
          return true
        },
        async removeItem(id) {
          const before = state.items.length
          state.items = state.items.filter((item) => item.id !== id)
          return state.items.length !== before
        },
        async clearItems() {
          const removed = state.items.length
          state.items = []
          return removed
        },
        async listItems() {
          return state.items
        }
      }
      const plugin = {
        name,
        sdkapi: 260428,
        getActivationIdentity: () => activationIdentity,
        getBusinessRuntimeInfo: () => ({
          name,
          displayName: name,
          version: '1.0.0',
          description: `${name} smoke`,
          status: 'enabled',
          sdkapi: 260428
        }),
        getDataPath: () => bundleRoot,
        createBusinessFeatureHost: () => featureHost,
        addBusinessFeature: async () => false,
        removeBusinessFeature: async () => false,
        listBusinessFeatures: () => [],
        readBusinessFile: async (fileName) =>
          state.files.has(fileName)
            ? { found: true, value: state.files.get(fileName) }
            : { found: false },
        writeBusinessFile: async (fileName, value) => {
          state.files.set(fileName, value)
        },
        removeBusinessFile: async (fileName) => state.files.delete(fileName),
        listBusinessFiles: async () => [...state.files.keys()].sort(),
        async cleanupBusinessItems(_activation, ids) {
          const owned = new Set(ids)
          state.items = state.items.filter((item) => !owned.has(item.id))
        }
      }
      const business = createPluginBusinessCapabilities({
        resolvePlugin: (pluginName) => (pluginName === name ? plugin : undefined),
        resolveHostGeneration: () => generation,
        hasPermission: (_pluginName, permissionId) => !state.deniedPermissions.has(permissionId),
        sqliteOwners: {
          async acquire() {
            throw new Error(FAILURE)
          },
          async closeActivation() {
            return false
          }
        },
        secureStoreRootPath: bundleRoot,
        secureStore: {
          async get() {
            return null
          },
          async set() {
            return false
          }
        },
        clipboard: {
          async read() {
            return { op: 'text', text: state.clipboardWrites.at(-1) || '' }
          },
          async write(request) {
            if (request.op === 'clear') state.clipboardWrites = []
            else state.clipboardWrites.push(request.content.text || '')
          },
          async copyAndPaste(request) {
            state.clipboardWrites.push(request.text || '')
            return { success: true }
          }
        },
        async openUrl(url) {
          state.openedUrls.push(url)
          return { allowed: true, url, protocol: new URL(url).protocol }
        },
        network: {
          async requestPinned() {
            throw new Error(FAILURE)
          },
          async resolveAddresses() {
            return []
          }
        }
      })
      const snippetPack = {
        format: 'tuff.snippet-pack+json',
        version: 1,
        title: 'Smoke snippets',
        summary: 'Real Electron fixture',
        pluginId: 'touch-snippets',
        kind: 'snippet-pack',
        schemaVersion: 1,
        createdAt: 1,
        snippets: [
          {
            id: 'smoke-cloud',
            type: 'text',
            title: 'Smoke Cloud',
            language: '',
            tags: ['smoke'],
            content: 'cloud {{clipboard}}',
            createdAt: 1,
            updatedAt: 1,
            useCount: 0
          }
        ],
        skippedSensitiveCount: 0
      }
      const snippetPackage = {
        id: 'smoke-pack',
        pluginId: 'touch-snippets',
        kind: 'snippet-pack',
        title: 'Smoke snippets',
        summary: 'Real Electron fixture',
        schemaVersion: 1,
        visibility: 'public',
        manifest: {
          importTarget: 'touch-snippets',
          format: 'tuff.snippet-pack+json'
        },
        contentInline: snippetPack,
        createdBy: 'smoke-account',
        status: 'published',
        installCount: 1,
        createdAt: '2026-07-27T00:00:00.000Z',
        updatedAt: '2026-07-27T00:00:00.000Z',
        publishedAt: '2026-07-27T00:00:00.000Z'
      }
      const requestReply = createPluginRequestReplyCapabilities({
        resolveCurrentActivation: () => activationIdentity,
        resolveHostGeneration: () => generation,
        authState: () => ({ isLoaded: true, isSignedIn: true, user: null }),
        nexus: {
          async listSnippets(request, signal) {
            assert(signal.aborted === false)
            state.nexusCalls.push({ operation: 'snippets.cloud.list', request })
            return { packages: [snippetPackage], total: 1, limit: request.limit, offset: 0 }
          },
          async publishSnippets(request, signal) {
            assert(signal.aborted === false)
            state.nexusCalls.push({ operation: 'snippets.cloud.publish', request })
            return { package: { ...snippetPackage, contentInline: request.pack } }
          },
          async downloadSnippet(packageId, signal) {
            assert(signal.aborted === false)
            state.nexusCalls.push({ operation: 'snippets.cloud.download', packageId })
            return { package: snippetPackage }
          },
          async installSnippet(packageId, signal) {
            assert(signal.aborted === false)
            state.nexusCalls.push({ operation: 'snippets.cloud.install', packageId })
            return { package: snippetPackage, installed: true }
          }
        },
        quickOps: {
          async invoke(operation, payload, signal) {
            assert(signal.aborted === false)
            state.quickOpsCalls.push({ operation, payload })
            if (operation === 'capabilities.get') {
              return { platform: process.platform, enabled: true, entries: [] }
            }
            return { state: 'idle', count: 0, text: 'idle', sessions: [] }
          }
        },
        flow: {
          async dispatch(senderId, payload, options, signal) {
            assert(signal.aborted === false)
            state.flowCalls.push({ senderId, payload, options })
            return {
              sessionId: `${name}-flow-${generation}`,
              state: 'ACKED',
              ackPayload: { stopped: true }
            }
          }
        }
      })
      const definitions = [
        ...business.definitions.filter((definition) =>
          simpleFeatureCapabilityIds.has(definition.id)
        ),
        ...requestReply.definitions
      ]
      let featureHostRuntime
      const registry = new PluginHostCapabilityRegistry({
        owner: runtimeOwner,
        activation: activationIdentity,
        resolveCurrentActivation: () => activationIdentity,
        authorize: (_pluginName, permissionId) => !state.deniedPermissions.has(permissionId),
        watchPermissionRevoked: () => () => undefined,
        isActive: () =>
          !featureHostRuntime ||
          featureHostRuntime.state === 'starting' ||
          featureHostRuntime.state === 'active',
        onFatalViolation() {}
      })
      for (const definition of definitions) registry.register(definition)
      featureHostRuntime = new PluginRuntimeHost({
        activation: activationIdentity,
        ...runtimeOwner,
        artifactPath,
        factory,
        resourceLimits: limits,
        capabilityDispatcher: registry,
        ownsCapabilityDispatcher: true,
        invalidateAuthority() {},
        closeResources: () => business.closeActivation(activationIdentity)
      })
      return {
        host: featureHostRuntime,
        state,
        capabilityManifest: definitions.map((definition) => ({
          id: definition.id,
          callbackLifetime: definition.callbackLifetime || 'transient',
          callbackFields: definition.callbackFields || []
        }))
      }
    }
    const emojiAlpha = createOfficialFeatureRuntime('touch-emoji-symbols', 10)
    const emojiBeta = createOfficialFeatureRuntime('touch-emoji-symbols', 11)
    hosts.push(emojiAlpha.host, emojiBeta.host)
    await Promise.all(
      [emojiAlpha, emojiBeta].map((runtime) =>
        runtime.host.start({
          loadPayload: {
            scriptContent: emojiScript,
            snapshot: {
              platform: process.platform,
              arch: process.arch,
              locale: 'en-US',
              manifest: { name: 'touch-emoji-symbols' }
            },
            capabilityManifest: runtime.capabilityManifest,
            callbackLimits: {
              maxCallbacks: 64,
              maxConcurrentCallbacks: 16,
              maxResources: 32
            }
          },
          initialize: true,
          initPayload: []
        })
      )
    )
    assert(emojiAlpha.host.processId !== emojiBeta.host.processId)
    await Promise.all([
      emojiAlpha.host.callLifecycle('onFeatureTriggered', [
        'emoji-symbols',
        { text: 'emoji rocket' },
        { id: 'emoji-symbols' }
      ]),
      emojiBeta.host.callLifecycle('onFeatureTriggered', [
        'emoji-symbols',
        { text: 'emoji check' },
        { id: 'emoji-symbols' }
      ])
    ])
    assert(emojiAlpha.state.items[0].render.basic.title === '🚀 Rocket')
    assert(emojiBeta.state.items[0].render.basic.title === '✅ Check Mark')
    await Promise.all([
      emojiAlpha.host.callLifecycle('onItemAction', [emojiAlpha.state.items[0]]),
      emojiBeta.host.callLifecycle('onItemAction', [emojiBeta.state.items[0]])
    ])
    assert(emojiAlpha.state.clipboardWrites[0] === '🚀')
    assert(emojiBeta.state.clipboardWrites[0] === '✅')
    await emojiAlpha.host.stop()
    assert(emojiAlpha.host.state === 'closed')
    await emojiBeta.host.callLifecycle('onFeatureTriggered', [
      'emoji-symbols',
      { text: '人民币' },
      { id: 'emoji-symbols' }
    ])
    assert(emojiBeta.state.items[0].render.basic.title === '¥ Yen / Yuan Sign')

    const clipboardPreludePath = path.join(
      appRoot,
      'resources',
      'bundled-plugins',
      'clipboard-history',
      'index.js'
    )
    assert(existsSync(clipboardPreludePath))
    const batchScripts = new Map([
      ['clipboard-history', readFileSync(clipboardPreludePath, 'utf8')],
      [
        'touch-browser-bookmarks',
        readFileSync(path.join(officialPluginRoot, 'touch-browser-bookmarks', 'index.js'), 'utf8')
      ],
      [
        'touch-code-snippets',
        readFileSync(path.join(officialPluginRoot, 'touch-code-snippets', 'index.js'), 'utf8')
      ],
      [
        'touch-dev-toolbox',
        readFileSync(path.join(officialPluginRoot, 'touch-dev-toolbox', 'index.js'), 'utf8')
      ],
      ['touch-dev-utils', devUtilsScript],
      ['touch-emoji-symbols', emojiScript],
      [
        'touch-quickops',
        readFileSync(
          path.join(appRoot, 'resources', 'bundled-plugins', 'touch-quickops', 'index.js'),
          'utf8'
        )
      ],
      [
        'touch-snippets',
        readFileSync(
          path.join(appRoot, 'resources', 'bundled-plugins', 'touch-snippets', 'index.js'),
          'utf8'
        )
      ],
      [
        'touch-text-snippets',
        readFileSync(path.join(officialPluginRoot, 'touch-text-snippets', 'index.js'), 'utf8')
      ],
      [
        'touch-text-tools',
        readFileSync(path.join(officialPluginRoot, 'touch-text-tools', 'index.js'), 'utf8')
      ]
    ])
    const createShellRuntime = (name, generation) => {
      const activationIdentity = activation(name, generation)
      const runtimeOwner = {
        protocolVersion: 2,
        activationHandle: `${name}-batch-a-handle-${generation}`,
        hostGeneration: generation
      }
      const host = new PluginRuntimeHost({
        activation: activationIdentity,
        ...runtimeOwner,
        artifactPath,
        factory,
        resourceLimits: limits,
        invalidateAuthority() {},
        closeResources() {}
      })
      return { host, state: null, capabilityManifest: [] }
    }
    const featureRuntimeNames = new Set([
      'touch-browser-bookmarks',
      'touch-dev-toolbox',
      'touch-dev-utils',
      'touch-emoji-symbols',
      'touch-quickops',
      'touch-snippets',
      'touch-text-tools'
    ])
    const createBatchRuntime = (name, generation) =>
      featureRuntimeNames.has(name)
        ? createOfficialFeatureRuntime(name, generation)
        : createShellRuntime(name, generation)
    const startBatchRuntime = (runtime) =>
      runtime.host.start({
        loadPayload: {
          scriptContent: batchScripts.get(runtime.host.activation.name),
          snapshot: {
            platform: process.platform,
            arch: process.arch,
            locale: 'en-US',
            manifest: { name: runtime.host.activation.name }
          },
          capabilityManifest: runtime.capabilityManifest,
          callbackLimits: {
            maxCallbacks: 64,
            maxConcurrentCallbacks: 16,
            maxResources: 32
          }
        },
        initialize: true,
        initPayload: []
      })

    const batchNames = [...batchScripts.keys()]
    const firstBatchObserverOffset = factory.observers.length
    const firstBatch = batchNames.map((name, index) => createBatchRuntime(name, 20 + index))
    hosts.push(...firstBatch.map((runtime) => runtime.host))
    await Promise.all(firstBatch.map(startBatchRuntime))
    assert(new Set(firstBatch.map((runtime) => runtime.host.processId)).size === batchNames.length)
    assert(
      new Set(firstBatch.map((runtime) => runtime.host.owner.activationHandle)).size ===
        batchNames.length
    )
    assert(
      new Set(firstBatch.map((runtime) => runtime.host.owner.hostGeneration)).size ===
        batchNames.length
    )
    assert(
      new Set(firstBatch.map((runtime) => runtime.host.activation.activationGeneration)).size ===
        batchNames.length
    )
    await Promise.all(
      firstBatch
        .filter((runtime) => runtime.state === null)
        .map((runtime) => runtime.host.callLifecycle('onMessage', []))
    )
    const firstBatchEmoji = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-emoji-symbols'
    )
    await firstBatchEmoji.host.callLifecycle('onFeatureTriggered', [
      'emoji-symbols',
      { text: 'emoji rocket' },
      { id: 'emoji-symbols' }
    ])
    assert(firstBatchEmoji.state.items[0].render.basic.title === '🚀 Rocket')
    const firstBatchDevUtils = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-dev-utils'
    )
    await firstBatchDevUtils.host.callLifecycle('onFeatureTriggered', [
      'dev-utils',
      { text: 'camel case' },
      { id: 'dev-utils' }
    ])
    const firstDevUtilsItem = firstBatchDevUtils.state.items.find(
      (item) => item.render.basic.title === 'camelCase'
    )
    assert(firstDevUtilsItem)
    await firstBatchDevUtils.host.callLifecycle('onItemAction', [firstDevUtilsItem])
    assert(firstBatchDevUtils.state.clipboardWrites.includes('camelCase'))

    const firstBatchBookmarks = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-browser-bookmarks'
    )
    await firstBatchBookmarks.host.callLifecycle('onFeatureTriggered', [
      'browser-bookmarks',
      { text: 'example.com' },
      { id: 'browser-bookmarks' }
    ])
    const firstBookmarkItem = firstBatchBookmarks.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'open-url')
    )
    assert(firstBookmarkItem)
    await firstBatchBookmarks.host.callLifecycle('onItemAction', [firstBookmarkItem])
    assert(firstBatchBookmarks.state.openedUrls.includes('https://example.com/'))
    assert(firstBatchBookmarks.state.files.has('recent-urls.json'))

    const firstBatchToolbox = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-dev-toolbox'
    )
    await firstBatchToolbox.host.callLifecycle('onFeatureTriggered', [
      'dev-toolbox',
      { text: '' },
      { id: 'dev-toolbox' }
    ])
    const firstToolboxItem = firstBatchToolbox.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'config-init')
    )
    assert(firstToolboxItem)
    assert(firstBatchToolbox.state.files.has('toolbox.json'))

    const firstBatchTextTools = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-text-tools'
    )
    await firstBatchTextTools.host.callLifecycle('onFeatureTriggered', [
      'text-tools-convert',
      { text: 'abc' },
      { id: 'text-tools-convert' }
    ])
    const firstSha256Item = firstBatchTextTools.state.items.find((item) =>
      item.id.endsWith('-sha256')
    )
    assert(
      firstSha256Item?.actions?.[0]?.payload?.text ===
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )

    const firstBatchSnippets = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-snippets'
    )
    assert(firstBatchSnippets.state.files.has('snippets.json'))
    await firstBatchSnippets.host.callLifecycle('onFeatureTriggered', [
      'snippets-manage',
      { text: '' },
      { id: 'snippets-manage' }
    ])
    const firstCloudListItem = firstBatchSnippets.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'cloud-list')
    )
    assert(firstCloudListItem)
    firstBatchSnippets.state.deniedPermissions.add('network.internet')
    const deniedCloudList = await firstBatchSnippets.host.callLifecycle('onItemAction', [
      firstCloudListItem
    ])
    assert(deniedCloudList?.status === 'blocked')
    assert(deniedCloudList?.reason === 'permission-denied')
    assert(firstBatchSnippets.state.nexusCalls.length === 0)
    firstBatchSnippets.state.deniedPermissions.delete('network.internet')
    const listedCloud = await firstBatchSnippets.host.callLifecycle('onItemAction', [
      firstCloudListItem
    ])
    assert(listedCloud?.status === 'started')
    const firstCloudInstallItem = firstBatchSnippets.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'cloud-install')
    )
    assert(firstCloudInstallItem)
    await firstBatchSnippets.host.callLifecycle('onItemAction', [firstCloudInstallItem])
    await firstBatchSnippets.host.callLifecycle('onFeatureTriggered', [
      'snippets-search',
      { text: 'Smoke Cloud' },
      { id: 'snippets-search' }
    ])
    const firstCloudCopyItem = firstBatchSnippets.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'copy')
    )
    assert(firstCloudCopyItem)
    firstBatchSnippets.state.clipboardWrites.push('seed value')
    await firstBatchSnippets.host.callLifecycle('onItemAction', [firstCloudCopyItem])
    assert(firstBatchSnippets.state.clipboardWrites.includes('cloud seed value'))

    const firstBatchQuickOps = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-quickops'
    )
    await firstBatchQuickOps.host.callLifecycle('onFeatureTriggered', [
      'quickops',
      { text: 'quickops' },
      { id: 'quickops' }
    ])
    assert(firstBatchQuickOps.state.items[0].render.basic.title === 'QuickOps 能力摘要')
    await firstBatchQuickOps.host.callLifecycle('onFeatureTriggered', [
      'quickops',
      { text: 'stop timer' },
      { id: 'quickops' }
    ])
    const firstQuickOpsFlowItem = firstBatchQuickOps.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'quickops-flow-action')
    )
    assert(firstQuickOpsFlowItem)
    firstBatchQuickOps.state.deniedPermissions.add('storage.shared')
    const deniedFlow = await firstBatchQuickOps.host.callLifecycle('onItemAction', [
      firstQuickOpsFlowItem
    ])
    assert(deniedFlow?.status === 'blocked')
    assert(deniedFlow?.reason === 'permission-denied')
    assert(firstBatchQuickOps.state.flowCalls.length === 0)
    firstBatchQuickOps.state.deniedPermissions.delete('storage.shared')
    const acceptedFlow = await firstBatchQuickOps.host.callLifecycle('onItemAction', [
      firstQuickOpsFlowItem
    ])
    assert(acceptedFlow?.status === 'ACKED')
    assert(firstBatchQuickOps.state.flowCalls.length === 1)

    await Promise.all(firstBatch.map((runtime) => runtime.host.stop()))
    assert(firstBatch.every((runtime) => runtime.host.state === 'closed'))
    const firstBatchObservers = factory.observers.slice(
      firstBatchObserverOffset,
      firstBatchObserverOffset + firstBatch.length
    )
    assert(firstBatchObservers.every((observer) => observer.listenerCount() === 0))

    const secondBatchObserverOffset = factory.observers.length
    const secondBatch = batchNames.map((name, index) => createBatchRuntime(name, 30 + index))
    hosts.push(...secondBatch.map((runtime) => runtime.host))
    await Promise.all(secondBatch.map(startBatchRuntime))
    for (let index = 0; index < secondBatch.length; index += 1) {
      const previous = firstBatch[index].host
      const current = secondBatch[index].host
      assert(previous.processId !== current.processId)
      assert(previous.owner.activationHandle !== current.owner.activationHandle)
      assert(previous.owner.hostGeneration !== current.owner.hostGeneration)
      assert(previous.activation.activationGeneration !== current.activation.activationGeneration)
    }

    const secondBatchEmojiIndex = secondBatch.findIndex(
      (runtime) => runtime.host.activation.name === 'touch-emoji-symbols'
    )
    const secondBatchEmoji = secondBatch[secondBatchEmojiIndex]
    const currentEmojiCall = secondBatchEmoji.host.callLifecycle('onFeatureTriggered', [
      'emoji-symbols',
      { text: 'emoji check' },
      { id: 'emoji-symbols' }
    ])
    const currentEmojiObserver =
      factory.observers[secondBatchObserverOffset + secondBatchEmojiIndex]
    await waitFor(
      () => currentEmojiObserver.sent.some((message) => message.type === 'lifecycle-call'),
      1000
    )
    const currentEmojiRequest = currentEmojiObserver.sent.findLast(
      (message) => message.type === 'lifecycle-call'
    )
    firstBatchObservers[secondBatchEmojiIndex].inject({
      ...secondBatchEmoji.host.owner,
      type: 'lifecycle-result',
      requestId: currentEmojiRequest.requestId,
      ok: true,
      result: 'stale-forged-result'
    })
    await currentEmojiCall
    assert(secondBatchEmoji.state.items[0].render.basic.title === '✅ Check Mark')

    const secondBatchDevUtilsIndex = secondBatch.findIndex(
      (runtime) => runtime.host.activation.name === 'touch-dev-utils'
    )
    const secondBatchDevUtils = secondBatch[secondBatchDevUtilsIndex]
    const currentDevUtilsCall = secondBatchDevUtils.host.callLifecycle('onFeatureTriggered', [
      'dev-utils',
      { text: 'second generation' },
      { id: 'dev-utils' }
    ])
    const currentDevUtilsObserver =
      factory.observers[secondBatchObserverOffset + secondBatchDevUtilsIndex]
    await waitFor(
      () => currentDevUtilsObserver.sent.some((message) => message.type === 'lifecycle-call'),
      1000
    )
    const currentDevUtilsRequest = currentDevUtilsObserver.sent.findLast(
      (message) => message.type === 'lifecycle-call'
    )
    firstBatchObservers[secondBatchDevUtilsIndex].inject({
      ...secondBatchDevUtils.host.owner,
      type: 'lifecycle-result',
      requestId: currentDevUtilsRequest.requestId,
      ok: true,
      result: 'stale-forged-result'
    })
    await currentDevUtilsCall
    const secondDevUtilsItem = secondBatchDevUtils.state.items.find(
      (item) => item.render.basic.title === 'camelCase'
    )
    assert(secondDevUtilsItem)
    await secondBatchDevUtils.host.callLifecycle('onItemAction', [secondDevUtilsItem])
    assert(secondBatchDevUtils.state.clipboardWrites.includes('secondGeneration'))

    for (const pluginName of ['touch-quickops', 'touch-snippets']) {
      const index = secondBatch.findIndex((runtime) => runtime.host.activation.name === pluginName)
      const runtime = secondBatch[index]
      const call = runtime.host.callLifecycle('onFeatureTriggered', [
        pluginName === 'touch-quickops' ? 'quickops' : 'snippets-manage',
        { text: pluginName === 'touch-quickops' ? 'quickops' : '' },
        { id: pluginName === 'touch-quickops' ? 'quickops' : 'snippets-manage' }
      ])
      const observer = factory.observers[secondBatchObserverOffset + index]
      await waitFor(() => observer.sent.some((message) => message.type === 'lifecycle-call'), 1000)
      const request = observer.sent.findLast((message) => message.type === 'lifecycle-call')
      firstBatchObservers[index].inject({
        ...runtime.host.owner,
        type: 'lifecycle-result',
        requestId: request.requestId,
        ok: true,
        result: 'stale-forged-result'
      })
      await call
      assert(runtime.state.items.length > 0)
    }
    const secondBatchQuickOps = secondBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-quickops'
    )
    const secondBatchSnippets = secondBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-snippets'
    )
    assert(secondBatchQuickOps.state.quickOpsCalls.length === 1)
    assert(secondBatchSnippets.state.files.has('snippets.json'))

    await Promise.all(secondBatch.map((runtime) => runtime.host.stop()))
    assert(secondBatch.every((runtime) => runtime.host.state === 'closed'))

    await first
      .callLifecycle('onMessage', ['hang'], { timeoutMs: 100 })
      .then(() => {
        throw new Error(FAILURE)
      })
      .catch((error) => {
        assert(error && error.code === 'PLUGIN_RUNTIME_HOST_TIMEOUT')
      })
    await waitFor(() => first.state === 'failed', 3000)
    assert(factory.observers[0].listenerCount() === 0)

    const liveCall = second.callLifecycle('onMessage', [{ delay: 120, tag: 'real-result' }])
    const liveRequest = factory.observers[1].sent.findLast(
      (message) => message && message.type === 'lifecycle-call'
    )
    assert(liveRequest)
    factory.observers[0].inject({
      ...second.owner,
      type: 'lifecycle-result',
      requestId: liveRequest.requestId,
      ok: true,
      result: 'forged-result'
    })
    const liveResult = await liveCall
    assert(liveResult && liveResult.tag === 'real-result')
    assert(second.state === 'active')

    await Promise.all(hosts.map((host) => host.stop()))
    assert(second.state === 'closed')
    assert(factory.observers.every((observer) => observer.listenerCount() === 0))
    console.log(SUCCESS)
  } finally {
    await Promise.allSettled(hosts.map((host) => host.stop()))
    rmSync(bundleRoot, { recursive: true, force: true })
  }
}

app
  .whenReady()
  .then(run)
  .then(
    () => app.quit(),
    (error) => {
      console.error(FAILURE, error)
      process.exitCode = 1
      app.quit()
    }
  )
