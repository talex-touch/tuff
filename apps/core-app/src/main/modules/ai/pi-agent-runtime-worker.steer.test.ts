import type {
  PiRuntimeChildMessage,
  PiRuntimeParentMessage,
  PiRuntimeStartPayload
} from './pi-agent-runtime-protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PI_RUNTIME_PROTOCOL_VERSION } from './pi-agent-runtime-protocol'

interface FakeParentPort {
  listeners: Array<(event: { data: PiRuntimeChildMessage }) => void>
  sent: PiRuntimeParentMessage[]
  on: (event: 'message', listener: (event: { data: PiRuntimeChildMessage }) => void) => void
  postMessage: (message: PiRuntimeParentMessage) => void
  deliver: (message: PiRuntimeChildMessage) => void
}

function createFakeParentPort(): FakeParentPort {
  const port: FakeParentPort = {
    listeners: [],
    sent: [],
    on(_event, listener) {
      port.listeners.push(listener)
    },
    postMessage(message) {
      port.sent.push(message)
    },
    deliver(message) {
      for (const listener of port.listeners) listener({ data: message })
    }
  }
  return port
}

function createStartPayload(): PiRuntimeStartPayload {
  const now = Date.now()
  return {
    run: {
      id: 'run-steer-worker-1',
      sessionId: 'session-steer-1',
      objective: 'Create a login page',
      profileId: 'default-pi',
      runtimeProvider: 'pi-core',
      cwd: '/workspace',
      status: 'running',
      createdAt: now,
      updatedAt: now
    },
    request: {
      objective: 'Create a login page',
      sessionId: 'session-steer-1',
      approved: true,
      timeoutMs: 30_000
    },
    profile: {
      id: 'default-pi',
      name: 'Tuff Pi Coordinator',
      description: 'Test profile',
      runtimeProvider: 'pi-core',
      enabled: true,
      modelPreference: [],
      allowedToolIds: ['tool.read'],
      enabledSkillIds: [],
      permissionPolicy: { mode: 'preauthorized', allowedPermissions: ['*'] },
      timeoutMs: 30_000,
      createdAt: now,
      updatedAt: now
    },
    tools: [
      {
        id: 'tool.read',
        name: 'Read',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
      }
    ],
    history: [],
    budget: { maxSteps: 6, maxChildRuns: 0, maxConcurrency: 1 }
  }
}

async function waitFor<T>(
  predicate: () => T | undefined,
  describeState?: () => string,
  timeoutMs = 4000
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = predicate()
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  const detail = describeState ? ` (${describeState()})` : ''
  throw new Error(`Timed out waiting for worker message${detail}`)
}

