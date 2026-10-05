/**
 * Global usage limits, unit level (usage-limits task C2–C3, C6): input validation, the refusal and
 * its message contract, status items at 79 / 80 / 100 %, and the gate's in-flight accounting —
 * exact request limits under concurrency and no slot leaked by release, abort or a raced read.
 * The SDK wiring and the real database are covered by `usage-limits.integration.test.ts`.
 */
import type { UsageLimits } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import type { UsageDelta } from './global-deltas'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyUsageDelta } from './global-deltas'
import { dayPeriod, localDayKey, localMonthKey, monthPeriod } from './local-period'
import {
  buildUsageLimitsStatus,
  createUsageLimitError,
  emptyUsageLimits,
  evaluateUsageLimits,
  NO_USAGE_ADMISSION,
  normalizeUsageLimitsInput,
  readUsageLimitInfo,
  USAGE_LIMIT_REACHED_CODE,
  UsageLimitGate
} from './usage-limits'

const originalTimeZone = process.env.TZ

beforeEach(() => {
  process.env.TZ = 'Asia/Shanghai'
})

afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
})

/** 2026-10-03 10:00 in Asia/Shanghai. */
const NOW = Date.parse('2026-10-03T02:00:00.000Z')
const NEXT_LOCAL_DAY = Date.parse('2026-10-03T16:00:00.000Z')
const NEXT_LOCAL_MONTH = Date.parse('2026-10-31T16:00:00.000Z')

function limits(overrides: Partial<UsageLimits>): UsageLimits {
  return { ...emptyUsageLimits(), ...overrides }
}

function delta(overrides: Partial<UsageDelta>): UsageDelta {
  return { ...emptyUsageDelta(), ...overrides }
}

function periodsAt(now: number) {
  return { day: dayPeriod(localDayKey(now)), month: monthPeriod(localMonthKey(now)) }
}

