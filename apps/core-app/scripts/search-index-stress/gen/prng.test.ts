import { describe, expect, it } from 'vitest'
import { PlacementPool, SEGMENTS, joinPath } from './placement'
import { createRng, hashSeed, hex } from './prng'

describe('createRng', () => {
  it('is a fixed sequence, so equal seeds mean equal plans on every machine and Node version', () => {
    const rng = createRng(1)
    expect(rng.next()).toBe(0.6270739405881613)
    expect(rng.int(1000)).toBe(2)
    expect(rng.range(5, 9)).toBe(7)
    expect(rng.chance(0.5)).toBe(false)
    expect(hashSeed(1, 'a')).toBe(1774514421)
    expect(hashSeed('x', 2)).toBe(3343187184)
    expect(hex('abc')).toBe('ba7816bf8f01')
    expect(createRng(7).shuffle([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([5, 7, 2, 3, 4, 6, 8, 1])
    expect(createRng(7).fork('x').next()).toBe(0.9505309097003192)
    expect(createRng(7).fork('y').next()).toBe(0.11263050581328571)
  })

  it('draws from [0, 1) with a mean near one half', () => {
    const rng = createRng(42)
    let total = 0
    for (let index = 0; index < 20_000; index += 1) {
      const value = rng.next()
      expect(value >= 0 && value < 1).toBe(true)
      total += value
    }
    expect(Math.abs(total / 20_000 - 0.5)).toBeLessThan(0.01)
  })

  it('int stays below its bound and range reaches both of its ends', () => {
    const rng = createRng(5)
    const seen = new Set<number>()
    for (let index = 0; index < 3000; index += 1) {
      expect(rng.int(7)).toBeLessThan(7)
      seen.add(rng.range(3, 6))
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6])
  })

  it('chance(0) never and chance(1) always', () => {
    const rng = createRng(9)
    for (let index = 0; index < 500; index += 1) {
      expect(rng.chance(0)).toBe(false)
      expect(rng.chance(1)).toBe(true)
    }
  })

  it('pick returns a member and refuses an empty list', () => {
    const rng = createRng(2)
    for (let index = 0; index < 200; index += 1)
      expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']))
    expect(() => rng.pick([])).toThrow(/empty/)
  })

  it('shuffle returns a permutation, leaves its input alone and repeats for the same seed', () => {
    const input = Array.from({ length: 50 }, (_, index) => index)
    const copy = [...input]
    const shuffled = createRng(3).shuffle(input)
    expect(input).toEqual(copy)
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input)
    expect(shuffled).not.toEqual(input)
    expect(createRng(3).shuffle(input)).toEqual(shuffled)
    expect(createRng(4).shuffle(input)).not.toEqual(shuffled)
  })

  it('fork depends on the seed and label, never on how much the parent has drawn', () => {
    const quiet = createRng(7)
    const busy = createRng(7)
    for (let index = 0; index < 100; index += 1) busy.next()
    expect(busy.fork('x').next()).toBe(quiet.fork('x').next())
    expect(quiet.fork('x').next()).not.toBe(quiet.fork('y').next())
    expect(createRng(8).fork('x').next()).not.toBe(quiet.fork('x').next())
  })

  it('a zero, negative or fractional seed still gives a varied stream', () => {
    for (const seed of [0, -1, 1.5, 2 ** 32 + 5]) {
      const rng = createRng(seed)
      const values = new Set(Array.from({ length: 100 }, () => rng.next()))
      expect(values.size, String(seed)).toBe(100)
    }
  })
})

describe('hashSeed and hex', () => {
  it('hashSeed is stable, unsigned 32-bit, and sensitive to every part and to part boundaries', () => {
    expect(hashSeed(1, 'a')).toBe(hashSeed(1, 'a'))
    expect(hashSeed(1, 'a')).not.toBe(hashSeed(2, 'a'))
    expect(hashSeed(1, 'a')).not.toBe(hashSeed(1, 'b'))
    expect(hashSeed('ab', 'c')).not.toBe(hashSeed('a', 'bc'))
    for (const seed of [0, 1, -1, 99999])
      expect(
        Number.isInteger(hashSeed(seed, 'x')) &&
          hashSeed(seed, 'x') >= 0 &&
          hashSeed(seed, 'x') < 2 ** 32
      ).toBe(true)
  })

  it('hex is a prefix of the sha-256 digest', () => {
    expect(hex('abc', 64)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hex('abc', 4)).toBe('ba78')
    expect(hex('abc')).toHaveLength(12)
  })
})

describe('PlacementPool', () => {
  const CHAINS = [0, 6, 5, 5, 4, 4, 4]

  it('lists its directories parents first, without duplicates, with the four fixed ones', () => {
    const dirs = new PlacementPool(1).directories()
    expect(new Set(dirs).size).toBe(dirs.length)
    for (const fixed of ['fresh', 'copy-sources', '.stage', 'ignored'])
      expect(dirs).toContain(fixed)
    dirs.forEach((dir, index) => {
      if (dir.includes('/'))
        expect(dirs.indexOf(dir.slice(0, dir.lastIndexOf('/'))), dir).toBeLessThan(index)
    })
  })

  it('depth-N rotates through its chains, each N distinct segments deep and already listed', () => {
    const pool = new PlacementPool(1)
    const listed = new Set(pool.directories())
    for (let depth = 1; depth <= 6; depth += 1) {
      const chains = Array.from(
        { length: CHAINS[depth] as number },
        () => pool.resolve(`depth-${depth}`, 'tok').dir
      )
      expect(new Set(chains).size, `depth-${depth}`).toBe(chains.length)
      for (const chain of chains) {
        const parts = chain.split('/')
        expect(parts).toHaveLength(depth)
        expect(new Set(parts).size).toBe(depth)
        expect(parts.every((part) => SEGMENTS.includes(part))).toBe(true)
        expect(listed.has(chain)).toBe(true)
      }
      expect(pool.resolve(`depth-${depth}`, 'tok').dir).toBe(chains[0])
    }
  })

  it('root is the corpus root; spaced, CJK and crowded directories rotate and are listed', () => {
    const pool = new PlacementPool(1)
    const listed = new Set(pool.directories())
    expect(pool.resolve('root', 'tok')).toEqual({ dir: '', create: [] })
    for (const id of ['dir-spaces', 'dir-cjk', 'crowded']) {
      const seen = new Set<string>()
      for (let index = 0; index < 8; index += 1) {
        const { dir, create } = pool.resolve(id, 'tok')
        expect(listed.has(dir), `${id} ${dir}`).toBe(true)
        expect(create).toEqual([])
        seen.add(dir)
      }
      expect(seen.size, id).toBeGreaterThanOrEqual(4)
    }
    expect(
      [...new Set(Array.from({ length: 4 }, () => pool.resolve('crowded', 'tok').dir))].every(
        (dir) => dir.startsWith('crowded/')
      )
    ).toBe(true)
  })

  it('new-dir makes a directory under fresh/ for this token only, one to three levels, parents first', () => {
    const pool = new PlacementPool(1)
    const depths: number[] = []
    for (let index = 0; index < 6; index += 1) {
      const { dir, create } = pool.resolve('new-dir', `tok${index}`)
      expect(dir.startsWith(`fresh/tok${index}`)).toBe(true)
      expect(create[create.length - 1]).toBe(dir)
      expect(create[0]).toBe(`fresh/tok${index}`)
      create.forEach((path, at) => {
        if (at > 0) expect(path.startsWith(`${create[at - 1]}/`)).toBe(true)
      })
      depths.push(create.length)
    }
    expect(depths).toEqual([1, 2, 3, 1, 2, 3])
  })

  it('refuses an unknown placement id', () => {
    expect(() => new PlacementPool(1).resolve('mars', 'tok')).toThrow(/unknown placement: mars/)
  })

  it('depends on the seed only', () => {
    expect(new PlacementPool(1).directories()).toEqual(new PlacementPool(1).directories())
    expect(new PlacementPool(1).directories()).not.toEqual(new PlacementPool(2).directories())
  })

  it('joinPath leaves the root alone', () => {
    expect(joinPath('', 'a.png')).toBe('a.png')
    expect(joinPath('d/e', 'a.png')).toBe('d/e/a.png')
  })
})
