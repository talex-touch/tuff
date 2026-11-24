import type { HerdrSessionView } from '@talex-touch/utils/transport/events/herdr'
import type { HerdrRuntimePlane } from './runtime-plane'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import {
  DefaultHerdrAcpCapabilityBridge,
  HERDR_ACP_CLIENT_CAPABILITIES
} from './acp-capability-bridge'

function makeSession(overrides: Partial<HerdrSessionView> = {}): HerdrSessionView {
  return {
    address: 't10',
    machine: null,
    name: null,
    title: '',
    argv: ['/bin/sh'],
    cwd: '/workspace',
    foregroundName: 'sh',
    foregroundCwd: '/workspace',
    foregroundPid: 100,
    state: 'live',
    status: null,
    statusMs: null,
    reported: false,
    turn: 0,
    keep: false,
    template: null,
    parent: null,
    labels: {},
    cols: 80,
    rows: 24,
    pid: 100,
    exitCode: null,
    signal: null,
    reason: null,
    screen: 'exact',
    createdMs: 1000,
    finishedMs: null,
    ...overrides
  }
}

function createMockPlane() {
  const terminals = {
    list: vi.fn(async () => []),
    get: vi.fn(async (address: string) => makeSession({ address })),
    run: vi.fn(async () => makeSession({ address: 't10' })),
    send: vi.fn(async () => ({ turn: 1, status: 'working', started: true })),
    keys: vi.fn(async () => ({ turn: 1, status: 'idle' })),
    control: vi.fn(),
    interrupt: vi.fn(),
    kill: vi.fn(async (address: string) => ({
      terminal: address,
      action: 'kill' as const,
      session: makeSession({ address, state: 'finished', exitCode: null, signal: 15 })
    })),
    rm: vi.fn(async (address: string) => ({
      terminal: address,
      action: 'rm' as const,
      removed: address
    })),
    keep: vi.fn(),
    label: vi.fn(),
    read: vi.fn(async () => ({
      text: 'hello output',
      complete: true,
      how: 'history',
      why: null
    })),
    put: vi.fn(),
    wait: vi.fn(async () => ({ ended: true, reason: 'exited', exit_code: 0 })),
    attach: vi.fn()
  }

  const files = {
    read: vi.fn(async () => ({ text: 'line1\nline2\n', first: 1, last: 2, lines: 2 })),
    write: vi.fn(async (req: { path: string; data: string }) => ({
      path: req.path,
      bytes: Buffer.from(req.data, 'base64').length
    })),
    edit: vi.fn(async (req: { path: string }) => ({ path: req.path, bytes: 10 }))
  }

  const execFn = vi.fn(async () => ({
    code: 0,
    signal: null,
    stdout: Buffer.from('ok').toString('base64'),
    stderr: '',
    truncated: false,
    timedOut: false,
    ms: 5
  }))

  const plane = {
    terminals,
    files,
    exec: Object.assign(execFn, { run: execFn }),
    machines: { list: vi.fn(async () => []), connect: vi.fn() },
    docs: { get: vi.fn(), set: vi.fn() }
  } as unknown as HerdrRuntimePlane

  return { plane, terminals, files, execFn }
}

