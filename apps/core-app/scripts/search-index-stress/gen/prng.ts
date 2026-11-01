import { createHash } from 'node:crypto'

export interface Rng {
  next(): number
  int(maxExclusive: number): number
  range(minInclusive: number, maxInclusive: number): number
  chance(probability: number): boolean
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: readonly T[]): T[]
  fork(label: string): Rng
}

export function hashSeed(...parts: Array<string | number>): number {
  const digest = createHash('sha256').update(parts.join('\u0001')).digest()
  return digest.readUInt32LE(0)
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0 || 0x9e3779b9
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rng: Rng = {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    range: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from empty list')
      return items[Math.floor(next() * items.length)] as never
    },
    shuffle: (items) => {
      const out = items.slice()
      for (let index = out.length - 1; index > 0; index -= 1) {
        const other = Math.floor(next() * (index + 1))
        const held = out[index] as never
        out[index] = out[other] as never
        out[other] = held
      }
      return out
    },
    fork: (label) => createRng(hashSeed(seed, label))
  }
  return rng
}

export function hex(input: string, length = 12): string {
  return createHash('sha256').update(input).digest('hex').slice(0, length)
}
