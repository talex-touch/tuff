import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RunRefused } from './errors'
import type { LockDeps } from './lock'
import { acquireRunLock, lockState, readLock } from './lock'

describe('run lock', () => {
  let dir = ''
  let file = ''
  const alive = new Set<number>()
  const deps = (pid: number): LockDeps => ({
    isPidAlive: (candidate) => alive.has(candidate),
    pid,
    now: () => 5_000
  })

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stress-lock-'))
    file = path.join(dir, 'nested', '.lock')
    alive.clear()
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('creates the lock with the owner, and release removes it', async () => {
    alive.add(111)
    const lock = await acquireRunLock(file, 'run-a', deps(111))
    expect(await readLock(file)).toEqual({ pid: 111, runId: 'run-a', startedAt: 5_000 })
    expect(await lockState(file, deps(111))).toMatchObject({ state: 'held' })
    await lock.release()
    expect(await readLock(file)).toBeNull()
    expect(await lockState(file, deps(111))).toEqual({ state: 'free' })
  })

  it('refuses while the owner is alive and names its pid and run', async () => {
    alive.add(111)
    await acquireRunLock(file, 'run-a', deps(111))
    const failure = await acquireRunLock(file, 'run-b', deps(222)).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(RunRefused)
    expect((failure as Error).message).toContain('pid 111')
    expect((failure as Error).message).toContain('run-a')
  })

  it('replaces the lock of a dead process', async () => {
    await acquireRunLock(file, 'run-a', deps(111))
    expect(await lockState(file, deps(222))).toMatchObject({ state: 'stale', info: { pid: 111 } })
    const lock = await acquireRunLock(file, 'run-b', deps(222))
    expect(await readLock(file)).toMatchObject({ pid: 222, runId: 'run-b' })
    await lock.release()
  })

  it('replaces a lock file that is not readable', async () => {
    await acquireRunLock(file, 'run-a', deps(111))
    await writeFile(file, 'not json')
    const lock = await acquireRunLock(file, 'run-b', deps(222))
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ pid: 222 })
    await lock.release()
  })

  it('does not remove a lock that another process took over meanwhile', async () => {
    const lock = await acquireRunLock(file, 'run-a', deps(111))
    await writeFile(file, `${JSON.stringify({ pid: 333, runId: 'run-c', startedAt: 1 })}\n`)
    await lock.release()
    expect(await readLock(file)).toMatchObject({ pid: 333 })
  })
})
