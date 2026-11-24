import type { AddressInfo, Server, Socket } from 'node:net'
import { Buffer } from 'node:buffer'
import net from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodeCreditPayload,
  decodeFactsPayload,
  decodeFocusPayload,
  decodeResizePayload,
  encodeCloseFrame,
  encodeDataFrame,
  encodeFactsFrame,
  encodeResizeFrame,
  HerdrFrameDecoder,
  HerdrFrameKind
} from './frame-codec'
import { HerdrClientError, HerdrFramedClient, HerdrRpcError } from './framed-client'

interface MockServerContext {
  server: Server
  port: number
  sockets: Socket[]
  receivedFrames: Array<{ channel: number; kind: number; payload: Buffer }>
}

async function createMockHerdrServer(
  onConnection: (socket: Socket, ctx: MockServerContext) => void
): Promise<MockServerContext> {
  const ctx: MockServerContext = {
    server: null as unknown as Server,
    port: 0,
    sockets: [],
    receivedFrames: []
  }

  ctx.server = net.createServer((socket) => {
    ctx.sockets.push(socket)
    onConnection(socket, ctx)
  })

  await new Promise<void>((resolve) => {
    ctx.server.listen(0, '127.0.0.1', () => {
      ctx.port = (ctx.server.address() as AddressInfo).port
      resolve()
    })
  })

  return ctx
}

const mocksToClose: MockServerContext[] = []
const clientsToClose: HerdrFramedClient[] = []

afterEach(async () => {
  while (clientsToClose.length > 0) {
    clientsToClose.pop()!.close()
  }
  while (mocksToClose.length > 0) {
    const ctx = mocksToClose.pop()!
    for (const sock of ctx.sockets.splice(0)) {
      sock.destroy()
    }
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()))
  }
})

