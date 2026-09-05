import type { RawData } from 'ws'
import type { VoiceSocket, VoiceSocketFactory } from './contracts'
import { Buffer } from 'node:buffer'
import WebSocket from 'ws'
import { VoiceProviderError } from './contracts'

class NodeVoiceSocket implements VoiceSocket {
  constructor(private readonly socket: WebSocket) {}

  get readyState(): number {
    return this.socket.readyState
  }

  send(data: string | Uint8Array): void {
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new VoiceProviderError('VOICE_SOCKET_NOT_OPEN', 'Voice provider socket is not open.')
    }
    this.socket.send(data)
  }

  close(code?: number, reason?: string): void {
    if (this.socket.readyState === WebSocket.CLOSED)
      return
    this.socket.close(code, reason)
  }

  onOpen(handler: () => void): void {
    this.socket.once('open', handler)
  }

  onMessage(handler: (data: string | Uint8Array) => void): void {
    this.socket.on('message', (data, isBinary) => {
      if (!isBinary && typeof data === 'string') {
        handler(data)
        return
      }
      handler(toUint8Array(data))
    })
  }

  onError(handler: (error: Error) => void): void {
    this.socket.once('error', handler)
  }

  onClose(handler: (code?: number, reason?: string) => void): void {
    this.socket.once('close', (code, reason) => handler(code, reason.toString('utf8')))
  }
}

function toUint8Array(data: RawData): Uint8Array {
  if (Buffer.isBuffer(data))
    return data
  if (data instanceof ArrayBuffer)
    return new Uint8Array(data)
  if (Array.isArray(data))
    return Buffer.concat(data)
  return Buffer.from(data as Uint8Array)
}

export function createNodeVoiceSocketFactory(): VoiceSocketFactory {
  return {
    async connect(request) {
      if (request.signal?.aborted) {
        throw new VoiceProviderError('VOICE_OPERATION_CANCELLED', 'Voice provider connection was cancelled.')
      }
      let socket: WebSocket
      try {
        socket = new WebSocket(request.url, { headers: request.headers })
      }
      catch (error) {
        throw new VoiceProviderError('VOICE_SOCKET_CONNECT_FAILED', 'Voice provider socket could not be created.', {
          retryable: true,
          cause: error,
        })
      }
      const wrapped = new NodeVoiceSocket(socket)
      const onAbort = (): void => wrapped.close(1000, 'aborted')
      request.signal?.addEventListener('abort', onAbort, { once: true })
      socket.once('close', () => request.signal?.removeEventListener('abort', onAbort))
      return wrapped
    },
  }
}
