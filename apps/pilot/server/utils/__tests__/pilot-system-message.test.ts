import { describe, expect, it } from 'vitest'
import {
  projectPilotSystemMessage,
} from '@talex-touch/tuff-intelligence/pilot'
import { buildPilotCardBlocksFromSystemMessages } from '../../../shared/pilot-system-card-blocks'

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

  it('planning finished 应保留 updated 阶段的 todos 供卡片直出', () => {
    const updated = projectPilotSystemMessage({
      type: 'planning.updated',
      seq: 10,
      payload: {
        turnId: 'turn-plan',
        todos: [
          'Analyze user intent and constraints from latest message.',
          'Call upstream model and stream normalized decision output.',
          'Finalize assistant response and emit trace metrics.',
        ],
      },
    })
    const finished = projectPilotSystemMessage({
      type: 'planning.finished',
      seq: 11,
      payload: {
        turnId: 'turn-plan',
        todoCount: 3,
      },
    })

    const blocks = buildPilotCardBlocksFromSystemMessages([
      {
        id: 'msg-plan-updated',
        role: 'system',
        content: updated?.content || '',
        createdAt: '2026-04-02T10:00:00.000Z',
        metadata: updated?.metadata || {},
      },
      {
        id: 'msg-plan-finished',
        role: 'system',
        content: finished?.content || '',
        createdAt: '2026-04-02T10:00:01.000Z',
        metadata: finished?.metadata || {},
      },
    ])

    expect(blocks).toHaveLength(1)
    const payload = JSON.parse(String(blocks[0]?.data || '{}')) as Record<string, unknown>
    expect(payload.cardType).toBe('planning')
    expect(payload.status).toBe('completed')
    expect(payload.summary).toBe('规划完成，3 项步骤')
    expect(payload.detail).toMatchObject({
      todos: [
        'Analyze user intent and constraints from latest message.',
        'Call upstream model and stream normalized decision output.',
        'Finalize assistant response and emit trace metrics.',
      ],
    })
  })

  it('skipped memory.updated 不应投影为前端 system message', () => {
    const projected = projectPilotSystemMessage({
      type: 'memory.updated',
      seq: 12,
      payload: {
        turnId: 'turn-memory',
        stored: false,
        reason: 'no_fact_extracted',
      },
    })

    expect(projected).toBeNull()
  })

  it('缺失 seq 的可恢复事件不应投影为前端 system message', () => {
    const projected = projectPilotSystemMessage({
      type: 'intent.completed',
      payload: {
        intentType: 'chat',
        confidence: 0.9,
      },
    })

    expect(projected).toBeNull()
  })

  it('memory.context 与 skipped memory.updated 不应生成前端运行卡', () => {
    const blocks = buildPilotCardBlocksFromSystemMessages([
      {
        id: 'msg-memory-context',
        role: 'system',
        content: '系统策略：记忆上下文 开启 (4)',
        createdAt: '2026-04-02T10:05:00.000Z',
        metadata: {
          eventType: 'system.policy',
          sourceEventType: 'memory.context',
          seq: 20,
          turnId: 'turn-memory-hidden',
          cardType: 'memory',
          cardKey: 'memory:turn-memory-hidden',
          status: 'completed',
          title: '记忆上下文',
          summary: '开启 (4)',
          detail: {
            memoryEnabled: true,
            memoryHistoryMessageCount: 4,
          },
        },
      },
      {
        id: 'msg-memory-skipped',
        role: 'system',
        content: '记忆未更新 (no_fact_extracted)',
        createdAt: '2026-04-02T10:05:01.000Z',
        metadata: {
          eventType: 'memory.updated',
          sourceEventType: 'memory.updated',
          seq: 21,
          turnId: 'turn-memory-hidden',
          cardType: 'memory',
          cardKey: 'memory:turn-memory-hidden',
          status: 'skipped',
          title: '记忆上下文',
          summary: '记忆未更新 (no_fact_extracted)',
          detail: {
            stored: false,
            reason: 'no_fact_extracted',
          },
        },
      },
    ])

    expect(blocks).toHaveLength(0)
  })
})
