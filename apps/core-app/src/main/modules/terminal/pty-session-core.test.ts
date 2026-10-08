import type { WebContents } from 'electron'
import type { IPty } from 'node-pty'
import type { PtySessionExit, PtySessionOwner } from './pty-session-core'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PtySessionCore } from './pty-session-core'

function sender(id = 7) {
  const value = new EventEmitter() as EventEmitter & { id: number; isDestroyed: () => boolean }
  value.id = id
  value.isDestroyed = () => false
  return value
}
function processFixture() {
  const data = new Set<(value: string) => void>()
  const exit = new Set<(value: { exitCode: number; signal?: number }) => void>()
  const writes: string[] = []
  const resizes: Array<[number, number]> = []
  const kills: string[] = []
  const process = {
    write: (value: string) => {
      writes.push(value)
    },
    resize: (cols: number, rows: number) => {
      resizes.push([cols, rows])
    },
    kill: (signal: string) => {
      kills.push(signal)
      exit.forEach((listener) => listener({ exitCode: 0, signal: 9 }))
    },
    onData: (listener: (value: string) => void) => {
      data.add(listener)
      return {
        dispose: () => {
          data.delete(listener)
        }
      }
    },
    onExit: (listener: (value: { exitCode: number; signal?: number }) => void) => {
      exit.add(listener)
      return {
        dispose: () => {
          exit.delete(listener)
        }
      }
    }
  }
  return {
    process,
    writes,
    resizes,
    kills,
    output: (value: string) => data.forEach((listener) => listener(value)),
    finish: (exitCode: number) => exit.forEach((listener) => listener({ exitCode })),
    listenerCount: () => data.size + exit.size
  }
}
const cores: PtySessionCore[] = []
afterEach(async () => {
  await Promise.all(cores.splice(0).map((core) => core.closeScope('test')))
})
function fixture() {
  const child = processFixture()
  const source = sender()
  const owner: PtySessionOwner = { scope: 'test', sender: source as unknown as WebContents }
  const spawn = vi.fn(() => child.process as unknown as IPty)
  const core = new PtySessionCore({
    loadPty: async () => ({ spawn }),
    resolveExecutable: async () => '/test/node'
  })
  cores.push(core)
  const events: Array<string | PtySessionExit> = []
  let releases = 0
  const create = () =>
    core.create({
      owner,
      command: 'node',
      args: ['-e', '1'],
      cols: 90,
      rows: 27,
      onData: (_id, value) => events.push(value),
      onExit: (_id, value) => events.push(value),
      onDispose: () => {
        releases += 1
      }
    })
  return { core, child, source, owner, spawn, events, create, releases: () => releases }
}

