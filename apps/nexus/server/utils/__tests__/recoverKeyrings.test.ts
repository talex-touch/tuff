import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recoverKeyrings } from '../syncStoreV1'

/**
 * What a recovery code releases (#904).
 *
 * recoverKeyrings verified the submitted code against each device's stored hash, and on the
 * first match returned `rows.map(...)` — every keyring row for the user, not the matching
 * device's. One recovery code written down, screenshotted or leaked from an old machine
 * therefore handed back the encrypted key material of the whole fleet, including devices with
 * a different recovery code or none at all.
 */

// vi.hoisted, because the vi.mock factory below is hoisted above ordinary top-level
// declarations and would otherwise read this before initialisation.
const { verifyPassword } = vi.hoisted(() => ({ verifyPassword: vi.fn() }))

vi.mock('../authCrypto', async () => {
  const actual = await vi.importActual<typeof import('../authCrypto')>('../authCrypto')
  return { ...actual, verifyPassword }
})

interface KeyringRow {
  device_id: string
  key_type: string
  encrypted_key: string
  rotated_at: string | null
  created_at: string
  recovery_code_hash: string | null
}

/**
 * The narrowest database this function needs: schema setup runs and is ignored, and the one
 * SELECT returns the rows under test. Deliberately not the full MockD1Database from
 * syncStoreV1.test.ts — that fake models sync tables, not keyrings.
 */
function createEvent(rows: KeyringRow[]): H3Event {
  const db = {
    prepare(sql: string) {
      const isKeyringSelect = sql.includes('FROM sync_keyrings') || sql.includes('recovery_code_hash')
      return {
        bind: () => ({
          all: async () => ({ results: isKeyringSelect ? rows : [] }),
          run: async () => ({}),
          first: async () => null,
        }),
        all: async () => ({ results: [] }),
        run: async () => ({}),
        first: async () => null,
      }
    },
    async batch() {
      return []
    },
  }

  return {
    context: { cloudflare: { env: { DB: db } } },
    node: { req: { headers: {} } },
  } as unknown as H3Event
}

function row(deviceId: string, keyType: string, hash: string | null): KeyringRow {
  return {
    device_id: deviceId,
    key_type: keyType,
    encrypted_key: `enc-${deviceId}-${keyType}`,
    rotated_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    recovery_code_hash: hash,
  }
}

describe('recoverKeyrings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** Matches only the stored hash belonging to `deviceId`. */
  function matchOnly(deviceId: string): void {
    verifyPassword.mockImplementation(async (_code: string, _salt: string, hash: string) =>
      hash === `hash-${deviceId}`,
    )
  }

  const fleet = [
    row('device-a', 'master', 'hash-device-a:salt'),
    row('device-a', 'sync', 'hash-device-a:salt'),
    row('device-b', 'master', 'hash-device-b:salt'),
    row('device-c', 'master', null),
  ]

  it('returns only the matching device, not the whole fleet', async () => {
    // The regression: this returned all four rows.
    matchOnly('device-a')
    const keyrings = await recoverKeyrings(createEvent(fleet), 'user-1', { recoveryCode: 'code' })

    expect(keyrings.map(k => k.device_id)).toEqual(['device-a', 'device-a'])
  })

  it('returns every key type of the matching device', async () => {
    // A device's keyring is only useful complete, and the code is stored per row, so the
    // scoping is by device rather than by the single row that matched.
    matchOnly('device-a')
    const keyrings = await recoverKeyrings(createEvent(fleet), 'user-1', { recoveryCode: 'code' })

    expect(keyrings.map(k => k.key_type).sort()).toEqual(['master', 'sync'])
    expect(keyrings.map(k => k.keyring_id)).toContain('user-1:device-a:master')
  })

  it('never releases a device whose recovery code is different', async () => {
    matchOnly('device-b')
    const keyrings = await recoverKeyrings(createEvent(fleet), 'user-1', { recoveryCode: 'code' })

    expect(keyrings.map(k => k.device_id)).toEqual(['device-b'])
    expect(keyrings.some(k => k.device_id === 'device-a')).toBe(false)
  })

  it('never releases a device that has no recovery code at all', async () => {
    // device-c is not even a candidate for matching, yet it used to be returned.
    matchOnly('device-a')
    const keyrings = await recoverKeyrings(createEvent(fleet), 'user-1', { recoveryCode: 'code' })

    expect(keyrings.some(k => k.device_id === 'device-c')).toBe(false)
  })

  it('rejects a code that matches nothing', async () => {
    verifyPassword.mockResolvedValue(false)
    await expect(
      recoverKeyrings(createEvent(fleet), 'user-1', { recoveryCode: 'nope' }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects when the user has no keyrings', async () => {
    verifyPassword.mockResolvedValue(false)
    await expect(
      recoverKeyrings(createEvent([]), 'user-1', { recoveryCode: 'code' }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
