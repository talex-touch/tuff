import type { AgentContextSource } from './agent-context-source'
import type {
  AgentToolAuditEvent,
  ConfirmationDecision,
  ConfirmationRequest,
  ToolGatewayHandle
} from './gateway-server'
import type { PluginFeatureSource } from './plugin-feature-source'
import type { ToolCallPlan, ToolDefinition } from './tool-registry'
import { Buffer } from 'node:buffer'
import { request as httpRequest } from 'node:http'
import { CHART_RESULT_PREFIX } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startToolGateway } from './gateway-server'
import { createToolRegistry, parseChartSpec, resolveUserPath } from './tool-registry'

let handle: ToolGatewayHandle | null = null

/** The skill and MCP tools have their own suite; here they just need to exist. */
const emptyAgentContext: AgentContextSource = {
  readSkill: async () => '',
  listMcpServers: async () => [],
  listMcpTools: async () => [],
  callMcpTool: async () => ''
}

/** Likewise the plugin feature tools — see `tool-registry.features.test.ts`. */
const emptyPluginFeatures: PluginFeatureSource = {
  listFeatures: () => [],
  findFeature: () => null,
  invokeFeature: async () => ({ handled: true })
}

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

/**
 * Raw `node:http` rather than fetch: this exercises the wire contract the pi
 * extension actually speaks, and the app bans direct fetch in favour of its
 * network SDK — which has no business proxying a loopback test.
 */
function call(
  url: string,
  options: { method?: string; token?: string; body?: unknown } = {}
): Promise<{ status: number; text: string }> {
  const target = new URL(url)
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body)

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: options.method ?? 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk as Buffer))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') })
        )
      }
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * The gateway's JSON body as a test reads it.
 *
 * `JSON.parse` returns `any`, and the assertions reach fields the helper cannot know about, so this
 * keeps indexing ergonomic without spreading `any` — an unknown key is `unknown`, which still has
 * to be narrowed before it is used as anything.
 */
interface GatewayJson {
  [key: string]: unknown
  code?: string
  isError?: boolean
  output?: string
}

async function invoke(
  gateway: ToolGatewayHandle,
  body: unknown,
  token = gateway.token
): Promise<{ status: number; json: GatewayJson }> {
  const response = await call(gateway.url, { token, body })
  return {
    status: response.status,
    json: response.text ? JSON.parse(response.text) : null
  }
}

