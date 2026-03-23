import { describe, expect, it } from 'vitest'
import { buildQuotaConversationSnapshot } from '../quota-conversation-snapshot'

function extractAssistantBlocks(snapshot: ReturnType<typeof buildQuotaConversationSnapshot>) {
  const payloadMessages = Array.isArray(snapshot.payload.messages)
    ? snapshot.payload.messages
    : []
  const assistant = [...payloadMessages]
    .reverse()
    .find((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return false
      }
      return String((item as Record<string, unknown>).role || '').trim().toLowerCase() === 'assistant'
    }) as Record<string, any> | undefined
  const content = Array.isArray(assistant?.content) ? assistant?.content : []
  const inner = content.find((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false
    }
    return Array.isArray((item as Record<string, unknown>).value)
  }) as Record<string, any> | undefined
  return Array.isArray(inner?.value) ? inner.value : []
}

function extractCardsByName(
  snapshot: ReturnType<typeof buildQuotaConversationSnapshot>,
  name: 'pilot_run_event_card' | 'pilot_tool_card',
) {
  const blocks = extractAssistantBlocks(snapshot)
  return blocks.filter((item: any) => item?.type === 'card' && item?.name === name)
}

describe('quota-conversation-snapshot', () => {
  it('基于 runtime traces 重建并注入 pilot_run_event_card / pilot_tool_card（仅最新 turn）', () => {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: 'chat-1',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ],
      runtimeTraces: [
        { seq: 1, type: 'turn.started', payload: {} },
        { seq: 2, type: 'intent.completed', payload: { intentType: 'old_intent', confidence: 0.3 } },
        {
          seq: 3,
          type: 'run.audit',
          payload: {
            auditType: 'tool.call.completed',
            callId: 'call-old',
            toolId: 'tool.websearch',
            toolName: 'websearch',
            status: 'completed',
          },
        },
        { seq: 100, type: 'turn.started', payload: {} },
        { seq: 101, type: 'intent.completed', payload: { intentType: 'code_analysis', confidence: 0.92 } },
        { seq: 102, type: 'websearch.skipped', payload: { enabled: false, reason: 'fallback_unsupported_channel' } },
        {
          seq: 103,
          type: 'run.audit',
          payload: {
            auditType: 'tool.call.completed',
            callId: 'call-new',
            toolId: 'tool.websearch',
            toolName: 'websearch',
            status: 'skipped',
            connectorReason: 'fallback_unsupported_channel',
          },
        },
      ],
      assistantReply: '',
      topicHint: '测试会话',
    })

    const blocks = extractAssistantBlocks(snapshot)
    const runCards = blocks.filter((item: any) => item?.type === 'card' && item?.name === 'pilot_run_event_card')
    const toolCards = blocks.filter((item: any) => item?.type === 'card' && item?.name === 'pilot_tool_card')

    expect(runCards.length).toBeGreaterThan(0)
    expect(toolCards.length).toBe(1)

    const parsedRunPayloads = runCards
      .map((item: any) => JSON.parse(String(item.data || '{}')))
    const parsedToolPayload = JSON.parse(String(toolCards[0]?.data || '{}'))

    expect(parsedRunPayloads.some((item: Record<string, unknown>) => Number(item.seq) === 2)).toBe(false)
    expect(parsedRunPayloads.some((item: Record<string, unknown>) => item.eventType === 'websearch.skipped')).toBe(true)
    expect(parsedRunPayloads.some((item: Record<string, unknown>) => item.summary === '当前通道不支持联网检索，已继续离线回答')).toBe(true)
    expect(parsedToolPayload.callId).toBe('call-new')
  })

  it('没有 assistant 消息时会创建 assistant 并注入 runtime card', () => {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: 'chat-2',
      messages: [{ role: 'user', content: 'only user message' }],
      runtimeTraces: [
        { seq: 10, type: 'turn.started', payload: {} },
        { seq: 11, type: 'intent.started', payload: {} },
      ],
      assistantReply: '',
      topicHint: '新会话',
    })

    const blocks = extractAssistantBlocks(snapshot)
    expect(blocks.some((item: any) => item?.type === 'card' && item?.name === 'pilot_run_event_card')).toBe(true)
  })

  it('thinking.delta / thinking.final 会重建 thinking 卡并完成状态迁移', () => {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: 'chat-thinking',
      messages: [
        { role: 'user', content: '请深度分析一下' },
      ],
      runtimeTraces: [
        { seq: 1, type: 'turn.started', payload: {} },
        { seq: 2, type: 'thinking.delta', payload: { text: '第一段' } },
        { seq: 3, type: 'thinking.delta', payload: { text: '第二段' } },
        { seq: 4, type: 'thinking.final', payload: { text: '第一段第二段（最终整理）' } },
      ],
      assistantReply: '',
      topicHint: 'Thinking 回放',
    })

    const runCards = extractCardsByName(snapshot, 'pilot_run_event_card')
      .map((item: any) => JSON.parse(String(item.data || '{}')))
    const thinkingCard = runCards.find((item: Record<string, unknown>) => item.cardType === 'thinking')
    expect(thinkingCard).toBeTruthy()
    expect(thinkingCard?.status).toBe('completed')
    expect(String(thinkingCard?.content || '')).toContain('最终整理')
  })

  it('run.audit 工具卡兼容 camel/snake 字段并保留审批状态链路', () => {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: 'chat-tool-approval',
      messages: [
        { role: 'user', content: '帮我联网查这个站点' },
      ],
      runtimeTraces: [
        { seq: 1, type: 'turn.started', payload: {} },
        {
          seq: 2,
          type: 'run.audit',
          payload: {
            audit_type: 'tool.call.approval_required',
            call_id: 'call-approval-1',
            ticket_id: 'ticket-001',
            tool_name: 'websearch',
            status: 'approval_required',
          },
        },
        {
          seq: 3,
          type: 'run.audit',
          payload: {
            auditType: 'tool.call.approved',
            callId: 'call-approval-1',
            ticketId: 'ticket-001',
            toolName: 'websearch',
            status: 'approved',
          },
        },
        {
          seq: 4,
          type: 'run.audit',
          payload: {
            auditType: 'tool.call.rejected',
            callId: 'call-approval-1',
            ticketId: 'ticket-001',
            toolName: 'websearch',
            status: 'rejected',
            errorMessage: '审批拒绝',
          },
        },
      ],
      assistantReply: '',
      topicHint: '审批链路',
    })

    const toolCards = extractCardsByName(snapshot, 'pilot_tool_card')
    expect(toolCards.length).toBe(1)
    const payload = JSON.parse(String(toolCards[0]?.data || '{}')) as Record<string, unknown>
    expect(payload.callId).toBe('call-approval-1')
    expect(payload.call_id).toBe('call-approval-1')
    expect(payload.ticketId).toBe('ticket-001')
    expect(payload.ticket_id).toBe('ticket-001')
    expect(payload.toolName).toBe('websearch')
    expect(payload.tool_name).toBe('websearch')
    expect(payload.auditType).toBe('tool.call.rejected')
    expect(payload.status).toBe('rejected')
  })
})
