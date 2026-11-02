import { describe, expect, it } from 'vitest'
import { projectRunFailureDetail } from './run-failure-detail'

describe('projectRunFailureDetail', () => {
  it('keeps what a provider said and masks credentials and absolute paths', () => {
    const detail = projectRunFailureDetail(
      new Error(
        'Gemini rejected the call: api_key=AIzaSyD-secret-value-123456 at /Users/me/proj/src/x.ts:42'
      )
    )
    expect(detail).toContain('Gemini rejected the call')
    expect(detail).toContain('x.ts:42')
    expect(detail).not.toContain('AIzaSyD-secret-value-123456')
    expect(detail).not.toContain('/Users/me/proj')
  })

  it('prefers the provider detail down the cause chain over the wrapper message', () => {
    const cause = Object.assign(new Error('inner'), { providerDetail: 'invalid API key' })
    expect(projectRunFailureDetail(new Error('[PROVIDER_FAILED]', { cause }))).toBe(
      'invalid API key'
    )
  })

  it('gives nothing for an error that says nothing, so the fixed code stands alone', () => {
    expect(projectRunFailureDetail(new Error(''))).toBe('')
    expect(projectRunFailureDetail(undefined)).toBe('')
  })

  it('does not treat a URL or a ~ path as a filesystem path to shorten', () => {
    const detail = projectRunFailureDetail('GET https://api.example.com/v1/models failed in ~/x/y.ts')
    expect(detail).toContain('https://api.example.com/v1/models')
    expect(detail).toContain('~/x/y.ts')
  })
})
