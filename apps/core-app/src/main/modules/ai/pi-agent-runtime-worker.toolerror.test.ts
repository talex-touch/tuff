import type {
  PiRuntimeModelRequest,
  PiRuntimeParentMessage,
  PiRuntimeStartPayload
} from './pi-agent-runtime-protocol'
import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * A tool that fails is that call's result, not the run's failure: the real worker and the real
 * agent loop, with the host played by the test. The model sees the error as the tool result and
 * answers anyway - which is what a run that hit a denied write and then pasted the code looks like.
 */
const wire = vi.hoisted(() => {
  const state = {
    toWorker: null as ((event: { data: unknown }) => void) | null,
    onPost: null as ((message: unknown) => void) | null
  }
  ;(process as unknown as { parentPort: unknown }).parentPort = {
    on: (event: string, listener: (event: { data: unknown }) => void) => {
      if (event === 'message') state.toWorker = listener
    },
    postMessage: (message: unknown) => state.onPost?.(message)
  }
  return state
})

const BUDGET = { maxSteps: 10, maxToolCalls: 20, maxChildRuns: 0, maxConcurrency: 1 }
const USAGE = { promptTokens: 10, completionTokens: 5, totalTokens: 15, cost: 0.001 }
const DENIED = 'TOOL_RESOURCE_ACCESS_DENIED: Access to the requested resource was denied.'

function startPayload(runId: string, maxToolCalls = 20): PiRuntimeStartPayload {
  return {
    run: { id: runId, sessionId: 'session_1' } as PiRuntimeStartPayload['run'],
    request: { objective: 'Write a page.' } as PiRuntimeStartPayload['request'],
    profile: {
      systemPrompt: 'be brief',
      modelPreference: []
    } as unknown as PiRuntimeStartPayload['profile'],
    tools: [
      {
        id: 'file.write',
        name: 'Write file',
        description: 'Writes a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
      }
    ],
    history: [],
    budget: { ...BUDGET, maxToolCalls }
  }
}

type Outcome = { kind: 'completed'; output: string } | { kind: 'failed'; error: string }

/** Plays the host: every tool answers with `toolError`, every model request from `model`. */
async function play(
  payload: PiRuntimeStartPayload,
  toolError: string,
  model: (request: PiRuntimeModelRequest, index: number) => Record<string, unknown>
): Promise<Outcome> {
  const send = (message: Record<string, unknown>) =>
    wire.toWorker?.({ data: { ...message, protocolVersion: 1 } })
  const finished = Promise.withResolvers<Outcome>()
  let requests = 0
  wire.onPost = (raw) => {
    const message = raw as PiRuntimeParentMessage
    if (message.type === 'model.request') {
      const index = requests++
      queueMicrotask(() =>
        send({
          type: 'model.response',
          payload: {
            requestId: message.payload.requestId,
            runId: message.payload.runId,
            usage: USAGE,
            ...model(message.payload, index)
          }
        })
      )
    } else if (message.type === 'tool.request') {
      queueMicrotask(() =>
        send({
          type: 'tool.response',
          payload: {
            requestId: message.payload.requestId,
            runId: message.payload.runId,
            error: toolError
          }
        })
      )
    } else if (message.type === 'run.completed') {
      finished.resolve({ kind: 'completed', output: message.payload.output })
    } else if (message.type === 'run.failed') {
      finished.resolve({ kind: 'failed', error: message.error })
    }
  }
  send({ type: 'run.start', payload })
  const outcome = await finished.promise
  wire.onPost = null
  return outcome
}

const triesToWriteThenAnswers = (_request: PiRuntimeModelRequest, index: number) =>
  index === 0
    ? { toolCalls: [{ name: 'file.write', arguments: { path: 'pelican.html' } }] }
    : { text: 'Here is the full HTML, since I could not save it.' }

beforeAll(async () => {
  await import('./pi-agent-runtime-worker')
})

describe('a run whose tool call failed', () => {
  it('completes when the model goes on to answer', async () => {
    const outcome = await play(startPayload('run_denied'), DENIED, triesToWriteThenAnswers)

    expect(outcome).toEqual({
      kind: 'completed',
      output: 'Here is the full HTML, since I could not save it.'
    })
  })

  it('hands the model the error as the tool result so it can decide what to do', async () => {
    const seen: unknown[] = []
    await play(startPayload('run_sees_error'), DENIED, (request, index) => {
      seen.push(...request.messages)
      return triesToWriteThenAnswers(request, index)
    })

    const result = seen.find((message) => (message as { role?: string }).role === 'toolResult')
    expect(JSON.stringify(result)).toContain('TOOL_RESOURCE_ACCESS_DENIED')
  })

  it('still fails when the tool error is approval: that one waits for the user', async () => {
    const outcome = await play(
      startPayload('run_approval'),
      'APPROVAL_REQUIRED: tool needs approval',
      triesToWriteThenAnswers
    )

    expect(outcome).toEqual({ kind: 'failed', error: 'APPROVAL_REQUIRED: tool needs approval' })
  })

  it('still fails when the model keeps calling tools past its budget', async () => {
    // The tool budget is breached on the second call. The model never stops asking, so the run
    // goes on until the step budget ends it; either way it is a budget failure, not a completion.
    const outcome = await play(startPayload('run_budget', 1), DENIED, () => ({
      toolCalls: [{ name: 'file.write', arguments: { path: 'again.html' } }]
    }))

    expect(outcome.kind).toBe('failed')
    expect((outcome as { error: string }).error).toMatch(/^Execution budget exceeded: max/)
  })
})
