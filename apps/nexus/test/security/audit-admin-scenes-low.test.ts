import type { H3Event } from 'h3'
import type { SqliteD1Database } from '../helpers/d1-sqlite'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../helpers/d1-sqlite'

vi.mock('nitropack/runtime', () => ({
  useStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    getKeys: vi.fn(async () => []),
  }),
}))

vi.mock('../../server/utils/cloudflare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/utils/cloudflare')>()),
  readCloudflareBindings: (event: any) => event?.context?.cloudflare?.env,
}))

vi.mock('../../server/utils/exchangeRateService', () => ({
  getUsdRates: vi.fn(),
  convertUsd: vi.fn(),
}))

vi.mock('../../server/utils/sceneAssetStorage', () => ({
  buildSceneAssetGovernanceResourceId: (key: string) => `scene-asset:${key}`,
  uploadSceneAsset: vi.fn(),
}))

vi.mock('../../server/utils/uploadGovernance', () => ({
  startUploadGovernance: vi.fn(),
  completeUploadGovernance: vi.fn(),
  failUploadGovernance: vi.fn(),
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    auth: { origin: 'https://nexus.example.com', secret: 'test-auth-secret-value-at-least-32-chars' },
    adminControl: {
      emergencyJwtSecret: 'test-emergency-secret-at-least-32-chars',
      emergencyIssuerVersion: 'v2',
      dualControlEnabled: true,
    },
  }),
}))

function createD1Event(db: SqliteD1Database, bucket?: any): H3Event {
  return {
    path: '/test',
    context: {
      cloudflare: {
        env: {
          DB: db,
          NUXT_DOC_TOKEN_SECRET: 'test-auth-secret-value-at-least-32-chars',
          ...(bucket ? { R2: bucket } : {}),
        },
      },
    },
    node: { req: { url: '/test', headers: {} } },
  } as unknown as H3Event
}

