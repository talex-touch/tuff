import { describe, expect, it } from 'vitest'
import { API_KEY_SCOPES, hasRequiredScope, isApiKeyScope } from '../apiKeyScopes'

describe('auth API key scopes', () => {
  it('exposes only granular release scopes for new API keys', () => {
    expect(API_KEY_SCOPES).toContain('release:write')
    expect(API_KEY_SCOPES).toContain('release:evidence')
    expect(API_KEY_SCOPES).not.toContain('release:sync')
  })

  it('rejects retired release scope during API key creation filtering', () => {
    const requestedScopes = ['plugin:publish', 'release:sync', 'release:evidence']
    const acceptedScopes = requestedScopes.filter(isApiKeyScope)

    expect(acceptedScopes).toEqual(['plugin:publish', 'release:evidence'])
  })

  it('does not let retired release scope satisfy granular release checks', () => {
    expect(hasRequiredScope(['release:sync'], 'release:write')).toBe(false)
    expect(hasRequiredScope(['release:sync'], 'release:evidence')).toBe(false)
    expect(hasRequiredScope(['release:evidence'], 'release:evidence')).toBe(true)
  })
})
