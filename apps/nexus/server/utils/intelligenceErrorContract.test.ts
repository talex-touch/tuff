import type { NexusIntelligenceTransportFailure } from './intelligenceErrorContract'
import { describe, expect, it } from 'vitest'
import {

  normalizeNexusIntelligenceTransportError,
  resolveNexusIntelligenceHttpStatus,
} from './intelligenceErrorContract'

const httpStatusCases: Array<{
  code: NexusIntelligenceTransportFailure['code']
  statusCode: number
}> = [
  { code: 'NEXUS_AUTH_REQUIRED', statusCode: 401 },
  { code: 'INVALID_REQUEST', statusCode: 400 },
  { code: 'PERMISSION_DENIED', statusCode: 403 },
  { code: 'QUOTA_EXHAUSTED', statusCode: 429 },
  { code: 'PROVIDER_UNAVAILABLE', statusCode: 503 },
  { code: 'MODEL_UNSUPPORTED', statusCode: 422 },
  { code: 'CAPABILITY_UNSUPPORTED', statusCode: 422 },
  { code: 'QUOTA_CHECK_UNAVAILABLE', statusCode: 503 },
  { code: 'NETWORK_FAILURE', statusCode: 502 },
  { code: 'UNKNOWN', statusCode: 500 },
]

const canonicalCases: Array<{
  code: NexusIntelligenceTransportFailure['code']
  reason: string
  recovery: string
}> = [
  {
    code: 'NEXUS_AUTH_REQUIRED',
    reason: 'Nexus provider requires a signed-in account.',
    recovery: 'Sign in to Nexus or switch to another enabled provider.',
  },
  {
    code: 'PROVIDER_UNAVAILABLE',
    reason: 'No usable provider is available for this capability.',
    recovery: 'Enable a provider, verify provider configuration, or choose another capability.',
  },
  {
    code: 'QUOTA_EXHAUSTED',
    reason: 'The caller has exhausted its request, token, or cost quota.',
    recovery: 'Wait for quota reset, lower token usage, or adjust quota settings.',
  },
  {
    code: 'QUOTA_CHECK_UNAVAILABLE',
    reason: 'Quota verification is unavailable, so the request was blocked.',
    recovery: 'Retry after quota storage recovers or inspect Intelligence quota configuration.',
  },
  {
    code: 'MODEL_UNSUPPORTED',
    reason: 'The selected model does not support this request.',
    recovery: 'Switch to a model that supports the requested capability.',
  },
  {
    code: 'PERMISSION_DENIED',
    reason: 'The caller is not allowed to use this intelligence capability or provider.',
    recovery: 'Grant the required permission or choose an allowed provider/capability.',
  },
  {
    code: 'NETWORK_FAILURE',
    reason: 'The provider request failed before a valid model response was returned.',
    recovery: 'Check network/proxy settings and retry the request.',
  },
  {
    code: 'CAPABILITY_UNSUPPORTED',
    reason: 'The selected provider does not support the requested capability.',
    recovery: 'Select a provider/model that advertises this capability.',
  },
  {
    code: 'INVALID_REQUEST',
    reason: 'The request payload is invalid for this capability.',
    recovery: 'Check the request input and try again.',
  },
  {
    code: 'UNKNOWN',
    reason: 'The intelligence request failed with an unclassified error.',
    recovery: 'Retry the request or inspect the trace/audit entry.',
  },
]

