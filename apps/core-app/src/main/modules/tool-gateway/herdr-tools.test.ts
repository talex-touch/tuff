import type {
  HerdrRuntimeSnapshot,
  HerdrSessionView
} from '@talex-touch/utils/transport/events/herdr'
import type { HerdrRuntimePlane } from '../herdr-core/runtime-plane'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { createHerdrTools } from './herdr-tools'
import { isRememberable } from './tool-registry'

function makeSnapshot(overrides: Partial<HerdrRuntimeSnapshot> = {}): HerdrRuntimeSnapshot {
  return {
    revision: 1,
    seq: 1,
    enabled: true,
    connection: 'connected',
    ownership: 'external',
    socketPath: '/tmp/herdr.sock',
    session: 'default',
    binaryPath: '/usr/local/bin/herdr-core',
    error: null,
    core: null,
    sessions: [],
    machines: [],
    templates: [],
    updatedAt: 1000,
    ...overrides
  }
}

function makeSession(overrides: Partial<HerdrSessionView> = {}): HerdrSessionView {
  return {
    address: 't1',
    machine: null,
    name: 'shell',
    title: 'zsh',
    argv: ['/bin/zsh'],
    cwd: '/workspace',
    foregroundName: 'zsh',
    foregroundCwd: '/workspace',
    foregroundPid: 100,
    state: 'live',
    status: { state: 'working', msg: 'Running' },
    statusMs: 1000,
    reported: true,
    turn: 1,
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

function createMockPlane(snapshotOverrides: Partial<HerdrRuntimeSnapshot> = {}) {
  const snapshot = makeSnapshot(snapshotOverrides)
  const terminals = {
    list: vi.fn(async () => [
      makeSession({ address: 't1' }),
      makeSession({ address: 'vps/t2', machine: 'vps' })
    ]),
    read: vi.fn(async () => ({ text: 'screen-body', complete: true, how: 'screen', why: null })),
    send: vi.fn(async () => ({ turn: 2, status: 'working', started: true })),
    run: vi.fn(async () => makeSession({ address: 't9', cwd: '/repo' })),
    control: vi.fn(async (req: { terminal: string; action: string }) => ({
      terminal: req.terminal,
      action: req.action as 'interrupt' | 'kill' | 'rm' | 'keep-on' | 'keep-off',
      outcome: req.action === 'interrupt' ? 'stopped' : undefined,
      removed: req.action === 'rm' ? req.terminal : undefined
    }))
  }
  const files = {
    read: vi.fn(async () => ({ text: 'file-contents\n', first: 1, last: 1, lines: 1 })),
    write: vi.fn(async (req: { path: string; data: string }) => ({
      path: req.path,
      bytes: Buffer.from(req.data, 'base64').length
    })),
    edit: vi.fn(async (req: { path: string }) => ({ path: req.path, bytes: 18 }))
  }
  const execRun = vi.fn(async () => ({
    code: 0,
    signal: null,
    stdout: Buffer.from('hello-exec\n', 'utf8').toString('base64'),
    stderr: Buffer.from('warn-line\n', 'utf8').toString('base64'),
    truncated: false,
    timedOut: false,
    ms: 14
  }))
  const machines = {
    list: vi.fn(async () => [
      {
        name: 'vps',
        target: 'dev@vps',
        id: 'm1',
        host: 'vps.local',
        version: '0.1.21',
        state: 'connected' as const,
        session: null,
        temporary: false,
        via: false,
        sinceMs: null,
        why: null
      }
    ])
  }

  const plane = {
    getSnapshot: vi.fn(() => snapshot),
    terminals,
    files,
    exec: Object.assign(execRun, { run: execRun }),
    machines
  } as unknown as HerdrRuntimePlane

  return { plane, terminals, files, execRun, machines }
}

function mapTools(plane: HerdrRuntimePlane | null) {
  return new Map(createHerdrTools({ getPlane: () => plane }).map((tool) => [tool.name, tool]))
}

describe('tool-gateway herdr-tools', () => {
  it('enforces exact risk tiers, narrowed read rememberKeys, and destructive ⚠ prefixes', async () => {
    const { plane } = createMockPlane()
    const tools = mapTools(plane)
    expect([...tools.keys()]).toEqual([
      'tuff_herdr_list_sessions',
      'tuff_herdr_read_screen',
      'tuff_herdr_file_read',
      'tuff_herdr_send_input',
      'tuff_herdr_file_write',
      'tuff_herdr_file_edit',
      'tuff_herdr_run_terminal',
      'tuff_herdr_exec',
      'tuff_herdr_control_terminal'
    ])

    // Read tier: rememberable with narrowed rememberKeys
    const listPlan = await tools.get('tuff_herdr_list_sessions')!.classify!({})
    expect(listPlan.risk).toBe('read')
    expect(isRememberable(listPlan.risk)).toBe(true)
    expect(listPlan.rememberKey).toBe('tuff_herdr_list_sessions')

    const screenA = await tools.get('tuff_herdr_read_screen')!.classify!({ terminal: 't1' })
    const screenB = await tools.get('tuff_herdr_read_screen')!.classify!({ terminal: 'vps/t2' })
    expect(screenA.risk).toBe('read')
    expect(screenA.rememberKey).toBe('tuff_herdr_read_screen:t1')
    expect(screenB.rememberKey).toBe('tuff_herdr_read_screen:vps/t2')
    expect(screenA.rememberKey).not.toBe(screenB.rememberKey)

    const fileA = await tools.get('tuff_herdr_file_read')!.classify!({ path: '/etc/hosts' })
    const fileB = await tools.get('tuff_herdr_file_read')!.classify!({
      on: 'vps',
      path: '/etc/hosts'
    })
    const fileRelA = await tools.get('tuff_herdr_file_read')!.classify!({
      cwd: '/proj-a',
      path: 'README.md'
    })
    const fileRelB = await tools.get('tuff_herdr_file_read')!.classify!({
      cwd: '/proj-b',
      path: 'README.md'
    })
    expect(fileA.risk).toBe('read')
    expect(fileA.rememberKey).toBe('tuff_herdr_file_read:local:/etc/hosts')
    expect(fileB.rememberKey).toBe('tuff_herdr_file_read:vps:/etc/hosts')
    expect(fileA.rememberKey).not.toBe(fileB.rememberKey)
    expect(fileRelA.rememberKey).toBe('tuff_herdr_file_read:local:/proj-a:README.md')
    expect(fileRelB.rememberKey).toBe('tuff_herdr_file_read:local:/proj-b:README.md')
    expect(fileRelA.rememberKey).not.toBe(fileRelB.rememberKey)

    // Missing path/terminal in read classify fails safe to execute
    const emptyRead = await tools.get('tuff_herdr_file_read')!.classify!({ path: '' })
    expect(emptyRead.risk).toBe('execute')

    // Write tier: NEVER rememberable; force send carries ⚠ prefix
    const normalSend = await tools.get('tuff_herdr_send_input')!.classify!({
      terminal: 't1',
      text: 'hi'
    })
    const forceSend = await tools.get('tuff_herdr_send_input')!.classify!({
      terminal: 't1',
      text: 'hi',
      force: true
    })
    expect(normalSend.risk).toBe('write')
    expect(isRememberable(normalSend.risk)).toBe(false)
    expect(normalSend.summary.startsWith('⚠ ')).toBe(false)
    expect(forceSend.summary.startsWith('⚠ ')).toBe(true)

    const writePlan = await tools.get('tuff_herdr_file_write')!.classify!({
      on: 'vps',
      path: '/srv/a.txt',
      content: 'hello'
    })
    expect(writePlan.risk).toBe('write')
    expect(writePlan.summary).toContain('vps:/srv/a.txt')
    expect(writePlan.summary).toContain('5 bytes')

    const editPlan = await tools.get('tuff_herdr_file_edit')!.classify!({
      path: '/srv/a.txt',
      edits: [
        { old: 'a', new: 'b' },
        { old: 'c', new: 'd' }
      ]
    })
    expect(editPlan.risk).toBe('write')
    expect(editPlan.summary).toContain('local:/srv/a.txt')
    expect(editPlan.summary).toContain('2 edits')

    // Execute tier: NEVER rememberable; kill/rm carry ⚠ prefix
    const interruptPlan = await tools.get('tuff_herdr_control_terminal')!.classify!({
      terminal: 't1',
      action: 'interrupt'
    })
    const killPlan = await tools.get('tuff_herdr_control_terminal')!.classify!({
      terminal: 't1',
      action: 'kill'
    })
    const rmPlan = await tools.get('tuff_herdr_control_terminal')!.classify!({
      terminal: 't1',
      action: 'rm'
    })
    expect(interruptPlan.risk).toBe('execute')
    expect(isRememberable(interruptPlan.risk)).toBe(false)
    expect(interruptPlan.summary.startsWith('⚠ ')).toBe(false)
    expect(killPlan.summary.startsWith('⚠ ')).toBe(true)
    expect(rmPlan.summary.startsWith('⚠ ')).toBe(true)
  })

  it('executes all 9 tools over HerdrRuntimePlane and truncates outputs over 64 KiB', async () => {
    const { plane, terminals, files, execRun } = createMockPlane()
    const oversized = 'A'.repeat(70 * 1024)
    terminals.read.mockResolvedValueOnce({
      text: oversized,
      complete: true,
      how: 'history',
      why: null
    })
    const tools = mapTools(plane)

    const listRes = await tools.get('tuff_herdr_list_sessions')!.execute({})
    expect(listRes.isError).toBe(false)
    expect(listRes.output).toContain('t1')
    expect(listRes.output).toContain('vps/t2')
    expect(listRes.output).toContain('vps.local')

    const screenRes = await tools
      .get('tuff_herdr_read_screen')!
      .execute({ terminal: 't1', lines: 50 })
    expect(screenRes.isError).toBe(false)
    expect(screenRes.output).toContain('… truncated at 65536 characters.')

    const readRes = await tools.get('tuff_herdr_file_read')!.execute({
      on: 'vps',
      path: '/srv/app.ts',
      offset: 2,
      limit: 10
    })
    expect(readRes).toEqual({ output: 'file-contents\n', isError: false })
    expect(files.read).toHaveBeenCalledWith({
      path: '/srv/app.ts',
      on: 'vps',
      offset: 2,
      limit: 10
    })

    const sendRes = await tools.get('tuff_herdr_send_input')!.execute({
      terminal: 't1',
      text: 'npm test',
      force: true
    })
    expect(sendRes.isError).toBe(false)
    expect(terminals.send).toHaveBeenCalledWith({
      terminal: 't1',
      text: 'npm test',
      force: true
    })

    const writeRes = await tools.get('tuff_herdr_file_write')!.execute({
      on: 'vps',
      path: '/srv/out.txt',
      content: 'hello'
    })
    expect(writeRes.isError).toBe(false)
    expect(files.write).toHaveBeenCalledWith({
      path: '/srv/out.txt',
      data: Buffer.from('hello', 'utf8').toString('base64'),
      on: 'vps'
    })

    const editRes = await tools.get('tuff_herdr_file_edit')!.execute({
      path: '/srv/out.txt',
      edits: [{ old: 'hello', new: 'world' }]
    })
    expect(editRes.isError).toBe(false)
    expect(files.edit).toHaveBeenCalledWith({
      path: '/srv/out.txt',
      edits: [{ old: 'hello', new: 'world' }]
    })

    const runRes = await tools.get('tuff_herdr_run_terminal')!.execute({
      on: 'vps',
      cwd: '/repo',
      argv: ['claude']
    })
    expect(runRes.isError).toBe(false)
    expect(runRes.output).toContain('t9')

    const execRes = await tools.get('tuff_herdr_exec')!.execute({
      line: 'echo hello-exec',
      input: 'stdin-data'
    })
    expect(execRes.isError).toBe(false)
    expect(execRes.output).toContain('exit=0')
    expect(execRes.output).toContain('hello-exec')
    expect(execRes.output).toContain('warn-line')
    expect(execRun).toHaveBeenCalledWith({
      line: 'echo hello-exec',
      input: Buffer.from('stdin-data', 'utf8').toString('base64')
    })

    const ctrlRes = await tools.get('tuff_herdr_control_terminal')!.execute({
      terminal: 't1',
      action: 'kill'
    })
    expect(ctrlRes.isError).toBe(false)
    expect(terminals.control).toHaveBeenCalledWith({ terminal: 't1', action: 'kill' })
  })

  it('degrades cleanly without throwing when herdr-core is disconnected or herdrRuntime beta is disabled', async () => {
    const { plane: disconnectedPlane } = createMockPlane({
      connection: 'fallback-pty',
      error: 'binary missing'
    })
    const { plane: disabledPlane } = createMockPlane({ enabled: false, connection: 'disconnected' })

    for (const plane of [null, disconnectedPlane, disabledPlane]) {
      const tools = mapTools(plane)
      const listRes = await tools.get('tuff_herdr_list_sessions')!.execute({})
      expect(listRes.isError).toBe(false)
      expect(listRes.output).toContain('herdr-core unavailable')

      const readRes = await tools.get('tuff_herdr_file_read')!.execute({ path: '/tmp/a.txt' })
      expect(readRes.isError).toBe(true)
      expect(readRes.code).toBe('TOOL_SERVICE_UNAVAILABLE')

      const execRes = await tools.get('tuff_herdr_exec')!.execute({ line: 'echo hi' })
      expect(execRes.isError).toBe(true)
      expect(execRes.code).toBe('TOOL_SERVICE_UNAVAILABLE')
    }
  })
})