describe('DefaultHerdrAcpCapabilityBridge', () => {
  it('routes fs/* and terminal/* requests through HerdrRuntimePlane with optional remote machine binding', async () => {
    const { plane, files, terminals } = createMockPlane()
    terminals.run.mockResolvedValueOnce(makeSession({ address: 'vps/t42', machine: 'vps' }))
    terminals.get.mockResolvedValueOnce(makeSession({ address: 'vps/t42', state: 'live' }))
    terminals.get.mockResolvedValueOnce(makeSession({ address: 'vps/t42', state: 'live' }))
    terminals.get.mockResolvedValueOnce(
      makeSession({ address: 'vps/t42', state: 'finished', exitCode: 0, signal: null })
    )
    terminals.get.mockResolvedValueOnce(
      makeSession({ address: 'vps/t42', state: 'finished', exitCode: 0, signal: null })
    )

    const authorize = vi.fn(async () => true)
    const bridge = new DefaultHerdrAcpCapabilityBridge({
      id: 'bridge-remote',
      plane,
      machine: 'vps',
      cwd: '/srv/app',
      authorize
    })

    expect(HERDR_ACP_CLIENT_CAPABILITIES).toEqual({
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true
    })

    const readRes = await bridge.handleServerRequest('fs/read_text_file', {
      sessionId: 'sess-1',
      path: 'README.md',
      line: 5,
      limit: 20
    })
    expect(readRes).toEqual({ content: 'line1\nline2\n' })
    expect(files.read).toHaveBeenCalledWith({
      path: 'README.md',
      cwd: '/srv/app',
      on: 'vps',
      offset: 5,
      limit: 20
    })

    const writeRes = await bridge.handleServerRequest('fs/write_text_file', {
      sessionId: 'sess-1',
      path: 'out.txt',
      content: 'hello world'
    })
    expect(writeRes).toEqual({})
    expect(files.write).toHaveBeenCalledWith({
      path: 'out.txt',
      data: Buffer.from('hello world', 'utf8').toString('base64'),
      cwd: '/srv/app',
      on: 'vps'
    })

    const created = (await bridge.handleServerRequest('terminal/create', {
      sessionId: 'sess-1',
      command: 'npm',
      args: ['test'],
      env: [{ name: 'CI', value: '1' }],
      outputByteLimit: 6
    })) as { terminalId: string }
    expect(created.terminalId).toBe('vps/t42')
    expect(terminals.run).toHaveBeenCalledWith(
      expect.objectContaining({
        argv: ['npm', 'test'],
        cwd: '/srv/app',
        env: { CI: '1' },
        on: 'vps'
      })
    )

    const output = await bridge.handleServerRequest('terminal/output', {
      sessionId: 'sess-1',
      terminalId: 'vps/t42'
    })
    expect(output).toEqual({
      output: 'output',
      truncated: true,
      exitStatus: null
    })

    const waited = await bridge.handleServerRequest('terminal/wait_for_exit', {
      sessionId: 'sess-1',
      terminalId: 'vps/t42'
    })
    expect(waited).toEqual({ exitCode: 0, signal: null })

    await bridge.handleServerRequest('terminal/kill', {
      sessionId: 'sess-1',
      terminalId: 'vps/t42'
    })
    expect(terminals.kill).toHaveBeenCalledWith('vps/t42')

    await bridge.handleServerRequest('terminal/release', {
      sessionId: 'sess-1',
      terminalId: 'vps/t42'
    })
    expect(terminals.rm).toHaveBeenCalledWith('vps/t42')
    expect(bridge.ownedTerminalIds).toEqual([])
    expect(authorize).toHaveBeenCalledTimes(3)
  })

  it('strictly rejects foreign terminal IDs with HERDR_ACP_TERMINAL_FORBIDDEN without calling plane or authorize', async () => {
    const { plane, terminals } = createMockPlane()
    const authorize = vi.fn(async () => true)
    const bridge = new DefaultHerdrAcpCapabilityBridge({ plane, authorize })

    await bridge.handleServerRequest('terminal/create', {
      sessionId: 'sess-1',
      command: 'echo ok'
    })
    authorize.mockClear()

    for (const method of [
      'terminal/output',
      'terminal/wait_for_exit',
      'terminal/kill',
      'terminal/release'
    ]) {
      await expect(
        bridge.handleServerRequest(method, { sessionId: 'sess-1', terminalId: 't-foreign-user' })
      ).rejects.toThrow('HERDR_ACP_TERMINAL_FORBIDDEN')
    }

    expect(authorize).not.toHaveBeenCalled()
    expect(terminals.read).not.toHaveBeenCalled()
    expect(terminals.wait).not.toHaveBeenCalled()
    expect(terminals.kill).not.toHaveBeenCalled()
    expect(terminals.rm).not.toHaveBeenCalled()
  })

  it('fails closed when authorize returns false or throws for mutating/exec methods without touching plane', async () => {
    const { plane, files, terminals } = createMockPlane()

    // Pre-create one owned terminal while allowed so we can test terminal/kill denial too.
    let allow = true
    const authorize = vi.fn(async () => {
      if (!allow) return false
      return true
    })
    const bridge = new DefaultHerdrAcpCapabilityBridge({ plane, authorize })
    const created = (await bridge.handleServerRequest('terminal/create', {
      sessionId: 'sess-1',
      command: 'sleep 10'
    })) as { terminalId: string }

    terminals.run.mockClear()
    allow = false

    await expect(
      bridge.handleServerRequest('fs/write_text_file', {
        sessionId: 'sess-1',
        path: '/tmp/denied.txt',
        content: 'blocked'
      })
    ).rejects.toThrow('HERDR_ACP_PERMISSION_DENIED')

    await expect(
      bridge.handleServerRequest('terminal/create', {
        sessionId: 'sess-1',
        command: 'rm -rf /'
      })
    ).rejects.toThrow('HERDR_ACP_PERMISSION_DENIED')

    await expect(
      bridge.handleServerRequest('terminal/kill', {
        sessionId: 'sess-1',
        terminalId: created.terminalId
      })
    ).rejects.toThrow('HERDR_ACP_PERMISSION_DENIED')

    // Throwing authorize must also fail closed.
    const throwingBridge = new DefaultHerdrAcpCapabilityBridge({
      plane,
      authorize: async () => {
        throw new Error('prompt broker unavailable')
      }
    })
    await expect(
      throwingBridge.handleServerRequest('fs/write_text_file', {
        sessionId: 'sess-1',
        path: '/tmp/err.txt',
        content: 'blocked'
      })
    ).rejects.toThrow('HERDR_ACP_PERMISSION_DENIED')

    expect(files.write).not.toHaveBeenCalled()
    expect(terminals.run).not.toHaveBeenCalled()
    expect(terminals.kill).not.toHaveBeenCalled()
  })

  it('clears tracked terminal references on dispose without killing user terminals or stopping core', async () => {
    const { plane, terminals } = createMockPlane()
    const bridge = new DefaultHerdrAcpCapabilityBridge({ plane })

    await bridge.handleServerRequest('terminal/create', {
      sessionId: 'sess-1',
      command: 'echo hi'
    })
    expect(bridge.ownedTerminalIds).toEqual(['t10'])

    bridge.dispose()
    expect(bridge.isDisposed).toBe(true)
    expect(bridge.ownedTerminalIds).toEqual([])
    expect(terminals.kill).not.toHaveBeenCalled()
    expect(terminals.rm).not.toHaveBeenCalled()

    await expect(
      bridge.handleServerRequest('fs/read_text_file', { sessionId: 'sess-1', path: 'a.txt' })
    ).rejects.toThrow('HERDR_ACP_BRIDGE_DISPOSED')
  })
})
