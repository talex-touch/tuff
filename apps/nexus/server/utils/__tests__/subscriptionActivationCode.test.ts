import { describe, expect, it, vi } from 'vitest'
import { generateActivationCode } from '../subscriptionStore'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

describe('generateActivationCode', () => {
  it('keeps the TUFF-<plan>-<8>-<4> shape', () => {
    const code = generateActivationCode('PRO')
    expect(code).toMatch(/^TUFF-PRO-[A-Z2-9]{8}-[A-Z2-9]{4}$/)
  })

  it('uses only the unambiguous alphabet', () => {
    // No I, O, 0 or 1 — a code read off a screen must not be mistypeable.
    for (let i = 0; i < 200; i++) {
      const body = generateActivationCode('PLUS').replace('TUFF-PLUS-', '').replace('-', '')
      for (const ch of body)
        expect(ALPHABET, `unexpected character ${ch}`).toContain(ch)
    }
  })

  it('does not derive from Math.random', () => {
    // The defect: V8's xorshift128+ state is recoverable from a few consecutive outputs, so
    // two codes from one isolate exposed every other code it minted (#918). Pinning
    // Math.random to a constant would have made the old generator emit one repeated
    // character; a CSPRNG is unaffected.
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const codes = new Set(Array.from({ length: 50 }, () => generateActivationCode('PRO')))
      expect(codes.size).toBe(50)
      expect(spy).not.toHaveBeenCalled()
    }
    finally {
      spy.mockRestore()
    }
  })

  it('does not repeat across a large batch', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateActivationCode('TEAM')))
    expect(codes.size).toBe(2000)
  })

  it('spreads across the alphabet rather than favouring a prefix', () => {
    // A biased modulo over a non-power-of-two alphabet would skew the low characters. This
    // alphabet is 32 long so a mask would be fine too, but the assertion guards the choice.
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++)
      for (const ch of generateActivationCode('PRO').slice(-4)) seen.add(ch)

    expect(seen.size).toBeGreaterThan(ALPHABET.length * 0.8)
  })
})
