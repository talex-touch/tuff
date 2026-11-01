import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import type { BigIntStats } from 'node:fs'
import { mkdtemp, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedFileSha256, clearFileDigestCacheForTests } from './local-embedding-digest'

const reads = vi.hoisted(() => ({
  files: [] as string[],
  override: null as null | (() => AsyncIterable<Buffer>)
}))

/** Hooks on the one descriptor `cachedFileSha256` opens: what it saw, and what happens around it. */
const handles = vi.hoisted(() => ({
  opened: 0,
  closed: 0,
  /** Runs once the descriptor exists, before anything is read from it. */
  afterOpen: null as null | (() => Promise<void>),
  /** Added to mtimeNs in the stat answer of the nth call on a handle (1 = before the read). */
  statDrift: null as null | ((call: number) => bigint)
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    createReadStream: ((file: string, options?: unknown) => {
      reads.files.push(String(file))
      return reads.override
        ? Readable.from(reads.override())
        : actual.createReadStream(file, options as never)
    }) as unknown as typeof actual.createReadStream
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: (async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      handles.opened++
      await handles.afterOpen?.()
      let statCalls = 0
      const realStat = handle.stat.bind(handle) as (options: {
        bigint: true
      }) => Promise<BigIntStats>
      handle.stat = (async (options: { bigint: true }) => {
        statCalls++
        const details = await realStat(options)
        const drift = handles.statDrift?.(statCalls) ?? 0n
        return drift === 0n ? details : { ...details, mtimeNs: details.mtimeNs + drift }
      }) as unknown as typeof handle.stat
      const realClose = handle.close.bind(handle)
      handle.close = (async () => {
        handles.closed++
        await realClose()
      }) as typeof handle.close
      return handle
    }) as typeof actual.open
  }
})

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 30))
const FIXED_MTIME_SECONDS = 1_700_000_000

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'embedding-digest-'))
  reads.files.length = 0
  reads.override = null
  handles.opened = 0
  handles.closed = 0
  handles.afterOpen = null
  handles.statDrift = null
  clearFileDigestCacheForTests()
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('cachedFileSha256', () => {
  it('reads an unchanged file once and answers later calls from memory', async () => {
    const file = join(directory, 'weights.bin')
    await writeFile(file, 'alpha')
    expect(await cachedFileSha256(file)).toBe(sha256('alpha'))
    expect(await cachedFileSha256(file)).toBe(sha256('alpha'))
    expect(await cachedFileSha256(file)).toBe(sha256('alpha'))
    expect(reads.files).toEqual([file])
  })

  it('hashes each path separately', async () => {
    const first = join(directory, 'first.bin')
    const second = join(directory, 'second.bin')
    await writeFile(first, 'alpha')
    await writeFile(second, 'bravo')
    expect(await cachedFileSha256(first)).toBe(sha256('alpha'))
    expect(await cachedFileSha256(second)).toBe(sha256('bravo'))
    expect(reads.files).toEqual([first, second])
  })

  it('hashes again when the size changes', async () => {
    const file = join(directory, 'weights.bin')
    await writeFile(file, 'alpha')
    await cachedFileSha256(file)
    await writeFile(file, 'alphabet')
    expect(await cachedFileSha256(file)).toBe(sha256('alphabet'))
    expect(reads.files).toHaveLength(2)
  })

  it('hashes again when only the mtime moves', async () => {
    const file = join(directory, 'weights.bin')
    await writeFile(file, 'alpha')
    await utimes(file, FIXED_MTIME_SECONDS, FIXED_MTIME_SECONDS)
    await cachedFileSha256(file)
    await utimes(file, FIXED_MTIME_SECONDS + 5, FIXED_MTIME_SECONDS + 5)
    await cachedFileSha256(file)
    expect(reads.files).toHaveLength(2)
  })

  it('hashes again after a same-size rewrite whose mtime was put back', async () => {
    const file = join(directory, 'weights.bin')
    await writeFile(file, 'alpha')
    await utimes(file, FIXED_MTIME_SECONDS, FIXED_MTIME_SECONDS)
    const before = await stat(file, { bigint: true })
    expect(await cachedFileSha256(file)).toBe(sha256('alpha'))

    await settle()
    await writeFile(file, 'bravo')
    await utimes(file, FIXED_MTIME_SECONDS, FIXED_MTIME_SECONDS)
    const after = await stat(file, { bigint: true })
    expect([after.dev, after.ino, after.size, after.mtimeNs]).toEqual([
      before.dev,
      before.ino,
      before.size,
      before.mtimeNs
    ])

    expect(await cachedFileSha256(file)).toBe(sha256('bravo'))
    expect(reads.files).toHaveLength(2)
  })

  it('hashes again when another file is renamed over the path', async () => {
    const file = join(directory, 'weights.bin')
    const replacement = join(directory, 'replacement.bin')
    await writeFile(file, 'alpha')
    await utimes(file, FIXED_MTIME_SECONDS, FIXED_MTIME_SECONDS)
    await cachedFileSha256(file)
    await writeFile(replacement, 'bravo')
    await utimes(replacement, FIXED_MTIME_SECONDS, FIXED_MTIME_SECONDS)
    await rename(replacement, file)
    expect(await cachedFileSha256(file)).toBe(sha256('bravo'))
    expect(reads.files).toHaveLength(2)
  })

  it('stores nothing for a read that failed', async () => {
    const file = join(directory, 'weights.bin')
    await writeFile(file, 'alpha')
    reads.override = () =>
      (async function* () {
        yield Buffer.from('al')
        throw new Error('EIO: simulated read failure')
      })()
    await expect(cachedFileSha256(file)).rejects.toThrow('EIO')
    reads.override = null
    expect(await cachedFileSha256(file)).toBe(sha256('alpha'))
    expect(reads.files).toHaveLength(2)
  })

  it('never pairs a write that lands during hashing with the digest it interrupted', async () => {
    const file = join(directory, 'weights.bin')
    await writeFile(file, 'alpha')
    reads.override = () =>
      (async function* () {
        yield Buffer.from('al')
        await settle()
        await writeFile(file, 'a much longer replacement')
        yield Buffer.from('pha')
      })()
    await cachedFileSha256(file)
    reads.override = null
    expect(await cachedFileSha256(file)).toBe(sha256('a much longer replacement'))
    expect(reads.files).toHaveLength(2)
  })

  it('keeps a digest out of the cache when the file changed while it was read', async () => {
    const file = join(directory, 'weights.bin')
    await writeFile(file, 'alpha')
    // Only the stat after the read sees it: a write that landed while the bytes were being hashed.
    handles.statDrift = (call) => (call === 2 ? 1n : 0n)
    expect(await cachedFileSha256(file)).toBe(sha256('alpha'))
    handles.statDrift = null
    // The file now matches the stamp taken before that read, so a stored digest would be a hit here.
    expect(await cachedFileSha256(file)).toBe(sha256('alpha'))
    expect(reads.files).toHaveLength(2)
    // A read that sees one stable file is stored.
    expect(await cachedFileSha256(file)).toBe(sha256('alpha'))
    expect(reads.files).toHaveLength(2)
  })

  it('hashes the file it opened even when the path names another file by the time it reads', async () => {
    const file = join(directory, 'weights.bin')
    const replacement = join(directory, 'replacement.bin')
    await writeFile(file, 'alpha')
    await writeFile(replacement, 'bravo')
    handles.afterOpen = async () => {
      handles.afterOpen = null
      await rename(replacement, file)
    }
    expect(await cachedFileSha256(file)).toBe(sha256('alpha'))
    expect(handles.opened).toBe(1)
    expect(handles.afterOpen).toBeNull()
    expect(await cachedFileSha256(file)).toBe(sha256('bravo'))
    expect(reads.files).toHaveLength(2)
  })

  it('closes the descriptor it opened on a miss, on a hit and on a failed read', async () => {
    const file = join(directory, 'weights.bin')
    await writeFile(file, 'alpha')
    await cachedFileSha256(file)
    expect([handles.opened, handles.closed]).toEqual([1, 1])
    await cachedFileSha256(file)
    expect([handles.opened, handles.closed]).toEqual([2, 2])
    await utimes(file, FIXED_MTIME_SECONDS, FIXED_MTIME_SECONDS)
    reads.override = () =>
      (async function* () {
        yield Buffer.from('al')
        throw new Error('EIO: simulated read failure')
      })()
    await expect(cachedFileSha256(file)).rejects.toThrow('EIO')
    expect([handles.opened, handles.closed]).toEqual([3, 3])
  })

  it('propagates a missing file instead of remembering it', async () => {
    const file = join(directory, 'absent.bin')
    await expect(cachedFileSha256(file)).rejects.toMatchObject({ code: 'ENOENT' })
    await writeFile(file, 'alpha')
    expect(await cachedFileSha256(file)).toBe(sha256('alpha'))
  })
})
