import { describe, expect, it, vi } from 'vitest'
import {
  loadPluginPrelude,
  parsePluginHostLoadPayload,
  PluginHostChildError
} from './plugin-host-child-runtime'
import { PluginHostSession } from './plugin-host-session'
import { HOST_PROTOCOL_VERSION, type HostMessageOwner } from './plugin-host-wire'

const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'child-runtime-owner',
  hostGeneration: 9
}

function loadPayload(scriptContent: string, overrides: Record<string, unknown> = {}) {
  return {
    scriptContent,
    snapshot: {
      platform: 'darwin',
      arch: 'arm64',
      manifest: { name: 'plugin.smoke', nested: { enabled: true } }
    },
    capabilityManifest: [],
    ...overrides
  }
}

async function call(
  scriptContent: string,
  method: 'onInit' | 'onMessage' = 'onInit',
  payload: unknown[] = []
): Promise<unknown> {
  const runtime = loadPluginPrelude(loadPayload(scriptContent))
  try {
    return await runtime.callLifecycle(method, payload).promise
  } finally {
    runtime.shutdown()
  }
}

describe('plugin host load payload', () => {
  it('accepts the exact bounded DTO and freezes every injected snapshot branch', () => {
    const parsed = parsePluginHostLoadPayload(
      loadPayload('module.exports = {}', {
        capabilityManifest: ['plugin.info.get', 'storage.file.read']
      })
    )

    expect(parsed.snapshot).toEqual({
      platform: 'darwin',
      arch: 'arm64',
      manifest: { name: 'plugin.smoke', nested: { enabled: true } }
    })
    expect(parsed.capabilityManifest).toEqual(['plugin.info.get', 'storage.file.read'])
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.snapshot)).toBe(true)
    expect(Object.isFrozen(parsed.snapshot.manifest)).toBe(true)
    expect(Object.isFrozen(parsed.snapshot.manifest.nested)).toBe(true)
    expect(Object.isFrozen(parsed.capabilityManifest)).toBe(true)
  })

  it.each([
    [
      'missing field',
      { scriptContent: '', snapshot: { platform: 'darwin', arch: 'arm64', manifest: {} } }
    ],
    ['extra field', { ...loadPayload(''), extra: true }],
    ['unknown capability', loadPayload('', { capabilityManifest: ['constructor.constructor'] })],
    [
      'duplicate capability',
      loadPayload('', { capabilityManifest: ['plugin.info.get', 'plugin.info.get'] })
    ],
    [
      'unsupported manifest value',
      loadPayload('', { snapshot: { platform: 'darwin', arch: 'arm64', manifest: { value: 1n } } })
    ],
    [
      'invalid platform',
      loadPayload('', { snapshot: { platform: '../darwin', arch: 'arm64', manifest: {} } })
    ]
  ])('rejects %s before VM execution', (_label, payload) => {
    expect(() => parsePluginHostLoadPayload(payload)).toThrowError(
      new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
    )
  })

  it('rejects accessors without evaluating them', () => {
    const payload = loadPayload('')
    const getter = vi.fn(() => 'secret')
    Object.defineProperty(payload, 'scriptContent', { enumerable: true, get: getter })

    expect(() => parsePluginHostLoadPayload(payload)).toThrowError(
      new PluginHostChildError('PLUGIN_HOST_CHILD_LOAD_INVALID')
    )
    expect(getter).not.toHaveBeenCalled()
  })
})

