import type { Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import type { HerdrFrame, HerdrResizePayload } from './frame-codec'
import { Buffer } from 'node:buffer'
import net from 'node:net'
import { StringDecoder } from 'node:string_decoder'
import {
  decodeFactsPayload,
  decodeResizePayload,
  encodeAutomaticInputFrame,
  encodeCloseFrame,
  encodeCreditFrame,
  encodeDataFrame,
  encodeFactsFrame,
  encodeFocusFrame,
  encodeResizeFrame,
  HerdrFrameDecoder,
  HerdrFrameKind
} from './frame-codec'

export const DEFAULT_HERDR_HANDSHAKE_TIMEOUT_MS = 5_000
export const DEFAULT_HERDR_RPC_TIMEOUT_MS = 15_000
const MAX_HANDSHAKE_BYTES = 1024 * 1024
const MAX_EARLY_CHANNEL_FRAMES = 128
const MAX_EARLY_CHANNEL_BYTES = 4 * 1024 * 1024

export interface HerdrWireCoreInfo {
  id: string
  name: string
}

export interface HerdrHelloResult {
  generation: number
  version: string
  core: HerdrWireCoreInfo
  framed: boolean
  methods: string[]
  features: string[]
}

export interface HerdrRpcNotification {
  jsonrpc?: string
  method: string
  params?: Record<string, unknown>
}

export interface HerdrEventChannelHandlers {
  onNotification: (notification: HerdrRpcNotification) => void
  onClose?: (reason?: string) => void
  onError?: (error: Error) => void
}

export interface HerdrPtyChannelHandlers {
  onData: (chunk: Buffer) => void
  onResize?: (size: HerdrResizePayload) => void
  onFacts?: (facts: Record<string, unknown>) => void
  onClose?: (reason?: string) => void
}

export interface HerdrRpcErrorPayload {
  code: number
  message: string
  data?: {
    kind?: string
    hint?: string
    [key: string]: unknown
  }
}

export class HerdrRpcError extends Error {
  readonly code: number
  readonly kind?: string
  readonly hint?: string
  readonly data?: Record<string, unknown>

  constructor(payload: HerdrRpcErrorPayload) {
    super(payload.message || 'herdr-core RPC error')
    this.name = 'HerdrRpcError'
    this.code = payload.code
    this.kind = typeof payload.data?.kind === 'string' ? payload.data.kind : undefined
    this.hint = typeof payload.data?.hint === 'string' ? payload.data.hint : undefined
    this.data = payload.data
  }
}

export type HerdrClientErrorCode =
  | 'CLIENT_DISCONNECTED'
  | 'HANDSHAKE_TIMEOUT'
  | 'PROTOCOL_UNSUPPORTED'
  | 'RPC_TIMEOUT'
  | 'SOCKET_ERROR'

export class HerdrClientError extends Error {
  readonly code: HerdrClientErrorCode
  readonly cause?: unknown

  constructor(code: HerdrClientErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'HerdrClientError'
    this.code = code
    this.cause = cause
  }
}

interface PendingRpc {
  method: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface EventChannelEntry {
  kind: 'event'
  decoder: StringDecoder
  lineBuffer: string
  handlers: HerdrEventChannelHandlers
}

interface PtyChannelEntry {
  kind: 'pty'
  handlers: HerdrPtyChannelHandlers
}

type ChannelEntry = EventChannelEntry | PtyChannelEntry

interface EarlyFrameBucket {
  frames: HerdrFrame[]
  bytes: number
}

export interface HerdrFramedClientOptions {
  socket?: Duplex
  socketPath?: string
  handshakeTimeoutMs?: number
  defaultRpcTimeoutMs?: number
}

/**
 * Pure `node:net` single-socket client for herdr-core's framed binary protocol.
 * Starts in plain NDJSON mode for `hello({ generation: 1, framed: true })`,
 * then switches immediately to 9-byte binary framing on channel 0 (JSON-RPC)
 * and concurrent non-zero channels (`events.subscribe` + `terminal.attach`).
 */
export class HerdrFramedClient {
  private readonly socket: Duplex
  private readonly defaultRpcTimeoutMs: number
  private readonly handshakeTimeoutMs: number
  private readonly frameDecoder = new HerdrFrameDecoder()
  private readonly rpcDecoder = new StringDecoder('utf8')
  private readonly pendingRpc = new Map<number, PendingRpc>()
  private readonly channels = new Map<number, ChannelEntry>()
  private readonly earlyFrames = new Map<number, EarlyFrameBucket>()
  private readonly closeListeners = new Set<(error?: Error) => void>()

  private mode: 'plain' | 'framed' | 'closed' = 'plain'
  private handshakeBuffer: Buffer = Buffer.alloc(0)
  private handshakeWaiter: {
    id: number
    resolve: (result: HerdrHelloResult) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null
  private rpcLineBuffer = ''
  private nextRequestId = 1
  private helloResult: HerdrHelloResult | null = null

  constructor(options: HerdrFramedClientOptions) {
    if (options.socket) {
      this.socket = options.socket
    } else if (options.socketPath) {
      this.socket = net.createConnection(options.socketPath)
    } else {
      throw new Error('HerdrFramedClient requires either socket or socketPath')
    }
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HERDR_HANDSHAKE_TIMEOUT_MS
    this.defaultRpcTimeoutMs = options.defaultRpcTimeoutMs ?? DEFAULT_HERDR_RPC_TIMEOUT_MS

    this.socket.on('data', this.handleSocketData)
    this.socket.on('error', this.handleSocketError)
    this.socket.on('close', this.handleSocketClose)
    this.socket.on('end', this.handleSocketEnd)
  }

  get isConnected(): boolean {
    return this.mode === 'framed'
  }

  get isClosed(): boolean {
    return this.mode === 'closed'
  }

  get hello(): HerdrHelloResult | null {
    return this.helloResult
  }

  onClose(listener: (error?: Error) => void): () => void {
    this.closeListeners.add(listener)
    return () => {
      this.closeListeners.delete(listener)
    }
  }

  /**
   * Performs the plain NDJSON `hello` handshake and upgrades the socket to framed mode.
   */
  handshake(timeoutMs = this.handshakeTimeoutMs): Promise<HerdrHelloResult> {
    if (this.mode === 'framed' && this.helloResult) {
      return Promise.resolve(this.helloResult)
    }
    if (this.mode === 'closed') {
      return Promise.reject(
        new HerdrClientError('CLIENT_DISCONNECTED', 'herdr-core client is closed')
      )
    }
    if (this.handshakeWaiter) {
      return Promise.reject(
        new HerdrClientError('PROTOCOL_UNSUPPORTED', 'herdr-core handshake already in progress')
      )
    }

    const id = this.nextRequestId++
    return new Promise<HerdrHelloResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.handshakeWaiter) return
        const error = new HerdrClientError(
          'HANDSHAKE_TIMEOUT',
          `herdr-core hello handshake timed out after ${timeoutMs}ms`
        )
        this.handshakeWaiter = null
        this.teardown(error)
        reject(error)
      }, timeoutMs)

      this.handshakeWaiter = { id, resolve, reject, timer }

      const line = `${JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'hello',
        params: {
          generation: 1,
          framed: true
        }
      })}\n`

      try {
        this.socket.write(line)
      } catch (error) {
        clearTimeout(timer)
        this.handshakeWaiter = null
        const clientError = new HerdrClientError(
          'SOCKET_ERROR',
          `Failed to write hello handshake: ${error instanceof Error ? error.message : String(error)}`,
          error
        )
        this.teardown(clientError)
        reject(clientError)
      }
    })
  }

  /**
   * Sends a concurrent JSON-RPC 2.0 request over channel 0 with a bounded timeout.
   */
  request<TResult = unknown>(
    method: string,
    params?: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<TResult> {
    if (this.mode !== 'framed') {
      return Promise.reject(
        new HerdrClientError(
          'CLIENT_DISCONNECTED',
          `Cannot send RPC "${method}": herdr-core client is not in framed mode (${this.mode})`
        )
      )
    }

    const id = this.nextRequestId++
    const timeoutMs = options?.timeoutMs ?? this.defaultRpcTimeoutMs

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pendingRpc.get(id)
        if (!pending) return
        this.pendingRpc.delete(id)
        pending.reject(
          new HerdrClientError(
            'RPC_TIMEOUT',
            `herdr-core RPC "${method}" timed out after ${timeoutMs}ms`
          )
        )
      }, timeoutMs)

      this.pendingRpc.set(id, {
        method,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer
      })

      const body: Record<string, unknown> = {
        jsonrpc: '2.0',
        id,
        method
      }
      if (params !== undefined) {
        body.params = params
      }

      try {
        this.writeRaw(encodeDataFrame(0, JSON.stringify(body)))
      } catch (error) {
        clearTimeout(timer)
        this.pendingRpc.delete(id)
        reject(
          error instanceof Error
            ? error
            : new HerdrClientError('SOCKET_ERROR', String(error), error)
        )
      }
    })
  }

  /**
   * Registers an NDJSON event stream channel (e.g. returned by `events.subscribe`).
   * Automatically sends `CREDIT` frames as incoming DATA frames are consumed.
   */
  registerEventChannel(channel: number, handlers: HerdrEventChannelHandlers): () => void {
    this.assertNonZeroChannel(channel)
    const entry: EventChannelEntry = {
      kind: 'event',
      decoder: new StringDecoder('utf8'),
      lineBuffer: '',
      handlers
    }
    this.channels.set(channel, entry)
    this.flushEarlyFrames(channel)

    return () => {
      this.detachChannel(channel)
    }
  }

  /**
   * Registers a live PTY stream channel (returned by `terminal.attach`).
   * Caller drives backpressure explicitly via `sendCredit(channel, bytes)`.
   */
  registerPtyChannel(channel: number, handlers: HerdrPtyChannelHandlers): () => void {
    this.assertNonZeroChannel(channel)
    const entry: PtyChannelEntry = {
      kind: 'pty',
      handlers
    }
    this.channels.set(channel, entry)
    this.flushEarlyFrames(channel)

    return () => {
      this.detachChannel(channel)
    }
  }

  sendData(channel: number, data: Buffer | Uint8Array | string): void {
    this.assertNonZeroChannel(channel)
    this.assertFramed()
    this.writeRaw(encodeDataFrame(channel, data))
  }

  sendAutomaticInput(channel: number, data: Buffer | Uint8Array | string): void {
    this.assertNonZeroChannel(channel)
    this.assertFramed()
    this.writeRaw(encodeAutomaticInputFrame(channel, data))
  }

  sendCredit(channel: number, bytes: number): void {
    this.assertNonZeroChannel(channel)
    if (this.mode !== 'framed' || bytes <= 0) return
    this.writeRaw(encodeCreditFrame(channel, Math.floor(bytes)))
  }

  sendResize(channel: number, cols: number, rows: number): void {
    this.assertNonZeroChannel(channel)
    this.assertFramed()
    this.writeRaw(encodeResizeFrame(channel, cols, rows))
  }

  sendFocus(channel: number, focused: boolean): void {
    this.assertNonZeroChannel(channel)
    this.assertFramed()
    this.writeRaw(encodeFocusFrame(channel, focused))
  }

  sendFacts(channel: number, facts: unknown): void {
    this.assertNonZeroChannel(channel)
    this.assertFramed()
    this.writeRaw(encodeFactsFrame(channel, facts))
  }

  /**
   * Detaches a non-zero stream channel by sending a `CLOSE` frame ONLY.
   * Does not terminate the underlying herdr-core terminal process.
   */
  detachChannel(channel: number): void {
    if (channel === 0) return
    const hadChannel = this.channels.delete(channel)
    this.earlyFrames.delete(channel)
    if (hadChannel && this.mode === 'framed') {
      try {
        this.writeRaw(encodeCloseFrame(channel))
      } catch {
        // Best-effort detach if socket is already closing.
      }
    }
  }

  /**
   * Gracefully detaches all open stream channels via `CLOSE` frames and closes
   * the socket. NEVER invokes `server.stop` or `server.restart`.
   */
  close(): void {
    if (this.mode === 'closed') return
    if (this.mode === 'framed') {
      for (const channel of [...this.channels.keys()]) {
        try {
          this.writeRaw(encodeCloseFrame(channel))
        } catch {
          // Ignore write failures while shutting down.
        }
      }
    }
    this.teardown()
  }

  private assertNonZeroChannel(channel: number): void {
    if (!Number.isInteger(channel) || channel <= 0) {
      throw new Error(`Expected non-zero herdr channel, got ${String(channel)}`)
    }
  }

  private assertFramed(): void {
    if (this.mode !== 'framed') {
      throw new HerdrClientError(
        'CLIENT_DISCONNECTED',
        `herdr-core client is not connected (${this.mode})`
      )
    }
  }

  private writeRaw(buffer: Buffer): void {
    if (this.mode === 'closed') {
      throw new HerdrClientError('CLIENT_DISCONNECTED', 'herdr-core client is closed')
    }
    this.socket.write(buffer)
  }

  private readonly handleSocketData = (chunk: Buffer | string): void => {
    if (this.mode === 'closed') return
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')
    if (data.length === 0) return

    if (this.mode === 'plain') {
      this.consumePlainHandshake(data)
      return
    }

    this.consumeFramedBytes(data)
  }

  private consumePlainHandshake(chunk: Buffer): void {
    this.handshakeBuffer =
      this.handshakeBuffer.length === 0 ? chunk : Buffer.concat([this.handshakeBuffer, chunk])

    if (this.handshakeBuffer.length > MAX_HANDSHAKE_BYTES) {
      const error = new HerdrClientError(
        'PROTOCOL_UNSUPPORTED',
        'herdr-core handshake response exceeded 1 MiB limit'
      )
      this.teardown(error)
      return
    }

    const newlineIndex = this.handshakeBuffer.indexOf(0x0a)
    if (newlineIndex === -1) return

    const line = this.handshakeBuffer.subarray(0, newlineIndex).toString('utf8').trim()
    const trailing = this.handshakeBuffer.subarray(newlineIndex + 1)
    this.handshakeBuffer = Buffer.alloc(0)

    const waiter = this.handshakeWaiter
    this.handshakeWaiter = null
    if (!waiter) {
      this.teardown(
        new HerdrClientError('PROTOCOL_UNSUPPORTED', 'Unexpected plain data before hello handshake')
      )
      return
    }
    clearTimeout(waiter.timer)

    let parsed: {
      id?: number
      result?: Partial<HerdrHelloResult>
      error?: HerdrRpcErrorPayload
    }
    try {
      parsed = JSON.parse(line) as typeof parsed
    } catch (error) {
      const protocolError = new HerdrClientError(
        'PROTOCOL_UNSUPPORTED',
        `Invalid JSON in hello handshake reply: ${error instanceof Error ? error.message : String(error)}`,
        error
      )
      this.teardown(protocolError)
      waiter.reject(protocolError)
      return
    }

    if (parsed.error) {
      const rpcError = new HerdrRpcError(parsed.error)
      this.teardown(rpcError)
      waiter.reject(rpcError)
      return
    }

    const result = parsed.result
    if (
      !result ||
      result.generation !== 1 ||
      result.framed !== true ||
      !result.core ||
      typeof result.core.id !== 'string' ||
      typeof result.core.name !== 'string'
    ) {
      const protocolError = new HerdrClientError(
        'PROTOCOL_UNSUPPORTED',
        `Unsupported herdr-core handshake reply: generation=${String(result?.generation)}, framed=${String(result?.framed)}`
      )
      this.teardown(protocolError)
      waiter.reject(protocolError)
      return
    }

    const hello: HerdrHelloResult = {
      generation: result.generation,
      version: typeof result.version === 'string' ? result.version : 'unknown',
      core: {
        id: result.core.id,
        name: result.core.name
      },
      framed: true,
      methods: Array.isArray(result.methods) ? result.methods.map(String) : [],
      features: Array.isArray(result.features) ? result.features.map(String) : []
    }

    this.helloResult = hello
    this.mode = 'framed'
    waiter.resolve(hello)

    if (trailing.length > 0 && this.mode === 'framed') {
      this.consumeFramedBytes(trailing)
    }
  }

  private consumeFramedBytes(chunk: Buffer): void {
    let frames: HerdrFrame[]
    try {
      frames = this.frameDecoder.push(chunk)
    } catch (error) {
      const clientError = new HerdrClientError(
        'PROTOCOL_UNSUPPORTED',
        `herdr-core frame decode failed: ${error instanceof Error ? error.message : String(error)}`,
        error
      )
      this.teardown(clientError)
      return
    }

    for (const frame of frames) {
      if (this.mode !== 'framed') return
      this.dispatchFrame(frame)
    }
  }

  private dispatchFrame(frame: HerdrFrame): void {
    if (frame.channel === 0) {
      this.dispatchControlFrame(frame)
      return
    }

    const entry = this.channels.get(frame.channel)
    if (!entry) {
      this.bufferEarlyFrame(frame)
      return
    }

    this.deliverChannelFrame(frame.channel, entry, frame)
  }

  private bufferEarlyFrame(frame: HerdrFrame): void {
    let bucket = this.earlyFrames.get(frame.channel)
    if (!bucket) {
      bucket = { frames: [], bytes: 0 }
      this.earlyFrames.set(frame.channel, bucket)
    }
    if (
      bucket.frames.length >= MAX_EARLY_CHANNEL_FRAMES ||
      bucket.bytes + frame.payload.length > MAX_EARLY_CHANNEL_BYTES
    ) {
      return
    }
    bucket.frames.push(frame)
    bucket.bytes += frame.payload.length
  }

  private flushEarlyFrames(channel: number): void {
    const bucket = this.earlyFrames.get(channel)
    if (!bucket) return
    this.earlyFrames.delete(channel)

    for (const frame of bucket.frames) {
      const entry = this.channels.get(channel)
      if (!entry || this.mode !== 'framed') break
      this.deliverChannelFrame(channel, entry, frame)
    }
  }

  private dispatchControlFrame(frame: HerdrFrame): void {
    if (frame.kind === HerdrFrameKind.CLOSE) {
      this.teardown(
        new HerdrClientError('CLIENT_DISCONNECTED', 'herdr-core closed control channel 0')
      )
      return
    }
    if (frame.kind !== HerdrFrameKind.DATA || frame.payload.length === 0) {
      return
    }

    const decoded = this.rpcDecoder.write(frame.payload)
    if (!this.rpcLineBuffer && !decoded.includes('\n')) {
      const trimmed = decoded.trim()
      if (trimmed && this.tryHandleRpcMessageLine(trimmed)) {
        return
      }
    }

    this.rpcLineBuffer += decoded
    let newlineIndex = this.rpcLineBuffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = this.rpcLineBuffer.slice(0, newlineIndex).trim()
      this.rpcLineBuffer = this.rpcLineBuffer.slice(newlineIndex + 1)
      if (line) {
        this.tryHandleRpcMessageLine(line)
      }
      newlineIndex = this.rpcLineBuffer.indexOf('\n')
    }

    const trailing = this.rpcLineBuffer.trim()
    if (trailing && this.tryHandleRpcMessageLine(trailing)) {
      this.rpcLineBuffer = ''
    }
  }

  private tryHandleRpcMessageLine(line: string): boolean {
    let parsed: {
      id?: number
      result?: unknown
      error?: HerdrRpcErrorPayload
    }
    try {
      parsed = JSON.parse(line) as typeof parsed
    } catch {
      return false
    }

    if (typeof parsed.id !== 'number') return true
    const pending = this.pendingRpc.get(parsed.id)
    if (!pending) return true

    this.pendingRpc.delete(parsed.id)
    clearTimeout(pending.timer)

    if (parsed.error) {
      pending.reject(new HerdrRpcError(parsed.error))
    } else {
      pending.resolve(parsed.result)
    }
    return true
  }

  private deliverChannelFrame(channel: number, entry: ChannelEntry, frame: HerdrFrame): void {
    if (entry.kind === 'event') {
      if (frame.kind === HerdrFrameKind.CLOSE) {
        const trailing = entry.decoder.end()
        if (trailing) {
          entry.lineBuffer += trailing
          this.flushEventLines(entry)
        }
        this.channels.delete(channel)
        const reason = frame.payload.length > 0 ? frame.payload.toString('utf8') : undefined
        entry.handlers.onClose?.(reason)
        return
      }

      if (frame.kind === HerdrFrameKind.DATA) {
        const byteCount = frame.payload.length
        if (byteCount > 0) {
          entry.lineBuffer += entry.decoder.write(frame.payload)
          this.flushEventLines(entry)
          this.sendCredit(channel, byteCount)
        }
      }
      return
    }

    // PTY channel
    switch (frame.kind) {
      case HerdrFrameKind.DATA:
        entry.handlers.onData(frame.payload)
        break
      case HerdrFrameKind.RESIZE:
        try {
          entry.handlers.onResize?.(decodeResizePayload(frame.payload))
        } catch {
          // Ignore malformed resize payload without tearing down unrelated channels.
        }
        break
      case HerdrFrameKind.FACTS:
        try {
          entry.handlers.onFacts?.(decodeFactsPayload(frame.payload))
        } catch {
          // Ignore malformed facts payload.
        }
        break
      case HerdrFrameKind.CLOSE: {
        this.channels.delete(channel)
        const reason = frame.payload.length > 0 ? frame.payload.toString('utf8') : undefined
        entry.handlers.onClose?.(reason)
        break
      }
      default:
        break
    }
  }

  private flushEventLines(entry: EventChannelEntry): void {
    let newlineIndex = entry.lineBuffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = entry.lineBuffer.slice(0, newlineIndex).trim()
      entry.lineBuffer = entry.lineBuffer.slice(newlineIndex + 1)
      if (line) {
        try {
          const parsed = JSON.parse(line) as HerdrRpcNotification
          if (parsed && typeof parsed.method === 'string') {
            entry.handlers.onNotification(parsed)
          }
        } catch (error) {
          entry.handlers.onError?.(
            error instanceof Error ? error : new Error(`Invalid event JSON: ${String(error)}`)
          )
        }
      }
      newlineIndex = entry.lineBuffer.indexOf('\n')
    }
  }

  private readonly handleSocketError = (error: Error): void => {
    this.teardown(
      new HerdrClientError('SOCKET_ERROR', `herdr-core socket error: ${error.message}`, error)
    )
  }

  private readonly handleSocketEnd = (): void => {
    this.teardown(new HerdrClientError('CLIENT_DISCONNECTED', 'herdr-core socket ended by peer'))
  }

  private readonly handleSocketClose = (): void => {
    this.teardown(new HerdrClientError('CLIENT_DISCONNECTED', 'herdr-core socket closed'))
  }

  private teardown(error?: Error): void {
    if (this.mode === 'closed') return
    this.mode = 'closed'

    this.socket.removeListener('data', this.handleSocketData)
    this.socket.removeListener('error', this.handleSocketError)
    this.socket.removeListener('close', this.handleSocketClose)
    this.socket.removeListener('end', this.handleSocketEnd)

    try {
      ;(this.socket as Socket).destroy?.()
    } catch {
      // Ignore destroy errors.
    }

    const disconnectError =
      error ?? new HerdrClientError('CLIENT_DISCONNECTED', 'herdr-core client disconnected')

    if (this.handshakeWaiter) {
      const waiter = this.handshakeWaiter
      this.handshakeWaiter = null
      clearTimeout(waiter.timer)
      waiter.reject(disconnectError)
    }

    for (const [id, pending] of this.pendingRpc.entries()) {
      clearTimeout(pending.timer)
      this.pendingRpc.delete(id)
      pending.reject(disconnectError)
    }

    const openChannels = [...this.channels.values()]
    this.channels.clear()
    this.earlyFrames.clear()
    this.frameDecoder.reset()
    this.handshakeBuffer = Buffer.alloc(0)
    this.rpcLineBuffer = ''

    for (const entry of openChannels) {
      entry.handlers.onClose?.('core-disconnected')
    }

    for (const listener of [...this.closeListeners]) {
      listener(error)
    }
  }
}
