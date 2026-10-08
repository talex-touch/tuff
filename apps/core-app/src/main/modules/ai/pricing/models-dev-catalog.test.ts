/**
 * Catalog storage and refresh against a real, fully migrated libSQL database; only the network
 * is simulated.
 *
 * Fixture: `__fixtures__/models-dev-subset.json` is a verbatim cut of https://models.dev/api.json
 * downloaded on 2026-10-03 (11 providers, 19 models, raw shape, original order).
 */
import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { NetworkTransportError } from '@talex-touch/utils/network'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../intelligence-test-harness'
import * as schema from '../../../db/schema'
import { systemConfig } from '../../../db/schema'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import fixture from './__fixtures__/models-dev-subset.json'
import {
  compactModelsDevCatalog,
  getPricingCatalogStatus,
  hashCatalogProviders,
  loadPricingCatalog,
  PRICING_CATALOG_CONFIG_KEY,
  PRICING_CATALOG_MAX_AGE_MS,
  PRICING_SINCE_CONFIG_KEY,
  readPricingSinceMs,
  refreshPricingCatalog,
  resetPricingCatalogForTest,
  startPricingCatalogSchedule,
  stopPricingCatalogSchedule,
  verifyCompactCatalog,
  waitForPricingSinceMarkerForTest
} from './models-dev-catalog'
import { estimateCostUsd, resolveModelPricing } from './model-pricing'

const networkMocks = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('../../network', () => ({
  getNetworkService: () => ({ request: networkMocks.request })
}))

vi.mock('../intelligence-sdk', () => ({
  getIntelligenceProviderManager: () => {
    throw new Error('[Intelligence] Provider manager not initialized')
  }
}))

vi.mock('../../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../../resources/db/migrations')
const fixturePath = resolve(testDir, '__fixtures__/models-dev-subset.json')
const T0 = Date.parse('2026-10-03T08:00:00.000Z')

let client: Client
let db: LibSQLDatabase<typeof schema>
let tempDir: string
let fixtureText: string

function ok(data: string, etag?: string) {
  return {
    status: 200,
    statusText: 'OK',
    headers: etag ? { etag } : {},
    data,
    url: 'https://models.dev/api.json',
    ok: true
  }
}

function notModified() {
  return {
    status: 304,
    statusText: 'Not Modified',
    headers: {},
    data: '',
    url: 'https://models.dev/api.json',
    ok: false
  }
}

async function readRow(key: string) {
  const rows = await db.select().from(systemConfig).where(eq(systemConfig.key, key))
  return rows[0] ?? null
}