describe('normalizeNexusIntelligenceTransportError', () => {
  describe('resolveNexusIntelligenceHttpStatus', () => {
    it.each([
      { name: '4xx status', error: { status: 422 }, code: 'INVALID_REQUEST' as const, statusCode: 422 },
      { name: '5xx status', error: { statusCode: 599 }, code: 'UNKNOWN' as const, statusCode: 599 },
    ])('preserves an explicit valid $name', ({ error, code, statusCode }) => {
      expect(resolveNexusIntelligenceHttpStatus(error, code)).toBe(statusCode)
    })

    it.each(httpStatusCases)(
      'maps statusless $code failures to HTTP $statusCode',
      ({ code, statusCode }) => {
        expect(resolveNexusIntelligenceHttpStatus({}, code)).toBe(statusCode)
      },
    )
  })
  it.each(canonicalCases)(
    'preserves explicit canonical $code with its stable recovery contract',
    ({ code, reason, recovery }) => {
      const message = `Safe provider detail for ${code}`

      expect(normalizeNexusIntelligenceTransportError({ code, message })).toEqual({
        code,
        message,
        reason,
        recovery,
      })
    },
  )

  it.each([
    {
      name: 'H3 credits exhaustion nested in data.code',
      error: Object.assign(new Error('User credits exceeded.'), {
        statusCode: 402,
        statusMessage: 'CREDITS_EXCEEDED',
        data: { code: 'CREDITS_EXCEEDED', reason: 'User credits exceeded.' },
      }),
      code: 'QUOTA_EXHAUSTED',
      message: 'User credits exceeded.',
    },
    {
      name: 'H3 provider request quota nested in data.code',
      error: {
        message: 'Provider request quota exceeded.',
        data: { code: 'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED' },
      },
      code: 'QUOTA_EXHAUSTED',
      message: 'Provider request quota exceeded.',
    },
    {
      name: 'H3 provider token quota nested in data.code',
      error: {
        message: 'Provider token quota exceeded.',
        data: { code: 'INTELLIGENCE_PROVIDER_TOKEN_QUOTA_EXCEEDED' },
      },
      code: 'QUOTA_EXHAUSTED',
      message: 'Provider token quota exceeded.',
    },
  ])('normalizes $name while preserving the safe message', ({ error, code, message }) => {
    expect(normalizeNexusIntelligenceTransportError(error)).toMatchObject({ code, message })
  })

  it('prioritizes quota-check unavailability over a generic HTTP quota status', () => {
    expect(normalizeNexusIntelligenceTransportError({
      statusCode: 429,
      message: 'Quota verification is unavailable after a rate limit response.',
    })).toMatchObject({
      code: 'QUOTA_CHECK_UNAVAILABLE',
      reason: 'Quota verification is unavailable, so the request was blocked.',
      recovery: 'Retry after quota storage recovers or inspect Intelligence quota configuration.',
    })
  })

  it.each([
    { name: 'authentication status', error: { statusCode: 401 }, code: 'NEXUS_AUTH_REQUIRED' },
    { name: 'authentication message', error: new Error('Sign in is required.'), code: 'NEXUS_AUTH_REQUIRED' },
    { name: 'provider message', error: new Error('No enabled intelligence providers.'), code: 'PROVIDER_UNAVAILABLE' },
    { name: 'capability message', error: new Error('Unsupported capability: vision.ocr'), code: 'CAPABILITY_UNSUPPORTED' },
    { name: 'model message', error: new Error('Model does not support vision input.'), code: 'MODEL_UNSUPPORTED' },
    { name: 'permission status', error: { status: 403 }, code: 'PERMISSION_DENIED' },
    { name: 'permission message', error: new Error('Permission denied for this provider.'), code: 'PERMISSION_DENIED' },
    { name: 'network message', error: new Error('fetch failed: socket reset'), code: 'NETWORK_FAILURE' },
    { name: 'invalid request status', error: { statusCode: 400 }, code: 'INVALID_REQUEST' },
    { name: 'invalid request message', error: new Error('Invalid request payload.'), code: 'INVALID_REQUEST' },
  ])('maps $name to $code', ({ error, code }) => {
    expect(normalizeNexusIntelligenceTransportError(error)).toMatchObject({ code })
  })

  it('returns UNKNOWN with the original safe message when no canonical signal is present', () => {
    expect(normalizeNexusIntelligenceTransportError(new Error('Unexpected provider response shape.'))).toEqual({
      code: 'UNKNOWN',
      message: 'Unexpected provider response shape.',
      reason: 'The intelligence request failed with an unclassified error.',
      recovery: 'Retry the request or inspect the trace/audit entry.',
    })
  })
})
