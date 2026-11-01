import type { AppLocale } from '@talex-touch/utils/i18n'
import { isAppLocale } from '@talex-touch/utils/i18n'
import { LOCALIZATION_FACADE_MIN_VERSION } from '@talex-touch/utils/plugin'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { types as utilTypes } from 'node:util'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'

/** The slice of the app language the capabilities are allowed to touch. */
export interface PluginLanguageHostService {
  getLanguage(): AppLocale
  /** Returns the function that stops listening. */
  onLanguageChange(listener: (language: AppLocale) => void): () => void
}

export interface PluginLanguageCapabilityOptions {
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  resolveSdkApi(pluginName: string): number | undefined
  readonly service: PluginLanguageHostService
}

export interface PluginLanguageCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
}

type LanguageListener = (language: AppLocale) => unknown

function invalid(): never {
  throw new Error('PLUGIN_LANGUAGE_CAPABILITY_INVALID')
}

function validateNull(value: unknown): null {
  if (value !== null) invalid()
  return null
}

function validateLanguage(value: unknown): AppLocale {
  if (!isAppLocale(value)) invalid()
  return value
}

/** Exactly `{ onChange }`: the one callback field the capability declares, nothing alongside it. */
function validateSubscribe(value: unknown): { readonly onChange: LanguageListener } {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalid()
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) invalid()
  const descriptor = Object.getOwnPropertyDescriptor(value, 'onChange')
  if (
    Reflect.ownKeys(value).length !== 1 ||
    !descriptor?.enumerable ||
    !('value' in descriptor) ||
    typeof descriptor.value !== 'function'
  ) {
    invalid()
  }
  return Object.freeze({ onChange: descriptor.value as LanguageListener })
}

function freezeDefinition<Request, Result>(
  definition: PluginHostCapabilityDefinition<Request, Result>
): PluginHostCapabilityDefinition<Request, Result> {
  return Object.freeze({
    ...definition,
    callbackLifetime: definition.callbackLifetime ?? 'transient',
    callbackFields: Object.freeze([...(definition.callbackFields ?? [])])
  })
}

/**
 * Host end of `language.get` / `language.subscribe`, behind `plugin.language` in the isolated
 * Prelude. `plugin.getLocale()` stays the activation snapshot; this is the live read.
 *
 * Gated like `PluginEvents.i18n.*`: the registry checks the plugin's own `i18n.read` grant before
 * the call and ties a subscription to it, and the call itself requires the current activation and
 * `sdkapi >= LOCALIZATION_FACADE_MIN_VERSION`. A subscription calls `onChange` with the current
 * language once and then after each change, never twice in a row with the same value.
 */
export function createPluginLanguageCapabilities(
  options: PluginLanguageCapabilityOptions
): PluginLanguageCapabilities {
  const { resolveCurrentActivation, resolveHostGeneration, resolveSdkApi, service } = options

  const assertSupported = (context: PluginSecurityContext): void => {
    if (!isAuthoritativePluginContext(context)) invalid()
    const identity = context.identity
    if (identity.authority !== 'plugin-host' || context.name !== identity.pluginName) invalid()
    const current = resolveCurrentActivation(identity.pluginName)
    if (
      !current ||
      current.name !== identity.pluginName ||
      current.pluginInstanceId !== identity.pluginInstanceId ||
      current.activationGeneration !== identity.activationGeneration ||
      current.key !== context.uniqueKey ||
      resolveHostGeneration(current) !== identity.hostGeneration
    ) {
      invalid()
    }
    const sdkapi = resolveSdkApi(identity.pluginName)
    if (typeof sdkapi !== 'number' || sdkapi < LOCALIZATION_FACADE_MIN_VERSION) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    }
  }

  const definitions: PluginHostCapabilityDefinition[] = [
    freezeDefinition({
      id: 'language.get',
      permission: 'i18n.read',
      timeoutMs: 5_000,
      maxConcurrency: 8,
      validateRequest: validateNull,
      validateResult: validateLanguage,
      invoke(context) {
        assertSupported(context)
        return service.getLanguage()
      }
    }),
    freezeDefinition({
      id: 'language.subscribe',
      permission: 'i18n.read',
      timeoutMs: 10_000,
      maxConcurrency: 4,
      callbackLifetime: 'resource',
      callbackFields: ['onChange'],
      validateRequest: validateSubscribe,
      validateResult: (value) => value,
      invoke(context, request, signal, resources) {
        assertSupported(context)
        if (signal.aborted) invalid()
        let closed = false
        let last: AppLocale | undefined
        const deliver = (): void => {
          if (closed) return
          const language = service.getLanguage()
          if (language === last) return
          last = language
          // A callback that fails disposes this resource through the runtime host.
          void Promise.resolve()
            .then(() => request.onChange(language))
            .catch(() => undefined)
        }
        const unsubscribe = service.onLanguageChange(deliver)
        const dispose = (): void => {
          closed = true
          unsubscribe()
        }
        try {
          const handle = resources.register('subscription', dispose)
          // The first language goes out after the handle does, as the voice stream does, so the
          // callback cannot overtake the response to this very call.
          setImmediate(deliver)
          return handle
        } catch (error) {
          dispose()
          throw error
        }
      }
    })
  ]

  return Object.freeze({ definitions: Object.freeze(definitions) })
}
