import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { WebContents } from 'electron'
import type { AddressInfo, Server, Socket } from 'node:net'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import { HerdrEvents } from '@talex-touch/utils/transport/events/herdr'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decodeCreditPayload,
  decodeFocusPayload,
  decodeResizePayload,
  encodeCloseFrame,
  encodeDataFrame,
  encodeResizeFrame,
  HerdrFrameDecoder,
  HerdrFrameKind
} from './frame-codec'
import {
  type HerdrAcpCapabilityBridge,
  type HerdrContentProjector,
  HerdrCoreModule,
  HerdrRuntimePlane,
  HerdrRuntimeStore
} from './index'

const boundary = vi.hoisted(() => ({
  handlers: new Map<unknown, (payload: unknown, context: HandlerContext) => unknown>(),
  broadcast: vi.fn((..._args: unknown[]) => undefined),
  notifyTo: vi.fn((..._args: unknown[]) => true),
  pluginSenders: new Set<object>()
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: () => ({
    on: (event: unknown, handler: (payload: unknown, context: HandlerContext) => unknown) => {
      boundary.handlers.set(event, handler)
      return () => boundary.handlers.delete(event)
    },
    broadcast: boundary.broadcast,
    notifyTo: boundary.notifyTo,
    keyManager: {
      resolveSenderIdentity: (sender: object) =>
        boundary.pluginSenders.has(sender) ? { name: 'plugin-sender', key: 'k' } : undefined
    }
  })
}))

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: () => ({ app: { channel: { keyManager: {} } } })
}))

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: () => undefined,
    debug: () => undefined,
    warn: () => undefined,
    error: () => undefined
  })
}))

vi.mock('../storage', () => ({
  getMainConfig: () => null,
  subscribeMainConfig: () => () => undefined
}))

interface TestCoreServer {
  server: Server
  port: number
  rpcCalls: Array<{ method: string; params: Record<string, unknown> }>
  channelFrames: Array<{ channel: number; kind: number; payload: Buffer }>
  sockets: Socket[]
}

function makeWireTerminal(address = 't1'): Record<string, unknown> {
  return {
    address,
    name: 'shell',
    title: 'zsh',
    argv: ['/bin/zsh'],
    cwd: '/work',
    foreground: { pid: 500, name: 'zsh', argv: ['/bin/zsh'], cwd: '/work' },
    state: 'live',
    status: null,
    status_ms: null,
    reported: false,
    turn: 0,
    keep: false,
    template: null,
    parent: null,
    labels: {},
    cols: 80,
    rows: 24,
    pid: 500,
    exit_code: null,
    signal: null,
    reason: null,
    screen: 'exact',
    created_ms: 1000,
    finished_ms: null
  }
}

