import type { PluginHostCapability } from './plugin-host-wire'
import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

/**
 * `plugin.language` exists only inside the isolated child realm, so these tests drive the real VM
 * (`loadPluginPrelude`) and assert on what crosses the wire. The host end is faked: the child
 * projection, the callback encoding and the error codes a plugin can observe are under test here;
 * the host's own gating is covered by `plugin-host-language-capabilities.test.ts`.
 */
const GET = 'language.get'
const SUBSCRIBE = 'language.subscribe'

function manifest(declared: readonly PluginHostCapability[]) {
  return declared.map((id) =>
    id === SUBSCRIBE
      ? { id, callbackLifetime: 'resource' as const, callbackFields: ['onChange'] }
      : { id, callbackLifetime: 'transient' as const, callbackFields: [] }
  )
}

function payload(
  scriptContent: string,
  declared: readonly PluginHostCapability[] = [GET, SUBSCRIBE]
) {
  return {
    scriptContent,
    snapshot: {
      platform: 'darwin',
      arch: 'arm64',
      locale: 'zh-CN',
      manifest: { name: 'language-plugin', activationGeneration: 1 }
    },
    capabilityManifest: manifest(declared),
    callbackLimits: { maxCallbacks: 64, maxConcurrentCallbacks: 16, maxResources: 32 }
  }
}

const token = Object.freeze(Object.create(null) as object)
const subscription = (value: unknown) =>
  value === token ? { id: 'language-subscription-1', kind: 'subscription' as const } : null

function refusal(code: string): Error {
  return Object.assign(new Error('host detail that must not reach the plugin'), { code })
}

describe('plugin host child language facade', () => {
  it('reads the live language from the host while plugin.getLocale() stays the activation snapshot', async () => {
    const invokeCapability = vi.fn(async () => 'en-US')
    const runtime = loadPluginPrelude(
      payload(`
        module.exports = {
          async onInit() {
            return {
              language: await plugin.language.getLanguage(),
              snapshot: plugin.getLocale(),
              keys: Object.keys(plugin.language),
              frozen: Object.isFrozen(plugin.language),
              nullPrototype: Object.getPrototypeOf(plugin.language) === null,
              global: typeof language,
              onPlugin: Object.keys(plugin).includes('language')
            }
          }
        }
      `),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      language: 'en-US',
      snapshot: 'zh-CN',
      keys: ['getLanguage', 'onLanguageChange'],
      frozen: true,
      nullPrototype: true,
      global: 'undefined',
      onPlugin: true
    })
    expect(invokeCapability).toHaveBeenCalledExactlyOnceWith(GET, null, expect.any(Number))
    runtime.shutdown()
  })

  it('hands the host a live callback and the plugin an async disposer that releases once', async () => {
    let registered: { onChange: (language: string) => Promise<unknown> } | undefined
    const invokeCapability = vi.fn(async (_capability: string, request: unknown) => {
      registered = request as typeof registered
      return token
    })
    const disposeResource = vi.fn(async () => undefined)
    const runtime = loadPluginPrelude(
      payload(`
        let stop
        const seen = []
        module.exports = {
          async onInit() {
            stop = await plugin.language.onLanguageChange((language) => {
              seen.push(language)
              return 'ack:' + language
            })
            return { disposer: typeof stop, frozen: Object.isFrozen(stop) }
          },
          async onMessage() {
            await stop()
            await stop()
            return seen
          }
        }
      `),
      { invokeCapability, inspectResource: subscription, disposeResource }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      disposer: 'function',
      frozen: true
    })
    expect(invokeCapability).toHaveBeenCalledExactlyOnceWith(
      SUBSCRIBE,
      { onChange: expect.any(Function) },
      expect.any(Number)
    )
    // The host calls this on its own schedule, long after the subscribe call returned.
    await expect(registered!.onChange('zh-CN')).resolves.toBe('ack:zh-CN')
    await expect(registered!.onChange('en-US')).resolves.toBe('ack:en-US')

    await expect(runtime.callLifecycle('onMessage', []).promise).resolves.toEqual([
      'zh-CN',
      'en-US'
    ])
    // Two stop() calls from the plugin release the host resource once, by the descriptor it issued.
    expect(disposeResource).toHaveBeenCalledExactlyOnceWith(
      'language-subscription-1',
      'subscription'
    )
    runtime.shutdown()
  })

  it('refuses a subscribe result that is not a subscription resource', async () => {
    for (const result of [token, true, null]) {
      const disposeResource = vi.fn(async () => undefined)
      const runtime = loadPluginPrelude(
        payload(`
          module.exports = {
            async onInit() {
              try {
                await plugin.language.onLanguageChange(() => undefined)
                return 'accepted'
              } catch (error) {
                return error.code
              }
            }
          }
        `),
        {
          invokeCapability: async () => result,
          // The host issued a disposer-kind resource, or no resource at all.
          inspectResource: (value) =>
            value === token ? { id: 'not-a-subscription', kind: 'disposer' } : null,
          disposeResource
        }
      )

      await expect(runtime.callLifecycle('onInit', []).promise).resolves.toBe(
        'PLUGIN_HOST_CHILD_CAPABILITY_RESULT_INVALID'
      )
      runtime.shutdown()
    }
  })

  it('lets the plugin see the code of a host refusal and nothing else', async () => {
    const runtime = loadPluginPrelude(
      payload(`
        module.exports = {
          async onInit() {
            const outcome = {}
            for (const name of ['getLanguage', 'onLanguageChange']) {
              try {
                await plugin.language[name](() => undefined)
                outcome[name] = 'accepted'
              } catch (error) {
                outcome[name] = { code: error.code, message: error.message }
              }
            }
            return outcome
          }
        }
      `),
      {
        invokeCapability: async () => {
          throw refusal('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
        }
      }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      getLanguage: {
        code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
        message: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
      },
      onLanguageChange: {
        code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
        message: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
      }
    })
    runtime.shutdown()
  })

  it('projects only the methods whose capability is declared, and nothing when neither is', async () => {
    const invokeCapability = vi.fn()
    const script = `
      module.exports = {
        onInit() {
          return {
            language: typeof plugin.language,
            keys: plugin.language ? Object.keys(plugin.language) : [],
            snapshot: plugin.getLocale()
          }
        }
      }
    `
    const cases: Array<[readonly PluginHostCapability[], string, string[]]> = [
      [[], 'undefined', []],
      [[GET], 'object', ['getLanguage']],
      [[SUBSCRIBE], 'object', ['onLanguageChange']]
    ]

    for (const [declared, language, keys] of cases) {
      const runtime = loadPluginPrelude(payload(script, declared), { invokeCapability })
      await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
        language,
        keys,
        snapshot: 'zh-CN'
      })
      runtime.shutdown()
    }
    expect(invokeCapability).not.toHaveBeenCalled()
  })

  it('does not open a Node escape through the facade', async () => {
    const runtime = loadPluginPrelude(
      payload(`
        module.exports = {
          onInit() {
            const attempts = [
              () => plugin.language.getLanguage.constructor('return process')(),
              () => plugin.language.onLanguageChange.constructor('return process')(),
              () => plugin.language.constructor('return process')()
            ]
            return {
              escapes: attempts.map((attempt) => {
                try { attempt(); return true } catch { return false }
              }),
              processType: typeof process,
              requireType: typeof require
            }
          }
        }
      `),
      { invokeCapability: vi.fn() }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      escapes: [false, false, false],
      processType: 'undefined',
      requireType: 'undefined'
    })
    runtime.shutdown()
  })
})
