import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import type { OSAdapter } from '@talex-touch/utils/electron/env-tool'
import { withOSAdapter } from '@talex-touch/utils/electron/env-tool'
import { app, dialog } from 'electron'
import { mainLog } from '../utils/logger'

const execFileAsync = promisify(execFile)

const RELEASE_EXECUTABLE_NAME = 'tuff'
const RELEASE_EXECUTABLE_NAME_WIN = `${RELEASE_EXECUTABLE_NAME}.exe`
const GRACEFUL_SHUTDOWN_WAIT_MS = 1500
const FORCE_SHUTDOWN_WAIT_MS = 500

type VersionChoice = 'use-dev' | 'keep-release'

interface StartupVersionGuardDeps {
  isPackaged: () => boolean
  quit: () => void
  showErrorBox: (title: string, content: string) => void
  findRunningReleasePids: () => Promise<number[]>
  promptVersionChoice: () => Promise<VersionChoice>
  terminateReleasePids: (pids: number[]) => Promise<boolean>
}

function createStartupVersionGuardDeps(): StartupVersionGuardDeps {
  return {
    isPackaged: () => app.isPackaged,
    quit: () => app.quit(),
    showErrorBox: (title: string, content: string) => {
      dialog.showErrorBox(title, content)
    },
    findRunningReleasePids,
    promptVersionChoice,
    terminateReleasePids
  }
}

let startupVersionGuardDeps: StartupVersionGuardDeps = createStartupVersionGuardDeps()

export function setStartupVersionGuardDepsForTest(
  overrides: Partial<StartupVersionGuardDeps>
): void {
  startupVersionGuardDeps = {
    ...startupVersionGuardDeps,
    ...overrides
  }
}

export function resetStartupVersionGuardDepsForTest(): void {
  startupVersionGuardDeps = createStartupVersionGuardDeps()
}

async function execFileOutput(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args)
    return typeof stdout === 'string' ? stdout.trim() : null
  } catch {
    return null
  }
}

async function execFileSuccess(command: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(command, args)
    return true
  } catch {
    return false
  }
}

async function findUnixReleasePids(): Promise<number[]> {
  const pgrepOutput = await execFileOutput('pgrep', ['-x', RELEASE_EXECUTABLE_NAME])
  if (pgrepOutput) {
    return parsePidsFromOutput(pgrepOutput)
  }

  const psOutput = await execFileOutput('ps', ['-A', '-o', 'pid=,comm='])
  if (!psOutput) return []

  const matched = new Set<number>()
  const rows = psOutput.split(/\r?\n/)

  for (const row of rows) {
    const line = row.trim()
    if (!line) continue

    const match = line.match(/^(\d+)\s+(.+)$/)
    if (!match) continue

    const pid = Number.parseInt(match[1], 10)
    const executable = path.basename(match[2]).toLowerCase()

    if (!Number.isInteger(pid) || pid <= 0) continue
    if (executable === RELEASE_EXECUTABLE_NAME || executable === RELEASE_EXECUTABLE_NAME_WIN) {
      matched.add(pid)
    }
  }

  return Array.from(matched)
}

export function parsePidsFromOutput(text: string): number[] {
  const pidSet = new Set<number>()
  const rows = text.split(/\r?\n/)

  for (const row of rows) {
    const line = row.trim()
    if (!line) continue
    if (line.toUpperCase().startsWith('INFO:')) continue

    const tasklistMatch = line.match(/^"[^"]+","(\d+)"/)
    if (tasklistMatch) {
      pidSet.add(Number.parseInt(tasklistMatch[1], 10))
      continue
    }

    if (/^\d+$/.test(line)) {
      pidSet.add(Number.parseInt(line, 10))
      continue
    }

    const leadingPidMatch = line.match(/^(\d+)\s+/)
    if (leadingPidMatch) {
      pidSet.add(Number.parseInt(leadingPidMatch[1], 10))
    }
  }

  return Array.from(pidSet).filter((pid) => Number.isInteger(pid) && pid > 0)
}

function withOSAdapterSafe<R, T>(options: OSAdapter<R, T>): T | undefined {
  return withOSAdapter(options)
}

