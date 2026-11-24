import type { AddressInfo, Server, Socket } from 'node:net'
import { Buffer } from 'node:buffer'
import net from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HerdrBinaryManager } from './binary-manager'
import { encodeDataFrame, HerdrFrameDecoder, HerdrFrameKind } from './frame-codec'
import { HerdrRuntimeStore } from './runtime-store'
import { HerdrDiscoveryError } from './socket-discovery'

interface ScriptedHerdrServer {
  server: Server
  port: number
  sockets: Socket[]
  emitEvent: (payload: Record<string, unknown>) => void
  emitNotification: (method: string, params?: Record<string, unknown>) => void
  dropAll: () => void
  connectCount: number
}

async function startScriptedServer(
  initialTerminals: Record<string, unknown>[] = []
): Promise<ScriptedHerdrServer> {
  const ctx: ScriptedHerdrServer = {
    server: null as unknown as Server,
    port: 0,
    sockets: [],
    connectCount: 0,
    emitEvent: (params) => ctx.emitNotification('event', params),
    emitNotification: (method, params) => {
      const line = `${JSON.stringify({ jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) })}\n`
      const frame = encodeDataFrame(1, line)
      for (const s of ctx.sockets) {
        if (!s.destroyed) s.write(frame)
      }
    },
    dropAll: () => {
      for (const s of ctx.sockets.splice(0)) {
        s.destroy()
      }
    }
  }

  ctx.server = net.createServer((socket) => {
    ctx.connectCount += 1
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
              core: { id: 'core-abc', name: 'devbox' },
              methods: [
                'hello',
                'events.subscribe',
                'server.status',
                'machine.list',
                'templates.list'
              ],
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
      if (frame.channel !== 0 || frame.kind !== HerdrFrameKind.DATA) return
      for (const line of frame.payload.toString('utf8').split('\n').filter(Boolean)) {
        const req = JSON.parse(line)
        let result: unknown = {}
        if (req.method === 'events.subscribe') {
          result = { channel: 1, seq: 10, terminals: initialTerminals }
        } else if (req.method === 'server.status') {
          result = {
            core: { id: 'core-abc', name: 'devbox' },
            version: '0.1.21',
            pid: 4321,
            uptime_ms: 9000,
            live: initialTerminals.length,
            finished: 0,
            holders: []
          }
        } else if (req.method === 'machine.list') {
          result = {
            machines: [
              {
                name: 'vps',
                target: 'dev@vps',
                id: 'm1',
                host: 'vps.local',
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
        } else if (req.method === 'templates.list') {
          result = {
            templates: [
              {
                name: 'reviewer',
                description: 'Code reviewer',
                command: 'claude',
                error: null
              }
            ]
          }
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

const cleanups: Array<() => Promise<void> | void> = []

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()!()
  }
})

function makeWireTerminal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    address: 't1',
    name: 'shell',
    title: 'zsh',
    argv: ['/bin/zsh'],
    cwd: '/work',
    foreground: { pid: 101, name: 'zsh', argv: ['/bin/zsh'], cwd: '/work' },
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
    pid: 101,
    exit_code: null,
    signal: null,
    reason: null,
    screen: 'exact',
    created_ms: 1000,
    finished_ms: null,
    ...overrides
  }
}

describe('herdr-core runtime-store', () => {
  it('hydrates snapshot, machines, templates, core summary, and applies all ordered delta event kinds', async () => {
    const server = await startScriptedServer([
      makeWireTerminal({ address: 'vps/t1', created_ms: 100 })
    ])
    cleanups.push(() => new Promise<void>((resolve) => server.server.close(() => resolve())))

    const states: string[] = []
    const restarted: string[] = []
    const docs: Array<{ name: string; version: number }> = []

    const store = new HerdrRuntimeStore({
      heartbeatTimeoutMs: 10_000,
      discoverAndConnect: async ({ onStateChange }) => {
        onStateChange?.('discovering')
        onStateChange?.('connecting')
        const socket = net.createConnection({ port: server.port, host: '127.0.0.1' })
        await new Promise<void>((resolve) => socket.once('connect', resolve))
        return {
          socket,
          socketPath: '/tmp/test.sock',
          session: 'test',
          binaryPath: '/usr/local/bin/herdr-core',
          ownership: 'external'
        }
      }
    })
    cleanups.push(() => store.dispose())

    store.onSnapshotChanged((snap) => states.push(snap.connection))
    store.onSessionRestarted((ev) => restarted.push(ev.address))
    store.onDocChanged((ev) => docs.push({ name: ev.name, version: ev.version }))

    const snap = await store.connect()
    expect(snap.connection).toBe('connected')
    expect(snap.ownership).toBe('external')
    expect(snap.seq).toBe(10)
    expect(snap.core).toMatchObject({ id: 'core-abc', name: 'devbox', pid: 4321, liveCount: 1 })
    expect(snap.machines).toHaveLength(1)
    expect(snap.machines[0]!.name).toBe('vps')
    expect(snap.templates).toHaveLength(1)
    expect(snap.templates[0]!.name).toBe('reviewer')
    expect(snap.sessions[0]).toMatchObject({ address: 'vps/t1', machine: 'vps' })
    expect(states).toContain('discovering')
    expect(states).toContain('connecting')
    expect(states).toContain('handshaking')
    expect(states[states.length - 1]).toBe('connected')

    // Stale seq <= 10 must be ignored.
    server.emitEvent({ seq: 9, terminal: 'vps/t1', type: 'title', data: { title: 'STALE' } })
    server.emitEvent({ seq: 10, terminal: 'vps/t1', type: 'title', data: { title: 'STALE_EQ' } })

    // Ordered deltas across every supported kind.
    server.emitEvent({
      seq: 11,
      terminal: 't2',
      type: 'created',
      data: makeWireTerminal({ address: 't2', created_ms: 200 })
    })
    server.emitEvent({ seq: 12, terminal: 't2', type: 'title', data: { title: 'Claude' } })
    server.emitEvent({
      seq: 13,
      terminal: 't2',
      type: 'status',
      data: { status: { state: 'working', msg: 'Editing', progress: 50 }, status_ms: 5555 }
    })
    server.emitEvent({ seq: 14, terminal: 't2', type: 'turn', data: { turn: 3 } })
    server.emitEvent({
      seq: 15,
      terminal: 't2',
      type: 'labels',
      data: { labels: { role: 'agent' } }
    })
    server.emitEvent({ seq: 16, terminal: 't2', type: 'size', data: { cols: 132, rows: 45 } })
    server.emitEvent({ seq: 17, terminal: 't2', type: 'keep', data: { keep: true } })
    server.emitEvent({ seq: 18, terminal: 't2', type: 'lost', data: { reason: 'holder_lost' } })
    server.emitEvent({ seq: 19, terminal: 't2', type: 'restarted', data: { pid: 888 } })
    server.emitEvent({ seq: 20, type: 'doc', data: { name: 'workspace-meta', version: 4 } })
    server.emitEvent({
      seq: 21,
      terminal: 'vps/t1',
      type: 'finished',
      data: { exit_code: 0, signal: null, reason: 'exited', finished_ms: 9999 }
    })
    server.emitEvent({ seq: 22, terminal: 'vps/t1', type: 'removed', data: {} })

    await vi.waitFor(() => {
      expect(store.getSnapshot().seq).toBe(22)
    })

    const after = store.getSnapshot()
    expect(after.sessions).toHaveLength(1)
    expect(after.sessions[0]).toMatchObject({
      address: 't2',
      title: 'Claude',
      turn: 3,
      labels: { role: 'agent' },
      cols: 132,
      rows: 45,
      keep: true,
      state: 'live',
      pid: 888
    })
    expect(restarted).toEqual(['t2'])
    expect(docs).toEqual([{ name: 'workspace-meta', version: 4 }])

    // `missed` full snapshot replace drops stale seq <= snapshot.seq and keeps seq > snapshot.seq.
    server.emitNotification('missed', {
      seq: 50,
      terminals: [makeWireTerminal({ address: 't9', title: 'FreshSnapshot' })]
    })
    server.emitEvent({ seq: 49, terminal: 't9', type: 'title', data: { title: 'Stale49' } })
    server.emitEvent({ seq: 50, terminal: 't9', type: 'title', data: { title: 'Stale50' } })
    server.emitEvent({ seq: 51, terminal: 't9', type: 'title', data: { title: 'Fresh51' } })

    await vi.waitFor(() => {
      expect(store.getSnapshot().seq).toBe(51)
    })
    expect(store.getSnapshot().sessions).toHaveLength(1)
    expect(store.getSnapshot().sessions[0]).toMatchObject({ address: 't9', title: 'Fresh51' })
  })

  it('triggers reconnect on heartbeat watchdog timeout and recovers with backoff', async () => {
    const server = await startScriptedServer([])
    cleanups.push(() => new Promise<void>((resolve) => server.server.close(() => resolve())))

    const store = new HerdrRuntimeStore({
      heartbeatTimeoutMs: 60,
      reconnectBaseMs: 25,
      reconnectMaxMs: 100,
      discoverAndConnect: async () => {
        const socket = net.createConnection({ port: server.port, host: '127.0.0.1' })
        await new Promise<void>((resolve) => socket.once('connect', resolve))
        return {
          socket,
          socketPath: '/tmp/test.sock',
          session: 'test',
          binaryPath: null,
          ownership: 'external'
        }
      }
    })
    cleanups.push(() => store.dispose())

    await store.connect()
    expect(server.connectCount).toBe(1)

    // Keep connection alive with one heartbeat, then stop heartbeating and expect automatic reconnect.
    await new Promise((resolve) => setTimeout(resolve, 35))
    server.emitNotification('heartbeat', {})
    expect(server.connectCount).toBe(1)

    await vi.waitFor(
      () => {
        expect(server.connectCount).toBeGreaterThanOrEqual(2)
        expect(store.getConnectionState()).toBe('connected')
      },
      { timeout: 1_500 }
    )
  })

  it('recovers via reconnecting instead of sticking in connected when socket drops mid-hydration', async () => {
    let connections = 0
    const server = net.createServer((socket) => {
      connections += 1
      const attempt = connections
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
                core: { id: 'core-mid', name: 'mid-drop' },
                methods: [
                  'hello',
                  'events.subscribe',
                  'server.status',
                  'machine.list',
                  'templates.list'
                ],
                features: ['framed']
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
        if (frame.channel !== 0 || frame.kind !== HerdrFrameKind.DATA) return
        for (const line of frame.payload.toString('utf8').split('\n').filter(Boolean)) {
          const req = JSON.parse(line)
          if (req.method === 'events.subscribe') {
            socket.write(
              encodeDataFrame(
                0,
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: req.id,
                  result: { channel: 1, seq: 1, terminals: [] }
                })
              )
            )
            if (attempt === 1) {
              // Drop socket right after events.subscribe while hydrateMetadata RPCs are in flight.
              setTimeout(() => socket.destroy(), 5)
            }
            return
          }
          if (attempt === 1) {
            // Never answer hydrateMetadata on attempt 1 before socket drops.
            return
          }
          let result: unknown = {}
          if (req.method === 'server.status') {
            result = {
              core: { id: 'core-mid', name: 'mid-drop' },
              version: '0.1.21',
              pid: 99,
              uptime_ms: 100,
              live: 0,
              finished: 0,
              holders: []
            }
          } else if (req.method === 'machine.list') {
            result = { machines: [] }
          } else if (req.method === 'templates.list') {
            result = { templates: [] }
          }
          socket.write(encodeDataFrame(0, JSON.stringify({ jsonrpc: '2.0', id: req.id, result })))
        }
      }
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())))

    const store = new HerdrRuntimeStore({
      heartbeatTimeoutMs: 10_000,
      reconnectBaseMs: 25,
      reconnectMaxMs: 50,
      discoverAndConnect: async () => {
        const socket = net.createConnection({ port, host: '127.0.0.1' })
        await new Promise<void>((resolve) => socket.once('connect', resolve))
        return {
          socket,
          socketPath: '/tmp/mid-drop.sock',
          session: 'mid',
          binaryPath: null,
          ownership: 'external'
        }
      }
    })
    cleanups.push(() => store.dispose())

    const firstSnap = await store.connect()
    expect(firstSnap.connection).toBe('reconnecting')
    expect(store.getClient()).toBeNull()

    await vi.waitFor(
      () => {
        expect(connections).toBeGreaterThanOrEqual(2)
        expect(store.getConnectionState()).toBe('connected')
        expect(store.getClient()).not.toBeNull()
      },
      { timeout: 1_500 }
    )
  })

  it('downgrades cleanly to fallback-pty when binary is missing or autoStart is off', async () => {
    const store = new HerdrRuntimeStore({
      discoverAndConnect: async () => {
        throw new HerdrDiscoveryError('BINARY_NOT_FOUND', 'binary missing')
      }
    })
    cleanups.push(() => store.dispose())

    const snap = await store.connect()
    expect(snap.connection).toBe('fallback-pty')
    expect(snap.ownership).toBe('none')
    expect(snap.error).toContain('binary missing')
    expect(snap.binary).toMatchObject({
      source: 'missing',
      path: null,
      version: null,
      installHint: expect.any(String)
    })
  })

  it('populates snapshot.binary with source and asynchronously probed version on connect', async () => {
    const server = await startScriptedServer([])
    cleanups.push(() => new Promise<void>((resolve) => server.server.close(() => resolve())))

    const binaryManager = new HerdrBinaryManager({
      platform: 'darwin',
      arch: 'arm64',
      statFile: async () => ({ mtimeMs: 123, size: 456 }),
      execVersion: async () => 'hc 0.1.21\n'
    })

    const store = new HerdrRuntimeStore({
      heartbeatTimeoutMs: 10_000,
      binaryManager,
      discoverAndConnect: async () => {
        const socket = net.createConnection({ port: server.port, host: '127.0.0.1' })
        await new Promise<void>((resolve) => socket.once('connect', resolve))
        return {
          socket,
          socketPath: '/tmp/bin-probe.sock',
          session: 'probe',
          binaryPath: '/Applications/Tuff.app/Contents/Resources/herdr-core/herdr-core',
          binarySource: 'resources',
          ownership: 'external'
        }
      }
    })
    cleanups.push(() => store.dispose())

    const snap = await store.connect()
    expect(snap.binary).toMatchObject({
      source: 'packaged-resource',
      path: '/Applications/Tuff.app/Contents/Resources/herdr-core/herdr-core',
      platform: 'darwin',
      arch: 'arm64',
      supported: true,
      installHint: null
    })

    await vi.waitFor(() => {
      expect(store.getSnapshot().binary?.version).toBe('0.1.21')
    })
  })

  it('ignores stale in-flight refreshBinaryInfo after BINARY_NOT_FOUND or cached-version connect', async () => {
    const server = await startScriptedServer([])
    cleanups.push(() => new Promise<void>((resolve) => server.server.close(() => resolve())))

    let resolveStaleInspect!: () => void
    const staleInspectGate = new Promise<void>((resolve) => {
      resolveStaleInspect = resolve
    })

    const binaryManager = new HerdrBinaryManager({
      platform: 'darwin',
      arch: 'arm64',
      discoveryDeps: {
        platform: 'darwin',
        homedir: () => '/Users/tester',
        env: { PATH: '/stale/bin' },
        isExecutable: async (candidate) => {
          await staleInspectGate
          return candidate === '/stale/bin/herdr-core'
        }
      },
      statFile: async () => ({ mtimeMs: 10, size: 20 }),
      execVersion: async (binaryPath) =>
        binaryPath.includes('cached') ? 'hc 0.2.0\n' : 'hc 0.1.0\n'
    })

    // Case 1: in-flight refreshBinaryInfo resolves AFTER BINARY_NOT_FOUND
    const missingStore = new HerdrRuntimeStore({
      binaryManager,
      discoverAndConnect: async () => {
        throw new HerdrDiscoveryError('BINARY_NOT_FOUND', 'missing now')
      }
    })
    cleanups.push(() => missingStore.dispose())

    const pendingMissingRefresh = missingStore.refreshBinaryInfo()
    const missingSnap = await missingStore.connect()
    expect(missingSnap.binary?.source).toBe('missing')

    // Case 2: in-flight refreshBinaryInfo resolves AFTER connect hits a cached binary version
    await binaryManager.probeVersion('/opt/cached/herdr-core')
    const cachedStore = new HerdrRuntimeStore({
      heartbeatTimeoutMs: 10_000,
      binaryManager,
      discoverAndConnect: async () => {
        const socket = net.createConnection({ port: server.port, host: '127.0.0.1' })
        await new Promise<void>((resolve) => socket.once('connect', resolve))
        return {
          socket,
          socketPath: '/tmp/cached-bin.sock',
          session: 'cached',
          binaryPath: '/opt/cached/herdr-core',
          binarySource: 'settings',
          ownership: 'external'
        }
      }
    })
    cleanups.push(() => cachedStore.dispose())

    const pendingCachedRefresh = cachedStore.refreshBinaryInfo()
    const cachedSnap = await cachedStore.connect()
    expect(cachedSnap.binary).toMatchObject({
      source: 'custom',
      path: '/opt/cached/herdr-core',
      version: '0.2.0'
    })

    // Release both stale in-flight inspections and confirm neither overwrites newer state.
    resolveStaleInspect()
    await Promise.all([pendingMissingRefresh, pendingCachedRefresh])

    expect(missingStore.getSnapshot().binary?.source).toBe('missing')
    expect(missingStore.getSnapshot().binary?.path).toBeNull()
    expect(cachedStore.getSnapshot().binary).toMatchObject({
      source: 'custom',
      path: '/opt/cached/herdr-core',
      version: '0.2.0'
    })
  })
})
