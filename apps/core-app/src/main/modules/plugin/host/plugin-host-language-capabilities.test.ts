import type { AppLocale } from '@talex-touch/utils/i18n'
import { LOCALIZATION_FACADE_MIN_VERSION } from '@talex-touch/utils/plugin'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { issuePluginSecurityContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import { PluginHostResourceRegistry } from './plugin-host-resources'
import { createPluginLanguageCapabilities } from './plugin-host-language-capabilities'
import { HOST_PROTOCOL_VERSION, type HostMessageOwner } from './plugin-host-wire'

/**
 * Host end of `plugin.language` for an isolated Prelude. The child-realm projection is covered by
 * `plugin-host-child-language.test.ts`; this file pins what the host does with a call once it
 * arrives: who may subscribe, what is delivered and when, and that every way of ending a
 * subscription really stops the delivery. The registries are the real ones — gating is exercised
 * through `dispatch`, not by calling the handlers around it.
 */
const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'language-host-handle',
  hostGeneration: 5
}

const PLUGIN = 'language-plugin'
const GET = 'language.get'
const SUBSCRIBE = 'language.subscribe'

function activation(generation = 1): PluginActivationIdentity {
  return {
    name: PLUGIN,
    pluginInstanceId: `instance-${PLUGIN}`,
    activationGeneration: generation,
    key: `key-${PLUGIN}`
  }
}

/** The app language as the host sees it: a readable value plus a change signal. */
function createLanguageService(initial: AppLocale = 'zh-CN') {
  let current: AppLocale = initial
  const listeners = new Set<(language: AppLocale) => void>()
  return {
    getLanguage: vi.fn(() => current),
    onLanguageChange: vi.fn((listener: (language: AppLocale) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }),
    /** What a real change does: the value moves, then everyone is told. */
    change(next: AppLocale) {
      current = next
      for (const listener of [...listeners]) listener(next)
    },
    /** A notification that is not backed by the value (it was superseded before delivery). */
    emit(stale: AppLocale) {
      for (const listener of [...listeners]) listener(stale)
    },
    set(next: AppLocale) {
      current = next
    },
    listeners
  }
}

/** The permission module as the registries use it: one grant, and the revoke watchers on it. */
function createPermissionBoard(initiallyGranted: boolean) {
  let granted = initiallyGranted
  const watchers = new Set<{ permissionId: string; onRevoke: () => void }>()
  return {
    authorize: vi.fn((_pluginName: string, _permissionId: string) => granted),
    watchPermissionRevoked: vi.fn(
      (_pluginName: string, permissionId: string, onRevoke: () => void) => {
        const watcher = { permissionId, onRevoke }
        watchers.add(watcher)
        return () => {
          watchers.delete(watcher)
        }
      }
    ),
    revoke(permissionId: string) {
      granted = false
      for (const watcher of [...watchers]) {
        if (watcher.permissionId === permissionId) watcher.onRevoke()
      }
    },
    watchers
  }
}

interface HarnessOptions {
  sdkapi?: number | undefined
  granted?: boolean
  /** What the capability itself believes is the current activation (the registry always knows). */
  resolveCurrentActivation?: () => PluginActivationIdentity | undefined
  resolveHostGeneration?: () => number | undefined
  maxSubscriptions?: number
}

function createHarness(options: HarnessOptions = {}) {
  const current = activation()
  const language = createLanguageService()
  const permissions = createPermissionBoard(options.granted ?? true)
  const onFatalViolation = vi.fn()
  const resources = new PluginHostResourceRegistry({
    owner,
    activation: current,
    resolveCurrentActivation: () => current,
    isActive: () => true,
    watchPermissionRevoked: permissions.watchPermissionRevoked,
    onFatalViolation,
    ...(options.maxSubscriptions === undefined
      ? {}
      : { maxSubscriptions: options.maxSubscriptions })
  })
  const resolveSdkApi = vi.fn(() =>
    'sdkapi' in options ? options.sdkapi : LOCALIZATION_FACADE_MIN_VERSION
  )
  const capabilities = createPluginLanguageCapabilities({
    resolveCurrentActivation: options.resolveCurrentActivation ?? (() => current),
    resolveHostGeneration: options.resolveHostGeneration ?? (() => owner.hostGeneration),
    resolveSdkApi,
    service: language
  })
  const registry = new PluginHostCapabilityRegistry({
    owner,
    activation: current,
    resolveCurrentActivation: () => current,
    authorize: permissions.authorize,
    watchPermissionRevoked: permissions.watchPermissionRevoked,
    resources,
    onFatalViolation
  })
  for (const definition of capabilities.definitions) registry.register(definition)
  return {
    registry,
    resources,
    language,
    permissions,
    onFatalViolation,
    resolveSdkApi,
    capabilities,
    activation: current
  }
}

