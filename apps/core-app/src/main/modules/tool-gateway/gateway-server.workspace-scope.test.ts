/**
 * Per-turn bearer scopes on the agent tool gateway.
 *
 * A Home turn gets its own token bound to one conversation. The wire contracts these cases
 * defend, all observable through the real loopback HTTP endpoint:
 *  - the confirmation origin is derived from the presented bearer, never from whatever the
 *    request body claims, and the originless global token keeps its own attribution;
 *  - a remembered read approval belongs to its conversation and never bleeds into another;
 *  - releasing a scope revokes its token (401) and cancels a confirmation it left pending;
 *  - scoping does not widen the gate: execute risk still re-asks, and reset revokes scoped
 *    approvals too.
 *
 * Raw `node:http` rather than fetch: this exercises the wire the `pi` extension actually speaks.
 * The originless global-token path stays covered by `gateway-server.test.ts`, which is untouched.
 */
import type { ClientRequest } from 'node:http'
import type { ConfirmationDecision, ConfirmationRequest, ToolGatewayHandle } from './gateway-server'
import type { ToolDefinition } from './tool-registry'
import { Buffer } from 'node:buffer'
import { request as httpRequest } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startToolGateway } from './gateway-server'

let handle: ToolGatewayHandle | null = null

afterEach(async () => {
  await handle?.close()
  handle = null
})

function echoTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'echo',
    risk: 'read',
    summarize: (args) => `echo ${String(args.value ?? '')}`,
    execute: async (args) => ({ output: String(args.value ?? ''), isError: false }),
    ...overrides
  }
}

interface GatewayJson {
  [key: string]: unknown
  code?: string
  isError?: boolean
  output?: string
}

interface GatewayResponse {
  status: number
  json: GatewayJson
}

function readResponse(
  url: string,
  token: string,
  body: unknown,
  onRequest?: (request: ClientRequest) => void
): Promise<GatewayResponse> {
  const target = new URL(url)
  const payload = JSON.stringify(body)
  const { promise, resolve, reject } = Promise.withResolvers<GatewayResponse>()

  const request = httpRequest(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      }
    },
    (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(chunk as Buffer))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({
          status: response.statusCode ?? 0,
          json: text ? (JSON.parse(text) as GatewayJson) : ({} as GatewayJson)
        })
      })
    }
  )
  request.on('error', reject)
  onRequest?.(request)
  request.end(payload)
  return promise
}

/**
 * Sends an invocation and keeps its response pending, so a test can release the scope while the
 * call is still blocked in confirmation. `abort` reaches the underlying request if a case needs it.
 */
function startInvocation(
  gateway: ToolGatewayHandle,
  token: string,
  body: unknown
): { abort: () => void; response: Promise<GatewayResponse> } {
  const holder: { request?: ClientRequest } = {}
  const response = readResponse(gateway.url, token, body, (request) => {
    holder.request = request
  })
  return { abort: () => holder.request?.destroy(), response }
}

