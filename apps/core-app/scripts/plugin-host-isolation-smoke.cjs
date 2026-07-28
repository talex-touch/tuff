const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
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

    const emojiScript = readFileSync(
      path.resolve(appRoot, '../../plugins/touch-emoji-symbols/index.js'),
      'utf8'
    )
    const emojiCapabilityIds = new Set([
      'feature.items.push',
      'feature.items.update',
      'feature.items.remove',
      'feature.items.clear',
      'feature.items.list',
      'clipboard.read',
      'clipboard.write',
      'clipboard.copy-and-paste'
    ])
    const createEmojiRuntime = (generation) => {
      const name = 'touch-emoji-symbols'
      const activationIdentity = activation(name, generation)
      const runtimeOwner = {
        protocolVersion: 2,
        activationHandle: `${name}-emoji-handle-${generation}`,
        hostGeneration: generation
      }
      const state = { items: [], clipboardWrites: [] }
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
          description: 'emoji smoke',
          status: 'enabled',
          sdkapi: 260428
        }),
        getDataPath: () => bundleRoot,
        createBusinessFeatureHost: () => featureHost,
        addBusinessFeature: async () => false,
        removeBusinessFeature: async () => false,
        listBusinessFeatures: () => [],
        readBusinessFile: async () => ({ found: false }),
        writeBusinessFile: async () => undefined,
        removeBusinessFile: async () => false,
        listBusinessFiles: async () => [],
        async cleanupBusinessItems(_activation, ids) {
          const owned = new Set(ids)
          state.items = state.items.filter((item) => !owned.has(item.id))
        }
      }
      const business = createPluginBusinessCapabilities({
        resolvePlugin: (pluginName) => (pluginName === name ? plugin : undefined),
        resolveHostGeneration: () => generation,
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
        async openUrl() {
          return { allowed: false }
        },
        network: {
          async request() {
            throw new Error(FAILURE)
          },
          async resolveAddresses() {
            return []
          }
        }
      })
      const definitions = business.definitions.filter((definition) =>
        emojiCapabilityIds.has(definition.id)
      )
      let emojiHost
      const registry = new PluginHostCapabilityRegistry({
        owner: runtimeOwner,
        activation: activationIdentity,
        resolveCurrentActivation: () => activationIdentity,
        authorize: () => true,
        watchPermissionRevoked: () => () => undefined,
        isActive: () =>
          !emojiHost || emojiHost.state === 'starting' || emojiHost.state === 'active',
        onFatalViolation() {}
      })
      for (const definition of definitions) registry.register(definition)
      emojiHost = new PluginRuntimeHost({
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
        host: emojiHost,
        state,
        capabilityManifest: definitions.map((definition) => ({
          id: definition.id,
          callbackLifetime: definition.callbackLifetime || 'transient',
          callbackFields: definition.callbackFields || []
        }))
      }
    }
    const emojiAlpha = createEmojiRuntime(10)
    const emojiBeta = createEmojiRuntime(11)
    hosts.push(emojiAlpha.host, emojiBeta.host)
    await Promise.all(
      [emojiAlpha, emojiBeta].map((runtime) =>
        runtime.host.start({
          loadPayload: {
            scriptContent: emojiScript,
            snapshot: {
              platform: process.platform,
              arch: process.arch,
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
    () => {
      console.error(FAILURE)
      process.exitCode = 1
      app.quit()
    }
  )
