/**
 * NativeSessionLeaseRegistry is the last line of defence against two Tuff writers appending to one
 * provider transcript at once — exactly the Pi 0.84.3 race where both writers exit zero but create
 * sibling branches. Its whole value is the key: the lease must be scoped to the exact
 * (provider, projectRoot, nativeSessionId) triple, so a different provider or a different project's
 * same-looking id never blocks, and a second holder is rejected immediately rather than queued.
 *
 * Release is the other half: it must be idempotent, and a stale release (spawn error plus process
 * close both firing) must not free a lease that a newer acquire now holds. Both are pure in-memory
 * properties, so there is no fixture here.
 */
import { describe, expect, it } from 'vitest'
import { NativeSessionLeaseRegistry } from './native-session-lease'

const BASE = { provider: 'pi', projectRoot: '/projects/one', nativeSessionId: 'native-1' } as const

describe('nativeSessionLeaseRegistry', () => {
  it('scopes the lease to the provider, root and native id together', () => {
    const registry = new NativeSessionLeaseRegistry()
    const variants = [
      {
        provider: 'oh-my-pi',
        projectRoot: BASE.projectRoot,
        nativeSessionId: BASE.nativeSessionId
      },
      {
        provider: BASE.provider,
        projectRoot: '/projects/two',
        nativeSessionId: BASE.nativeSessionId
      },
      { provider: BASE.provider, projectRoot: BASE.projectRoot, nativeSessionId: 'native-2' }
    ] as const

    for (const variant of variants) {
      const release = registry.acquire(BASE)
      // A different provider, root or native id is a different transcript, so it must stay free.
      const releaseVariant = registry.acquire(variant)
      expect(registry.isLeased(variant)).toBe(true)
      expect(registry.isLeased(BASE)).toBe(true)

      releaseVariant()
      expect(registry.isLeased(variant)).toBe(false)
      expect(registry.isLeased(BASE)).toBe(true)
      release()
    }
  })

  it('rejects a second holder of the same triple immediately and keeps the first lease', () => {
    const registry = new NativeSessionLeaseRegistry()
    const release = registry.acquire(BASE)

    expect(() => registry.acquire({ ...BASE })).toThrow('NATIVE_SESSION_BUSY')
    expect(registry.isLeased(BASE)).toBe(true)

    release()
    expect(registry.isLeased(BASE)).toBe(false)
    expect(() => registry.acquire(BASE)).not.toThrow()
  })

  it('releases idempotently without freeing a lease acquired after the first release', () => {
    const registry = new NativeSessionLeaseRegistry()
    const releaseFirst = registry.acquire(BASE)

    releaseFirst()
    releaseFirst()
    expect(registry.isLeased(BASE)).toBe(false)

    const releaseSecond = registry.acquire(BASE)
    // The stale, already-spent callback must not delete the new holder's lease.
    releaseFirst()
    expect(registry.isLeased(BASE)).toBe(true)
    expect(() => registry.acquire(BASE)).toThrow('NATIVE_SESSION_BUSY')

    releaseSecond()
    expect(registry.isLeased(BASE)).toBe(false)
  })

  it('drops every active lease on clear', () => {
    const registry = new NativeSessionLeaseRegistry()
    registry.acquire(BASE)
    registry.acquire({
      provider: 'claude',
      projectRoot: '/projects/two',
      nativeSessionId: 'native-9'
    })

    registry.clear()

    expect(registry.isLeased(BASE)).toBe(false)
    expect(
      registry.isLeased({
        provider: 'claude',
        projectRoot: '/projects/two',
        nativeSessionId: 'native-9'
      })
    ).toBe(false)
    expect(() => registry.acquire(BASE)).not.toThrow()
  })
})
