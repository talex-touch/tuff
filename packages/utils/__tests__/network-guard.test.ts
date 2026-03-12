import { describe, expect, it } from 'vitest'
import { NetworkCooldownError, createNetworkGuard } from '../network'

describe('network guard', () => {
  it('enters cooldown after configured failures', () => {
    const guard = createNetworkGuard({ failureThreshold: 2, cooldownMs: 1000 })

    guard.recordFailure('svg:url', { failureThreshold: 2, cooldownMs: 1000 })
    expect(guard.canRequest('svg:url').allowed).toBe(true)

    guard.recordFailure('svg:url', { failureThreshold: 2, cooldownMs: 1000 })
    const decision = guard.canRequest('svg:url')
    expect(decision.allowed).toBe(false)
    expect((decision.retryAfterMs ?? 0) > 0).toBe(true)
  })

  it('restores request permission after success', () => {
    const guard = createNetworkGuard({ failureThreshold: 1, cooldownMs: 1000 })

    guard.recordFailure('svg:url')
    expect(guard.canRequest('svg:url').allowed).toBe(false)

    guard.recordSuccess('svg:url')
    expect(guard.canRequest('svg:url').allowed).toBe(true)
  })

  it('throws cooldown error when guarded run is blocked', async () => {
    const guard = createNetworkGuard({ failureThreshold: 1, cooldownMs: 1000 })

    guard.recordFailure('svg:url')

    await expect(
      guard.run('svg:url', async () => {
        return 'ok'
      })
    ).rejects.toBeInstanceOf(NetworkCooldownError)
  })
})