describe('shared PTY sessions', () => {
  it.each(['sender', 'plugin', 'scope'] as const)(
    'rejects another %s with the same missing-session error and leaves the owner operational',
    async (kind) => {
      const f = fixture()
      const { id } = await f.create()
      const foreign = { ...f.owner }
      if (kind === 'sender') foreign.sender = sender(7) as unknown as WebContents
      if (kind === 'plugin') foreign.pluginKey = 'other-plugin'
      if (kind === 'scope') foreign.scope = 'other-domain'
      for (const target of [id, 'unknown']) {
        expect(() => f.core.write(target, foreign, 'attack')).toThrow('TERMINAL_SESSION_NOT_FOUND')
        expect(() => f.core.resize(target, foreign, 120, 40)).toThrow('TERMINAL_SESSION_NOT_FOUND')
        await expect(f.core.close(target, foreign)).resolves.toBe(false)
      }
      f.core.write(id, f.owner, 'hello\r\u0003')
      f.core.resize(id, f.owner, 121, 41)
      expect(f.child.writes).toEqual(['hello\r\u0003'])
      expect(f.child.resizes).toEqual([[121, 41]])
      expect(f.child.kills).toEqual([])
    }
  )

  it('rejects invalid or already destroyed identities before spawning', async () => {
    const f = fixture()
    for (const invalid of [
      undefined,
      { scope: 'test' },
      { ...f.owner, sender: { id: 7, isDestroyed: () => true } }
    ]) {
      await expect(
        f.core.create({
          owner: invalid as PtySessionOwner,
          command: 'node',
          onData: () => undefined,
          onExit: () => undefined
        })
      ).rejects.toThrow('TERMINAL_CALLER_INVALID')
    }
    expect(f.spawn).not.toHaveBeenCalled()
  })

  it('preserves full output order and exit, removes resources, and ignores late output', async () => {
    const f = fixture()
    const { id } = await f.create()
    const large = `\u001B[31m中文\u001B[0m${'x'.repeat(100_000)}`
    f.child.output(large)
    f.child.output('last')
    f.child.finish(8)
    f.child.output('late')
    f.child.finish(0)
    expect(f.events).toEqual([large, 'last', { exitCode: 8 }])
    expect(f.releases()).toBe(1)
    expect(f.child.listenerCount()).toBe(0)
    expect(f.source.listenerCount('destroyed')).toBe(0)
    await expect(f.core.close(id, f.owner)).resolves.toBe(false)
    expect(f.child.kills).toEqual([])
  })

  it.each(['close', 'destroy', 'crash', 'navigation', 'abort', 'scope'] as const)(
    '%s converges on one kill, one exit and one lease release',
    async (action) => {
      const f = fixture()
      const controller = new AbortController()
      let releases = 0
      const { id } = await f.core.create({
        owner: f.owner,
        command: 'node',
        signal: controller.signal,
        onData: (_id, value) => f.events.push(value),
        onExit: (_id, value) => f.events.push(value),
        onDispose: () => {
          releases += 1
        }
      })
      if (action === 'close') await f.core.close(id, f.owner)
      if (action === 'destroy') f.source.emit('destroyed')
      if (action === 'crash') f.source.emit('render-process-gone')
      if (action === 'navigation')
        f.source.emit('did-start-navigation', {
          isMainFrame: true,
          isSameDocument: false,
          url: 'about:blank'
        })
      if (action === 'abort') controller.abort()
      if (action === 'scope') await f.core.closeScope('test')
      await f.core.close(id, f.owner)
      f.source.emit('destroyed')
      controller.abort()
      await f.core.closeScope('test')
      f.child.finish(9)
      f.child.output('late')
      expect(f.child.kills).toEqual(['SIGKILL'])
      expect(f.events).toEqual([{ exitCode: null, signal: 9 }])
      expect(releases).toBe(1)
      expect(f.child.listenerCount()).toBe(0)
      expect(f.source.listenerCount('destroyed')).toBe(0)
      expect(f.source.listenerCount('render-process-gone')).toBe(0)
      expect(f.source.listenerCount('did-start-navigation')).toBe(0)
    }
  )

  it('handles a PTY that immediately emits data and exit while listeners attach', async () => {
    const f = fixture()
    f.child.process.onData = (listener) => {
      listener('first')
      return { dispose: () => undefined }
    }
    f.child.process.onExit = (listener) => {
      listener({ exitCode: 3 })
      return { dispose: () => undefined }
    }
    const { id } = await f.create()
    expect(f.events).toEqual(['first', { exitCode: 3 }])
    expect(f.releases()).toBe(1)
    expect(f.source.listenerCount('destroyed')).toBe(0)
    await expect(f.core.close(id, f.owner)).resolves.toBe(false)
  })

  it.each(['abort', 'destroy'] as const)(
    'rechecks %s after asynchronous executable resolution before spawning',
    async (action) => {
      const f = fixture()
      let resolve!: (path: string) => void
      let entered!: () => void
      const lookupStarted = new Promise<void>((accept) => {
        entered = accept
      })
      const core = new PtySessionCore({
        loadPty: async () => ({ spawn: f.spawn }),
        resolveExecutable: () => {
          entered()
          return new Promise<string>((accept) => {
            resolve = accept
          })
        }
      })
      cores.push(core)
      const controller = new AbortController()
      const pending = core.create({
        owner: f.owner,
        command: 'node',
        signal: controller.signal,
        onData: () => undefined,
        onExit: () => undefined
      })
      const rejection = expect(pending).rejects.toThrow(
        action === 'abort' ? 'TERMINAL_CREATE_CANCELLED' : 'TERMINAL_CALLER_INVALID'
      )
      await lookupStarted
      if (action === 'abort') controller.abort()
      else f.source.isDestroyed = () => true
      resolve('/test/node')
      await rejection
      expect(f.spawn).not.toHaveBeenCalled()
    }
  )

  it('surfaces PTY launch failure without publishing an exit for a nonexistent session', async () => {
    const f = fixture()
    f.spawn.mockImplementationOnce(() => {
      throw new Error('native failure')
    })
    await expect(f.create()).rejects.toThrow('TERMINAL_SPAWN_FAILED')
    expect(f.events).toEqual([])
    expect(f.source.listenerCount('destroyed')).toBe(0)
  })
})

describe('pTY owner navigation and synchronous exit', () => {
  it('keeps same-document and child-frame navigation operational, closing only on a new main document', async () => {
    const f = fixture()
    const { id } = await f.create()
    f.source.emit('did-start-navigation', {
      isMainFrame: true,
      isSameDocument: true,
      url: '#fragment'
    })
    f.core.write(id, f.owner, 'same document')
    f.source.emit('did-start-navigation', {
      isMainFrame: false,
      isSameDocument: false,
      url: 'child-frame'
    })
    f.core.write(id, f.owner, 'child frame')
    expect(f.child.writes).toEqual(['same document', 'child frame'])
    expect(f.child.kills).toEqual([])
    f.source.emit('did-start-navigation', {
      isMainFrame: true,
      isSameDocument: false,
      url: 'new-main-document'
    })
    expect(f.child.kills).toEqual(['SIGKILL'])
    expect(f.events).toEqual([{ exitCode: null, signal: 9 }])
    expect(f.source.listenerCount('did-start-navigation')).toBe(0)
  })

  it('preserves a synchronous native exit result during explicit close without duplicate disposal', async () => {
    const f = fixture()
    f.child.process.kill = (signal) => {
      f.child.kills.push(signal)
      f.child.finish(137)
    }
    const { id } = await f.create()
    await f.core.close(id, f.owner)
    await f.core.close(id, f.owner)
    expect(f.events).toEqual([{ exitCode: 137 }])
    expect(f.releases()).toBe(1)
    expect(f.child.kills).toEqual(['SIGKILL'])
  })
})

