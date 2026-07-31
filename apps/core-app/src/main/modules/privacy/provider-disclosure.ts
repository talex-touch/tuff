import type {
  PrivacyProviderDataCategory,
  PrivacyProviderDisclosure,
  PrivacyProviderPurpose,
  PrivacyRetentionCategory
} from '@talex-touch/utils/transport/events/types'
import { isProxy } from 'node:util/types'

export interface PrivacyProviderDisclosureSource {
  getConfig: () => unknown | Promise<unknown>
}

export interface PrivacyProviderDisclosureService {
  getProviders: () => Promise<readonly PrivacyProviderDisclosure[]>
}

const PROVIDER_ID = /^[A-Z0-9][\w.:-]{0,127}$/i
const CAPABILITY_ID = /^[A-Z0-9][\w.:-]{0,127}$/i
const MAX_PROVIDERS = 128
const MAX_CAPABILITIES = 64

function ownValues(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || isProxy(value))
    return null
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Reflect.ownKeys(descriptors).length > 512) return null
    const result: Record<string, unknown> = Object.create(null)
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = typeof key === 'string' ? descriptors[key] : undefined
      if (typeof key !== 'string' || !descriptor || !Object.hasOwn(descriptor, 'value')) return null
      result[key] = descriptor.value
    }
    return result
  } catch {
    return null
  }
}

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  if (!Array.isArray(value) || isProxy(value) || value.length > maximum) return null
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const allowedKeys = new Set<PropertyKey>(['length'])
    const result: unknown[] = []
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index)
      allowedKeys.add(key)
      const descriptor = descriptors[key]
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null
      result.push(descriptor.value)
    }
    if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))) return null
    return result
  } catch {
    return null
  }
}

function addCapability(target: Set<string>, value: unknown): void {
  if (target.size < MAX_CAPABILITIES && typeof value === 'string' && CAPABILITY_ID.test(value)) {
    target.add(value)
  }
}

function capabilitiesForProvider(
  provider: Record<string, unknown>,
  capabilityConfig: unknown
): readonly string[] {
  const capabilities = new Set<string>()
  const declared = exactArray(provider.capabilities, MAX_CAPABILITIES)
  for (const capability of declared ?? []) addCapability(capabilities, capability)

  const routing = ownValues(capabilityConfig)
  if (routing) {
    for (const [capabilityId, rawRoute] of Object.entries(routing).slice(0, 256)) {
      if (!CAPABILITY_ID.test(capabilityId)) continue
      const route = ownValues(rawRoute)
      const bindings = exactArray(route?.providers, MAX_PROVIDERS)
      for (const rawBinding of bindings ?? []) {
        const binding = ownValues(rawBinding)
        if (binding && binding.providerId === provider.id && binding.enabled !== false) {
          addCapability(capabilities, capabilityId)
          break
        }
      }
    }
  }
  return Object.freeze([...capabilities].sort())
}

function isNexusProvider(provider: Record<string, unknown>): boolean {
  const metadata = ownValues(provider.metadata)
  return provider.id === 'tuff-nexus-default' && metadata?.origin === 'tuff-nexus'
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    normalized.startsWith('127.')
  )
}

function hasLoopbackEndpoint(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false
  try {
    const endpoint = new URL(value)
    return (
      (endpoint.protocol === 'http:' || endpoint.protocol === 'https:') &&
      isLoopbackHost(endpoint.hostname)
    )
  } catch {
    return false
  }
}

function destinationFor(
  provider: Record<string, unknown>
): PrivacyProviderDisclosure['destinationClass'] {
  if (isNexusProvider(provider)) return 'nexus-managed'
  if (hasLoopbackEndpoint(provider.baseUrl)) return 'local'
  if (provider.type === 'local' && provider.baseUrl === undefined) return 'local'
  return 'remote'
}

function purposesFor(capabilities: readonly string[]): readonly PrivacyProviderPurpose[] {
  const purposes = new Set<PrivacyProviderPurpose>()
  for (const capability of capabilities) {
    if (/(?:^|\.)translat(?:e|ion)(?:\.|$)/.test(capability)) {
      purposes.add('translation')
    } else if (capability.startsWith('text.') || capability.startsWith('code.')) {
      purposes.add('text-processing')
    } else if (capability.startsWith('vision.') || capability.startsWith('image.')) {
      purposes.add('vision-and-ocr')
    } else if (capability.startsWith('audio.') || capability.startsWith('voice.')) {
      purposes.add('speech-processing')
    } else if (/^(?:rag|search|embedding|context)\./.test(capability)) {
      purposes.add('retrieval-and-context')
    } else if (capability.startsWith('clipboard.')) {
      purposes.add('clipboard-processing')
    } else {
      purposes.add('other-configured-capability')
    }
  }
  if (purposes.size === 0) purposes.add('other-configured-capability')
  return Object.freeze([...purposes].sort())
}

