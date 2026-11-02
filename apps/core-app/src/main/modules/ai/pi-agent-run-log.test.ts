import type { PiRuntimeRunRecord } from './pi-agent-runtime-protocol'
import { describe, expect, it } from 'vitest'
import { buildObjectivePrompt, planRunResume } from './pi-agent-run-log'

const PROMPT = buildObjectivePrompt('Read a.txt and say what is in it.', undefined)

const usage = (totalTokens: number) => ({
  promptTokens: totalTokens,
  completionTokens: 0,
  totalTokens,
  cost: 0.001
})

function user(): PiRuntimeRunRecord {
  return {
    message: { role: 'user', content: [{ type: 'text', text: PROMPT }] },
    modelSteps: 0,
    toolCalls: 0,
    usage: usage(0),
    costKnown: true
  }
}

/** An assistant turn that asked for `ids`, written as model step `step` having spent `tokens`. */
function turn(step: number, ids: string[], tokens: number): PiRuntimeRunRecord {
  return {
    message: {
      role: 'assistant',
      stopReason: ids.length > 0 ? 'toolUse' : 'stop',
      content: ids.map((id) => ({ type: 'toolCall', id, name: 'file.read', arguments: {} }))
    },
    modelSteps: step,
    toolCalls: step - 1,
    usage: usage(tokens),
    costKnown: true
  }
}

function result(id: string, toolCalls: number, tokens: number): PiRuntimeRunRecord {
  return {
    message: { role: 'toolResult', toolCallId: id, content: [{ type: 'text', text: 'x' }] },
    modelSteps: 1,
    toolCalls,
    usage: usage(tokens),
    costKnown: true
  }
}

describe('planRunResume', () => {
  it('continues from the last tool result when every call of the last turn was answered', () => {
    const records = [user(), turn(1, ['a'], 15), result('a', 1, 15)]
    const plan = planRunResume(records, PROMPT)

    expect(plan).toMatchObject({ keepCount: 3, counters: { modelSteps: 1, toolCalls: 1 } })
    expect(plan?.messages).toHaveLength(3)
    expect(plan?.replay).toBeUndefined()
  })

  it('replays the last turn, keeping nothing of it in the log, when the run stopped before any call ran', () => {
    const records = [user(), turn(1, ['a', 'b'], 15)]
    const plan = planRunResume(records, PROMPT)

    expect(plan?.keepCount).toBe(1)
    expect(plan?.messages).toHaveLength(1)
    expect(plan?.replay).toBe(records[1].message)
    // The replay is the model request that produced the turn: step 1, and 15 tokens already charged.
    expect(plan?.counters).toMatchObject({ modelSteps: 0 })
    expect(plan?.counters.usage.totalTokens).toBe(15)
  })

  it('replays the last turn when the run stopped between two of its tool results', () => {
    const records = [user(), turn(1, ['a', 'b'], 15), result('a', 1, 15)]
    const plan = planRunResume(records, PROMPT)

    expect(plan?.keepCount).toBe(1)
    expect(plan?.replay).toBe(records[1].message)
  })

  it('replays the second turn, not the first, when the run stopped inside it', () => {
    const records = [
      user(),
      turn(1, ['a'], 15),
      result('a', 1, 15),
      turn(2, ['b'], 30)
    ]
    const plan = planRunResume(records, PROMPT)

    expect(plan?.keepCount).toBe(3)
    expect(plan?.messages).toHaveLength(3)
    expect(plan?.replay).toBe(records[3].message)
    expect(plan?.counters).toMatchObject({ modelSteps: 1 })
    expect(plan?.counters.usage.totalTokens).toBe(30)
  })

  it('replays a final answer that was logged but whose run had not finished', () => {
    const records = [user(), turn(1, ['a'], 15), result('a', 1, 15), turn(2, [], 30)]
    const plan = planRunResume(records, PROMPT)

    expect(plan?.keepCount).toBe(3)
    expect(plan?.replay).toBe(records[3].message)
  })

  it.each([
    ['an empty log', []],
    ['a log that never got past the prompt', [user()]]
  ])('has nothing to resume from in %s', (_name, records) => {
    expect(planRunResume(records as PiRuntimeRunRecord[], PROMPT)).toBeNull()
  })

  it('refuses a log that was made for another prompt', () => {
    const records = [user(), turn(1, ['a'], 15), result('a', 1, 15)]
    expect(planRunResume(records, 'A different job entirely.')).toBeNull()
  })

  it.each([
    ['a tool result nobody asked for', () => [user(), turn(1, ['a'], 15), result('zzz', 1, 15)]],
    ['a tool result straight after the prompt', () => [user(), result('a', 1, 0)]],
    [
      'two assistant turns in a row',
      () => [user(), turn(1, ['a'], 15), turn(2, ['b'], 30), result('b', 2, 30)]
    ],
    [
      'a new turn while the last one still had open calls',
      () => [user(), turn(1, ['a', 'b'], 15), result('a', 1, 15), turn(2, [], 30)]
    ],
    [
      'a turn that failed',
      () => {
        const failed = turn(1, [], 15)
        ;(failed.message as { stopReason: string }).stopReason = 'error'
        return [user(), failed]
      }
    ],
    [
      'a turn written at step 0',
      () => [user(), { ...turn(1, ['a'], 15), modelSteps: 0 }, result('a', 1, 15)]
    ],
    [
      'a record without counters',
      () => [user(), { ...turn(1, ['a'], 15), usage: undefined as never }, result('a', 1, 15)]
    ]
  ])('refuses %s', (_name, build) => {
    expect(planRunResume(build(), PROMPT)).toBeNull()
  })
})
