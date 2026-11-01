import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findRunningMarkers, shutdownApp, type ShutdownTarget } from './app-shutdown'
import { Machine } from './test-support/fake-machine'

const MAIN_COMMAND =
  '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . --inspect=9300'

function appMachine(): Machine {
  const machine = new Machine()
  machine.add(100, 1, 'node /repo/apps/core-app/scripts/dev-electron-wrapper.mjs --inspect 9300')
  machine.add(101, 100, 'node electron-vite dev')
  machine.add(102, 101, MAIN_COMMAND)
  machine.add(
    103,
    102,
    '/repo/Electron Helper.app/Contents/MacOS/Electron Helper --type=gpu-process'
  )
  return machine
}

const target = (_machine: Machine, requestQuit: () => Promise<void>): ShutdownTarget => ({
  wrapperPid: 100,
  mainPid: 102,
  mainCommand: MAIN_COMMAND,
  profileDir: '/profile',
  requestQuit
})

function quitAll(machine: Machine): void {
  for (const pid of [102, 103, 101, 100]) machine.exit(pid)
}

describe('shutdownApp', () => {
  it('quits through the IPC close and is clean when the app leaves no marker', async () => {
    const machine = appMachine()
    const outcome = await shutdownApp(
      target(machine, async () => machine.after(2_000, () => quitAll(machine))),
      machine.deps()
    )

    expect(outcome).toMatchObject({ clean: true, how: 'ipc', leftPids: [], markers: [] })
    expect(machine.signals).toEqual([])
  })

  it('falls back to SIGTERM on the main process when the IPC close is ignored', async () => {
    const machine = appMachine()
    machine.onSignal = (pid) => {
      if (pid === 102) machine.after(3_000, () => quitAll(machine))
    }
    const outcome = await shutdownApp(
      target(machine, async () => undefined),
      machine.deps()
    )

    expect(outcome).toMatchObject({ clean: true, how: 'sigterm', leftPids: [] })
    expect(machine.signals).toEqual([[102, 'SIGTERM']])
    expect(outcome.detail).toContain('after the quit request')
  })

  it('leaves the app running and names its pid when it ignores both, and never sends SIGKILL', async () => {
    const machine = appMachine()
    const outcome = await shutdownApp(
      target(machine, async () => undefined),
      machine.deps(),
      { ipcWaitMs: 1_000, termWaitMs: 1_000, wrapperWaitMs: 1_000 }
    )

    expect(outcome).toMatchObject({ clean: false, how: 'left-running', leftPids: [102] })
    expect(machine.signals.map(([, signal]) => signal)).toEqual(['SIGTERM'])
    expect(machine.signals.every(([pid]) => pid === 102)).toBe(true)
  })

  it('does not signal a pid that now belongs to some other program', async () => {
    const machine = appMachine()
    machine.procs.get(102)!.command = '/usr/bin/some-other-program'
    const outcome = await shutdownApp(
      target(machine, async () => undefined),
      machine.deps(),
      { ipcWaitMs: 500, termWaitMs: 500, wrapperWaitMs: 500 }
    )

    expect(machine.signals).toEqual([])
    expect(outcome.how).toBe('left-running')
  })

  it('is not clean when a running marker remains even though everything exited', async () => {
    const machine = appMachine()
    machine.markers = ['tuff-dev/database.db.running']
    const outcome = await shutdownApp(
      target(machine, async () => machine.after(100, () => quitAll(machine))),
      machine.deps()
    )

    expect(outcome.clean).toBe(false)
    expect(outcome.how).toBe('ipc')
    expect(outcome.markers).toEqual(['tuff-dev/database.db.running'])
    expect(outcome.detail).toContain('database.db.running')
  })

  it('asks a lingering wrapper to stop, and reports one that will not', async () => {
    const stubborn = appMachine()
    const outcome = await shutdownApp(
      target(stubborn, async () =>
        stubborn.after(100, () => {
          stubborn.exit(102)
          stubborn.exit(103)
        })
      ),
      stubborn.deps(),
      { ipcWaitMs: 5_000, termWaitMs: 5_000, wrapperWaitMs: 1_000 }
    )

    expect(stubborn.signals.some(([pid, signal]) => pid === 100 && signal === 'SIGTERM')).toBe(true)
    expect(outcome.leftPids).toContain(100)
    expect(outcome.clean).toBe(true)
    expect(outcome.how).toBe('ipc')
  })

  it('does nothing to a run whose app already exited', async () => {
    const machine = appMachine()
    quitAll(machine)
    let asked = false
    const outcome = await shutdownApp(
      target(machine, async () => void (asked = true)),
      machine.deps()
    )

    expect(asked).toBe(false)
    expect(outcome).toMatchObject({ clean: true, how: 'already-gone' })
  })

  it('survives a quit request that throws', async () => {
    const machine = appMachine()
    machine.onSignal = (pid) => {
      if (pid === 102) machine.after(100, () => quitAll(machine))
    }
    const outcome = await shutdownApp(
      target(machine, async () => {
        throw new Error('page is gone')
      }),
      machine.deps(),
      { ipcWaitMs: 500, termWaitMs: 5_000, wrapperWaitMs: 1_000 }
    )

    expect(outcome.how).toBe('sigterm')
    expect(outcome.detail).toContain('page is gone')
  })
})

describe('findRunningMarkers', () => {
  let dir = ''
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = ''
  })

  it('finds marker files at any depth and nothing else', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stress-markers-'))
    await mkdir(path.join(dir, 'tuff-dev', 'database'), { recursive: true })
    await writeFile(path.join(dir, 'tuff-dev', 'database', 'database.db'), '')
    await writeFile(path.join(dir, 'tuff-dev', 'database', 'database.db.running'), '')
    await writeFile(path.join(dir, 'tuff-dev', 'notes.txt'), '')

    expect(await findRunningMarkers(dir)).toEqual(['tuff-dev/database/database.db.running'])
  })

  it('answers an empty list for a profile that does not exist', async () => {
    expect(await findRunningMarkers('/private/tmp/definitely-not-a-profile-dir')).toEqual([])
  })
})
