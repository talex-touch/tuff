import type { H3Event } from 'h3'
import type { SqliteD1Database } from '../helpers/d1-sqlite'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../helpers/d1-sqlite'

vi.mock('../../server/utils/cloudflare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/utils/cloudflare')>()),
  readCloudflareBindings: (event: any) => event?.context?.cloudflare?.env,
}))

vi.mock('../../server/utils/afterResponse', () => ({
  runAfterResponse: (_event: unknown, _label: string, fn: () => Promise<unknown>) => {
    void fn()
  },
}))

function createD1Event(db: SqliteD1Database, headers: Record<string, string> = {}): H3Event {
  return {
    context: {
      cloudflare: { env: { DB: db } },
    },
    node: {
      req: { headers },
    },
  } as unknown as H3Event
}

describe('audit regressions: auth, account takeover, device binding, atomic tokens & API keys (#1, #2, #11, #15, #16, #17)', () => {
  let d1: SqliteD1Database
  let event: H3Event

  beforeEach(() => {
    d1 = createSqliteD1()
    event = createD1Event(d1)
  })

  afterEach(() => {
    d1.close()
    vi.restoreAllMocks()
  })

  it('#1: keeps auth_users.email isolated in pending_email until verified and refuses OAuth auto-linking onto unverified rows', async () => {
    const authStore = await import('../../server/utils/authStore')
    const { createD1Adapter } = await import('../../server/utils/authAdapter')
    await authStore.ensureAuthSchema(d1 as any)

    const attacker = await authStore.createUser(event, {
      email: 'attacker@example.com',
      name: 'Attacker',
      emailVerified: null,
      emailState: 'unverified',
    })

    // Setting pending email does NOT mutate auth_users.email.
    await authStore.setPendingUserEmail(event, attacker.id, 'victim@example.com')
    const afterPending = await authStore.getUserById(event, attacker.id)
    expect(afterPending?.email).toBe('attacker@example.com')
    expect(afterPending?.pendingEmail).toBe('victim@example.com')
    expect(await authStore.getUserByEmail(event, 'victim@example.com')).toBeNull()

    // Adapter createUser refuses to hijack or auto-link onto an existing unverified row.
    const adapter = createD1Adapter(event)
    await expect(
      adapter.createUser!({
        id: 'unused',
        email: 'attacker@example.com',
        name: 'Real Owner',
        emailVerified: new Date(),
      } as any),
    ).rejects.toThrow(/unverified/i)

    // Adapter createUser for an untrusted/unverified provider (e.g. LinuxDO) does NOT squat
    // auth_users.email; it uses a placeholder address + pendingEmail so the real owner is never DoS'd.
    const linuxdoCreated = await adapter.createUser!({
      id: 'unused',
      email: 'linuxdo-victim@example.com',
      name: 'LinuxDO Attacker',
      emailVerified: null,
      oauthEmailVerified: false,
    } as any)
    const linuxdoRow = await authStore.getUserById(event, linuxdoCreated.id)
    expect(linuxdoRow?.email).toMatch(/^missing\+.+@tuff\.local$/)
    expect(linuxdoRow?.pendingEmail).toBe('linuxdo-victim@example.com')
    expect(linuxdoRow?.emailState).toBe('missing')
    expect(linuxdoRow?.emailVerified).toBeNull()
    expect(await authStore.getUserByEmail(event, 'linuxdo-victim@example.com')).toBeNull()

    // Real owner can subsequently register via verified OAuth (GitHub) with that exact address cleanly.
    const realOwnerGithub = await adapter.createUser!({
      id: 'unused',
      email: 'linuxdo-victim@example.com',
      name: 'Real Owner',
      emailVerified: null,
      oauthEmailVerified: true,
    } as any)
    const realOwnerRow = await authStore.getUserById(event, realOwnerGithub.id)
    expect(realOwnerRow?.id).not.toBe(linuxdoRow?.id)
    expect(realOwnerRow?.email).toBe('linuxdo-victim@example.com')
    expect(realOwnerRow?.emailState).toBe('verified')
    expect(realOwnerRow?.emailVerified).toBeTruthy()

    // Real owner can also register via Magic Link (emailVerified: Date) after an unverified LinuxDO claim.
    await adapter.createUser!({
      id: 'unused',
      email: 'magic-victim@example.com',
      name: 'LinuxDO Attacker 2',
      emailVerified: null,
      oauthEmailVerified: false,
    } as any)
    const magicOwner = await adapter.createUser!({
      id: 'unused',
      email: 'magic-victim@example.com',
      name: 'Magic Owner',
      emailVerified: new Date(),
    } as any)
    const magicRow = await authStore.getUserById(event, magicOwner.id)
    expect(magicRow?.email).toBe('magic-victim@example.com')
    expect(magicRow?.emailState).toBe('verified')

    // Committing pending email atomically promotes pending_email -> email and clears pending_email.
    const committed = await authStore.commitVerifiedPendingEmail(event, attacker.id, 'victim@example.com')
    expect(committed).toMatchObject({
      id: attacker.id,
      email: 'victim@example.com',
      pendingEmail: null,
      emailState: 'verified',
    })
    const afterCommit = await authStore.getUserById(event, attacker.id)
    expect(afterCommit?.email).toBe('victim@example.com')
    expect(afterCommit?.pendingEmail).toBeNull()
    expect(afterCommit?.emailState).toBe('verified')
  })

  it('#16: useVerificationToken consumes a token atomically at most once under concurrent requests', async () => {
    const authStore = await import('../../server/utils/authStore')
    await authStore.ensureAuthSchema(d1 as any)

    const token = await authStore.createVerificationToken(
      event,
      'verify@example.com',
      10 * 60_000,
      undefined,
      'user-verify-1',
    )

    const results = await Promise.all([
      authStore.useVerificationToken(event, 'verify@example.com', token),
      authStore.useVerificationToken(event, 'verify@example.com', token),
      authStore.useVerificationToken(event, 'verify@example.com', token),
    ])

    const winners = results.filter(Boolean)
    expect(winners).toHaveLength(1)
    expect(winners[0]?.userId).toBe('user-verify-1')
  })

  it('#11: claimApprovedDeviceAuthRequest atomically claims an approved request once under concurrent polls', async () => {
    const authStore = await import('../../server/utils/authStore')
    await authStore.ensureAuthSchema(d1 as any)

    const user = await authStore.createUser(event, {
      email: 'poll@example.com',
      emailState: 'verified',
      emailVerified: new Date().toISOString(),
    })
    const created = await authStore.createDeviceAuthRequest(event, {
      deviceId: 'dev-race-1',
      deviceName: 'MacBook',
      devicePlatform: 'darwin',
      clientType: 'app',
      ttlMs: 300_000,
    })
    await authStore.approveDeviceAuthRequest(event, created.userCode, user.id, 'short')

    const claims = await Promise.all([
      authStore.claimApprovedDeviceAuthRequest(event, created.deviceCode),
      authStore.claimApprovedDeviceAuthRequest(event, created.deviceCode),
      authStore.claimApprovedDeviceAuthRequest(event, created.deviceCode),
    ])

    const winners = claims.filter(Boolean)
    expect(winners).toHaveLength(1)
    expect(winners[0]?.userId).toBe(user.id)
    expect(await authStore.getDeviceAuthByDeviceCode(event, created.deviceCode)).toBeNull()
  })

  it('#2: resolveBoundAppDeviceId strictly enforces JWT deviceId binding and rejects spoofed x-device-id', async () => {
    const { resolveBoundAppDeviceId } = await import('../../server/utils/syncDeviceAuth')

    expect(() => resolveBoundAppDeviceId(createD1Event(d1, { 'x-device-id': 'dev-1' }), null))
      .toThrow(/Device-bound app token required/)

    expect(() => resolveBoundAppDeviceId(createD1Event(d1, { 'x-device-id': 'dev-other' }), 'dev-1'))
      .toThrow(/Device id mismatch/)

    expect(resolveBoundAppDeviceId(createD1Event(d1, { 'x-device-id': 'dev-1' }), 'dev-1')).toBe('dev-1')
    expect(resolveBoundAppDeviceId(createD1Event(d1, {}), 'dev-1')).toBe('dev-1')
  })

  it('#15: validateApiKey transparently upgrades a legacy 32-bit hashed key to SHA-256 on first valid use', async () => {
    const apiKeyStore = await import('../../server/utils/apiKeyStore')
    await apiKeyStore.ensureApiKeySchema(d1 as any)

    const secretKey = 'tuff_legacy00112233445566778899aabbccddeeff'
    const prefix = `${secretKey.substring(0, 12)}...`
    const data = new TextEncoder().encode(secretKey)
    let legacyInt = 0
    for (const byte of data) {
      legacyInt = ((legacyInt << 5) - legacyInt) + byte
      legacyInt = legacyInt & legacyInt
    }
    const legacyHash = Math.abs(legacyInt).toString(16)
    const expectedSha = createHash('sha256').update(secretKey).digest('hex')

    d1.sqlite.prepare(`
      INSERT INTO user_api_keys (id, user_id, name, key_prefix, key_hash, scopes, created_at)
      VALUES ('key-legacy-1', 'user-legacy', 'Old CLI', ?, ?, '["plugin:publish"]', ?)
    `).run(prefix, legacyHash, new Date().toISOString())

    const validated = await apiKeyStore.validateApiKey(event, secretKey)
    expect(validated).toEqual({ userId: 'user-legacy', scopes: ['plugin:publish'] })

    const updatedRow = d1.sqlite
      .prepare(`SELECT key_hash FROM user_api_keys WHERE id = 'key-legacy-1'`)
      .get() as { key_hash: string }
    expect(updatedRow.key_hash).toBe(expectedSha)
  })

  it('#17: mergeUsers migrates user_api_keys to the target user instead of leaving orphaned keys', async () => {
    const authStore = await import('../../server/utils/authStore')
    const apiKeyStore = await import('../../server/utils/apiKeyStore')
    await authStore.ensureAuthSchema(d1 as any)
    await apiKeyStore.ensureApiKeySchema(d1 as any)

    const source = await authStore.createUser(event, { email: 'source@example.com', emailState: 'verified' })
    const target = await authStore.createUser(event, { email: 'target@example.com', emailState: 'verified' })
    const createdKey = await apiKeyStore.createApiKey(event, source.id, 'Publish Key', ['plugin:publish'])

    await authStore.mergeUsers(event, { sourceUserId: source.id, targetUserId: target.id })

    const keyRow = d1.sqlite
      .prepare(`SELECT user_id FROM user_api_keys WHERE id = ?`)
      .get(createdKey.id) as { user_id: string }
    expect(keyRow.user_id).toBe(target.id)
  })

  it('#3: settled realtime ASR sessions retain concurrency slots until expires_at while failed-mint released sessions free slots', async () => {
    const rtStore = await import('../../server/utils/asrRealtimeSessionStore')
    const pricing = {
      id: 'rule-audio-stt',
      capability: 'audio.stt',
      providerScope: 'all',
      billingMode: 'unit',
      creditsPerUnit: 4,
      secondaryCreditsPerUnit: 1,
      minCredits: 1,
      currency: 'credits',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any

    const s1 = await rtStore.createRealtimeAsrSession(event, {
      sessionId: 'rt-1',
      userId: 'user-rt',
      providerId: 'dashscope',
      ttlSeconds: 60,
      reservedCredits: 240,
      reservationLedgerId: 'led-1',
      pricing,
      maxConcurrent: 2,
    })
    const s2 = await rtStore.createRealtimeAsrSession(event, {
      sessionId: 'rt-2',
      userId: 'user-rt',
      providerId: 'dashscope',
      ttlSeconds: 60,
      reservedCredits: 240,
      reservationLedgerId: 'led-2',
      pricing,
      maxConcurrent: 2,
    })
    expect(s1.created).toBe(true)
    expect(s2.created).toBe(true)

    // Settling rt-1 immediately at t=0 must keep the slot occupied until expires_at passes.
    const settled = await rtStore.claimRealtimeAsrSessionForSettlement(event, 'user-rt', 'rt-1', {
      expectedChargedCredits: null,
      chargedCredits: 240,
      durationMs: 0,
      transcriptUnits: 0,
    })
    expect(settled?.status).toBe('settled')
    expect(settled?.chargedCredits).toBe(240)
    expect(await rtStore.countActiveRealtimeAsrSessions(event, 'user-rt')).toBe(2)

    const s3Blocked = await rtStore.createRealtimeAsrSession(event, {
      sessionId: 'rt-3',
      userId: 'user-rt',
      providerId: 'dashscope',
      ttlSeconds: 60,
      reservedCredits: 240,
      reservationLedgerId: 'led-3',
      pricing,
      maxConcurrent: 2,
    })
    expect(s3Blocked.created).toBe(false)

    // Marking rt-2 as released (DashScope token mint failed before issuing a live token) frees its slot.
    await rtStore.markRealtimeAsrSessionReleased(event, 'rt-2')
    expect(await rtStore.countActiveRealtimeAsrSessions(event, 'user-rt')).toBe(1)
    const s3Allowed = await rtStore.createRealtimeAsrSession(event, {
      sessionId: 'rt-3',
      userId: 'user-rt',
      providerId: 'dashscope',
      ttlSeconds: 60,
      reservedCredits: 240,
      reservationLedgerId: 'led-3',
      pricing,
      maxConcurrent: 2,
    })
    expect(s3Allowed.created).toBe(true)
  })
})
