import { describe, expect, it } from 'vitest'
import {
  makeCreditPricingEvent,
  MockCreditPricingD1Database,
  type CreditPricingRow,
} from '../../test/helpers/credit-pricing-test-utils'
import { countTranscriptUnits } from './asrTranscriptionStore'
import type { CreditPricingRule } from './creditPricingStore'
import {
  computeCreditCharge,
  computeCreditReservation,
  DEFAULT_CREDIT_PRICING,
  listCreditPricing,
  resolveCreditPricingEntry,
  resolveSellableCreditPricingRule,
  selectCreditPricingRule,
} from './creditPricingStore'

/** Sells images at 7 credits each unless a case says otherwise. */
function pricingRule(overrides: Partial<CreditPricingRule> = {}): CreditPricingRule {
  return {
    capability: 'test.capability',
    unit: 'image',
    creditsPerUnit: 7,
    secondaryUnit: null,
    secondaryCreditsPerUnit: null,
    minCredits: 1,
    reserveMultiplier: 1,
    upstreamCostUsdPerUnit: null,
    active: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** A `credit_pricing` row as the store wrote it before this seed version. */
function storedRow(rule: CreditPricingRule, overrides: Partial<CreditPricingRow> = {}): CreditPricingRow {
  return {
    capability: rule.capability,
    unit: rule.unit,
    credits_per_unit: rule.creditsPerUnit,
    secondary_unit: rule.secondaryUnit,
    secondary_credits_per_unit: rule.secondaryCreditsPerUnit,
    min_credits: rule.minCredits,
    reserve_multiplier: rule.reserveMultiplier,
    upstream_cost_usd_per_unit: rule.upstreamCostUsdPerUnit,
    active: rule.active ? 1 : 0,
    updated_at: rule.updatedAt,
    ...overrides,
  }
}

const asrRule = selectCreditPricingRule('audio.transcribe', DEFAULT_CREDIT_PRICING)

/**
 * Every combination the retired `Math.ceil(Math.max(transcriptUnits, billedSeconds * 4))`
 * plus the shipped `billedSeconds * 10` hold had to price identically, including the
 * float-sensitive settle/reserve boundaries (0.1 s and 599.5 s).
 */
const ASR_BILLED_SECONDS = [0.1, 0.5, 1, 1.5, 2, 3.7, 10, 60, 599.5]

const ASR_TRANSCRIPTS = [
  { name: 'silence', transcript: '' },
  { name: 'two Han characters', transcript: '好的' },
  { name: 'a dense Chinese sentence', transcript: '你好世界这是一段中文转写内容' },
  { name: 'an English sentence', transcript: 'hello world this is an english transcript' },
  { name: 'mixed scripts and digits', transcript: '混合 mixed 中文 and English 123' },
  { name: 'a 400-character Latin run', transcript: 'a'.repeat(400) },
]

describe('audio.transcribe continuity', () => {
  describe.each(ASR_TRANSCRIPTS)('$name', ({ transcript }) => {
    it.each(ASR_BILLED_SECONDS)('prices %s billed seconds as the retired ASR formula did', (billedSeconds) => {
      const units = countTranscriptUnits(transcript)
      const charge = computeCreditCharge(asrRule, { seconds: billedSeconds, units })
      const reservation = computeCreditReservation(asrRule, { seconds: billedSeconds })

      expect(charge).toBe(Math.ceil(Math.max(units, billedSeconds * 4)))
      expect(reservation).toBe(Math.ceil(billedSeconds * 10))
      expect(Number.isInteger(charge)).toBe(true)
      expect(charge).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(reservation)).toBe(true)
      expect(reservation).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('text.chat continuity', () => {
  it.each([1, 17, 999, 1000, 1001, 4096, 128000])(
    'charges and holds one credit per token for %s tokens',
    (tokens) => {
      const chatRule = selectCreditPricingRule('text.chat', DEFAULT_CREDIT_PRICING)
      const charge = computeCreditCharge(chatRule, { tokens })
      const reservation = computeCreditReservation(chatRule, { tokens })

      expect(charge).toBe(tokens)
      expect(reservation).toBe(tokens)
      expect(Number.isInteger(charge)).toBe(true)
      expect(Number.isInteger(reservation)).toBe(true)
    },
  )
})

describe('computeCreditReservation', () => {
  it.each([
    { seconds: 0.1, credits: 1 },
    { seconds: 0.4, credits: 4 },
    { seconds: 1, credits: 10 },
  ])('holds $credits credits for $seconds s by rounding once after the reserve multiplier', ({ seconds, credits }) => {
    expect(computeCreditReservation(asrRule, { seconds })).toBe(credits)
  })
})

describe('selectCreditPricingRule', () => {
  it('prices an unregistered capability instead of serving it free', () => {
    const fallback = selectCreditPricingRule('something.brand.new', DEFAULT_CREDIT_PRICING)

    expect(computeCreditCharge(fallback, { tokens: 500 })).toBe(500)
    expect(computeCreditReservation(fallback, { tokens: 500 })).toBe(500)
  })

  it('resolves a registered capability to its own row rather than the fallback', () => {
    const registered = selectCreditPricingRule('vision.ocr', DEFAULT_CREDIT_PRICING)
    const fallback = selectCreditPricingRule('something.brand.new', DEFAULT_CREDIT_PRICING)

    // One row sells images, the other sells tokens, so the same report is priced by
    // the registered row and read as "no billable quantity" by the fallback. That gap
    // is what makes a missing image row look like a free capability rather than an error.
    expect(computeCreditCharge(registered, { images: 1 })).toBeGreaterThan(0)
    expect(computeCreditCharge(fallback, { images: 1 })).toBe(0)
  })

  it('prices an inactive row like an unregistered capability', () => {
    const retired = pricingRule({ capability: 'vision.ocr', active: false })

    const selected = selectCreditPricingRule('vision.ocr', [retired])

    expect(computeCreditCharge(selected, { tokens: 500 })).toBe(500)
  })
})

describe('per-image pricing', () => {
  it.each([
    { images: 1, credits: 7 },
    { images: 4, credits: 28 },
  ])('charges $images image(s) at the row price', ({ images, credits }) => {
    expect(computeCreditCharge(pricingRule(), { images })).toBe(credits)
  })

  it('rounds the charge up once for a fractional per-image price', () => {
    // 3 × 7.5 = 22.5, and a partial credit cannot be charged.
    expect(computeCreditCharge(pricingRule({ creditsPerUnit: 7.5 }), { images: 3 })).toBe(23)
  })

  it('never charges below the row minimum', () => {
    // 2 × 0.5 = 1 credit of work, floored by the row's 4-credit minimum.
    expect(computeCreditCharge(pricingRule({ creditsPerUnit: 0.5, minCredits: 4 }), { images: 2 })).toBe(4)
  })

  it('reserves against the unrounded basis, rounding once after the multiplier', () => {
    // 0.5 × 1 = 0.5 credits of work, held at 3× = 1.5 → 2. Rounding the settled charge
    // (ceil(0.5) = 1) before multiplying would hold 3 instead, over-holding every
    // sub-credit clip the way the shipped ASR reserve did not.
    expect(computeCreditReservation(pricingRule({ creditsPerUnit: 0.5, reserveMultiplier: 3 }), { images: 1 })).toBe(2)
  })

  it('charges nothing for usage reported outside the capability unit', () => {
    expect(computeCreditCharge(pricingRule({ capability: 'vision.ocr' }), { tokens: 500 })).toBe(0)
  })
})

/**
 * The shipped price list, read through the same lookup every caller uses. These pin the
 * charges the published policy promises — a capability silently reverting to an earlier
 * price fails here, and the algebra above stays free to move.
 */
describe('shipped price list', () => {
  const chat = selectCreditPricingRule('text.chat', DEFAULT_CREDIT_PRICING)
  const ocr = selectCreditPricingRule('vision.ocr', DEFAULT_CREDIT_PRICING)
  const imageTranslate = selectCreditPricingRule('image.translate', DEFAULT_CREDIT_PRICING)
  const imageTranslateE2e = selectCreditPricingRule('image.translate.e2e', DEFAULT_CREDIT_PRICING)
  const asr = selectCreditPricingRule('audio.stt', DEFAULT_CREDIT_PRICING)
  const unregistered = selectCreditPricingRule('something.brand.new', DEFAULT_CREDIT_PRICING)

  it('anchors text and code on one credit per token', () => {
    expect(computeCreditCharge(chat, { tokens: 1000 })).toBe(1000)
    expect(computeCreditCharge(chat, { tokens: 1 })).toBe(1)
  })

  it.each([
    { name: 'vision.ocr', rule: ocr, credits: 2000 },
    { name: 'image.translate', rule: imageTranslate, credits: 3000 },
    { name: 'image.translate.e2e', rule: imageTranslateE2e, credits: 4000 },
  ])('charges $credits credits for one $name image', ({ rule, credits }) => {
    expect(computeCreditCharge(rule, { images: 1 })).toBe(credits)
  })

  it('charges each image-translating capability from its own row, never the free token fallback', () => {
    // A registered capability that reports images but has no image-priced row reads as
    // "no billable quantity" under the token fallback and settles at zero, so a missing
    // row is a silent giveaway rather than a loud failure.
    for (const rule of [imageTranslate, imageTranslateE2e]) {
      expect(computeCreditCharge(rule, { images: 3 })).toBeGreaterThan(0)
    }
  })

  it('prices speech seconds and dense transcript units, and holds 2.5× the settled price', () => {
    // 2 s of audio is 8 credits; a dense second of 9 transcript units outbids the 4
    // credits of duration and settles at 9; the 1 s hold is ceil(4 × 2.5).
    expect(computeCreditCharge(asr, { seconds: 2 })).toBe(8)
    expect(computeCreditCharge(asr, { seconds: 1, units: 9 })).toBe(9)
    expect(computeCreditReservation(asr, { seconds: 1 })).toBe(10)
  })

  it('prices an unregistered capability like chat rather than serving it free', () => {
    expect(computeCreditCharge(unregistered, { tokens: 500 })).toBe(500)
  })
})

describe('listCreditPricing reconciliation', () => {
  /** The stamp the previous seed wrote; a row still carrying it has never been edited. */
  const SUPERSEDED_STAMP = '2026-09-10T00:00:00.000Z'
  const OCR_DEFAULT = DEFAULT_CREDIT_PRICING.find(item => item.capability === 'vision.ocr')!

  it('moves a never-edited row onto the shipped default', async () => {
    const db = new MockCreditPricingD1Database()
    db.rows.set('vision.ocr', storedRow(OCR_DEFAULT, { credits_per_unit: 10, updated_at: SUPERSEDED_STAMP }))

    const rules = await listCreditPricing(makeCreditPricingEvent(db))
    const reconciled = rules.find(rule => rule.capability === 'vision.ocr')!

    // Without this the superseded 10 survives every deploy: seeding is additive per
    // capability, so an already-seeded row is never rewritten by an insert.
    expect(computeCreditCharge(reconciled, { images: 1 })).toBe(computeCreditCharge(OCR_DEFAULT, { images: 1 }))
    expect(reconciled.updatedAt).toBe(OCR_DEFAULT.updatedAt)
  })

  it('keeps a price an operator set, even when it equals the superseded default', async () => {
    const db = new MockCreditPricingD1Database()
    const editedStamp = '2026-09-10T08:15:00.000Z'
    db.rows.set('vision.ocr', storedRow(OCR_DEFAULT, { credits_per_unit: 10, updated_at: editedStamp }))

    const rules = await listCreditPricing(makeCreditPricingEvent(db))
    const kept = rules.find(rule => rule.capability === 'vision.ocr')!

    // A real timestamp means a human chose this price. The value matching the old seed
    // is a coincidence, not evidence that nobody touched the row.
    expect(computeCreditCharge(kept, { images: 1 })).toBe(10)
    expect(kept.updatedAt).toBe(editedStamp)
  })

  it('rewrites a superseded row once, not on every read', async () => {
    const db = new MockCreditPricingD1Database()
    db.rows.set('vision.ocr', storedRow(OCR_DEFAULT, { credits_per_unit: 10, updated_at: SUPERSEDED_STAMP }))

    const first = await listCreditPricing(makeCreditPricingEvent(db))
    expect(db.pricingUpdates).toBe(1)

    const second = await listCreditPricing(makeCreditPricingEvent(db))

    expect(db.pricingUpdates).toBe(1)
    expect(computeCreditCharge(second.find(rule => rule.capability === 'vision.ocr')!, { images: 1 }))
      .toBe(computeCreditCharge(first.find(rule => rule.capability === 'vision.ocr')!, { images: 1 }))
  })
})

describe('sellable pricing', () => {
  const EDITED_STAMP = '2026-09-10T08:15:00.000Z'
  const OCR_DEFAULT = DEFAULT_CREDIT_PRICING.find(item => item.capability === 'vision.ocr')!

  it('tells a disabled row apart from a capability that was never priced', () => {
    const disabled = resolveCreditPricingEntry('vision.ocr', [pricingRule({ capability: 'vision.ocr', active: false })])
    const priced = resolveCreditPricingEntry('vision.ocr', [pricingRule({ capability: 'vision.ocr' })])
    const unregistered = resolveCreditPricingEntry('vision.ocr', [])

    // An operator switching a capability off is a decision; no row at all is a gap. The
    // two must not collapse into the same answer, or refusing one refuses the other.
    expect(disabled).toMatchObject({ disabled: true })
    expect(priced).toMatchObject({ disabled: false })
    expect(unregistered).toMatchObject({ disabled: false })
  })

  it('refuses a disabled capability instead of selling it at the token fallback', async () => {
    const db = new MockCreditPricingD1Database()
    db.rows.set('vision.ocr', storedRow(OCR_DEFAULT, { active: 0, updated_at: EDITED_STAMP }))

    // The fallback prices tokens, and an image request reports none — settling a disabled
    // capability through it would hand the generation over for 0 credits.
    await expect(resolveSellableCreditPricingRule(makeCreditPricingEvent(db), 'vision.ocr'))
      .rejects.toMatchObject({
        statusCode: 503,
        data: { code: 'CAPABILITY_DISABLED', capability: 'vision.ocr' },
      })
  })

  it('serves a capability with no price row on the token fallback', async () => {
    const db = new MockCreditPricingD1Database()

    const rule = await resolveSellableCreditPricingRule(makeCreditPricingEvent(db), 'test.unregistered')

    expect(rule.unit).toBe('1k_tokens')
    expect(rule.active).toBe(true)
  })
})
