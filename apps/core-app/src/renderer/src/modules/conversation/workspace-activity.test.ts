import type { ConversationMessage } from './useHomeConversation'
import { describe, expect, it } from 'vitest'
import { buildActivityTurns } from './workspace-activity'

describe('workspace-activity request details', () => {
  it('captures full request details including prompt, attachments, model targets and context', () => {
    const messages: ConversationMessage[] = [
      {
        id: 'msg-u1',
        role: 'user',
        content: '第一轮提问',
        status: 'complete'
      },
      {
        id: 'msg-a1',
        role: 'assistant',
        content: '第一轮回答',
        status: 'complete',
        meta: {
          model: 'gemini-3.8-flash',
          provider: 'pi-cli',
          totalTokens: 120,
          latencyMs: 800
        }
      },
      {
        id: 'msg-u2',
        role: 'user',
        content: '第二轮提问带附件',
        status: 'complete',
        attachments: [
          {
            id: 'att-u2',
            name: 'sample.png',
            kind: 'file',
            size: 1024,
            mime: 'image/png'
          }
        ]
      },
      {
        id: 'msg-a2',
        role: 'assistant',
        content: '第二轮回答',
        status: 'complete',
        meta: {
          model: 'gemini-3.8-flash',
          provider: 'pi-cli',
          promptTokens: 180,
          completionTokens: 70,
          totalTokens: 250,
          latencyMs: 1200,
          ttftMs: 380,
          reasoningRequested: 'high'
        }
      }
    ]

    const turns = buildActivityTurns(messages)
    expect(turns).toHaveLength(2)

    const secondTurn = turns[1]!
    expect(secondTurn.userPrompt).toBe('第二轮提问带附件')
    expect(secondTurn.request).toBeDefined()
    expect(secondTurn.request.prompt).toBe('第二轮提问带附件')
    expect(secondTurn.request.userMessageId).toBe('msg-u2')
    expect(secondTurn.request.model).toBe('gemini-3.8-flash')
    expect(secondTurn.request.reasoningEffort).toBe('high')
    expect(secondTurn.request.attachments).toEqual([
      {
        name: 'sample.png',
        kind: 'file',
        size: 1024,
        type: 'image/png'
      }
    ])
    // Context history before this assistant message contains 3 messages
    expect(secondTurn.request.contextMessages).toHaveLength(3)
    expect(secondTurn.request.contextMessages?.[0]?.content).toBe('第一轮提问')
    expect(secondTurn.request.contextMessages?.[1]?.content).toBe('第一轮回答')
    expect(secondTurn.request.contextTokens).toBe(180)
    expect(secondTurn.request.contextCharacters).toBeGreaterThan(0)
    expect(secondTurn.request.contextMessagesCount).toBe(3)

    // Response details
    expect(secondTurn.response.messageId).toBe('msg-a2')
    expect(secondTurn.response.content).toBe('第二轮回答')
    expect(secondTurn.response.latencyMs).toBe(1200)
    expect(secondTurn.response.ttftMs).toBe(380)
    expect(secondTurn.ttftMs).toBe(380)

    // rawPayload has both request and response
    expect(secondTurn.rawPayload.request).toBeDefined()
    expect(secondTurn.rawPayload.response).toBeDefined()
  })
})