describe('herdr-core framed-client', () => {
  it('completes plain NDJSON hello handshake, switches to framed mode, and multiplexes channel 0 RPC + event + multiple PTY channels', async () => {
    const mock = await createMockHerdrServer((socket, ctx) => {
      let framed = false
      let plainBuf = Buffer.alloc(0)
      const decoder = new HerdrFrameDecoder()

      socket.on('data', (chunk) => {
        if (!framed) {
          plainBuf = Buffer.concat([plainBuf, chunk])
          const nl = plainBuf.indexOf(0x0a)
          if (nl === -1) return
          const req = JSON.parse(plainBuf.subarray(0, nl).toString('utf8'))
          expect(req.method).toBe('hello')
          expect(req.params).toEqual({ generation: 1, framed: true })
          framed = true

          // Reply plain NDJSON + immediately coalesce a framed early event in the same write!
          const reply = `${JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              generation: 1,
              framed: true,
              version: '0.1.21',
              core: { id: 'core-1', name: 'local-host' },
              methods: ['hello', 'events.subscribe', 'terminal.attach'],
              features: ['framed', 'automatic_input']
            }
          })}\n`
          socket.write(reply)

          const rem = plainBuf.subarray(nl + 1)
          if (rem.length > 0) {
            for (const f of decoder.push(rem)) handleFrame(f)
          }
          return
        }

        for (const frame of decoder.push(chunk)) {
          handleFrame(frame)
        }
      })

      function handleFrame(frame: { channel: number; kind: number; payload: Buffer }): void {
        ctx.receivedFrames.push(frame)
        if (frame.channel === 0 && frame.kind === HerdrFrameKind.DATA) {
          for (const line of frame.payload.toString('utf8').split('\n').filter(Boolean)) {
            const msg = JSON.parse(line)
            if (msg.method === 'slow.a') {
              setTimeout(() => {
                socket.write(
                  encodeDataFrame(
                    0,
                    `${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tag: 'a' } })}\n`
                  )
                )
              }, 30)
            } else if (msg.method === 'fast.b') {
              // Match real herdr-core wire format: channel 0 JSON-RPC frame without trailing newline.
              socket.write(
                encodeDataFrame(
                  0,
                  JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tag: 'b' } })
                )
              )
            } else if (msg.method === 'rpc.fail') {
              socket.write(
                encodeDataFrame(
                  0,
                  `${JSON.stringify({
                    jsonrpc: '2.0',
                    id: msg.id,
                    error: { code: -32000, message: 'not_found', data: { kind: 'not_found' } }
                  })}\n`
                )
              )
            } else if (msg.method === 'events.subscribe') {
              // Send reply AND an immediate early event frame in one coalesced packet!
              const evLine = `${JSON.stringify({
                jsonrpc: '2.0',
                method: 'event',
                params: { seq: 1, terminal: 't1', type: 'title', data: { title: 'Early' } }
              })}\n`
              socket.write(
                Buffer.concat([
                  encodeDataFrame(
                    0,
                    `${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { channel: 1, seq: 0, terminals: [] } })}\n`
                  ),
                  encodeDataFrame(1, evLine)
                ])
              )
            } else if (msg.method === 'terminal.attach') {
              const ch = msg.params.terminal === 't1' ? 2 : 3
              socket.write(
                Buffer.concat([
                  encodeDataFrame(
                    0,
                    `${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { channel: ch } })}\n`
                  ),
                  encodeResizeFrame(ch, 90, 30),
                  encodeFactsFrame(ch, { title: `term-${ch}` }),
                  encodeDataFrame(ch, `paint-${ch}`)
                ])
              )
            }
          }
        }
      }
    })
    mocksToClose.push(mock)

    const socket = net.createConnection({ port: mock.port, host: '127.0.0.1' })
    await new Promise<void>((resolve) => socket.once('connect', resolve))
    const client = new HerdrFramedClient({ socket })
    clientsToClose.push(client)

    const hello = await client.handshake()
    expect(hello.generation).toBe(1)
    expect(hello.framed).toBe(true)
    expect(hello.core.id).toBe('core-1')

    // Concurrent out-of-order channel 0 RPC multiplexing + structured RPC error.
    const [resA, resB] = await Promise.all([
      client.request<{ tag: string }>('slow.a'),
      client.request<{ tag: string }>('fast.b')
    ])
    expect(resA).toEqual({ tag: 'a' })
    expect(resB).toEqual({ tag: 'b' })

    await expect(client.request('rpc.fail')).rejects.toMatchObject({
      name: 'HerdrRpcError',
      code: -32000,
      kind: 'not_found'
    })
    await expect(client.request('rpc.fail')).rejects.toBeInstanceOf(HerdrRpcError)

    // Event channel: receives coalesced early frame + automatically sends CREDIT.
    const sub = await client.request<{ channel: number }>('events.subscribe', {})
    const notifications: unknown[] = []
    client.registerEventChannel(sub.channel, {
      onNotification: (n) => notifications.push(n)
    })
    expect(notifications).toHaveLength(1)
    expect((notifications[0] as { params: { data: { title: string } } }).params.data.title).toBe(
      'Early'
    )

    // Two concurrent PTY channels with full control frame coverage.
    const [a1, a2] = await Promise.all([
      client.request<{ channel: number }>('terminal.attach', { terminal: 't1' }),
      client.request<{ channel: number }>('terminal.attach', { terminal: 't2' })
    ])

    const pty1Data: string[] = []
    const pty2Data: string[] = []
    const pty1Resizes: Array<{ cols: number; rows: number }> = []
    const pty1Facts: Array<Record<string, unknown>> = []

    client.registerPtyChannel(a1.channel, {
      onData: (buf) => pty1Data.push(buf.toString('utf8')),
      onResize: (s) => pty1Resizes.push(s),
      onFacts: (f) => pty1Facts.push(f)
    })
    client.registerPtyChannel(a2.channel, {
      onData: (buf) => pty2Data.push(buf.toString('utf8'))
    })

    expect(pty1Data).toEqual(['paint-2'])
    expect(pty2Data).toEqual(['paint-3'])
    expect(pty1Resizes).toEqual([{ cols: 90, rows: 30 }])
    expect(pty1Facts).toEqual([{ title: 'term-2' }])

    client.sendData(a1.channel, 'ls\r')
    client.sendAutomaticInput(a1.channel, '\u001b[?1;2c')
    client.sendCredit(a1.channel, 7)
    client.sendResize(a1.channel, 110, 40)
    client.sendFocus(a1.channel, true)
    client.sendFacts(a1.channel, { bg: '#101010' })
    client.detachChannel(a1.channel)

    // Verify server received event CREDIT + all 7 PTY frames on channel 2 without fixed sleeps.
    await vi.waitFor(
      () => {
        const eventCredit = mock.receivedFrames.find(
          (f) => f.channel === 1 && f.kind === HerdrFrameKind.CREDIT
        )
        const ch2Frames = mock.receivedFrames.filter((f) => f.channel === 2)
        expect(eventCredit).toBeDefined()
        expect(ch2Frames).toHaveLength(7)
      },
      { timeout: 2_000 }
    )

    const eventCredit = mock.receivedFrames.find(
      (f) => f.channel === 1 && f.kind === HerdrFrameKind.CREDIT
    )
    expect(decodeCreditPayload(eventCredit!.payload)).toBeGreaterThan(0)

    const ch2Frames = mock.receivedFrames.filter((f) => f.channel === 2)
    expect(ch2Frames.map((f) => f.kind)).toEqual([
      HerdrFrameKind.DATA,
      HerdrFrameKind.AUTOMATIC_INPUT,
      HerdrFrameKind.CREDIT,
      HerdrFrameKind.RESIZE,
      HerdrFrameKind.FOCUS,
      HerdrFrameKind.FACTS,
      HerdrFrameKind.CLOSE
    ])
    expect(decodeCreditPayload(ch2Frames[2]!.payload)).toBe(7)
    expect(decodeResizePayload(ch2Frames[3]!.payload)).toEqual({ cols: 110, rows: 40 })
    expect(decodeFocusPayload(ch2Frames[4]!.payload)).toBe(true)
    expect(decodeFactsPayload(ch2Frames[5]!.payload)).toEqual({ bg: '#101010' })

    client.close()
  })

  it('rejects unsupported protocol generation or non-framed hello reply', async () => {
    const mock = await createMockHerdrServer((socket) => {
      socket.once('data', () => {
        socket.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: { generation: 2, framed: false, core: { id: 'x', name: 'x' } }
          })}\n`
        )
      })
    })
    mocksToClose.push(mock)

    const socket = net.createConnection({ port: mock.port, host: '127.0.0.1' })
    await new Promise<void>((resolve) => socket.once('connect', resolve))
    const client = new HerdrFramedClient({ socket })
    clientsToClose.push(client)

    await expect(client.handshake()).rejects.toMatchObject({
      name: 'HerdrClientError',
      code: 'PROTOCOL_UNSUPPORTED'
    })
    expect(client.isClosed).toBe(true)
  })

  it('rejects in-flight RPC requests cleanly on timeout and on peer disconnect', async () => {
    const mock = await createMockHerdrServer((socket) => {
      let framed = false
      socket.on('data', (chunk) => {
        if (!framed) {
          framed = true
          socket.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: {
                generation: 1,
                framed: true,
                version: '0.1.21',
                core: { id: 'c', name: 'c' },
                methods: [],
                features: []
              }
            })}\n`
          )
          return
        }
        // Intentionally never answer RPCs so timeout and disconnect paths trigger.
        void chunk
      })
    })
    mocksToClose.push(mock)

    const socket = net.createConnection({ port: mock.port, host: '127.0.0.1' })
    await new Promise<void>((resolve) => socket.once('connect', resolve))
    const client = new HerdrFramedClient({ socket })
    clientsToClose.push(client)
    await client.handshake()

    await expect(client.request('hang.timeout', {}, { timeoutMs: 30 })).rejects.toMatchObject({
      code: 'RPC_TIMEOUT'
    })

    const closedReasons: Array<string | undefined> = []
    client.registerPtyChannel(9, {
      onData: () => undefined,
      onClose: (reason) => closedReasons.push(reason)
    })

    const inflight = client.request('hang.disconnect', {}, { timeoutMs: 5_000 })
    mock.sockets[0]!.write(encodeCloseFrame(9))
    await vi.waitFor(
      () => {
        expect(closedReasons).toEqual([undefined])
      },
      { timeout: 2_000 }
    )

    mock.sockets[0]!.destroy()
    await expect(inflight).rejects.toBeInstanceOf(HerdrClientError)
  })
})
