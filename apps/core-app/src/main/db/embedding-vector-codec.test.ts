import { describe, expect, it } from 'vitest'
import { encodeVectorBlob, readStoredVector } from './embedding-vector-codec'

describe('embedding vector storage format', () => {
  it('stores 4 bytes per dimension and round-trips float32 values', () => {
    const blob = encodeVectorBlob([0.1, -0.5, 3])

    expect(blob.byteLength).toBe(12)
    expect(Array.from(readStoredVector(blob, 3)!)).toEqual(
      Array.from(new Float32Array([0.1, -0.5, 3]))
    )
  })

  it('reads a legacy JSON row and a BLOB row to the same vector', () => {
    const legacy = readStoredVector('[0.25,-0.5,1]', 3)
    const modern = readStoredVector(encodeVectorBlob([0.25, -0.5, 1]), 3)

    expect(Array.from(modern!)).toEqual(Array.from(legacy!))
  })

  it('decodes a BLOB that sits at an odd offset inside a larger buffer', () => {
    const backing = new Uint8Array(1 + 8)
    backing.set(encodeVectorBlob([1, 2]), 1)

    expect(Array.from(readStoredVector(backing.subarray(1), 2)!)).toEqual([1, 2])
  })

  it('matches the layout libSQL vector32() writes, so SQL-side tools can read it', () => {
    // `vector32('[0.1,0.25,-0.5]')` hex, observed from the libSQL build the app ships.
    const fromLibsql = new Uint8Array([0xcd, 0xcc, 0xcc, 0x3d, 0, 0, 0x80, 0x3e, 0, 0, 0, 0xbf])

    expect(Array.from(encodeVectorBlob([0.1, 0.25, -0.5]))).toEqual(Array.from(fromLibsql))
  })

  it.each([
    ['malformed JSON', '{broken'],
    ['JSON null', 'null'],
    ['a JSON number', '5'],
    ['a wrong-length array', '[1,0]'],
    ['an overflowing component', '[1e309,0,0]'],
    ['a string component', '["a",0,0]'],
    ['a null component', '[1,null,0]'],
    ['a BLOB of the wrong size', new Uint8Array(8)],
    ['a BLOB holding a NaN', new Uint8Array([0, 0, 0xc0, 0x7f, 0, 0, 0, 0, 0, 0, 0, 0])],
    ['a missing value', null]
  ])('rejects %s instead of scoring it', (_name, stored) => {
    expect(readStoredVector(stored, 3)).toBeNull()
  })
})
