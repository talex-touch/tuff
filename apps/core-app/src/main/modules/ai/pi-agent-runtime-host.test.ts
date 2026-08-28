import { createHash } from 'node:crypto'
import type {
  AiAgentProfile,
  AiOrchestratorExecuteRequest,
  AiOrchestratorRunRecord
} from '@talex-touch/utils/types/ai-orchestrator'
import {
  PI_RUNTIME_PROTOCOL_VERSION,
  type PiRuntimeStartPayload,
  type PiRuntimeToolRequest
} from './pi-agent-runtime-protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PiAgentRuntimeHost, sanitizeToolOutputForRuntime } from './pi-agent-runtime-host'
import { AgentPermission } from '@talex-touch/utils'
import { isRunInterruptedControlError } from './pi-agent-runtime-control-error'

const hostMocks = vi.hoisted(() => {
  const listeners = new Map<string, Array<(payload: unknown) => void>>()
  const child = {
    pid: 4242,
    on: vi.fn((event: string, listener: (payload: unknown) => void) => {
      const eventListeners = listeners.get(event) ?? []
      eventListeners.push(listener)
      listeners.set(event, eventListeners)
      return child
    }),
    postMessage: vi.fn(),
    kill: vi.fn(),
    stdout: { on: vi.fn((_event: string, _listener: (payload: unknown) => void) => undefined) },
    stderr: { on: vi.fn((_event: string, _listener: (payload: unknown) => void) => undefined) }
  }
  const emit = (event: string, payload: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(payload)
  }
  const fork = vi.fn(() => {
    queueMicrotask(() =>
      emit('message', { type: 'runtime.ready', protocolVersion: PI_RUNTIME_PROTOCOL_VERSION })
    )
    return child
  })
  const reset = () => {
    listeners.clear()
    child.on.mockClear()
    child.postMessage.mockClear()
    child.kill.mockClear()
    child.stdout.on.mockClear()
    child.stderr.on.mockClear()
    fork.mockClear()
  }
  return { child, emit, fork, reset }
})

const intelligenceMocks = vi.hoisted(() => ({
  invoke: vi.fn()
}))

const toolMocks = vi.hoisted(() => ({
  getTool: vi.fn(),
  executeTool: vi.fn()
}))

const mcpMocks = vi.hoisted(() => ({
  getProfile: vi.fn()
}))

const runtimeLoggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
}))

const CANARY = 'sk-live-token@/Users/private/native-stack.ts:42'
const NESTED_JSON_CREDENTIAL = JSON.stringify({
  nested: JSON.stringify({ token: 'opaque-secret' })
})
const DEEPLY_NESTED_JSON_CREDENTIAL = JSON.stringify({ nested: NESTED_JSON_CREDENTIAL })

vi.mock('electron', () => ({
  app: {
    isReady: vi.fn(() => true),
    getPath: vi.fn(() => '/tmp/tuff-pi-runtime-test')
  },
  utilityProcess: { fork: hostMocks.fork }
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  realpathSync: { native: vi.fn((value: string) => value) }
}))

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    child: () => runtimeLoggerMocks
  })
}))

vi.mock('./agents', () => ({
  agentManager: { getTool: toolMocks.getTool },
  toolRegistry: toolMocks
}))

vi.mock('./intelligence-sdk', () => ({
  tuffIntelligence: intelligenceMocks
}))

vi.mock('./intelligence-mcp-registry', () => ({
  intelligenceMcpRegistry: mcpMocks
}))

