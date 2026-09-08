import type {
  VoiceProviderEvent,
  VoiceSocket,
  VoiceSocketFactory,
  VoiceStreamConnection,
  VoiceStreamRequest,
} from './contracts'
import { AsyncEventQueue, createAbortError, throwIfAborted, withTimeout } from './async'

export interface VoiceSocketSessionControls {
  emit: (event: VoiceProviderEvent) => void
  ready: () => void
  fail: (error: Error) => void
  end: () => void
  readonly socket: VoiceSocket | null
}

export interface VoiceSocketSessionOptions {
  socketFactory: VoiceSocketFactory
  request: VoiceStreamRequest
  url: string
  headers: Readonly<Record<string, string>>
  onOpen: (socket: VoiceSocket, controls: VoiceSocketSessionControls) => void | Promise<void>
  onMessage: (data: string | Uint8Array, controls: VoiceSocketSessionControls) => void
  onEnd: (socket: VoiceSocket, controls: VoiceSocketSessionControls) => void | Promise<void>
  maxPcmChunkBytes?: number
  encodePcm?: (chunk: Uint8Array) => Uint8Array
}

export class VoiceSocketSession implements VoiceStreamConnection {
  readonly ready: Promise<void>
  readonly events: AsyncIterable<VoiceProviderEvent>

  private readonly queue = new AsyncEventQueue<VoiceProviderEvent>()
  private readonly options: VoiceSocketSessionOptions
  private readonly readyPromise: Promise<void>
  private resolveReady!: () => void
  private rejectReady!: (error: unknown) => void
  private socket: VoiceSocket | null = null
  private terminal = false
  private ending = false
  private aborted = false

  constructor(options: VoiceSocketSessionOptions) {
    this.options = options
    this.events = this.queue
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.ready = this.readyPromise
    void this.connect()
  }

  private controls(): VoiceSocketSessionControls {
    const session = this
    return {
      emit: event => session.queue.push(event),
      ready: () => session.resolveReady(),
      fail: error => session.fail(error),
      end: () => session.finish(),
      get socket() {
        return session.socket
      },
    }
  }

  private async connect(): Promise<void> {
    const signal = this.options.request.signal
    try {
      throwIfAborted(signal)
      const socket = await withTimeout(
        this.options.socketFactory.connect({
          url: this.options.url,
          headers: this.options.headers,
          signal,
        }),
        this.options.request.timeoutMs,
        signal,
        'Voice provider connection timed out.',
      )
      if (this.aborted || this.terminal) {
        socket.close(1000, 'aborted')
        return
      }
      this.socket = socket
      const controls = this.controls()
      socket.onMessage((data) => {
        if (this.terminal || this.aborted)
          return
        try {
          this.options.onMessage(data, controls)
        }
        catch (error) {
          this.fail(error instanceof Error ? error : new Error(String(error)))
        }
      })
      socket.onError(error => this.fail(error))
      socket.onClose((code, reason) => {
        if (this.terminal)
          return
        if (this.ending) {
          this.finish()
          return
        }
        this.fail(
          new Error(
            `Voice provider socket closed${code ? ` (${code})` : ''}${reason ? `: ${reason}` : ''}`,
          ),
        )
      })
      if (socket.readyState === 1) {
        await Promise.resolve(this.options.onOpen(socket, controls))
      }
      else {
        socket.onOpen(() => {
          void Promise.resolve(this.options.onOpen(socket, controls)).catch((error: unknown) => {
            this.fail(error instanceof Error ? error : new Error(String(error)))
          })
        })
      }
    }
    catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  async writePcm(chunk: Uint8Array): Promise<void> {
    throwIfAborted(this.options.request.signal)
    if (this.terminal || this.aborted)
      throw createAbortError('Voice stream is closed.')
    await this.ready
    const socket = this.socket
    if (!socket || this.terminal || this.aborted)
      throw createAbortError('Voice stream is closed.')
    if (chunk.byteLength === 0)
      return
    const maxBytes = this.options.maxPcmChunkBytes ?? 64 * 1024
    if (maxBytes <= 0)
      throw new Error('Voice provider PCM chunk limit is invalid.')
    for (let offset = 0; offset < chunk.byteLength; offset += maxBytes) {
      const part = chunk.slice(offset, Math.min(chunk.byteLength, offset + maxBytes))
      socket.send(this.options.encodePcm ? this.options.encodePcm(part) : part)
    }
  }

  async end(): Promise<void> {
    if (this.aborted || this.terminal)
      return
    await this.ready
    if (this.aborted || this.terminal || this.ending)
      return
    this.ending = true
    const socket = this.socket
    if (!socket) {
      this.finish()
      return
    }
    try {
      await this.options.onEnd(socket, this.controls())
    }
    catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  async abort(reason = 'Voice stream aborted'): Promise<void> {
    if (this.terminal)
      return
    this.aborted = true
    this.ending = true
    const error = createAbortError(reason)
    this.rejectReady(error)
    this.queue.fail(error)
    try {
      this.socket?.close(1000, reason)
    }
    catch {
      // The socket may already be closed.
    }
    this.terminal = true
  }

  private fail(error: Error): void {
    if (this.terminal)
      return
    this.terminal = true
    this.rejectReady(error)
    this.queue.fail(error)
    try {
      this.socket?.close(1011, 'provider-error')
    }
    catch {
      // The socket may already be closed.
    }
  }

  private finish(): void {
    if (this.terminal)
      return
    this.terminal = true
    this.resolveReady()
    this.queue.end()
    try {
      this.socket?.close(1000, 'complete')
    }
    catch {
      // The socket may already be closed.
    }
  }
}
