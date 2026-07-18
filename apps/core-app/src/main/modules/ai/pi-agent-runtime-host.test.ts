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

import { PiAgentRuntimeHost } from './pi-agent-runtime-host'
import { AgentPermission } from '@talex-touch/utils'

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
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() }
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
    child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })
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

  afterEach(() => {
    vi.useRealTimers()
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
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
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
        signal: expect.any(AbortSignal)
      }
    )
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: {
        requestId: 'tool-request-stable-5',
        runId: payload.run.id,
        output: { ready: true }
      }
    })

    expect(host.cancel(payload.run.id)).toBe(true)
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'run.cancel',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      runId: payload.run.id
    })
    hostMocks.emit('message', {
      type: 'run.cancelled',
      runId: payload.run.id,
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION
    })

    await expect(execution).rejects.toThrow('Run cancelled')
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
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({
        error: expect.stringContaining(
          `Tool permissions are not preauthorized: ${AgentPermission.SYSTEM_EXEC}`
        )
      })
    })
    expect(toolMocks.executeTool).not.toHaveBeenCalled()
    await completeRun(stdioPayload, stdioExecution)

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
    const execution = host.execute(payload)
    await settleAsyncWork()

    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, { path: 'different-notes.md' }, { toolCallId: 'mismatch' })
    })
    await settleAsyncWork()
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({ error: expect.stringContaining('APPROVAL_REQUIRED:') })
    })

    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, approvedInput, { toolCallId: 'approved-once' })
    })
    await settleAsyncWork()
    expect(toolMocks.executeTool).toHaveBeenCalledTimes(1)

    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.request',
      payload: toolRequest(payload, approvedInput, { toolCallId: 'approved-replay' })
    })
    await settleAsyncWork()
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({ error: expect.stringContaining('APPROVAL_REQUIRED:') })
    })
    expect(toolMocks.executeTool).toHaveBeenCalledTimes(1)
    await completeRun(payload, execution)
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
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({
        error: expect.stringContaining(
          `Tool permissions are not preauthorized: ${AgentPermission.SYSTEM_EXEC}`
        )
      })
    })
    expect(toolMocks.executeTool).not.toHaveBeenCalled()
    await completeRun(payload, execution)
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
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({
        error: expect.stringContaining('outside the automation policy')
      })
    })
    expect(toolMocks.executeTool).not.toHaveBeenCalled()
    await completeRun(payload, execution)
  })

  it('redacts sensitive tool output and caps returned text before crossing the worker boundary', async () => {
    const payload = startPayload()
    const longText = 'x'.repeat(20_000)
    toolMocks.executeTool.mockResolvedValue({
      success: true,
      output: { apiToken: 'secret-value', contents: longText }
    })
    const host = new PiAgentRuntimeHost()
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
      payload: expect.objectContaining({
        output: { apiToken: '[redacted]', contents: 'x'.repeat(16_000) }
      })
    })
    await completeRun(payload, execution)
  })

  it('returns completed tool-call results without repeating their side effect', async () => {
    const payload = startPayload()
    const host = new PiAgentRuntimeHost({
      loadToolCallResult: vi.fn().mockResolvedValue({ output: { recovered: true } }),
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
    expect(toolMocks.executeTool).not.toHaveBeenCalled()
    await completeRun(payload, execution)
  })

  it('returns a persistence failure instead of reporting an unrecorded tool call as successful', async () => {
    const payload = startPayload()
    const persistToolCallResult = vi.fn().mockRejectedValue(new Error('durable write failed'))
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
        error: 'Tool call result could not be persisted: durable write failed'
      }
    })

    expect(host.cancel(payload.run.id)).toBe(true)
    hostMocks.emit('message', {
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.cancelled',
      runId: payload.run.id
    })
    await expect(execution).rejects.toThrow('Run cancelled')
  })

  it('surfaces a started but uncompleted tool call as interrupted without executing it', async () => {
    const payload = startPayload()
    const beginToolCall = vi.fn().mockResolvedValue('interrupted')
    const host = new PiAgentRuntimeHost({ beginToolCall })
    const execution = host.execute(payload)
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
    expect(hostMocks.child.postMessage).toHaveBeenLastCalledWith({
      type: 'tool.response',
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      payload: expect.objectContaining({ error: 'INTERRUPTED_TOOL_CALL:tool-call-stable-6' })
    })
    expect(toolMocks.executeTool).not.toHaveBeenCalled()
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
    await completeRun(payload, execution)
  })
})
