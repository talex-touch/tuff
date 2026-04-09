import { describe, expect, it } from 'vitest'
import {
  projectPilotLegacyRunEventCard,
  resolvePilotLegacyRunEventCardKeys,
  sortPilotChatBlocksByTimeline,
} from '@talex-touch/tuff-intelligence/pilot'

function mergePlanningTodos(
  current: Record<string, unknown>,
  previous?: Record<string, unknown>,
): Record<string, unknown> {
  const currentTodos = Array.isArray(current.todos) ? current.todos : []
  if (currentTodos.length > 0) {
    return current
  }
  const previousTodos = Array.isArray(previous?.todos) ? previous?.todos : []
  if (previousTodos.length <= 0) {
    return current
  }
  return {
    ...current,
    todos: previousTodos,
  }
}

describe('pilot-legacy-run-event-card', () => {
  it('planning started/updated/finished 复用 shared projector 且保持同一张卡', () => {
    const started = projectPilotLegacyRunEventCard({
      conversationId: 'chat-legacy-plan',
      eventType: 'planning.started',
      eventPayload: {
        seq: 2,
        payload: {
          strategy: 'deepagent-style-todo',
        },
      },
    })
    const updated = projectPilotLegacyRunEventCard({
      conversationId: 'chat-legacy-plan',
      eventType: 'planning.updated',
      eventPayload: {
        seq: 3,
        payload: {
          todos: ['分析问题', '规划步骤'],
        },
      },
    })
    const finished = projectPilotLegacyRunEventCard({
      conversationId: 'chat-legacy-plan',
      eventType: 'planning.finished',
      eventPayload: {
        seq: 4,
        payload: {
          todoCount: 2,
        },
      },
    })

    expect(started?.status).toBe('running')
    expect(updated?.status).toBe('running')
    expect(updated?.detail).toMatchObject({
      todos: ['分析问题', '规划步骤'],
    })
    expect(finished?.status).toBe('completed')
    expect(finished?.summary).toBe('规划完成，2 项步骤')
    expect(started?.cardKey).toBe(updated?.cardKey)
    expect(updated?.cardKey).toBe(finished?.cardKey)
  })

  it('intent 真实卡即使没有 turnId 也会回收 legacy pending key', () => {
    const keys = resolvePilotLegacyRunEventCardKeys({
      conversationId: 'chat-legacy-intent',
      cardType: 'intent',
      cardKey: 'intent:latest',
      turnId: '',
      seq: 1,
    })

    expect(keys.key).toBe('intent:latest')
    expect(keys.pendingIntentKey).toBe('intent:chat-legacy-intent:pending')
    expect(keys.fallbackKey).toBe('intent:chat-legacy-intent:pending')
    expect(keys.shouldPromotePendingIntent).toBe(true)
  })

  it('缺失 seq 的可恢复 legacy 事件不会生成运行卡', () => {
    const projected = projectPilotLegacyRunEventCard({
      conversationId: 'chat-legacy-invalid-seq',
      eventType: 'planning.updated',
      eventPayload: {
        payload: {
          todos: ['分析问题'],
        },
      },
    })

    expect(projected).toBeNull()
  })

  it('legacy 时间线会按 seq 保持 intent -> planning -> assistant 顺序', () => {
    const events = [
      {
        eventType: 'intent.started',
        eventPayload: {
          seq: 1,
          payload: {
            messageChars: 24,
          },
        },
      },
      {
        eventType: 'planning.started',
        eventPayload: {
          seq: 2,
          payload: {
            strategy: 'deepagent-style-todo',
          },
        },
      },
      {
        eventType: 'planning.updated',
        eventPayload: {
          seq: 3,
          payload: {
            todos: ['分析问题', '规划步骤'],
          },
        },
      },
      {
        eventType: 'planning.finished',
        eventPayload: {
          seq: 4,
          payload: {
            todoCount: 2,
          },
        },
      },
    ]

    const blocks = new Map<string, { payload: Record<string, unknown>, streamOrder: number }>()
    for (const [index, event] of events.entries()) {
      const projected = projectPilotLegacyRunEventCard({
        conversationId: 'chat-legacy-order',
        eventType: event.eventType,
        eventPayload: event.eventPayload,
      })
      if (!projected) {
        continue
      }

      const key = String(projected.cardKey || `${projected.cardType}:${index}`)
      const previous = blocks.get(key)
      blocks.set(key, {
        payload: {
          ...projected,
          detail: projected.cardType === 'planning'
            ? mergePlanningTodos(projected.detail, previous?.payload.detail as Record<string, unknown> | undefined)
            : projected.detail,
        },
        streamOrder: previous?.streamOrder || (index + 1),
      })
    }

    const ordered = sortPilotChatBlocksByTimeline([
      ...Array.from(blocks.values()).map(item => ({
        type: 'card',
        name: 'pilot_run_event_card',
        value: '',
        data: JSON.stringify(item.payload),
        extra: {
          streamOrder: item.streamOrder,
        },
      })),
      {
        type: 'markdown',
        value: '最终回答',
        extra: {
          seq: 5,
          streamOrder: 5,
        },
      },
    ])

    const labels = ordered.map((block) => {
      if (block.type !== 'card') {
        return String(block.type)
      }
      return JSON.parse(String(block.data || '{}')).cardType
    })
    const planningPayload = JSON.parse(String(ordered[1]?.data || '{}')) as Record<string, unknown>

    expect(labels).toEqual(['intent', 'planning', 'markdown'])
    expect(planningPayload.summary).toBe('规划完成，2 项步骤')
    expect(planningPayload.detail).toMatchObject({
      todos: ['分析问题', '规划步骤'],
    })
  })
})