function definitionOf(harness: ReturnType<typeof createHarness>, id: string) {
  const definition = harness.capabilities.definitions.find((candidate) => candidate.id === id)
  if (!definition) throw new Error(`missing definition: ${id}`)
  return definition
}

/** Lets the macrotask the first delivery rides on, and the promise hop after it, run. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
  await new Promise<void>((resolve) => setImmediate(resolve))
}

async function subscribe(
  harness: ReturnType<typeof createHarness>,
  onChange: (language: AppLocale) => unknown
): Promise<{ id: string; kind: string }> {
  const handle = await harness.registry.dispatch(SUBSCRIBE, { onChange })
  const descriptor = harness.resources.inspect(handle)
  expect(descriptor).not.toBeNull()
  return descriptor!
}

const refusal = (code: string) => expect.objectContaining({ code })

describe('host language capabilities', () => {
  describe('declaration', () => {
    it('puts both capabilities behind the plugin own i18n.read grant', () => {
      const harness = createHarness()
      const [get, subscribeDefinition] = harness.capabilities.definitions

      expect(harness.capabilities.definitions.map((definition) => definition.id)).toEqual([
        GET,
        SUBSCRIBE
      ])
      expect(get.permission).toBe('i18n.read')
      expect(subscribeDefinition.permission).toBe('i18n.read')
      expect(get.callbackLifetime).toBe('transient')
      expect(get.callbackFields).toEqual([])
      expect(subscribeDefinition.callbackLifetime).toBe('resource')
      expect(subscribeDefinition.callbackFields).toEqual(['onChange'])
      expect(Object.isFrozen(harness.capabilities.definitions)).toBe(true)
      expect(
        harness.capabilities.definitions.every((definition) => Object.isFrozen(definition))
      ).toBe(true)
    })
  })

  describe('language.get', () => {
    it('reads the live language, not a snapshot taken at activation', async () => {
      const harness = createHarness()

      await expect(harness.registry.dispatch(GET, null)).resolves.toBe('zh-CN')
      harness.language.change('en-US')
      await expect(harness.registry.dispatch(GET, null)).resolves.toBe('en-US')
      expect(harness.permissions.authorize).toHaveBeenCalledWith(PLUGIN, 'i18n.read')
    })

    it('takes no request at all and never makes a subscription', async () => {
      const harness = createHarness()

      for (const request of [undefined, {}, 'en-US', { locale: 'en-US' }, []]) {
        await expect(harness.registry.dispatch(GET, request)).rejects.toEqual(
          refusal('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
        )
      }
      expect(harness.language.getLanguage).not.toHaveBeenCalled()
      expect(harness.language.listeners.size).toBe(0)
      expect(harness.resources.size).toBe(0)
    })

    it('refuses a host value that is not an app locale instead of passing it on', async () => {
      const harness = createHarness()
      harness.language.getLanguage.mockReturnValueOnce('fr-FR' as never)

      await expect(harness.registry.dispatch(GET, null)).rejects.toEqual(
        refusal('PLUGIN_HOST_CAPABILITY_INVALID_RESULT')
      )
    })
  })

  describe('gating', () => {
    it('refuses both capabilities for a plugin without i18n.read, before any language is read', async () => {
      const harness = createHarness({ granted: false })

      await expect(harness.registry.dispatch(GET, null)).rejects.toEqual(
        refusal('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
      )
      await expect(harness.registry.dispatch(SUBSCRIBE, { onChange: vi.fn() })).rejects.toEqual(
        refusal('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
      )
      expect(harness.language.getLanguage).not.toHaveBeenCalled()
      expect(harness.language.onLanguageChange).not.toHaveBeenCalled()
      expect(harness.resources.size).toBe(0)
    })

    const unsupported: Array<[string, number | undefined]> = [
      ['below the localization floor', LOCALIZATION_FACADE_MIN_VERSION - 1],
      ['unknown', undefined]
    ]
    it.each(unsupported)(
      'refuses a plugin whose sdkapi is %s, without subscribing it',
      async (_label, sdkapi) => {
        const harness = createHarness({ sdkapi })

        await expect(harness.registry.dispatch(GET, null)).rejects.toEqual(
          refusal('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
        )
        const onChange = vi.fn()
        await expect(harness.registry.dispatch(SUBSCRIBE, { onChange })).rejects.toEqual(
          refusal('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
        )
        await settle()

        expect(harness.resolveSdkApi).toHaveBeenCalledWith(PLUGIN)
        expect(harness.language.onLanguageChange).not.toHaveBeenCalled()
        expect(harness.language.listeners.size).toBe(0)
        expect(harness.resources.size).toBe(0)
        expect(onChange).not.toHaveBeenCalled()
      }
    )

    it('accepts a plugin exactly at the localization floor', async () => {
      const harness = createHarness({ sdkapi: LOCALIZATION_FACADE_MIN_VERSION })
      const onChange = vi.fn()

      await expect(harness.registry.dispatch(GET, null)).resolves.toBe('zh-CN')
      await subscribe(harness, onChange)
      await settle()

      expect(onChange).toHaveBeenCalledWith('zh-CN')
    })

    const notCurrent: Array<[string, () => PluginActivationIdentity | undefined]> = [
      ['a replaced activation', () => activation(2)],
      ['an unloaded plugin', () => undefined]
    ]
    it.each(notCurrent)(
      'refuses when the capability sees %s as current, without subscribing',
      async (_label, resolve) => {
        const harness = createHarness({ resolveCurrentActivation: resolve })

        await expect(harness.registry.dispatch(GET, null)).rejects.toEqual(
          refusal('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED')
        )
        await expect(harness.registry.dispatch(SUBSCRIBE, { onChange: vi.fn() })).rejects.toEqual(
          refusal('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED')
        )
        expect(harness.language.getLanguage).not.toHaveBeenCalled()
        expect(harness.language.onLanguageChange).not.toHaveBeenCalled()
        expect(harness.resources.size).toBe(0)
      }
    )

    it('refuses when the host process generation is not the one the call came from', async () => {
      const harness = createHarness({ resolveHostGeneration: () => owner.hostGeneration + 1 })

      await expect(harness.registry.dispatch(GET, null)).rejects.toEqual(
        refusal('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED')
      )
      await expect(harness.registry.dispatch(SUBSCRIBE, { onChange: vi.fn() })).rejects.toEqual(
        refusal('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED')
      )
      expect(harness.language.onLanguageChange).not.toHaveBeenCalled()
    })

    it('does not honour a context that is not the host-issued identity of this activation', () => {
      const harness = createHarness()
      const subscribeDefinition = definitionOf(harness, SUBSCRIBE)
      const invocation = harness.resources.beginInvocation({
        capabilityId: SUBSCRIBE,
        permissionId: 'i18n.read'
      })
      const signal = new AbortController().signal
      const request = { onChange: vi.fn() }
      // Everything but the authority is right, so only the authority can be what refuses it.
      const surface = issuePluginSecurityContext(activation(), 'web-contents', {
        senderId: 3,
        hostGeneration: owner.hostGeneration
      })
      const forged = { name: PLUGIN, uniqueKey: `key-${PLUGIN}` }

      for (const context of [surface, forged]) {
        expect(() =>
          subscribeDefinition.invoke(context as never, request, signal, invocation.resources)
        ).toThrow('PLUGIN_LANGUAGE_CAPABILITY_INVALID')
      }
      expect(harness.language.onLanguageChange).not.toHaveBeenCalled()
    })

    it('does not subscribe for a call that was already aborted', async () => {
      const harness = createHarness()
      const subscribeDefinition = definitionOf(harness, SUBSCRIBE)
      const invocation = harness.resources.beginInvocation({
        capabilityId: SUBSCRIBE,
        permissionId: 'i18n.read'
      })
      const context = issuePluginSecurityContext(harness.activation, 'plugin-host', {
        hostGeneration: owner.hostGeneration
      })
      const controller = new AbortController()
      controller.abort()

      expect(() =>
        subscribeDefinition.invoke(
          context,
          { onChange: vi.fn() },
          controller.signal,
          invocation.resources
        )
      ).toThrow('PLUGIN_LANGUAGE_CAPABILITY_INVALID')
      expect(harness.language.onLanguageChange).not.toHaveBeenCalled()
      await invocation.rollback()
      expect(harness.resources.size).toBe(0)

      const aborted = new AbortController()
      aborted.abort()
      await expect(
        harness.registry.dispatch(SUBSCRIBE, { onChange: vi.fn() }, aborted.signal)
      ).rejects.toEqual(refusal('PLUGIN_HOST_CAPABILITY_CANCELLED'))
      expect(harness.language.onLanguageChange).not.toHaveBeenCalled()
    })
  })

  describe('subscribe request shape', () => {
    const onChange = () => undefined

    it('accepts exactly { onChange } and hands the handler on frozen', () => {
      const validate = definitionOf(createHarness(), SUBSCRIBE).validateRequest

      const accepted = validate({ onChange }) as { onChange: unknown }
      expect(accepted.onChange).toBe(onChange)
      expect(Object.isFrozen(accepted)).toBe(true)
      const bare = Object.create(null)
      bare.onChange = onChange
      expect(() => validate(bare)).not.toThrow()
    })

    it('rejects every other shape', () => {
      const validate = definitionOf(createHarness(), SUBSCRIBE).validateRequest
      class Handler {
        onChange = onChange
      }
      const accessor = {
        get onChange() {
          return onChange
        }
      }
      const hidden = Object.defineProperty({}, 'onChange', { value: onChange, enumerable: false })
      const symbol = { onChange, [Symbol('extra')]: 1 }

      const rejected: Array<[string, unknown]> = [
        ['null', null],
        ['undefined', undefined],
        ['string', 'onChange'],
        ['function', onChange],
        ['array', [onChange]],
        ['empty object', {}],
        ['handler is not a function', { onChange: 'zh-CN' }],
        ['extra data key', { onChange, extra: 1 }],
        ['extra function key', { onChange, other: onChange }],
        ['symbol key', symbol],
        ['accessor handler', accessor],
        ['non-enumerable handler', hidden],
        ['inherited handler', Object.create({ onChange })],
        ['class instance', new Handler()],
        ['proxy', new Proxy({ onChange }, {})]
      ]
      for (const [label, value] of rejected) {
        expect(() => validate(value), label).toThrow('PLUGIN_LANGUAGE_CAPABILITY_INVALID')
      }
    })

    it('refuses a malformed request through the registry before anything subscribes', async () => {
      const harness = createHarness()

      for (const request of [
        undefined,
        null,
        {},
        { onChange: 'zh-CN' },
        { onChange: vi.fn(), extra: 1 },
        { onChange: vi.fn(), other: vi.fn() }
      ]) {
        await expect(harness.registry.dispatch(SUBSCRIBE, request)).rejects.toEqual(
          refusal('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
        )
      }
      expect(harness.language.onLanguageChange).not.toHaveBeenCalled()
      expect(harness.resources.size).toBe(0)
    })
  })

  describe('delivery', () => {
    it('answers the call first and then delivers the current language once', async () => {
      const harness = createHarness()
      const order: string[] = []
      const onChange = vi.fn((language: AppLocale) => {
        order.push(`language:${language}`)
      })

      const descriptor = await subscribe(harness, onChange)
      order.push('handle')
      await settle()

      expect(descriptor.kind).toBe('subscription')
      expect(order).toEqual(['handle', 'language:zh-CN'])
      expect(harness.language.onLanguageChange).toHaveBeenCalledTimes(1)
    })

    it('delivers each real change once, and nothing for a notification that changes nothing', async () => {
      const harness = createHarness()
      const onChange = vi.fn()
      await subscribe(harness, onChange)
      await settle()

      harness.language.change('zh-CN')
      harness.language.change('zh-CN')
      await settle()
      expect(onChange.mock.calls).toEqual([['zh-CN']])

      harness.language.change('en-US')
      harness.language.change('en-US')
      await settle()
      harness.language.change('zh-CN')
      await settle()

      expect(onChange.mock.calls).toEqual([['zh-CN'], ['en-US'], ['zh-CN']])
    })

    it('delivers the language as it is when the handler is called, not what the signal carried', async () => {
      const harness = createHarness()
      const onChange = vi.fn()
      await subscribe(harness, onChange)
      await settle()

      harness.language.set('en-US')
      harness.language.emit('zh-CN')
      await settle()

      expect(onChange.mock.calls).toEqual([['zh-CN'], ['en-US']])
    })

    it('does not deliver the first language at all when the subscription ends before it is due', async () => {
      const harness = createHarness()
      const onChange = vi.fn()
      const descriptor = await subscribe(harness, onChange)

      await harness.resources.dispose(descriptor.id, 'subscription')
      await settle()

      expect(onChange).not.toHaveBeenCalled()
      expect(harness.language.listeners.size).toBe(0)
    })

    it('does not leak a failing handler as an unhandled rejection', async () => {
      const harness = createHarness()
      const onChange = vi.fn(async (language: AppLocale) => {
        if (language === 'en-US') throw new Error('handler failed')
      })
      await subscribe(harness, onChange)
      await settle()

      harness.language.change('en-US')
      await settle()
      harness.language.change('zh-CN')
      await settle()

      expect(onChange.mock.calls).toEqual([['zh-CN'], ['en-US'], ['zh-CN']])
    })
  })

  describe('ending a subscription', () => {
    it('stops listening and delivering once the resource is disposed', async () => {
      const harness = createHarness()
      const onChange = vi.fn()
      const descriptor = await subscribe(harness, onChange)
      await settle()
      expect(harness.language.listeners.size).toBe(1)
      const listener = harness.language.onLanguageChange.mock.calls[0][0]

      await harness.resources.dispose(descriptor.id, 'subscription')

      expect(harness.language.listeners.size).toBe(0)
      harness.language.change('en-US')
      // A notification the host emitter was already holding when the subscription ended.
      listener('en-US')
      await settle()
      expect(onChange.mock.calls).toEqual([['zh-CN']])
    })

    it('leaves no listener behind when the resource cannot be registered', async () => {
      const harness = createHarness({ maxSubscriptions: 1 })
      await subscribe(harness, vi.fn())
      expect(harness.language.listeners.size).toBe(1)

      await expect(harness.registry.dispatch(SUBSCRIBE, { onChange: vi.fn() })).rejects.toEqual(
        refusal('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED')
      )

      expect(harness.language.onLanguageChange).toHaveBeenCalledTimes(2)
      expect(harness.language.listeners.size).toBe(1)
      expect(harness.resources.size).toBe(1)
    })

    it('releases every subscription when the activation is torn down', async () => {
      const harness = createHarness()
      const first = vi.fn()
      const second = vi.fn()
      await subscribe(harness, first)
      await subscribe(harness, second)
      await settle()

      await harness.resources.close()

      expect(harness.language.listeners.size).toBe(0)
      harness.language.change('en-US')
      await settle()
      expect(first.mock.calls).toEqual([['zh-CN']])
      expect(second.mock.calls).toEqual([['zh-CN']])
    })

    it('treats revoking i18n.read under a live subscription as fatal for the activation, and teardown releases it', async () => {
      const harness = createHarness()
      const onChange = vi.fn()
      await subscribe(harness, onChange)
      await settle()
      // The call that created it is over; only the resource-lifetime watcher remains.
      expect(harness.permissions.watchers.size).toBe(1)

      harness.permissions.revoke('i18n.read')

      expect(harness.onFatalViolation).toHaveBeenCalledWith(
        'PLUGIN_HOST_RESOURCE_PERMISSION_REVOKED'
      )
      // What the runtime does with that: the activation is torn down and its resources closed.
      await harness.resources.close()
      expect(harness.language.listeners.size).toBe(0)
      harness.language.change('en-US')
      await settle()
      expect(onChange.mock.calls).toEqual([['zh-CN']])
    })
  })
})