describe('pi-agent-runtime-worker mid-turn steer delivery', () => {
  const processWithPort = process as unknown as { parentPort?: unknown }
  const originalParentPort = processWithPort.parentPort

  afterEach(() => {
    processWithPort.parentPort = originalParentPort
    vi.resetModules()
  })

  it('injects synced steers at the next tool boundary, honors edits before drain, emits steer_consumed, and ignores stale re-syncs', async () => {
    const port = createFakeParentPort()
    processWithPort.parentPort = port
    vi.resetModules()
    await import('./pi-agent-runtime-worker')

    expect(port.sent.some((msg) => msg.type === 'runtime.ready')).toBe(true)

    const payload = createStartPayload()
    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.start',
      payload
    })

    // Step 1 model request -> returns a tool call.
    const modelReq1 = await waitFor(() =>
      port.sent.find((msg) => msg.type === 'model.request' && msg.payload.step === 1)
    )
    if (modelReq1.type !== 'model.request') throw new Error('expected model.request')

    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'model.response',
      payload: {
        requestId: modelReq1.payload.requestId,
        runId: payload.run.id,
        text: '',
        toolCalls: [{ id: 'tc-1', name: 'tool.read', arguments: { path: 'login.html' } }]
      }
    })

    // Wait until the worker requests tool execution.
    const toolReq = await waitFor(() => port.sent.find((msg) => msg.type === 'tool.request'))
    if (toolReq.type !== 'tool.request') throw new Error('expected tool.request')

    // While tool.read is running, user queues a steer and then edits it before the tool completes.
    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.steer.sync',
      runId: payload.run.id,
      items: [{ id: 'steer-1', text: 'first draft steer', createdAt: 100 }]
    })
    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.steer.sync',
      runId: payload.run.id,
      items: [{ id: 'steer-1', text: '做成一个单页面 html', createdAt: 100 }]
    })

    // Complete tool execution -> agent loop drains steering queue right before step 2 model call.
    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'tool.response',
      payload: {
        requestId: toolReq.payload.requestId,
        runId: payload.run.id,
        output: 'existing content'
      }
    })

    const modelReq2 = await waitFor(() =>
      port.sent.find((msg) => msg.type === 'model.request' && msg.payload.step === 2)
    )
    if (modelReq2.type !== 'model.request') throw new Error('expected step 2 model.request')

    // Verify the edited steer arrived right after the tool result in step 2 messages.
    const step2Messages = modelReq2.payload.messages as Array<{
      role?: string
      steerId?: string
      content?: Array<{ type?: string; text?: string }>
    }>
    const injected = step2Messages.find((msg) => msg.steerId === 'steer-1')
    expect(injected).toBeDefined()
    expect(injected?.content?.[0]?.text).toBe('做成一个单页面 html')

    // Verify worker emitted steer_consumed so Main can clear it from the queue deck.
    const consumedEvent = await waitFor(() =>
      port.sent.find((msg) => msg.type === 'run.event' && msg.payload.type === 'steer_consumed')
    )
    if (consumedEvent.type !== 'run.event') throw new Error('expected steer_consumed event')
    expect(consumedEvent.payload.payload).toMatchObject({
      steerId: 'steer-1',
      text: '做成一个单页面 html',
      createdAt: 100
    })

    // A stale sync re-sending already-consumed steer-1 must NOT cause a 3rd model step.
    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.steer.sync',
      runId: payload.run.id,
      items: [{ id: 'steer-1', text: '做成一个单页面 html', createdAt: 100 }]
    })

    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'model.response',
      payload: {
        requestId: modelReq2.payload.requestId,
        runId: payload.run.id,
        text: 'Done: single-page HTML created.'
      }
    })

    const completed = await waitFor(() => port.sent.find((msg) => msg.type === 'run.completed'))
    if (completed.type !== 'run.completed') throw new Error('expected run.completed')
    expect(completed.payload.output).toBe('Done: single-page HTML created.')
    expect(
      port.sent.filter((msg) => msg.type === 'model.request').map((msg) => msg.payload.step)
    ).toEqual([1, 2])
  })

  it('continues the loop when a steer arrives during a text-only step and honors cancellation via empty sync', async () => {
    const port = createFakeParentPort()
    processWithPort.parentPort = port
    vi.resetModules()
    await import('./pi-agent-runtime-worker')

    const payload = createStartPayload()
    payload.run.id = 'run-steer-worker-2'
    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.start',
      payload
    })

    const modelReq1 = await waitFor(
      () => port.sent.find((msg) => msg.type === 'model.request' && msg.payload.step === 1),
      () => JSON.stringify(port.sent.map((m) => m.type))
    )
    if (modelReq1.type !== 'model.request') throw new Error('expected step 1 model.request')

    // User queues steer A, cancels it, then queues steer B while the model is still streaming.
    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.steer.sync',
      runId: payload.run.id,
      items: [{ id: 'steer-a', text: 'cancelled steer', createdAt: 200 }]
    })
    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.steer.sync',
      runId: payload.run.id,
      items: []
    })
    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'run.steer.sync',
      runId: payload.run.id,
      items: [{ id: 'steer-b', text: '顺便加个深色模式开关', createdAt: 210 }]
    })

    // Step 1 finishes without calling tools -> steer-b should still be drained into step 2.
    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'model.response',
      payload: {
        requestId: modelReq1.payload.requestId,
        runId: payload.run.id,
        text: 'Initial login page ready.'
      }
    })

    const modelReq2 = await waitFor(
      () => port.sent.find((msg) => msg.type === 'model.request' && msg.payload.step === 2),
      () => JSON.stringify(port.sent.map((m) => m.type))
    )
    if (modelReq2.type !== 'model.request') throw new Error('expected step 2 model.request')

    const step2Messages = modelReq2.payload.messages as Array<{
      steerId?: string
      content?: Array<{ type?: string; text?: string }>
    }>
    expect(step2Messages.find((msg) => msg.steerId === 'steer-a')).toBeUndefined()
    expect(step2Messages.find((msg) => msg.steerId === 'steer-b')?.content?.[0]?.text).toBe(
      '顺便加个深色模式开关'
    )

    port.deliver({
      protocolVersion: PI_RUNTIME_PROTOCOL_VERSION,
      type: 'model.response',
      payload: {
        requestId: modelReq2.payload.requestId,
        runId: payload.run.id,
        text: 'Added dark mode toggle.'
      }
    })

    const completed = await waitFor(
      () => port.sent.find((msg) => msg.type === 'run.completed'),
      () => JSON.stringify(port.sent.map((m) => m.type))
    )
    if (completed.type !== 'run.completed') throw new Error('expected run.completed')
    expect(completed.payload.output).toBe('Added dark mode toggle.')
  })
})