describe('audit regressions: emergency revocation, CORS, team seats, WebAuthn, docAnalytics, CSV, subscriptions, privacy & relay (#10, #13, #16, #18-#22, #24)', () => {
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

  it('#10: revoking an emergency session invalidates its JTIs, parent session state is checked, and verify_nonce is one-time', async () => {
    const emergency = await import('../../server/utils/adminEmergencyStore')

    const session = await emergency.createAdminEmergencySession(event, {
      sessionId: 'em-sess-1',
      adminId: 'admin-1',
      dfpHash: 'dfp-hash-1',
      challenge: 'chal-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    await emergency.updateEmergencySessionVerified(event, {
      sessionId: session.sessionId,
      adminId: 'admin-1',
      verifyNonce: 'nonce-secret-1',
    })

    // verify_nonce can only be consumed once.
    const firstConsume = await emergency.consumeEmergencyVerifyNonce(event, session.sessionId, 'nonce-secret-1')
    expect(firstConsume.ok).toBe(true)
    const secondConsume = await emergency.consumeEmergencyVerifyNonce(event, session.sessionId, 'nonce-secret-1')
    expect(secondConsume.ok).toBe(false)

    // Issuing a JTI and revoking the session immediately invalidates the JTI.
    await emergency.createEmergencyJti(event, {
      jti: 'jti-1',
      sessionId: session.sessionId,
      scope: '["risk.mode.override"]',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    await emergency.revokeAdminEmergencySession(event, session.sessionId)
    expect(await emergency.consumeEmergencyJti(event, 'jti-1')).toBe(false)
  })

  it('#16: CORS middleware normalizes encoded and dot-segment control-plane paths and never emits wildcard ACAO for them', async () => {
    const headersSet: Record<string, string> = {}
    vi.stubGlobal('defineEventHandler', (fn: any) => fn)
    vi.stubGlobal('getHeader', (ev: any, name: string) => ev.headers[name.toLowerCase()])
    vi.stubGlobal('setResponseHeaders', (_ev: any, next: Record<string, string>) => Object.assign(headersSet, next))
    vi.stubGlobal('useRuntimeConfig', () => ({ auth: { origin: 'https://nexus.example.com' } }))

    const corsHandler = (await import('../../server/middleware/cors')).default as (ev: any) => unknown

    for (const bypassPath of [
      '/api/%61dmin/users',
      '/api/public/../admin/risk/mode.override',
      '/api//admin/emergency/init',
      '/api/dashboard/%69ntelligence/models',
    ]) {
      for (const key of Object.keys(headersSet))
        delete headersSet[key]
      const res = { statusCode: 200, statusMessage: '' }
      corsHandler({
        path: bypassPath,
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example' },
        node: { req: { url: bypassPath }, res },
      })
      expect(headersSet['Access-Control-Allow-Origin'], bypassPath).toBeUndefined()
      expect(res.statusCode, bypassPath).toBe(403)
    }

    vi.unstubAllGlobals()
  })

  it('#13: addTeamMemberWithinSeatLimit enforces seat limits atomically under concurrent joins', async () => {
    const creditsStore = await import('../../server/utils/creditsStore')
    await creditsStore.ensureCreditsTables(d1 as any)

    const team = await creditsStore.createOrganizationTeam(event, 'owner-1', 'Atomic Org')
    // Team has 1 owner; with seatsLimit = 2, only ONE of two concurrent joiners may succeed.
    const outcomes = await Promise.all([
      creditsStore.addTeamMemberWithinSeatLimit(event, team.id, 'user-a', 'member', 2),
      creditsStore.addTeamMemberWithinSeatLimit(event, team.id, 'user-b', 'member', 2),
    ])

    expect(outcomes.filter(o => o === 'added')).toHaveLength(1)
    expect(outcomes.filter(o => o === 'seat_full')).toHaveLength(1)
    expect(await creditsStore.countTeamMembers(event, team.id)).toBe(2)
  })

  it('#18: webauthn rejects signCount reset to 0 when previousCounter > 0 and rejects deeply nested CBOR', async () => {
    const { verifyAssertionResponse, verifyRegistrationResponse } = await import('../../server/utils/webauthn')

    // 1. Deeply nested CBOR (40 nested 1-element arrays: 0x81 repeated 40 times + 0x00).
    const deepCbor = new Uint8Array(41)
    deepCbor.fill(0x81, 0, 40)
    deepCbor[40] = 0x00
    const deepB64Url = Buffer.from(deepCbor).toString('base64url')
    await expect(
      verifyRegistrationResponse({
        attestationObject: deepB64Url,
        clientDataJSON: Buffer.from('{}').toString('base64url'),
        expectedChallenge: 'c',
        expectedOrigin: 'https://nexus.example.com',
        expectedRpId: 'nexus.example.com',
      }),
    ).rejects.toThrow(/max nesting depth exceeded/)

    // 2. Cloned authenticator counter reset (previousCounter=5, currentCounter=0) must fail.
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
    const rpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('nexus.example.com')))
    const authData = new Uint8Array(37)
    authData.set(rpIdHash, 0)
    authData[32] = 0x05 // UP + UV
    // bytes 33..36 remain 0 (signCount === 0)
    const clientDataBytes = new TextEncoder().encode(JSON.stringify({
      type: 'webauthn.get',
      challenge: 'chal-1',
      origin: 'https://nexus.example.com',
    }))
    const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataBytes))
    const signedData = Buffer.concat([Buffer.from(authData), Buffer.from(clientHash)])
    const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, signedData))

    await expect(
      verifyAssertionResponse({
        authenticatorData: Buffer.from(authData).toString('base64url'),
        clientDataJSON: Buffer.from(clientDataBytes).toString('base64url'),
        signature: Buffer.from(signature).toString('base64url'),
        expectedChallenge: 'chal-1',
        expectedOrigin: 'https://nexus.example.com',
        expectedRpId: 'nexus.example.com',
        publicKeyJwk,
        previousCounter: 5,
      }),
    ).rejects.toThrow(/Authenticator counter did not increase/)
  })

  it('#19: docAnalytics uses domain-separated HMAC-SHA256 (not raw SHA256 concatenation) and IP-only security buckets', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      auth: { secret: 'test-auth-secret-value-at-least-32-chars' },
    }))
    try {
      const docStore = await import('../../server/utils/docAnalyticsStore')
      await docStore.ensureDocAnalyticsSchema(d1 as any)

      const token = docStore.createDocToken(event, {
        sid: 's1',
        path: 'docs/intro',
        cid: 'c1',
        src: 'docs_page',
        rl: 0,
      })
      const [header, payload, signature] = token.split('.')
      const oldWeakSig = createHash('sha256')
        .update(`${header}.${payload}.test-auth-secret-value-at-least-32-chars`)
        .digest('base64url')
      expect(signature).not.toBe(oldWeakSig)
      expect(docStore.verifyDocToken(event, token)).toMatchObject({ sid: 's1', path: 'docs/intro' })
      expect(docStore.verifyDocToken(event, `${header}.${payload}.${oldWeakSig}`)).toBeNull()

      // Violations recorded under clientA are immediately visible when querying with rotated clientB on the same IP.
      await docStore.recordDocViolation(d1 as any, { ip: '198.51.100.77', clientId: 'client-a', weight: 2 })
      const stateForRotatedClient = await docStore.getDocSecurityState(d1 as any, '198.51.100.77', 'client-b-rotated')
      expect(stateForRotatedClient?.violationCount).toBe(2)
      expect(stateForRotatedClient?.blockedUntil).toBeGreaterThan(Date.now())
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('#12: sceneOrchestrator enforces scene ownerScope and vision OCR rejects unlisted caller models', async () => {
    const { createSceneRegistryEntry } = await import('../../server/utils/sceneRegistryStore')
    const { runSceneOrchestrator } = await import('../../server/utils/sceneOrchestrator')
    const { invokeIntelligenceVisionOcr } = await import('../../server/utils/intelligenceVisionOcrProvider')

    await createSceneRegistryEntry(event, {
      id: 'user.private.scene',
      displayName: 'Private Scene',
      owner: 'app',
      ownerScope: 'user',
      ownerId: 'owner-user-1',
      requiredCapabilities: ['text.translate'],
      bindings: [],
    }, 'owner-user-1')

    await expect(
      runSceneOrchestrator(event, 'user.private.scene', { ownerId: 'other-user-2', dryRun: true }),
    ).rejects.toMatchObject({ statusCode: 403, data: { code: 'SCENE_FORBIDDEN' } })

    await expect(
      invokeIntelligenceVisionOcr(event, {
        id: 'prv-ocr',
        name: 'ocr',
        displayName: 'OCR',
        vendor: 'openai',
        status: 'enabled',
        authType: 'api_key',
        authRef: 'cred-1',
        ownerScope: 'system',
        ownerId: null,
        description: null,
        endpoint: 'https://api.openai.com/v1',
        region: null,
        metadata: { intelligenceType: 'openai', defaultModel: 'gpt-4o-mini', models: ['gpt-4o-mini'] },
        capabilities: [{ id: 'c1', providerId: 'prv-ocr', capability: 'vision.ocr', schemaRef: null, metering: null, constraints: null, metadata: null, createdAt: '', updatedAt: '' }],
        createdBy: 'admin',
        createdAt: '',
        updatedAt: '',
      }, { model: 'o1-expensive-unlisted', imageBase64: 'AAAA' }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('#21: activation codes enforce per-user uniqueness, refuse downgrading higher active tier, and rank active highest tier first', async () => {
    const subStore = await import('../../server/utils/subscriptionStore')
    await subStore.ensureSubscriptionTables(d1 as any)

    const proCode = await subStore.createActivationCode(event, { plan: 'PRO', durationDays: 30, maxUses: 5 })
    const plusCode = await subStore.createActivationCode(event, { plan: 'PLUS', durationDays: 7, maxUses: 5 })

    // First redemption succeeds.
    await subStore.activateCode(event, proCode.code, 'user-sub-1')
    expect((await subStore.getUserSubscription(event, 'user-sub-1')).plan).toBe('PRO')

    // Same user cannot redeem the same multi-use code twice.
    await expect(subStore.activateCode(event, proCode.code, 'user-sub-1')).rejects.toMatchObject({ statusCode: 409 })

    // Activating a lower-tier code (PLUS) while PRO is active is refused.
    await expect(subStore.activateCode(event, plusCode.code, 'user-sub-1')).rejects.toMatchObject({ statusCode: 409 })

    // Even if a lower-tier row exists with a newer activated_at, getUserSubscription still selects PRO.
    d1.sqlite.prepare(`
      INSERT INTO activation_logs (id, code_id, user_id, activated_at, plan, expires_at)
      VALUES ('manual-plus', 'code-plus-old', 'user-sub-1', ?, 'PLUS', ?)
    `).run(new Date(Date.now() + 1000).toISOString(), new Date(Date.now() + 86_400_000).toISOString())
    expect((await subStore.getUserSubscription(event, 'user-sub-1')).plan).toBe('PRO')
  })

  it('#22: finalizeAccountDeletion sweeps real sync-chunks R2 objects (including orphans) and skips virtual chunks: keys', async () => {
    const authStore = await import('../../server/utils/authStore')
    const privacyStore = await import('../../server/utils/privacyDataStore')
    await authStore.ensureAuthSchema(d1 as any)

    const deletedKeys: string[] = []
    const r2Objects = new Map<string, Buffer>([
      ['user-del/sync-chunks/sha-recorded', Buffer.from('chunk-1')],
      ['user-del/sync-chunks/sha-orphan', Buffer.from('chunk-orphan')],
      ['other-user/sync-chunks/sha-keep', Buffer.from('keep')],
    ])
    const bucket = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(async (key: string) => {
        deletedKeys.push(key)
        r2Objects.delete(key)
      }),
      list: vi.fn(async (opts?: { prefix?: string }) => ({
        objects: Array.from(r2Objects.keys())
          .filter(k => !opts?.prefix || k.startsWith(opts.prefix))
          .map(key => ({ key })),
        truncated: false,
        delimitedPrefixes: [],
      })),
    }

    const delEvent = createD1Event(d1, bucket)
    const createdAt = '2026-06-01T00:00:00.000Z'
    d1.sqlite.prepare(`
      INSERT INTO auth_users (id, email, name, email_state, role, status, deletion_requested_at, deletion_scheduled_at, created_at)
      VALUES ('user-del', 'del@example.com', 'Del', 'verified', 'user', 'deletion_pending', ?, '2026-07-01T00:00:00.000Z', ?)
    `).run(createdAt, createdAt)
    d1.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS sync_blobs_v1 (
        user_id TEXT NOT NULL, blob_id TEXT NOT NULL, object_key TEXT NOT NULL,
        sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL,
        PRIMARY KEY (user_id, blob_id)
      );
      CREATE TABLE IF NOT EXISTS sync_blob_chunks_v1 (
        user_id TEXT NOT NULL, chunk_id TEXT NOT NULL, sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL, object_key TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL,
        PRIMARY KEY (user_id, chunk_id)
      );
      INSERT INTO sync_blobs_v1 VALUES ('user-del', 'b1', 'chunks:b1', 'fullsha', 12, '2026-06-01T00:00:00.000Z', 'ready');
      INSERT INTO sync_blob_chunks_v1 VALUES ('user-del', 'c1', 'sha-recorded', 7, 'user-del/sync-chunks/sha-recorded', '2026-06-01T00:00:00.000Z', 'ready');
    `)

    const res = await privacyStore.finalizeAccountDeletion(delEvent, 'user-del', { now: new Date('2026-07-02T00:00:00.000Z') })
    expect(res.status).toBe('finalized')
    expect(deletedKeys).not.toContain('chunks:b1')
    expect(deletedKeys).toContain('user-del/sync-chunks/sha-recorded')
    expect(deletedKeys).toContain('user-del/sync-chunks/sha-orphan')
    expect(r2Objects.has('other-user/sync-chunks/sha-keep')).toBe(true)
  })

  it('#24: qwen-asr-relay enforces exact generation paths and rejects mismatched or different-length bearer secrets', async () => {
    const relay = (await import('../../../../infra/qwen-asr-relay/index.mjs')).default
    const env = {
      RELAY_SHARED_SECRET: 'super-secret-relay-token',
      DASHSCOPE_ENDPOINT: 'https://dashscope.aliyuncs.com/api/v1',
      DASHSCOPE_API_KEY: 'sk-test',
    }

    // Rejects spoofed suffix paths with 404.
    const spoofedPathRes = await relay.fetch(
      new Request('https://relay.example.com/evil/prefix/services/aigc/multimodal-generation/generation', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RELAY_SHARED_SECRET}` },
      }),
      env,
    )
    expect(spoofedPathRes.status).toBe(404)

    // Rejects different-length bearer token on exact valid path with 401.
    const shortAuthRes = await relay.fetch(
      new Request('https://relay.example.com/api/v1/services/aigc/multimodal-generation/generation', {
        method: 'POST',
        headers: { Authorization: 'Bearer short' },
      }),
      env,
    )
    expect(shortAuthRes.status).toBe(401)

    // Accepts exact valid path and valid bearer secret (advances to body validation -> 400).
    const validPathAuthRes = await relay.fetch(
      new Request('https://relay.example.com/services/aigc/multimodal-generation/generation', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RELAY_SHARED_SECRET}` },
        body: '{}',
      }),
      env,
    )
    expect(validPathAuthRes.status).toBe(400)
  })
})
