const { mkdtempSync, rmSync } = require('node:fs')
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
module.exports = {
  onInit(signal) {
    initialized = true
    return { initialized, aborted: signal.aborted }
  },
  async onMessage(command) {
    if (command === 'capability') {
      return hostCapabilities.invoke('plugin.info.get', { source: 'alpha-child' })
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

    const { ElectronPluginRuntimeProcessFactory, PluginRuntimeHost } = require(supportPath)
    const factory = createObservedFactory(new ElectronPluginRuntimeProcessFactory())
    const limits = {
      handshakeTimeoutMs: 3000,
      loadTimeoutMs: 3000,
      lifecycleTimeoutMs: 2000,
      shutdownTimeoutMs: 500,
      cancelGraceMs: 100
    }

    const capabilityCalls = new Map()
    const createHost = (name, generation, capabilityManifest) => {
      const calls = []
      const activationIdentity = activation(name, generation)
      const runtimeOwner = {
        protocolVersion: 2,
        activationHandle: `${name}-host-handle-${generation}`,
        hostGeneration: generation
      }
      capabilityCalls.set(name, calls)
      return {
        host: new PluginRuntimeHost({
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
              return { pluginName: name, payload }
            }
          },
          invalidateAuthority() {},
          closeResources() {}
        }),
        capabilityManifest
      }
    }

    const firstRuntime = createHost('plugin.smoke.alpha', 1, ['plugin.info.get'])
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
          capabilityManifest: firstRuntime.capabilityManifest
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
          capabilityManifest: secondRuntime.capabilityManifest
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

    const deniedCapability = await second.callLifecycle('onMessage', ['denied-capability'])
    assert(deniedCapability && deniedCapability.denied === true)
    assert(deniedCapability.code === 'PLUGIN_HOST_CAPABILITY_NOT_DECLARED')
    assert(capabilityCalls.get(second.activation.name).length === 0)

    const initial = await second.callLifecycle('onMessage', ['ready'])
    assert(initial && initial.initialized === true && initial.echo === 'ready')

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

    await Promise.all([first.stop(), second.stop()])
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