function startInvocation(
  gateway: ToolGatewayHandle,
  body: unknown
): {
  abort: () => void
  closed: Promise<void>
} {
  const target = new URL(gateway.url)
  const payload = JSON.stringify(body)
  let closeRequest: (() => void) | null = null
  const closed = new Promise<void>((resolve) => {
    closeRequest = resolve
  })
  const request = httpRequest(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: 'POST',
      headers: {
        authorization: `Bearer ${gateway.token}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      }
    },
    (response) => response.resume()
  )
  request.on('error', () => {})
  request.once('close', () => closeRequest?.())
  request.end(payload)
  return { abort: () => request.destroy(), closed }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('tool gateway', () => {
  it('runs an approved tool and echoes its result', async () => {
    const audits: AgentToolAuditEvent[] = []
    const confirm = vi.fn(async (_request: ConfirmationRequest, _signal: AbortSignal) => ({
      approved: true,
      remember: false
    }))
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool()]]),
      confirm,
      onAudit: (event) => audits.push(event)
    })

    const { status, json } = await invoke(handle, {
      tool: 'echo',
      callId: 'pi.call-1:stable',
      args: { value: 'hi' }
    })
    expect(status).toBe(200)
    expect(json).toEqual({ output: 'hi', isError: false })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'pi.call-1:stable', tool: 'echo', risk: 'read' }),
      expect.any(AbortSignal)
    )
    const confirmationSignal = confirm.mock.calls[0]![1]
    expect(confirmationSignal.aborted).toBe(false)
    expect(audits.map((event) => event.phase)).toEqual(['call', 'decision', 'result'])
    expect(audits.every((event) => event.callId === audits[0]!.callId)).toBe(true)
    expect(audits[0]!.callId).not.toBe('pi.call-1:stable')

    await handle.close()
    expect(confirmationSignal.aborted).toBe(false)
  })

  it('rejects a wrong or missing token before doing anything', async () => {
    const execute = vi.fn(async () => ({ output: 'ran', isError: false }))
    const confirm = vi.fn(async () => ({ approved: true, remember: false }))
    handle = await startToolGateway({ tools: new Map([['echo', echoTool({ execute })]]), confirm })

    const bad = await invoke(handle, { tool: 'echo', args: {} }, 'not-the-token')
    const missing = await invoke(handle, { tool: 'echo', args: {} }, '')
    expect(bad.status).toBe(401)
    expect(missing.status).toBe(401)
    expect(execute).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })

  it.each([null, [], 'not-an-object'])('rejects non-object JSON bodies safely', async (body) => {
    const audits: AgentToolAuditEvent[] = []
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool()]]),
      confirm: async () => ({ approved: true, remember: false }),
      onAudit: (event) => audits.push(event)
    })

    const response = await invoke(handle, body)

    expect(response).toMatchObject({
      status: 200,
      json: { isError: true, code: 'TOOL_INPUT_INVALID' }
    })
    expect(audits.map((event) => event.phase)).toEqual(['call', 'decision', 'result'])
  })

  it('answers a denial to the model instead of failing the request', async () => {
    const execute = vi.fn(async () => ({ output: 'ran', isError: false }))
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool({ execute })]]),
      confirm: async () => ({ approved: false, remember: false })
    })

    const { status, json } = await invoke(handle, { tool: 'echo', args: {} })
    expect(status).toBe(200)
    expect(json.isError).toBe(true)
    expect(json.output).toContain('denied')
    expect(execute).not.toHaveBeenCalled()
  })

  it('aborts a pending confirmation when the loopback client disconnects', async () => {
    const execute = vi.fn(async () => ({ output: 'must-not-run', isError: false }))
    const audits: AgentToolAuditEvent[] = []
    let receivedSignal!: AbortSignal
    let resolveConfirmation!: () => void
    let resolveAbort!: () => void
    const aborted = new Promise<void>((resolve) => {
      resolveAbort = resolve
    })
    const confirm = vi.fn(
      (_request: ConfirmationRequest, signal: AbortSignal) =>
        new Promise<ConfirmationDecision>((resolve) => {
          receivedSignal = signal
          signal.addEventListener('abort', resolveAbort, { once: true })
          resolveConfirmation = () => resolve({ approved: true, remember: false })
        })
    )
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool({ execute })]]),
      confirm,
      onAudit: (event) => audits.push(event)
    })

    const invocation = startInvocation(handle, { tool: 'echo', args: { value: 'cancelled' } })
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    invocation.abort()
    await aborted

    expect(receivedSignal.aborted).toBe(true)
    resolveConfirmation()
    await invocation.closed
    await Promise.resolve()
    await Promise.resolve()
    expect(execute).not.toHaveBeenCalled()
    expect(audits.map((event) => event.phase)).toEqual(['call', 'decision', 'result'])
    expect(audits[1]).toMatchObject({ decision: 'failed' })
    expect(audits[2]).toMatchObject({ status: 'error', code: 'TOOL_EXECUTION_ABORTED' })
  })

  it('closes promptly without confirming or executing a call blocked in classification', async () => {
    const classifyStarted = deferred<void>()
    const classification = deferred<ToolCallPlan>()
    const confirm = vi.fn(async () => ({ approved: true, remember: false }))
    const execute = vi.fn(async () => ({ output: 'must-not-run', isError: false }))
    handle = await startToolGateway({
      tools: new Map([
        [
          'echo',
          echoTool({
            classify: async () => {
              classifyStarted.resolve()
              return classification.promise
            },
            execute
          })
        ]
      ]),
      confirm
    })

    const invocation = invoke(handle, { tool: 'echo', args: { value: 'shutdown' } })
    await classifyStarted.promise

    let closeDeadline: ReturnType<typeof setTimeout> | undefined
    const closePromise = handle.close()
    const closeOutcome = await Promise.race([
      closePromise.then(() => 'closed' as const),
      new Promise<'blocked'>((resolve) => {
        closeDeadline = setTimeout(() => resolve('blocked'), 500)
      })
    ])
    if (closeDeadline) clearTimeout(closeDeadline)

    classification.resolve({ risk: 'read', summary: 'late', rememberKey: 'echo' })
    await closePromise
    const response = await invocation
    await Promise.resolve()

    expect(closeOutcome).toBe('closed')
    expect(response).toMatchObject({
      status: 200,
      json: { isError: true, code: 'TOOL_EXECUTION_ABORTED' }
    })
    expect(confirm).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('does not execute when shutdown races an immediate full-style approval', async () => {
    const execute = vi.fn(async () => ({ output: 'must-not-run', isError: false }))
    let closePromise: Promise<void> | null = null
    const confirm = vi.fn(async () => {
      closePromise = handle!.close()
      return { approved: true, remember: false }
    })
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool({ execute })]]),
      confirm
    })

    const response = await invoke(handle, { tool: 'echo', args: { value: 'full' } })
    await closePromise

    expect(response).toMatchObject({
      status: 200,
      json: { isError: true, code: 'TOOL_EXECUTION_ABORTED' }
    })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
  })

  it('remembers read-risk approvals but re-asks for execute-risk ones', async () => {
    const confirm = vi.fn(async () => ({ approved: true, remember: true }))
    handle = await startToolGateway({
      tools: new Map<string, ToolDefinition>([
        ['echo', echoTool()],
        ['danger', echoTool({ name: 'danger', risk: 'execute' })]
      ]),
      confirm
    })

    await invoke(handle, { tool: 'echo', args: { value: '1' } })
    await invoke(handle, { tool: 'echo', args: { value: '2' } })
    expect(confirm).toHaveBeenCalledTimes(1)

    await invoke(handle, { tool: 'danger', args: {} })
    await invoke(handle, { tool: 'danger', args: {} })
    // Two more prompts: a remembered yes never becomes a standing grant here.
    expect(confirm).toHaveBeenCalledTimes(3)
  })

  it('confirms a forwarding tool under the per-call risk it reports', async () => {
    const confirm = vi.fn(async () => ({ approved: true, remember: false }))
    handle = await startToolGateway({
      tools: new Map([
        [
          'proxy',
          echoTool({
            name: 'proxy',
            risk: 'execute',
            classify: async (args) => ({
              risk: args.value === 'safe' ? 'read' : 'execute',
              summary: `proxying ${String(args.value)}`,
              rememberKey: `proxy:${String(args.value)}`
            })
          })
        ]
      ]),
      confirm
    })

    await invoke(handle, { tool: 'proxy', args: { value: 'safe' } })
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ risk: 'read', summary: 'proxying safe' }),
      expect.any(AbortSignal)
    )
  })

  it('scopes a remembered approval to the call it was given for', async () => {
    const confirm = vi.fn(async () => ({ approved: true, remember: true }))
    handle = await startToolGateway({
      tools: new Map([
        [
          'proxy',
          echoTool({
            name: 'proxy',
            risk: 'execute',
            classify: async (args) => ({
              risk: args.value === 'danger' ? 'execute' : 'read',
              summary: String(args.value),
              rememberKey: `proxy:${String(args.value)}`
            })
          })
        ]
      ]),
      confirm
    })

    await invoke(handle, { tool: 'proxy', args: { value: 'safe' } })
    await invoke(handle, { tool: 'proxy', args: { value: 'safe' } })
    expect(confirm).toHaveBeenCalledTimes(1)

    // A yes to one proxied target is not a yes to the whole forwarder.
    await invoke(handle, { tool: 'proxy', args: { value: 'other' } })
    expect(confirm).toHaveBeenCalledTimes(2)

    await invoke(handle, { tool: 'proxy', args: { value: 'danger' } })
    await invoke(handle, { tool: 'proxy', args: { value: 'danger' } })
    expect(confirm).toHaveBeenCalledTimes(4)
  })

  it('does not execute a remembered call after shutdown starts', async () => {
    const confirm = vi.fn(async () => ({ approved: true, remember: true }))
    const execute = vi.fn(async (args) => ({ output: String(args.value ?? ''), isError: false }))
    let closePromise: Promise<void> | null = null
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool({ execute })]]),
      confirm,
      onAudit: (event) => {
        if (event.phase === 'decision' && event.decision === 'remembered') {
          closePromise = handle!.close()
        }
      }
    })

    await expect(invoke(handle, { tool: 'echo', args: { value: 'first' } })).resolves.toMatchObject(
      {
        json: { output: 'first', isError: false }
      }
    )
    const response = await invoke(handle, { tool: 'echo', args: { value: 'remembered' } })
    await closePromise

    expect(response).toMatchObject({
      status: 200,
      json: { isError: true, code: 'TOOL_EXECUTION_ABORTED' }
    })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('drops remembered approvals on reset', async () => {
    const confirm = vi.fn(async () => ({ approved: true, remember: true }))
    handle = await startToolGateway({ tools: new Map([['echo', echoTool()]]), confirm })

    await invoke(handle, { tool: 'echo', args: {} })
    handle.resetSessionApprovals()
    await invoke(handle, { tool: 'echo', args: {} })
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('reports an unknown tool back to the model', async () => {
    const confirm = vi.fn(async () => ({ approved: true, remember: false }))
    const audits: AgentToolAuditEvent[] = []
    const canary = 'unknown/tool?apiKey=sk-private'
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool()]]),
      confirm,
      onAudit: (event) => audits.push(event)
    })

    const { status, json } = await invoke(handle, { tool: canary, args: {} })
    expect(status).toBe(200)
    expect(json).toEqual({
      output: 'Tool is not available.',
      isError: true,
      code: 'TOOL_NOT_FOUND'
    })
    expect(confirm).not.toHaveBeenCalled()
    expect(audits.map((event) => event.phase)).toEqual(['call', 'decision', 'result'])
    expect(audits.every((event) => event.toolId === 'unknown')).toBe(true)
    expect(JSON.stringify({ json, audits })).not.toContain(canary)
  })

  it('turns a throwing tool into an error result, not a dead request', async () => {
    handle = await startToolGateway({
      tools: new Map([
        [
          'echo',
          echoTool({
            execute: async () => {
              throw new Error('boom')
            }
          })
        ]
      ]),
      confirm: async () => ({ approved: true, remember: false })
    })

    const { status, json } = await invoke(handle, { tool: 'echo', args: {} })
    expect(status).toBe(200)
    expect(json).toEqual({
      output: 'Tool execution failed.',
      isError: true,
      code: 'TOOL_EXECUTION_FAILED'
    })
    expect(JSON.stringify(json)).not.toContain('boom')
  })

  it.each(['sk_live_secret_123', 'C:Users.private.api-key'])(
    'keeps a valid external call id %s out of audit events',
    async (externalCallId) => {
      const audits: AgentToolAuditEvent[] = []
      const confirm = vi.fn(async () => ({ approved: true, remember: false }))
      handle = await startToolGateway({
        tools: new Map([['echo', echoTool()]]),
        confirm,
        onAudit: (event) => audits.push(event)
      })

      await expect(
        invoke(handle, { tool: 'echo', callId: externalCallId, args: { value: 'ok' } })
      ).resolves.toMatchObject({ json: { output: 'ok', isError: false } })

      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ callId: externalCallId }),
        expect.any(AbortSignal)
      )
      expect(audits.map((event) => event.phase)).toEqual(['call', 'decision', 'result'])
      expect(new Set(audits.map((event) => event.callId)).size).toBe(1)
      expect(audits[0]!.callId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
      expect(JSON.stringify(audits)).not.toContain(externalCallId)
    }
  )

  it('emits strict correlated audits and redacts invalid ids, args and native failures', async () => {
    const canary = 'sk-live-secret@/Users/private/native-stack.ts:42'
    const audits: AgentToolAuditEvent[] = []
    const logs: string[] = []
    handle = await startToolGateway({
      tools: new Map([
        [
          'echo',
          echoTool({
            execute: async () => {
              throw Object.assign(new Error(canary), { code: 'EACCES' })
            }
          })
        ]
      ]),
      confirm: async () => ({ approved: true, remember: false }),
      onAudit: (event) => audits.push(event),
      onLog: (message) => logs.push(message)
    })

    const { json } = await invoke(handle, {
      tool: 'echo',
      callId: `invalid/${canary}`,
      args: { apiKey: canary, path: `/tmp/${canary}` }
    })

    expect(json).toEqual({
      output: 'Access to the requested resource was denied.',
      isError: true,
      code: 'TOOL_RESOURCE_ACCESS_DENIED'
    })
    expect(audits.map((event) => event.phase)).toEqual(['call', 'decision', 'result'])
    expect(audits.every((event) => /^[A-Za-z0-9_.:-]{1,128}$/.test(event.callId))).toBe(true)
    expect(new Set(audits.map((event) => event.callId)).size).toBe(1)
    expect(audits[0]).toEqual({
      schema: 'agent-tool-audit/v1',
      phase: 'call',
      callId: audits[0]!.callId,
      toolId: 'echo',
      risk: 'read'
    })
    expect(audits[1]).toEqual({
      schema: 'agent-tool-audit/v1',
      phase: 'decision',
      callId: audits[0]!.callId,
      toolId: 'echo',
      risk: 'read',
      decision: 'approved'
    })
    expect(audits[2]).toMatchObject({
      schema: 'agent-tool-audit/v1',
      phase: 'result',
      callId: audits[0]!.callId,
      toolId: 'echo',
      risk: 'read',
      status: 'error',
      code: 'TOOL_RESOURCE_ACCESS_DENIED'
    })
    expect(
      (audits[2] as Extract<AgentToolAuditEvent, { phase: 'result' }>).durationMs
    ).toBeGreaterThanOrEqual(0)
    expect(
      (audits[2] as Extract<AgentToolAuditEvent, { phase: 'result' }>).durationMs
    ).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
    expect(JSON.stringify({ json, audits, logs })).not.toContain(canary)
  })

  it('keeps execution fail-soft when the audit sink throws', async () => {
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool()]]),
      confirm: async () => ({ approved: true, remember: false }),
      onAudit: () => {
        throw new Error('audit sink unavailable')
      }
    })

    await expect(
      invoke(handle, { tool: 'echo', args: { value: 'still-runs' } })
    ).resolves.toMatchObject({
      status: 200,
      json: { output: 'still-runs', isError: false }
    })
  })

  it('serves nothing but POST /invoke', async () => {
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool()]]),
      confirm: async () => ({ approved: true, remember: false })
    })

    const response = await call(handle.url, { method: 'GET', token: handle.token })
    expect(response.status).toBe(404)
  })

  it('binds loopback only', async () => {
    handle = await startToolGateway({
      tools: new Map([['echo', echoTool()]]),
      confirm: async () => ({ approved: true, remember: false })
    })
    expect(handle.url.startsWith('http://127.0.0.1:')).toBe(true)
  })
})

describe('tool registry', () => {
  const registry = createToolRegistry({
    searchFiles: async () => [{ name: 'a.txt', path: '/tmp/a.txt' }],
    openPath: async () => '',
    agentContext: emptyAgentContext,
    pluginFeatures: emptyPluginFeatures
  })

  it('classifies risk so only reads are rememberable', () => {
    expect(registry.get('tuff_search_files')?.risk).toBe('read')
    expect(registry.get('tuff_read_file')?.risk).toBe('read')
    expect(registry.get('tuff_open_path')?.risk).toBe('execute')
  })

  it('refuses binaries and oversized reads', async () => {
    const read = registry.get('tuff_read_file')!
    const binary = await read.execute({ path: '/tmp/image.png' })
    expect(binary).toEqual({
      output: 'Tool input is invalid.',
      isError: true,
      code: 'TOOL_INPUT_INVALID'
    })

    const missing = await read.execute({ path: '/tmp/definitely-not-here-9f8a7.txt' })
    expect(missing.isError).toBe(true)
  })

  it('requires arguments rather than guessing', async () => {
    expect(await registry.get('tuff_search_files')!.execute({})).toMatchObject({ isError: true })
    expect(await registry.get('tuff_read_file')!.execute({})).toMatchObject({ isError: true })
    expect(await registry.get('tuff_open_path')!.execute({})).toMatchObject({ isError: true })
  })

  it('expands ~ and relativises against cwd', () => {
    expect(resolveUserPath('~/x').startsWith('/')).toBe(true)
    expect(resolveUserPath('~/x')).not.toContain('~')
    expect(resolveUserPath('/abs/path')).toBe('/abs/path')
    expect(resolveUserPath('')).toBe('')
  })

  it('summarises calls for the confirmation card', () => {
    expect(registry.get('tuff_search_files')!.summarize({ query: 'report' })).toContain('report')
    expect(registry.get('tuff_open_path')!.summarize({ path: '/tmp/x' })).toContain('/tmp/x')
  })
})

describe('chart spec validation', () => {
  const registry = createToolRegistry({
    searchFiles: async () => [],
    openPath: async () => '',
    agentContext: emptyAgentContext,
    pluginFeatures: emptyPluginFeatures
  })
  const chart = registry.get('tuff_render_chart')!

  it('accepts a well-formed spec and marks the result for the renderer', async () => {
    const result = await chart.execute({
      type: 'bar',
      title: 'Downloads',
      labels: ['Mon', 'Tue'],
      series: [{ name: 'count', values: [3, 5] }]
    })

    expect(result.isError).toBe(false)
    expect(result.output.startsWith(CHART_RESULT_PREFIX)).toBe(true)
    expect(JSON.parse(result.output.slice(CHART_RESULT_PREFIX.length))).toMatchObject({
      type: 'bar',
      title: 'Downloads',
      labels: ['Mon', 'Tue'],
      series: [{ name: 'count', values: [3, 5] }]
    })
  })

  it('rejects unknown chart types and empty data', () => {
    expect(parseChartSpec({ type: 'sankey', labels: ['a'], series: [{ values: [1] }] })).toContain(
      'type must be one of'
    )
    expect(parseChartSpec({ type: 'bar', labels: [], series: [{ values: [] }] })).toContain(
      'labels must be'
    )
    expect(parseChartSpec({ type: 'bar', labels: ['a'], series: [] })).toContain('series must be')
  })

  it('requires one value per label so a chart cannot render misaligned', () => {
    expect(
      parseChartSpec({ type: 'line', labels: ['a', 'b'], series: [{ values: [1] }] })
    ).toContain('one value per label')
  })

  it('coerces non-numeric values to zero rather than failing the whole chart', () => {
    const spec = parseChartSpec({
      type: 'line',
      labels: ['a', 'b'],
      series: [{ values: [1, 'oops'] }]
    })
    expect(typeof spec).not.toBe('string')
    expect((spec as { series: Array<{ values: number[] }> }).series[0]!.values).toEqual([1, 0])
  })

  it('accepts the extended chart family and passes presentation options through', () => {
    for (const type of ['area', 'doughnut', 'radar', 'funnel', 'gauge', 'heatmap']) {
      const spec = parseChartSpec({ type, labels: ['a'], series: [{ values: [1] }] })
      expect(typeof spec, `${type} should validate`).not.toBe('string')
    }

    const spec = parseChartSpec({
      type: 'bar',
      labels: ['q1', 'q2'],
      series: [{ name: 's', values: [1, 2] }],
      xLabel: 'Quarter',
      yLabel: 'Sales',
      stacked: true,
      showValues: true
    })
    expect(spec).toMatchObject({
      xLabel: 'Quarter',
      yLabel: 'Sales',
      stacked: true,
      showValues: true
    })
  })

  it('never needs a confirmation beyond read risk', () => {
    // It only draws data the model already holds; nothing on the machine is touched.
    expect(chart.risk).toBe('read')
  })
})
