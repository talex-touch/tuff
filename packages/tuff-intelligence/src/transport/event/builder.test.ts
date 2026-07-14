import type { ITuffTransport, TuffEvent } from '../types'
import { describe, expect, it } from 'vitest'
import { createIntelligenceSdk } from '../sdk/domains/intelligence'
import { defineEvent } from './builder'

describe('tuff-intelligence transport event builder', () => {
  it('builds typed event names without relying on raw event fallback', () => {
    const event = defineEvent('intelligence')
      .module('agent')
      .event('tool:approve')
      .define<{ ticketId: string }, { accepted: boolean }>()

    expect(event.toEventName()).toBe('intelligence:agent:tool:approve')
    expect(event.toString()).toBe('intelligence:agent:tool:approve')
    expect(event.__brand).toBe('TuffEvent')
    expect(event.namespace).toBe('intelligence')
    expect(event.module).toBe('agent')
    expect(event.action).toBe('tool:approve')
  })

  it('maps api, knowledge, context, agent, and workflow sdk methods through typed event names', async () => {
    const sentEvents: Array<TuffEvent<unknown, unknown>> = []
    const send = async <TReq, TRes>(event: TuffEvent<TReq, TRes>): Promise<TRes> => {
      sentEvents.push(event as TuffEvent<unknown, unknown>)
      return { ok: true, result: null } as TRes
    }
    const transport = {
      send,
    } satisfies ITuffTransport
    const sdk = createIntelligenceSdk(transport)

    await sdk.invoke('text.chat', { messages: [] })
    await sdk.knowledgeBuildContext({
      query: 'local knowledge',
      tokenBudget: 120,
    })
    await sdk.contextListCheckpoints({
      sessionId: 'ctxs-1',
      type: 'session_start',
      limit: 20,
    })
    await sdk.contextListPackageLogs({
      traceId: 'trace-1',
      limit: 20,
    })
    await sdk.contextCreateCompressionSnapshot({
      sessionId: 'ctxs-1',
      expectedSessionUpdatedAt: 1,
      snapshot: {
        currentState: 'Compressed state',
        sourceTurnFrom: 'turn-1',
        sourceTurnTo: 'turn-2',
      },
    })
    await sdk.contextListCompressionSnapshots({ sessionId: 'ctxs-1', limit: 5 })
    await sdk.contextGetLatestCompressionSnapshot({ sessionId: 'ctxs-1' })
    await sdk.contextListMemories({
      scope: 'workspace',
      limit: 20,
    })
    await sdk.contextSetMemoryEnabled({
      memoryId: 'mem-1',
      enabled: false,
    })
    await sdk.contextEvaluateMemory({
      content: 'Use Chinese replies by default',
      type: 'preference',
      scope: 'workspace',
    })
    await sdk.contextReplaceMemory({
      memoryId: 'mem-1',
      expectedUpdatedAt: 2,
      evaluationFingerprint: 'a'.repeat(64),
      replacement: {
        type: 'preference',
        scope: 'workspace',
        content: 'Use concise Chinese replies',
      },
    })
    await sdk.agentToolApprove({
      ticketId: 'ticket-1',
      approved: true,
    })
    await sdk.workflowGet({ workflowId: 'wf-1' })

    expect(sentEvents[0]?.toEventName()).toBe(
      'intelligence:api:invoke',
    )
    expect(sentEvents[1]?.toEventName()).toBe(
      'intelligence:knowledge:build-context',
    )
    expect(sentEvents[2]?.toEventName()).toBe(
      'intelligence:context:checkpoints:list',
    )
    expect(sentEvents[3]?.toEventName()).toBe(
      'intelligence:context:package-logs:list',
    )
    expect(sentEvents[4]?.toEventName()).toBe(
      'intelligence:context:compression:create',
    )
    expect(sentEvents[5]?.toEventName()).toBe(
      'intelligence:context:compression:list',
    )
    expect(sentEvents[6]?.toEventName()).toBe(
      'intelligence:context:compression:latest',
    )
    expect(sentEvents[7]?.toEventName()).toBe(
      'intelligence:context:memory:list',
    )
    expect(sentEvents[8]?.toEventName()).toBe(
      'intelligence:context:memory:set-enabled',
    )
    expect(sentEvents[9]?.toEventName()).toBe(
      'intelligence:context:memory:evaluate',
    )
    expect(sentEvents[10]?.toEventName()).toBe(
      'intelligence:context:memory:replace',
    )
    expect(sentEvents[11]?.toEventName()).toBe(
      'intelligence:agent:tool:approve',
    )
    expect(sentEvents[12]?.toEventName()).toBe(
      'intelligence:workflow:get',
    )
  })
})