/** Simulates a later process: drops memory and lets the next caller re-read storage. */
async function restartProcess(): Promise<void> {
  // Settle the previous "process"'s fire-and-forget marker write before forgetting it.
  await waitForPricingSinceMarkerForTest()
  resetPricingCatalogForTest()
}

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'tuff-pricing-catalog-'))
  client = createClient({ url: `file:${join(tempDir, 'pricing.sqlite')}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  fixtureText = await readFile(fixturePath, 'utf8')
}, 60_000)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  networkMocks.request.mockReset()
  resetPricingCatalogForTest()
  await db.delete(systemConfig)
})

afterEach(async () => {
  await waitForPricingSinceMarkerForTest()
  await dbWriteScheduler.drain()
  vi.useRealTimers()
})

afterAll(async () => {
  await dbWriteScheduler.drain()
  client?.close()
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

describe('compactModelsDevCatalog', () => {
  it('keeps provider order, base prices and limits, and drops everything else', () => {
    const catalog = compactModelsDevCatalog(fixture, { fetchedAt: T0, etag: 'W/"abc"' })
    expect(catalog).not.toBeNull()
    expect(Object.keys(catalog!.providers)).toEqual(Object.keys(fixture))
    expect(catalog!.providers.openai.api).toBeNull()
    expect(catalog!.providers['alibaba-cn'].api).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1'
    )
    expect(catalog!.providers.openai.models['gpt-4o']).toEqual({
      name: 'GPT-4o',
      input: 2.5,
      output: 10,
      cacheRead: 1.25,
      context: 128_000,
      outputLimit: 16_384,
      priced: true
    })
    expect(catalog!.providers.openai.models['gpt-image-1'].priced).toBe(false)
    expect(catalog!.providers['zhipuai-coding-plan'].models['glm-5.3-flash']).toMatchObject({
      input: 0,
      output: 0,
      priced: true
    })
    expect(catalog).toMatchObject({ checkedAt: T0, fetchedAt: T0, etag: 'W/"abc"' })
    expect(catalog!.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('hashes independently of key order and rejects payloads with no provider', () => {
    const reordered = Object.fromEntries(Object.entries(fixture).reverse())
    expect(compactModelsDevCatalog(reordered)!.sha256).toBe(
      compactModelsDevCatalog(fixture)!.sha256
    )
    expect(compactModelsDevCatalog(null)).toBeNull()
    expect(compactModelsDevCatalog([])).toBeNull()
    expect(compactModelsDevCatalog({ openai: { name: 'OpenAI' } })).toBeNull()
  })
})

describe('refreshPricingCatalog', () => {
  it('200: stores the compact catalog and serves it after a restart', async () => {
    networkMocks.request.mockResolvedValueOnce(ok(fixtureText, 'W/"v1"'))

    await expect(refreshPricingCatalog()).resolves.toBe('updated')

    const [options] = networkMocks.request.mock.calls[0]
    expect(options).toMatchObject({
      method: 'GET',
      url: 'https://models.dev/api.json',
      timeoutMs: 20_000,
      responseType: 'text',
      validateStatus: [200, 304]
    })
    expect(options.headers['If-None-Match']).toBeUndefined()

    const row = await readRow(PRICING_CATALOG_CONFIG_KEY)
    expect(row).not.toBeNull()
    const stored = JSON.parse(row!.value)
    expect(stored).toMatchObject({ version: 1, source: 'models.dev', etag: 'W/"v1"' })
    expect(stored.sha256).toBe(hashCatalogProviders(stored.providers))
    expect(getPricingCatalogStatus()).toEqual({ available: true, fetchedAt: T0, checkedAt: T0 })

    await restartProcess()
    expect(getPricingCatalogStatus().available).toBe(false)
    const loaded = await loadPricingCatalog()
    expect(loaded?.sha256).toBe(stored.sha256)
    expect(getPricingCatalogStatus()).toEqual({ available: true, fetchedAt: T0, checkedAt: T0 })
  })

  it('sends nothing while the catalog is younger than 24 hours', async () => {
    networkMocks.request.mockResolvedValueOnce(ok(fixtureText, 'W/"v1"'))
    await refreshPricingCatalog()
    await waitForPricingSinceMarkerForTest()

    vi.setSystemTime(T0 + PRICING_CATALOG_MAX_AGE_MS - 1)
    await expect(refreshPricingCatalog()).resolves.toBe('fresh')
    expect(networkMocks.request).toHaveBeenCalledTimes(1)
  })

  it('304: only moves checkedAt and leaves the stored catalog untouched', async () => {
    networkMocks.request.mockResolvedValueOnce(ok(fixtureText, 'W/"v1"'))
    await refreshPricingCatalog()
    await waitForPricingSinceMarkerForTest()
    const before = await readRow(PRICING_CATALOG_CONFIG_KEY)

    const later = T0 + PRICING_CATALOG_MAX_AGE_MS + 5_000
    vi.setSystemTime(later)
    networkMocks.request.mockResolvedValueOnce(notModified())
    await expect(refreshPricingCatalog()).resolves.toBe('not-modified')

    expect(networkMocks.request.mock.calls[1][0].headers['If-None-Match']).toBe('W/"v1"')
    const after = await readRow(PRICING_CATALOG_CONFIG_KEY)
    expect(after!.value).toBe(before!.value)
    expect(after!.updatedAt).toBe(later)
    expect(getPricingCatalogStatus()).toEqual({ available: true, fetchedAt: T0, checkedAt: later })

    // The touched column carries the check across a restart.
    await restartProcess()
    await loadPricingCatalog()
    expect(getPricingCatalogStatus()).toEqual({ available: true, fetchedAt: T0, checkedAt: later })
  })

  it('a failed request keeps the previous catalog and backs off', async () => {
    networkMocks.request.mockResolvedValueOnce(ok(fixtureText, 'W/"v1"'))
    await refreshPricingCatalog()
    await waitForPricingSinceMarkerForTest()
    const before = await readRow(PRICING_CATALOG_CONFIG_KEY)

    vi.setSystemTime(T0 + PRICING_CATALOG_MAX_AGE_MS + 1)
    networkMocks.request.mockRejectedValueOnce(
      new NetworkTransportError('net::ERR_CONNECTION_CLOSED')
    )
    await expect(refreshPricingCatalog()).resolves.toBe('failed')

    expect((await readRow(PRICING_CATALOG_CONFIG_KEY))!.value).toBe(before!.value)
    expect(getPricingCatalogStatus()).toEqual({ available: true, fetchedAt: T0, checkedAt: T0 })

    // No retry storm: the next scheduled or on-demand check waits; a forced one still goes out.
    await expect(refreshPricingCatalog()).resolves.toBe('backoff')
    expect(networkMocks.request).toHaveBeenCalledTimes(2)
    networkMocks.request.mockResolvedValueOnce(notModified())
    await expect(refreshPricingCatalog({ force: true })).resolves.toBe('not-modified')
  })

  it('rejects a payload that is not a models.dev catalog', async () => {
    networkMocks.request.mockResolvedValueOnce(ok('<html>captive portal</html>'))
    await expect(refreshPricingCatalog()).resolves.toBe('failed')
    expect(await readRow(PRICING_CATALOG_CONFIG_KEY)).toBeNull()
    expect(getPricingCatalogStatus().available).toBe(false)
  })

  it('shares one attempt between concurrent callers', async () => {
    let release!: (value: ReturnType<typeof ok>) => void
    networkMocks.request.mockReturnValueOnce(
      new Promise((resolvePromise) => {
        release = resolvePromise
      })
    )
    const first = refreshPricingCatalog()
    const second = refreshPricingCatalog()
    await vi.waitFor(() => expect(networkMocks.request).toHaveBeenCalledTimes(1))
    release(ok(fixtureText))
    await expect(Promise.all([first, second])).resolves.toEqual(['updated', 'updated'])
    expect(networkMocks.request).toHaveBeenCalledTimes(1)
  })
})

describe('offline with no catalog', () => {
  it('prices nothing and never waits for the network', async () => {
    networkMocks.request.mockRejectedValue(
      new NetworkTransportError('net::ERR_INTERNET_DISCONNECTED')
    )
    await expect(refreshPricingCatalog()).resolves.toBe('failed')

    expect(await loadPricingCatalog()).toBeNull()
    expect(getPricingCatalogStatus()).toEqual({
      available: false,
      fetchedAt: null,
      checkedAt: null
    })
    const pricing = resolveModelPricing({ providerId: 'openai', model: 'gpt-4o' })
    expect(pricing.status).toBe('unpriced')
    expect(
      estimateCostUsd({
        providerId: 'openai',
        model: 'gpt-4o',
        usage: { promptTokens: 1000, completionTokens: 1000 }
      })
    ).toBe(0)
  })
})

describe('stored catalog verification', () => {
  async function storeFixtureCatalog(): Promise<void> {
    networkMocks.request.mockResolvedValueOnce(ok(fixtureText, 'W/"v1"'))
    await refreshPricingCatalog()
    await restartProcess()
  }

  it('treats an edited catalog row as absent', async () => {
    await storeFixtureCatalog()
    const row = await readRow(PRICING_CATALOG_CONFIG_KEY)
    const tampered = JSON.parse(row!.value)
    tampered.providers.openai.models['gpt-4o'].input = 0.01
    await db
      .update(systemConfig)
      .set({ value: JSON.stringify(tampered) })
      .where(eq(systemConfig.key, PRICING_CATALOG_CONFIG_KEY))

    expect(await loadPricingCatalog()).toBeNull()
    expect(getPricingCatalogStatus().available).toBe(false)
  })

  it('treats an unparsable or misshapen row as absent', async () => {
    await storeFixtureCatalog()
    await db
      .update(systemConfig)
      .set({ value: '{"version":1,' })
      .where(eq(systemConfig.key, PRICING_CATALOG_CONFIG_KEY))
    expect(await loadPricingCatalog()).toBeNull()

    expect(verifyCompactCatalog({ version: 2 })).toBeNull()
    const valid = compactModelsDevCatalog(fixture)!
    expect(verifyCompactCatalog({ ...valid, providers: { openai: { name: 'x' } } })).toBeNull()
    expect(verifyCompactCatalog(JSON.parse(JSON.stringify(valid)))).not.toBeNull()
  })
})

describe('since marker', () => {
  it('is written when a usable catalog first arrives, and never moved', async () => {
    networkMocks.request.mockRejectedValueOnce(new NetworkTransportError('net::ERR_TIMED_OUT'))
    await refreshPricingCatalog()
    await waitForPricingSinceMarkerForTest()
    expect(await readPricingSinceMs()).toBeNull()

    const arrival = T0 + 90 * 60_000
    vi.setSystemTime(arrival)
    networkMocks.request.mockResolvedValueOnce(ok(fixtureText, 'W/"v1"'))
    await expect(refreshPricingCatalog({ force: true })).resolves.toBe('updated')
    await waitForPricingSinceMarkerForTest()
    expect(await readPricingSinceMs()).toBe(arrival)

    // A later process that loads the stored catalog keeps the original marker.
    vi.setSystemTime(arrival + 2 * PRICING_CATALOG_MAX_AGE_MS)
    await restartProcess()
    await loadPricingCatalog()
    await waitForPricingSinceMarkerForTest()
    expect(await readPricingSinceMs()).toBe(arrival)
    expect(JSON.parse((await readRow(PRICING_SINCE_CONFIG_KEY))!.value)).toEqual({
      sinceMs: arrival
    })
  })

  it('is written by the first successful load when only the catalog row exists', async () => {
    networkMocks.request.mockResolvedValueOnce(ok(fixtureText))
    await refreshPricingCatalog()
    await waitForPricingSinceMarkerForTest()
    await db.delete(systemConfig).where(eq(systemConfig.key, PRICING_SINCE_CONFIG_KEY))

    const loadedAt = T0 + 10_000
    vi.setSystemTime(loadedAt)
    await restartProcess()
    await loadPricingCatalog()
    await waitForPricingSinceMarkerForTest()
    expect(await readPricingSinceMs()).toBe(loadedAt)
  })
})

describe('refresh schedule', () => {
  it('waits at least 30 s, checks hourly on the maintenance lane, and unregisters', () => {
    const polling = PollingService.getInstance()
    const register = vi.spyOn(polling, 'register')
    try {
      startPricingCatalogSchedule()
      expect(register).toHaveBeenCalledTimes(1)
      const [taskId, , options] = register.mock.calls[0]
      expect(options).toMatchObject({
        interval: 60 * 60 * 1000,
        unit: 'milliseconds',
        lane: 'maintenance'
      })
      expect(options.initialDelayMs).toBeGreaterThanOrEqual(30_000)
      expect(polling.isRegistered(taskId)).toBe(true)

      stopPricingCatalogSchedule()
      expect(polling.isRegistered(taskId)).toBe(false)
    } finally {
      stopPricingCatalogSchedule()
      register.mockRestore()
    }
  })
})
