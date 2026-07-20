import { describe, expect, it } from 'vitest'
import { API_KEY_SCOPES, DEFAULT_PLUGIN_API_KEY_SCOPES, hasRequiredScope, isAdminOnlyApiKeyScope, isApiKeyScope } from '../apiKeyScopes'

describe('auth API key scopes', () => {
  it('exposes granular plugin moderation, release and maintenance scopes for new API keys', () => {
    expect(API_KEY_SCOPES).toContain('plugin:moderate')
    expect(API_KEY_SCOPES).toContain('release:write')
    expect(API_KEY_SCOPES).toContain('release:evidence')
    expect(API_KEY_SCOPES).toContain('maintenance:write')
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

  it('marks plugin moderation, release and maintenance scopes as admin-only', () => {
    expect(isAdminOnlyApiKeyScope('plugin:moderate')).toBe(true)
    expect(isAdminOnlyApiKeyScope('release:write')).toBe(true)
    expect(isAdminOnlyApiKeyScope('maintenance:write')).toBe(true)
    expect(isAdminOnlyApiKeyScope('plugin:publish')).toBe(false)
  })

  it('defaults plugin API keys to read and publish scopes', () => {
    expect(DEFAULT_PLUGIN_API_KEY_SCOPES).toEqual(['plugin:read', 'plugin:publish'])
  })

  it('lets plugin publish scope satisfy plugin read checks for legacy keys', () => {
    expect(hasRequiredScope(['plugin:publish'], 'plugin:read')).toBe(true)
    expect(hasRequiredScope(['plugin:publish'], 'plugin:publish')).toBe(true)
    expect(hasRequiredScope(['plugin:read'], 'plugin:publish')).toBe(false)
  })
})