describe('tool gateway per-turn bearer scopes', () => {
  it('derives the confirmation origin from the bearer, never from the request body', async () => {
    const confirm = vi.fn(async (_request: ConfirmationRequest, _signal: AbortSignal) => ({
      approved: true,
      remember: false
    }))
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool()]]),
      confirm
    })

    const scope = handle.scope({ conversationId: 'conv-a', turnId: 'turn-1' })
    const scoped = await readResponse(handle.url, scope.token, {
      tool: 'echo',
      callId: 'pi.call-1:scoped',
      args: { value: 'hi' },
      // A forged attribution must be ignored: the body cannot name its own origin.
      origin: { conversationId: 'conv-forged', turnId: 'turn-forged' },
      conversationId: 'conv-forged',
      metadata: { origin: { conversationId: 'conv-forged' } }
    })

    expect(scoped.status).toBe(200)
    expect(scoped.json).toEqual({ output: 'hi', isError: false })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0]![0]).toMatchObject({
      callId: 'pi.call-1:scoped',
      origin: { conversationId: 'conv-a', turnId: 'turn-1', toolCallId: 'pi.call-1:scoped' }
    })
    expect(JSON.stringify(confirm.mock.calls[0]![0])).not.toContain('conv-forged')

    // The originless global token stays originless — it names no conversation, forged or real.
    const global = await readResponse(handle.url, handle.token, {
      tool: 'echo',
      callId: 'pi.call-2',
      args: { value: 'global' }
    })
    expect(global.status).toBe(200)
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(confirm.mock.calls[1]![0].origin).toBeUndefined()
  })

  it('does not bleed a remembered approval across conversations', async () => {
    const confirm = vi.fn(async (_request: ConfirmationRequest, _signal: AbortSignal) => ({
      approved: true,
      remember: true
    }))
    handle = await startToolGateway({ tools: new Map([['echo', echoTool()]]), confirm })

    const a = handle.scope({ conversationId: 'conv-a' })
    const b = handle.scope({ conversationId: 'conv-b' })

    await readResponse(handle.url, a.token, { tool: 'echo', args: { value: '1' } })
    await readResponse(handle.url, a.token, { tool: 'echo', args: { value: '2' } })
    // The second call in the same conversation is remembered: one prompt.
    expect(confirm).toHaveBeenCalledTimes(1)

    // A different conversation has its own approvals and must still ask.
    await readResponse(handle.url, b.token, { tool: 'echo', args: { value: '3' } })
    expect(confirm).toHaveBeenCalledTimes(2)

    // The originless global path keeps a set of its own, separate from both conversations.
    await readResponse(handle.url, handle.token, { tool: 'echo', args: { value: '4' } })
    expect(confirm).toHaveBeenCalledTimes(3)

    // Prompting another conversation did not disturb conv-a's standing approval.
    await readResponse(handle.url, a.token, { tool: 'echo', args: { value: '5' } })
    expect(confirm).toHaveBeenCalledTimes(3)
  })

  it('released scope token 401s and cancels its pending confirmation', async () => {
    const execute = vi.fn(async () => ({ output: 'must-not-run', isError: false }))
    let receivedSignal!: AbortSignal
    let resolveConfirmation!: (decision: ConfirmationDecision) => void
    const confirm = vi.fn((_request: ConfirmationRequest, signal: AbortSignal) => {
      receivedSignal = signal
      const pending = Promise.withResolvers<ConfirmationDecision>()
      resolveConfirmation = pending.resolve
      return pending.promise
    })
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool({ execute })]]),
      confirm
    })

    const scope = handle.scope({ conversationId: 'conv-release' })
    const pending = startInvocation(handle, scope.token, { tool: 'echo', args: { value: 'held' } })
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))

    scope.release()

    // Revocation aborts the confirmation the turn was still waiting on.
    expect(receivedSignal.aborted).toBe(true)
    const settled = await pending.response
    expect(settled.status).toBe(200)
    expect(settled.json).toMatchObject({ isError: true, code: 'TOOL_EXECUTION_ABORTED' })
    expect(execute).not.toHaveBeenCalled()

    // The released token is no longer a bearer.
    const revoked = await readResponse(handle.url, scope.token, {
      tool: 'echo',
      args: { value: 'after' }
    })
    expect(revoked.status).toBe(401)

    resolveConfirmation({ approved: true, remember: false })
  })

  it('keeps the remember rule and revoke semantics inside a scope', async () => {
    const confirm = vi.fn(async (_request: ConfirmationRequest, _signal: AbortSignal) => ({
      approved: true,
      remember: true
    }))
    handle = await startToolGateway({
      tools: new Map<string, ToolDefinition>([
        ['echo', echoTool()],
        ['danger', echoTool({ name: 'danger', risk: 'execute' })]
      ]),
      confirm
    })

    const scope = handle.scope({ conversationId: 'conv-gate' })

    // Read risk is remembered for this conversation.
    await readResponse(handle.url, scope.token, { tool: 'echo', args: { value: '1' } })
    await readResponse(handle.url, scope.token, { tool: 'echo', args: { value: '2' } })
    expect(confirm).toHaveBeenCalledTimes(1)

    // Execute risk re-asks however the user ticked — a scope is not a standing grant.
    await readResponse(handle.url, scope.token, { tool: 'danger', args: {} })
    await readResponse(handle.url, scope.token, { tool: 'danger', args: {} })
    expect(confirm).toHaveBeenCalledTimes(3)

    // Revoking clears the scoped conversation's remembered reads too.
    handle.resetSessionApprovals()
    await readResponse(handle.url, scope.token, { tool: 'echo', args: { value: '3' } })
    expect(confirm).toHaveBeenCalledTimes(4)
  })
})