export async function findRunningReleasePids(): Promise<number[]> {
  const pids =
    (await withOSAdapterSafe<void, Promise<number[]>>({
      win32: async () => {
        const output = await execFileOutput('tasklist', [
          '/FI',
          `IMAGENAME eq ${RELEASE_EXECUTABLE_NAME_WIN}`,
          '/FO',
          'CSV',
          '/NH'
        ])
        return parsePidsFromOutput(output ?? '')
      },
      darwin: async () => {
        return await findUnixReleasePids()
      },
      linux: async () => {
        return await findUnixReleasePids()
      }
    })) ?? []

  return Array.from(new Set(pids)).filter((pid) => pid > 0 && pid !== process.pid)
}

export async function promptVersionChoice(): Promise<VersionChoice> {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Release Version Is Already Running',
    message: 'A release build is currently running.',
    detail: 'You are starting the development build. Which version do you want to keep running?',
    buttons: ['Use Development Build', 'Keep Release Build'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  })

  return response === 0 ? 'use-dev' : 'keep-release'
}

function terminateUnixPid(pid: number, force: boolean): boolean {
  const signal: NodeJS.Signals = force ? 'SIGKILL' : 'SIGTERM'
  try {
    process.kill(pid, signal)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'ESRCH'
  }
}

export async function terminatePid(pid: number, force: boolean): Promise<boolean> {
  const terminated =
    (await withOSAdapterSafe<{ pid: number; force: boolean }, Promise<boolean>>({
      onBeforeExecute: () => ({ pid, force }),
      win32: async (payload) => {
        const args = ['/PID', `${payload.pid}`, '/T']
        if (payload.force) {
          args.push('/F')
        }
        const success = await execFileSuccess('taskkill', args)
        return success || !isPidAlive(payload.pid)
      },
      darwin: async (payload) => {
        return terminateUnixPid(payload.pid, payload.force)
      },
      linux: async (payload) => {
        return terminateUnixPid(payload.pid, payload.force)
      }
    })) ?? false

  return terminated || !isPidAlive(pid)
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function terminateReleasePids(pids: number[]): Promise<boolean> {
  const targetPids = Array.from(new Set(pids)).filter((pid) => pid > 0 && pid !== process.pid)
  if (targetPids.length === 0) return true

  mainLog.warn('Startup guard: trying graceful shutdown for release build', {
    meta: { pids: targetPids.join(', ') }
  })

  await Promise.all(targetPids.map((pid) => terminatePid(pid, false)))
  await sleep(GRACEFUL_SHUTDOWN_WAIT_MS)

  let remainingPids = targetPids.filter((pid) => isPidAlive(pid))
  if (remainingPids.length === 0) {
    mainLog.info('Startup guard: graceful shutdown completed for release build')
    return true
  }

  mainLog.warn('Startup guard: forcing release build shutdown', {
    meta: { pids: remainingPids.join(', ') }
  })

  await Promise.all(remainingPids.map((pid) => terminatePid(pid, true)))
  await sleep(FORCE_SHUTDOWN_WAIT_MS)

  remainingPids = remainingPids.filter((pid) => isPidAlive(pid))
  if (remainingPids.length > 0) {
    mainLog.error('Startup guard: release build still running after force kill', {
      meta: { pids: remainingPids.join(', ') }
    })
    return false
  }

  mainLog.info('Startup guard: forced shutdown completed for release build')
  return true
}

export async function enforceDevReleaseStartupConstraint(): Promise<boolean> {
  if (startupVersionGuardDeps.isPackaged()) {
    return true
  }

  mainLog.info('Startup guard: checking running release build before dev boot')

  const releasePids = await startupVersionGuardDeps.findRunningReleasePids()
  if (releasePids.length === 0) {
    mainLog.debug('Startup guard: no release build detected')
    return true
  }

  mainLog.warn('Startup guard: detected running release build', {
    meta: { pids: releasePids.join(', ') }
  })

  const choice = await startupVersionGuardDeps.promptVersionChoice()
  mainLog.info('Startup guard: user selected startup mode', {
    meta: { choice }
  })

  if (choice === 'keep-release') {
    mainLog.info('Startup guard: keeping release build, aborting dev startup')
    startupVersionGuardDeps.quit()
    return false
  }

  const terminated = await startupVersionGuardDeps.terminateReleasePids(releasePids)
  if (terminated) {
    mainLog.info('Startup guard: release build stopped, continuing dev startup')
    return true
  }

  startupVersionGuardDeps.showErrorBox(
    'Unable to stop release build',
    'Failed to stop the running release build. Please close it manually and restart the development build.'
  )
  startupVersionGuardDeps.quit()
  return false
}
