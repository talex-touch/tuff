import type {
  HandlerContext,
  ITuffTransportMain,
  TuffEvent
} from '@talex-touch/utils/transport/main'
import { SdkApi } from '@talex-touch/utils/plugin'
import {
  type AppLocale,
  ScopedDomainLexiconRegistry,
  officialDomainLexiconRegistry
} from '@talex-touch/utils/i18n'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  getPermissionModule: vi.fn(),
  getPluginByName: vi.fn()
}))

vi.mock('../permission/index', () => ({
  getPermissionModule: mocks.getPermissionModule
}))

vi.mock('./plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      getPluginByName: mocks.getPluginByName
    }
  }
}))
vi.mock('../../utils/i18n-helper', () => ({
  getLocale: vi.fn(() => 'zh-CN')
}))

import { registerPluginLocalizationChannels } from './plugin-localization-channels'

type RegisteredHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown

const pluginContext = {
  plugin: { name: 'plugin-a', verified: true, uniqueKey: 'plugin-a-key' }
} as HandlerContext

function createTransport() {
  const handlers = new Map<string, RegisteredHandler>()
  const transport = {
    on: vi.fn(
      <TReq, TRes>(
        event: TuffEvent<TReq, TRes> & { toEventName: () => string },
        handler: (payload: TReq, context: HandlerContext) => TRes | Promise<TRes>
      ) => {
        handlers.set(event.toEventName(), handler as RegisteredHandler)
        return () => handlers.delete(event.toEventName())
      }
    )
  } as unknown as ITuffTransportMain

  const invoke = async (
    event: { toEventName: () => string },
    payload: unknown,
    context = pluginContext
  ) => {
    const handler = handlers.get(event.toEventName())
    if (!handler) throw new Error(`No registered handler for ${event.toEventName()}`)
    return handler(payload, context)
  }

  return { transport, invoke }
}

function createRegistry(): ScopedDomainLexiconRegistry {
  return new ScopedDomainLexiconRegistry(officialDomainLexiconRegistry)
}

function registerChannels(
  options: {
    registry?: ScopedDomainLexiconRegistry
    getLocale?: () => AppLocale
    sdkapi?: number
  } = {}
) {
  const channel = createTransport()
  const registry = options.registry ?? createRegistry()
  const getLocale = vi.fn<() => AppLocale>(options.getLocale ?? (() => 'zh-CN'))
  registerPluginLocalizationChannels(channel.transport, {
    resolvePlugin: vi.fn(() => ({ sdkapi: options.sdkapi ?? SdkApi.V260713 })),
    getLocale,
    lexiconRegistry: registry
  })
  return { ...channel, registry, getLocale }
}

