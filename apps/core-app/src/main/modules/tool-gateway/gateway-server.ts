import type { IncomingMessage, Server } from 'node:http'
import type { ToolDefinition, ToolResult } from './tool-registry'
import { Buffer } from 'node:buffer'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { isRememberable } from './tool-registry'

/** Bodies larger than this are refused outright rather than buffered. */
const MAX_BODY_BYTES = 256 * 1024

export interface ConfirmationRequest {
  callId: string
  tool: string
  risk: ToolDefinition['risk']
  summary: string
  input: string
}

export interface ConfirmationDecision {
  approved: boolean
  remember: boolean
}

export interface ToolGatewayOptions {
  tools: Map<string, ToolDefinition>
  /** Asks the user; resolving `approved: false` denies the call. */
  confirm: (request: ConfirmationRequest) => Promise<ConfirmationDecision>
  /** Rejected calls answer the model rather than throwing, so the loop continues. */
  onLog?: (message: string) => void
}

export interface ToolGatewayHandle {
  url: string
  token: string
  /** Clears remembered approvals — call when a new conversation starts. */
  resetSessionApprovals: () => void
  close: () => Promise<void>
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  // `timingSafeEqual` throws on length mismatch, which is itself a leak-free
  // signal — the lengths are fixed for our own tokens.
  return left.length === right.length && timingSafeEqual(left, right)
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * A loopback HTTP endpoint the `pi` extension calls to run Tuff-owned tools.
 *
 * Tools execute in *this* process, never in the agent's: the extension is a
 * thin forwarder, so every call passes through the confirmation gate below and
 * the agent never holds the capability itself. The listener binds 127.0.0.1
 * and a per-session bearer token, so nothing off-machine — and no other local
 * process without the token — can drive it.
 */
export async function startToolGateway(options: ToolGatewayOptions): Promise<ToolGatewayHandle> {
  const token = randomBytes(32).toString('hex')
  /** Tools the user chose to stop being asked about, for this session only. */
  const remembered = new Set<string>()

  const server: Server = createServer((request, response) => {
    void (async () => {
      const reply = (status: number, body: unknown): void => {
        const payload = JSON.stringify(body)
        response.writeHead(status, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload)
        })
        response.end(payload)
      }

      try {
        if (request.method !== 'POST' || request.url !== '/invoke') {
          reply(404, { error: 'Not found' })
          return
        }

        const authorization = request.headers.authorization ?? ''
        const presented = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
        if (!constantTimeEquals(presented, token)) {
          reply(401, { error: 'Unauthorized' })
          return
        }

        const body = JSON.parse(await readBody(request)) as {
          tool?: string
          callId?: string
          args?: Record<string, unknown>
        }

        const tool = body.tool ? options.tools.get(body.tool) : undefined
        if (!tool) {
          // Answering rather than 4xx-ing keeps a hallucinated tool name inside
          // the model's own error-recovery loop.
          reply(200, { output: `Unknown tool: ${body.tool ?? '(none)'}`, isError: true })
          return
        }

        const args = body.args && typeof body.args === 'object' ? body.args : {}
        const summary = tool.summarize(args)

        if (!remembered.has(tool.name)) {
          const decision = await options.confirm({
            callId: body.callId ?? '',
            tool: tool.name,
            risk: tool.risk,
            summary,
            input: JSON.stringify(args, null, 2)
          })

          if (!decision.approved) {
            options.onLog?.(`Tool ${tool.name} denied by user`)
            reply(200, { output: `User denied ${tool.name}.`, isError: true })
            return
          }
          // Write/execute tools re-ask every time no matter what the user
          // ticked — a single yes must not become a standing grant.
          if (decision.remember && isRememberable(tool.risk)) remembered.add(tool.name)
        }

        const result: ToolResult = await tool.execute(args)
        reply(200, result)
      } catch (error) {
        options.onLog?.(`Tool gateway error: ${(error as Error).message}`)
        reply(200, { output: `Tool failed: ${(error as Error).message}`, isError: true })
      }
    })()
  })

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolveListen()
    })
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  return {
    url: `http://127.0.0.1:${port}/invoke`,
    token,
    resetSessionApprovals: () => remembered.clear(),
    close: () =>
      new Promise<void>((resolveClose) => {
        server.close(() => resolveClose())
      })
  }
}
