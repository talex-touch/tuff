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

/**
 * The value that shipped in a tracked apps/nexus/.env (#890).
 *
 * `dev-secret-change-me` was public in the repository, 20 characters long, and matched none of
 * the guard's rules: the placeholder patterns were anchored at the start, so `^change[-_ ]?me`
 * never saw a value ending in it. Any deployment that picked that file up signed app JWTs with
 * a key anyone could read, and a token minted against it authenticates as any user id.
 */
describe('the committed development secret', () => {
  const name = 'AUTH_SECRET'

  it('is refused outside local development', () => {
    expect(() => assertRuntimeCredential(name, 'dev-secret-change-me', { localDevelopment: false }))
      .toThrowError(expect.objectContaining({ code: RUNTIME_CREDENTIAL_ERROR_CODE }))
  })

  it('is still accepted in local development, so dev keeps working', () => {
    // Positive control: refusing it everywhere would break `nuxt dev` for anyone whose .env
    // still carries it, which is a different failure rather than a safer one.
    expect(assertRuntimeCredential(name, 'dev-secret-change-me', { localDevelopment: true }))
      .toBe('dev-secret-change-me')
  })

  it.each([
    'dev-secret-change-me',
    'api-key-change-me',
    'something_changeme',
    'prod-secret-change-me',
  ])('refuses %s, where the marker is a suffix rather than a prefix', value => {
    expect(() => assertRuntimeCredential(name, value, { localDevelopment: false }))
      .toThrowError(expect.objectContaining({ code: RUNTIME_CREDENTIAL_ERROR_CODE }))
  })

  it.each([
    'a-perfectly-fine-production-secret',
    'exchange-memory-service-key-01',
  ])('still accepts %s', value => {
    // The suffix pattern must not swallow real secrets. `exchange-memory` contains the letters
    // of "change me" and has to survive.
    expect(assertRuntimeCredential(name, value, { localDevelopment: false })).toBe(value)
  })
})
