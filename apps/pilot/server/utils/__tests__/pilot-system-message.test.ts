import { describe, expect, it } from 'vitest'
import {
  buildPilotCardBlocksFromSystemMessages,
  projectPilotSystemMessage,
} from '../../../shared/pilot-system-message'

describe('pilot-system-message', () => {
  it('routing.selected 不应投影到前端 system message', () => {
    const projected = projectPilotSystemMessage({
      type: 'routing.selected',
      seq: 1,
      payload: {
        channelId: 'route-a',
        providerModel: 'gpt-5.4',
      },
    })

    expect(projected).toBeNull()
  })

  it('intent_not_required 时不投影 websearch system message', () => {
    const projected = projectPilotSystemMessage({
      type: 'websearch.decision',
      seq: 2,
      payload: {
        enabled: false,
        reason: 'intent_not_required',
        turnId: 'turn-hidden',
      },
    })

    expect(projected).toBeNull()
  })

  it('websearch decision 与 executed 应复用同一张运行卡', () => {
    const decision = projectPilotSystemMessage({
      type: 'websearch.decision',
      seq: 2,
      payload: {
        enabled: true,
        reason: 'intent_required',
        turnId: 'turn-merged',
      },
    })
    const executed = projectPilotSystemMessage({
      type: 'websearch.executed',
      seq: 3,
      payload: {
        source: 'gateway',
        sourceCount: 2,
        turnId: 'turn-merged',
      },
    })

    expect(decision?.metadata.status).toBe('running')
    expect(decision?.metadata.cardKey).toBe('websearch:turn-merged')
    expect(executed?.metadata.cardKey).toBe(decision?.metadata.cardKey)

    const blocks = buildPilotCardBlocksFromSystemMessages([
      {
        id: 'msg-2',
        role: 'system',
        content: decision?.content || '',
        createdAt: '2026-03-31T10:00:00.000Z',
        metadata: decision?.metadata || {},
      },
      {
        id: 'msg-3',
        role: 'system',
        content: executed?.content || '',
        createdAt: '2026-03-31T10:00:01.000Z',
        metadata: executed?.metadata || {},
      },
    ])

    expect(blocks).toHaveLength(1)
    const payload = JSON.parse(String(blocks[0]?.data || '{}')) as Record<string, unknown>
    expect(payload.eventType).toBe('websearch.executed')
    expect(payload.status).toBe('completed')
    expect(payload.title).toBe('联网检索')
  })
})
