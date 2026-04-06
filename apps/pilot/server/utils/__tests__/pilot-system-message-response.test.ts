import { describe, expect, it } from 'vitest'
import { buildPilotSystemMessageId } from '@talex-touch/tuff-intelligence/pilot'
import { listMessagesWithTraceProjection } from '../pilot-system-message-response'

describe('pilot-system-message-response', () => {
  it('始终以 trace projection 覆盖 legacy system row，且不会重复返回', async () => {
    const sessionId = 'session_projection'
    const systemId = buildPilotSystemMessageId(sessionId, 2, 'websearch.executed')
    const messages = await listMessagesWithTraceProjection({
      async listMessages() {
        return [
          {
            id: 'msg_user_1',
            sessionId,
            role: 'user',
            content: '帮我查一下今天的发布',
            createdAt: '2026-04-03T00:00:00.000Z',
          },
          {
            id: systemId,
            sessionId,
            role: 'system',
            content: 'legacy system row',
            createdAt: '2026-04-03T00:00:02.000Z',
            metadata: {
              seq: 2,
              sourceEventType: 'websearch.executed',
            },
          },
          {
            id: 'msg_assistant_1',
            sessionId,
            role: 'assistant',
            content: '已处理',
            createdAt: '2026-04-03T00:00:03.000Z',
          },
        ]
      },
      async listTrace() {
        return [
          {
            seq: 2,
            type: 'websearch.executed',
            payload: {
              source: 'gateway',
              sourceCount: 3,
              turnId: 'turn_projection',
            },
            createdAt: '2026-04-03T00:00:02.500Z',
          },
        ]
      },
    }, sessionId)

    const systemMessages = messages.filter(item => item.role === 'system')
    expect(systemMessages).toHaveLength(1)
    expect(systemMessages[0]?.id).toBe(systemId)
    expect(systemMessages[0]?.content).not.toBe('legacy system row')
    expect(systemMessages[0]?.metadata).toMatchObject({
      seq: 2,
      sourceEventType: 'websearch.executed',
      cardType: 'websearch',
      status: 'completed',
    })
  })

  it('无 trace 时仍保留 legacy system row 兼容历史会话', async () => {
    const sessionId = 'session_legacy_only'
    const messages = await listMessagesWithTraceProjection({
      async listMessages() {
        return [
          {
            id: 'msg_system_legacy',
            sessionId,
            role: 'system',
            content: '历史 system message',
            createdAt: '2026-04-03T00:00:01.000Z',
            metadata: {
              seq: 7,
              sourceEventType: 'intent.completed',
              title: '意图分析',
            },
          },
        ]
      },
      async listTrace() {
        return []
      },
    }, sessionId)

    expect(messages).toEqual([
      {
        id: 'msg_system_legacy',
        sessionId: 'session_legacy_only',
        role: 'system',
        content: '历史 system message',
        createdAt: '2026-04-03T00:00:01.000Z',
        metadata: {
          seq: 7,
          sourceEventType: 'intent.completed',
          title: '意图分析',
        },
      },
    ])
  })
})
