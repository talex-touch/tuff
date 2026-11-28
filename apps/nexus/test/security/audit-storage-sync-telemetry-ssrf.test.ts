import type { H3Event } from 'h3'
import type { SqliteD1Database } from '../helpers/d1-sqlite'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../helpers/d1-sqlite'

vi.mock('../../server/utils/cloudflare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/utils/cloudflare')>()),
  readCloudflareBindings: (event: any) => event?.context?.cloudflare?.env,
}))

function createEventWithDb(db: SqliteD1Database, bucket?: any, headers: Record<string, string> = {}): H3Event {
  return {
    path: '/test',
    context: {
      cloudflare: { env: { DB: db, ...(bucket ? { R2: bucket, IMAGES: bucket } : {}) } },
    },
    node: {
      req: { url: '/test', headers },
    },
  } as unknown as H3Event
}

function createMemoryR2Bucket() {
  const store = new Map<string, { data: Buffer, contentType: string }>()
  return {
    store,
    get: vi.fn(async (key: string) => {
      const entry = store.get(key)
      if (!entry)
        return null
      return {
        arrayBuffer: async () => entry.data.buffer.slice(entry.data.byteOffset, entry.data.byteOffset + entry.data.byteLength),
        httpMetadata: { contentType: entry.contentType },
        size: entry.data.byteLength,
      }
    }),
    put: vi.fn(async (key: string, value: any, opts?: any) => {
      const buf = Buffer.isBuffer(value)
        ? value
        : (value instanceof Uint8Array ? Buffer.from(value) : Buffer.from(value))
      store.set(key, { data: buf, contentType: opts?.httpMetadata?.contentType ?? 'application/octet-stream' })
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
    list: vi.fn(async (opts?: { prefix?: string }) => {
      const prefix = opts?.prefix ?? ''
      const objects = Array.from(store.keys())
        .filter(key => !prefix || key.startsWith(prefix))
        .map(key => ({ key }))
      return { objects, truncated: false, delimitedPrefixes: [] }
    }),
  }
}

describe('audit regressions: image storage, sync chunks, telemetry, IP guard & SSRF (#6, #7, #8, #9, #14, #16)', () => {
  let d1: SqliteD1Database

  beforeEach(() => {
    d1 = createSqliteD1()
  })

  afterEach(() => {
    d1.close()
    vi.restoreAllMocks()
  })

  it('#6 & #14: enforces raster magic bytes + extension + MIME, prefixes writes under images/, and blocks key traversal on delete', async () => {
    const imageStorage = await import('../../server/utils/imageStorage')
    const bucket = createMemoryR2Bucket()
    const event = createEventWithDb(d1, bucket)

    // Seed an unrelated object outside images/ to verify deleteImage cannot delete arbitrary R2 keys.
    await bucket.put('sync/user-1/secret.bin', Buffer.from('secret'))

    // Rejects SVG disguised as image/png.
    await expect(
      imageStorage.uploadImageFromBuffer(event, Buffer.from('<svg onload=alert(1)>'), 'icon.png', 'image/png'),
    ).rejects.toMatchObject({ statusCode: 400 })

    // Rejects mismatched MIME vs magic bytes (JPEG magic bytes declared as image/png).
    await expect(
      imageStorage.uploadImageFromBuffer(event, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), 'fake.png', 'image/png'),
    ).rejects.toMatchObject({ statusCode: 400 })

    // Accepts genuine PNG header and stores strictly under images/ prefix.
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
    const uploaded = await imageStorage.uploadImageFromBuffer(event, pngBytes, 'avatar.png', 'image/png')
    expect(uploaded.key).toMatch(/\.png$/)
    expect(bucket.store.has(`images/${uploaded.key}`)).toBe(true)

    // Blocks traversal / multi-segment keys on delete & assertion.
    expect(() => imageStorage.assertValidImageKey('../sync/user-1/secret.bin')).toThrow()
    expect(() => imageStorage.assertValidImageKey('sync/user-1/secret.bin')).toThrow()
    expect(() => imageStorage.assertValidImageKey('foo%2fbar.png')).toThrow()
    await expect(imageStorage.deleteImage(event, 'sync/user-1/secret.bin')).rejects.toMatchObject({ statusCode: 400 })
    expect(bucket.store.has('sync/user-1/secret.bin')).toBe(true)

    // Safe inline MIME allowlist rejects HTML/SVG.
    expect(imageStorage.isSafeInlineImageMime('image/png')).toBe(true)
    expect(imageStorage.isSafeInlineImageMime('image/svg+xml')).toBe(false)
    expect(imageStorage.isSafeInlineImageMime('text/html')).toBe(false)
  })

  it('#7: chunked sync blob upload enforces quota atomically and verifies streaming SHA-256 without over-allocating', async () => {
    const authStore = await import('../../server/utils/authStore')
    const syncStore = await import('../../server/utils/syncStoreV1')
    const bucket = createMemoryR2Bucket()
    const event = createEventWithDb(d1, bucket)
    const userId = 'sync-user-chunked'
    await authStore.ensureAuthSchema(d1 as any)

    // Leave exactly 16 bytes of storage headroom under the user's plan quota.
    const quota = await syncStore.getOrInitQuota(event, userId)
    d1.sqlite
      .prepare(`UPDATE sync_quotas_v1 SET used_storage_bytes = ? WHERE user_id = ?`)
      .run(quota.limits.storage_limit_bytes - 16, userId)

    const c0 = Buffer.from('01234567')
    const c1 = Buffer.from('89abcdef')
    const full = Buffer.concat([c0, c1])
    const c0Sha = createHash('sha256').update(c0).digest('hex')
    const c1Sha = createHash('sha256').update(c1).digest('hex')
    const fullSha = createHash('sha256').update(full).digest('hex')

    const prepared = await syncStore.prepareSyncBlobChunks(event, userId, {
      itemId: 'item-1',
      logicalVersion: 'v1',
      sha256: fullSha,
      sizeBytes: full.byteLength,
      chunkSize: 8,
      chunks: [
        { index: 0, sha256: c0Sha, sizeBytes: c0.byteLength },
        { index: 1, sha256: c1Sha, sizeBytes: c1.byteLength },
      ],
    })
    expect(prepared.action).toBe('upload')
    expect(prepared.missing).toHaveLength(2)

    await syncStore.uploadSyncBlobChunk(
      event,
      userId,
      prepared.sessionId!,
      { index: 0, sha256: c0Sha, sizeBytes: c0.byteLength },
      new File([c0], 'chunk-0.bin', { type: 'application/octet-stream' }),
    )
    await syncStore.uploadSyncBlobChunk(
      event,
      userId,
      prepared.sessionId!,
      { index: 1, sha256: c1Sha, sizeBytes: c1.byteLength },
      new File([c1], 'chunk-1.bin', { type: 'application/octet-stream' }),
    )
    const committed = await syncStore.commitSyncBlobChunks(event, userId, prepared.sessionId!)
    expect(committed.sha256).toBe(fullSha)
    expect(committed.sizeBytes).toBe(16)

    // Quota is now at 16/16 bytes; another prepare/upload exceeding quota fails closed with 403.
    const extraChunk = Buffer.from('extra')
    const extraSha = createHash('sha256').update(extraChunk).digest('hex')
    await expect(
      syncStore.prepareSyncBlobChunks(event, userId, {
        itemId: 'item-2',
        logicalVersion: 'v1',
        sha256: extraSha,
        sizeBytes: extraChunk.byteLength,
        chunkSize: 8,
        chunks: [{ index: 0, sha256: extraSha, sizeBytes: extraChunk.byteLength }],
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('#8: untrusted telemetry messages assign server UUID, force status=unread, reject source=system, and cannot overwrite existing rows', async () => {
    const messageStore = await import('../../server/utils/messageStore')
    const event = createEventWithDb(d1)

    // Trusted internal call can insert source='system'.
    const trustedCount = await messageStore.recordTelemetryMessages(
      event,
      [{ id: 'sys-alert-1', source: 'system', severity: 'error', title: 'Alert', message: 'Real system alert' }],
      { trustedSystem: true },
    )
    expect(trustedCount).toBe(1)

    // Untrusted caller cannot spoof source='system' or overwrite 'sys-alert-1' or set status='archived'.
    const untrustedCount = await messageStore.recordTelemetryMessages(event, [
      { id: 'sys-alert-1', source: 'client', severity: 'info', title: 'Overwrite attempt', message: 'nope', status: 'archived' },
      { id: 'spoof-sys', source: 'system', severity: 'error', title: 'Spoofed', message: 'fake alert' },
    ])
    expect(untrustedCount).toBe(1)

    const existing = d1.sqlite.prepare(`SELECT id, title, message, source FROM telemetry_messages WHERE id = 'sys-alert-1'`).get() as any
    expect(existing.title).toBe('Alert')
    expect(existing.message).toBe('Real system alert')
    expect(existing.source).toBe('system')

    const clientRows = d1.sqlite.prepare(`SELECT id, status FROM telemetry_messages WHERE source = 'client'`).all() as any[]
    expect(clientRows).toHaveLength(1)
    expect(clientRows[0].id).not.toBe('sys-alert-1')
    expect(clientRows[0].status).toBe('unread')
  })

  it('#16: guardTelemetryIp enforces rate limit atomically, trips 429 once, returns 403 while blocked, and fails closed 503 on D1 error', async () => {
    const ipSecurity = await import('../../server/utils/ipSecurityStore')
    const event = createEventWithDb(d1, undefined, { 'cf-connecting-ip': '198.51.100.42' })

    // First call with weight 1001 exceeds MAX_EVENTS_PER_WINDOW (1000) -> 429 Too Many Requests.
    await expect(ipSecurity.guardTelemetryIp(event, { weight: 1001, action: 'test' })).rejects.toMatchObject({
      statusCode: 429,
    })

    // Subsequent call while blocked -> 403 IP blocked (not 429).
    await expect(ipSecurity.guardTelemetryIp(event, { weight: 1, action: 'test' })).rejects.toMatchObject({
      statusCode: 403,
    })

    // Broken D1 fails closed with 503.
    const brokenDb = {
      prepare: () => {
        throw new Error('D1 offline')
      },
    }
    const brokenEvent = {
      context: { cloudflare: { env: { DB: brokenDb } } },
      node: { req: { headers: { 'cf-connecting-ip': '198.51.100.43' } } },
    } as unknown as H3Event
    await expect(ipSecurity.guardTelemetryIp(brokenEvent, { weight: 1, action: 'test' })).rejects.toMatchObject({
      statusCode: 503,
    })
  })

  it('#9: webhookUrlPolicy blocks IPv4-mapped/compatible IPv6, 6to4, NAT64, discard, Teredo, ULA/link-local, CGNAT, userinfo, and localhost in production', async () => {
    const { evaluateWebhookUrl } = await import('../../server/utils/webhookUrlPolicy')

    const privateHostHttpsUrls = [
      'https://[::169.254.169.254]/hook',
      'https://[::127.0.0.1]/hook',
      'https://[::10.0.0.1]/hook',
      'https://[::192.168.1.1]/hook',
      'https://[::a9fe:a9fe]/hook',
      'https://[::7f00:1]/hook',
      'https://[::]/hook',
      'https://[::1]/hook',
      'https://[0:0:0:0:0:0:0:1]/hook',
      'https://[::ffff:127.0.0.1]/admin',
      'https://[::ffff:7f00:1]/admin',
      'https://[::ffff:169.254.169.254]/latest/meta-data/',
      'https://[::ffff:0:169.254.169.254]/hook',
      'https://[64:ff9b::169.254.169.254]/hook',
      'https://[64:ff9b:1::1]/hook',
      'https://[100::1]/hook',
      'https://[2002:a9fe:a9fe::1]/hook',
      'https://[2001::1]/hook',
      'https://[2001:db8::1]/hook',
      'https://[fc00::1]/hook',
      'https://[fd00::1]/hook',
      'https://[fe80::1]/hook',
      'https://[fec0::1]/hook',
      'https://[ff02::1]/hook',
      'https://100.64.0.1/hook',
      'https://0.0.0.0/hook',
      'https://192.0.0.1/hook',
      'https://198.18.0.1/hook',
      'https://224.0.0.1/hook',
      'https://127.0.0.1./hook',
      'http://localhost:8080/hook',
      'http://sub.localhost/hook',
    ]

    for (const url of privateHostHttpsUrls) {
      const verdict = evaluateWebhookUrl(url, { allowLocalhost: false })
      expect(verdict, `expected private-host block: ${url}`).toEqual({
        allowed: false,
        reason: 'private-host',
      })
    }

    expect(evaluateWebhookUrl('https://user:pass@hooks.example.com/notify', { allowLocalhost: false })).toEqual({
      allowed: false,
      reason: 'unparseable',
    })
    expect(evaluateWebhookUrl('https://hooks.example.com/notify', { allowLocalhost: false }).allowed).toBe(true)
    expect(evaluateWebhookUrl('https://[2606:4700:4700::1111]/hook', { allowLocalhost: false }).allowed).toBe(true)
  })
})
