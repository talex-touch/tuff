/**
 * Global usage limits on a real migrated libSQL database, driven through the real SDK, audit logger
 * and quota manager: storage and restart (AC-C1), enforcement for every caller, cache hits, local
 * midnight, token / cost limits, exact concurrent admission and slot release (AC-C2), and the
 * `limits` field of `getUsageInsights` (AC-C5).
 */
import type { Client } from '@libsql/client'
import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceStreamChunk
} from '@talex-touch/tuff-intelligence'
import type { UsageLimits } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { UsageDelta } from './global-deltas'
import { createClient } from '@libsql/client'
import {
  IntelligenceCapabilityType,
  IntelligenceProviderType
} from '@talex-touch/tuff-intelligence'
import {
  DEFAULT_GLOBAL_CONFIG,
  INTELLIGENCE_HOME_SURFACE
} from '@talex-touch/utils/types/intelligence'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../db/schema'
import {
  intelligenceAuditLogs,
  intelligenceQuotas,
  intelligenceUsageStats
} from '../../../db/schema'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { getStorageMocks } from '../intelligence-test-harness'
import { intelligenceAuditLogger } from '../intelligence-audit-logger'
import { intelligenceCapabilityRegistry } from '../intelligence-capability-registry'
import { IntelligenceQuotaManager, intelligenceQuotaManager } from '../intelligence-quota-manager'
import { setIntelligenceProviderManager, TuffIntelligenceSDK } from '../intelligence-sdk'
import { createChatProvider, FakeProviderManager } from '../intelligence-test-harness'
import { GLOBAL_USAGE_CALLER_ID, GLOBAL_USAGE_CALLER_TYPE } from './constants'
import { emptyUsageDelta } from './global-deltas'
import { dayPeriod, localDayKey, localMonthKey, monthPeriod } from './local-period'
import { getUsageInsights } from './usage-insights'
import {
  emptyUsageLimits,
  getUsageLimits,
  onUsageLimitsChanged,
  setUsageLimits,
  USAGE_LIMIT_KEYS,
  USAGE_LIMIT_REACHED_CODE,
  usageLimitGate
} from './usage-limits'

const testDir = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(testDir, '../../../../../resources/db/migrations')
const originalTimeZone = process.env.TZ

let client: Client
let db: LibSQLDatabase<typeof schema>
let tempDir: string

vi.mock('../../database', () => ({
  databaseModule: {
    getDb: () => db
  }
}))

const CHANNEL_ID = 'custom-usage-limits'
const NONE: UsageLimits = emptyUsageLimits()
const ask = { messages: [{ role: 'user' as const, content: 'synthetic limits request' }] }
const home = { metadata: { surface: INTELLIGENCE_HOME_SURFACE } }

function chatResult(usage: [number, number], cost?: number): IntelligenceInvokeResult<string> {
  return {
    result: 'ok',
    usage: {
      promptTokens: usage[0],
      completionTokens: usage[1],
      totalTokens: usage[0] + usage[1],
      ...(cost === undefined ? {} : { cost })
    },
    model: 'gpt-4o-mini',
    latency: 12,
    traceId: `trace-limits-${Math.random().toString(16).slice(2)}`,
    provider: 'upstream-reported'
  }
}

