import { describe, expect, it } from 'vitest'
import { serializePluginFileMap, serializePluginSigningValue } from '../plugin/signing'

/**
 * The canonical byte string that plugin signatures cover (#894).
 *
 * Key order was decided by `localeCompare(left, right, 'en')`. That string is signed by the
 * publisher CLI and verified independently by Nexus on Cloudflare Workers and by the Electron
 * main process, so an ICU difference between those runtimes could make the same object
 * serialize differently on signer and verifier.
 *
 * The sharper problem is collation-ignorable code points: ICU reports distinct strings as
 * equal, `Array.prototype.sort` then leaves them in input order, and for a file map that order
 * comes from tar entries the publisher chooses.
 */
describe('canonical key ordering', () => {
  it('is stable regardless of the order keys arrive in', () => {
    const forward = serializePluginSigningValue({ a: 1, B: 2, c: 3 })
    const reverse = serializePluginSigningValue({ c: 3, B: 2, a: 1 })
    expect(forward).toBe(reverse)
  })

  it('orders by codepoint, so uppercase precedes lowercase', () => {
    // The observable difference from localeCompare('en'), which puts 'a' before 'B'.
    expect(serializePluginSigningValue({ a: 1, B: 2 })).toBe('{"B":2,"a":1}')
  })

  it('separates keys that ICU collation reports as equal', () => {
    // Confirmed against this runtime: 'a­b'.localeCompare('ab', 'en') === 0. With a
    // comparator returning 0 the sort is input-order dependent, which is the defect.
    const soft = 'a­b'
    expect(soft.localeCompare('ab', 'en')).toBe(0)

    const forward = serializePluginSigningValue({ [soft]: 1, ab: 2 })
    const reverse = serializePluginSigningValue({ ab: 2, [soft]: 1 })
    expect(forward).toBe(reverse)
  })

  it('gives a file map the same hash input whatever order the archive listed it in', () => {
    // serializePluginFileMap feeds fileMapSha256, which sits inside the signed payload. This
    // is the property the whole canonicalisation exists to provide.
    const entries: Array<[string, string]> = [
      ['README.md', 'a'],
      ['src/index.js', 'b'],
      ['LICENSE', 'c'],
      ['src/Index.js', 'd'],
      ['a‍b.txt', 'e'],
      ['ab.txt', 'f'],
    ]

    const forward = serializePluginFileMap(Object.fromEntries(entries))
    const reverse = serializePluginFileMap(Object.fromEntries([...entries].reverse()))
    expect(forward).toBe(reverse)
  })

  it('still serializes ordinary payloads', () => {
    // Positive control: an ordering fix that broke serialization would satisfy the equality
    // assertions above by returning the same wrong thing twice.
    expect(serializePluginSigningValue({ contract: 'x', version: '1.0.0', nested: { b: 1, a: 2 } }))
      .toBe('{"contract":"x","nested":{"a":2,"b":1},"version":"1.0.0"}')
  })

  it('keeps array order, which is data rather than key order', () => {
    expect(serializePluginSigningValue({ list: ['c', 'a', 'b'] })).toBe('{"list":["c","a","b"]}')
  })

  it('still drops undefined and rejects non-finite numbers', () => {
    expect(serializePluginSigningValue({ a: undefined, b: 1 })).toBe('{"b":1}')
    expect(() => serializePluginSigningValue({ a: Number.NaN })).toThrow(TypeError)
  })
})