describe('registerPluginLocalizationChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPermissionModule.mockReturnValue({ checkPermission: mocks.checkPermission })
    mocks.getPluginByName.mockReturnValue({ sdkapi: SdkApi.V260713 })
    mocks.checkPermission.mockReturnValue({ allowed: true })
  })

  it('projects the host locale and resolves localized values through verified plugin channels', async () => {
    const { invoke } = registerChannels()
    const value = { default: 'English', locales: { 'zh-CN': '中文' } }

    await expect(invoke(PluginEvents.i18n.getLocale, { _sdkapi: SdkApi.V260713 })).resolves.toBe(
      'zh-CN'
    )
    await expect(
      invoke(PluginEvents.i18n.resolveText, { value, _sdkapi: SdkApi.V260713 })
    ).resolves.toBe('中文')
    await expect(
      invoke(PluginEvents.i18n.resolveText, {
        value,
        locale: 'en-US',
        _sdkapi: SdkApi.V260713
      })
    ).resolves.toBe('English')
  })

  it('uses the verified context identity for lexicon register, resolve, and search', async () => {
    const { invoke, registry } = registerChannels()
    registry.register('plugin-b', [
      {
        id: 'private',
        domain: 'capability',
        version: '1',
        labels: { default: 'Plugin B Private' },
        aliases: { default: ['plugin-b-private'] }
      }
    ])
    const entry = {
      id: 'private',
      domain: 'capability' as const,
      version: '1',
      labels: { default: 'Plugin A Private' },
      aliases: { default: ['plugin-a-private'] }
    }

    await expect(
      invoke(PluginEvents.lexicon.register, {
        entries: [entry],
        _sdkapi: SdkApi.V260713,
        pluginId: 'plugin-b'
      })
    ).resolves.toEqual({
      namespace: 'plugin:plugin-a:',
      ids: ['plugin:plugin-a:private'],
      registered: 1,
      total: 1
    })
    await expect(
      invoke(PluginEvents.lexicon.resolve, {
        id: 'private',
        _sdkapi: SdkApi.V260713,
        pluginId: 'plugin-b'
      })
    ).resolves.toEqual(
      expect.objectContaining({
        label: 'Plugin A Private',
        entry: expect.objectContaining({ source: 'plugin:plugin-a' })
      })
    )
    await expect(
      invoke(PluginEvents.lexicon.search, {
        query: 'plugin-b-private',
        _sdkapi: SdkApi.V260713,
        pluginId: 'plugin-b'
      })
    ).resolves.toEqual([])
  })

  it('fails closed without a verified plugin identity before reaching host services', async () => {
    const { invoke, getLocale } = registerChannels()

    await expect(
      invoke(PluginEvents.i18n.getLocale, { _sdkapi: SdkApi.V260713 }, {} as HandlerContext)
    ).rejects.toMatchObject({ code: 'PLUGIN_I18N_PERMISSION_DENIED' })
    expect(getLocale).not.toHaveBeenCalled()
  })

  it('rejects a loaded plugin below the localization SDK floor before resolution', async () => {
    const { invoke, registry } = registerChannels({ sdkapi: SdkApi.V260626 })
    const resolve = vi.spyOn(registry, 'resolve')

    await expect(
      invoke(PluginEvents.lexicon.resolve, { id: 'unit.length.meter', _sdkapi: SdkApi.V260713 })
    ).rejects.toMatchObject({ code: 'PLUGIN_LOCALIZATION_SDK_UNSUPPORTED' })
    expect(resolve).not.toHaveBeenCalled()
  })
  it('fails closed with the configured unavailable codes before host services run', async () => {
    mocks.getPermissionModule.mockReturnValue(null)
    const { invoke, registry, getLocale } = registerChannels()
    const resolve = vi.spyOn(registry, 'resolve')

    await expect(
      invoke(PluginEvents.i18n.getLocale, { _sdkapi: SdkApi.V260713 })
    ).rejects.toMatchObject({ code: 'PLUGIN_I18N_PERMISSION_UNAVAILABLE' })
    await expect(
      invoke(PluginEvents.lexicon.resolve, { id: 'unit.length.meter', _sdkapi: SdkApi.V260713 })
    ).rejects.toMatchObject({ code: 'PLUGIN_LEXICON_PERMISSION_UNAVAILABLE' })

    expect(getLocale).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('rejects a payload sdkapi that disagrees with the loaded plugin before resolution', async () => {
    const { invoke, registry } = registerChannels()
    const resolve = vi.spyOn(registry, 'resolve')

    await expect(
      invoke(PluginEvents.lexicon.resolve, { id: 'unit.length.meter', _sdkapi: SdkApi.V260626 })
    ).rejects.toMatchObject({ code: 'SDKAPI_MISMATCH' })
    expect(resolve).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'i18n reads',
      event: PluginEvents.i18n.resolveText,
      permission: 'i18n.read',
      payload: { value: 'Hello', _sdkapi: SdkApi.V260713 },
      code: 'PLUGIN_I18N_PERMISSION_DENIED',
      service: (_registry: ScopedDomainLexiconRegistry, getLocale: ReturnType<typeof vi.fn>) =>
        [getLocale] as const
    },
    {
      name: 'lexicon resolves',
      event: PluginEvents.lexicon.resolve,
      permission: 'lexicon.read',
      payload: { id: 'unit.length.meter', _sdkapi: SdkApi.V260713 },
      code: 'PLUGIN_LEXICON_PERMISSION_DENIED',
      service: (registry: ScopedDomainLexiconRegistry) => [vi.spyOn(registry, 'resolve')] as const
    },
    {
      name: 'lexicon searches',
      event: PluginEvents.lexicon.search,
      permission: 'lexicon.read',
      payload: { query: 'meter', _sdkapi: SdkApi.V260713 },
      code: 'PLUGIN_LEXICON_PERMISSION_DENIED',
      service: (registry: ScopedDomainLexiconRegistry) => [vi.spyOn(registry, 'search')] as const
    },
    {
      name: 'lexicon registration',
      event: PluginEvents.lexicon.register,
      permission: 'lexicon.register',
      payload: {
        entries: [
          {
            id: 'blocked',
            domain: 'capability',
            version: '1',
            labels: { default: 'Blocked' },
            aliases: { default: ['blocked'] }
          }
        ],
        _sdkapi: SdkApi.V260713
      },
      code: 'PLUGIN_LEXICON_PERMISSION_DENIED',
      service: (registry: ScopedDomainLexiconRegistry) => [vi.spyOn(registry, 'register')] as const
    }
  ])(
    'denies $name without invoking its host service',
    async ({ event, permission, payload, code, service }) => {
      mocks.checkPermission.mockImplementation((_pluginId: string, permissionId: string) => ({
        allowed: permissionId !== permission,
        reason: 'permission denied'
      }))
      const { invoke, registry, getLocale } = registerChannels()
      const services = service(registry, getLocale)

      await expect(invoke(event, payload)).rejects.toMatchObject({ code })
      for (const dependency of services) {
        expect(dependency).not.toHaveBeenCalled()
      }
    }
  )
})