function installChannel(
  options: {
    chat?: (payload: unknown, invokeOptions: IntelligenceInvokeOptions) => Promise<unknown>
    enableCache?: boolean
    enableQuota?: boolean
  } = {}
) {
  intelligenceCapabilityRegistry.clear()
  for (const capability of [
    { id: 'text.chat', type: IntelligenceCapabilityType.CHAT },
    { id: 'embedding.generate', type: IntelligenceCapabilityType.EMBEDDING }
  ]) {
    intelligenceCapabilityRegistry.register({
      ...capability,
      name: capability.id,
      description: 'usage limits integration',
      supportedProviders: [IntelligenceProviderType.CUSTOM]
    })
  }
  const chat = vi.fn(options.chat ?? (async () => chatResult([10, 5])))
  const provider = createChatProvider(
    {
      id: CHANNEL_ID,
      type: IntelligenceProviderType.CUSTOM,
      name: CHANNEL_ID,
      enabled: true,
      priority: 1,
      apiKey: 'sk-test-only',
      defaultModel: 'gpt-4o-mini',
      models: ['gpt-4o-mini'],
      capabilities: ['text.chat', 'embedding.generate']
    },
    chat as never
  )
  const embedding = vi.fn(async () => ({
    result: [0.1, 0.2],
    usage: { promptTokens: 4, completionTokens: 0, totalTokens: 4 },
    model: 'text-embedding-3-small',
    latency: 3,
    traceId: `trace-limits-embedding-${Math.random().toString(16).slice(2)}`,
    provider: 'custom'
  }))
  const chatStream = vi.fn(async function* (): AsyncGenerator<IntelligenceStreamChunk> {
    yield { delta: 'hel' } as IntelligenceStreamChunk
    yield {
      delta: 'lo',
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 }
    } as IntelligenceStreamChunk
  })
  Object.assign(provider, { embedding, chatStream })
  setIntelligenceProviderManager(new FakeProviderManager([provider]))
  const sdk = new TuffIntelligenceSDK({
    enableAudit: true,
    enableQuota: options.enableQuota ?? true,
    enableCache: options.enableCache ?? false,
    capabilities: {
      'text.chat': { providers: [{ providerId: CHANNEL_ID, priority: 1 }] },
      'embedding.generate': { providers: [{ providerId: CHANNEL_ID, priority: 1 }] }
    }
  })
  return { sdk, chat, embedding, chatStream }
}

/** Freezes `Date` at `iso`; every call in the test lands on that local day. */
function at(iso: string): number {
  vi.setSystemTime(new Date(iso))
  return Date.parse(iso)
}

async function storedGlobalRequests(now: number): Promise<number> {
  const [row] = await db
    .select({ requestCount: intelligenceUsageStats.requestCount })
    .from(intelligenceUsageStats)
    .where(
      and(
        eq(intelligenceUsageStats.callerId, GLOBAL_USAGE_CALLER_ID),
        eq(intelligenceUsageStats.period, dayPeriod(localDayKey(now)))
      )
    )
  return row?.requestCount ?? 0
}

async function detailRowsAt(now: number) {
  return db.select().from(intelligenceAuditLogs).where(eq(intelligenceAuditLogs.timestamp, now))
}

async function reservedRows() {
  return db
    .select()
    .from(intelligenceQuotas)
    .where(
      and(
        eq(intelligenceQuotas.callerId, GLOBAL_USAGE_CALLER_ID),
        eq(intelligenceQuotas.callerType, GLOBAL_USAGE_CALLER_TYPE)
      )
    )
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolvePromise = res
  })
  return { promise, resolve: resolvePromise }
}

beforeAll(async () => {
  process.env.TZ = 'Asia/Shanghai'
  tempDir = await mkdtemp(join(tmpdir(), 'tuff-usage-limits-'))
  client = createClient({ url: `file:${join(tempDir, 'limits.sqlite')}` })
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  // Stops the singleton's flush interval and backfill schedule: these tests flush explicitly.
  await intelligenceAuditLogger.destroy()
}, 60_000)

beforeEach(() => {
  process.env.TZ = 'Asia/Shanghai'
})

afterEach(async () => {
  await intelligenceAuditLogger.flushToDB()
  vi.useRealTimers()
  await setUsageLimits({})
})

afterAll(async () => {
  await intelligenceAuditLogger.flushToDB()
  await dbWriteScheduler.drain()
  intelligenceCapabilityRegistry.clear()
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
  client?.close()
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
}, 60_000)

