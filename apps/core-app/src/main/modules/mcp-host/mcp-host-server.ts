/**
 * The listener half of Tuff's local MCP server: one loopback endpoint speaking
 * Streamable HTTP, answered with plain JSON.
 *
 * It is deliberately the opposite end of the same pipe the `pi` extension uses.
 * There, a *local agent process* holds a token and calls into Tuff; here, an
 * *external* agent does, over the MCP wire format. Both land in the same
 * confirmation gate, which is why this file holds no policy of its own: it
 * authenticates, demultiplexes JSON-RPC, and hands every call to a callback the
 * module owns.
 */

import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { JsonRpcResponse, McpCallOutcome, McpToolDescriptor } from './mcp-host-protocol'
import { createServer } from 'node:http'
import { dispatchMcpRequest, parseJsonRpcRequest, JSON_RPC_SERVER_ERROR } from './mcp-host-protocol'
import { constantTimeEquals } from '../tool-gateway/gateway-server'

/** Same ceiling the gateway uses: a body bigger than this is refused, not buffered. */
const MAX_BODY_BYTES = 256 * 1024

/**
 * Loopback only. An MCP client on this machine can reach it; nothing off the
 * machine can, however the port is guessed.
 */
export const MCP_HOST_BIND_ADDRESS = '127.0.0.1'

export interface McpHostServerOptions {
  port: number
  token: string
  serverVersion: string
  /** Read per request, so a tool switched off stops being listed immediately. */
  listTools: () => McpToolDescriptor[]
  callTool: (
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal
  ) => Promise<McpCallOutcome>
  instructions?: string
  onLog?: (message: string) => void
}

export interface McpHostServerHandle {
  /** The address a client is configured with. */
  url: string
  port: number
  close: () => Promise<void>
}

/**
 * Reads a request body, refusing anything over the ceiling.
 *
 * The refusal has to be *answerable*: destroying the socket first would race
 * the 413 out of existence and leave the client with a bare connection reset,
 * which reads as a transport failure rather than a refusal. So the declared
 * length is checked before a byte is consumed, and a stream that overruns its
 * own declaration stops being read without killing the reply.
 */
function readBody(request: IncomingMessage): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>()

  const declared = Number(request.headers['content-length'])
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    reject(new Error('Body too large'))
    return promise
  }

  const chunks: Buffer[] = []
  let size = 0
  let settled = false
  request.on('data', (chunk: Buffer) => {
    if (settled) return
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      settled = true
      reject(new Error('Body too large'))
      return
    }
    chunks.push(chunk)
  })
  request.on('end', () => {
    if (settled) return
    settled = true
    resolve(Buffer.concat(chunks).toString('utf8'))
  })
  request.on('error', (error) => {
    if (settled) return
    settled = true
    reject(error)
  })
  return promise
}

export function startMcpHostServer(options: McpHostServerOptions): Promise<McpHostServerHandle> {
  const log = options.onLog ?? ((): void => {})

  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const reply = (status: number, body?: JsonRpcResponse): void => {
      if (response.destroyed || response.writableEnded) return
      if (body === undefined) {
        response.writeHead(status, { 'content-length': 0 })
        response.end()
        return
      }
      const payload = JSON.stringify(body)
      response.writeHead(status, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      })
      response.end(payload)
    }

    // The pathname only: a client may append query parameters to the endpoint
    // it was configured with, and `/mcp?x=1` is still this endpoint.
    const pathname = (request.url ?? '').split('?')[0]
    if (pathname !== '/mcp') {
      reply(404, {
        jsonrpc: '2.0',
        id: null,
        error: { code: JSON_RPC_SERVER_ERROR, message: 'Not found' }
      })
      return
    }

    if (request.method !== 'POST') {
      reply(405, {
        jsonrpc: '2.0',
        id: null,
        error: { code: JSON_RPC_SERVER_ERROR, message: 'Method not allowed' }
      })
      return
    }

    const authorization = request.headers.authorization ?? ''
    const presented = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    if (!constantTimeEquals(presented, options.token)) {
      // No body detail: an unauthorised caller learns only that it failed.
      reply(401, {
        jsonrpc: '2.0',
        id: null,
        error: { code: JSON_RPC_SERVER_ERROR, message: 'Unauthorized' }
      })
      return
    }

    const controller = new AbortController()
    const abort = (): void => controller.abort()
    request.once('aborted', abort)
    response.once('close', () => {
      if (!response.writableEnded) abort()
    })

    void (async () => {
      let raw: string
      try {
        raw = await readBody(request)
      } catch {
        reply(413, {
          jsonrpc: '2.0',
          id: null,
          error: { code: JSON_RPC_SERVER_ERROR, message: 'Request body too large' }
        })
        // The rest of the oversized body is never read, so this connection
        // cannot be reused; say so instead of letting the client guess.
        response.once('finish', () => request.destroy())
        return
      }

      const parsed = parseJsonRpcRequest(raw)
      if ('failure' in parsed) {
        reply(200, parsed.failure)
        return
      }

      try {
        const result = await dispatchMcpRequest(
          parsed.request,
          {
            serverVersion: options.serverVersion,
            listTools: options.listTools,
            callTool: options.callTool,
            instructions: options.instructions
          },
          controller.signal
        )

        // A notification is answered with silence; the status still has to say
        // the message was taken, or a client will retry it.
        if (result === null) {
          reply(202)
          return
        }
        reply(200, result)
      } catch {
        log('MCP host request failed')
        reply(200, {
          jsonrpc: '2.0',
          id: parsed.request.id ?? null,
          error: { code: -32603, message: 'Internal error' }
        })
      }
    })()
  })

  const { promise, resolve, reject } = Promise.withResolvers<McpHostServerHandle>()
  const onError = (error: Error): void => {
    reject(error)
  }
  server.once('error', onError)
  server.listen(options.port, MCP_HOST_BIND_ADDRESS, () => {
    server.removeListener('error', onError)
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : options.port
    log(`MCP host listening on ${MCP_HOST_BIND_ADDRESS}:${port}`)
    resolve({
      url: `http://${MCP_HOST_BIND_ADDRESS}:${port}/mcp`,
      port,
      close: () => {
        const closed = Promise.withResolvers<void>()
        server.close(() => closed.resolve())
        server.closeAllConnections()
        return closed.promise
      }
    })
  })
  return promise
}
