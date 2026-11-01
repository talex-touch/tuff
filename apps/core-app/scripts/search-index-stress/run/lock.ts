import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { RunRefused } from './errors'
import { isPidAlive } from './process-info'

export interface LockInfo {
  pid: number
  runId: string
  startedAt: number
}

export interface LockDeps {
  isPidAlive: (pid: number) => boolean
  pid: number
  now: () => number
}

const defaults: LockDeps = { isPidAlive, pid: process.pid, now: Date.now }

export async function readLock(file: string): Promise<LockInfo | null> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<LockInfo>
    return typeof parsed.pid === 'number' && typeof parsed.runId === 'string'
      ? { pid: parsed.pid, runId: parsed.runId, startedAt: parsed.startedAt ?? 0 }
      : null
  } catch {
    return null
  }
}

/** `held` when the lock belongs to a live process, `stale` when its owner is gone, `free` when there is none. */
export async function lockState(
  file: string,
  deps: LockDeps = defaults
): Promise<{ state: 'free' } | { state: 'held' | 'stale'; info: LockInfo }> {
  const info = await readLock(file)
  if (!info) return { state: 'free' }
  return { state: deps.isPidAlive(info.pid) ? 'held' : 'stale', info }
}

/** One stress run at a time on this machine: the app, the ports and the load would otherwise disturb each other. */
export async function acquireRunLock(
  file: string,
  runId: string,
  deps: LockDeps = defaults
): Promise<{ release: () => Promise<void> }> {
  await mkdir(path.dirname(file), { recursive: true })
  const info: LockInfo = { pid: deps.pid, runId, startedAt: deps.now() }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(file, 'wx')
      await handle.writeFile(`${JSON.stringify(info)}\n`)
      await handle.close()
      return {
        release: async () => {
          if ((await readLock(file))?.pid === deps.pid) await unlink(file).catch(() => undefined)
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const current = await lockState(file, deps)
      if (current.state === 'held') {
        throw new RunRefused(
          `another stress run is active (pid ${current.info.pid}, run ${current.info.runId}); only one runs at a time`
        )
      }
      await unlink(file).catch(() => undefined)
    }
  }
  throw new RunRefused(`could not take the run lock ${file}`)
}
