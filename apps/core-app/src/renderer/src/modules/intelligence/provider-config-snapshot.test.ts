import {
  IntelligenceProviderType,
  type IntelligenceProviderConfig
} from '@talex-touch/tuff-intelligence'
import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { snapshotIntelligenceProviderConfig } from './provider-config-snapshot'

describe('snapshotIntelligenceProviderConfig', () => {
  it('detaches nested Vue state for strict transport DTOs', () => {
    const provider = reactive<IntelligenceProviderConfig>({
      id: 'provider-test',
      type: IntelligenceProviderType.CUSTOM,
      name: 'Provider Test',
      enabled: true,
      models: ['model-a'],
      capabilities: ['text.chat'],
      metadata: { nested: { enabled: true } },
      rateLimit: { requestsPerMinute: 10 }
    })

    const snapshot = snapshotIntelligenceProviderConfig(provider)

    expect(() => structuredClone(provider)).toThrow()
    expect(() => structuredClone(snapshot)).not.toThrow()
    expect(snapshot).toEqual(provider)
    expect(snapshot.models).not.toBe(provider.models)
    expect(snapshot.metadata).not.toBe(provider.metadata)
  })
})
