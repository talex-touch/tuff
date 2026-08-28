import type { IncomingMessage, Server } from 'node:http'
import type { StableToolErrorCode, StableToolErrorProjection } from '../ai/tool-error-projection'
import type { ToolCallPlan, ToolDefinition, ToolResult, ToolRisk } from './tool-registry'
import { Buffer } from 'node:buffer'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { projectToolError, projectToolErrorCode } from '../ai/tool-error-projection'
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

type AgentToolAuditBase = {
  schema: 'agent-tool-audit/v1'
  callId: string
  toolId: string
  risk: ToolRisk | 'unknown'
}

export type AgentToolAuditEvent =
  | (AgentToolAuditBase & { phase: 'call' })
  | (AgentToolAuditBase & {
      phase: 'decision'
      decision: 'approved' | 'denied' | 'remembered' | 'failed' | 'not-required'
    })
  | (AgentToolAuditBase & {
      phase: 'result'
      status: 'success' | 'error'
      durationMs: number
      code: StableToolErrorCode | 'TOOL_OK'
    })

export interface ToolGatewayOptions {
  tools: Map<string, ToolDefinition>
  /** Asks the user; resolving `approved: false` denies the call. */
  confirm: (request: ConfirmationRequest, signal: AbortSignal) => Promise<ConfirmationDecision>
  /** Fixed diagnostics only; raw args, summaries and native errors are forbidden. */
  onLog?: (message: string) => void
  /** Receives only the versioned, strict audit projection. Sink failures are ignored. */
  onAudit?: (event: AgentToolAuditEvent) => void
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

export const PI_TOOL_CALL_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/

const MAX_AUDIT_DURATION_MS = 24 * 60 * 60 * 1000

function normalizeCallId(value: unknown): string {
  return typeof value === 'string' && PI_TOOL_CALL_ID_PATTERN.test(value) ? value : randomUUID()
}

function normalizeStaticToolId(value: unknown): string {
  return typeof value === 'string' && PI_TOOL_CALL_ID_PATTERN.test(value) ? value : 'unknown'
}

function boundDurationMs(startedAt: number): number {
  const duration = Date.now() - startedAt
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(Math.floor(duration), MAX_AUDIT_DURATION_MS)
}

function safeLog(options: ToolGatewayOptions, message: string): void {
  try {
    options.onLog?.(message)
  } catch {
    // Diagnostics are fail-soft and never change the tool result.
  }
}

function emitAudit(options: ToolGatewayOptions, event: AgentToolAuditEvent): void {
  try {
    options.onAudit?.(event)
  } catch {
    safeLog(options, 'Agent tool audit sink failed')
  }
}

function projectedFailure(projection: StableToolErrorProjection): ToolResult {
  return { output: projection.message, isError: true, code: projection.code }
}

const CALL_ABORTED = Symbol('agent-tool-call-aborted')

function waitForActiveCall<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T | typeof CALL_ABORTED> {
  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = (): void => signal.removeEventListener('abort', onAbort)
    const settle = (result: T | typeof CALL_ABORTED): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onAbort = (): void => settle(CALL_ABORTED)

    signal.addEventListener('abort', onAbort, { once: true })
    void operation.then(settle, fail)
    // Adding a listener to an already-aborted signal does not dispatch it.
    if (signal.aborted) onAbort()
  })
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
  const activeCalls = new Set<AbortController>()
  let closing = false
  let closePromise: Promise<void> | null = null

  const server: Server = createServer((request, response) => {
    const clientAbortController = new AbortController()
    activeCalls.add(clientAbortController)
    const abortClientCall = (): void => clientAbortController.abort()
    const abortOnPrematureResponseClose = (): void => {
      if (!response.writableEnded) abortClientCall()
    }

    request.once('aborted', abortClientCall)
    response.once('close', abortOnPrematureResponseClose)
    if (closing) abortClientCall()

    void (async () => {
      const reply = (status: number, body: unknown): void => {
        if (response.destroyed || response.writableEnded) return
        const payload = JSON.stringify(body)
        response.writeHead(status, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          ...(closing ? { connection: 'close' } : {})
        })
        response.end(payload)
      }

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

      const startedAt = Date.now()
      let callId: string = randomUUID()
      const auditCorrelationId = randomUUID()
      let toolId = 'unknown'
      let risk: ToolRisk | 'unknown' = 'unknown'
      let callAudited = false
      let decisionAudited = false

      const auditCall = (): void => {
        if (callAudited) return
        callAudited = true
        emitAudit(options, {
          schema: 'agent-tool-audit/v1',
          phase: 'call',
          callId: auditCorrelationId,
          toolId,
          risk
        })
      }

      const auditDecision = (
        decision: Extract<AgentToolAuditEvent, { phase: 'decision' }>['decision']
      ): void => {
        if (decisionAudited) return
        auditCall()
        decisionAudited = true
        emitAudit(options, {
          schema: 'agent-tool-audit/v1',
          phase: 'decision',
          callId: auditCorrelationId,
          toolId,
          risk,
          decision
        })
      }

      const finish = (result: ToolResult): void => {
        auditCall()
        if (!decisionAudited) auditDecision('failed')
        const safeResult = result.isError
          ? projectedFailure(projectToolErrorCode(result.code))
          : { output: result.output, isError: false }
        emitAudit(options, {
          schema: 'agent-tool-audit/v1',
          phase: 'result',
          callId: auditCorrelationId,
          toolId,
          risk,
          status: safeResult.isError ? 'error' : 'success',
          durationMs: boundDurationMs(startedAt),
          code: safeResult.isError ? (safeResult.code ?? 'TOOL_EXECUTION_FAILED') : 'TOOL_OK'
        })
        reply(200, safeResult)
      }

      const finishCancelled = (): void => {
        auditDecision('failed')
        finish(projectedFailure(projectToolErrorCode('TOOL_EXECUTION_ABORTED')))
      }

      let body: { tool?: unknown; callId?: unknown; args?: unknown }
      try {
        const bodyText = await waitForActiveCall(readBody(request), clientAbortController.signal)
        if (bodyText === CALL_ABORTED || closing) {
          finishCancelled()
          return
        }
        const parsedBody: unknown = JSON.parse(bodyText)
        if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody))
          throw new Error()
        body = parsedBody as typeof body
      } catch {
        auditDecision('failed')
        finish(projectedFailure(projectToolErrorCode('TOOL_INPUT_INVALID')))
        return
      }

      callId = normalizeCallId(body.callId)
      const requestedTool = typeof body.tool === 'string' ? body.tool : ''
      const tool = requestedTool ? options.tools.get(requestedTool) : undefined
      if (!tool) {
        auditDecision('not-required')
        finish(projectedFailure(projectToolErrorCode('TOOL_NOT_FOUND')))
        return
      }

      toolId = normalizeStaticToolId(tool.name)
      const args =
        body.args && typeof body.args === 'object' && !Array.isArray(body.args)
          ? (body.args as Record<string, unknown>)
          : {}

      if (clientAbortController.signal.aborted || closing) {
        finishCancelled()
        return
      }

      let plan: ToolCallPlan
      try {
        // A forwarding tool decides its own risk per call; the rest are what
        // they declare, remembered under their own name.
        if (tool.classify) {
          const classification = await waitForActiveCall(
            tool.classify(args),
            clientAbortController.signal
          )
          if (classification === CALL_ABORTED || closing) {
            finishCancelled()
            return
          }
          plan = classification
        } else {
          plan = { risk: tool.risk, summary: tool.summarize(args), rememberKey: tool.name }
        }
      } catch (error) {
        risk = tool.risk
        auditDecision('failed')
        finish(projectedFailure(projectToolError(error)))
        return
      }

      risk = plan.risk
      if (clientAbortController.signal.aborted || closing) {
        finishCancelled()
        return
      }
      auditCall()
      if (remembered.has(plan.rememberKey)) {
        auditDecision('remembered')
      } else {
        let decision: ConfirmationDecision | typeof CALL_ABORTED
        try {
          decision = await waitForActiveCall(
            options.confirm(
              {
                callId,
                tool: tool.name,
                risk: plan.risk,
                summary: plan.summary,
                input: JSON.stringify(args, null, 2)
              },
              clientAbortController.signal
            ),
            clientAbortController.signal
          )
        } catch (error) {
          auditDecision('failed')
          finish(projectedFailure(projectToolError(error)))
          return
        }

        if (decision === CALL_ABORTED || clientAbortController.signal.aborted || closing) {
          finishCancelled()
          return
        }

        auditDecision(decision.approved ? 'approved' : 'denied')
        if (clientAbortController.signal.aborted || closing) {
          finishCancelled()
          return
        }
        if (!decision.approved) {
          finish(projectedFailure(projectToolErrorCode('TOOL_APPROVAL_DENIED')))
          return
        }
        // Write/execute tools re-ask every time no matter what the user
        // ticked — a single yes must not become a standing grant.
        if (decision.remember && isRememberable(plan.risk)) remembered.add(plan.rememberKey)
      }

      if (clientAbortController.signal.aborted || closing) {
        finishCancelled()
        return
      }

      try {
        finish(await tool.execute(args))
      } catch (error) {
        finish(projectedFailure(projectToolError(error)))
      }
    })().finally(() => {
      activeCalls.delete(clientAbortController)
      request.removeListener('aborted', abortClientCall)
      response.removeListener('close', abortOnPrematureResponseClose)
    })
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
    close: () => {
      if (closePromise) return closePromise

      closing = true
      let resolveClose!: () => void
      closePromise = new Promise<void>((resolve) => {
        resolveClose = resolve
      })
      for (const controller of activeCalls) controller.abort()
      server.close(resolveClose)
      return closePromise
    }
  }
}
