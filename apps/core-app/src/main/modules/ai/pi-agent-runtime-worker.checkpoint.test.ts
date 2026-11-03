import type {
  PiRuntimeModelRequest,
  PiRuntimeParentMessage,
  PiRuntimeResume,
  PiRuntimeRunRecord,
  PiRuntimeStartPayload,
  PiRuntimeToolRequest
} from './pi-agent-runtime-protocol'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildObjectivePrompt, planRunResume } from './pi-agent-run-log'

/**
 * The real worker and the real agent loop, with the host played by the test: it answers the worker's
 * model and tool requests from a script and records everything the worker posts. Nothing here could
 * reach a model.
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
const OBJECTIVE = 'Read a.txt and say what is in it.'
const FILE_TEXT = 'the-file-contents'

function startPayload(
  overrides: Partial<PiRuntimeStartPayload> = {},
  runId = 'run_log'
): PiRuntimeStartPayload {
  return {
    run: { id: runId, sessionId: 'session_1' } as PiRuntimeStartPayload['run'],
    request: { objective: OBJECTIVE } as PiRuntimeStartPayload['request'],
    profile: {
      systemPrompt: 'be brief',
      modelPreference: []
    } as unknown as PiRuntimeStartPayload['profile'],
    tools: [
      {
        id: 'file.read',
        name: 'Read file',
        description: 'Reads a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
      },
      {
        id: 'file.list',
        name: 'List files',
        description: 'Lists files',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
      }
    ],
    history: [],
    budget: BUDGET,
    ...overrides
  }
}

interface Played {
  modelRequests: PiRuntimeModelRequest[]
  toolRequests: PiRuntimeToolRequest[]
  records: PiRuntimeRunRecord[]
  completed: { output: string; usage: { totalTokens: number } } | undefined
}

/** Starts a run and plays the host until the worker reports the run over (or fails it). */
async function play(
  payload: PiRuntimeStartPayload,
  model: (request: PiRuntimeModelRequest, index: number) => Record<string, unknown>
): Promise<Played> {
  const played: Played = { modelRequests: [], toolRequests: [], records: [], completed: undefined }
  const send = (message: Record<string, unknown>) =>
    wire.toWorker?.({ data: { ...message, protocolVersion: 1 } })
  const finished = Promise.withResolvers<void>()
  wire.onPost = (raw) => {
    const message = raw as PiRuntimeParentMessage
    switch (message.type) {
      case 'model.request': {
        const index = played.modelRequests.push(message.payload) - 1
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
        return
      }
      case 'tool.request':
        played.toolRequests.push(message.payload)
        queueMicrotask(() =>
          send({
            type: 'tool.response',
            payload: {
              requestId: message.payload.requestId,
              runId: message.payload.runId,
              output: `${FILE_TEXT}:${message.payload.toolCallId.slice(-4)}`
            }
          })
        )
        return
      case 'run.record':
        played.records.push(message.payload.record)
        return
      case 'run.completed':
        played.completed = message.payload
        finished.resolve()
        return
      case 'run.failed':
        finished.reject(new Error(`run failed: ${message.error}`))
    }
  }
  send({ type: 'run.start', payload })
  await finished.promise
  wire.onPost = null
  return played
}

const roles = (records: PiRuntimeRunRecord[]) =>
  records.map((record) => (record.message as { role: string }).role)

const readsTwoThenAnswers = (_request: PiRuntimeModelRequest, index: number) =>
  index === 0
    ? {
        toolCalls: [
          { name: 'file.read', arguments: { path: 'a.txt' } },
          { name: 'file.list', arguments: { path: '.' } }
        ]
      }
    : { text: `it says ${FILE_TEXT}` }

/** What the main process does with the log: plan the resume from the first `count` records. */
function resumeFrom(records: PiRuntimeRunRecord[], count: number): PiRuntimeResume {
  const plan = planRunResume(records.slice(0, count), buildObjectivePrompt(OBJECTIVE, undefined))
  if (!plan) throw new Error('no plan')
  return { messages: plan.messages, replay: plan.replay, counters: plan.counters }
}

