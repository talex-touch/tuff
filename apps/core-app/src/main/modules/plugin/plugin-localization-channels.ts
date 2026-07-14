import type {
  AppLocale,
  DomainLexiconDomain,
  DomainLexiconSearchOptions,
  LocalizedTextValue,
  PluginLexiconResolveOptions,
  ScopedDomainLexiconRegistry
} from '@talex-touch/utils/i18n'
import {
  DEFAULT_APP_LOCALE,
  DOMAIN_LEXICON_DOMAINS,
  isAppLocale,
  isLocalizedText,
  officialDomainLexiconRegistry,
  resolveLocalizedText,
  ScopedDomainLexiconRegistry as ScopedDomainLexiconRegistryImpl
} from '@talex-touch/utils/i18n'
import { LOCALIZATION_FACADE_MIN_VERSION } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import { getLocale } from '../../utils/i18n-helper'
import { createProtectedRegister } from '../permission/channel-guard'

export const PLUGIN_LOCALIZATION_ERROR_CODES = {
  permissionUnavailable: 'PLUGIN_I18N_PERMISSION_UNAVAILABLE',
  permissionDenied: 'PLUGIN_I18N_PERMISSION_DENIED',
  lexiconPermissionUnavailable: 'PLUGIN_LEXICON_PERMISSION_UNAVAILABLE',
  lexiconPermissionDenied: 'PLUGIN_LEXICON_PERMISSION_DENIED',
  sdkUnsupported: 'PLUGIN_LOCALIZATION_SDK_UNSUPPORTED',
  invalidRequest: 'PLUGIN_LOCALIZATION_INVALID_REQUEST',
  pluginUnavailable: 'PLUGIN_LOCALIZATION_PLUGIN_UNAVAILABLE'
} as const

export interface PluginLocalizationRuntime {
  sdkapi?: number
}

export interface RegisterPluginLocalizationChannelsOptions {
  resolvePlugin: (pluginId: string) => PluginLocalizationRuntime | undefined
  getLocale?: () => AppLocale
  lexiconRegistry?: ScopedDomainLexiconRegistry
}

export const pluginScopedLexiconRegistry = new ScopedDomainLexiconRegistryImpl(
  officialDomainLexiconRegistry
)

export function clearPluginLocalizationEntries(pluginId: string): boolean {
  return pluginScopedLexiconRegistry.clear(pluginId)
}

export function registerPluginLocalizationChannels(
  transport: ITuffTransportMain,
  options: RegisterPluginLocalizationChannelsOptions
): Array<() => void> {
  const registerProtected = createProtectedRegister(transport)
  const lexiconRegistry = options.lexiconRegistry ?? pluginScopedLexiconRegistry
  const resolveHostLocale = options.getLocale ?? getHostLocale
  const i18nPermission = {
    permissionId: 'i18n.read',
    failClosedForPlugin: true,
    requireVerifiedPlugin: true,
    unavailableCode: PLUGIN_LOCALIZATION_ERROR_CODES.permissionUnavailable,
    deniedCode: PLUGIN_LOCALIZATION_ERROR_CODES.permissionDenied,
    sdkMismatchCode: 'SDKAPI_MISMATCH'
  } as const
  const lexiconReadPermission = {
    permissionId: 'lexicon.read',
    failClosedForPlugin: true,
    requireVerifiedPlugin: true,
    unavailableCode: PLUGIN_LOCALIZATION_ERROR_CODES.lexiconPermissionUnavailable,
    deniedCode: PLUGIN_LOCALIZATION_ERROR_CODES.lexiconPermissionDenied,
    sdkMismatchCode: 'SDKAPI_MISMATCH'
  } as const
  const lexiconRegisterPermission = {
    ...lexiconReadPermission,
    permissionId: 'lexicon.register'
  } as const

  return [
    registerProtected(PluginEvents.i18n.getLocale, i18nPermission, (_payload, context) => {
      resolveSupportedPlugin(context, options.resolvePlugin)
      return resolveHostLocale()
    }),
    registerProtected(PluginEvents.i18n.resolveText, i18nPermission, (payload, context) => {
      resolveSupportedPlugin(context, options.resolvePlugin)
      const locale = resolveLocale(payload?.locale, resolveHostLocale)
      return resolveLocalizedTextValue(payload?.value, locale)
    }),
    registerProtected(PluginEvents.lexicon.resolve, lexiconReadPermission, (payload, context) => {
      const pluginId = resolveSupportedPlugin(context, options.resolvePlugin)
      const id = normalizeRequiredText(payload?.id, 'lexicon id')
      const resolveOptions = normalizeResolveOptions(payload?.options, resolveHostLocale)
      return lexiconRegistry.resolve(pluginId, id, resolveOptions)
    }),
    registerProtected(PluginEvents.lexicon.search, lexiconReadPermission, (payload, context) => {
      const pluginId = resolveSupportedPlugin(context, options.resolvePlugin)
      const query = normalizeRequiredText(payload?.query, 'lexicon query')
      const searchOptions = normalizeSearchOptions(payload?.options, resolveHostLocale)
      return lexiconRegistry.search(pluginId, query, searchOptions)
    }),
    registerProtected(
      PluginEvents.lexicon.register,
      lexiconRegisterPermission,
      (payload, context) => {
        const pluginId = resolveSupportedPlugin(context, options.resolvePlugin)
        if (!Array.isArray(payload?.entries)) {
          throw createLocalizationError(
            'Plugin lexicon entries must be an array',
            PLUGIN_LOCALIZATION_ERROR_CODES.invalidRequest,
            pluginId
          )
        }
        return lexiconRegistry.register(pluginId, payload.entries, payload.options)
      }
    )
  ]
}