/** A usage reader over a mutable day / month pair, keyed the way the ledger keys them. */
function usageReader(
  now: number,
  usage: { day?: Partial<UsageDelta>; month?: Partial<UsageDelta> }
) {
  const periods = periodsAt(now)
  return vi.fn(async (requested: readonly string[]) => {
    const result = new Map<string, UsageDelta>()
    for (const period of requested) {
      if (period === periods.day) result.set(period, delta(usage.day ?? {}))
      else if (period === periods.month) result.set(period, delta(usage.month ?? {}))
      else result.set(period, emptyUsageDelta())
    }
    return result
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('normalizeUsageLimitsInput (C2)', () => {
  it('replaces the whole set: missing keys and null mean no limit', () => {
    expect(normalizeUsageLimitsInput({ requestsPerDay: 3, costUsdPerMonth: 1.5 })).toEqual({
      requestsPerDay: 3,
      requestsPerMonth: null,
      tokensPerDay: null,
      tokensPerMonth: null,
      costUsdPerDay: null,
      costUsdPerMonth: 1.5
    })
    expect(normalizeUsageLimitsInput({ requestsPerDay: null })).toEqual(emptyUsageLimits())
    expect(normalizeUsageLimitsInput({})).toEqual(emptyUsageLimits())
  })

  it.each([
    ['a non-object', null],
    ['an array', [3]],
    ['a string', 'requestsPerDay=3'],
    ['an unknown key', { requestsPerDay: 3, requestsPerWeek: 10 }],
    ['zero requests', { requestsPerDay: 0 }],
    ['negative tokens', { tokensPerMonth: -1 }],
    ['a fraction of a request', { requestsPerMonth: 2.5 }],
    ['fractional tokens', { tokensPerDay: 0.5 }],
    ['a numeric string', { requestsPerDay: '3' }],
    ['zero cost', { costUsdPerDay: 0 }],
    ['an infinite cost', { costUsdPerDay: Number.POSITIVE_INFINITY }],
    ['a NaN cost', { costUsdPerMonth: Number.NaN }],
    ['an unsafe integer', { tokensPerMonth: Number.MAX_SAFE_INTEGER + 2 }]
  ])('rejects %s as INVALID_REQUEST', (_label, input) => {
    expect(() => normalizeUsageLimitsInput(input)).toThrow(
      expect.objectContaining({ code: 'INVALID_REQUEST', message: 'INVALID_REQUEST' })
    )
  })

  it('accepts a fractional cost', () => {
    expect(normalizeUsageLimitsInput({ costUsdPerDay: 0.05 }).costUsdPerDay).toBe(0.05)
  })
})

describe('the refusal (C4)', () => {
  it('names the limit and the reset time, and carries the structured limit', () => {
    const error = createUsageLimitError('text.chat', {
      key: 'requestsPerDay',
      used: 3,
      max: 3,
      resetsAt: NEXT_LOCAL_DAY
    })

    expect(error.code).toBe(USAGE_LIMIT_REACHED_CODE)
    expect(error.message).toBe(
      '[USAGE_LIMIT_REACHED:text.chat] Usage limit reached: requestsPerDay; resets at 2026-10-03T16:00:00.000Z'
    )
    expect(error.usageLimit).toEqual({
      key: 'requestsPerDay',
      used: 3,
      max: 3,
      resetsAt: NEXT_LOCAL_DAY
    })
  })

  it('never reads as a quota, credit or provider throttle to substring classifiers', () => {
    for (const key of ['requestsPerMonth', 'tokensPerDay', 'costUsdPerMonth'] as const) {
      const message = createUsageLimitError('embedding.generate', {
        key,
        used: 1,
        max: 1,
        resetsAt: NEXT_LOCAL_MONTH
      }).message
      // main normalizer / touch-intelligence plugin (lower case) …
      expect(message.toLowerCase()).not.toMatch(
        /quota exceeded|quota exhausted|rate limit|too many requests|quota|credit/
      )
      // … and the renderer classifiers (upper-case `includes`).
      expect(message.toUpperCase()).not.toMatch(/QUOTA|CREDIT|RATE_?LIMIT|TOO_?MANY/)
    }
  })

  it('reads the limit back from the error or down its cause chain, nothing else', () => {
    const info = { key: 'tokensPerDay' as const, used: 120, max: 100, resetsAt: NEXT_LOCAL_DAY }
    const error = createUsageLimitError('text.chat', info)
    const wrapped = Object.assign(new Error('[USAGE_LIMIT_REACHED:text.chat] wrapped'), {
      code: 'USAGE_LIMIT_REACHED',
      cause: error
    })

    expect(readUsageLimitInfo(error)).toEqual(info)
    expect(readUsageLimitInfo(wrapped)).toEqual(info)
    expect(readUsageLimitInfo(new Error('Usage limit reached'))).toBeNull()
    expect(
      readUsageLimitInfo(
        Object.assign(new Error('x'), {
          code: 'USAGE_LIMIT_REACHED',
          usageLimit: { key: 'requestsPerWeek', used: 1, max: 1, resetsAt: 1 }
        })
      )
    ).toBeNull()
  })
})

describe('status items (C6)', () => {
  it.each([
    ['79 %', 79, 'ok'],
    ['80 %', 80, 'warn'],
    ['100 %', 100, 'reached'],
    ['over the limit', 130, 'reached']
  ] as const)('requests at %s (%i of 100) are %s', (_label, used, state) => {
    const [item] = evaluateUsageLimits(
      limits({ requestsPerDay: 100 }),
      { day: delta({ requestCount: used }), month: undefined },
      NOW
    )
    expect(item).toEqual({
      key: 'requestsPerDay',
      period: 'day',
      metric: 'requests',
      max: 100,
      used,
      ratio: used / 100,
      state,
      resetsAt: NEXT_LOCAL_DAY
    })
  })

  it('measures tokens and estimated cost the same way, with local month boundaries', () => {
    const items = evaluateUsageLimits(
      limits({ tokensPerMonth: 1000, costUsdPerMonth: 1, costUsdPerDay: 0.5 }),
      {
        day: delta({ totalCost: 0.395 }),
        month: delta({ totalTokens: 800, totalCost: 0.1 + 0.7 })
      },
      NOW
    )

    expect(items.map((item) => [item.key, item.used, item.state, item.resetsAt])).toEqual([
      ['tokensPerMonth', 800, 'warn', NEXT_LOCAL_MONTH],
      // 0.1 + 0.7 is 0.7999999999999999 in floating point; the ledger's 6-decimal rounding and
      // the warn epsilon keep it at exactly 80 %.
      ['costUsdPerDay', 0.395, 'ok', NEXT_LOCAL_DAY],
      ['costUsdPerMonth', 0.8, 'warn', NEXT_LOCAL_MONTH]
    ])
  })

  it('buildUsageLimitsStatus reports configured limits only, from settled usage', async () => {
    const readGlobalUsage = usageReader(NOW, {
      day: { requestCount: 2 },
      month: { requestCount: 9, totalTokens: 400 }
    })

    await expect(
      buildUsageLimitsStatus(NOW, {
        readLimits: async () => emptyUsageLimits(),
        readGlobalUsage
      })
    ).resolves.toEqual({ limits: emptyUsageLimits(), items: [] })
    expect(readGlobalUsage).not.toHaveBeenCalled()

    const status = await buildUsageLimitsStatus(NOW, {
      readLimits: async () => limits({ requestsPerDay: 2, tokensPerMonth: 500 }),
      readGlobalUsage
    })
    expect(status.limits).toEqual(limits({ requestsPerDay: 2, tokensPerMonth: 500 }))
    expect(status.items.map((item) => [item.key, item.used, item.state])).toEqual([
      ['requestsPerDay', 2, 'reached'],
      ['tokensPerMonth', 400, 'warn']
    ])
    expect(readGlobalUsage).toHaveBeenCalledWith([periodsAt(NOW).day, periodsAt(NOW).month])
  })
})

describe('UsageLimitGate (C3)', () => {
  function gate(options: {
    limits: UsageLimits
    usage?: { day?: Partial<UsageDelta>; month?: Partial<UsageDelta> }
    now?: number
  }) {
    const now = options.now ?? NOW
    const readGlobalUsage = usageReader(now, options.usage ?? {})
    const readLimits = vi.fn(async () => options.limits)
    return {
      readGlobalUsage,
      readLimits,
      gate: new UsageLimitGate({ readLimits, readGlobalUsage, now: () => now })
    }
  }

  it('costs nothing while no limit is set', async () => {
    const { gate: subject, readGlobalUsage } = gate({ limits: emptyUsageLimits() })

    await expect(subject.admit({ capabilityId: 'text.chat' })).resolves.toBe(NO_USAGE_ADMISSION)
    expect(readGlobalUsage).not.toHaveBeenCalled()
  })

  it('holds one request slot per admitted call until it is released, exactly once', async () => {
    const { gate: subject } = gate({
      limits: limits({ requestsPerDay: 3 }),
      usage: { day: { requestCount: 1 } }
    })
    const { day, month } = periodsAt(NOW)

    const first = await subject.admit({ capabilityId: 'text.chat' })
    expect(subject.inflightRequests(day)).toBe(1)
    expect(subject.inflightRequests(month)).toBe(1)
    const second = await subject.admit({ capabilityId: 'text.chat' })
    expect(subject.inflightRequests(day)).toBe(2)

    // 1 settled + 2 in flight = 3: the third is refused.
    await expect(subject.admit({ capabilityId: 'text.chat' })).rejects.toMatchObject({
      code: USAGE_LIMIT_REACHED_CODE,
      usageLimit: { key: 'requestsPerDay', used: 3, max: 3, resetsAt: NEXT_LOCAL_DAY }
    })
    expect(subject.inflightRequests(day)).toBe(2)

    first.release()
    first.release()
    expect(subject.inflightRequests(day)).toBe(1)
    second.release()
    expect(subject.inflightRequests(day)).toBe(0)
    expect(subject.inflightRequests(month)).toBe(0)
  })

  it('admits exactly one of five concurrent calls when one slot is left', async () => {
    const pendingReads: Array<ReturnType<typeof deferred<Map<string, UsageDelta>>>> = []
    const { day, month } = periodsAt(NOW)
    const subject = new UsageLimitGate({
      readLimits: async () => limits({ requestsPerDay: 3 }),
      readGlobalUsage: () => {
        const read = deferred<Map<string, UsageDelta>>()
        pendingReads.push(read)
        return read.promise
      },
      now: () => NOW
    })

    const attempts = Array.from({ length: 5 }, () =>
      subject.admit({ capabilityId: 'text.chat' }).then(
        (admission) => ({ admission }),
        (error: unknown) => ({ error })
      )
    )
    await vi.waitFor(() => expect(pendingReads).toHaveLength(5))
    // Every read saw the same two settled requests; resolve them out of order.
    for (const index of [3, 0, 4, 1, 2]) {
      pendingReads[index]!.resolve(
        new Map([
          [day, delta({ requestCount: 2 })],
          [month, delta({ requestCount: 2 })]
        ])
      )
    }
    const outcomes = await Promise.all(attempts)

    const admitted = outcomes.filter((outcome) => 'admission' in outcome)
    const refused = outcomes.filter((outcome) => 'error' in outcome)
    expect(admitted).toHaveLength(1)
    expect(refused).toHaveLength(4)
    for (const outcome of refused) {
      expect((outcome as { error: unknown }).error).toMatchObject({ code: 'USAGE_LIMIT_REACHED' })
    }
    expect(subject.inflightRequests(day)).toBe(1)
  })

  it('reads again when a release races the read', async () => {
    const { day, month } = periodsAt(NOW)
    let settled = 1
    let releaseDuringRead: (() => void) | null = null
    const reads: number[] = []
    const subject = new UsageLimitGate({
      readLimits: async () => limits({ requestsPerDay: 3 }),
      readGlobalUsage: async () => {
        reads.push(settled)
        const snapshot = settled
        // The in-flight call is logged (joins the pending usage, frees its slot) after this read
        // took its snapshot: the snapshot misses it and the slot is gone.
        if (releaseDuringRead) {
          const release = releaseDuringRead
          releaseDuringRead = null
          settled += 1
          release()
        }
        return new Map([
          [day, delta({ requestCount: snapshot })],
          [month, delta({ requestCount: snapshot })]
        ])
      },
      now: () => NOW
    })

    const inFlight = await subject.admit({ capabilityId: 'text.chat' })
    releaseDuringRead = () => inFlight.release()
    // The first snapshot (1 settled, 0 in flight) is stale; the repeated read sees 2 settled.
    const admitted = await subject.admit({ capabilityId: 'text.chat' })
    expect(reads).toEqual([1, 1, 2])
    expect(subject.inflightRequests(day)).toBe(1)
    admitted.release()
    expect(subject.inflightRequests(day)).toBe(0)
  })

  it('counts releases that race every read as still in flight, never under-counting', async () => {
    const { day, month } = periodsAt(NOW)
    let settled = 0
    const slots: Array<{ release: () => void }> = []
    let racing = false
    const subject = new UsageLimitGate({
      readLimits: async () => limits({ requestsPerDay: 4 }),
      readGlobalUsage: async () => {
        const snapshot = settled
        // Every read is overtaken by one more in-flight call being logged after its snapshot.
        if (racing) {
          settled += 1
          slots.shift()?.release()
        }
        return new Map([
          [day, delta({ requestCount: snapshot })],
          [month, delta({ requestCount: snapshot })]
        ])
      },
      now: () => NOW
    })
    for (let index = 0; index < 4; index += 1) {
      slots.push(await subject.admit({ capabilityId: 'text.chat' }))
    }
    expect(subject.inflightRequests(day)).toBe(4)

    racing = true
    // Four reads, four races: the last snapshot holds 3, the slots are all free, and the fourth
    // call — settled after the snapshot — would be lost without counting the raced release.
    // True usage is 4 of 4.
    await expect(subject.admit({ capabilityId: 'text.chat' })).rejects.toMatchObject({
      code: USAGE_LIMIT_REACHED_CODE,
      usageLimit: { key: 'requestsPerDay', used: 4, max: 4 }
    })
    expect(settled).toBe(4)
    expect(subject.inflightRequests(day)).toBe(0)
  })

  it('refuses outer agent / workflow calls once reached, without ever giving them a slot', async () => {
    const open = gate({
      limits: limits({ requestsPerDay: 3 }),
      usage: { day: { requestCount: 1 } }
    })
    await expect(open.gate.admit({ capabilityId: 'agent.run' })).resolves.toBe(NO_USAGE_ADMISSION)
    expect(open.gate.inflightRequests(periodsAt(NOW).day)).toBe(0)

    const reached = gate({
      limits: limits({ requestsPerDay: 3 }),
      usage: { day: { requestCount: 3 } }
    })
    await expect(reached.gate.admit({ capabilityId: 'workflow.execute' })).rejects.toMatchObject({
      code: USAGE_LIMIT_REACHED_CODE
    })
  })

  it('takes no slot when only token or cost limits are set, and refuses once they are used up', async () => {
    const open = gate({
      limits: limits({ tokensPerDay: 100 }),
      usage: { day: { totalTokens: 99 } }
    })
    await expect(open.gate.admit({ capabilityId: 'text.chat' })).resolves.toBe(NO_USAGE_ADMISSION)

    const tokens = gate({
      limits: limits({ tokensPerDay: 100 }),
      usage: { day: { totalTokens: 100 } }
    })
    await expect(tokens.gate.admit({ capabilityId: 'text.chat' })).rejects.toMatchObject({
      usageLimit: { key: 'tokensPerDay', used: 100, max: 100 }
    })

    const cost = gate({
      limits: limits({ costUsdPerDay: 0.5 }),
      usage: { day: { totalCost: 0.5 } }
    })
    await expect(cost.gate.admit({ capabilityId: 'text.chat' })).rejects.toMatchObject({
      usageLimit: { key: 'costUsdPerDay', used: 0.5, max: 0.5, resetsAt: NEXT_LOCAL_DAY }
    })
  })

  it('reports the reached limit that resets last', async () => {
    const { gate: subject } = gate({
      limits: limits({ requestsPerDay: 2, requestsPerMonth: 10 }),
      usage: { day: { requestCount: 2 }, month: { requestCount: 10 } }
    })

    await expect(subject.admit({ capabilityId: 'text.chat' })).rejects.toMatchObject({
      usageLimit: { key: 'requestsPerMonth', used: 10, max: 10, resetsAt: NEXT_LOCAL_MONTH }
    })
  })

  it('binds against the local day: a new local day starts from zero', async () => {
    // 23:59 local on 2026-10-03, then 00:01 local on 2026-10-04.
    const beforeMidnight = Date.parse('2026-10-03T15:59:00.000Z')
    const afterMidnight = Date.parse('2026-10-03T16:01:00.000Z')
    let now = beforeMidnight
    const subject = new UsageLimitGate({
      readLimits: async () => limits({ requestsPerDay: 3 }),
      readGlobalUsage: async (periods) =>
        new Map(
          periods.map((period) => [
            period,
            delta({ requestCount: period === 'day:2026-10-03' ? 3 : 0 })
          ])
        ),
      now: () => now
    })

    await expect(subject.admit({ capabilityId: 'text.chat' })).rejects.toMatchObject({
      usageLimit: { resetsAt: NEXT_LOCAL_DAY }
    })
    now = afterMidnight
    const admission = await subject.admit({ capabilityId: 'text.chat' })
    expect(subject.inflightRequests('day:2026-10-04')).toBe(1)
    admission.release()
  })

  it('treats unreadable limits as unset, but fails closed when usage cannot be read', async () => {
    const readGlobalUsage = vi.fn(async () => new Map<string, UsageDelta>())
    const unreadable = new UsageLimitGate({
      readLimits: async () => {
        throw new Error('Database not initialized')
      },
      readGlobalUsage,
      now: () => NOW
    })
    await expect(unreadable.admit({ capabilityId: 'text.chat' })).resolves.toBe(NO_USAGE_ADMISSION)
    expect(readGlobalUsage).not.toHaveBeenCalled()

    const blind = new UsageLimitGate({
      readLimits: async () => limits({ requestsPerDay: 3 }),
      readGlobalUsage: async () => {
        throw new Error('SQLITE_IOERR')
      },
      now: () => NOW
    })
    await expect(blind.admit({ capabilityId: 'text.chat' })).rejects.toMatchObject({
      code: 'QUOTA_CHECK_UNAVAILABLE'
    })
    expect(blind.inflightRequests(periodsAt(NOW).day)).toBe(0)
  })

  it('takes no slot for a call aborted while its usage was read', async () => {
    const controller = new AbortController()
    const subject = new UsageLimitGate({
      readLimits: async () => limits({ requestsPerDay: 3 }),
      readGlobalUsage: async () => {
        controller.abort()
        return new Map<string, UsageDelta>()
      },
      now: () => NOW
    })

    await expect(
      subject.admit({ capabilityId: 'text.chat', signal: controller.signal })
    ).resolves.toBe(NO_USAGE_ADMISSION)
    expect(subject.inflightRequests(periodsAt(NOW).day)).toBe(0)
  })
})
