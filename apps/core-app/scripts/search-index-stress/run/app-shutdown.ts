import { opendir } from 'node:fs/promises'
import path from 'node:path'
import { describeError } from './errors'
import type { ListProcesses } from './process-info'
import { descendantsOf, isElectronHelper } from './process-info'

export interface ShutdownDeps {
  listProcesses: ListProcesses
  isPidAlive: (pid: number) => boolean
  signal: (pid: number, signal: NodeJS.Signals) => void
  sleep: (ms: number) => Promise<void>
  now: () => number
  findMarkers: (profileDir: string) => Promise<string[]>
  log: (line: string) => void
}

export interface ShutdownTarget {
  wrapperPid: number
  /** Null when the launch failed before the Electron process showed up: only the wrapper is stopped then. */
  mainPid: number | null
  /** The command line the main process had at launch; a pid that now runs something else is never signalled. */
  mainCommand: string
  profileDir: string
  requestQuit: () => Promise<void>
}

export interface ShutdownTimings {
  /** After asking the app to quit through its own IPC. */
  ipcWaitMs: number
  /** After SIGTERM to the main process (the dev process manager turns it into app.quit()). */
  termWaitMs: number
  /** For the wrapper and the dev tooling below it once the app is gone. */
  wrapperWaitMs: number
}

export const DEFAULT_SHUTDOWN_TIMINGS: ShutdownTimings = {
  ipcWaitMs: 25_000,
  termWaitMs: 25_000,
  wrapperWaitMs: 15_000
}

export interface ShutdownOutcome {
  /** The app exited by itself and left no `*.running` marker: the next start will not repair anything. */
  clean: boolean
  how: 'already-gone' | 'ipc' | 'sigterm' | 'left-running'
  /** Processes of this run that are still alive; never killed, the boss decides. */
  leftPids: number[]
  markers: string[]
  detail: string
}

const POLL_MS = 250

/**
 * Stops the app the way a user quits it: the IPC close, then SIGTERM. There is no SIGKILL on
 * purpose: a killed app leaves `database.db.running` behind and the next start repairs the index.
 */
export async function shutdownApp(
  target: ShutdownTarget,
  deps: ShutdownDeps,
  timings: ShutdownTimings = DEFAULT_SHUTDOWN_TIMINGS
): Promise<ShutdownOutcome> {
  const startedAt = deps.now()
  const waitGone = async (pid: number, ms: number): Promise<boolean> => {
    const deadline = deps.now() + ms
    while (deps.isPidAlive(pid)) {
      if (deps.now() >= deadline) return false
      await deps.sleep(POLL_MS)
    }
    return true
  }
  const sameProcess = async (pid: number, expected: string | null): Promise<boolean> => {
    const found = (await deps.listProcesses()).find((proc) => proc.pid === pid)
    return found !== undefined && (expected === null || found.command === expected)
  }

  const procsBefore = await deps.listProcesses().catch(() => [])
  const tooling = descendantsOf(target.wrapperPid, procsBefore).filter(
    (proc) =>
      proc.pid !== target.mainPid &&
      !isElectronHelper(proc.command) &&
      !/ --type=/.test(proc.command)
  )

  let how: ShutdownOutcome['how'] = 'already-gone'
  const notes: string[] = []
  const mainPid = target.mainPid
  if (mainPid !== null && deps.isPidAlive(mainPid)) {
    how = 'ipc'
    await target
      .requestQuit()
      .catch((error: unknown) => notes.push(`quit request failed: ${describeError(error)}`))
    if (!(await waitGone(mainPid, timings.ipcWaitMs))) {
      how = 'sigterm'
      notes.push(`still running ${timings.ipcWaitMs} ms after the quit request`)
      if (await sameProcess(mainPid, target.mainCommand)) {
        deps.signal(mainPid, 'SIGTERM')
        await waitGone(mainPid, timings.termWaitMs)
      }
    }
    if (deps.isPidAlive(mainPid)) {
      how = 'left-running'
      notes.push(`still running ${timings.termWaitMs} ms after SIGTERM; left running`)
    }
  }

  const leftPids: number[] = []
  if (how === 'left-running' && mainPid !== null) leftPids.push(mainPid)

  if (how !== 'left-running') {
    if (
      !(await waitGone(target.wrapperPid, mainPid === null ? 0 : timings.wrapperWaitMs)) &&
      (await sameProcess(target.wrapperPid, null))
    ) {
      deps.signal(target.wrapperPid, 'SIGTERM')
      await waitGone(target.wrapperPid, 10_000)
    }
    for (const proc of tooling) {
      if (!deps.isPidAlive(proc.pid) || !(await sameProcess(proc.pid, proc.command))) continue
      deps.signal(proc.pid, 'SIGTERM')
      await waitGone(proc.pid, 5_000)
    }
    for (const pid of [target.wrapperPid, ...tooling.map((proc) => proc.pid)])
      if (deps.isPidAlive(pid)) leftPids.push(pid)
  }

  const markers = await deps.findMarkers(target.profileDir).catch(() => [])
  const clean = how !== 'left-running' && markers.length === 0
  if (markers.length > 0) notes.push(`running markers remain: ${markers.join(', ')}`)
  if (leftPids.length > 0 && how !== 'left-running')
    notes.push(`left running: ${leftPids.join(', ')}`)
  const detail = `${how === 'already-gone' ? 'the app was already gone' : `quit by ${how}`} after ${deps.now() - startedAt} ms${notes.length > 0 ? `; ${notes.join('; ')}` : ''}`
  return { clean, how, leftPids, markers, detail }
}

/** `*.running` files under the profile: the app writes one per database while it holds it open and removes it on a clean close. */
export async function findRunningMarkers(profileDir: string, limit = 50_000): Promise<string[]> {
  const found: string[] = []
  let seen = 0
  const visit = async (dir: string, depth: number): Promise<void> => {
    let handle
    try {
      handle = await opendir(dir)
    } catch {
      return
    }
    for await (const entry of handle) {
      if (++seen > limit) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < 6) await visit(full, depth + 1)
      } else if (entry.name.endsWith('.running')) {
        found.push(path.relative(profileDir, full))
      }
    }
  }
  await visit(profileDir, 0)
  return found.sort()
}