function getHostLocale(): AppLocale {
  const locale = getLocale()
  return isAppLocale(locale) ? locale : DEFAULT_APP_LOCALE
}

function resolveSupportedPlugin(
  context: HandlerContext,
  resolvePlugin: RegisterPluginLocalizationChannelsOptions['resolvePlugin']
): string {
  const pluginId = context.plugin?.name
  if (!pluginId || context.plugin?.verified !== true) {
    throw createLocalizationError(
      'Verified plugin context is required',
      PLUGIN_LOCALIZATION_ERROR_CODES.permissionDenied,
      pluginId ?? 'unknown'
    )
  }

  const plugin = resolvePlugin(pluginId)
  if (!plugin) {
    throw createLocalizationError(
      `Plugin '${pluginId}' is not loaded`,
      PLUGIN_LOCALIZATION_ERROR_CODES.pluginUnavailable,
      pluginId
    )
  }
  if (typeof plugin.sdkapi !== 'number' || plugin.sdkapi < LOCALIZATION_FACADE_MIN_VERSION) {
    throw createLocalizationError(
      `Plugin localization SDK requires sdkapi >= ${LOCALIZATION_FACADE_MIN_VERSION}`,
      PLUGIN_LOCALIZATION_ERROR_CODES.sdkUnsupported,
      pluginId
    )
  }
  return pluginId
}

function resolveLocale(locale: unknown, resolveHostLocale: () => AppLocale): AppLocale {
  if (locale === undefined) return resolveHostLocale()
  if (!isAppLocale(locale)) {
    throw createLocalizationError(
      `Unsupported locale: ${String(locale)}`,
      PLUGIN_LOCALIZATION_ERROR_CODES.invalidRequest,
      'unknown'
    )
  }
  return locale
}

function resolveLocalizedTextValue(value: unknown, locale: AppLocale): string {
  if (typeof value !== 'string' && !isLocalizedText(value)) {
    throw createLocalizationError(
      'Localized text must be a string or LocalizedText value',
      PLUGIN_LOCALIZATION_ERROR_CODES.invalidRequest,
      'unknown'
    )
  }
  return resolveLocalizedText(value as LocalizedTextValue, locale)
}

function normalizeResolveOptions(
  options: PluginLexiconResolveOptions | undefined,
  resolveHostLocale: () => AppLocale
): PluginLexiconResolveOptions {
  return {
    locale: resolveLocale(options?.locale, resolveHostLocale),
    ...(options?.domain ? { domain: normalizeDomain(options.domain) } : {})
  }
}

function normalizeSearchOptions(
  options: DomainLexiconSearchOptions | undefined,
  resolveHostLocale: () => AppLocale
): DomainLexiconSearchOptions {
  return {
    locale: resolveLocale(options?.locale, resolveHostLocale),
    ...(options?.domain ? { domain: normalizeDomain(options.domain) } : {}),
    ...(options?.limit === undefined ? {} : { limit: options.limit })
  }
}

function normalizeDomain(value: unknown): DomainLexiconDomain {
  if (typeof value !== 'string' || !(DOMAIN_LEXICON_DOMAINS as readonly string[]).includes(value)) {
    throw createLocalizationError(
      `Unsupported lexicon domain: ${String(value)}`,
      PLUGIN_LOCALIZATION_ERROR_CODES.invalidRequest,
      'unknown'
    )
  }
  return value as DomainLexiconDomain
}

function normalizeRequiredText(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) {
    throw createLocalizationError(
      `Plugin ${label} is required`,
      PLUGIN_LOCALIZATION_ERROR_CODES.invalidRequest,
      'unknown'
    )
  }
  return text
}

function createLocalizationError(
  message: string,
  code: string,
  pluginId: string
): Error & { code: string; pluginId: string } {
  return Object.assign(new Error(message), { code, pluginId })
}
