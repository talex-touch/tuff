import { describe, expect, it, vi } from 'vitest'
import { openValidatedExternalUrl, validateExternalUrl } from './external-url-policy'

describe('validateExternalUrl', () => {
  it('allows normalized public web URLs', () => {
    expect(validateExternalUrl(' https://example.com/path?q=1 ')).toEqual({
      allowed: true,
      url: 'https://example.com/path?q=1',
      protocol: 'https:'
    })
  })

  it('allows mail and app deep-link protocols', () => {
    expect(validateExternalUrl('mailto:support@example.com')).toMatchObject({
      allowed: true,
      protocol: 'mailto:'
    })
    expect(validateExternalUrl('tuff://detached')).toMatchObject({
      allowed: true,
      protocol: 'tuff:'
    })
  })

  it('blocks executable or script-like protocols', () => {
    expect(validateExternalUrl('javascript:alert(1)')).toEqual({
      allowed: false,
      reason: 'blocked-protocol',
      protocol: 'javascript:'
    })
    expect(validateExternalUrl('file:///etc/passwd')).toEqual({
      allowed: false,
      reason: 'blocked-protocol',
      protocol: 'file:'
    })
    expect(validateExternalUrl('data:text/html,<script>alert(1)</script>')).toEqual({
      allowed: false,
      reason: 'blocked-protocol',
      protocol: 'data:'
    })
  })

  it('rejects empty and relative URLs', () => {
    expect(validateExternalUrl('')).toEqual({ allowed: false, reason: 'empty-url' })
    expect(validateExternalUrl('/settings')).toEqual({ allowed: false, reason: 'invalid-url' })
  })

  it('opens only validated external URLs through the provided opener', async () => {
    const opener = vi.fn(async () => undefined)

    await expect(openValidatedExternalUrl('https://example.com/docs', { opener })).resolves.toEqual(
      {
        allowed: true,
        url: 'https://example.com/docs',
        protocol: 'https:'
      }
    )
    expect(opener).toHaveBeenCalledWith('https://example.com/docs')
  })

  it('does not call the opener for blocked URLs', async () => {
    const opener = vi.fn(async () => undefined)

    await expect(openValidatedExternalUrl('javascript:alert(1)', { opener })).resolves.toEqual({
      allowed: false,
      reason: 'blocked-protocol',
      protocol: 'javascript:'
    })
    expect(opener).not.toHaveBeenCalled()
  })
})
