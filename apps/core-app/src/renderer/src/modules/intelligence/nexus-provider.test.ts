import { describe, expect, it } from 'vitest'
import { isNexusManagedProvider, TUFF_NEXUS_PROVIDER_ID } from './nexus-provider'

describe('renderer Nexus provider helpers', () => {
  it('recognizes the built-in Nexus provider id', () => {
    expect(isNexusManagedProvider({ id: TUFF_NEXUS_PROVIDER_ID })).toBe(true)
  })

  it('recognizes Nexus provider mirrors by metadata origin', () => {
    expect(isNexusManagedProvider({
      id: 'custom-nexus',
      metadata: { origin: 'tuff-nexus' },
    })).toBe(true)
  })

  it('does not treat ordinary custom providers as Nexus-managed', () => {
    expect(isNexusManagedProvider({
      id: 'custom-openai',
      metadata: { origin: 'user' },
    })).toBe(false)
  })
})