function startPayload(): PiRuntimeStartPayload {
  const run: AiOrchestratorRunRecord = {
    id: 'run-stable-7',
    sessionId: 'session-stable-3',
    objective: 'Inspect release readiness',
    profileId: 'profile-reviewer',
    runtimeProvider: 'pi-core',
    cwd: '/workspace',
    status: 'running',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  const request: AiOrchestratorExecuteRequest = {
    objective: run.objective,
    sessionId: run.sessionId,
    approved: true,
    timeoutMs: 30_000
  }
  const profile: AiAgentProfile = {
    id: run.profileId,
    name: 'Reviewer',
    description: 'Reviews release readiness.',
    runtimeProvider: 'pi-core',
    enabled: true,
    modelPreference: ['provider/model-stable'],
    allowedToolIds: ['tool.inspect'],
    enabledSkillIds: [],
    permissionPolicy: { mode: 'preauthorized', allowedPermissions: [] },
    timeoutMs: 30_000,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  return {
    run,
    request,
    profile,
    tools: [
      {
        id: 'tool.inspect',
        name: 'Inspect',
        description: 'Inspect the release.',
        inputSchema: { type: 'object', properties: {} }
      }
    ],
    history: [{ role: 'user', text: 'Summarize release readiness.', createdAt: Date.now() }],
    budget: { maxSteps: 12, maxCost: 1.5, maxChildRuns: 0, maxConcurrency: 1 }
  }
}

async function settleAsyncWork(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

function toolRequest(
  payload: PiRuntimeStartPayload,
  input: unknown,
  overrides: Partial<PiRuntimeToolRequest> = {}
): PiRuntimeToolRequest {
  return {
    requestId: 'tool-request-stable-5',
    runId: payload.run.id,
    toolCallId: 'tool-call-stable-6',
    toolId: 'tool.inspect',
    input,
    ...overrides
  }
}

function approvalFingerprint(toolId: string, input: unknown): string {
  return createHash('sha256')
    .update(`${toolId}:${JSON.stringify(input)}`)
    .digest('hex')
}

async function completeRun(
  payload: PiRuntimeStartPayload,
  execution: Promise<unknown>
): Promise<void> {
  hostMocks.emit('message', {
    protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
    type: 'run.completed',
    payload: {
      runId: payload.run.id,
      output: 'done',
      usage: { promptTokens: 3, completionTokens: 5, totalTokens: 8 }
    }
  })
  await expect(execution).resolves.toMatchObject({ runId: payload.run.id, output: 'done' })
}

describe('piAgentRuntimeHost protocol boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T09:15:00.000Z'))
    vi.clearAllMocks()
    hostMocks.reset()
    intelligenceMocks.invoke.mockResolvedValue({
      result: 'model answer',
      provider: 'provider-stable',
      model: 'model-stable',
      usage: { promptTokens: 3, completionTokens: 5, totalTokens: 8 }
    })
    toolMocks.getTool.mockReturnValue({ id: 'tool.inspect', permissions: [] })
    toolMocks.executeTool.mockResolvedValue({ success: true, output: { ready: true } })
  })

  it.each([
    ['GitHub token', 'ghp_abcdefghijklmnopqrstuvwxyz123456'],
    ['AWS access key', 'AKIA1234567890ABCDEF'],
    ['Slack token', 'xoxb-1234567890-abcdefghij'],
    ['Google API key', 'AIzaSyA1234567890abcdefghijklmn'],
    ['Stripe key', 'sk_live_1234567890abcdef'],
    ['PEM key', '-----BEGIN PRIVATE KEY-----'],
    ['quoted JSON token', '{"token":"opaque-secret"}'],
    ['quoted JSON compound token key', '{"apiToken":"opaque-secret"}'],
    ['nested quoted JSON token', NESTED_JSON_CREDENTIAL],
    [
      'nested quoted JSON compound token key',
      JSON.stringify({ nested: JSON.stringify({ apiToken: 'opaque-secret' }) })
    ],
    ['deeply nested quoted JSON token', DEEPLY_NESTED_JSON_CREDENTIAL]
  ])('redacts a standalone %s canary', (_name, credential) => {
    expect(sanitizeToolOutputForRuntime(credential)).toBe('[redacted]')
  })

  it.each([
    ['POSIX workspace path', '/workspace/private/release.md'],
    ['POSIX application path', '/Applications/Tuff.app/Contents/MacOS/Tuff'],
    ['home-relative path', '~/private/release.md'],
    ['dot-relative path', './private/release.md'],
    ['parent-relative path', '../private/release.md'],
    ['Windows drive path', 'C:\\Users\\owner\\private.txt'],
    ['Windows UNC path', '\\\\server\\share\\private.txt'],
    ['local file URI', 'file:///Users/owner/private.txt'],
    ['hosted file URI', 'file://server/share/private.txt'],
    ['bracketed POSIX path', 'files=[/Users/owner/private.txt]'],
    ['braced Windows path', 'result,{C:\\Users\\owner\\private.txt}'],
    ['bracketed file URI', 'source=[file:///Users/owner/private.txt]'],
    ['quoted JSON compound path key', '{"workspacePath":"private/release.md"}']
  ])('redacts a standalone %s canary', (_name, path) => {
    expect(sanitizeToolOutputForRuntime(path)).toBe('[redacted]')
  })

  it.each([
    ['ordinary URL', 'https://example.test/docs/releases/latest'],
    ['ordinary text', 'Published release notes successfully.'],
    ['non-secret token wording', 'The token count is 12.'],
    ['ordinary JSON', JSON.stringify({ message: 'Published.', tokenCount: 12 })]
  ])('preserves %s', (_name, value) => {
    expect(sanitizeToolOutputForRuntime(value)).toBe(value)
  })

  it('fails closed when a JSON string exceeds the bounded inspection budget', () => {
    const oversizedJson = JSON.stringify({ message: 'x'.repeat(33 * 1024) })
    expect(sanitizeToolOutputForRuntime(oversizedJson)).toBe('[redacted]')
  })

  it('fails closed before scanning an oversized non-JSON scalar', () => {
    expect(sanitizeToolOutputForRuntime('x'.repeat(65 * 1024))).toBe('[redacted]')
  })

  it('does not invoke throwing accessors while sanitizing tool output', () => {
    const objectOutput = Object.defineProperty({}, 'message', {
      enumerable: true,
      get() {
        throw new Error(CANARY)
      }
    })
    const arrayOutput: unknown[] = []
    Object.defineProperty(arrayOutput, '0', {
      enumerable: true,
      get() {
        throw new Error(CANARY)
      }
    })

    expect(sanitizeToolOutputForRuntime(objectOutput)).toEqual({ message: '[redacted]' })
    expect(sanitizeToolOutputForRuntime(arrayOutput)).toEqual(['[redacted]'])
  })

  it('does not retain tool-owned serialization hooks or boxed sensitive text', () => {
    const toJSON = vi.fn(() => ({ message: CANARY }))
    const sanitized = sanitizeToolOutputForRuntime({ message: 'Published.', toJSON })

    expect(sanitized).toEqual({ message: 'Published.', toJSON: '[redacted]' })
    expect(JSON.stringify(sanitized)).not.toContain(CANARY)
    expect(toJSON).not.toHaveBeenCalled()
    expect(sanitizeToolOutputForRuntime(new String('/Users/private/release.md'))).toBe('[redacted]')
  })

  it.each([
    ['container entries', JSON.stringify(Array.from({ length: 101 }, () => 0))],
    ['inspected nodes', JSON.stringify(Array.from({ length: 100 }, () => Array(5).fill(0)))],
    [
      'decode depth',
      Array.from({ length: 10 }).reduce((encoded) => JSON.stringify(encoded), 'ordinary text')
    ]
  ])('fails closed when the JSON %s budget is exhausted', (_name, value) => {
    expect(sanitizeToolOutputForRuntime(value)).toBe('[redacted]')
  })

  it('never exposes values beyond the bounded tool-output graph budget', () => {
    const output = Array.from({ length: 100 }, () => Array(6).fill('safe'))
    output.at(-1)![5] = CANARY

    const serialized = JSON.stringify(sanitizeToolOutputForRuntime(output))
    expect(serialized).toContain('[truncated]')
    expect(serialized).not.toContain(CANARY)
  })

  it('bounds recursive JSON parsing attempts and fails closed when the budget is exhausted', () => {
    const parseSpy = vi.spyOn(JSON, 'parse')
    const invalidJsonStrings = Array.from({ length: 20 }, (_, index) => `{"item-${index}"}`)

    try {
      expect(sanitizeToolOutputForRuntime(JSON.stringify(invalidJsonStrings))).toBe('[redacted]')
      expect(parseSpy).toHaveBeenCalledTimes(16)
    } finally {
      parseSpy.mockRestore()
    }
  })

  it('redacts nested values, path-like fields, and malicious keys while preserving safe fields', () => {
    const maliciousKey = 'ghp_abcdefghijklmnopqrstuvwxyz123456'
    expect(
      sanitizeToolOutputForRuntime({
        message: 'Published.',
        file_name: 'release.md',
        nested: [{ value: 'xoxb-1234567890-abcdefghij' }],
        [maliciousKey]: 'unsafe'
      })
    ).toEqual({
      message: 'Published.',
      file_name: '[redacted]',
      nested: [{ value: '[redacted]' }],
      redactedKey3: '[redacted]'
    })
  })

  it('preserves token usage metadata while redacting credential and directory fields', () => {
    expect(
      sanitizeToolOutputForRuntime({
        tokenCount: 12,
        promptTokens: 3,
        totalTokens: 15,
        passwordHash: 'opaque-secret',
        outputDir: 'private/release'
      })
    ).toEqual({
      tokenCount: 12,
      promptTokens: 3,
      totalTokens: 15,
      passwordHash: '[redacted]',
      outputDir: '[redacted]'
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('run.start 投递失败时不留下 run id,重试不再报 already active', async () => {
    const host = new PiAgentRuntimeHost()
    const payload = startPayload()

    // The child goes away between the availability check and the post, or the payload is not
    // structured-cloneable. Either way postMessage throws.
    hostMocks.child.postMessage.mockImplementationOnce(() => {
      throw new Error('child is gone')
    })

    await expect(host.execute(payload)).rejects.toThrow(/child is gone/)

    // Before #767 the map still held the id, so this second attempt failed with
    // 'Run <id> is already active' instead of reaching the runtime at all.
    const retry = host.execute(payload)
    await settleAsyncWork()

    expect(hostMocks.child.postMessage).toHaveBeenCalledWith({
      type: 'run.start',
      payload,
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION
    })
    await completeRun(payload, retry)
  })

  it('投递失败也不会留下一个稍后触发的运行定时器', async () => {
    const host = new PiAgentRuntimeHost()
    const payload = startPayload()
    await host.start()

    const before = vi.getTimerCount()
    hostMocks.child.postMessage.mockImplementationOnce(() => {
      throw new Error('child is gone')
    })
    await expect(host.execute(payload)).rejects.toThrow(/child is gone/)

    expect(vi.getTimerCount()).toBe(before)
  })

  it('preserves run and model request IDs while relaying host-owned model responses', async () => {
    const payload = startPayload()
    const host = new PiAgentRuntimeHost()
    const execution = host.execute(payload)
    await settleAsyncWork()

    expect(hostMocks.child.postMessage).toHaveBeenCalledWith({
      type: 'run.start',
      payload,
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION
    })

    hostMocks.emit('message', {
      type: 'model.request',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: {
        requestId: 'model-request-stable-4',
        runId: payload.run.id,
        step: 1,
        systemPrompt: 'Follow the release policy.',
        messages: [{ role: 'user', content: 'Is it ready?' }],
        tools: [],
        modelPreference: ['provider/model-stable']
      }
    })
    await settleAsyncWork()

    expect(intelligenceMocks.invoke).toHaveBeenCalledWith(
      'text.chat',
      expect.objectContaining({ messages: expect.any(Array) }),
      expect.objectContaining({
        metadata: {
          caller: 'ai-cli-orchestrator',
          runId: payload.run.id,
          sessionId: payload.run.sessionId,
          step: 1
        }
      })
    )
    expect(hostMocks.child.postMessage).toHaveBeenCalledWith({
      type: 'model.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({
        requestId: 'model-request-stable-4',
        runId: payload.run.id,
        text: 'model answer',
        provider: 'provider-stable',
        model: 'model-stable'
      })
    })

    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.completed',
      payload: {
        runId: payload.run.id,
        output: 'done',
        usage: { promptTokens: 3, completionTokens: 5, totalTokens: 8 }
      }
    })
    await expect(execution).resolves.toMatchObject({ runId: payload.run.id, output: 'done' })
  })

  it('projects provider failures before they cross into the runtime worker', async () => {
    const payload = startPayload()
    intelligenceMocks.invoke.mockRejectedValue(new Error(CANARY))
    const host = new PiAgentRuntimeHost()
    const execution = host.execute(payload)
    await settleAsyncWork()

    hostMocks.emit('message', {
      type: 'model.request',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: {
        requestId: 'model-request-failed-4',
        runId: payload.run.id,
        step: 1,
        systemPrompt: '',
        messages: [{ role: 'user', content: 'Is it ready?' }],
        tools: [],
        modelPreference: []
      }
    })
    await settleAsyncWork()

    const response = hostMocks.child.postMessage.mock.calls.at(-1)?.[0]
    expect(response).toEqual({
      type: 'model.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: {
        requestId: 'model-request-failed-4',
        runId: payload.run.id,
        error: 'MODEL_REQUEST_FAILED: Model request failed.'
      }
    })
    expect(JSON.stringify(response)).not.toContain(CANARY)
    await completeRun(payload, execution)
  })

  it('uses fixed diagnostics for worker errors and process output', async () => {
    const payload = startPayload()
    const host = new PiAgentRuntimeHost()
    const execution = host.execute(payload)
    await settleAsyncWork()

    hostMocks.emit('message', {
      type: 'runtime.error',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      error: CANARY
    })
    const stdoutListener = hostMocks.child.stdout.on.mock.calls[0]?.[1]
    const stderrListener = hostMocks.child.stderr.on.mock.calls[0]?.[1]
    stdoutListener?.(CANARY)
    stderrListener?.(CANARY)
    hostMocks.emit('error', new Error(CANARY))

    const serializedLogs = JSON.stringify({
      debug: runtimeLoggerMocks.debug.mock.calls,
      error: runtimeLoggerMocks.error.mock.calls,
      warn: runtimeLoggerMocks.warn.mock.calls
    })
    expect(serializedLogs).toContain('Pi runtime worker error')
    expect(serializedLogs).toContain('Pi runtime utility process emitted stderr')
    expect(serializedLogs).not.toContain(CANARY)
    await completeRun(payload, execution)
  })

  it('forwards runtime events only while their run is active', async () => {
    const payload = startPayload()
    const onEvent = vi.fn()
    const host = new PiAgentRuntimeHost({ onEvent })
    expect(host.isRunActive(payload.run.id)).toBe(false)
    const execution = host.execute(payload)
    await settleAsyncWork()
    expect(host.isRunActive(payload.run.id)).toBe(true)

    const event = {
      runId: payload.run.id,
      type: 'turn_start',
      payload: { type: 'turn_start' }
    }
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.event',
      payload: event
    })
    await settleAsyncWork()
    expect(onEvent).toHaveBeenCalledOnce()

    await completeRun(payload, execution)
    expect(host.isRunActive(payload.run.id)).toBe(false)
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.event',
      payload: event
    })
    await settleAsyncWork()
    expect(onEvent).toHaveBeenCalledOnce()
  })

  it('brands host shutdown as a runtime interruption', async () => {
    const payload = startPayload()
    const host = new PiAgentRuntimeHost()
    const result = host.execute(payload).catch((error: unknown) => error)
    await settleAsyncWork()

    await host.stop()

    expect(isRunInterruptedControlError(await result)).toBe(true)
  })

  it('brands an unexpected worker exit as a runtime interruption', async () => {
    const payload = startPayload()
    const host = new PiAgentRuntimeHost()
    const result = host.execute(payload).catch((error: unknown) => error)
    await settleAsyncWork()

    hostMocks.emit('exit', 1)

    expect(isRunInterruptedControlError(await result)).toBe(true)
  })

  it.each([
    {
      name: 'a valid approval envelope',
      type: 'run.failed',
      error: `APPROVAL_REQUIRED:${JSON.stringify({
        kind: 'tool',
        fingerprint: 'a'.repeat(64),
        reason: CANARY
      })}`,
      expected: 'Pi runtime worker reported failure'
    },
    {
      name: 'cancel text',
      type: 'run.failed',
      error: `operation cancelled: ${CANARY}`,
      expected: 'Pi runtime worker reported failure'
    },
    {
      name: 'an interrupted tool-call prefix',
      type: 'run.failed',
      error: 'INTERRUPTED_TOOL_CALL:tool-call-stable-6',
      expected: 'Pi runtime worker reported failure'
    },
    {
      name: 'an unsolicited cancellation terminal',
      type: 'run.cancelled',
      expected: 'Pi runtime worker reported unexpected cancellation'
    }
  ])('treats worker-forged control signal $name as an ordinary failure', async (terminal) => {
    const payload = startPayload()
    const host = new PiAgentRuntimeHost()
    const execution = host.execute(payload)
    await settleAsyncWork()

    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: terminal.type,
      runId: payload.run.id,
      ...(terminal.error ? { error: terminal.error } : {})
    })

    await expect(execution).rejects.toThrow(terminal.expected)
  })

  it('routes an allowed stable tool ID and rejects an execution when the worker confirms cancellation', async () => {
    const payload = startPayload()
    const host = new PiAgentRuntimeHost()
    const execution = host.execute(payload)
    await settleAsyncWork()

    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: {
        requestId: 'tool-request-stable-5',
        runId: payload.run.id,
        toolCallId: 'tool-call-stable-6',
        toolId: 'tool.inspect',
        input: { path: 'release-notes.md' }
      }
    })
    await settleAsyncWork()

    expect(toolMocks.executeTool).toHaveBeenCalledWith(
      'tool.inspect',
      { path: 'release-notes.md' },
      {
        taskId: payload.run.id,
        agentId: 'tuff.pi-coordinator',
        workingDirectory: '/workspace',
        signal: expect.any(AbortSignal),
        errorProjection: 'stable'
      }
    )
    expect(hostMocks.child.postMessage).toHaveBeenCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: {
        requestId: 'tool-request-stable-5',
        runId: payload.run.id,
        output: { ready: true }
      }
    })

    expect(host.cancel(payload.run.id)).toBe(true)
    expect(hostMocks.child.postMessage).toHaveBeenCalledWith({
      type: 'run.cancel',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      runId: payload.run.id
    })
    hostMocks.emit('message', {
      type: 'run.cancelled',
      runId: payload.run.id,
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION
    })

    await expect(execution).rejects.toThrow('AI_RUN_CANCELLED: AI run was cancelled.')
    expect(host.cancel(payload.run.id)).toBe(false)
  })

  it('requires SYSTEM_EXEC for stdio MCP and NETWORK_ACCESS for HTTP MCP', async () => {
    const host = new PiAgentRuntimeHost()
    toolMocks.getTool.mockReturnValue({ id: 'mcp.call', permissions: [] })

    const stdioPayload = startPayload()
    stdioPayload.tools = [{ ...stdioPayload.tools[0], id: 'mcp.call' }]
    stdioPayload.profile.permissionPolicy = {
      mode: 'preauthorized',
      allowedPermissions: [AgentPermission.NETWORK_ACCESS]
    }
    mcpMocks.getProfile.mockReturnValue({
      id: 'mcp-stdio',
      name: 'Local MCP',
      transport: { type: 'stdio', command: 'local-mcp' }
    })
    const stdioExecution = host.execute(stdioPayload)
    const stdioAssertion = expect(stdioExecution).rejects.toThrow('APPROVAL_REQUIRED:')
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(
        stdioPayload,
        { profileId: 'mcp-stdio', toolName: 'read' },
        { toolId: 'mcp.call' }
      )
    })
    await settleAsyncWork()
    expect(hostMocks.child.postMessage).toHaveBeenCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({
        error: expect.stringContaining('Tool permissions require user approval.')
      })
    })
    expect(toolMocks.executeTool).not.toHaveBeenCalled()
    await stdioAssertion

    const httpPayload = startPayload()
    httpPayload.run.id = 'run-http-8'
    httpPayload.tools = [{ ...httpPayload.tools[0], id: 'mcp.call' }]
    httpPayload.profile.permissionPolicy = {
      mode: 'preauthorized',
      allowedPermissions: [AgentPermission.NETWORK_ACCESS]
    }
    mcpMocks.getProfile.mockReturnValue({
      id: 'mcp-http',
      name: 'Remote MCP',
      transport: { type: 'streamable-http', url: 'https://mcp.example.test' }
    })
    const httpExecution = host.execute(httpPayload)
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(
        httpPayload,
        { profileId: 'mcp-http', toolName: 'read' },
        { toolId: 'mcp.call' }
      )
    })
    await settleAsyncWork()
    expect(toolMocks.executeTool).toHaveBeenCalledWith(
      'mcp.call',
      { profileId: 'mcp-http', toolName: 'read' },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    await completeRun(httpPayload, httpExecution)
  })

  it('accepts only the exact approval fingerprint once for a governed tool', async () => {
    const payload = startPayload()
    const approvedInput = { path: 'release-notes.md' }
    payload.profile.permissionPolicy = { mode: 'manual', allowedPermissions: [] }
    toolMocks.getTool.mockReturnValue({
      id: 'tool.inspect',
      permissions: [AgentPermission.FILE_READ]
    })
    payload.request.metadata = {
      approvalGrantFingerprint: approvalFingerprint('tool.inspect', approvedInput)
    }
    const host = new PiAgentRuntimeHost()
    const mismatchExecution = host.execute(payload)
    const mismatchAssertion = expect(mismatchExecution).rejects.toThrow('APPROVAL_REQUIRED:')
    await settleAsyncWork()

    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, { path: 'different-notes.md' }, { toolCallId: 'mismatch' })
    })
    await settleAsyncWork()
    expect(hostMocks.child.postMessage).toHaveBeenCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({ error: expect.stringContaining('APPROVAL_REQUIRED:') })
    })
    await mismatchAssertion
    expect(toolMocks.executeTool).not.toHaveBeenCalled()

    const execution = host.execute(payload)
    const executionAssertion = expect(execution).rejects.toThrow('APPROVAL_REQUIRED:')
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, approvedInput, { toolCallId: 'approved-once' })
    })
    await settleAsyncWork()
    expect(toolMocks.executeTool).toHaveBeenCalledTimes(1)
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({ output: { ready: true } })
    })

    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, approvedInput, { toolCallId: 'approved-replay' })
    })
    await settleAsyncWork()
    expect(hostMocks.child.postMessage).toHaveBeenCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({ error: expect.stringContaining('APPROVAL_REQUIRED:') })
    })
    expect(toolMocks.executeTool).toHaveBeenCalledTimes(1)
    await executionAssertion
  })

  it('rebuilds only structurally valid registry approval controls as branded host errors', async () => {
    const payload = startPayload()
    const host = new PiAgentRuntimeHost()

    toolMocks.executeTool.mockResolvedValueOnce({
      success: false,
      runtimeControl: true,
      error: `APPROVAL_REQUIRED:${CANARY}`
    })
    const malformedExecution = host.execute(payload)
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, {})
    })
    await settleAsyncWork()
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: {
        requestId: 'tool-request-stable-5',
        runId: payload.run.id,
        error: 'TOOL_EXECUTION_FAILED: Tool execution failed.'
      }
    })
    await completeRun(payload, malformedExecution)

    toolMocks.executeTool.mockResolvedValueOnce({
      success: false,
      runtimeControl: true,
      error: `APPROVAL_REQUIRED:${JSON.stringify({
        kind: 'tool',
        fingerprint: 'c'.repeat(64),
        reason: CANARY
      })}`
    })
    const trustedExecution = host.execute(payload)
    const trustedAssertion = expect(trustedExecution).rejects.toThrow('APPROVAL_REQUIRED:')
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, {})
    })
    await settleAsyncWork()
    expect(hostMocks.child.postMessage).toHaveBeenCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({
        error: expect.stringContaining(`"fingerprint":"${'c'.repeat(64)}"`)
      })
    })
    await trustedAssertion
  })

  it('does not let an automation policy bypass an MCP transport permission', async () => {
    const payload = startPayload()
    payload.tools = [{ ...payload.tools[0], id: 'mcp.call' }]
    payload.profile.permissionPolicy = { mode: 'preauthorized', allowedPermissions: [] }
    payload.request.metadata = {
      automationPolicy: {
        version: 1,
        allowedToolIds: ['mcp.call'],
        allowedMcpServerIds: ['mcp-stdio'],
        allowedAgentProfileIds: [],
        allowedPaths: ['/workspace'],
        allowedNetworkTargets: [],
        budget: payload.budget,
        timeoutMs: 30_000,
        maxRunsPerWindow: 1,
        windowMs: 60_000
      }
    }
    toolMocks.getTool.mockReturnValue({ id: 'mcp.call', permissions: [] })
    mcpMocks.getProfile.mockReturnValue({
      id: 'mcp-stdio',
      name: 'Local MCP',
      transport: { type: 'stdio', command: 'local-mcp' }
    })
    const host = new PiAgentRuntimeHost()
    const execution = host.execute(payload)
    const executionAssertion = expect(execution).rejects.toThrow('APPROVAL_REQUIRED:')
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(
        payload,
        { profileId: 'mcp-stdio', toolName: 'read' },
        { toolId: 'mcp.call' }
      )
    })
    await settleAsyncWork()
    expect(hostMocks.child.postMessage).toHaveBeenCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({
        error: expect.stringContaining('Tool permissions require user approval.')
      })
    })
    expect(toolMocks.executeTool).not.toHaveBeenCalled()
    await executionAssertion
  })

  it('requires every source and destination path to stay within the automation policy', async () => {
    const payload = startPayload()
    payload.profile.permissionPolicy = { mode: 'preauthorized', allowedPermissions: [] }
    payload.request.metadata = {
      automationPolicy: {
        version: 1,
        allowedToolIds: ['tool.inspect'],
        allowedMcpServerIds: [],
        allowedAgentProfileIds: [],
        allowedPaths: ['/workspace/approved'],
        allowedNetworkTargets: [],
        budget: payload.budget,
        timeoutMs: 30_000,
        maxRunsPerWindow: 1,
        windowMs: 60_000
      }
    }
    const host = new PiAgentRuntimeHost()
    const execution = host.execute(payload)
    const executionAssertion = expect(execution).rejects.toThrow('APPROVAL_REQUIRED:')
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, {
        source: '/workspace/approved/input.md',
        destination: '/workspace/unapproved/output.md'
      })
    })
    await settleAsyncWork()
    expect(hostMocks.child.postMessage).toHaveBeenCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({
        error: expect.stringContaining('Tool access requires user approval.')
      })
    })
    expect(toolMocks.executeTool).not.toHaveBeenCalled()
    await executionAssertion
  })

  it('redacts sensitive tool output and caps returned text before crossing the worker boundary', async () => {
    const payload = startPayload()
    const longText = 'x'.repeat(20_000)
    const embeddedPosixPath = 'files=[/Users/owner/private.txt]'
    const embeddedWindowsPath = 'result,{C:\\Users\\owner\\private.txt}'
    const embeddedFileUri = 'source=[file:///Users/owner/private.txt]'
    const embeddedJsonToken = '{"token":"opaque-secret"}'
    toolMocks.executeTool.mockResolvedValue({
      success: true,
      output: {
        apiToken: 'secret-value',
        contents: longText,
        result: CANARY,
        path: '/Users/private/release.md',
        safeMessage: 'Published.',
        safeUrl: 'https://example.test/docs/releases/latest',
        embeddedPosixPath,
        embeddedWindowsPath,
        embeddedFileUri,
        embeddedJsonToken,
        nested: { summary: `${embeddedPosixPath} ${embeddedJsonToken}` },
        [CANARY]: 'malicious-key'
      }
    })
    const persistToolCallResult = vi.fn()
    const host = new PiAgentRuntimeHost({ persistToolCallResult })
    const execution = host.execute(payload)
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, { path: 'release-notes.md' })
    })
    await settleAsyncWork()
    const response = hostMocks.child.postMessage.mock.calls.at(-1)?.[0]
    expect(response).toEqual({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: {
        requestId: 'tool-request-stable-5',
        runId: payload.run.id,
        output: expect.objectContaining({
          apiToken: '[redacted]',
          contents: 'x'.repeat(16_000),
          result: '[redacted]',
          path: '[redacted]',
          safeMessage: 'Published.',
          safeUrl: 'https://example.test/docs/releases/latest',
          embeddedPosixPath: '[redacted]',
          embeddedWindowsPath: '[redacted]',
          embeddedFileUri: '[redacted]',
          embeddedJsonToken: '[redacted]',
          nested: { summary: '[redacted]' }
        })
      }
    })
    expect(persistToolCallResult).toHaveBeenCalledWith(
      payload.run.id,
      'tool-call-stable-6',
      expect.objectContaining({
        output: expect.objectContaining({
          result: '[redacted]',
          path: '[redacted]',
          safeMessage: 'Published.',
          safeUrl: 'https://example.test/docs/releases/latest',
          embeddedPosixPath: '[redacted]',
          embeddedWindowsPath: '[redacted]',
          embeddedFileUri: '[redacted]',
          embeddedJsonToken: '[redacted]',
          nested: { summary: '[redacted]' }
        })
      })
    )
    const projectedBoundary = JSON.stringify({
      response,
      persisted: persistToolCallResult.mock.calls
    })
    for (const sensitiveValue of [
      CANARY,
      '/Users/private/release.md',
      '/Users/owner/private.txt',
      'C:\\Users\\owner\\private.txt',
      'file:///Users/owner/private.txt',
      'opaque-secret'
    ]) {
      expect(projectedBoundary).not.toContain(sensitiveValue)
    }
    await completeRun(payload, execution)
  })

  it.each([
    { name: 'sensitive scalar', output: CANARY, expected: '[redacted]' },
    { name: 'safe scalar', output: 'Published.', expected: 'Published.' }
  ])('projects $name tool output without changing safe text', async ({ output, expected }) => {
    const payload = startPayload()
    const persistToolCallResult = vi.fn()
    toolMocks.executeTool.mockResolvedValue({ success: true, output })
    const host = new PiAgentRuntimeHost({ persistToolCallResult })
    const execution = host.execute(payload)
    await settleAsyncWork()

    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, {})
    })
    await settleAsyncWork()

    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: {
        requestId: 'tool-request-stable-5',
        runId: payload.run.id,
        output: expected
      }
    })
    expect(persistToolCallResult).toHaveBeenCalledWith(payload.run.id, 'tool-call-stable-6', {
      output: expected
    })
    if (output === CANARY) {
      expect(JSON.stringify(hostMocks.child.postMessage.mock.calls)).not.toContain(CANARY)
      expect(JSON.stringify(persistToolCallResult.mock.calls)).not.toContain(CANARY)
    }
    await completeRun(payload, execution)
  })

  it('returns completed tool-call results without repeating their side effect', async () => {
    const payload = startPayload()
    const loadToolCallResult = vi.fn().mockResolvedValue({ output: { recovered: true } })
    const host = new PiAgentRuntimeHost({
      loadToolCallResult,
      beginToolCall: vi.fn()
    })
    const execution = host.execute(payload)
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, { path: 'release-notes.md' })
    })
    await settleAsyncWork()
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({ output: { recovered: true } })
    })
    expect(loadToolCallResult).toHaveBeenCalledWith(
      payload.run.id,
      'tool-call-stable-6',
      'tool.inspect'
    )
    expect(toolMocks.executeTool).not.toHaveBeenCalled()
    await completeRun(payload, execution)
  })

  it('returns a persistence failure instead of reporting an unrecorded tool call as successful', async () => {
    const payload = startPayload()
    const persistToolCallResult = vi.fn().mockRejectedValue(new Error(CANARY))
    const host = new PiAgentRuntimeHost({ persistToolCallResult })
    const execution = host.execute(payload)
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, { path: 'release-notes.md' })
    })
    await settleAsyncWork()
    expect(persistToolCallResult).toHaveBeenCalledWith(payload.run.id, 'tool-call-stable-6', {
      output: { ready: true }
    })
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: {
        requestId: 'tool-request-stable-5',
        runId: payload.run.id,
        error: 'TOOL_EXECUTION_FAILED: Tool execution failed.'
      }
    })
    expect(JSON.stringify(runtimeLoggerMocks.error.mock.calls)).not.toContain(CANARY)

    expect(host.cancel(payload.run.id)).toBe(true)
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.cancelled',
      runId: payload.run.id
    })
    await expect(execution).rejects.toThrow('AI_RUN_CANCELLED: AI run was cancelled.')
  })

  it('surfaces a started but uncompleted tool call as interrupted without executing it', async () => {
    const payload = startPayload()
    const beginToolCall = vi.fn().mockResolvedValue('interrupted')
    const host = new PiAgentRuntimeHost({ beginToolCall })
    const execution = host.execute(payload)
    const executionAssertion = expect(execution).rejects.toThrow(
      'INTERRUPTED_TOOL_CALL:tool-call-stable-6'
    )
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, { path: 'release-notes.md' })
    })
    await settleAsyncWork()
    expect(beginToolCall).toHaveBeenCalledWith(
      payload.run.id,
      'tool-call-stable-6',
      'tool.inspect',
      { path: 'release-notes.md' }
    )
    expect(hostMocks.child.postMessage).toHaveBeenCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({ error: 'INTERRUPTED_TOOL_CALL:tool-call-stable-6' })
    })
    expect(toolMocks.executeTool).not.toHaveBeenCalled()
    await executionAssertion
  })

  it('uses only registry-declared stable error codes in tool responses', async () => {
    const payload = startPayload()
    toolMocks.executeTool.mockResolvedValue({
      success: false,
      error: CANARY,
      errorCode: 'MCP_TOOL_FAILED'
    })
    const host = new PiAgentRuntimeHost()
    const execution = host.execute(payload)
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, { path: CANARY })
    })
    await settleAsyncWork()

    const response = hostMocks.child.postMessage.mock.calls.at(-1)?.[0]
    expect(response).toEqual({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: {
        requestId: 'tool-request-stable-5',
        runId: payload.run.id,
        error: 'MCP_TOOL_FAILED: MCP tool execution failed.'
      }
    })
    expect(JSON.stringify(response)).not.toContain(CANARY)
    await completeRun(payload, execution)
  })

  it('projects callback and persisted-result failures without retaining raw text', async () => {
    const payload = startPayload()
    const loadToolCallResult = vi.fn().mockResolvedValue({ error: CANARY })
    const host = new PiAgentRuntimeHost({ loadToolCallResult })
    const execution = host.execute(payload)
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, {})
    })
    await settleAsyncWork()

    const response = hostMocks.child.postMessage.mock.calls.at(-1)?.[0]
    expect(response).toEqual({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: {
        requestId: 'tool-request-stable-5',
        runId: payload.run.id,
        error: 'TOOL_EXECUTION_FAILED: Tool execution failed.'
      }
    })
    expect(JSON.stringify(response)).not.toContain(CANARY)
    expect(loadToolCallResult).toHaveBeenCalledWith(
      payload.run.id,
      'tool-call-stable-6',
      'tool.inspect'
    )
    await completeRun(payload, execution)
  })

  it('fails closed without executing a tool when durable-result loading or migration fails', async () => {
    const payload = startPayload()
    const loadToolCallResult = vi.fn().mockRejectedValue(new Error(CANARY))
    const beginToolCall = vi.fn()
    const host = new PiAgentRuntimeHost({ loadToolCallResult, beginToolCall })
    const execution = host.execute(payload)
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, {})
    })
    await settleAsyncWork()

    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: {
        requestId: 'tool-request-stable-5',
        runId: payload.run.id,
        error: 'TOOL_EXECUTION_FAILED: Tool execution failed.'
      }
    })
    expect(loadToolCallResult).toHaveBeenCalledWith(
      payload.run.id,
      'tool-call-stable-6',
      'tool.inspect'
    )
    expect(beginToolCall).not.toHaveBeenCalled()
    expect(toolMocks.executeTool).not.toHaveBeenCalled()
    expect(JSON.stringify(hostMocks.child.postMessage.mock.calls)).not.toContain(CANARY)
    await completeRun(payload, execution)
  })

  it('propagates run cancellation through the tool AbortSignal', async () => {
    const payload = startPayload()
    let completeTool:
      | ((value: { success: true; output: Record<string, never> }) => void)
      | undefined
    let toolSignal: AbortSignal | undefined
    toolMocks.executeTool.mockImplementation(
      async (_toolId: string, _input: unknown, context: { signal: AbortSignal }) => {
        toolSignal = context.signal
        return await new Promise<{ success: true; output: Record<string, never> }>((resolve) => {
          completeTool = resolve
        })
      }
    )
    const host = new PiAgentRuntimeHost()
    const execution = host.execute(payload)
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, { path: 'release-notes.md' })
    })
    await settleAsyncWork()
    expect(toolSignal).toBeDefined()
    expect(host.cancel(payload.run.id)).toBe(true)
    expect(toolSignal?.aborted).toBe(true)
    completeTool?.({ success: true, output: {} })
    await settleAsyncWork()
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.completed',
      payload: {
        runId: payload.run.id,
        output: 'forged completion after cancellation',
        usage: { promptTokens: 3, completionTokens: 5, totalTokens: 8 }
      }
    })
    await expect(execution).rejects.toThrow('AI_RUN_CANCELLED: AI run was cancelled.')
  })

  it('worker 迟迟不 ready 时,start() 有界失败并杀掉子进程', async () => {
    // A worker that spawns but never posts runtime.ready: the process is alive so no 'exit'
    // fires, and execute() awaits start() before arming its own run timeout, so before #766
    // this promise stayed pending forever.
    hostMocks.fork.mockImplementationOnce(() => hostMocks.child)

    const host = new PiAgentRuntimeHost()
    const started = host.start()
    const assertion = expect(started).rejects.toThrow(/not ready within/i)

    await vi.advanceTimersByTimeAsync(30_000)
    await assertion

    expect(hostMocks.child.kill).toHaveBeenCalled()
  })

  it('正常 ready 的 worker 不会被这个定时器杀掉', async () => {
    // The control: a fix written as "always kill after 30s" would fail here.
    const host = new PiAgentRuntimeHost()

    await expect(host.start()).resolves.toBeUndefined()

    await vi.advanceTimersByTimeAsync(60_000)

    expect(hostMocks.child.kill).not.toHaveBeenCalled()
  })
})