describe('storage (AC-C1)', () => {
  it('reads back what was set, clears with null, and keeps it across a restart', async () => {
    const set = await setUsageLimits({ requestsPerDay: 3 })
    expect(set).toEqual({ ...NONE, requestsPerDay: 3 })
    expect(await getUsageLimits()).toEqual(set)
    // A restart: a fresh manager with a cold cache reads the reserved row.
    expect(await new IntelligenceQuotaManager().getGlobalLimits()).toEqual(set)
    const [row, ...extra] = await reservedRows()
    expect(extra).toHaveLength(0)
    expect(row).toMatchObject({
      enabled: true,
      requestsPerMinute: null,
      tokensPerMinute: null,
      requestsPerDay: 3,
      requestsPerMonth: null,
      tokensPerDay: null,
      tokensPerMonth: null,
      costLimitPerDay: null,
      costLimitPerMonth: null
    })

    // Full replace: the request limit is cleared by `null`, the others are new.
    const replaced = await setUsageLimits({
      requestsPerDay: null,
      tokensPerMonth: 5000,
      costUsdPerDay: 0.75
    })
    expect(replaced).toEqual({ ...NONE, tokensPerMonth: 5000, costUsdPerDay: 0.75 })
    expect(await getUsageLimits()).toEqual(replaced)
    expect(await new IntelligenceQuotaManager().getGlobalLimits()).toEqual(replaced)

    await setUsageLimits({})
    expect(await getUsageLimits()).toEqual(NONE)
    expect(await new IntelligenceQuotaManager().getGlobalLimits()).toEqual(NONE)
    expect(await reservedRows()).toHaveLength(1)
  })

  it('tells listeners what is stored after every change, and nothing for a rejected one', async () => {
    const seen: UsageLimits[] = []
    const off = onUsageLimitsChanged((limits) => seen.push(limits))
    try {
      await setUsageLimits({ requestsPerDay: 3 })
      await expect(setUsageLimits({ requestsPerDay: 0 })).rejects.toMatchObject({
        code: 'INVALID_REQUEST'
      })
      await setUsageLimits({})
    } finally {
      off()
    }
    expect(seen).toEqual([{ ...NONE, requestsPerDay: 3 }, NONE])
    // Unsubscribed: the next change is not heard.
    await setUsageLimits({ requestsPerDay: 2 })
    expect(seen).toHaveLength(2)
    await setUsageLimits({})
  })
  it('rejects invalid limits as INVALID_REQUEST without writing', async () => {
    await setUsageLimits({ requestsPerDay: 3 })

    await expect(setUsageLimits({ requestsPerDay: 0 })).rejects.toMatchObject({
      code: 'INVALID_REQUEST'
    })
    await expect(setUsageLimits({ requestsPerDay: 3, requestsPerWeek: 1 })).rejects.toMatchObject({
      code: 'INVALID_REQUEST'
    })
    await expect(setUsageLimits(null)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(await new IntelligenceQuotaManager().getGlobalLimits()).toEqual({
      ...NONE,
      requestsPerDay: 3
    })
  })

  it('keeps the reserved row out of the per-caller quota list', async () => {
    await intelligenceQuotaManager.setQuota({
      callerId: 'plugin:listed',
      callerType: 'plugin',
      requestsPerDay: 5,
      enabled: true
    })
    await setUsageLimits({ requestsPerMonth: 100 })

    const callers = (await intelligenceQuotaManager.getAllQuotas()).map((quota) => quota.callerId)
    expect(callers).toContain('plugin:listed')
    expect(callers).not.toContain(GLOBAL_USAGE_CALLER_ID)
    await intelligenceQuotaManager.deleteQuota('plugin:listed', 'plugin')
  })

  it('folds duplicate reserved rows into one when it writes', async () => {
    await db.insert(intelligenceQuotas).values([
      {
        callerId: GLOBAL_USAGE_CALLER_ID,
        callerType: GLOBAL_USAGE_CALLER_TYPE,
        requestsPerDay: 1,
        enabled: true
      },
      {
        callerId: GLOBAL_USAGE_CALLER_ID,
        callerType: GLOBAL_USAGE_CALLER_TYPE,
        requestsPerDay: 2,
        enabled: true
      }
    ])

    await setUsageLimits({ tokensPerDay: 10 })

    const rows = await reservedRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ tokensPerDay: 10, requestsPerDay: null, enabled: true })
  })

  it('stays consistent when the reserved row is written through the generic quota API', async () => {
    await setUsageLimits({ requestsPerDay: 3 })
    expect(await getUsageLimits()).toMatchObject({ requestsPerDay: 3 })

    await intelligenceQuotaManager.setQuota({
      callerId: GLOBAL_USAGE_CALLER_ID,
      callerType: GLOBAL_USAGE_CALLER_TYPE,
      requestsPerDay: 7,
      enabled: true
    })

    expect(await getUsageLimits()).toMatchObject({ requestsPerDay: 7 })
  })

  it('stays out of the synced configuration', async () => {
    const storage = getStorageMocks()
    storage.getMainConfig.mockClear()
    storage.saveMainConfig.mockClear()

    await setUsageLimits({ costUsdPerMonth: 3 })
    await getUsageLimits()

    // Neither read nor written through the storage layer that cloud sync pushes …
    expect(storage.getMainConfig).not.toHaveBeenCalled()
    expect(storage.saveMainConfig).not.toHaveBeenCalled()
    // … and absent from the synced `IntelligenceConfig` shape.
    for (const key of USAGE_LIMIT_KEYS) expect(DEFAULT_GLOBAL_CONFIG).not.toHaveProperty(key)
    expect(DEFAULT_GLOBAL_CONFIG).not.toHaveProperty('usageLimits')
    // Sync pushes the storage entries in `SYNC_STORAGE_KEYS`; no database table is one of them.
    const syncSource = await readFile(resolve(testDir, '../../sync/index.ts'), 'utf8')
    const syncKeys = /const SYNC_STORAGE_KEYS = \[([^\]]*)\]/.exec(syncSource)?.[1]
    expect(syncKeys).toContain('StorageList.IntelligenceConfig')
    expect(syncKeys).not.toMatch(/quota|usage|limit/i)
  })
})