function dataCategoriesFor(
  destinationClass: PrivacyProviderDisclosure['destinationClass'],
  capabilities: readonly string[]
): readonly PrivacyProviderDataCategory[] {
  const categories = new Set<PrivacyProviderDataCategory>()
  if (
    capabilities.some(
      (capability) => capability.startsWith('text.') || capability.startsWith('code.')
    )
  ) {
    categories.add('text')
  }
  if (
    capabilities.some(
      (capability) => capability.startsWith('vision.') || capability.startsWith('image.')
    )
  ) {
    categories.add('image-ocr')
  }
  if (
    capabilities.some(
      (capability) => capability.startsWith('audio.') || capability.startsWith('voice.')
    )
  ) {
    categories.add('audio')
  }
  if (capabilities.some((capability) => capability.startsWith('clipboard.')))
    categories.add('clipboard')
  if (capabilities.some((capability) => /^(?:rag|search|embedding|context)\./.test(capability)))
    categories.add('file-context')
  if (destinationClass !== 'local') categories.add('usage-metadata')
  return Object.freeze([...categories].sort())
}

function localRetentionCategories(
  capabilities: readonly string[]
): readonly PrivacyRetentionCategory[] {
  const categories = new Set<PrivacyRetentionCategory>(['intelligence-audit'])
  if (
    capabilities.some(
      (capability) => capability.startsWith('vision.') || capability.startsWith('image.')
    )
  ) {
    categories.add('ocr-screenshot-temp')
  }
  if (capabilities.some((capability) => /^(?:text|code|rag|search|context)\./.test(capability)))
    categories.add('intelligence-context')
  return Object.freeze([...categories].sort())
}

function projectProvider(
  value: unknown,
  capabilityConfig: unknown
): PrivacyProviderDisclosure | null {
  const provider = ownValues(value)
  if (!provider) return null
  if (typeof provider.id !== 'string' || !PROVIDER_ID.test(provider.id)) return null
  if (typeof provider.type !== 'string' || provider.type.length === 0 || provider.type.length > 64)
    return null
  const capabilities = capabilitiesForProvider(provider, capabilityConfig)
  const destinationClass = destinationFor(provider)
  const custom = provider.type === 'custom' && destinationClass !== 'nexus-managed'
  const displayName =
    destinationClass === 'local'
      ? 'Local provider'
      : destinationClass === 'nexus-managed'
        ? 'Tuff Nexus'
        : custom
          ? 'Custom remote endpoint'
          : 'Remote provider'
  return Object.freeze({
    providerId: provider.id,
    displayName,
    destinationClass,
    dataCategories: dataCategoriesFor(destinationClass, capabilities),
    purposes: purposesFor(capabilities),
    capabilities,
    localRetentionCategories: localRetentionCategories(capabilities)
  })
}

export function createPrivacyProviderDisclosureService(
  source: PrivacyProviderDisclosureSource
): PrivacyProviderDisclosureService {
  if (typeof source !== 'object' || source === null || isProxy(source))
    throw new Error('PRIVACY_DISCLOSURE_SOURCE_INVALID')
  const prototype = Object.getPrototypeOf(source)
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error('PRIVACY_DISCLOSURE_SOURCE_INVALID')
  const descriptors = Object.getOwnPropertyDescriptors(source)
  const keys = Reflect.ownKeys(descriptors)
  const descriptor = descriptors.getConfig
  if (
    keys.length !== 1 ||
    !descriptor ||
    !Object.hasOwn(descriptor, 'value') ||
    typeof descriptor.value !== 'function' ||
    isProxy(descriptor.value)
  ) {
    throw new Error('PRIVACY_DISCLOSURE_SOURCE_INVALID')
  }
  const getConfig = descriptor.value.bind(source) as PrivacyProviderDisclosureSource['getConfig']

  return Object.freeze({
    getProviders: async () => {
      const config = ownValues(await getConfig())
      const rawProviders = exactArray(config?.providers, MAX_PROVIDERS)
      if (!config || !rawProviders) return Object.freeze([])
      const providers: PrivacyProviderDisclosure[] = []
      const seen = new Set<string>()
      for (const candidate of rawProviders) {
        const provider = projectProvider(candidate, config.capabilities)
        if (!provider || seen.has(provider.providerId)) continue
        seen.add(provider.providerId)
        providers.push(provider)
      }
      return Object.freeze(
        providers.sort((left, right) => left.providerId.localeCompare(right.providerId))
      )
    }
  })
}
