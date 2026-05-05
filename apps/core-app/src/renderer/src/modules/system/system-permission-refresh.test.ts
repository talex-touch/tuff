import { describe, expect, it, vi } from 'vitest'
import { waitForPermissionGrant } from './system-permission-refresh'

describe('system-permission-refresh', () => {
  it('returns immediately when permission is already granted', async () => {
    const check = vi.fn().mockResolvedValue({
      status: 'granted',
      canRequest: true
    })

    const result = await waitForPermissionGrant(check, { intervalMs: 0 })

    expect(result.status).toBe('granted')
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('rechecks until permission becomes granted', async () => {
    const check = vi
      .fn()
      .mockResolvedValueOnce({ status: 'denied', canRequest: true })
      .mockResolvedValueOnce({ status: 'denied', canRequest: true })
      .mockResolvedValueOnce({ status: 'granted', canRequest: true })

    const result = await waitForPermissionGrant(check, { attempts: 5, intervalMs: 0 })

    expect(result.status).toBe('granted')
    expect(check).toHaveBeenCalledTimes(3)
  })

  it('stops polling when the request is no longer current', async () => {
    const check = vi.fn().mockResolvedValue({
      status: 'denied',
      canRequest: true
    })

    const result = await waitForPermissionGrant(check, {
      attempts: 5,
      intervalMs: 0,
      shouldContinue: () => false
    })

    expect(result.status).toBe('denied')
    expect(check).toHaveBeenCalledTimes(1)
  })
})
