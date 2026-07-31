import { describe, expect, it } from 'vitest'
import {
  RUNTIME_CREDENTIAL_ERROR_CODE,
  assertRuntimeCredential,
  isLocalDevelopmentRuntime,
  selectRuntimeCredential,
} from './runtimeCredentialPolicy'

describe('runtimeCredentialPolicy', () => {
  const name = 'AUTH_SECRET'

  it.each([
    undefined,
    '',
    'short',
    'change-me-auth-secret',
    'your_auth_secret',
    'replace-with-local-secret',
    'tuff-local-pages-preview-secret',
    'tuff-local-app-auth-jwt-secret',
    'tuff-local-intelligence-encrypt-key',
    'tuff-intelligence-default-key-change-me',
    'tuff-dev-secret',
  ])('rejects unsafe non-local credential value %#', value => {
    expect(() => assertRuntimeCredential(name, value, { localDevelopment: false })).toThrowError(
      expect.objectContaining({
        code: RUNTIME_CREDENTIAL_ERROR_CODE,
        variableName: name,
      }),
    )
  })

  it('treats Cloudflare bindings without the local marker as non-local', () => {
    expect(isLocalDevelopmentRuntime(undefined, {})).toBe(false)
    expect(isLocalDevelopmentRuntime('true', {})).toBe(true)
  })

  it('does not fall back to build-time configuration when Cloudflare bindings exist', () => {
    expect(selectRuntimeCredential({}, undefined, ['fallback-secret-123456'])).toBeUndefined()
  })

  it('uses the first explicitly configured fallback outside Cloudflare', () => {
    expect(selectRuntimeCredential(undefined, undefined, [undefined, '', 'later-secret'])).toBe('')
  })

  it('accepts a strong non-local credential without exposing it', () => {
    const value = 'synthetic-strong-credential-938475'
    expect(assertRuntimeCredential(name, value, { localDevelopment: false })).toBe(value)
  })

  it.each([
    'change-me-auth-secret',
    'tuff-local-pages-preview-secret',
    'tuff-local-app-auth-jwt-secret',
    'tuff-local-intelligence-encrypt-key',
    'tuff-dev-secret',
  ])('accepts explicit local-only defaults in development: %s', value => {
    expect(assertRuntimeCredential(name, value, { localDevelopment: true })).toBe(value)
  })
})
