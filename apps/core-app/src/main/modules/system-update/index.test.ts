import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestNoRedirectMock = vi.hoisted(() => vi.fn())
const scheduleDbWriteMock = vi.hoisted(() =>
  vi.fn(async (_label: string, op: () => Promise<unknown>) => await op())
)
const emitMock = vi.hoisted(() => vi.fn())
const applyExternalRatesMock = vi.hoisted(() => vi.fn())
const isPackagedState = vi.hoisted(() => ({ value: true }))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return isPackagedState.value
    },
    getVersion: () => '2.4.9'
  }
}))

vi.mock('../../db/db-write', () => ({
  scheduleDbWrite: scheduleDbWriteMock
}))

vi.mock('../abstract-base-module', () => ({
  BaseModule: class BaseModule {
    constructor(..._args: unknown[]) {}
  }
}))

vi.mock('../box-tool/addon/preview/providers', () => ({
  fxRateProvider: {
    start: vi.fn(),
    stop: vi.fn(),
    applyExternalRates: applyExternalRatesMock
  }
}))

vi.mock('../database', () => ({
  databaseModule: {
    getDb: vi.fn(() => null)
  }
}))

vi.mock('../network', () => ({
  getNetworkService: () => ({
    requestNoRedirect: requestNoRedirectMock
  })
}))

vi.mock('../notification', () => ({
  notificationModule: {
    pushInboxEntry: vi.fn()
  }
}))

vi.mock('../../core/eventbus/touch-event', () => ({
  SystemConfigUpdatedEvent: class SystemConfigUpdatedEvent {
    constructor(
      readonly key: string,
      readonly value: unknown,
      readonly updatedAt: number
    ) {}
  },
  TalexEvents: {
    ALL_MODULES_LOADED: 'all-modules-loaded',
    SYSTEM_CONFIG_UPDATED: 'system/config-updated'
  },
  touchEventBus: {
    emit: emitMock,
    once: vi.fn(),
    off: vi.fn()
  }
}))

vi.mock('../../utils/version-util', () => ({
  getAppVersionSafe: () => '2.4.9'
}))

import { ALLOWED_REMOTE_SYSTEM_CONFIG_KEYS, SystemUpdateModule } from './index'

type TestableSystemUpdate = {
  db: unknown
  baseUrl: string
  applyUpdate: (update: Record<string, unknown>) => Promise<void>
}

function sha256(content: string): string {
  return createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex')
}

function createFakeDb() {
  const onConflictDoUpdate = vi.fn(async () => undefined)
  const values = vi.fn(() => ({ onConflictDoUpdate }))
  const insert = vi.fn(() => ({ values }))
  return { db: { insert }, insert, values, onConflictDoUpdate }
}

describe('SystemUpdateModule payload integrity and config allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPackagedState.value = true
  })

  it('rejects external origins, HTTP downgrades, missing sha256, and sha256 mismatches', async () => {
    const fakeDb = createFakeDb()
    const mod = new SystemUpdateModule() as unknown as TestableSystemUpdate
    mod.db = fakeDb.db
    mod.baseUrl = 'https://nexus.example.test'

    const validBody = JSON.stringify({ key: 'system-update.notice', value: { banner: 'ok' } })
    const validHash = sha256(validBody)

    // External origin rejected before any network request.
    await mod.applyUpdate({
      id: 'u-external',
      type: 'config',
      title: 't',
      summary: 's',
      timestamp: '2026-10-01T00:00:00Z',
      link: '',
      payloadUrl: 'https://evil.example/payload.json',
      payloadSha256: validHash
    })
    expect(requestNoRedirectMock).not.toHaveBeenCalled()

    // Non-HTTPS URL rejected in packaged builds.
    await mod.applyUpdate({
      id: 'u-http',
      type: 'config',
      title: 't',
      summary: 's',
      timestamp: '2026-10-01T00:00:00Z',
      link: '',
      payloadUrl: 'http://nexus.example.test/payload.json',
      payloadSha256: validHash
    })
    expect(requestNoRedirectMock).not.toHaveBeenCalled()

    // Missing payloadSha256 rejected before fetching.
    await mod.applyUpdate({
      id: 'u-nohash',
      type: 'config',
      title: 't',
      summary: 's',
      timestamp: '2026-10-01T00:00:00Z',
      link: '',
      payloadUrl: '/api/updates/payload.json'
    })
    expect(requestNoRedirectMock).not.toHaveBeenCalled()

    // Digest mismatch rejected before parsing/applying.
    requestNoRedirectMock.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      data: validBody
    })
    await mod.applyUpdate({
      id: 'u-badhash',
      type: 'config',
      title: 't',
      summary: 's',
      timestamp: '2026-10-01T00:00:00Z',
      link: '',
      payloadUrl: '/api/updates/payload.json',
      payloadSha256: '0'.repeat(64)
    })
    expect(requestNoRedirectMock).toHaveBeenCalledTimes(1)
    expect(fakeDb.insert).not.toHaveBeenCalled()
    expect(emitMock).not.toHaveBeenCalled()
  })

  it('rejects non-allowlisted systemConfig keys even with valid HTTPS origin and sha256', async () => {
    const fakeDb = createFakeDb()
    const mod = new SystemUpdateModule() as unknown as TestableSystemUpdate
    mod.db = fakeDb.db
    mod.baseUrl = 'https://nexus.example.test'

    const hostileBody = JSON.stringify({ key: 'ai.pricing.catalog', value: { tampered: true } })
    requestNoRedirectMock.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      data: hostileBody
    })

    await mod.applyUpdate({
      id: 'u-hostile-key',
      type: 'config',
      title: 't',
      summary: 's',
      timestamp: '2026-10-01T00:00:00Z',
      link: '',
      payloadUrl: '/api/updates/config.json',
      payloadSha256: sha256(hostileBody)
    })

    expect(fakeDb.insert).not.toHaveBeenCalled()
    expect(emitMock).not.toHaveBeenCalled()
  })

  it('applies verified allowlisted config updates from the trusted HTTPS origin', async () => {
    const fakeDb = createFakeDb()
    const mod = new SystemUpdateModule() as unknown as TestableSystemUpdate
    mod.db = fakeDb.db
    mod.baseUrl = 'https://nexus.example.test'

    const allowedKey = Array.from(ALLOWED_REMOTE_SYSTEM_CONFIG_KEYS)[0]!
    const body = JSON.stringify({ key: allowedKey, value: { enabled: true } })
    requestNoRedirectMock.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      data: body
    })

    await mod.applyUpdate({
      id: 'u-ok',
      type: 'config',
      title: 't',
      summary: 's',
      timestamp: '2026-10-01T00:00:00Z',
      link: '',
      payloadUrl: '/api/updates/config.json',
      payloadSha256: sha256(body)
    })

    expect(requestNoRedirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://nexus.example.test/api/updates/config.json'
      })
    )
    expect(fakeDb.insert).toHaveBeenCalledTimes(1)
    expect(emitMock).toHaveBeenCalledTimes(1)
  })
})