beforeAll(async () => {
  await import('./pi-agent-runtime-worker')
})

describe('a run whose messages are logged and resumed', () => {
  it('logs every message as it ends, with the counters as they stood', async () => {
    const played = await play(startPayload(), readsTwoThenAnswers)

    expect(played.completed?.output).toBe(`it says ${FILE_TEXT}`)
    expect(roles(played.records)).toEqual([
      'user',
      'assistant',
      'toolResult',
      'toolResult',
      'assistant'
    ])
    expect(played.records[1]).toMatchObject({ modelSteps: 1, toolCalls: 0 })
    // `parallel` batches finish their calls together: the count is the whole batch by the first result.
    expect(played.records[3]).toMatchObject({ modelSteps: 1, toolCalls: 2 })
    expect(played.records[4]).toMatchObject({ modelSteps: 2, toolCalls: 2 })
    expect(played.records[4].usage.totalTokens).toBe(30)
    expect(JSON.stringify(played.records[2].message)).toContain(FILE_TEXT)
  })

  it('continues from the last result: asks the model for the next step and runs no tool again', async () => {
    const first = await play(startPayload({}, 'run_source'), readsTwoThenAnswers)
    const resume = resumeFrom(first.records, 4)

    const resumed = await play(startPayload({ resume }, 'run_resumed'), () => ({
      text: `it says ${FILE_TEXT}`
    }))

    expect(resumed.toolRequests).toEqual([])
    expect(resumed.modelRequests).toHaveLength(1)
    expect(resumed.modelRequests[0].step).toBe(2)
    expect(
      resumed.modelRequests[0].messages.map((message) => (message as { role: string }).role)
    ).toEqual(['user', 'assistant', 'toolResult', 'toolResult'])
    expect(resumed.completed?.usage.totalTokens).toBe(first.records[3].usage.totalTokens + 15)
  })

  it('replays the turn it stopped on instead of asking the model again, and runs its calls', async () => {
    const first = await play(startPayload({}, 'run_replay_source'), readsTwoThenAnswers)
    // Stopped right after the assistant turn was logged: its two calls were never answered.
    const resume = resumeFrom(first.records, 2)

    const resumed = await play(startPayload({ resume }, 'run_replayed'), () => ({
      text: `it says ${FILE_TEXT}`
    }))

    // The only model request is the one after the calls: the turn itself came from the log.
    expect(resumed.modelRequests).toHaveLength(1)
    expect(resumed.modelRequests[0].step).toBe(2)
    expect(resumed.toolRequests.map((request) => request.toolId).sort()).toEqual([
      'file.list',
      'file.read'
    ])
    // The calls are the very ones the model chose the first time, with the same ids.
    const asked = (first.records[1].message as { content: Array<{ id: string }> }).content.map(
      (block) => block.id
    )
    expect(resumed.toolRequests.map((request) => request.toolCallId).sort()).toEqual(
      [...asked].sort()
    )
    expect(resumed.completed?.output).toBe(`it says ${FILE_TEXT}`)
    // The replayed turn was charged once, when it was first received.
    expect(resumed.completed?.usage.totalTokens).toBe(first.records[1].usage.totalTokens + 15)
  })

  it('keeps the step budget for the whole run across a resume', async () => {
    const first = await play(startPayload({}, 'run_budget_source'), readsTwoThenAnswers)
    const resume = resumeFrom(first.records, 4)

    // One step is already spent, so a budget of one step leaves none for the continuation.
    await expect(
      play(startPayload({ resume, budget: { ...BUDGET, maxSteps: 1 } }, 'run_budget'), () => ({
        text: 'unreachable'
      }))
    ).rejects.toThrow('run failed')
  })

  it('does not log the turns it replays or the messages it resumed from a second time', async () => {
    const first = await play(startPayload({}, 'run_dup_source'), readsTwoThenAnswers)
    const resume = resumeFrom(first.records, 4)

    const resumed = await play(startPayload({ resume }, 'run_dup'), () => ({ text: 'done' }))

    // Only what the resumed part produced: the final assistant turn.
    expect(roles(resumed.records)).toEqual(['assistant'])
  })
})
