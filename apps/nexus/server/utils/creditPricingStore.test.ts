import { describe, expect, it } from 'vitest'
import { countTranscriptUnits } from './asrTranscriptionStore'
import {
  computeCreditCharge,
  computeCreditReservation,
  DEFAULT_CREDIT_PRICING,
  selectCreditPricingRule,
} from './creditPricingStore'

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
    const ocrRule = selectCreditPricingRule('vision.ocr', DEFAULT_CREDIT_PRICING)

    expect(computeCreditCharge(ocrRule, { images: 1 })).toBe(10)
  })
})

describe('per-image pricing', () => {
  const ocrRule = selectCreditPricingRule('vision.ocr', DEFAULT_CREDIT_PRICING)

  it.each([
    { images: 1, credits: 10 },
    { images: 3, credits: 30 },
  ])('charges $credits credits for $images image(s)', ({ images, credits }) => {
    expect(computeCreditCharge(ocrRule, { images })).toBe(credits)
  })

  it('charges nothing for usage reported outside the capability unit', () => {
    expect(computeCreditCharge(ocrRule, { tokens: 500 })).toBe(0)
  })
})