describe('plugin Prelude child VM', () => {
  it('exposes only frozen snapshots and safe pure wrappers', async () => {
    const result = await call(`
      module.exports = {
        onInit(signal) {
          let timerEscape = false
          let urlEscape = false
          let invalidUrlErrorEscape = false
          try { setTimeout.constructor('return process')() } catch { timerEscape = true }
          try { URL.constructor('return process')() } catch { urlEscape = true }
          try { new URL('not a valid absolute url') } catch (error) {
            try { error.constructor.constructor('return process')() } catch { invalidUrlErrorEscape = true }
          }
          const encoded = new TextEncoder().encode('hello')
          return {
            processType: typeof process,
            requireType: typeof require,
            fetchType: typeof fetch,
            electronType: typeof electron,
            moduleCacheType: typeof __filename,
            platform,
            manifestName: manifest.name,
            frozenPlatform: Object.isFrozen(platform),
            frozenManifest: Object.isFrozen(manifest) && Object.isFrozen(manifest.nested),
            frozenCapabilities: Object.isFrozen(hostCapabilities) && Object.isFrozen(hostCapabilities.invoke),
            signalType: typeof signal.addEventListener,
            urlHost: new URL('https://example.test/path').hostname,
            decoded: new TextDecoder().decode(encoded),
            uuidLength: crypto.randomUUID().length,
            timerEscape,
            urlEscape,
            invalidUrlErrorEscape
          }
        }
      }
    `)

    expect(result).toEqual({
      processType: 'undefined',
      requireType: 'undefined',
      fetchType: 'undefined',
      electronType: 'undefined',
      moduleCacheType: 'undefined',
      platform: { platform: 'darwin', arch: 'arm64' },
      manifestName: 'plugin.smoke',
      frozenPlatform: true,
      frozenManifest: true,
      frozenCapabilities: true,
      signalType: 'function',
      urlHost: 'example.test',
      decoded: 'hello',
      uuidLength: 36,
      timerEscape: true,
      urlEscape: true,
      invalidUrlErrorEscape: true
    })
  })

  it('blocks proxy apply, stack-frame, caller-chain, and intrinsic constructor escapes', async () => {
    const result = await call(`
      let timerCallerEscape = false
      const recoverProcess = (candidate) => {
        try {
          const recovered = candidate.constructor('return process')()
          return typeof recovered.getBuiltinModule('node:fs').readFileSync === 'function'
        } catch {
          return false
        }
      }
      const onInit = new Proxy(function () {}, {
        apply(_target, _thisArg, args) {
          let proxyArgsEscape = recoverProcess(args.constructor)
          let moduleEscape = recoverProcess(module.constructor)
          let promiseEscape = recoverProcess(Promise.resolve.constructor)
          let stackEscape = false
          const previousPrepare = Error.prepareStackTrace
          try {
            Error.prepareStackTrace = (_error, frames) => {
              stackEscape ||= recoverProcess(frames.constructor)
              for (const frame of frames) {
                const fn = frame.getFunction()
                if (typeof fn === 'function') stackEscape ||= recoverProcess(fn.constructor)
              }
              return 'safe-stack'
            }
            void new Error().stack
          } finally {
            Error.prepareStackTrace = previousPrepare
          }
          return new Promise((resolve) => {
            setTimeout(function timerCallback() {
              try {
                let caller = timerCallback.caller
                while (caller) {
                  timerCallerEscape ||= recoverProcess(caller.constructor)
                  caller = caller.caller
                }
              } catch {}
              resolve({ proxyArgsEscape, moduleEscape, promiseEscape, stackEscape, timerCallerEscape })
            }, 0)
          })
        }
      })
      module.exports = { onInit }
    `)

    expect(result).toEqual({
      proxyArgsEscape: false,
      moduleEscape: false,
      promiseEscape: false,
      stackEscape: false,
      timerCallerEscape: false
    })
  })

  it('keeps timer Proxy apply arguments inside the child realm', async () => {
    const result = await call(`
      module.exports = {
        onInit() {
          return new Promise((resolve) => {
            const callback = new Proxy(function () {}, {
              apply(_target, _thisArg, args) {
                let escaped = false
                try {
                  const recovered = args.constructor.constructor('return process')()
                  escaped = typeof recovered.getBuiltinModule('node:fs').readFileSync === 'function'
                } catch {}
                resolve({ escaped, argument: args[0] })
              }
            })
            setTimeout(callback, 0, 'child-argument')
          })
        }
      }
    `)

    expect(result).toEqual({ escaped: false, argument: 'child-argument' })
  })

  it('reports rejected timer callback work without returning its thenable to the host', async () => {
    vi.useFakeTimers()
    try {
      const onUnhandledError = vi.fn()
      const runtime = loadPluginPrelude(
        loadPayload(`
          module.exports = {
            onInit() {
              setTimeout(() => Promise.reject(new Error('timer rejection')), 0)
            }
          }
        `),
        { onUnhandledError }
      )

      await runtime.callLifecycle('onInit', []).promise
      await vi.runAllTimersAsync()
      expect(onUnhandledError).toHaveBeenCalledTimes(1)
      runtime.shutdown()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps lifecycle and timer dispatch on captured child-realm Reflect.apply', async () => {
    const result = await call(`
      Reflect.apply = () => { throw new Error('plugin-mutated-reflect-apply') }
      module.exports = {
        onInit() {
          return new Promise((resolve) => setTimeout(() => resolve('realm-safe'), 0))
        }
      }
    `)

    expect(result).toBe('realm-safe')
  })

  it.each([
    ['class export', 'module.exports = new (class Prelude { onInit() {} })()'],
    ['unknown method', 'module.exports = { onInit() {}, constructorEscape() {} }'],
    ['non-function method', 'module.exports = { onInit: true }'],
    [
      'accessor method',
      "module.exports = {}; Object.defineProperty(module.exports, 'onInit', { enumerable: true, get() { return () => {} } })"
    ]
  ])('rejects %s', (_label, scriptContent) => {
    expect(() => loadPluginPrelude(loadPayload(scriptContent))).toThrowError(
      new PluginHostChildError('PLUGIN_HOST_CHILD_EXPORT_INVALID')
    )
  })

  it('awaits lifecycle promises and clones arguments into the child realm', async () => {
    const result = await call(
      `
        module.exports = {
          async onMessage(value, signal) {
            let escaped = false
            try { value.constructor.constructor('return process')() } catch { escaped = true }
            await Promise.resolve()
            return { echoed: value.text, escaped, aborted: signal.aborted }
          }
        }
      `,
      'onMessage',
      [{ text: 'hello' }]
    )

    expect(result).toEqual({ echoed: 'hello', escaped: true, aborted: false })
  })

  it('does not expose host-realm Promise resolvers to lifecycle thenables', async () => {
    const result = await call(`
      module.exports = {
        onInit() {
          return {
            then(resolve) {
              let escaped = false
              try {
                const hostProcess = resolve.constructor('return process')()
                escaped = typeof hostProcess.getBuiltinModule('node:fs').readFileSync === 'function'
              } catch {}
              resolve({ escaped })
            }
          }
        }
      }
    `)

    expect(result).toEqual({ escaped: false })
  })

  it('does not expose host-realm Promise resolvers to timer callback thenables', async () => {
    const result = await call(`
      let escaped = false
      module.exports = {
        onInit() {
          return new Promise((resolve) => {
            setTimeout(() => ({
              then(timerResolve) {
                try {
                  const hostProcess = timerResolve.constructor('return process')()
                  escaped = typeof hostProcess.getBuiltinModule('node:fs').readFileSync === 'function'
                } catch {}
                timerResolve()
              }
            }), 0)
            setTimeout(() => resolve({ escaped }), 10)
          })
        }
      }
    `)

    expect(result).toEqual({ escaped: false })
  })

  it('does not invoke lifecycle code after cancellation wins before dispatch', async () => {
    const runtime = loadPluginPrelude(
      loadPayload(`
        let invoked = false
        module.exports = {
          onMessage() { invoked = true },
          onFeatureTriggered() { return invoked }
        }
      `)
    )
    const lifecycle = runtime.callLifecycle('onMessage', [])
    lifecycle.cancel()

    await expect(lifecycle.promise).rejects.toEqual(
      new PluginHostChildError('PLUGIN_HOST_CHILD_CANCELLED')
    )
    await Promise.resolve()
    await expect(runtime.callLifecycle('onFeatureTriggered', []).promise).resolves.toBe(false)
    runtime.shutdown()
  })

  it('cancels a lifecycle call and never resolves it with late work', async () => {
    vi.useFakeTimers()
    try {
      const runtime = loadPluginPrelude(
        loadPayload(`
          module.exports = {
            onMessage(_value, signal) {
              return new Promise((resolve) => {
                const timer = setTimeout(() => resolve('late-success'), 100)
                signal.addEventListener('abort', () => {
                  clearTimeout(timer)
                  resolve('abort-handler-result')
                }, { once: true })
              })
            }
          }
        `)
      )
      const lifecycle = runtime.callLifecycle('onMessage', [{}])
      lifecycle.cancel()

      await expect(lifecycle.promise).rejects.toEqual(
        new PluginHostChildError('PLUGIN_HOST_CHILD_CANCELLED')
      )
      await vi.advanceTimersByTimeAsync(100)
      runtime.shutdown()
    } finally {
      vi.useRealTimers()
    }
  })

  it('exposes one frozen invoke-only host capability facade with realm-safe round trips', async () => {
    const invokeCapability = vi.fn(async (capability: string, payload: unknown) => {
      expect(capability).toBe('plugin.info.get')
      expect(payload).toEqual({ text: 'hello', bytes: Uint8Array.from([1, 2, 3]) })
      return { echoed: 'hello', nested: { safe: true } }
    })
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              let invokeEscape = false
              let promiseEscape = false
              let resultEscape = false
              try { hostCapabilities.invoke.constructor('return process')() } catch { invokeEscape = true }
              const pending = hostCapabilities.invoke('plugin.info.get', {
                text: 'hello',
                bytes: new Uint8Array([1, 2, 3])
              })
              try { pending.constructor.constructor('return process')() } catch { promiseEscape = true }
              const result = await pending
              try { result.constructor.constructor('return process')() } catch { resultEscape = true }
              return {
                result,
                keys: Object.keys(hostCapabilities),
                frozenFacade: Object.isFrozen(hostCapabilities),
                frozenInvoke: Object.isFrozen(hostCapabilities.invoke),
                constructorType: typeof hostCapabilities.constructor,
                invokeEscape,
                promiseEscape,
                resultEscape
              }
            }
          }
        `,
        { capabilityManifest: ['plugin.info.get'] }
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      result: { echoed: 'hello', nested: { safe: true } },
      keys: ['invoke'],
      frozenFacade: true,
      frozenInvoke: true,
      constructorType: 'undefined',
      invokeEscape: true,
      promiseEscape: true,
      resultEscape: true
    })
    expect(invokeCapability).toHaveBeenCalledTimes(1)
    runtime.shutdown()
  })

  it('does not trust a plugin-replaced Promise.resolve in the capability facade', async () => {
    const invokeCapability = vi.fn(async () => ({ source: 'host' }))
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          Promise.resolve = () => { throw new Error('plugin-mutated-promise-resolve') }
          module.exports = {
            onInit() {
              return hostCapabilities.invoke('plugin.info.get', { source: 'plugin' })
            }
          }
        `,
        { capabilityManifest: ['plugin.info.get'] }
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({ source: 'host' })
    expect(invokeCapability).toHaveBeenCalledWith('plugin.info.get', { source: 'plugin' })
    runtime.shutdown()
  })

  it.each([
    ['unknown fixed id', 'constructor.constructor', 'PLUGIN_HOST_UNKNOWN_CAPABILITY'],
    ['unlisted fixed id', 'clipboard.read', 'PLUGIN_HOST_CAPABILITY_NOT_DECLARED']
  ])('rejects %s locally before invoking the child transport', async (_label, capability, code) => {
    const invokeCapability = vi.fn()
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              try { await hostCapabilities.invoke(${JSON.stringify(capability)}, null) }
              catch (error) { return { code: error.code, message: error.message } }
            }
          }
        `,
        { capabilityManifest: ['plugin.info.get'] }
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      code,
      message: code
    })
    expect(invokeCapability).not.toHaveBeenCalled()
    runtime.shutdown()
  })

  it('propagates stable capability errors without native messages', async () => {
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              try { await hostCapabilities.invoke('plugin.info.get', null) }
              catch (error) { return { code: error.code, message: error.message } }
            }
          }
        `,
        { capabilityManifest: ['plugin.info.get'] }
      ),
      {
        invokeCapability: async () => {
          throw Object.assign(new Error('/private/permission backend detail'), {
            code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
          })
        }
      }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
      message: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
    })
    runtime.shutdown()
  })

  it.each([
    ['function', '() => {}'],
    ['AbortSignal', 'new AbortController().signal'],
    ['class instance', 'new (class Payload {})()'],
    [
      'accessor',
      "(() => { const value = {}; Object.defineProperty(value, 'secret', { enumerable: true, get() { throw new Error('read') } }); return value })()"
    ],
    ['cycle', '(() => { const value = {}; value.self = value; return value })()']
  ])('rejects %s payload smuggling before transport', async (_label, expression) => {
    const invokeCapability = vi.fn()
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              try { await hostCapabilities.invoke('plugin.info.get', ${expression}) }
              catch (error) { return error.code }
            }
          }
        `,
        { capabilityManifest: ['plugin.info.get'] }
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toBe(
      'PLUGIN_HOST_CHILD_CAPABILITY_PAYLOAD_INVALID'
    )
    expect(invokeCapability).not.toHaveBeenCalled()
    runtime.shutdown()
  })

  it.each([
    [
      'depth',
      '(() => { const root = {}; let cursor = root; for (let index = 0; index < 40; index++) { cursor.next = {}; cursor = cursor.next } return root })()'
    ],
    ['members', 'Array.from({ length: 10001 }, () => 0)'],
    ['UTF-8 bytes', "'x'.repeat(1024 * 1024 + 1)"]
  ])('enforces the %s budget before copying a capability payload', async (_label, expression) => {
    const invokeCapability = vi.fn()
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              try { await hostCapabilities.invoke('plugin.info.get', ${expression}) }
              catch (error) { return error.code }
            }
          }
        `,
        { capabilityManifest: ['plugin.info.get'] }
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toBe(
      'PLUGIN_HOST_CHILD_CAPABILITY_PAYLOAD_INVALID'
    )
    expect(invokeCapability).not.toHaveBeenCalled()
    runtime.shutdown()
  })

  it.each([
    [
      'depth',
      '(() => { const root = {}; let cursor = root; for (let index = 0; index < 40; index++) { cursor.next = {}; cursor = cursor.next } return root })()'
    ],
    ['members', 'Array.from({ length: 10001 }, () => 0)'],
    ['UTF-8 bytes', "'x'.repeat(1024 * 1024 + 1)"]
  ])('enforces the %s budget before copying a lifecycle result', async (_label, expression) => {
    const runtime = loadPluginPrelude(
      loadPayload(`module.exports = { onInit() { return ${expression} } }`)
    )

    await expect(runtime.callLifecycle('onInit', []).promise).rejects.toEqual(
      new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
    )
    runtime.shutdown()
  })

  it('uses captured serialization intrinsics after plugin mutation', async () => {
    const invokeCapability = vi.fn(async () => ({ source: 'host' }))
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          JSON.parse = () => { throw new Error('mutated parse') }
          JSON.stringify = () => { throw new Error('mutated stringify') }
          Object.getPrototypeOf = () => null
          Object.getOwnPropertyDescriptor = () => undefined
          Reflect.ownKeys = () => []
          Array.isArray = () => false
          Array.from = () => { throw new Error('mutated from') }
          Array.prototype.map = () => { throw new Error('mutated map') }
          ArrayBuffer.isView = () => false
          Number.isFinite = () => false
          String.prototype.slice = () => 'mutated'
          WeakSet = class { has() { return true } add() {} delete() {} }
          module.exports = {
            async onInit() {
              return hostCapabilities.invoke('plugin.info.get', { source: 'plugin' })
            }
          }
        `,
        { capabilityManifest: ['plugin.info.get'] }
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({ source: 'host' })
    expect(invokeCapability).toHaveBeenCalledOnce()
    runtime.shutdown()
  })

  it('rejects active capability promises when lifecycle cancellation wins', async () => {
    let rejectCapability!: (error: Error) => void
    const capability = new Promise<unknown>((_resolve, reject) => {
      rejectCapability = reject
    })
    const cancelCapabilities = vi.fn(() => {
      rejectCapability(
        Object.assign(new Error('cancelled'), { code: 'PLUGIN_HOST_CHILD_CAPABILITY_CANCELLED' })
      )
    })
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onMessage() { return hostCapabilities.invoke('plugin.info.get', null) }
          }
        `,
        { capabilityManifest: ['plugin.info.get'] }
      ),
      { invokeCapability: () => capability, cancelCapabilities }
    )
    const lifecycle = runtime.callLifecycle('onMessage', [])
    await Promise.resolve()
    await Promise.resolve()

    lifecycle.cancel()

    await expect(lifecycle.promise).rejects.toEqual(
      new PluginHostChildError('PLUGIN_HOST_CHILD_CANCELLED')
    )
    expect(cancelCapabilities).toHaveBeenCalledTimes(1)
    runtime.shutdown()
  })

  it('rejects unsupported lifecycle result classes with a stable code', async () => {
    await expect(
      call('module.exports = { onInit() { return new (class Result {})() } }')
    ).rejects.toEqual(new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID'))
  })

  it('rejects lifecycle result accessors without evaluating them', async () => {
    const runtime = loadPluginPrelude(
      loadPayload(`
        let accessorEvaluated = false
        module.exports = {
          onInit() {
            const result = {}
            Object.defineProperty(result, 'secret', {
              enumerable: true,
              get() { accessorEvaluated = true; return 'secret' }
            })
            return result
          },
          onMessage() { return accessorEvaluated }
        }
      `)
    )

    await expect(runtime.callLifecycle('onInit', []).promise).rejects.toEqual(
      new PluginHostChildError('PLUGIN_HOST_CHILD_RESULT_INVALID')
    )
    await expect(runtime.callLifecycle('onMessage', []).promise).resolves.toBe(false)
    runtime.shutdown()
  })
})

describe('child endpoint V2 codec', () => {
  it('decodes main payloads and encodes child results with the shared session', () => {
    const child = new PluginHostSession({ owner, endpoint: 'child' })
    child.accept('main-to-child', {
      ...owner,
      type: 'host-init',
      requestId: 1,
      handshakeNonce: 'nonce'
    })
    child.accept('child-to-main', {
      ...owner,
      type: 'host-ready',
      requestId: 1,
      handshakeNonce: 'nonce'
    })
    const loaded = child.accept('main-to-child', {
      ...owner,
      type: 'host-load',
      requestId: 2,
      payload: { value: { __tuffHostWire: 'undefined' } }
    })
    expect(loaded).toMatchObject({ payload: { value: undefined } })

    const response = child.accept('child-to-main', {
      ...owner,
      type: 'load-result',
      requestId: 2,
      ok: true,
      result: { value: undefined }
    })
    expect(response).toMatchObject({
      result: { value: { __tuffHostWire: 'undefined' } }
    })
  })
})