describe('enforcement through the SDK (AC-C2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  it('refuses the fourth call of the day for every caller, Home and file embedding included', async () => {
    const now = at('2026-10-05T02:00:00.000Z')
    await setUsageLimits({ requestsPerDay: 3 })
    const { sdk, chat, embedding } = installChannel()

    await sdk.invoke('text.chat', ask, home)
    await sdk.invoke(
      'embedding.generate',
      { text: 'file body' },
      { metadata: { caller: 'core.files.embedding' } }
    )
    await sdk.invoke('text.chat', ask, { metadata: { caller: 'plugin:limits' } })

    const refusedHome = sdk.invoke('text.chat', ask, home)
    await expect(refusedHome).rejects.toMatchObject({
      code: USAGE_LIMIT_REACHED_CODE,
      usageLimit: {
        key: 'requestsPerDay',
        used: 3,
        max: 3,
        // Local midnight in Asia/Shanghai.
        resetsAt: Date.parse('2026-10-05T16:00:00.000Z')
      }
    })
    await expect(refusedHome).rejects.toThrow(
      '[USAGE_LIMIT_REACHED:text.chat] Usage limit reached: requestsPerDay; resets at 2026-10-05T16:00:00.000Z'
    )
    await expect(
      sdk.invoke(
        'embedding.generate',
        { text: 'next file' },
        { metadata: { caller: 'core.files.embedding' } }
      )
    ).rejects.toMatchObject({ code: USAGE_LIMIT_REACHED_CODE })
    expect(chat).toHaveBeenCalledTimes(2)
    expect(embedding).toHaveBeenCalledTimes(1)

    // Refused calls are neither audited nor counted.
    await intelligenceAuditLogger.flushToDB()
    expect(await storedGlobalRequests(now)).toBe(3)
    expect(await detailRowsAt(now)).toHaveLength(3)
    expect(usageLimitGate.inflightRequests(dayPeriod(localDayKey(now)))).toBe(0)
  })

  it('serves a cache hit without refusing or counting it', async () => {
    const now = at('2026-10-06T02:00:00.000Z')
    await setUsageLimits({ requestsPerDay: 1 })
    const { sdk, chat } = installChannel({ enableCache: true })
    const cachedAsk = { messages: [{ role: 'user' as const, content: 'cached question' }] }

    await sdk.invoke('text.chat', cachedAsk)
    // At the limit: the cached answer is still served …
    await expect(sdk.invoke('text.chat', cachedAsk)).resolves.toMatchObject({ result: 'ok' })
    // … and a new question is refused.
    await expect(
      sdk.invoke('text.chat', { messages: [{ role: 'user' as const, content: 'new question' }] })
    ).rejects.toMatchObject({ code: USAGE_LIMIT_REACHED_CODE })
    expect(chat).toHaveBeenCalledTimes(1)

    await intelligenceAuditLogger.flushToDB()
    expect(await storedGlobalRequests(now)).toBe(1)
  })

  it('lets calls through again after local midnight', async () => {
    at('2026-10-07T15:59:00.000Z') // 23:59 on 2026-10-07 in Shanghai
    await setUsageLimits({ requestsPerDay: 1 })
    const { sdk } = installChannel()

    await sdk.invoke('text.chat', ask)
    await expect(sdk.invoke('text.chat', ask)).rejects.toMatchObject({
      code: USAGE_LIMIT_REACHED_CODE,
      usageLimit: { resetsAt: Date.parse('2026-10-07T16:00:00.000Z') }
    })

    at('2026-10-07T16:01:00.000Z') // 00:01 on 2026-10-08
    await expect(sdk.invoke('text.chat', ask)).resolves.toMatchObject({ result: 'ok' })
  })

  it("refuses once the day's tokens are used up", async () => {
    at('2026-10-09T02:00:00.000Z')
    await setUsageLimits({ tokensPerDay: 30 })
    const { sdk } = installChannel({ chat: async () => chatResult([10, 5]) })

    await sdk.invoke('text.chat', ask)
    await sdk.invoke('text.chat', ask)
    await expect(sdk.invoke('text.chat', ask)).rejects.toMatchObject({
      code: USAGE_LIMIT_REACHED_CODE,
      usageLimit: { key: 'tokensPerDay', used: 30, max: 30 }
    })
  })

  it("refuses once the day's estimated cost is used up", async () => {
    at('2026-10-10T02:00:00.000Z')
    await setUsageLimits({ costUsdPerDay: 0.05 })
    // Provider-reported cost (as a local CLI reports it) counts the moment the call is logged.
    const { sdk } = installChannel({ chat: async () => chatResult([10, 5], 0.02) })

    await sdk.invoke('text.chat', ask)
    await sdk.invoke('text.chat', ask)
    await sdk.invoke('text.chat', ask)
    await expect(sdk.invoke('text.chat', ask)).rejects.toMatchObject({
      code: USAGE_LIMIT_REACHED_CODE,
      usageLimit: { key: 'costUsdPerDay', used: 0.06, max: 0.05 }
    })
  })

  it('admits exactly one of five concurrent calls when one slot is left', async () => {
    const now = at('2026-10-11T02:00:00.000Z')
    await setUsageLimits({ requestsPerDay: 3 })
    const { sdk, chat } = installChannel()
    await sdk.invoke('text.chat', ask)
    await sdk.invoke('text.chat', ask)

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) =>
        sdk.invoke('text.chat', {
          messages: [{ role: 'user' as const, content: `burst ${index}` }]
        })
      )
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const refused = results.filter((result) => result.status === 'rejected')
    expect(refused).toHaveLength(4)
    for (const result of refused) {
      expect((result as PromiseRejectedResult).reason).toMatchObject({
        code: USAGE_LIMIT_REACHED_CODE
      })
    }
    expect(chat).toHaveBeenCalledTimes(3)
    await intelligenceAuditLogger.flushToDB()
    expect(await storedGlobalRequests(now)).toBe(3)
    expect(usageLimitGate.inflightRequests(dayPeriod(localDayKey(now)))).toBe(0)
  })

  it('frees the slot on provider failure, cancellation and an abandoned stream', async () => {
    const now = at('2026-10-12T02:00:00.000Z')
    const day = dayPeriod(localDayKey(now))
    await setUsageLimits({ requestsPerDay: 10 })
    const { sdk, chat } = installChannel()

    // Provider failure: written as a failure audit, so it counts.
    chat.mockRejectedValueOnce(new Error('upstream refused'))
    await expect(sdk.invoke('text.chat', ask)).rejects.toThrow('upstream refused')
    expect(usageLimitGate.inflightRequests(day)).toBe(0)

    // Cancelled mid-provider: never audited, never counted.
    const late = deferred<IntelligenceInvokeResult<string>>()
    chat.mockImplementationOnce(() => late.promise)
    const controller = new AbortController()
    const cancelled = sdk.invoke('text.chat', ask, { signal: controller.signal })
    await vi.waitFor(() => expect(usageLimitGate.inflightRequests(day)).toBe(1))
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ code: 'INTELLIGENCE_OPERATION_CANCELLED' })
    expect(usageLimitGate.inflightRequests(day)).toBe(0)
    late.resolve(chatResult([1, 1]))

    // A stream the consumer walks away from after `start`.
    const stream = sdk.stream('text.chat', ask)
    await expect(stream.next()).resolves.toMatchObject({ value: { type: 'start' } })
    expect(usageLimitGate.inflightRequests(day)).toBe(1)
    await stream.return(undefined)
    expect(usageLimitGate.inflightRequests(day)).toBe(0)

    // A completed stream hands its slot to the logged entry.
    const events: string[] = []
    for await (const event of sdk.stream('text.chat', ask)) events.push(event.type)
    expect(events).toContain('end')
    expect(usageLimitGate.inflightRequests(day)).toBe(0)

    await intelligenceAuditLogger.flushToDB()
    // The failure and the completed stream; not the cancelled call or the abandoned stream.
    expect(await storedGlobalRequests(now)).toBe(2)
  })

  it('refuses a Home stream before it starts', async () => {
    at('2026-10-13T02:00:00.000Z')
    await setUsageLimits({ requestsPerDay: 1 })
    const { sdk, chatStream } = installChannel()
    await sdk.invoke('text.chat', ask, home)

    const stream = sdk.stream('text.chat', ask, home)
    await expect(stream.next()).rejects.toMatchObject({ code: USAGE_LIMIT_REACHED_CODE })
    expect(chatStream).not.toHaveBeenCalled()
  })

  it('does nothing while quota enforcement is switched off', async () => {
    at('2026-10-14T02:00:00.000Z')
    await setUsageLimits({ requestsPerDay: 1 })
    const { sdk, chat } = installChannel({ enableQuota: false })

    await sdk.invoke('text.chat', ask)
    await expect(sdk.invoke('text.chat', ask)).resolves.toMatchObject({ result: 'ok' })
    expect(chat).toHaveBeenCalledTimes(2)
  })
})

