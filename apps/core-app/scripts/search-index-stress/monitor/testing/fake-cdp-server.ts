import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'

/**
 * A loopback HTTP + WebSocket server speaking just enough of the DevTools protocol for the monitor:
 * `/json/*` listings and request/response over RFC 6455 text frames. Requests can be held back to
 * stand in for a blocked target, and sockets can be dropped to stand in for a crash.
 */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export interface WsRequest {
  id: number
  method: string
  params: Record<string, unknown>
}

export type WsReply = { result: unknown } | { error: { code: number; message: string } }

export interface WsConnection {
  readonly path: string
  readonly closed: boolean
  send(message: object): void
  close(): void
}

function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length
  let header: Buffer
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length])
  } else if (length < 65_536) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  return Buffer.concat([header, payload])
}

class FrameReader {
  private buffer: Buffer = Buffer.alloc(0)
  private fragments: Buffer[] = []

  push(
    chunk: Buffer,
    onText: (text: string) => void,
    onControl: (opcode: number, payload: Buffer) => void
  ): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      if (this.buffer.length < 2) return
      const first = this.buffer[0]
      const second = this.buffer[1]
      const fin = (first & 0x80) !== 0
      const opcode = first & 0x0f
      const masked = (second & 0x80) !== 0
      let length = second & 0x7f
      let offset = 2
      if (length === 126) {
        if (this.buffer.length < 4) return
        length = this.buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (this.buffer.length < 10) return
        length = Number(this.buffer.readBigUInt64BE(2))
        offset = 10
      }
      const maskBytes = masked ? 4 : 0
      if (this.buffer.length < offset + maskBytes + length) return
      const mask = masked ? this.buffer.subarray(offset, offset + 4) : null
      const payload = Buffer.from(
        this.buffer.subarray(offset + maskBytes, offset + maskBytes + length)
      )
      if (mask)
        for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index % 4]
      this.buffer = this.buffer.subarray(offset + maskBytes + length)
      if (opcode >= 8) {
        onControl(opcode, payload)
      } else {
        this.fragments.push(payload)
        if (fin) {
          onText(Buffer.concat(this.fragments).toString('utf8'))
          this.fragments = []
        }
      }
    }
  }
}

class Connection implements WsConnection {
  closed = false
  private readonly reader = new FrameReader()

  constructor(
    readonly path: string,
    private readonly socket: Duplex,
    private readonly onRequest: (connection: Connection, request: WsRequest) => void,
    private readonly onGone: (connection: Connection) => void
  ) {
    socket.on('data', (chunk: Buffer) =>
      this.reader.push(
        chunk,
        (text) => {
          try {
            this.onRequest(this, JSON.parse(text) as WsRequest)
          } catch {
            // a malformed request is ignored, as a real endpoint would
          }
        },
        (opcode, payload) => {
          if (opcode === 0x8) this.close()
          else if (opcode === 0x9 && !this.closed) this.socket.write(encodeFrame(0xa, payload))
        }
      )
    )
    socket.on('close', () => this.gone())
    socket.on('error', () => this.gone())
  }

  send(message: object): void {
    if (this.closed) return
    this.socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(message))))
  }

  close(): void {
    if (this.closed) return
    try {
      this.socket.write(encodeFrame(0x8, Buffer.alloc(0)))
      this.socket.end()
    } catch {
      // already gone
    }
    this.gone()
  }

  /** Drops the TCP connection without a closing handshake. */
  destroy(): void {
    this.socket.destroy()
    this.gone()
  }

  private gone(): void {
    if (this.closed) return
    this.closed = true
    this.onGone(this)
  }
}

export class FakeWsServer {
  readonly connections = new Set<Connection>()
  /** Every request received, in order, as `path method`. */
  readonly received: string[] = []
  /** Path -> JSON body for plain GETs; a function is called per request. */
  readonly json = new Map<string, unknown | (() => unknown)>()
  /** Answers one request. Set per test. */
  respond: (connection: WsConnection, request: WsRequest) => WsReply | undefined = () => ({
    result: {}
  })
  /** While true, upgrades are refused with a 503. */
  refuseUpgrades = false
  private heldPrefixes: string[] | null = null
  private readonly queue: Array<{ connection: Connection; request: WsRequest }> = []
  answered = 0

  private constructor(
    private readonly server: Server,
    readonly port: number
  ) {}

  static async start(): Promise<FakeWsServer> {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const fake = new FakeWsServer(server, (server.address() as AddressInfo).port)
    server.on('request', (request, response) => fake.serveJson(request, response))
    server.on('upgrade', (request, socket) => fake.upgrade(request, socket))
    return fake
  }

  url(path = ''): string {
    return `ws://127.0.0.1:${this.port}${path}`
  }

  /** Held requests whose connection is still up. */
  get pendingHeld(): number {
    return this.queue.filter(({ connection }) => !connection.closed).length
  }

  /** Requests (on connections whose path starts with `pathPrefix`, default all) are accepted but not answered until `release`. */
  hold(pathPrefix = ''): void {
    this.heldPrefixes = [...(this.heldPrefixes ?? []), pathPrefix]
  }

  release(): void {
    this.heldPrefixes = null
    for (const { connection, request } of this.queue.splice(0)) this.answer(connection, request)
  }

  /** Drops connections whose path starts with `pathPrefix` (default all) without a closing handshake. */
  dropAll(pathPrefix = ''): void {
    for (const connection of [...this.connections])
      if (connection.path.startsWith(pathPrefix)) connection.destroy()
  }

  async stop(): Promise<void> {
    this.dropAll()
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  private serveJson(request: IncomingMessage, response: import('node:http').ServerResponse): void {
    const path = (request.url ?? '/').split('?')[0]
    const entry = this.json.get(path)
    if (entry === undefined) {
      response.writeHead(404).end('not found')
      return
    }
    const body = typeof entry === 'function' ? (entry as () => unknown)() : entry
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  }

  private upgrade(request: IncomingMessage, socket: Duplex): void {
    const key = request.headers['sec-websocket-key']
    if (this.refuseUpgrades || typeof key !== 'string') {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n')
      return
    }
    const accept = createHash('sha1')
      .update(key + GUID)
      .digest('base64')
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`
    )
    const connection = new Connection(
      (request.url ?? '/').split('?')[0],
      socket,
      (source, message) => this.onRequest(source, message),
      (source) => this.connections.delete(source)
    )
    this.connections.add(connection)
  }

  private onRequest(connection: Connection, request: WsRequest): void {
    this.received.push(`${connection.path} ${request.method}`)
    if (this.heldPrefixes?.some((prefix) => connection.path.startsWith(prefix)))
      this.queue.push({ connection, request })
    else this.answer(connection, request)
  }

  private answer(connection: Connection, request: WsRequest): void {
    const reply = this.respond(connection, request)
    if (!reply) return
    this.answered++
    connection.send({ id: request.id, ...reply })
  }
}
