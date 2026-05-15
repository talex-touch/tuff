import { describe, expect, it } from 'vitest'
import type { ITuffTransport, TuffEvent } from '../types'
import { defineEvent } from './builder'
import { createIntelligenceSdk } from '../sdk/domains/intelligence'

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

  it('maps api, agent, and workflow sdk methods through typed event names', async () => {
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
    await sdk.agentToolApprove({
      ticketId: 'ticket-1',
      approved: true,
    })
    await sdk.workflowGet({ workflowId: 'wf-1' })

    expect(sentEvents[0]?.toEventName()).toBe(
      'intelligence:api:invoke',
    )
    expect(sentEvents[1]?.toEventName()).toBe(
      'intelligence:agent:tool:approve',
    )
    expect(sentEvents[2]?.toEventName()).toBe(
      'intelligence:workflow:get',
    )
  })
})
