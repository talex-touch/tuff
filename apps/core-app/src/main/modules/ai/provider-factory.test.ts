import { describe, expect, it, vi } from 'vitest'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { createCustomProvider } from './provider-factory'
import { CustomProvider } from './providers/custom-provider'
import { NexusProvider } from './providers/nexus-provider'

vi.mock('./providers/custom-provider', () => ({
  CustomProvider: class CustomProvider {
    constructor(readonly config: unknown) {}
  }
}))

vi.mock('./providers/nexus-provider', () => ({
  isNexusProviderConfig: (config: { id?: string; metadata?: Record<string, unknown> }) =>
    config.id === 'tuff-nexus-default' || config.metadata?.origin === 'tuff-nexus',
  NexusProvider: class NexusProvider {
    constructor(readonly config: unknown) {}
  }
}))

describe('provider factory', () => {
  it('creates a Nexus adapter for the built-in Nexus provider id', () => {
    const provider = createCustomProvider({
      id: 'tuff-nexus-default',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Tuff Nexus',
      enabled: true,
      priority: 1,
      metadata: { origin: 'tuff-nexus' }
    })

    expect(provider).toBeInstanceOf(NexusProvider)
  })

  it('creates a Nexus adapter for Nexus-managed provider mirrors', () => {
    const provider = createCustomProvider({
      id: 'custom-nexus',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Nexus Mirror',
      enabled: true,
      priority: 1,
      metadata: { origin: 'tuff-nexus' }
    })

    expect(provider).toBeInstanceOf(NexusProvider)
  })

  it('creates an OpenAI-compatible adapter for ordinary custom providers', () => {
    const provider = createCustomProvider({
      id: 'custom-openai',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Custom OpenAI',
      enabled: true,
      priority: 1,
      apiKey: 'sk-user'
    })

    expect(provider).toBeInstanceOf(CustomProvider)
  })
})
