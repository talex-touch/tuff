import type { McpToolDescriptor } from './mcp-host-protocol'
import type { McpHostServerHandle, McpHostServerOptions } from './mcp-host-server'
import { Agent, request as httpRequest } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_PARSE_ERROR,
  JSON_RPC_SERVER_ERROR
} from './mcp-host-protocol'
import { startMcpHostServer } from './mcp-host-server'

const TOKEN = '7f3a'.repeat(16)
const OTHER_TOKEN = '0b1c'.repeat(16)

const READ_TOOL: McpToolDescriptor = {
  name: 'read_file',
  description: 'Read a file from the user machine',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
}

let handle: McpHostServerHandle | null = null

afterEach(async () => {
  await handle?.close()
  handle = null
})

/** A port nothing else is holding, so the test binds a real socket on a real number. */
async function unusedPort(): Promise<number> {
  const probe = createNetServer()
  const { promise, resolve, reject } = Promise.withResolvers<number>()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address()
    const port = typeof address === 'object' && address ? address.port : 0
    probe.close(() => resolve(port))
  })
  return promise
}

async function startHost(
  overrides: Partial<McpHostServerOptions> = {}
): Promise<McpHostServerHandle> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await startMcpHostServer({
        port: await unusedPort(),
        token: TOKEN,
        serverVersion: '1.0.0',
        listTools: () => [READ_TOOL],
        callTool: async () => ({ output: 'ok', isError: false }),
        ...overrides
      })
    } catch (error) {
      // Another process can take the probed port between the probe and the bind.
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('MCP host never started')
}

interface RpcBody {
  jsonrpc?: string
  id?: unknown
  result?: unknown
  error?: { code?: number; message?: string }
}

interface RpcAnswer {
  status: number
  text: string
  body: RpcBody | null
}

/**
 * A real request over a real socket. The auth check, the body cap and the
 * envelope are all transport behaviour, so stubbing the transport would test
 * nothing that can break here.
 */
async function request(
  handle: McpHostServerHandle,
  options: {
    path?: string
    method?: string
    token?: string | null
    body?: unknown
    /** Sent with no declared length, so the server only learns the size as it arrives. */
    chunkedBody?: ReadableStream
  } = {}
): Promise<RpcAnswer> {
  const payload =
    options.chunkedBody ??
    (options.body === undefined
      ? undefined
      : typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body))
  const response = await globalThis.fetch(
    `${new URL(handle.url).origin}${options.path ?? new URL(handle.url).pathname}`,
    {
      method: options.method ?? 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.token === null ? {} : { authorization: `Bearer ${options.token ?? TOKEN}` })
      },
      body: payload as BodyInit | undefined,
      ...(options.chunkedBody ? { duplex: 'half' } : {})
    }
  )
  const text = await response.text()
  return { status: response.status, text, body: text ? (JSON.parse(text) as RpcBody) : null }
}

/** A well-formed request padded to an exact byte length, for the body-cap boundary. */
function bodyOfSize(bytes: number): string {
  const empty = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: '' } })
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: { pad: 'x'.repeat(bytes - empty.length) }
  })
}

/**
 * Declares more than the ceiling and then sends only a first byte, leaving the
 * body unfinished. `fetch` always derives `content-length` from the body it is
 * given, so an inflated declaration needs raw `node:http`.
 *
 * The request is deliberately never completed: a server that checks the
 * declaration up front answers at once, while one that only counts arriving
 * bytes waits for a body that never comes — which the test timeout reports.
 */
function declaredOversizeAnswer(handle: McpHostServerHandle): Promise<number | null> {
  const target = new URL(handle.url)
  const { promise, resolve } = Promise.withResolvers<number | null>()
  let settled = false
  const issued = httpRequest(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'content-length': String(256 * 1024 + 1)
      }
    },
    (response) => {
      settled = true
      response.resume()
      resolve(response.statusCode ?? 0)
    }
  )
  issued.on('error', () => {
    if (!settled) resolve(null)
  })
  issued.write('{"jsonrpc"')
  return promise
}

