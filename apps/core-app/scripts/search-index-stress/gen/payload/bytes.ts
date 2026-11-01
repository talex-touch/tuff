const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array, seed = 0): number {
  let c = ~seed >>> 0
  for (let index = 0; index < data.length; index += 1) {
    c = (CRC_TABLE[(c ^ (data[index] as number)) & 0xff] as number) ^ (c >>> 8)
  }
  return ~c >>> 0
}

export function u16le(value: number): Buffer {
  const out = Buffer.alloc(2)
  out.writeUInt16LE(value)
  return out
}

export function u16be(value: number): Buffer {
  const out = Buffer.alloc(2)
  out.writeUInt16BE(value)
  return out
}

export function u32le(value: number): Buffer {
  const out = Buffer.alloc(4)
  out.writeUInt32LE(value >>> 0)
  return out
}

export function u32be(value: number): Buffer {
  const out = Buffer.alloc(4)
  out.writeUInt32BE(value >>> 0)
  return out
}

export function xorshift(seed: number): () => number {
  let state = seed >>> 0 || 0x2545f491
  return () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state
  }
}

export function noiseBytes(length: number, seed: number): Buffer {
  const out = Buffer.allocUnsafe(length)
  const next = xorshift(seed)
  let index = 0
  while (index + 4 <= length) {
    out.writeUInt32LE(next(), index)
    index += 4
  }
  if (index < length) {
    const tail = next()
    for (let shift = 0; index < length; index += 1, shift += 8) out[index] = (tail >>> shift) & 0xff
  }
  return out
}

/** Printable filler for comment-like padding segments. */
export function asciiFiller(length: number, seed: number): Buffer {
  const out = Buffer.allocUnsafe(length)
  const next = xorshift(seed)
  for (let index = 0; index < length; index += 1) out[index] = 97 + (next() % 26)
  return out
}
