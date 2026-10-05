import type { IntelligenceErrorRecovery } from './ai-error-recovery'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { describe, expect, it, vi } from 'vitest'
import { USAGE_LIMITS_ROUTE } from './ai-error-recovery'
import { requestUsageLimitsPage, resolveDetachedRecoveryAction } from './usage-limits-door'

const usageLimit: IntelligenceErrorRecovery = {
  code: 'usage-limit',
  title: 'AI usage limit reached',
  detail: "You've reached the AI usage limit you set in Audit.",
  action: { path: USAGE_LIMITS_ROUTE, label: 'Open Audit' }
}

describe('the way out of a refused call, from a window that is not the main one', () => {
  it('offers Audit and nothing else', () => {
    expect(resolveDetachedRecoveryAction(usageLimit)).toEqual({
      path: '/setting/intelligence/audit',
      label: 'Open Audit'
    })
    // A path main would not open for this window stays text.
    expect(
      resolveDetachedRecoveryAction({
        ...usageLimit,
        action: { path: '/setting/intelligence/channels', label: 'Channels' }
      })
    ).toBeNull()
    expect(resolveDetachedRecoveryAction({ ...usageLimit, action: undefined })).toBeNull()
    expect(resolveDetachedRecoveryAction(null)).toBeNull()
  })

  it('asks main to reveal Audit and reports whether it will be shown', async () => {
    const send = vi.fn().mockResolvedValue(true)
    await expect(requestUsageLimitsPage({ send })).resolves.toBe(true)
    expect(send).toHaveBeenCalledExactlyOnceWith(AppEvents.window.openUsageLimits, undefined)

    send.mockResolvedValue(false)
    await expect(requestUsageLimitsPage({ send })).resolves.toBe(false)
    send.mockRejectedValue(new Error('transport closed'))
    await expect(requestUsageLimitsPage({ send })).resolves.toBe(false)
  })
})
