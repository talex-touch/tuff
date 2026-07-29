const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} = require('node:fs')
const { EventEmitter } = require('node:events')
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
          export { createFixedPluginBrowserOpenService, createPluginBrowserOpenCapabilities, createPluginBrowserOpenProcess } from '../src/main/modules/plugin/host/plugin-browser-open-capabilities'
          export { createFixedPluginBrowserDataQuery, createFixedPluginBrowserDataService, createPluginBrowserDataCapabilities } from '../src/main/modules/plugin/host/plugin-browser-data-capabilities'
          export { createPluginBatchRenameFilesystemCapability } from '../src/main/modules/plugin/host/plugin-filesystem-capabilities'
          export { createPluginSnipasteProcessCapability, createFixedPluginSnipasteDiscovery, createFixedPluginSnipasteExecutor } from '../src/main/modules/plugin/host/plugin-process-capabilities'
          export { createPluginRequestReplyCapabilities } from '../src/main/modules/plugin/host/plugin-host-request-reply'
          export { createPluginVoiceCapabilities } from '../src/main/modules/plugin/host/plugin-voice-capabilities'
          export { createPluginSystemActionCapabilities } from '../src/main/modules/plugin/host/plugin-system-capabilities'
          export { createFixedPluginWindowManagerService, createPluginWindowManagerCapabilities } from '../src/main/modules/plugin/host/plugin-window-manager-capabilities'
          export { createFixedPluginWindowPresetExecutor, createPluginWindowPresetCapabilities } from '../src/main/modules/plugin/host/plugin-window-preset-capabilities'
          export { createFixedPluginWorkspaceScriptHost, createPluginWorkspaceScriptCapabilities } from '../src/main/modules/plugin/host/plugin-workspace-script-capabilities'
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
      createFixedPluginBrowserDataQuery,
      createFixedPluginBrowserDataService,
      createPluginBrowserDataCapabilities,
      createFixedPluginBrowserOpenService,
      createPluginBrowserOpenCapabilities,
      createPluginBrowserOpenProcess,
      createPluginBatchRenameFilesystemCapability,
      createFixedPluginSnipasteDiscovery,
      createFixedPluginSnipasteExecutor,
      createPluginRequestReplyCapabilities,
      createPluginSnipasteProcessCapability,
      createPluginSystemActionCapabilities,
      createFixedPluginWindowManagerService,
      createPluginWindowManagerCapabilities,
      createFixedPluginWindowPresetExecutor,
      createPluginWindowPresetCapabilities,
      createFixedPluginWorkspaceScriptHost,
      createPluginWorkspaceScriptCapabilities,
      createPluginVoiceCapabilities,
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
      'feature.registry.add',
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
      'open-url',
      'http.request'
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
        browserHttpCalls: [],
        browserDataQueries: [],
        browserDataQueryAborted: false,
        browserDataTemporaryCopies: [],
        delayBrowserDataQuery: false,
        revokeBrowserDataIndex: null,
        browserListCalls: 0,
        browserOpenCalls: [],
        browserProcessKills: 0,
        browserProcessStarts: 0,
        deniedPermissions: new Set(),
        nexusCalls: [],
        quickOpsCalls: [],
        flowCalls: [],
        voiceCalls: [],
        snipasteActions: [],
        snipasteKills: 0,
        systemActions: [],
        systemConfirmations: [],
        mainWindowShows: 0,
        windowManagerActions: [],
        windowManagerListCalls: 0,
        windowManagerProcessStarts: 0,
        windowPresetActions: [],
        windowPresetStatusCalls: 0,
        windowPresetProcessStarts: 0,
        workspaceScriptConfirmations: 0,
        workspaceScriptProcessKills: 0,
        workspaceScriptProcessStarts: 0,
        workspaceScriptSelections: 0
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
          async requestPinned(options) {
            if (name !== 'touch-browser-open') throw new Error(FAILURE)
            state.browserHttpCalls.push(options.url)
            return {
              status: 200,
              statusText: 'OK',
              headers: {},
              data: ['tuff', ['tuff app', 'tuff plugin']],
              url: options.url,
              ok: true
            }
          },
          async resolveAddresses() {
            return ['93.184.216.34']
          }
        }
      })
      const filesystemCapability =
        name === 'touch-batch-rename'
          ? createPluginBatchRenameFilesystemCapability({
              activation: activationIdentity,
              platform: process.platform,
              resolveCurrentActivation: () => activationIdentity,
              hasPermission: (_pluginName, permissionId) =>
                !state.deniedPermissions.has(permissionId)
            })
          : null
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
      const voice = createPluginVoiceCapabilities({
        resolveCurrentActivation: () => activationIdentity,
        resolveHostGeneration: () => generation,
        service: {
          async dictate(payload, signal) {
            assert(signal.aborted === false)
            state.voiceCalls.push({ operation: 'dictate', payload })
            return {
              text: 'smoke dictated words',
              raw: 'smoke dictated words',
              source: 'electron-smoke',
              polished: false
            }
          },
          async speak(payload, signal) {
            assert(signal.aborted === false)
            state.voiceCalls.push({ operation: 'speak', payload })
            return {
              audio: 'data:audio/wav;base64,aG9zdC1vbmx5',
              format: 'wav',
              played: true
            }
          },
          async *stream(payload, signal) {
            assert(signal.aborted === false)
            state.voiceCalls.push({ operation: 'stream', payload })
            yield { type: 'partial', text: 'smoke partial' }
            if (signal.aborted) return
            yield { type: 'final', text: 'smoke isolated final', language: 'en-US' }
            if (signal.aborted) return
            yield { type: 'end' }
          }
        }
      })
      const snipasteExecutable =
        process.platform === 'win32'
          ? 'C:\\Program Files\\Snipaste\\Snipaste.exe'
          : process.platform === 'linux'
            ? '/opt/Snipaste/Snipaste.AppImage'
            : '/Applications/Snipaste.app/Contents/MacOS/Snipaste'
      const snipasteRoot =
        process.platform === 'win32'
          ? 'C:\\Program Files'
          : process.platform === 'linux'
            ? '/opt/Snipaste'
            : '/Applications'
      const snipasteDiscovery =
        name === 'touch-snipaste'
          ? createFixedPluginSnipasteDiscovery({
              platform: process.platform,
              fileSystem: {
                async kind(target) {
                  if (target === snipasteRoot) return 'directory'
                  if (target === snipasteExecutable) return 'file'
                  return 'missing'
                },
                async realpath(target) {
                  return target
                }
              }
            })
          : null
      const snipasteExecutor =
        name === 'touch-snipaste'
          ? createFixedPluginSnipasteExecutor({
              platform: process.platform,
              environment: {},
              spawn(_executable, args) {
                const actionId = args.length === 0 ? 'launch' : args[0]
                state.snipasteActions.push(actionId)
                let exited = false
                let resolveExit
                const exit = new Promise((resolve) => {
                  resolveExit = resolve
                })
                return {
                  async started() {},
                  wait: () => exit,
                  async kill() {
                    if (exited) return
                    exited = true
                    state.snipasteKills += 1
                    resolveExit({ code: null })
                    await exit
                  }
                }
              }
            })
          : null
      const snipasteCapability =
        name === 'touch-snipaste'
          ? createPluginSnipasteProcessCapability({
              activation: activationIdentity,
              platform: process.platform,
              resolveCurrentActivation: () => activationIdentity,
              resolveHostGeneration: () => generation,
              authorizeShell: () => !state.deniedPermissions.has('system.shell'),
              watchShellPermissionRevoked: () => () => undefined,
              discovery: snipasteDiscovery,
              executor: snipasteExecutor
            })
          : null
      const systemCapability =
        name === 'touch-quick-actions' || name === 'touch-system-actions'
          ? createPluginSystemActionCapabilities({
              activation: activationIdentity,
              platform: process.platform,
              resolveCurrentActivation: () => activationIdentity,
              resolveHostGeneration: () => generation,
              authorizeShell: () => !state.deniedPermissions.has('system.shell'),
              watchShellPermissionRevoked: () => () => undefined,
              executor: {
                start(actionId) {
                  state.systemActions.push(actionId)
                  return {
                    async wait() {
                      return { code: 0 }
                    },
                    async kill() {
                      throw new Error(`${FAILURE}: completed fake process must not be killed`)
                    }
                  }
                }
              },
              confirmation: {
                async confirm(actionId, signal) {
                  assert(signal.aborted === false)
                  state.systemConfirmations.push(actionId)
                  return true
                }
              },
              window: {
                async showMainWindow(requestActivation, requestHostGeneration, signal) {
                  assert(signal.aborted === false)
                  assert(requestActivation.name === name)
                  assert(requestActivation.activationGeneration === generation)
                  assert(requestHostGeneration === generation)
                  state.mainWindowShows += 1
                }
              }
            })
          : null
      let browserDataCapability = null
      if (name === 'touch-browser-data') {
        const browserDataRoot = path.join(bundleRoot, `browser-data-${generation}`)
        const browserDataHomeCandidate = path.join(browserDataRoot, 'home')
        const browserDataProfile = path.join(
          browserDataHomeCandidate,
          'Library',
          'Application Support',
          'Google',
          'Chrome',
          'Default'
        )
        const browserDataAppDataCandidate = path.join(browserDataRoot, 'app-data')
        const browserDataTempCandidate = path.join(browserDataRoot, 'temp')
        mkdirSync(browserDataProfile, { recursive: true })
        mkdirSync(browserDataAppDataCandidate, { recursive: true })
        mkdirSync(browserDataTempCandidate, { recursive: true })
        writeFileSync(
          path.join(browserDataProfile, 'Bookmarks'),
          JSON.stringify({
            roots: {
              bookmark_bar: {
                type: 'folder',
                name: 'Smoke Docs',
                children: [
                  {
                    type: 'url',
                    name: 'Browser Data Smoke',
                    url: 'https://browser-data.example/docs'
                  }
                ]
              }
            }
          })
        )
        writeFileSync(path.join(browserDataProfile, 'History'), 'fake-browser-history')
        writeFileSync(path.join(browserDataProfile, 'History-wal'), 'fake-browser-history-wal')
        writeFileSync(path.join(browserDataProfile, 'History-shm'), 'fake-browser-history-shm')
        const browserDataHome = realpathSync(browserDataHomeCandidate)
        const browserDataAppData = realpathSync(browserDataAppDataCandidate)
        const browserDataTemp = realpathSync(browserDataTempCandidate)
        const browserDataQuery = createFixedPluginBrowserDataQuery(
          async (databasePath, queryId, signal) => {
            assert(queryId === 'chromium-history')
            assert(existsSync(databasePath))
            assert(existsSync(`${databasePath}-wal`))
            assert(existsSync(`${databasePath}-shm`))
            state.browserDataQueries.push(queryId)
            state.browserDataTemporaryCopies.push(path.dirname(databasePath))
            if (state.delayBrowserDataQuery) {
              await new Promise((_resolve, reject) => {
                signal.addEventListener(
                  'abort',
                  () => {
                    state.browserDataQueryAborted = true
                    reject(new Error('fake-browser-query-cancelled'))
                  },
                  { once: true }
                )
              })
            }
            return {
              rows: [
                {
                  url: 'https://browser-history.example/docs',
                  title: 'Browser History Smoke',
                  rawVisit: 11_644_473_600_000_000 + Date.now() * 1_000
                }
              ],
              columns: ['url', 'title', 'rawVisit']
            }
          }
        )
        const browserDataService = createFixedPluginBrowserDataService({
          platform: 'darwin',
          homeDirectory: browserDataHome,
          appDataDirectory: browserDataAppData,
          tempDirectory: browserDataTemp,
          query: browserDataQuery
        })
        browserDataCapability = createPluginBrowserDataCapabilities({
          activation: activationIdentity,
          resolveCurrentActivation: () => activationIdentity,
          resolveHostGeneration: () => generation,
          resolveEnabledSources: () => ['bookmarks', 'history'],
          authorizeRead: () => !state.deniedPermissions.has('fs.read'),
          authorizeIndex: () => !state.deniedPermissions.has('fs.index'),
          watchReadPermissionRevoked: () => () => undefined,
          watchIndexPermissionRevoked: (_pluginName, onRevoke) => {
            state.revokeBrowserDataIndex = onRevoke
            return () => {
              if (state.revokeBrowserDataIndex === onRevoke) {
                state.revokeBrowserDataIndex = null
              }
            }
          },
          service: browserDataService
        })
      }
      const browserOpenService =
        name === 'touch-browser-open'
          ? createFixedPluginBrowserOpenService({
              platform: 'darwin',
              homeDirectory: '/Users/smoke',
              windowsDirectory: '/Windows',
              environment: { HOME: '/Users/smoke', LANG: 'en_US.UTF-8' },
              async inspect(candidatePath, kind, signal) {
                assert(signal.aborted === false)
                if (!candidatePath.includes('Google Chrome.app')) return null
                state.browserListCalls += 1
                return {
                  canonicalPath: candidatePath,
                  kind,
                  dev: '1',
                  ino: `browser-${generation}`
                }
              },
              spawn(executable, args, options) {
                assert(executable === '/usr/bin/open')
                assert(options.shell === false)
                assert(options.detached === false)
                state.browserProcessStarts += 1
                state.browserOpenCalls.push({ executable, args: [...args] })
                const child = new EventEmitter()
                child.pid = 5000 + generation
                child.kill = () => {
                  state.browserProcessKills += 1
                  queueMicrotask(() => child.emit('exit', null))
                  return true
                }
                queueMicrotask(() => child.emit('exit', 0))
                return createPluginBrowserOpenProcess(child)
              }
            })
          : null
      const browserOpenCapability =
        name === 'touch-browser-open'
          ? createPluginBrowserOpenCapabilities({
              activation: activationIdentity,
              resolveCurrentActivation: () => activationIdentity,
              resolveHostGeneration: () => generation,
              authorizeShell: () => !state.deniedPermissions.has('system.shell'),
              authorizeNetwork: () => !state.deniedPermissions.has('network.internet'),
              watchShellPermissionRevoked: () => () => undefined,
              watchNetworkPermissionRevoked: () => () => undefined,
              service: browserOpenService
            })
          : null
      const windowManagerService =
        name === 'touch-window-manager'
          ? createFixedPluginWindowManagerService({
              platform: 'win32',
              windowsDirectory: 'C:\\Windows',
              spawn(_executable, args) {
                state.windowManagerProcessStarts += 1
                const serializedArgs = JSON.stringify(args)
                const listing = serializedArgs.includes("$TuffWindowManagerOperation = 'list'")
                const action = [
                  'activate',
                  'snap-left',
                  'snap-right',
                  'topmost-toggle',
                  'close',
                  'hide',
                  'quit',
                  'launch'
                ].find((candidate) =>
                  serializedArgs.includes(`$TuffWindowManagerOperation = 'act:${candidate}'`)
                )
                if (listing) state.windowManagerListCalls += 1
                if (action) state.windowManagerActions.push(action)
                const stdout = listing
                  ? JSON.stringify({
                      windows: [
                        {
                          name: 'Terminal',
                          title: 'Workspace',
                          pid: 11,
                          nativeId: '100',
                          startTime: '638900000000000000',
                          appPath: 'C:\\Program Files\\Terminal\\terminal.exe',
                          topmost: false,
                          isFront: true
                        }
                      ],
                      apps: [
                        {
                          name: 'Terminal',
                          pid: 11,
                          nativeId: 'terminal-app',
                          startTime: '638900000000000000',
                          appPath: 'C:\\Program Files\\Terminal\\terminal.exe',
                          running: true
                        }
                      ]
                    })
                  : JSON.stringify({ success: true })
                return {
                  async started() {},
                  async wait() {
                    return { code: 0, stdout }
                  },
                  async kill() {
                    throw new Error(
                      `${FAILURE}: completed fake window-manager process must not be killed`
                    )
                  }
                }
              }
            })
          : null
      const windowManagerCapability =
        name === 'touch-window-manager'
          ? createPluginWindowManagerCapabilities({
              activation: activationIdentity,
              platform: 'win32',
              resolveCurrentActivation: () => activationIdentity,
              resolveHostGeneration: () => generation,
              authorizeShell: () => !state.deniedPermissions.has('system.shell'),
              watchShellPermissionRevoked: () => () => undefined,
              service: windowManagerService
            })
          : null
      const windowPresetExecutor =
        name === 'touch-window-presets'
          ? createFixedPluginWindowPresetExecutor({
              platform: 'win32',
              windowsDirectory: 'C:\\Windows',
              spawn(_executable, args) {
                state.windowPresetProcessStarts += 1
                const script = args.at(-1) || ''
                if (script.includes("$TuffWindowPresetOperation = 'list'")) {
                  state.windowPresetStatusCalls += 1
                } else if (script.includes("$TuffWindowPresetOperation = 'layout'")) {
                  state.windowPresetActions.push('layout')
                } else if (script.includes("$TuffWindowPresetOperation = 'clear-topmost'")) {
                  state.windowPresetActions.push('clear-topmost')
                }
                const stdout = script.includes("$TuffWindowPresetOperation = 'list'")
                  ? JSON.stringify([
                      {
                        name: 'WindowsTerminal',
                        title: 'Terminal',
                        pid: 11,
                        handle: '100',
                        isFront: true
                      },
                      {
                        name: 'Chrome',
                        title: 'Docs',
                        pid: 22,
                        handle: '200',
                        isFront: false
                      },
                      {
                        name: 'Code',
                        title: 'Workspace',
                        pid: 33,
                        handle: '300',
                        isFront: false
                      }
                    ])
                  : JSON.stringify({
                      success: true,
                      affectedWindows: script.includes(
                        "$TuffWindowPresetOperation = 'clear-topmost'"
                      )
                        ? 3
                        : 2
                    })
                return {
                  async started() {},
                  async wait() {
                    return { code: 0, stdout }
                  },
                  async kill() {
                    throw new Error(`${FAILURE}: completed fake window process must not be killed`)
                  }
                }
              }
            })
          : null
      const windowPresetCapability =
        name === 'touch-window-presets'
          ? createPluginWindowPresetCapabilities({
              activation: activationIdentity,
              platform: 'win32',
              resolveCurrentActivation: () => activationIdentity,
              resolveHostGeneration: () => generation,
              authorizeShell: () => !state.deniedPermissions.has('system.shell'),
              watchShellPermissionRevoked: () => () => undefined,
              executor: windowPresetExecutor
            })
          : null
      let workspaceProcessExit = null
      let workspaceRoot = path.join(bundleRoot, `workspace-script-${generation}`)
      const workspaceScriptHost =
        name === 'touch-workspace-scripts'
          ? (() => {
              mkdirSync(workspaceRoot, { recursive: true })
              workspaceRoot = realpathSync(workspaceRoot)
              writeFileSync(
                path.join(workspaceRoot, 'package.json'),
                JSON.stringify({ name: `workspace-${generation}`, scripts: { lint: 'eslint .' } })
              )
              return createFixedPluginWorkspaceScriptHost({
                platform: process.platform,
                environment: process.env,
                resolvePackageManager(platform) {
                  return platform === 'win32' ? 'C:\\Trusted\\pnpm.cmd' : '/trusted/bin/pnpm'
                },
                async selectWorkspace(signal) {
                  assert(signal.aborted === false)
                  state.workspaceScriptSelections += 1
                  return workspaceRoot
                },
                async confirmRun(input, signal) {
                  assert(signal.aborted === false)
                  assert(input.scriptName === 'lint')
                  assert(input.workspaceName === `workspace-script-${generation}`)
                  state.workspaceScriptConfirmations += 1
                  await delay(20)
                  return true
                },
                spawn(executable, args, options) {
                  if (process.platform === 'win32') {
                    assert(executable === 'C:\\Windows\\System32\\cmd.exe')
                    assert(
                      JSON.stringify(args) ===
                        '["/d","/s","/c","\\"\\"C:\\\\Trusted\\\\pnpm.cmd\\" run lint\\""]'
                    )
                    assert(options.windowsVerbatimArguments === true)
                  } else {
                    assert(executable === '/trusted/bin/pnpm')
                    assert(JSON.stringify(args) === '["run","lint"]')
                    assert(options.windowsVerbatimArguments === false)
                  }
                  assert(options.cwd === workspaceRoot)
                  assert(options.shell === false)
                  state.workspaceScriptProcessStarts += 1
                  workspaceProcessExit = {}
                  workspaceProcessExit.promise = new Promise((resolve) => {
                    workspaceProcessExit.resolve = resolve
                  })
                  return {
                    async started() {},
                    async wait() {
                      return await workspaceProcessExit.promise
                    },
                    async kill() {
                      state.workspaceScriptProcessKills += 1
                      workspaceProcessExit.resolve({ code: null })
                      await workspaceProcessExit.promise
                    }
                  }
                }
              })
            })()
          : null
      const workspaceScriptCapability =
        name === 'touch-workspace-scripts'
          ? createPluginWorkspaceScriptCapabilities({
              activation: activationIdentity,
              resolveCurrentActivation: () => activationIdentity,
              resolveHostGeneration: () => generation,
              authorizeRead: () => !state.deniedPermissions.has('fs.read'),
              authorizeShell: () => !state.deniedPermissions.has('system.shell'),
              watchReadPermissionRevoked: () => () => undefined,
              watchShellPermissionRevoked: () => () => undefined,
              host: workspaceScriptHost
            })
          : null
      const definitions = [
        ...business.definitions.filter((definition) =>
          simpleFeatureCapabilityIds.has(definition.id)
        ),
        ...(filesystemCapability ? filesystemCapability.definitions : []),
        ...requestReply.definitions,
        ...voice.definitions,
        ...(snipasteCapability ? snipasteCapability.definitions : []),
        ...(systemCapability ? systemCapability.definitions : []),
        ...(browserDataCapability ? browserDataCapability.definitions : []),
        ...(browserOpenCapability ? browserOpenCapability.definitions : []),
        ...(windowManagerCapability ? windowManagerCapability.definitions : []),
        ...(windowPresetCapability ? windowPresetCapability.definitions : []),
        ...(workspaceScriptCapability ? workspaceScriptCapability.definitions : [])
      ]
      let featureHostRuntime
      const resourceRegistry = new PluginHostResourceRegistry({
        owner: runtimeOwner,
        activation: activationIdentity,
        resolveCurrentActivation: () => activationIdentity,
        isActive: () =>
          !featureHostRuntime ||
          featureHostRuntime.state === 'starting' ||
          featureHostRuntime.state === 'active',
        createResourceId: () => `${name}-feature-resource-${generation}`,
        watchPermissionRevoked: () => () => undefined,
        onFatalViolation() {}
      })
      const registry = new PluginHostCapabilityRegistry({
        owner: runtimeOwner,
        activation: activationIdentity,
        resolveCurrentActivation: () => activationIdentity,
        authorize: (_pluginName, permissionId) => !state.deniedPermissions.has(permissionId),
        watchPermissionRevoked: () => () => undefined,
        resources: resourceRegistry,
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
        resourceDispatcher: resourceRegistry,
        ownsResourceDispatcher: true,
        invalidateAuthority() {},
        closeResources: async () => {
          await business.closeActivation(activationIdentity)
          await filesystemCapability?.close()
          await snipasteCapability?.close()
          await browserDataCapability?.close()
          await browserOpenCapability?.close()
          await windowManagerCapability?.close()
          await windowPresetCapability?.close()
          await workspaceScriptCapability?.close()
        }
      })
      return {
        host: featureHostRuntime,
        state,
        resources: resourceRegistry,
        filesystemCapability,
        snipasteCapability,
        browserDataCapability,
        browserOpenCapability,
        windowManagerCapability,
        windowPresetCapability,
        workspaceScriptCapability,
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
        'touch-batch-rename',
        readFileSync(path.join(officialPluginRoot, 'touch-batch-rename', 'index.js'), 'utf8')
      ],
      [
        'touch-browser-bookmarks',
        readFileSync(path.join(officialPluginRoot, 'touch-browser-bookmarks', 'index.js'), 'utf8')
      ],
      [
        'touch-browser-data',
        readFileSync(path.join(officialPluginRoot, 'touch-browser-data', 'index.js'), 'utf8')
      ],
      [
        'touch-browser-open',
        readFileSync(path.join(officialPluginRoot, 'touch-browser-open', 'index.js'), 'utf8')
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
      [
        'touch-dictation',
        readFileSync(path.join(officialPluginRoot, 'touch-dictation', 'index.js'), 'utf8')
      ],
      ['touch-emoji-symbols', emojiScript],
      [
        'touch-quick-actions',
        readFileSync(path.join(officialPluginRoot, 'touch-quick-actions', 'index.js'), 'utf8')
      ],
      [
        'touch-quickops',
        readFileSync(
          path.join(appRoot, 'resources', 'bundled-plugins', 'touch-quickops', 'index.js'),
          'utf8'
        )
      ],
      [
        'touch-snipaste',
        readFileSync(path.join(officialPluginRoot, 'touch-snipaste', 'index.js'), 'utf8')
      ],
      [
        'touch-snippets',
        readFileSync(
          path.join(appRoot, 'resources', 'bundled-plugins', 'touch-snippets', 'index.js'),
          'utf8'
        )
      ],
      [
        'touch-system-actions',
        readFileSync(path.join(officialPluginRoot, 'touch-system-actions', 'index.js'), 'utf8')
      ],
      [
        'touch-text-snippets',
        readFileSync(path.join(officialPluginRoot, 'touch-text-snippets', 'index.js'), 'utf8')
      ],
      [
        'touch-text-tools',
        readFileSync(path.join(officialPluginRoot, 'touch-text-tools', 'index.js'), 'utf8')
      ],
      [
        'touch-window-manager',
        readFileSync(path.join(officialPluginRoot, 'touch-window-manager', 'index.js'), 'utf8')
      ],
      [
        'touch-window-presets',
        readFileSync(path.join(officialPluginRoot, 'touch-window-presets', 'index.js'), 'utf8')
      ],
      [
        'touch-workspace-scripts',
        readFileSync(path.join(officialPluginRoot, 'touch-workspace-scripts', 'index.js'), 'utf8')
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
      'touch-batch-rename',
      'touch-browser-bookmarks',
      'touch-browser-data',
      'touch-browser-open',
      'touch-dev-toolbox',
      'touch-dev-utils',
      'touch-dictation',
      'touch-emoji-symbols',
      'touch-quick-actions',
      'touch-quickops',
      'touch-snipaste',
      'touch-snippets',
      'touch-system-actions',
      'touch-text-tools',
      'touch-window-manager',
      'touch-window-presets',
      'touch-workspace-scripts'
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
            platform:
              runtime.host.activation.name === 'touch-window-presets' ||
              runtime.host.activation.name === 'touch-window-manager'
                ? 'win32'
                : process.platform,
            arch:
              runtime.host.activation.name === 'touch-window-presets' ||
              runtime.host.activation.name === 'touch-window-manager'
                ? 'x64'
                : process.arch,
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
    const firstBatchBrowserOpen = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-browser-open'
    )
    await firstBatchBrowserOpen.host.callLifecycle('onFeatureTriggered', [
      'browser-open',
      { text: 'example.com' },
      { id: 'browser-open' }
    ])
    const firstDefaultBrowserOpen = firstBatchBrowserOpen.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'default-open')
    )
    const firstSpecificBrowserOpen = firstBatchBrowserOpen.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'open-browser')
    )
    assert(firstDefaultBrowserOpen && firstSpecificBrowserOpen)
    assert(
      JSON.stringify(firstSpecificBrowserOpen.actions[0].payload) ===
        JSON.stringify({
          url: 'https://example.com/',
          browserToken: firstSpecificBrowserOpen.actions[0].payload.browserToken
        })
    )
    assert(/^bo_[A-Za-z0-9_-]{32}$/.test(firstSpecificBrowserOpen.actions[0].payload.browserToken))
    assert(
      !/Applications|Google Chrome\.app|target|executable/i.test(
        JSON.stringify(firstBatchBrowserOpen.state.items)
      )
    )
    firstBatchBrowserOpen.state.deniedPermissions.add('network.internet')
    const deniedBrowserOpen = await firstBatchBrowserOpen.host.callLifecycle('onItemAction', [
      firstDefaultBrowserOpen
    ])
    assert(deniedBrowserOpen?.status === 'blocked')
    assert(firstBatchBrowserOpen.state.browserProcessStarts === 0)
    firstBatchBrowserOpen.state.deniedPermissions.delete('network.internet')
    const acceptedBrowserOpen = await firstBatchBrowserOpen.host.callLifecycle('onItemAction', [
      firstSpecificBrowserOpen
    ])
    assert(acceptedBrowserOpen?.status === 'completed' && acceptedBrowserOpen?.success === true)
    assert(firstBatchBrowserOpen.state.browserProcessStarts === 1)
    assert(firstBatchBrowserOpen.state.browserOpenCalls[0].executable === '/usr/bin/open')
    assert(firstBatchBrowserOpen.state.browserOpenCalls[0].args[0] === '-a')
    assert(
      !/token|target|Applications/i.test(
        JSON.stringify(firstBatchBrowserOpen.state.files.get('recent-browsers.json'))
      )
    )
    await firstBatchBrowserOpen.host.callLifecycle('onFeatureTriggered', [
      'search-engine-google',
      { text: 'google tuff' },
      { id: 'search-engine-google' }
    ])
    assert(firstBatchBrowserOpen.state.browserHttpCalls.length === 1)
    const firstBrowserSearch = firstBatchBrowserOpen.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'search-web')
    )
    assert(firstBrowserSearch)
    const acceptedBrowserSearch = await firstBatchBrowserOpen.host.callLifecycle('onItemAction', [
      firstBrowserSearch
    ])
    assert(acceptedBrowserSearch?.status === 'completed')
    assert(firstBatchBrowserOpen.state.browserProcessStarts === 2)

    const firstBatchRename = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-batch-rename'
    )
    const firstRenamePaths = [
      path.join(bundleRoot, 'batch-first-alpha.txt'),
      path.join(bundleRoot, 'batch-first-beta.md')
    ]
    writeFileSync(firstRenamePaths[0], 'alpha')
    writeFileSync(firstRenamePaths[1], 'beta')
    const firstRenameQuery = {
      text: 'prefix:renamed-',
      inputs: [{ type: 'files', content: JSON.stringify(firstRenamePaths) }]
    }
    assert(
      (await firstBatchRename.filesystemCapability.approveLifecycleFileInputs(firstRenameQuery)) ===
        2
    )
    await firstBatchRename.host.callLifecycle('onFeatureTriggered', [
      'batch-rename',
      firstRenameQuery,
      { id: 'batch-rename' }
    ])
    const firstRenameApply = firstBatchRename.state.items.find(
      (item) => item.actions?.[0]?.id === 'apply'
    )
    const firstRenameUndo = firstBatchRename.state.items.find(
      (item) => item.actions?.[0]?.id === 'undo'
    )
    if (!firstRenameApply || !firstRenameUndo) {
      throw new Error(
        `${FAILURE}: batch rename actions missing: ${JSON.stringify(firstBatchRename.state.items)}`
      )
    }
    firstBatchRename.state.deniedPermissions.add('fs.write')
    const deniedRename = await firstBatchRename.host.callLifecycle('onItemAction', [
      firstRenameApply
    ])
    assert(deniedRename?.status === 'blocked' && existsSync(firstRenamePaths[0]))
    firstBatchRename.state.deniedPermissions.delete('fs.write')
    const appliedRename = await firstBatchRename.host.callLifecycle('onItemAction', [
      firstRenameApply
    ])
    const firstRenamedPaths = [
      path.join(bundleRoot, 'renamed-batch-first-alpha.txt'),
      path.join(bundleRoot, 'renamed-batch-first-beta.md')
    ]
    assert(appliedRename?.success === true)
    assert(
      firstRenamedPaths.every(existsSync) && firstRenamePaths.every((entry) => !existsSync(entry))
    )
    const undoneRename = await firstBatchRename.host.callLifecycle('onItemAction', [
      firstRenameUndo
    ])
    assert(undoneRename?.success === true)
    assert(
      firstRenamePaths.every(existsSync) && firstRenamedPaths.every((entry) => !existsSync(entry))
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
      { text: 'https://example.test/search?tag=alpha&tag=beta&space=hello%20world' },
      { id: 'dev-utils' }
    ])
    const firstDevUtilsItem = firstBatchDevUtils.state.items.find(
      (item) => item.id === 'dev-utils-query-parse'
    )
    assert(firstDevUtilsItem)
    await firstBatchDevUtils.host.callLifecycle('onItemAction', [firstDevUtilsItem])
    assert(
      firstBatchDevUtils.state.clipboardWrites.includes(
        '{\n  "tag": [\n    "alpha",\n    "beta"\n  ],\n  "space": "hello world"\n}'
      )
    )

    const firstBatchDictation = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-dictation'
    )
    await firstBatchDictation.host.callLifecycle('onFeatureTriggered', [
      'dictate',
      { text: '' },
      { id: 'dictate' }
    ])
    const firstDictationItem = firstBatchDictation.state.items[0]
    assert(firstDictationItem?.actions?.some((action) => action.id === 'start'))
    firstBatchDictation.state.deniedPermissions.add('voice.dictation')
    const deniedDictation = await firstBatchDictation.host.callLifecycle('onItemAction', [
      firstDictationItem
    ])
    assert(deniedDictation?.success === false)
    assert(firstBatchDictation.state.voiceCalls.length === 0)
    assert(firstBatchDictation.state.clipboardWrites.length === 0)
    firstBatchDictation.state.deniedPermissions.delete('voice.dictation')
    const acceptedDictation = await firstBatchDictation.host.callLifecycle('onItemAction', [
      firstDictationItem
    ])
    assert(acceptedDictation?.success === true)
    assert(firstBatchDictation.state.clipboardWrites.includes('smoke isolated final'))
    assert(firstBatchDictation.state.voiceCalls.some((call) => call.operation === 'stream'))
    await waitFor(() => firstBatchDictation.resources.size === 0, 1000)

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

    const firstBatchBrowserData = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-browser-data'
    )
    await firstBatchBrowserData.host.callLifecycle('onFeatureTriggered', [
      'browser-data',
      { text: 'chrome docs' },
      { id: 'browser-data' }
    ])
    const firstBrowserDataBookmark = firstBatchBrowserData.state.items.find(
      (item) =>
        item.meta?.searchProviderId === 'touch-browser-data.browser-bookmarks' &&
        item.actions?.some((action) => action.id === 'open-url')
    )
    const firstBrowserDataHistory = firstBatchBrowserData.state.items.find(
      (item) =>
        item.meta?.searchProviderId === 'touch-browser-data.browser-history' &&
        item.actions?.some((action) => action.id === 'open-url')
    )
    assert(firstBrowserDataBookmark && firstBrowserDataHistory)
    assert(firstBatchBrowserData.state.browserDataQueries.length === 1)
    assert(
      !/Library|Application Support|browser-data-\d+\/home|\.sqlite|History-(?:wal|shm)|"profile":/i.test(
        JSON.stringify(firstBatchBrowserData.state.items)
      )
    )
    await firstBatchBrowserData.host.callLifecycle('onItemAction', [firstBrowserDataBookmark])
    assert(firstBatchBrowserData.state.openedUrls.includes('https://browser-data.example/docs'))
    await firstBatchBrowserData.host.callLifecycle('onItemAction', [
      {
        ...firstBrowserDataBookmark,
        actions: [
          {
            id: 'copy-url',
            type: 'plugin',
            payload: { url: 'https://browser-data.example/docs' }
          }
        ]
      }
    ])
    assert(
      firstBatchBrowserData.state.clipboardWrites.includes('https://browser-data.example/docs')
    )
    const firstBrowserHistoryRebuild = firstBatchBrowserData.state.items.find(
      (item) =>
        item.meta?.searchProviderId === 'touch-browser-data.browser-history' &&
        item.actions?.some((action) => action.id === 'rebuild-browser-data')
    )
    assert(firstBrowserHistoryRebuild)
    const rebuiltBrowserHistory = await firstBatchBrowserData.host.callLifecycle('onItemAction', [
      firstBrowserHistoryRebuild
    ])
    assert(rebuiltBrowserHistory?.status === 'completed')
    const browserQueryCount = firstBatchBrowserData.state.browserDataQueries.length
    firstBatchBrowserData.state.delayBrowserDataQuery = true
    const cancelledBrowserDataScan = firstBatchBrowserData.host.callLifecycle(
      'onFeatureTriggered',
      ['browser-data', { text: 'chrome history' }, { id: 'browser-data' }]
    )
    await waitFor(
      () => firstBatchBrowserData.state.browserDataQueries.length > browserQueryCount,
      1000
    )
    assert(typeof firstBatchBrowserData.state.revokeBrowserDataIndex === 'function')
    firstBatchBrowserData.state.revokeBrowserDataIndex()
    await cancelledBrowserDataScan
    assert(firstBatchBrowserData.state.browserDataQueryAborted === true)
    assert(
      firstBatchBrowserData.state.browserDataTemporaryCopies.every(
        (directory) => !existsSync(directory)
      )
    )

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

    const firstBatchSnipaste = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-snipaste'
    )
    await firstBatchSnipaste.host.callLifecycle('onFeatureTriggered', [
      'snipaste-quick',
      { text: '截图' },
      { id: 'snipaste-quick' }
    ])
    const firstSnipasteAction = firstBatchSnipaste.state.items.find((item) =>
      item.actions?.some((action) => action.payload?.actionId === 'snip')
    )
    assert(firstSnipasteAction)
    firstBatchSnipaste.state.deniedPermissions.add('system.shell')
    const deniedSnipaste = await firstBatchSnipaste.host.callLifecycle('onItemAction', [
      firstSnipasteAction,
      { actionId: 'run-action' }
    ])
    assert(deniedSnipaste?.status === 'blocked')
    assert(deniedSnipaste?.reason === 'permission-denied')
    assert(firstBatchSnipaste.state.snipasteActions.length === 0)
    firstBatchSnipaste.state.deniedPermissions.delete('system.shell')
    const acceptedSnipaste = await firstBatchSnipaste.host.callLifecycle('onItemAction', [
      firstSnipasteAction,
      { actionId: 'run-action' }
    ])
    assert(acceptedSnipaste?.status === 'started')
    assert(acceptedSnipaste?.success === true)
    assert(JSON.stringify(firstBatchSnipaste.state.snipasteActions) === '["snip"]')

    const firstBatchQuickActions = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-quick-actions'
    )
    await firstBatchQuickActions.host.callLifecycle('onFeatureTriggered', [
      'quick-actions',
      { text: '锁屏' },
      { id: 'quick-actions' }
    ])
    const firstLockAction = firstBatchQuickActions.state.items.find((item) =>
      item.actions?.some((action) => action.payload?.actionId === 'lock-screen')
    )
    assert(firstLockAction)
    firstBatchQuickActions.state.deniedPermissions.add('system.shell')
    const deniedSystemAction = await firstBatchQuickActions.host.callLifecycle('onItemAction', [
      firstLockAction,
      { actionId: 'run-action' }
    ])
    assert(deniedSystemAction?.status === 'blocked')
    assert(deniedSystemAction?.reason === 'permission-denied')
    assert(firstBatchQuickActions.state.systemActions.length === 0)
    firstBatchQuickActions.state.deniedPermissions.delete('system.shell')
    const acceptedSystemAction = await firstBatchQuickActions.host.callLifecycle('onItemAction', [
      firstLockAction,
      { actionId: 'run-action' }
    ])
    assert(acceptedSystemAction?.status === 'started')
    assert(acceptedSystemAction?.success === true)
    assert(JSON.stringify(firstBatchQuickActions.state.systemActions) === '["lock-screen"]')
    assert(firstBatchQuickActions.state.systemConfirmations.length === 0)

    const firstBatchSystemActions = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-system-actions'
    )
    await firstBatchSystemActions.host.callLifecycle('onFeatureTriggered', [
      'system-actions',
      { text: '' },
      { id: 'system-actions' }
    ])
    const firstMainWindowAction = firstBatchSystemActions.state.items.find((item) =>
      item.actions?.some((action) => action.payload?.actionId === 'open-main-window')
    )
    const firstVolumeAction = firstBatchSystemActions.state.items.find((item) =>
      item.actions?.some((action) => action.payload?.actionId === 'volume-up')
    )
    assert(firstMainWindowAction && firstVolumeAction)
    firstBatchSystemActions.state.deniedPermissions.add('system.shell')
    const openedMainWindow = await firstBatchSystemActions.host.callLifecycle('onItemAction', [
      firstMainWindowAction,
      { actionId: 'run-action' }
    ])
    assert(openedMainWindow?.status === 'started')
    assert(openedMainWindow?.success === true)
    assert(firstBatchSystemActions.state.mainWindowShows === 1)
    assert(firstBatchSystemActions.state.systemActions.length === 0)
    const deniedVolume = await firstBatchSystemActions.host.callLifecycle('onItemAction', [
      firstVolumeAction,
      { actionId: 'run-action' }
    ])
    assert(deniedVolume?.status === 'blocked')
    assert(deniedVolume?.reason === 'permission-denied')
    assert(firstBatchSystemActions.state.systemActions.length === 0)
    firstBatchSystemActions.state.deniedPermissions.delete('system.shell')
    const acceptedVolume = await firstBatchSystemActions.host.callLifecycle('onItemAction', [
      firstVolumeAction,
      { actionId: 'run-action' }
    ])
    assert(acceptedVolume?.status === 'started')
    assert(JSON.stringify(firstBatchSystemActions.state.systemActions) === '["volume-up"]')

    const firstBatchWorkspaceScripts = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-workspace-scripts'
    )
    await firstBatchWorkspaceScripts.host.callLifecycle('onFeatureTriggered', [
      'workspace-scripts',
      { text: '' },
      { id: 'workspace-scripts' }
    ])
    const firstWorkspaceSelect = firstBatchWorkspaceScripts.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'select-workspace')
    )
    assert(firstWorkspaceSelect)
    firstBatchWorkspaceScripts.state.deniedPermissions.add('fs.read')
    const deniedWorkspaceSelect = await firstBatchWorkspaceScripts.host.callLifecycle(
      'onItemAction',
      [firstWorkspaceSelect, { actionId: 'select-workspace' }]
    )
    assert(deniedWorkspaceSelect?.status === 'blocked')
    assert(deniedWorkspaceSelect?.reason === 'permission-denied')
    assert(firstBatchWorkspaceScripts.state.workspaceScriptSelections === 0)
    firstBatchWorkspaceScripts.state.deniedPermissions.delete('fs.read')
    const acceptedWorkspaceSelect = await firstBatchWorkspaceScripts.host.callLifecycle(
      'onItemAction',
      [firstWorkspaceSelect, { actionId: 'select-workspace' }]
    )
    assert(acceptedWorkspaceSelect?.status === 'completed')
    assert(firstBatchWorkspaceScripts.state.workspaceScriptSelections === 1)
    assert(
      !/eslint|command|cwd|path|executable|args|env/i.test(
        JSON.stringify(firstBatchWorkspaceScripts.state.items)
      )
    )
    const firstWorkspaceRun = firstBatchWorkspaceScripts.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'run-script')
    )
    assert(firstWorkspaceRun)
    firstBatchWorkspaceScripts.state.deniedPermissions.add('system.shell')
    const deniedWorkspaceRun = await firstBatchWorkspaceScripts.host.callLifecycle('onItemAction', [
      firstWorkspaceRun,
      { actionId: 'run-script' }
    ])
    assert(deniedWorkspaceRun?.status === 'blocked')
    assert(deniedWorkspaceRun?.reason === 'permission-denied')
    assert(firstBatchWorkspaceScripts.state.workspaceScriptProcessStarts === 0)
    firstBatchWorkspaceScripts.state.deniedPermissions.delete('system.shell')
    const acceptedWorkspaceRun = await firstBatchWorkspaceScripts.host.callLifecycle(
      'onItemAction',
      [firstWorkspaceRun, { actionId: 'run-script' }]
    )
    assert(acceptedWorkspaceRun?.status === 'started')
    assert(firstBatchWorkspaceScripts.state.workspaceScriptConfirmations === 1)
    assert(firstBatchWorkspaceScripts.state.workspaceScriptProcessStarts === 1)

    const firstBatchWindowManager = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-window-manager'
    )
    await firstBatchWindowManager.host.callLifecycle('onFeatureTriggered', [
      'window-app',
      { text: 'Terminal' },
      { id: 'window-app' }
    ])
    assert(firstBatchWindowManager.state.windowManagerListCalls === 1)
    assert(
      !/nativeId|handle|pid|appPath|Program Files/i.test(
        JSON.stringify(firstBatchWindowManager.state.items)
      )
    )
    const firstWindowManagerAction = firstBatchWindowManager.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'snap-left')
    )
    assert(firstWindowManagerAction)
    firstBatchWindowManager.state.deniedPermissions.add('system.shell')
    const deniedWindowManager = await firstBatchWindowManager.host.callLifecycle('onItemAction', [
      firstWindowManagerAction,
      { actionId: 'snap-left' }
    ])
    assert(deniedWindowManager?.status === 'blocked')
    assert(deniedWindowManager?.reason === 'permission-denied')
    assert(firstBatchWindowManager.state.windowManagerProcessStarts === 1)
    firstBatchWindowManager.state.deniedPermissions.delete('system.shell')
    const acceptedWindowManager = await firstBatchWindowManager.host.callLifecycle('onItemAction', [
      firstWindowManagerAction,
      { actionId: 'snap-left' }
    ])
    assert(acceptedWindowManager?.status === 'completed')
    assert(acceptedWindowManager?.success === true)
    assert(JSON.stringify(firstBatchWindowManager.state.windowManagerActions) === '["snap-left"]')
    assert(firstBatchWindowManager.state.windowManagerProcessStarts === 3)

    const firstBatchWindowPresets = firstBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-window-presets'
    )
    await firstBatchWindowPresets.host.callLifecycle('onFeatureTriggered', [
      'window-presets',
      { text: 'dev' },
      { id: 'window-presets' }
    ])
    assert(firstBatchWindowPresets.state.windowPresetStatusCalls === 1)
    const firstDevPreset = firstBatchWindowPresets.state.items.find((item) =>
      item.actions?.some((action) => action.payload?.actionId === 'preset-dev-split')
    )
    assert(firstDevPreset)
    firstBatchWindowPresets.state.deniedPermissions.add('system.shell')
    const deniedWindowPreset = await firstBatchWindowPresets.host.callLifecycle('onItemAction', [
      firstDevPreset,
      { actionId: 'run-action' }
    ])
    assert(deniedWindowPreset?.status === 'blocked')
    assert(deniedWindowPreset?.reason === 'permission-denied')
    assert(firstBatchWindowPresets.state.windowPresetProcessStarts === 1)
    firstBatchWindowPresets.state.deniedPermissions.delete('system.shell')
    const acceptedWindowPreset = await firstBatchWindowPresets.host.callLifecycle('onItemAction', [
      firstDevPreset,
      { actionId: 'run-action' }
    ])
    assert(acceptedWindowPreset?.status === 'completed')
    assert(acceptedWindowPreset?.success === true)
    assert(JSON.stringify(firstBatchWindowPresets.state.windowPresetActions) === '["layout"]')
    assert(firstBatchWindowPresets.state.windowPresetProcessStarts === 3)

    await Promise.all(firstBatch.map((runtime) => runtime.host.stop()))
    assert(firstBatch.every((runtime) => runtime.host.state === 'closed'))
    assert(firstBatchSnipaste.state.snipasteKills === 1)
    assert(firstBatchWorkspaceScripts.state.workspaceScriptProcessKills === 1)
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

    const secondBatchBrowserOpenIndex = secondBatch.findIndex(
      (runtime) => runtime.host.activation.name === 'touch-browser-open'
    )
    const secondBatchBrowserOpen = secondBatch[secondBatchBrowserOpenIndex]
    await secondBatchBrowserOpen.host.callLifecycle('onFeatureTriggered', [
      'browser-open',
      { text: 'example.com' },
      { id: 'browser-open' }
    ])
    const secondSpecificBrowserOpen = secondBatchBrowserOpen.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'open-browser')
    )
    assert(secondSpecificBrowserOpen)
    assert(
      secondSpecificBrowserOpen.actions[0].payload.browserToken !==
        firstSpecificBrowserOpen.actions[0].payload.browserToken
    )
    const secondBrowserCall = secondBatchBrowserOpen.host.callLifecycle('onItemAction', [
      secondSpecificBrowserOpen
    ])
    const secondBrowserObserver =
      factory.observers[secondBatchObserverOffset + secondBatchBrowserOpenIndex]
    await waitFor(
      () => secondBrowserObserver.sent.some((message) => message.type === 'lifecycle-call'),
      1000
    )
    const secondBrowserRequest = secondBrowserObserver.sent.findLast(
      (message) => message.type === 'lifecycle-call'
    )
    firstBatchObservers[secondBatchBrowserOpenIndex].inject({
      ...secondBatchBrowserOpen.host.owner,
      type: 'lifecycle-result',
      requestId: secondBrowserRequest.requestId,
      ok: true,
      result: 'stale-forged-browser-open-result'
    })
    const secondBrowserResult = await secondBrowserCall
    assert(secondBrowserResult?.status === 'completed')
    assert(secondBrowserResult !== 'stale-forged-browser-open-result')
    assert(secondBatchBrowserOpen.state.browserProcessStarts === 1)

    const secondBatchRename = secondBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-batch-rename'
    )
    const secondRenamePath = path.join(bundleRoot, 'batch-second.txt')
    writeFileSync(secondRenamePath, 'second')
    const secondRenameQuery = {
      text: 'suffix:-done',
      inputs: [{ type: 'files', content: JSON.stringify([secondRenamePath]) }]
    }
    assert(
      (await secondBatchRename.filesystemCapability.approveLifecycleFileInputs(
        secondRenameQuery
      )) === 1
    )
    await secondBatchRename.host.callLifecycle('onFeatureTriggered', [
      'batch-rename',
      secondRenameQuery,
      { id: 'batch-rename' }
    ])
    const secondRenameApply = secondBatchRename.state.items.find(
      (item) => item.actions?.[0]?.id === 'apply'
    )
    const secondRenameUndo = secondBatchRename.state.items.find(
      (item) => item.actions?.[0]?.id === 'undo'
    )
    assert(secondRenameApply && secondRenameUndo)
    await secondBatchRename.host.callLifecycle('onItemAction', [secondRenameApply])
    const secondRenamedPath = path.join(bundleRoot, 'batch-second-done.txt')
    assert(existsSync(secondRenamedPath) && !existsSync(secondRenamePath))
    await secondBatchRename.host.callLifecycle('onItemAction', [secondRenameUndo])
    assert(existsSync(secondRenamePath) && !existsSync(secondRenamedPath))

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
      { text: '{"tag":["alpha","beta"],"space":"hello world"}' },
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
      (item) => item.id === 'dev-utils-query-build'
    )
    assert(secondDevUtilsItem)
    await secondBatchDevUtils.host.callLifecycle('onItemAction', [secondDevUtilsItem])
    assert(
      secondBatchDevUtils.state.clipboardWrites.includes('tag=alpha&tag=beta&space=hello+world'),
      JSON.stringify(secondBatchDevUtils.state.clipboardWrites)
    )

    const secondBatchDictation = secondBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-dictation'
    )
    await secondBatchDictation.host.callLifecycle('onFeatureTriggered', [
      'dictate',
      { text: '' },
      { id: 'dictate' }
    ])
    const secondDictationResult = await secondBatchDictation.host.callLifecycle('onItemAction', [
      secondBatchDictation.state.items[0]
    ])
    assert(secondDictationResult?.success === true)
    assert(secondBatchDictation.state.clipboardWrites.includes('smoke isolated final'))
    await waitFor(() => secondBatchDictation.resources.size === 0, 1000)

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

    const secondBatchSnipasteIndex = secondBatch.findIndex(
      (runtime) => runtime.host.activation.name === 'touch-snipaste'
    )
    const secondBatchSnipaste = secondBatch[secondBatchSnipasteIndex]
    await secondBatchSnipaste.host.callLifecycle('onFeatureTriggered', [
      'snipaste-quick',
      { text: '贴图' },
      { id: 'snipaste-quick' }
    ])
    const secondSnipasteAction = secondBatchSnipaste.state.items.find((item) =>
      item.actions?.some((action) => action.payload?.actionId === 'paste')
    )
    assert(secondSnipasteAction)
    const secondSnipasteCall = secondBatchSnipaste.host.callLifecycle('onItemAction', [
      secondSnipasteAction,
      { actionId: 'run-action' }
    ])
    const secondSnipasteObserver =
      factory.observers[secondBatchObserverOffset + secondBatchSnipasteIndex]
    await waitFor(
      () => secondSnipasteObserver.sent.some((message) => message.type === 'lifecycle-call'),
      1000
    )
    const secondSnipasteRequest = secondSnipasteObserver.sent.findLast(
      (message) => message.type === 'lifecycle-call'
    )
    firstBatchObservers[secondBatchSnipasteIndex].inject({
      ...secondBatchSnipaste.host.owner,
      type: 'lifecycle-result',
      requestId: secondSnipasteRequest.requestId,
      ok: true,
      result: 'stale-forged-snipaste-result'
    })
    const secondSnipasteResult = await secondSnipasteCall
    assert(secondSnipasteResult?.status === 'started')
    assert(JSON.stringify(secondBatchSnipaste.state.snipasteActions) === '["paste"]')
    await firstBatchSnipaste.host
      .callLifecycle('onItemAction', [firstSnipasteAction, { actionId: 'run-action' }])
      .then(() => {
        throw new Error(FAILURE)
      })
      .catch((error) => assert(error?.code === 'PLUGIN_RUNTIME_HOST_INACTIVE'))
    assert(JSON.stringify(firstBatchSnipaste.state.snipasteActions) === '["snip"]')

    const secondBatchQuickActions = secondBatch.find(
      (runtime) => runtime.host.activation.name === 'touch-quick-actions'
    )
    const secondSystemAction = await secondBatchQuickActions.host.callLifecycle(
      'onFeatureTriggered',
      ['quick-action-lock-screen', { text: '' }, { id: 'quick-action-lock-screen' }]
    )
    assert(secondSystemAction?.status === 'started')
    assert(JSON.stringify(secondBatchQuickActions.state.systemActions) === '["lock-screen"]')

    const secondBatchSystemActionsIndex = secondBatch.findIndex(
      (runtime) => runtime.host.activation.name === 'touch-system-actions'
    )
    const secondBatchSystemActions = secondBatch[secondBatchSystemActionsIndex]
    await secondBatchSystemActions.host.callLifecycle('onFeatureTriggered', [
      'system-actions',
      { text: '主窗口' },
      { id: 'system-actions' }
    ])
    const secondMainWindowAction = secondBatchSystemActions.state.items.find((item) =>
      item.actions?.some((action) => action.payload?.actionId === 'open-main-window')
    )
    assert(secondMainWindowAction)
    const secondMainWindowCall = secondBatchSystemActions.host.callLifecycle('onItemAction', [
      secondMainWindowAction,
      { actionId: 'run-action' }
    ])
    const secondSystemObserver =
      factory.observers[secondBatchObserverOffset + secondBatchSystemActionsIndex]
    await waitFor(
      () => secondSystemObserver.sent.some((message) => message.type === 'lifecycle-call'),
      1000
    )
    const secondSystemRequest = secondSystemObserver.sent.findLast(
      (message) => message.type === 'lifecycle-call'
    )
    firstBatchObservers[secondBatchSystemActionsIndex].inject({
      ...secondBatchSystemActions.host.owner,
      type: 'lifecycle-result',
      requestId: secondSystemRequest.requestId,
      ok: true,
      result: 'stale-forged-system-result'
    })
    const secondMainWindowResult = await secondMainWindowCall
    assert(secondMainWindowResult?.status === 'started')
    assert(secondBatchSystemActions.state.mainWindowShows === 1)
    assert(firstBatchSystemActions.state.mainWindowShows === 1)

    const secondBatchWorkspaceScriptsIndex = secondBatch.findIndex(
      (runtime) => runtime.host.activation.name === 'touch-workspace-scripts'
    )
    const secondBatchWorkspaceScripts = secondBatch[secondBatchWorkspaceScriptsIndex]
    await secondBatchWorkspaceScripts.host.callLifecycle('onFeatureTriggered', [
      'workspace-scripts',
      { text: '' },
      { id: 'workspace-scripts' }
    ])
    const secondWorkspaceSelect = secondBatchWorkspaceScripts.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'select-workspace')
    )
    assert(secondWorkspaceSelect)
    await secondBatchWorkspaceScripts.host.callLifecycle('onItemAction', [
      secondWorkspaceSelect,
      { actionId: 'select-workspace' }
    ])
    const secondWorkspaceRun = secondBatchWorkspaceScripts.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'run-script')
    )
    assert(secondWorkspaceRun)
    const secondWorkspaceCall = secondBatchWorkspaceScripts.host.callLifecycle('onItemAction', [
      secondWorkspaceRun,
      { actionId: 'run-script' }
    ])
    const secondWorkspaceObserver =
      factory.observers[secondBatchObserverOffset + secondBatchWorkspaceScriptsIndex]
    await waitFor(
      () => secondWorkspaceObserver.sent.some((message) => message.type === 'lifecycle-call'),
      1000
    )
    const secondWorkspaceRequest = secondWorkspaceObserver.sent.findLast(
      (message) => message.type === 'lifecycle-call'
    )
    firstBatchObservers[secondBatchWorkspaceScriptsIndex].inject({
      ...secondBatchWorkspaceScripts.host.owner,
      type: 'lifecycle-result',
      requestId: secondWorkspaceRequest.requestId,
      ok: true,
      result: 'stale-forged-workspace-script-result'
    })
    const secondWorkspaceResult = await secondWorkspaceCall
    assert(secondWorkspaceResult?.status === 'started')
    assert(secondBatchWorkspaceScripts.state.workspaceScriptProcessStarts === 1)
    await firstBatchWorkspaceScripts.host
      .callLifecycle('onItemAction', [firstWorkspaceRun, { actionId: 'run-script' }])
      .then(() => {
        throw new Error(FAILURE)
      })
      .catch((error) => assert(error?.code === 'PLUGIN_RUNTIME_HOST_INACTIVE'))
    assert(firstBatchWorkspaceScripts.state.workspaceScriptProcessStarts === 1)

    const secondBatchWindowManagerIndex = secondBatch.findIndex(
      (runtime) => runtime.host.activation.name === 'touch-window-manager'
    )
    const secondBatchWindowManager = secondBatch[secondBatchWindowManagerIndex]
    await secondBatchWindowManager.host.callLifecycle('onFeatureTriggered', [
      'window-app',
      { text: '' },
      { id: 'window-app' }
    ])
    const secondWindowManagerLaunch = secondBatchWindowManager.state.items.find((item) =>
      item.actions?.some((action) => action.id === 'launch')
    )
    assert(secondWindowManagerLaunch)
    const secondWindowManagerCall = secondBatchWindowManager.host.callLifecycle('onItemAction', [
      secondWindowManagerLaunch,
      { actionId: 'launch' }
    ])
    const secondWindowManagerObserver =
      factory.observers[secondBatchObserverOffset + secondBatchWindowManagerIndex]
    await waitFor(
      () => secondWindowManagerObserver.sent.some((message) => message.type === 'lifecycle-call'),
      1000
    )
    const secondWindowManagerRequest = secondWindowManagerObserver.sent.findLast(
      (message) => message.type === 'lifecycle-call'
    )
    firstBatchObservers[secondBatchWindowManagerIndex].inject({
      ...secondBatchWindowManager.host.owner,
      type: 'lifecycle-result',
      requestId: secondWindowManagerRequest.requestId,
      ok: true,
      result: 'stale-forged-window-manager-result'
    })
    const secondWindowManagerResult = await secondWindowManagerCall
    assert(secondWindowManagerResult?.status === 'completed')
    assert(JSON.stringify(secondBatchWindowManager.state.windowManagerActions) === '["launch"]')
    await firstBatchWindowManager.host
      .callLifecycle('onItemAction', [firstWindowManagerAction, { actionId: 'activate' }])
      .then(() => {
        throw new Error(FAILURE)
      })
      .catch((error) => assert(error?.code === 'PLUGIN_RUNTIME_HOST_INACTIVE'))
    assert(JSON.stringify(firstBatchWindowManager.state.windowManagerActions) === '["snap-left"]')

    const secondBatchWindowPresetsIndex = secondBatch.findIndex(
      (runtime) => runtime.host.activation.name === 'touch-window-presets'
    )
    const secondBatchWindowPresets = secondBatch[secondBatchWindowPresetsIndex]
    await secondBatchWindowPresets.host.callLifecycle('onFeatureTriggered', [
      'window-presets',
      { text: 'topmost' },
      { id: 'window-presets' }
    ])
    const secondClearPreset = secondBatchWindowPresets.state.items.find((item) =>
      item.actions?.some((action) => action.payload?.actionId === 'preset-clear-topmost')
    )
    assert(secondClearPreset)
    const secondWindowPresetCall = secondBatchWindowPresets.host.callLifecycle('onItemAction', [
      secondClearPreset,
      { actionId: 'run-action' }
    ])
    const secondWindowPresetObserver =
      factory.observers[secondBatchObserverOffset + secondBatchWindowPresetsIndex]
    await waitFor(
      () => secondWindowPresetObserver.sent.some((message) => message.type === 'lifecycle-call'),
      1000
    )
    const secondWindowPresetRequest = secondWindowPresetObserver.sent.findLast(
      (message) => message.type === 'lifecycle-call'
    )
    firstBatchObservers[secondBatchWindowPresetsIndex].inject({
      ...secondBatchWindowPresets.host.owner,
      type: 'lifecycle-result',
      requestId: secondWindowPresetRequest.requestId,
      ok: true,
      result: 'stale-forged-window-preset-result'
    })
    const secondWindowPresetResult = await secondWindowPresetCall
    assert(secondWindowPresetResult?.status === 'completed')
    assert(
      JSON.stringify(secondBatchWindowPresets.state.windowPresetActions) === '["clear-topmost"]'
    )
    await firstBatchWindowPresets.host
      .callLifecycle('onItemAction', [firstDevPreset, { actionId: 'run-action' }])
      .then(() => {
        throw new Error(FAILURE)
      })
      .catch((error) => assert(error?.code === 'PLUGIN_RUNTIME_HOST_INACTIVE'))
    assert(JSON.stringify(firstBatchWindowPresets.state.windowPresetActions) === '["layout"]')

    await Promise.all(secondBatch.map((runtime) => runtime.host.stop()))
    assert(secondBatch.every((runtime) => runtime.host.state === 'closed'))
    assert(secondBatchSnipaste.state.snipasteKills === 1)
    assert(secondBatchWorkspaceScripts.state.workspaceScriptProcessKills === 1)

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