async function createTestCoreServer(): Promise<TestCoreServer> {
  const ctx: TestCoreServer = {
    server: null as unknown as Server,
    port: 0,
    rpcCalls: [],
    channelFrames: [],
    sockets: []
  }

  let nextChannel = 2

  ctx.server = net.createServer((socket) => {
    ctx.sockets.push(socket)
    let framed = false
    let plain = Buffer.alloc(0)
    const decoder = new HerdrFrameDecoder()

    socket.on('data', (chunk) => {
      if (!framed) {
        plain = Buffer.concat([plain, chunk])
        const nl = plain.indexOf(0x0a)
        if (nl === -1) return
        const req = JSON.parse(plain.subarray(0, nl).toString('utf8'))
        framed = true
        socket.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              generation: 1,
              framed: true,
              version: '0.1.21',
              core: { id: 'core-test', name: 'local' },
              methods: ['hello', 'events.subscribe', 'terminal.attach'],
              features: ['framed', 'automatic_input']
            }
          })}\n`
        )
        const rem = plain.subarray(nl + 1)
        if (rem.length > 0) {
          for (const f of decoder.push(rem)) handleFrame(f)
        }
        return
      }
      for (const f of decoder.push(chunk)) handleFrame(f)
    })

    function handleFrame(frame: { channel: number; kind: number; payload: Buffer }): void {
      if (frame.channel !== 0) {
        ctx.channelFrames.push(frame)
        return
      }
      if (frame.kind !== HerdrFrameKind.DATA) return
      for (const line of frame.payload.toString('utf8').split('\n').filter(Boolean)) {
        const req = JSON.parse(line)
        ctx.rpcCalls.push({ method: req.method, params: req.params ?? {} })
        let result: unknown = {}
        switch (req.method) {
          case 'events.subscribe':
            result = { channel: 1, seq: 1, terminals: [makeWireTerminal('t1')] }
            break
          case 'server.status':
            result = {
              core: { id: 'core-test', name: 'local' },
              version: '0.1.21',
              pid: 1234,
              uptime_ms: 500,
              live: 1,
              finished: 0,
              holders: []
            }
            break
          case 'machine.list':
            result = {
              machines: [
                {
                  name: 'vps',
                  target: 'dev@vps',
                  id: 'm1',
                  host: 'vps',
                  version: '0.1.21',
                  state: 'connected',
                  session: null,
                  temporary: false,
                  via: false,
                  since_ms: null,
                  why: null
                }
              ]
            }
            break
          case 'machine.connect':
            result = {
              name: req.params.machine,
              target: 'dev@vps',
              id: 'm1',
              host: 'vps',
              version: '0.1.21',
              state: 'connected',
              session: null,
              temporary: false,
              via: false,
              since_ms: null,
              why: null
            }
            break
          case 'templates.list':
            result = { templates: [] }
            break
          case 'terminal.run':
            result = makeWireTerminal('t2')
            break
          case 'terminal.send':
            result = { turn: 2, status: 'working', started: true }
            break
          case 'terminal.keys':
            result = { turn: 2, status: 'idle' }
            break
          case 'terminal.interrupt':
            result = { outcome: 'stopped', key: 'esc' }
            break
          case 'terminal.kill':
            result = {
              ...makeWireTerminal(req.params.terminal),
              state: 'finished',
              reason: 'killed'
            }
            break
          case 'terminal.rm':
            result = { removed: req.params.terminal }
            break
          case 'terminal.keep':
            result = { ...makeWireTerminal(req.params.terminal), keep: Boolean(req.params.keep) }
            break
          case 'terminal.read':
            result = { text: 'screen text', complete: true, how: 'screen', why: null }
            break
          case 'terminal.put':
            result = { path: '/tmp/drop/a.png', bytes: 3 }
            break
          case 'file.read':
            result = { text: 'hello\n', first: 1, last: 1, lines: 1 }
            break
          case 'file.write':
          case 'file.edit':
            result = { path: req.params.path, bytes: 6 }
            break
          case 'machine.exec':
            result = {
              code: 0,
              signal: null,
              stdout: Buffer.from('ok').toString('base64'),
              stderr: '',
              truncated: false,
              timed_out: false,
              ms: 12
            }
            break
          case 'doc.get':
            result = { value: { count: 1 }, version: 2 }
            break
          case 'doc.set':
            result = { version: (req.params.version ?? 0) + 1 }
            break
          case 'terminal.attach': {
            const ch = nextChannel++
            const frames = [
              encodeDataFrame(
                0,
                `${JSON.stringify({
                  jsonrpc: '2.0',
                  id: req.id,
                  result: {
                    channel: ch,
                    terminal: makeWireTerminal(req.params.terminal),
                    automatic_input: true,
                    resize_notifications: true
                  }
                })}\n`
              ),
              encodeResizeFrame(ch, req.params.cols, req.params.rows),
              encodeDataFrame(ch, Buffer.from('你好', 'utf8').subarray(0, 2)),
              encodeDataFrame(ch, Buffer.from('你好', 'utf8').subarray(2))
            ]
            if (req.params.terminal === 't-early-close') {
              frames.push(encodeCloseFrame(ch))
            }
            socket.write(Buffer.concat(frames))
            return
          }
          default:
            result = {}
        }
        socket.write(
          encodeDataFrame(0, `${JSON.stringify({ jsonrpc: '2.0', id: req.id, result })}\n`)
        )
      }
    }
  })

  await new Promise<void>((resolve) => {
    ctx.server.listen(0, '127.0.0.1', () => {
      ctx.port = (ctx.server.address() as AddressInfo).port
      resolve()
    })
  })
  return ctx
}

function makeCaller(
  id = 10,
  plugin?: HandlerContext['plugin']
): {
  context: HandlerContext
  sender: EventEmitter & { id: number; isDestroyed: () => boolean; destroyedFlag: boolean }
} {
  const sender = new EventEmitter() as EventEmitter & {
    id: number
    isDestroyed: () => boolean
    destroyedFlag: boolean
  }
  sender.id = id
  sender.destroyedFlag = false
  sender.isDestroyed = () => sender.destroyedFlag
  return {
    sender,
    context: {
      sender: sender as unknown as WebContents,
      eventName: 'herdr-test',
      plugin
    } as HandlerContext
  }
}

async function invoke(event: unknown, payload: unknown, context: HandlerContext): Promise<unknown> {
  const handler = boundary.handlers.get(event)
  if (!handler) throw new Error('Herdr handler missing')
  return await handler(payload, context)
}

let server: TestCoreServer
let store: HerdrRuntimeStore
let plane: HerdrRuntimePlane
let mod: HerdrCoreModule

beforeEach(async () => {
  boundary.handlers.clear()
  boundary.broadcast.mockClear()
  boundary.notifyTo.mockClear()
  boundary.pluginSenders.clear()

  server = await createTestCoreServer()
  store = new HerdrRuntimeStore({
    heartbeatTimeoutMs: 10_000,
    discoverAndConnect: async () => {
      const socket = net.createConnection({ port: server.port, host: '127.0.0.1' })
      await new Promise<void>((resolve) => socket.once('connect', resolve))
      return {
        socket,
        socketPath: '/tmp/herdr-mod-test.sock',
        session: 'test',
        binaryPath: '/usr/local/bin/herdr-core',
        ownership: 'external'
      }
    }
  })
  plane = new HerdrRuntimePlane(store)
  mod = new HerdrCoreModule({
    store,
    plane,
    readAppSettings: () => ({ betaFeatures: { herdrRuntime: true } }) as never,
    subscribeAppSettings: () => () => undefined,
    autoConnectOnInit: false
  })
  mod.onInit({} as never)
  await store.connect()
})

afterEach(async () => {
  await mod.onDestroy()
  await new Promise<void>((resolve) => server.server.close(() => resolve()))
})

describe('HerdrCoreModule security and lifecycle', () => {
  it('strictly rejects ANY plugin caller (trusted, forged, or plugin-bound sender) with HERDR_CALLER_FORBIDDEN', async () => {
    const trustedPlugin = makeCaller(11, createTrustedTestPluginContext({ name: 'evil-plugin' }))
    const forgedPlugin = makeCaller(12, {
      name: 'forged',
      uniqueKey: 'bad'
    } as HandlerContext['plugin'])
    const senderBoundPlugin = makeCaller(13)
    boundary.pluginSenders.add(senderBoundPlugin.sender)
    const destroyedHost = makeCaller(14)
    destroyedHost.sender.destroyedFlag = true
    const missingSender = { eventName: 'test' } as HandlerContext

    const eventsToCheck: Array<[unknown, unknown]> = [
      [HerdrEvents.runtime.getSnapshot, undefined],
      [HerdrEvents.runtime.ensureStarted, {}],
      [HerdrEvents.runtime.reconnect, undefined],
      [HerdrEvents.terminal.run, { argv: ['/bin/sh'] }],
      [HerdrEvents.terminal.send, { terminal: 't1', text: 'hi' }],
      [HerdrEvents.terminal.keys, { terminal: 't1', keys: ['enter'] }],
      [HerdrEvents.terminal.control, { terminal: 't1', action: 'interrupt' }],
      [HerdrEvents.terminal.read, { terminal: 't1' }],
      [HerdrEvents.terminal.put, { terminal: 't1', name: 'a.txt', data: 'YQ==' }],
      [HerdrEvents.stream.attach, { terminal: 't1', cols: 80, rows: 24 }],
      [HerdrEvents.stream.io, { streamId: 's1', op: 'write', data: 'x' }],
      [HerdrEvents.projection.get, { address: 't1' }],
      [HerdrEvents.projection.watch, { address: 't1' }],
      [HerdrEvents.projection.unwatch, { address: 't1' }]
    ]

    for (const ctx of [
      trustedPlugin.context,
      forgedPlugin.context,
      senderBoundPlugin.context,
      destroyedHost.context,
      missingSender
    ]) {
      for (const [event, payload] of eventsToCheck) {
        await expect(Promise.resolve().then(() => invoke(event, payload, ctx))).rejects.toThrow(
          'HERDR_CALLER_FORBIDDEN'
        )
      }
    }
  })

  it('starts connect asynchronously without blocking onInit', async () => {
    let resolveDial!: () => void
    const blockedStore = new HerdrRuntimeStore({
      discoverAndConnect: async () => {
        await new Promise<void>((resolve) => {
          resolveDial = resolve
        })
        throw new Error('aborted')
      }
    })
    const nonBlockingMod = new HerdrCoreModule({
      store: blockedStore,
      readAppSettings: () => ({ betaFeatures: { herdrRuntime: true } }) as never,
      subscribeAppSettings: () => () => undefined,
      autoConnectOnInit: true
    })

    // Must return synchronously without awaiting socket dial.
    const ret = nonBlockingMod.onInit({} as never)
    expect(ret).toBeUndefined()
    await new Promise((resolve) => setTimeout(resolve, 10))
    resolveDial?.()
    await nonBlockingMod.onDestroy()
  })

  it('binds streamId ownership to concrete sender, delivers UTF-8 chunks + credit/io frames, and sends CLOSE-only on navigation/destroy', async () => {
    const owner = makeCaller(7)
    // Foreign WebContents with the SAME numeric id must still be isolated.
    const foreignSameId = makeCaller(7)

    const attached = (await invoke(
      HerdrEvents.stream.attach,
      { terminal: 't1', cols: 100, rows: 30, history: 50, resizeNotifications: true },
      owner.context
    )) as { streamId: string; automaticInput: boolean; resizeNotifications: boolean }

    expect(attached.streamId).toBeTruthy()
    expect(attached.automaticInput).toBe(true)
    expect(attached.resizeNotifications).toBe(true)

    // Verify split multi-byte UTF-8 ("你好") decoded cleanly across two DATA frames and routed ONLY to owner.
    await vi.waitFor(() => {
      const dataCalls = boundary.notifyTo.mock.calls.filter(
        (c) => c[1] === HerdrEvents.push.streamData
      )
      expect(dataCalls.length).toBeGreaterThanOrEqual(3)
    })

    const dataPayloads = boundary.notifyTo.mock.calls
      .filter((c) => c[1] === HerdrEvents.push.streamData)
      .map((c) => {
        expect(c[0]).toBe(owner.sender)
        return c[2] as {
          streamId: string
          data: string
          bytes: number
          resize?: { cols: number; rows: number }
        }
      })
    expect(dataPayloads[0]!.resize).toEqual({ cols: 100, rows: 30 })
    const combinedText = dataPayloads.map((p) => p.data).join('')
    const combinedBytes = dataPayloads.reduce((sum, p) => sum + p.bytes, 0)
    expect(combinedText).toBe('你好')
    expect(combinedBytes).toBe(Buffer.byteLength('你好', 'utf8'))

    // Foreign WebContents sharing numeric id cannot operate on owner's stream.
    for (const io of [
      { streamId: attached.streamId, op: 'write', data: 'hijack' },
      { streamId: attached.streamId, op: 'resize', cols: 80, rows: 24 },
      { streamId: attached.streamId, op: 'detach' }
    ]) {
      await expect(
        Promise.resolve().then(() => invoke(HerdrEvents.stream.io, io, foreignSameId.context))
      ).rejects.toThrow('HERDR_STREAM_NOT_FOUND')
    }

    // Owner exercises all IO operations.
    await invoke(
      HerdrEvents.stream.io,
      { streamId: attached.streamId, op: 'write', data: 'ls\r' },
      owner.context
    )
    await invoke(
      HerdrEvents.stream.io,
      { streamId: attached.streamId, op: 'auto-input', data: '\u001b[c' },
      owner.context
    )
    await invoke(
      HerdrEvents.stream.io,
      { streamId: attached.streamId, op: 'resize', cols: 120, rows: 40 },
      owner.context
    )
    await invoke(
      HerdrEvents.stream.io,
      { streamId: attached.streamId, op: 'focus', focused: true },
      owner.context
    )
    await invoke(
      HerdrEvents.stream.io,
      { streamId: attached.streamId, op: 'ack', bytes: combinedBytes },
      owner.context
    )

    // Main-frame navigation must detach via CLOSE frame ONLY — NEVER terminal.kill!
    owner.sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })

    await vi.waitFor(() => {
      const ch2 = server.channelFrames.filter((f) => f.channel === 2)
      expect(ch2.map((f) => f.kind)).toEqual([
        HerdrFrameKind.DATA,
        HerdrFrameKind.AUTOMATIC_INPUT,
        HerdrFrameKind.RESIZE,
        HerdrFrameKind.FOCUS,
        HerdrFrameKind.CREDIT,
        HerdrFrameKind.CLOSE
      ])
    })

    const ch2 = server.channelFrames.filter((f) => f.channel === 2)
    expect(decodeResizePayload(ch2[2]!.payload)).toEqual({ cols: 120, rows: 40 })
    expect(decodeFocusPayload(ch2[3]!.payload)).toBe(true)
    expect(decodeCreditPayload(ch2[4]!.payload)).toBe(combinedBytes)

    // Verify zero kill/stop/restart RPCs were ever issued!
    const forbiddenRpcs = server.rpcCalls.filter((c) =>
      ['terminal.kill', 'server.stop', 'server.restart'].includes(c.method)
    )
    expect(forbiddenRpcs).toEqual([])
  })

  it('does not leak stream record or watcher listeners when server sends an early CLOSE frame during attach', async () => {
    const owner = makeCaller(33)
    const attached = (await invoke(
      HerdrEvents.stream.attach,
      { terminal: 't-early-close', cols: 80, rows: 24 },
      owner.context
    )) as { streamId: string }

    expect(attached.streamId).toBeTruthy()

    const closedCalls = boundary.notifyTo.mock.calls.filter(
      (c) => c[1] === HerdrEvents.push.streamClosed
    )
    expect(closedCalls).toHaveLength(1)
    expect(closedCalls[0]![0]).toBe(owner.sender)
    expect(closedCalls[0]![2]).toMatchObject({
      streamId: attached.streamId,
      terminal: 't-early-close'
    })

    // Stream must NOT be leaked in `streams`: any follow-up IO rejects cleanly.
    await expect(
      Promise.resolve().then(() =>
        invoke(
          HerdrEvents.stream.io,
          { streamId: attached.streamId, op: 'write', data: 'late' },
          owner.context
        )
      )
    ).rejects.toThrow('HERDR_STREAM_NOT_FOUND')

    // Watcher listeners on the WebContents must already be cleaned up.
    expect(owner.sender.listenerCount('destroyed')).toBe(0)
    expect(owner.sender.listenerCount('render-process-gone')).toBe(0)
    expect(owner.sender.listenerCount('did-start-navigation')).toBe(0)
  })

  it('detaches active streams on onDestroy via CLOSE frame ONLY and never calls server.stop/server.restart/terminal.kill', async () => {
    const owner = makeCaller(21)
    await invoke(HerdrEvents.stream.attach, { terminal: 't1', cols: 80, rows: 24 }, owner.context)

    await mod.onDestroy()

    await vi.waitFor(() => {
      const closeFrame = server.channelFrames.find(
        (f) => f.channel === 2 && f.kind === HerdrFrameKind.CLOSE
      )
      expect(closeFrame).toBeDefined()
    })

    const forbiddenRpcs = server.rpcCalls.filter((c) =>
      ['terminal.kill', 'server.stop', 'server.restart'].includes(c.method)
    )
    expect(forbiddenRpcs).toEqual([])
  })

  it('exposes all 5 HerdrRuntimePlane sibling APIs and P3 pre-reserved slot interfaces', async () => {
    // 1. terminals
    const runRes = await plane.terminals.run({ argv: ['/bin/sh'], cols: 90, rows: 28 })
    expect(runRes.address).toBe('t2')
    const sendRes = await plane.terminals.send({ terminal: 't1', text: 'hello', ifState: 'idle' })
    expect(sendRes).toEqual({ turn: 2, status: 'working', started: true })
    const readRes = await plane.terminals.read({ terminal: 't1', lines: 50 })
    expect(readRes.text).toBe('screen text')
    const putRes = await plane.terminals.put({ terminal: 't1', name: 'a.png', data: 'AQID' })
    expect(putRes).toEqual({ path: '/tmp/drop/a.png', bytes: 3 })

    // 2. files
    const fileRead = await plane.files.read({ path: '/tmp/a.txt', offset: 1, limit: 10 })
    expect(fileRead.text).toBe('hello\n')
    const fileWrite = await plane.files.write({ path: '/tmp/a.txt', data: 'aGVsbG8K' })
    expect(fileWrite.bytes).toBe(6)
    const fileEdit = await plane.files.edit({
      path: '/tmp/a.txt',
      edits: [{ old: 'hello', new: 'world' }]
    })
    expect(fileEdit.bytes).toBe(6)

    // 3. exec (both callable and .run)
    const execRes = await plane.exec({ argv: ['echo', 'ok'] })
    expect(execRes).toMatchObject({ code: 0, timedOut: false, ms: 12 })
    const execRunRes = await plane.exec.run({ line: 'echo ok' })
    expect(execRunRes.code).toBe(0)

    // 4. machines
    const machines = await plane.machines.list()
    expect(machines[0]!.name).toBe('vps')
    const connected = await plane.machines.connect('vps')
    expect(connected.state).toBe('connected')

    // 5. docs
    const doc = await plane.docs.get('workspace')
    expect(doc).toEqual({ value: { count: 1 }, version: 2 })
    const saved = await plane.docs.set('workspace', { count: 2 }, 2)
    expect(saved).toEqual({ version: 3 })

    // P3 pre-reserved slots: HerdrAcpCapabilityBridge & HerdrContentProjector
    const bridge: HerdrAcpCapabilityBridge = {
      id: 'test-acp',
      readTextFile: (req) => plane.files.read(req),
      writeTextFile: (req) => plane.files.write(req),
      editTextFile: (req) => plane.files.edit(req),
      exec: (req) => plane.exec(req),
      createTerminal: (req) => plane.terminals.run(req),
      readTerminalOutput: (req) => plane.terminals.read(req),
      sendTerminalInput: (req) => plane.terminals.send(req),
      killTerminal: (t) => plane.terminals.kill(t)
    }
    plane.setAcpCapabilityBridge(bridge)
    expect(plane.getAcpCapabilityBridge()).toBe(bridge)

    const projectedSnapshots: number[] = []
    const projector: HerdrContentProjector = {
      id: 'test-projector',
      projectSnapshot: (snap) => {
        projectedSnapshots.push(snap.revision)
      }
    }
    const initialCount = plane.getContentProjectors().length
    expect(initialCount).toBe(1)
    const removeProjector = plane.registerContentProjector(projector)
    expect(plane.getContentProjectors()).toHaveLength(initialCount + 1)
    await store.refreshMetadata()
    expect(projectedSnapshots.length).toBeGreaterThanOrEqual(1)
    removeProjector()
    expect(plane.getContentProjectors()).toHaveLength(initialCount)
  })

  it('wires projection.get/watch/unwatch with owner cleanup and createAcpCapabilityBridge gating', async () => {
    const owner = makeCaller(44)
    const initial = await invoke(HerdrEvents.projection.get, { address: 't1' }, owner.context)
    expect(initial).toMatchObject({ address: 't1', available: false, messages: [] })

    await invoke(HerdrEvents.projection.watch, { address: 't1', limit: 20 }, owner.context)
    expect(mod.projector.watchedAddressCount).toBe(1)
    expect(owner.sender.listenerCount('destroyed')).toBe(1)
    expect(owner.sender.listenerCount('did-start-navigation')).toBe(1)

    // Explicit unwatch cleans up both projector watch and WebContents listeners.
    await invoke(HerdrEvents.projection.unwatch, { address: 't1' }, owner.context)
    expect(mod.projector.watchedAddressCount).toBe(0)
    expect(owner.sender.listenerCount('destroyed')).toBe(0)
    expect(owner.sender.listenerCount('did-start-navigation')).toBe(0)

    // Re-watch and verify navigation auto-cleans up projector watcher.
    await invoke(HerdrEvents.projection.watch, { address: 't1' }, owner.context)
    expect(mod.projector.watchedAddressCount).toBe(1)
    owner.sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    expect(mod.projector.watchedAddressCount).toBe(0)
    expect(owner.sender.listenerCount('destroyed')).toBe(0)

    // createAcpCapabilityBridge returns a scoped bridge when enabled + connected.
    const bridge = mod.createAcpCapabilityBridge({ cwd: '/work' })
    expect(bridge).not.toBeNull()
    const readRes = await bridge!.handleServerRequest('fs/read_text_file', {
      sessionId: 's1',
      path: '/tmp/a.txt'
    })
    expect(readRes).toEqual({ content: 'hello\n' })
    bridge!.dispose()

    // Disabling herdrRuntime or disconnecting causes createAcpCapabilityBridge to return null.
    store.updateConfig(false)
    expect(mod.createAcpCapabilityBridge()).toBeNull()
  })
})