/**
 * Sends an oversized body on a connection pinned to a single socket, and
 * reports whether the server hangs that socket up after the refusal.
 *
 * A refused upload leaves bytes the server never read, so a connection kept
 * alive would have them parsed as the client's next request. Only a client
 * pinned to one socket can observe the difference: `fetch` discards a
 * connection whose upload was cut short whether or not the server closes it.
 */
function hangUpAfterRefusal(handle: McpHostServerHandle): Promise<boolean> {
  const target = new URL(handle.url)
  // One socket, kept for reuse: exactly the client that a poisoned connection
  // would bite.
  const agent = new Agent({ keepAlive: true, maxSockets: 1 })
  const { promise, resolve } = Promise.withResolvers<boolean>()

  const issued = httpRequest(
    {
      agent,
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'content-length': String(256 * 1024 + 1)
      }
    },
    (response) => {
      response.resume()
      response.socket.once('close', () => resolve(true))
    }
  )
  issued.on('error', () => resolve(false))
  issued.end(bodyOfSize(256 * 1024 + 1))

  return promise.finally(() => agent.destroy())
}

describe('mcp host server', () => {
  it('answers an authenticated initialize on the loopback endpoint it advertises', async () => {
    handle = await startHost()

    // A client config is pasted from this URL, so the loopback address it names
    // is part of the contract: an off-machine bind would be a silent hole.
    expect(handle.url).toBe(`http://127.0.0.1:${handle.port}/mcp`)

    const { status, body } = await request(handle, {
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' }
      }
    })

    expect(status).toBe(200)
    expect(body).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'tuff' }
      }
    })
  })

  it('serves the tool list and runs a call for an authenticated client', async () => {
    handle = await startHost({
      callTool: async () => ({ output: 'hello from tuff', isError: false })
    })

    const list = await request(handle, { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })
    expect(list.status).toBe(200)
    expect(list.body?.result).toEqual({ tools: [READ_TOOL] })

    const call = await request(handle, {
      body: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'read_file', arguments: {} }
      }
    })
    expect(call.status).toBe(200)
    expect(call.body?.result).toEqual({
      content: [{ type: 'text', text: 'hello from tuff' }],
      isError: false
    })
  })

  it('answers a notification with an empty 202 rather than a JSON body', async () => {
    handle = await startHost()

    const { status, text } = await request(handle, {
      body: { jsonrpc: '2.0', method: 'notifications/initialized' }
    })

    expect(status).toBe(202)
    expect(text).toBe('')
  })

  it('refuses a wrong or absent token without exposing the tool surface', async () => {
    const listTools = vi.fn(() => [READ_TOOL])
    const callTool = vi.fn(async () => ({ output: 'ran', isError: false }))
    handle = await startHost({ listTools, callTool })

    const wrong = await request(handle, {
      token: OTHER_TOKEN,
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    })
    const truncated = await request(handle, {
      token: TOKEN.slice(0, 63),
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' }
    })
    const absent = await request(handle, {
      token: null,
      body: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'read_file', arguments: {} }
      }
    })

    for (const answer of [wrong, truncated, absent]) {
      expect(answer.status).toBe(401)
      expect(answer.body?.error?.code).toBe(JSON_RPC_SERVER_ERROR)
      expect(answer.text).not.toContain(READ_TOOL.name)
      expect(answer.text).not.toContain(TOKEN)
    }
    expect(listTools).not.toHaveBeenCalled()
    expect(callTool).not.toHaveBeenCalled()
  })

  it('serves the endpoint under its own pathname even with query parameters attached', async () => {
    handle = await startHost()

    const { status, body } = await request(handle, {
      path: '/mcp?session=abc',
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    })

    expect(status).toBe(200)
    expect(body).toMatchObject({ jsonrpc: '2.0', id: 1, result: { tools: [READ_TOOL] } })
  })

  it('refuses a neighbouring path and a wrong method without exposing the tool surface', async () => {
    handle = await startHost()

    const trailingSlash = await request(handle, {
      path: '/mcp/',
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    })
    const otherPath = await request(handle, {
      path: '/nope',
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' }
    })
    const wrongMethod = await request(handle, { method: 'GET' })

    expect(trailingSlash.status).toBe(404)
    expect(otherPath.status).toBe(404)
    expect(wrongMethod.status).toBe(405)
    for (const answer of [trailingSlash, otherPath, wrongMethod]) {
      expect(answer.body?.error?.code).toBe(JSON_RPC_SERVER_ERROR)
      expect(answer.text).not.toContain(READ_TOOL.name)
      expect(answer.text).not.toContain(TOKEN)
    }
  })

  it('answers a malformed body with a parse error instead of dropping the connection', async () => {
    handle = await startHost()

    const { status, body } = await request(handle, { body: '{"jsonrpc":' })

    expect(status).toBe(200)
    expect(body).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: JSON_RPC_PARSE_ERROR } })
  })

  it('accepts a body exactly at the 256 KiB ceiling', async () => {
    handle = await startHost()

    const { status, body } = await request(handle, { body: bodyOfSize(256 * 1024) })

    expect(status).toBe(200)
    expect(body?.result).toEqual({ tools: [READ_TOOL] })
  })

  it.each([
    { case: 'a declared content-length', oversize: () => ({ body: bodyOfSize(256 * 1024 + 1) }) },
    {
      case: 'a chunked upload',
      oversize: () => ({
        chunkedBody: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(bodyOfSize(256 * 1024 + 1)))
            controller.close()
          }
        })
      })
    }
  ])('answers $case over the ceiling with a 413 the client can read', async ({ oversize }) => {
    const listTools = vi.fn(() => [READ_TOOL])
    handle = await startHost({ listTools })

    const { status, text, body } = await request(handle, oversize())

    expect(status).toBe(413)
    expect(body).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: JSON_RPC_SERVER_ERROR } })
    expect(text).not.toContain(READ_TOOL.name)
    expect(listTools).not.toHaveBeenCalled()

    // Whichever connection it lands on, the same client's next request must get
    // a clean answer rather than a desynchronised second refusal.
    const followUp = await request(handle, {
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' }
    })
    expect(followUp.status).toBe(200)
    expect(followUp.body).toMatchObject({ result: { tools: [READ_TOOL] } })
  })

  it('refuses an over-declared length before consuming the upload', async () => {
    handle = await startHost()

    // The client never finishes the body, so only an up-front check can answer.
    await expect(declaredOversizeAnswer(handle)).resolves.toBe(413)
  }, 5000)

  it('hangs up a connection whose refused upload was left unread', async () => {
    handle = await startHost()

    // Resolving to false means the socket outlived the refusal; never resolving
    // means it was left open, which is the failure the timeout reports.
    await expect(hangUpAfterRefusal(handle)).resolves.toBe(true)
  }, 5000)

  it('refuses a JSON null request id without consulting the tool layer', async () => {
    const listTools = vi.fn(() => [READ_TOOL])
    const callTool = vi.fn(async () => ({ output: 'ran', isError: false }))
    handle = await startHost({ listTools, callTool })

    const { status, body } = await request(handle, {
      body: {
        jsonrpc: '2.0',
        id: null,
        method: 'tools/call',
        params: { name: 'read_file', arguments: {} }
      }
    })

    // Malformed, not a notification: a silent 202 here would be a lost call.
    expect(status).toBe(200)
    expect(body).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: { code: JSON_RPC_INVALID_REQUEST }
    })
    expect(listTools).not.toHaveBeenCalled()
    expect(callTool).not.toHaveBeenCalled()
  })

  it('stops accepting requests once closed', async () => {
    handle = await startHost()
    const open = await request(handle, { body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })
    expect(open.status).toBe(200)

    await handle.close()
    await expect(
      request(handle, { body: { jsonrpc: '2.0', id: 2, method: 'tools/list' } })
    ).rejects.toThrow()
  })
})
