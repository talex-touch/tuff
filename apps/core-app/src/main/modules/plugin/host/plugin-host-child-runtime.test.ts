import { readFileSync } from 'node:fs'
import path from 'node:path'
import { transformSync } from 'esbuild'
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
  const requestedCapabilities = overrides.capabilityManifest ?? []
  const capabilityManifest = Array.isArray(requestedCapabilities)
    ? requestedCapabilities.map((entry) =>
        typeof entry === 'string'
          ? { id: entry, callbackLifetime: 'transient', callbackFields: [] }
          : entry
      )
    : requestedCapabilities
  return {
    scriptContent,
    snapshot: {
      platform: 'darwin',
      arch: 'arm64',
      locale: 'zh-CN',
      manifest: { name: 'plugin.smoke', nested: { enabled: true } }
    },
    callbackLimits: {
      maxCallbacks: 64,
      maxConcurrentCallbacks: 16,
      maxResources: 32
    },
    ...overrides,
    capabilityManifest
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
      locale: 'zh-CN',
      manifest: { name: 'plugin.smoke', nested: { enabled: true } }
    })
    expect(parsed.capabilityManifest).toEqual([
      { id: 'plugin.info.get', callbackLifetime: 'transient', callbackFields: [] },
      { id: 'storage.file.read', callbackLifetime: 'transient', callbackFields: [] }
    ])
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.snapshot)).toBe(true)
    expect(Object.isFrozen(parsed.snapshot.manifest)).toBe(true)
    expect(Object.isFrozen(parsed.snapshot.manifest.nested)).toBe(true)
    expect(Object.isFrozen(parsed.capabilityManifest)).toBe(true)
  })

  it.each([
    [
      'missing field',
      {
        scriptContent: '',
        snapshot: { platform: 'darwin', arch: 'arm64', locale: 'zh-CN', manifest: {} }
      }
    ],
    ['extra field', { ...loadPayload(''), extra: true }],
    ['unknown capability', loadPayload('', { capabilityManifest: ['constructor.constructor'] })],
    [
      'duplicate capability',
      loadPayload('', { capabilityManifest: ['plugin.info.get', 'plugin.info.get'] })
    ],
    [
      'thenable callback field',
      loadPayload('', {
        capabilityManifest: [
          { id: 'plugin.info.get', callbackLifetime: 'transient', callbackFields: ['then'] }
        ]
      })
    ],
    [
      'unsupported manifest value',
      loadPayload('', {
        snapshot: {
          platform: 'darwin',
          arch: 'arm64',
          locale: 'zh-CN',
          manifest: { value: 1n }
        }
      })
    ],
    [
      'invalid platform',
      loadPayload('', {
        snapshot: { platform: '../darwin', arch: 'arm64', locale: 'zh-CN', manifest: {} }
      })
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

  it('supports bounded child-local URLSearchParams used by official Preludes', async () => {
    const result = await call(`
      module.exports = {
        onInit() {
          const originalArrayIterator = Array.prototype[Symbol.iterator]
          String.prototype.indexOf = () => -1
          String.prototype.slice = () => 'poisoned'
          String.prototype.split = () => ['poisoned']
          String.prototype.replaceAll = () => 'poisoned'
          Array.prototype.join = () => 'poisoned'
          Array.prototype[Symbol.iterator] = function* () { yield ['poisoned', 'poisoned'] }
          globalThis.encodeURIComponent = () => 'poisoned'
          globalThis.decodeURIComponent = () => 'poisoned'

          const built = new URLSearchParams()
          built.append('name', 'Alice Smith')
          built.append('name', 'Bob')
          built.append('mark', "!*'()~")
          const parsed = new URLSearchParams('?name=Alice+Smith&&mark=%E2%9C%93')
          const parsedUrl = new URL('https://example.com/?name=Alice+Smith&mark=%E2%9C%93')
          const parsedEntries = Array.from(parsed.entries())
          Array.prototype[Symbol.iterator] = originalArrayIterator
          let constructorEscape = false
          let oversizedCode = ''
          let tooManyCode = ''
          let encodedOverflowCode = ''
          try { URLSearchParams.constructor('return process')() } catch { constructorEscape = true }
          try { new URLSearchParams('value=' + 'x'.repeat(1024 * 1024 + 1)) } catch (error) {
            oversizedCode = error.message
          }
          try { new URLSearchParams('a=&'.repeat(3334)) } catch (error) {
            tooManyCode = error.message
          }
          try {
            const encodedOverflow = new URLSearchParams()
            encodedOverflow.append('value', '✓'.repeat(120000))
            encodedOverflow.toString()
          } catch (error) {
            encodedOverflowCode = error.message
          }
          return {
            built: built.toString(),
            names: built.getAll('name'),
            parsedName: parsed.get('name'),
            parsedEntries,
            parsedUrlName: parsedUrl.searchParams.get('name'),
            frozenConstructor: Object.isFrozen(URLSearchParams),
            frozenPrototype: Object.isFrozen(URLSearchParams.prototype),
            constructorEscape,
            oversizedCode,
            tooManyCode,
            encodedOverflowCode
          }
        }
      }
    `)

    expect(result).toEqual({
      built: 'name=Alice+Smith&name=Bob&mark=%21*%27%28%29%7E',
      names: ['Alice Smith', 'Bob'],
      parsedName: 'Alice Smith',
      parsedEntries: [
        ['name', 'Alice Smith'],
        ['mark', '✓']
      ],
      parsedUrlName: 'Alice Smith',
      frozenConstructor: true,
      frozenPrototype: true,
      constructorEscape: true,
      oversizedCode: 'PLUGIN_HOST_CHILD_RESULT_INVALID',
      tooManyCode: 'PLUGIN_HOST_CHILD_RESULT_INVALID',
      encodedOverflowCode: 'PLUGIN_HOST_CHILD_RESULT_INVALID'
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

  it('exposes immutable fixed business facades and a DTO-only TuffItemBuilder', async () => {
    const invokeCapability = vi.fn(async (capability: string, _payload: unknown) => {
      if (capability === 'feature.items.push') return { ok: true }
      if (capability === 'feature.items.list') return { items: [] }
      if (capability === 'clipboard.write') return { ok: true }
      throw new Error('unexpected capability')
    })
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              const item = new TuffItemBuilder('emoji-rocket')
                .setSource('plugin', 'plugin-features', 'touch-emoji-symbols')
                .setTitle('🚀 Rocket')
                .setSubtitle('emoji')
                .setIcon({ type: 'emoji', value: '🚀' })
                .setMeta({ featureId: 'emoji-symbols' })
                .createAndAddAction('copy', 'plugin', '复制', { text: '🚀' })
                .build()
              await plugin.feature.pushItems([item])
              await clipboard.writeText('🚀')
              let featureEscape = false
              let builderEscape = false
              try { plugin.feature.pushItems.constructor('return process')() } catch { featureEscape = true }
              try { TuffItemBuilder.constructor('return process')() } catch { builderEscape = true }
              return {
                item,
                pluginKeys: Object.keys(plugin),
                featureKeys: Object.keys(plugin.feature),
                clipboardKeys: Object.keys(clipboard),
                loggerKeys: Object.keys(logger),
                frozen: [plugin, plugin.feature, clipboard, logger, TuffItemBuilder].every(Object.isFrozen),
                prototypes: [plugin, plugin.feature, clipboard, logger].map(value => Object.getPrototypeOf(value)),
                undeclaredUpdate: typeof plugin.feature.updateItem,
                genericInvoke: typeof plugin.invoke,
                constructorType: typeof plugin.constructor,
                featureEscape,
                builderEscape
              }
            }
          }
        `,
        {
          capabilityManifest: ['feature.items.push', 'feature.items.list', 'clipboard.write']
        }
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      item: {
        id: 'emoji-rocket',
        source: { type: 'plugin', id: 'plugin-features', name: 'touch-emoji-symbols' },
        actions: [
          {
            id: 'copy',
            type: 'plugin',
            label: '复制',
            primary: true,
            payload: { text: '🚀' }
          }
        ],
        meta: { featureId: 'emoji-symbols' },
        render: {
          mode: 'default',
          basic: {
            title: '🚀 Rocket',
            subtitle: 'emoji',
            icon: { type: 'emoji', value: '🚀' }
          }
        }
      },
      pluginKeys: ['getLocale', 'feature'],
      featureKeys: ['pushItems', 'getItems'],
      clipboardKeys: ['writeText', 'clear'],
      loggerKeys: ['debug', 'info', 'warn', 'error'],
      frozen: true,
      prototypes: [null, null, null, null],
      undeclaredUpdate: 'undefined',
      genericInvoke: 'undefined',
      constructorType: 'undefined',
      featureEscape: true,
      builderEscape: true
    })
    expect(invokeCapability).toHaveBeenNthCalledWith(
      1,
      'feature.items.push',
      expect.objectContaining({ scope: 'active-feature' }),
      expect.any(Number)
    )
    expect(invokeCapability).toHaveBeenNthCalledWith(
      2,
      'clipboard.write',
      { op: 'write', content: { text: '🚀' } },
      expect.any(Number)
    )
    runtime.shutdown()
  })

  it('projects every simple business facade from declarations with async DTO-only methods', async () => {
    const invokeCapability = vi.fn(async (capability: string, _payload: unknown) => {
      switch (capability) {
        case 'feature.items.push':
        case 'storage.file.write':
        case 'secret.set':
        case 'secret.delete':
        case 'clipboard.write':
          return { ok: true }
        case 'feature.items.clear':
          return { removed: 1 }
        case 'feature.items.update':
          return { updated: true }
        case 'feature.items.remove':
        case 'storage.file.remove':
          return { removed: true }
        case 'feature.items.list':
          return { items: [{ id: 'item-a' }] }
        case 'feature.registry.add':
          return { added: true }
        case 'feature.registry.remove':
          return { removed: true }
        case 'feature.registry.list':
          return { features: [{ id: 'feature-a', name: 'Feature A' }] }
        case 'storage.file.read':
          return { found: true, value: { enabled: true } }
        case 'storage.file.list':
          return { names: ['state.json'] }
        case 'secret.get':
          return { found: true, value: 'secret-value' }
        case 'clipboard.read':
          return { op: 'text', text: 'clipboard-value' }
        case 'clipboard.copy-and-paste':
          return { success: true }
        case 'open-url':
          return { opened: true, protocol: 'https:' }
        case 'http.request':
          return {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            data: { ok: true },
            url: 'https://example.test/',
            ok: true
          }
        case 'permission.check':
          return { granted: true }
        default:
          throw new Error(`unexpected capability: ${capability}`)
      }
    })
    const capabilityManifest = [
      'feature.items.push',
      'feature.items.update',
      'feature.items.remove',
      'feature.items.clear',
      'feature.items.list',
      'feature.registry.add',
      'feature.registry.remove',
      'feature.registry.list',
      'storage.file.read',
      'storage.file.write',
      'storage.file.remove',
      'storage.file.list',
      'secret.get',
      'secret.set',
      'secret.delete',
      'clipboard.read',
      'clipboard.write',
      'clipboard.copy-and-paste',
      'open-url',
      'http.request',
      'permission.check'
    ]
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              const itemResults = [
                await plugin.feature.pushItems([]),
                await plugin.feature.updateItem('item-a', { meta: { priority: 1 } }),
                await plugin.feature.removeItem('item-a'),
                await plugin.feature.clearItems(),
                await plugin.feature.getItems()
              ]
              const registryResults = [
                await features.addFeature({ id: 'feature-a' }),
                await features.removeFeature('feature-a'),
                await features.getFeature('feature-a'),
                await features.getFeatures()
              ]
              const storageResults = [
                await plugin.storage.getFile('state.json'),
                await plugin.storage.setFile('state.json', { enabled: true }),
                await plugin.storage.deleteFile('state.json'),
                await plugin.storage.listFiles()
              ]
              const secretResults = [
                await secret.get('token'),
                await secret.set('token', 'value'),
                await secret.delete('token')
              ]
              const clipboardResults = [
                await clipboard.readText(),
                await clipboard.writeText('next'),
                await clipboard.copyAndPaste({ text: 'paste' })
              ]
              const networkResults = [
                await openUrl('https://example.test/'),
                await http.request({ method: 'GET', url: 'https://example.test/', responseType: 'json' }),
                await http.get('https://example.test/'),
                await http.post('https://example.test/', { value: 1 }),
                await permission.check('network.internet')
              ]
              const facades = [plugin, plugin.feature, plugin.storage, features, secret, clipboard, http, permission]
              return {
                locale: plugin.getLocale(),
                itemResults,
                registryResults,
                storageResults,
                secretResults,
                clipboardResults,
                networkResults,
                keys: facades.map(value => Object.keys(value)),
                frozen: facades.every(Object.isFrozen),
                prototypes: facades.map(Object.getPrototypeOf),
                constructors: facades.map(value => typeof value.constructor),
                thenables: facades.map(value => typeof value.then),
                requestEscape: (() => {
                  try { http.request.constructor('return process')(); return false } catch { return true }
                })()
              }
            }
          }
        `,
        { capabilityManifest }
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toMatchObject({
      locale: 'zh-CN',
      itemResults: [undefined, true, true, undefined, [{ id: 'item-a' }]],
      registryResults: [
        true,
        true,
        { id: 'feature-a', name: 'Feature A' },
        [{ id: 'feature-a', name: 'Feature A' }]
      ],
      storageResults: [{ enabled: true }, undefined, true, ['state.json']],
      secretResults: ['secret-value', undefined, undefined],
      clipboardResults: ['clipboard-value', undefined, true],
      frozen: true,
      prototypes: [null, null, null, null, null, null, null, null],
      constructors: [
        'undefined',
        'undefined',
        'undefined',
        'undefined',
        'undefined',
        'undefined',
        'undefined',
        'undefined'
      ],
      thenables: [
        'undefined',
        'undefined',
        'undefined',
        'undefined',
        'undefined',
        'undefined',
        'undefined',
        'undefined'
      ],
      requestEscape: true
    })
    expect(invokeCapability).toHaveBeenCalledWith(
      'permission.check',
      { permissionId: 'network.internet' },
      expect.any(Number)
    )
    runtime.shutdown()
  })

  it('exposes a child-local bounded digest facade without direct plugin require', async () => {
    const result = await call(`
      module.exports = {
        async onInit() {
          const bytes = new TextEncoder().encode('abc')
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
          return {
            digest: Array.from(digest).map(value => value.toString(16).padStart(2, '0')).join(''),
            subtleFrozen: Object.isFrozen(crypto.subtle),
            cryptoFrozen: Object.isFrozen(crypto),
            digestEscape: (() => {
              try { crypto.subtle.digest.constructor('return process')(); return false } catch { return true }
            })()
          }
        }
      }
    `)

    expect(result).toEqual({
      digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      subtleFrozen: true,
      cryptoFrozen: true,
      digestEscape: true
    })
  })

  it('uses captured byte intrinsics and rejects oversized digests before iteration', async () => {
    const runtime = loadPluginPrelude(
      loadPayload(`
        module.exports = {
          async onInit() {
            let randomSetCalled = false
            let randomConstructorEscape = false
            const originalSet = Uint8Array.prototype.set
            Uint8Array.prototype.set = function (values) {
              randomSetCalled = true
              try {
                const hostProcess = values.constructor.constructor('return process')()
                randomConstructorEscape = typeof hostProcess.getBuiltinModule === 'function'
              } catch {}
              return originalSet.call(this, values)
            }

            crypto.getRandomValues(new Uint8Array(8))

            let oversizedIterated = false
            const originalIterator = Uint8Array.prototype[Symbol.iterator]
            Uint8Array.prototype[Symbol.iterator] = function () {
              oversizedIterated = true
              return originalIterator.call(this)
            }
            let digestCode = 'resolved'
            try {
              await crypto.digest('SHA-256', new Uint8Array(1024 * 1024 + 1))
            } catch (error) {
              digestCode = error.code || error.message
            }
            return {
              randomSetCalled,
              randomConstructorEscape,
              oversizedIterated,
              digestCode
            }
          }
        }
      `)
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      randomSetCalled: false,
      randomConstructorEscape: false,
      oversizedIterated: false,
      digestCode: 'PLUGIN_HOST_CHILD_RESULT_INVALID'
    })
    runtime.shutdown()
  })

  it('does not expose business facades when no matching capability is declared', async () => {
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            onInit() {
              return {
                pluginType: typeof plugin,
                clipboardType: typeof clipboard,
                builderType: typeof TuffItemBuilder,
                loggerType: typeof logger,
                loggerKeys: Object.keys(logger)
              }
            }
          }
        `,
        { capabilityManifest: [] }
      )
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      pluginType: 'object',
      clipboardType: 'undefined',
      builderType: 'undefined',
      loggerType: 'object',
      loggerKeys: ['debug', 'info', 'warn', 'error']
    })
    runtime.shutdown()
  })

  it('clones immutable builder output across repeated builds', async () => {
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            onInit() {
              const builder = new TuffItemBuilder('item')
                .setSource('plugin', 'plugin-features', 'plugin.alpha')
                .setTitle('First')
                .setMeta({ featureId: 'feature' })
              const first = builder.build()
              builder.setTitle('Second').setMeta({ state: 'second' })
              const second = builder.build()
              let mutationBlocked = false
              try { first.render.basic.title = 'mutated' } catch { mutationBlocked = true }
              return {
                first,
                second,
                mutationBlocked,
                firstTitleAfterMutation: first.render.basic.title,
                frozen: Object.isFrozen(first) && Object.isFrozen(first.render.basic)
              }
            }
          }
        `,
        { capabilityManifest: ['feature.items.push'] }
      )
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      first: {
        id: 'item',
        source: { type: 'plugin', id: 'plugin-features', name: 'plugin.alpha' },
        meta: { featureId: 'feature' },
        render: { mode: 'default', basic: { title: 'First' } }
      },
      second: {
        id: 'item',
        source: { type: 'plugin', id: 'plugin-features', name: 'plugin.alpha' },
        meta: { featureId: 'feature', state: 'second' },
        render: { mode: 'default', basic: { title: 'Second' } }
      },
      mutationBlocked: false,
      firstTitleAfterMutation: 'First',
      frozen: true
    })
    runtime.shutdown()
  })

  it('loads the real emoji Prelude and completes feature and clipboard calls', async () => {
    const scriptContent = readFileSync(
      path.resolve(process.cwd(), '../../plugins/touch-emoji-symbols/index.js'),
      'utf8'
    )
    let items: Array<Record<string, unknown>> = []
    const clipboardWrites: string[] = []
    const invokeCapability = vi.fn(async (capability: string, payload: unknown) => {
      if (capability === 'feature.items.clear') {
        const removed = items.length
        items = []
        return { removed }
      }
      if (capability === 'feature.items.push') {
        items = (payload as { items: Array<Record<string, unknown>> }).items
        return { ok: true }
      }
      if (capability === 'clipboard.write') {
        clipboardWrites.push((payload as { content: { text: string } }).content.text)
        return { ok: true }
      }
      throw new Error('unexpected capability')
    })
    const runtime = loadPluginPrelude(
      loadPayload(scriptContent, {
        capabilityManifest: ['feature.items.push', 'feature.items.clear', 'clipboard.write']
      }),
      { invokeCapability }
    )

    await expect(
      runtime.callLifecycle('onFeatureTriggered', [
        'emoji-symbols',
        { text: 'emoji rocket' },
        { id: 'emoji-symbols' }
      ]).promise
    ).resolves.toBe(true)
    expect(items[0]).toMatchObject({
      id: 'emoji-symbols-rocket',
      meta: { defaultAction: 'copy', featureId: 'emoji-symbols' },
      render: { basic: { title: '🚀 Rocket' } }
    })

    await expect(runtime.callLifecycle('onItemAction', [items[0]]).promise).resolves.toEqual({
      externalAction: true,
      status: 'started'
    })
    expect(clipboardWrites).toEqual(['🚀'])
    runtime.shutdown()
  })

  it('loads the exact Batch A shell sources with only supported lifecycle exports', async () => {
    const pluginRoot = path.resolve(process.cwd(), '../../plugins')
    const clipboardSource = readFileSync(
      path.join(pluginRoot, 'clipboard-history', 'index', 'main.ts'),
      'utf8'
    )
    const clipboardBuild = transformSync(clipboardSource, {
      format: 'cjs',
      loader: 'ts',
      minify: true,
      platform: 'node',
      target: 'node24'
    }).code
    expect(clipboardBuild).not.toContain('__esModule')

    const scripts = [
      { name: 'clipboard-history', scriptContent: clipboardBuild, methods: [] },
      {
        name: 'touch-code-snippets',
        scriptContent: readFileSync(
          path.join(pluginRoot, 'touch-code-snippets', 'index.js'),
          'utf8'
        ),
        methods: ['onInit']
      },
      {
        name: 'touch-text-snippets',
        scriptContent: readFileSync(
          path.join(pluginRoot, 'touch-text-snippets', 'index.js'),
          'utf8'
        ),
        methods: ['onInit']
      }
    ] as const

    for (const script of scripts) {
      const runtime = loadPluginPrelude(
        loadPayload(script.scriptContent, {
          snapshot: {
            platform: 'darwin',
            arch: 'arm64',
            locale: 'zh-CN',
            manifest: { name: script.name }
          }
        })
      )
      expect(runtime.methods).toEqual(script.methods)
      if (runtime.methods.includes('onInit')) {
        await expect(runtime.callLifecycle('onInit', []).promise).resolves.toBeUndefined()
      }
      runtime.shutdown()
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
    expect(invokeCapability).toHaveBeenCalledWith(
      'plugin.info.get',
      { source: 'plugin' },
      expect.any(Number)
    )
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

  it('roundtrips sync and async capability callbacks without host constructor exposure', async () => {
    const invokeCapability = vi.fn(async (_capability, payload) => {
      const request = payload as {
        sync: (value: { text: string }) => unknown
        async: (value: string) => Promise<unknown>
      }
      return {
        sync: await request.sync({ text: 'main-sync' }),
        async: await request.async('main-async')
      }
    })
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              return hostCapabilities.invoke('plugin.info.get', {
                sync(value) {
                  let escaped = false
                  try { value.constructor.constructor('return process')() } catch { escaped = true }
                  return { text: value.text, escaped }
                },
                async: async (value) => ({ value, realm: typeof process })
              })
            }
          }
        `,
        {
          capabilityManifest: [
            {
              id: 'plugin.info.get',
              callbackLifetime: 'transient',
              callbackFields: ['sync', 'async']
            }
          ]
        }
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      sync: { text: 'main-sync', escaped: true },
      async: { value: 'main-async', realm: 'undefined' }
    })
    expect(invokeCapability).toHaveBeenCalledTimes(1)
    runtime.shutdown()
  })

  it.each([
    ['Proxy callback', 'new Proxy(() => null, {})'],
    ['class callback', 'class Callback {}']
  ])('rejects %s before capability transport registration', async (_label, callbackSource) => {
    const invokeCapability = vi.fn()
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              try {
                await hostCapabilities.invoke('plugin.info.get', { callback: ${callbackSource} })
              } catch (error) {
                return error.code
              }
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

  it('projects returned resources as frozen idempotent disposer-only realm objects', async () => {
    const token = Object.freeze(Object.create(null))
    const disposeResource = vi.fn(async () => undefined)
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              const resource = await hostCapabilities.invoke('plugin.info.get', null)
              const result = {
                id: resource.id,
                kind: resource.kind,
                keys: Object.keys(resource),
                frozen: Object.isFrozen(resource),
                nullPrototype: Object.getPrototypeOf(resource) === null
              }
              await resource.dispose()
              await resource.dispose()
              return result
            }
          }
        `,
        { capabilityManifest: ['plugin.info.get'] }
      ),
      {
        invokeCapability: async () => token,
        inspectResource: (value) =>
          value === token ? { id: 'resource-1', kind: 'disposer' } : null,
        disposeResource
      }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      id: 'resource-1',
      kind: 'disposer',
      keys: ['id', 'kind', 'dispose'],
      frozen: true,
      nullPrototype: true
    })
    expect(disposeResource).toHaveBeenCalledTimes(1)
    runtime.shutdown()
  })

  it.each([
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

  it('cancels only capabilities in the owning lifecycle scope', async () => {
    let rejectCapability!: (error: Error) => void
    const capability = new Promise<unknown>((_resolve, reject) => {
      rejectCapability = reject
    })
    const cancelCapabilityScope = vi.fn(() => {
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
      { invokeCapability: () => capability, cancelCapabilityScope }
    )
    const lifecycle = runtime.callLifecycle('onMessage', [])
    await Promise.resolve()
    await Promise.resolve()

    lifecycle.cancel()

    await expect(lifecycle.promise).rejects.toEqual(
      new PluginHostChildError('PLUGIN_HOST_CHILD_CANCELLED')
    )
    expect(cancelCapabilityScope).toHaveBeenCalledTimes(1)
    expect(cancelCapabilityScope).toHaveBeenCalledWith(expect.any(Number))
    runtime.shutdown()
  })

  it('keeps concurrent lifecycle capability scopes isolated', async () => {
    const pending = new Map<
      string,
      { resolve(value: unknown): void; reject(error: Error): void; scopeId: number }
    >()
    const cancelCapabilityScope = vi.fn((scopeId: number) => {
      for (const entry of pending.values()) {
        if (entry.scopeId !== scopeId) continue
        entry.reject(
          Object.assign(new Error('cancelled'), {
            code: 'PLUGIN_HOST_CHILD_CAPABILITY_CANCELLED'
          })
        )
      }
    })
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            onMessage(id) {
              return hostCapabilities.invoke('plugin.info.get', { id })
            }
          }
        `,
        { capabilityManifest: ['plugin.info.get'] }
      ),
      {
        invokeCapability: (_capability, payload, scopeId) =>
          new Promise((resolve, reject) => {
            pending.set((payload as { id: string }).id, {
              resolve,
              reject,
              scopeId: scopeId!
            })
          }),
        cancelCapabilityScope
      }
    )
    const first = runtime.callLifecycle('onMessage', ['first'])
    const second = runtime.callLifecycle('onMessage', ['second'])
    await vi.waitFor(() => expect(pending.size).toBe(2))

    first.cancel()
    pending.get('second')?.resolve('second-result')

    await expect(first.promise).rejects.toEqual(
      new PluginHostChildError('PLUGIN_HOST_CHILD_CANCELLED')
    )
    await expect(second.promise).resolves.toBe('second-result')
    expect(cancelCapabilityScope).toHaveBeenCalledTimes(1)
    expect(cancelCapabilityScope).toHaveBeenCalledWith(pending.get('first')?.scopeId)
    runtime.shutdown()
  })

  it('runs callback work in its own cancellable capability scope', async () => {
    let childCallback!: () => Promise<unknown>
    let resolveNested!: (value: unknown) => void
    let nestedScopeId = 0
    const cancelCapabilityScope = vi.fn()
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            onInit() {
              return hostCapabilities.invoke('plugin.info.get', {
                callback: () => hostCapabilities.invoke('storage.file.read', null)
              })
            }
          }
        `,
        {
          capabilityManifest: [
            {
              id: 'plugin.info.get',
              callbackLifetime: 'transient',
              callbackFields: ['callback']
            },
            'storage.file.read'
          ]
        }
      ),
      {
        invokeCapability: async (capability, payload, scopeId) => {
          if (capability === 'plugin.info.get') {
            childCallback = (payload as { callback: () => Promise<unknown> }).callback
            return 'registered'
          }
          nestedScopeId = scopeId ?? 0
          return new Promise((resolve) => {
            resolveNested = resolve
          })
        },
        cancelCapabilityScope
      }
    )
    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toBe('registered')

    const callbackCall = runtime.callCallback(() => childCallback())
    await vi.waitFor(() => expect(nestedScopeId).toBeGreaterThan(0))
    callbackCall.cancel()

    await expect(callbackCall.promise).rejects.toEqual(
      new PluginHostChildError('PLUGIN_HOST_CHILD_CANCELLED')
    )
    expect(cancelCapabilityScope).toHaveBeenCalledWith(nestedScopeId)
    resolveNested('late')
    await callbackCall.completion
    runtime.shutdown()
  })

  it('rejects detached capability work after its lifecycle scope has completed', async () => {
    const invokeCapability = vi.fn(async () => 'unexpected-success')
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          let detachedOutcome = null
          module.exports = {
            onMessage() {
              setImmediate(async () => {
                try {
                  await hostCapabilities.invoke('plugin.info.get', null)
                  detachedOutcome = 'unexpected-success'
                } catch (error) {
                  detachedOutcome = error.code
                }
              })
              return 'lifecycle-complete'
            },
            async onClose() {
              while (detachedOutcome === null) {
                await new Promise((resolve) => setTimeout(resolve, 0))
              }
              return detachedOutcome
            }
          }
        `,
        { capabilityManifest: ['plugin.info.get'] }
      ),
      { invokeCapability }
    )

    const lifecycle = runtime.callLifecycle('onMessage', [])
    await expect(lifecycle.promise).resolves.toBe('lifecycle-complete')
    await lifecycle.completion

    await expect(runtime.callLifecycle('onClose', []).promise).resolves.toBe(
      'PLUGIN_HOST_CHILD_CANCELLED'
    )
    expect(invokeCapability).not.toHaveBeenCalled()
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

describe('plugin Prelude declared callback fields', () => {
  it('encodes a callback only at a manifest-declared capability field', async () => {
    const invokeCapability = vi.fn(async (_capability, payload) => {
      const callback = (payload as { callback: (value: string) => Promise<unknown> }).callback
      return callback('declared')
    })
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            onInit() {
              return hostCapabilities.invoke('channel.subscribe', {
                callback: async (value) => 'child:' + value
              })
            }
          }
        `,
        {
          capabilityManifest: [
            {
              id: 'channel.subscribe',
              callbackLifetime: 'resource',
              callbackFields: ['callback']
            }
          ]
        }
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toBe('child:declared')
    expect(invokeCapability).toHaveBeenCalledTimes(1)
    runtime.shutdown()
  })

  it.each([
    ['undeclared top-level field', '{ other: () => null }'],
    ['nested declared field', '{ callback: { nested: () => null } }'],
    ['callback array', '{ callback: [() => null] }']
  ])('rejects callback values in an %s before transport', async (_label, payloadSource) => {
    const invokeCapability = vi.fn()
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              try {
                await hostCapabilities.invoke('channel.subscribe', ${payloadSource})
              } catch (error) {
                return error.code
              }
            }
          }
        `,
        {
          capabilityManifest: [
            {
              id: 'channel.subscribe',
              callbackLifetime: 'resource',
              callbackFields: ['callback']
            }
          ]
        }
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toBe(
      'PLUGIN_HOST_CHILD_CAPABILITY_PAYLOAD_INVALID'
    )
    expect(invokeCapability).not.toHaveBeenCalled()
    runtime.shutdown()
  })
})

describe('plugin Prelude fixed request/reply facades', () => {
  it('projects frozen null-prototype channel, QuickOps and Flow facades', async () => {
    const invokeCapability = vi.fn(async (capability, payload) => ({ capability, payload }))
    const runtime = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              const auth = await touchChannel.send('auth.session.get-state', null)
              const capabilities = await quickOps.capabilities()
              const flowResult = await flow.dispatch(
                {
                  type: 'json',
                  data: { action: 'stop-timer', targetId: 'quickops.stop-timer' },
                  context: { sourcePluginId: 'touch-quickops' }
                },
                {
                  preferredTarget: 'quickops.stop-timer',
                  skipSelector: true,
                  requireAck: true
                }
              )
              return {
                auth,
                capabilities,
                flowResult,
                frozen: Object.isFrozen(touchChannel) && Object.isFrozen(quickOps) && Object.isFrozen(flow),
                prototypes: [
                  Object.getPrototypeOf(touchChannel),
                  Object.getPrototypeOf(quickOps),
                  Object.getPrototypeOf(flow)
                ]
              }
            }
          }
        `,
        { capabilityManifest: ['channel.invoke', 'quick-ops.invoke', 'flow.invoke'] }
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toMatchObject({
      frozen: true,
      prototypes: [null, null, null]
    })
    expect(invokeCapability.mock.calls.map(([capability]) => capability)).toEqual([
      'channel.invoke',
      'quick-ops.invoke',
      'flow.invoke'
    ])
    expect(invokeCapability.mock.calls[0][1]).toEqual({
      operation: 'auth.session.get-state',
      payload: null
    })
    expect(invokeCapability.mock.calls[1][1]).toEqual({
      operation: 'capabilities.get',
      payload: null
    })
    expect(invokeCapability.mock.calls[2][1]).toMatchObject({
      operation: 'quickops.dispatch'
    })
    runtime.shutdown()
  })

  it('omits undeclared facades and denies unknown operations locally', async () => {
    const invokeCapability = vi.fn()
    const undeclared = loadPluginPrelude(
      loadPayload(`
        module.exports = {
          onInit() {
            return {
              touchChannel: typeof touchChannel,
              quickOps: typeof quickOps,
              flow: typeof flow
            }
          }
        }
      `),
      { invokeCapability }
    )
    await expect(undeclared.callLifecycle('onInit', []).promise).resolves.toEqual({
      touchChannel: 'undefined',
      quickOps: 'undefined',
      flow: 'undefined'
    })
    undeclared.shutdown()

    const declared = loadPluginPrelude(
      loadPayload(
        `
          module.exports = {
            async onInit() {
              try {
                await touchChannel.send('account:auth:get-token', null)
                return 'unexpected-success'
              } catch (error) {
                return error.code
              }
            }
          }
        `,
        { capabilityManifest: ['channel.invoke'] }
      ),
      { invokeCapability }
    )
    await expect(declared.callLifecycle('onInit', []).promise).resolves.toBe(
      'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED'
    )
    expect(invokeCapability).not.toHaveBeenCalled()
    declared.shutdown()
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