describe('getUsageInsights().limits (AC-C5)', () => {
  it('reports ok / warn / reached at 79 / 80 / 100 % with local reset times', async () => {
    await setUsageLimits({ requestsPerDay: 100, tokensPerMonth: 1000 })
    const now = Date.parse('2026-10-20T04:00:00.000Z') // 12:00 in Shanghai
    const day = dayPeriod(localDayKey(now))
    const month = monthPeriod(localMonthKey(now))

    for (const [requests, state] of [
      [79, 'ok'],
      [80, 'warn'],
      [100, 'reached']
    ] as const) {
      const usage = (period: string): UsageDelta => ({
        ...emptyUsageDelta(),
        ...(period === day ? { requestCount: requests } : {}),
        ...(period === month ? { requestCount: 500, totalTokens: 800 } : {})
      })
      const insights = await getUsageInsights(
        { range: 'today' },
        {
          now,
          readGlobalUsage: async (periods) =>
            new Map(periods.map((period) => [period, usage(period)])),
          auditEnabled: () => true,
          readAuditRetentionMs: async () => null,
          onPricingStale: () => undefined
        }
      )

      expect(insights.limits).toEqual({
        limits: { ...NONE, requestsPerDay: 100, tokensPerMonth: 1000 },
        items: [
          {
            key: 'requestsPerDay',
            period: 'day',
            metric: 'requests',
            max: 100,
            used: requests,
            ratio: requests / 100,
            state,
            resetsAt: Date.parse('2026-10-20T16:00:00.000Z')
          },
          {
            key: 'tokensPerMonth',
            period: 'month',
            metric: 'tokens',
            max: 1000,
            used: 800,
            ratio: 0.8,
            state: 'warn',
            resetsAt: Date.parse('2026-10-31T16:00:00.000Z')
          }
        ]
      })
    }
  })

  it('is empty while no limit is set', async () => {
    await setUsageLimits({})
    const insights = await getUsageInsights(
      { range: 'today' },
      {
        now: Date.parse('2026-10-20T04:00:00.000Z'),
        readGlobalUsage: async (periods) =>
          new Map(periods.map((period) => [period, emptyUsageDelta()])),
        auditEnabled: () => true,
        readAuditRetentionMs: async () => null,
        onPricingStale: () => undefined
      }
    )
    expect(insights.limits).toEqual({ limits: NONE, items: [] })
  })
})