describe('pTY executable resolution', () => {
  it('rejects missing executables and directories before native spawn and releases the owner watcher', async () => {
    const root = await mkdtemp(join(tmpdir(), 'terminal-executable-'))
    try {
      const f = fixture()
      const core = new PtySessionCore({ loadPty: async () => ({ spawn: f.spawn }) })
      cores.push(core)
      for (const command of [join(root, 'missing'), root]) {
        await expect(
          core.create({
            owner: f.owner,
            command,
            onData: (_id, data) => f.events.push(data),
            onExit: (_id, exit) => f.events.push(exit)
          })
        ).rejects.toThrow('TERMINAL_EXECUTABLE_NOT_FOUND')
      }
      expect(f.spawn).not.toHaveBeenCalled()
      expect(f.events).toEqual([])
      expect(f.source.listenerCount('destroyed')).toBe(0)
      expect(f.source.listenerCount('did-start-navigation')).toBe(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('pTY close exit barrier', () => {
  it('does not release a lease or resolve repeated close until the native process really exits', async () => {
    const f = fixture()
    f.child.process.kill = (signal) => {
      f.child.kills.push(signal)
    }
    try {
      const { id } = await f.create()
      let settled = false
      const first = f.core.close(id, f.owner).then((result) => {
        settled = true
        return result
      })
      const second = f.core.close(id, f.owner)
      await Promise.resolve()
      expect(settled).toBe(false)
      expect(f.releases()).toBe(0)
      expect(f.events).toEqual([])
      expect(f.child.listenerCount()).toBe(2)
      expect(f.child.kills).toEqual(['SIGKILL'])
      expect(() => f.core.write(id, f.owner, 'too late')).toThrow('TERMINAL_SESSION_CLOSED')
      expect(() => f.core.resize(id, f.owner, 120, 40)).toThrow('TERMINAL_SESSION_CLOSED')
      f.child.finish(137)
      await expect(first).resolves.toBe(true)
      await expect(second).resolves.toBe(true)
      expect(f.releases()).toBe(1)
      expect(f.events).toEqual([{ exitCode: 137 }])
      expect(f.child.listenerCount()).toBe(0)
      await expect(f.core.close(id, f.owner)).resolves.toBe(false)
    } finally {
      f.child.finish(137)
    }
  })
})

describe('pTY creation cancellation tokens', () => {
  it('cancels a reserved creation before it can spawn, even when the original request resumes later', async () => {
    const f = fixture()
    const token = 'cancel-before-spawn'
    const creation = f.core.reserveCreate(f.owner, token)
    await expect(f.core.cancelCreation(token, f.owner)).resolves.toBe(true)
    await expect(
      f.core.create({
        owner: f.owner,
        command: 'node',
        creation,
        onData: (_id, data) => f.events.push(data),
        onExit: (_id, exit) => f.events.push(exit)
      })
    ).rejects.toThrow('TERMINAL_CREATE_CANCELLED')
    expect(f.spawn).not.toHaveBeenCalled()
    expect(f.events).toEqual([])
    expect(f.source.listenerCount('destroyed')).toBe(0)
    await expect(f.core.cancelCreation(token, f.owner)).resolves.toBe(false)
  })

  it('isolates identical tokens across concrete owners and refuses an unregistered sender with the same numeric id', async () => {
    const f = fixture()
    const secondChild = processFixture()
    f.spawn
      .mockImplementationOnce(() => f.child.process as unknown as IPty)
      .mockImplementationOnce(() => secondChild.process as unknown as IPty)
    const secondOwner = { ...f.owner, sender: sender(7) as unknown as WebContents }
    const unknownOwner = { ...f.owner, sender: sender(7) as unknown as WebContents }
    const token = 'shared-token'
    const firstCreation = f.core.reserveCreate(f.owner, token)
    const secondCreation = f.core.reserveCreate(secondOwner, token)
    await f.core.create({
      owner: f.owner,
      command: 'node',
      creation: firstCreation,
      onData: () => undefined,
      onExit: () => undefined
    })
    const active = await f.core.create({
      owner: secondOwner,
      command: 'node',
      creation: secondCreation,
      onData: () => undefined,
      onExit: () => undefined
    })
    await expect(f.core.cancelCreation(token, unknownOwner)).resolves.toBe(false)
    await expect(f.core.cancelCreation('unknown-token', unknownOwner)).resolves.toBe(false)
    await expect(f.core.cancelCreation(token, f.owner)).resolves.toBe(true)
    f.core.write(active.id, secondOwner, 'still operational')
    expect(f.child.kills).toEqual(['SIGKILL'])
    expect(secondChild.kills).toEqual([])
    expect(secondChild.writes).toEqual(['still operational'])
  })
})
