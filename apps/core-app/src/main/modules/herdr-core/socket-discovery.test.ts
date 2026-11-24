import type { ChildProcess } from 'node:child_process'
import type { Socket } from 'node:net'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  discoverAndConnectHerdrSocket,
  HerdrDiscoveryError,
  resolveHerdrBinaryPath,
  resolveHerdrSocketPath
} from './socket-discovery'

function createFakeChild(): ChildProcess & {
  stdout: PassThrough
  stderr: PassThrough
  unref: ReturnType<typeof vi.fn>
} {
  const child = new EventEmitter() as ChildProcess & {
    stdout: PassThrough
    stderr: PassThrough
    unref: ReturnType<typeof vi.fn>
  }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.unref = vi.fn()
  return child
}

describe('herdr-core socket-discovery', () => {
  it('resolves socket path with strict priority: settings > HC_SOCKET > default Unix/Windows', () => {
    const baseDeps = {
      platform: 'darwin' as const,
      homedir: () => '/Users/tester',
      env: {
        HC_SOCKET: '/tmp/env.sock',
        HC_SESSION: 'work',
        XDG_STATE_HOME: '/tmp/xdg-state'
      }
    }

    expect(
      resolveHerdrSocketPath({ socketPath: '~/custom.sock', session: 'custom' }, baseDeps)
    ).toEqual({
      socketPath: '/Users/tester/custom.sock',
      session: 'custom',
      source: 'settings'
    })

    expect(resolveHerdrSocketPath({ socketPath: '' }, baseDeps)).toEqual({
      socketPath: '/tmp/env.sock',
      session: 'work',
      source: 'env'
    })

    expect(
      resolveHerdrSocketPath(
        { socketPath: '', session: '' },
        {
          platform: 'linux',
          homedir: () => '/home/tester',
          env: { HC_SESSION: 'dev', XDG_STATE_HOME: '/var/state' }
        }
      )
    ).toEqual({
      socketPath: '/var/state/herdr-core/dev/dev.sock',
      session: 'dev',
      source: 'default'
    })

    expect(
      resolveHerdrSocketPath(
        {},
        {
          platform: 'darwin',
          homedir: () => '/Users/tester',
          env: {}
        }
      )
    ).toEqual({
      socketPath: '/Users/tester/.local/state/herdr-core/default/default.sock',
      session: 'default',
      source: 'default'
    })

    expect(
      resolveHerdrSocketPath(
        { session: 'team' },
        {
          platform: 'win32',
          homedir: () => 'C:\\Users\\tester',
          env: {}
        }
      )
    ).toEqual({
      socketPath: '\\\\.\\pipe\\herdr-core-team',
      session: 'team',
      source: 'default'
    })
  })

  it('resolves binary path in strict order: settings > PATH > ~/.local/bin > macOS bundle > resourcesPath', async () => {
    const baseDeps = {
      platform: 'darwin' as const,
      homedir: () => '/Users/tester',
      resourcesPath: '/Applications/Tuff.app/Contents/Resources',
      env: { PATH: '/opt/custom/bin:/usr/bin' }
    }

    const allExecutable = async () => true
    expect(
      await resolveHerdrBinaryPath(
        { binaryPath: '~/bin/my-herdr' },
        { ...baseDeps, isExecutable: allExecutable }
      )
    ).toEqual({ binaryPath: '/Users/tester/bin/my-herdr', source: 'settings' })

    expect(
      await resolveHerdrBinaryPath(
        { binaryPath: '' },
        {
          ...baseDeps,
          isExecutable: async (p) => p === '/opt/custom/bin/herdr-core'
        }
      )
    ).toEqual({ binaryPath: '/opt/custom/bin/herdr-core', source: 'path' })

    expect(
      await resolveHerdrBinaryPath(
        {},
        {
          ...baseDeps,
          isExecutable: async (p) => p === '/Users/tester/.local/bin/herdr-core'
        }
      )
    ).toEqual({ binaryPath: '/Users/tester/.local/bin/herdr-core', source: 'local-bin' })

    expect(
      await resolveHerdrBinaryPath(
        {},
        {
          ...baseDeps,
          isExecutable: async (p) =>
            p ===
            '/Users/tester/.local/share/herdr-core/active/Herdr Core.app/Contents/MacOS/herdr-core'
        }
      )
    ).toEqual({
      binaryPath:
        '/Users/tester/.local/share/herdr-core/active/Herdr Core.app/Contents/MacOS/herdr-core',
      source: 'macos-bundle'
    })

    expect(
      await resolveHerdrBinaryPath(
        {},
        {
          ...baseDeps,
          isExecutable: async (p) =>
            p === '/Applications/Tuff.app/Contents/Resources/herdr-core/herdr-core' ||
            p === '/Applications/Tuff.app/Contents/Resources/herdr-core'
        }
      )
    ).toEqual({
      binaryPath: '/Applications/Tuff.app/Contents/Resources/herdr-core/herdr-core',
      source: 'resources'
    })

    expect(
      await resolveHerdrBinaryPath(
        {},
        {
          ...baseDeps,
          isExecutable: async (p) => p === '/Applications/Tuff.app/Contents/Resources/herdr-core'
        }
      )
    ).toEqual({
      binaryPath: '/Applications/Tuff.app/Contents/Resources/herdr-core',
      source: 'resources'
    })
  })

  it('connects externally when daemon is already listening without spawning anything', async () => {
    const fakeSocket = {} as Socket
    const spawn = vi.fn()
    const states: string[] = []

    const result = await discoverAndConnectHerdrSocket({
      settings: { autoStart: true },
      onStateChange: (phase) => states.push(phase),
      deps: {
        platform: 'darwin',
        homedir: () => '/Users/tester',
        env: {},
        isExecutable: async (p) => p === '/Users/tester/.local/bin/herdr-core',
        dial: vi.fn(async () => fakeSocket),
        spawn
      }
    })

    expect(result).toMatchObject({
      socket: fakeSocket,
      ownership: 'external',
      session: 'default',
      binaryPath: '/Users/tester/.local/bin/herdr-core'
    })
    expect(states).toEqual(['discovering', 'connecting'])
    expect(spawn).not.toHaveBeenCalled()
  })

  it('bootstraps managed daemon via `herdr-core server start` on ENOENT/ECONNREFUSED and retries dial', async () => {
    const fakeSocket = {} as Socket
    const states: string[] = []
    let attempts = 0
    const dial = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) {
        const err = new Error('missing socket') as Error & { code?: string }
        err.code = 'ENOENT'
        throw err
      }
      if (attempts === 2) {
        const err = new Error('starting up') as Error & { code?: string }
        err.code = 'ECONNREFUSED'
        throw err
      }
      return fakeSocket
    })

    const spawn = vi.fn(() => {
      const child = createFakeChild()
      queueMicrotask(() => child.emit('exit', 0, null))
      return child
    })

    const result = await discoverAndConnectHerdrSocket({
      settings: { autoStart: true, session: 'demo' },
      onStateChange: (phase) => states.push(phase),
      deps: {
        platform: 'darwin',
        homedir: () => '/Users/tester',
        env: {},
        isExecutable: async (p) => p === '/Users/tester/.local/bin/herdr-core',
        dial,
        spawn,
        sleep: async () => undefined
      }
    })

    expect(result.ownership).toBe('managed')
    expect(result.socket).toBe(fakeSocket)
    expect(states).toEqual(['discovering', 'connecting', 'bootstrapping', 'connecting'])
    expect(spawn).toHaveBeenCalledWith(
      '/Users/tester/.local/bin/herdr-core',
      ['server', 'start', '--json'],
      expect.objectContaining({
        detached: true,
        windowsHide: true,
        env: expect.objectContaining({ HC_SESSION: 'demo' })
      })
    )
  })

  it('fails with CORE_NOT_RUNNING when autoStart is false and does not spawn', async () => {
    const spawn = vi.fn()
    await expect(
      discoverAndConnectHerdrSocket({
        settings: { autoStart: false },
        deps: {
          platform: 'darwin',
          homedir: () => '/Users/tester',
          env: {},
          isExecutable: async () => true,
          dial: async () => {
            const err = new Error('refused') as Error & { code?: string }
            err.code = 'ECONNREFUSED'
            throw err
          },
          spawn
        }
      })
    ).rejects.toMatchObject({ code: 'CORE_NOT_RUNNING' })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('fails with BINARY_NOT_FOUND when autoStart is true and binary is missing', async () => {
    await expect(
      discoverAndConnectHerdrSocket({
        settings: { autoStart: true },
        deps: {
          platform: 'darwin',
          homedir: () => '/Users/tester',
          env: {},
          isExecutable: async () => false,
          dial: async () => {
            const err = new Error('missing') as Error & { code?: string }
            err.code = 'ENOENT'
            throw err
          }
        }
      })
    ).rejects.toMatchObject({ code: 'BINARY_NOT_FOUND' })
  })

  it('enforces bounded bootstrap timeout and unrefs stalled child process', async () => {
    const child = createFakeChild()
    await expect(
      discoverAndConnectHerdrSocket({
        settings: { autoStart: true },
        bootstrapTimeoutMs: 25,
        deps: {
          platform: 'darwin',
          homedir: () => '/Users/tester',
          env: {},
          isExecutable: async (p) => p === '/Users/tester/.local/bin/herdr-core',
          dial: async () => {
            const err = new Error('missing') as Error & { code?: string }
            err.code = 'ENOENT'
            throw err
          },
          spawn: () => child
        }
      })
    ).rejects.toBeInstanceOf(HerdrDiscoveryError)
    expect(child.unref).toHaveBeenCalled()
  })
})
