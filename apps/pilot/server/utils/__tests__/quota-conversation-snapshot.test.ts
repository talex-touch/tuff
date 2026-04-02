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
  it('routing system message 对前端快照应保持隐藏', () => {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: 'chat-message-first',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
        {
          role: 'system',
          content: '系统策略：route-a / gpt-5.4',
          metadata: {
            eventType: 'system.policy',
            sourceEventType: 'routing.selected',
            seq: 31,
            cardType: 'routing',
            cardKey: 'routing:latest',
            status: 'completed',
            title: '路由选择',
            summary: 'route-a / gpt-5.4',
            detail: {
              channelId: 'route-a',
              providerModel: 'gpt-5.4',
            },
          },
        },
      ],
      runtimeTraces: [
        { seq: 1, type: 'turn.started', payload: {} },
        { seq: 2, type: 'intent.completed', payload: { intentType: 'legacy' } },
      ],
      assistantReply: '',
      topicHint: 'message-first',
    })

    const runCards = extractCardsByName(snapshot, 'pilot_run_event_card')
      .map((item: any) => JSON.parse(String(item.data || '{}')))
    expect(runCards.some((item: Record<string, unknown>) => item.eventType === 'routing.selected')).toBe(false)

    const payloadMessages = Array.isArray(snapshot.payload.messages) ? snapshot.payload.messages : []
    expect(payloadMessages.some((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return false
      }
      return String((item as Record<string, unknown>).role || '').trim().toLowerCase() === 'system'
    })).toBe(false)
  })

  it('routing trace 不应重建到前端运行卡', () => {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: 'chat-routing-hidden',
      messages: [
        { role: 'user', content: 'hello' },
      ],
      runtimeTraces: [
        { seq: 1, type: 'turn.started', payload: {} },
        {
          seq: 2,
          type: 'routing.selected',
          payload: {
            channelId: 'route-a',
            providerModel: 'gpt-5.4',
          },
        },
      ],
      assistantReply: '',
      topicHint: 'routing hidden',
    })

    const runCards = extractCardsByName(snapshot, 'pilot_run_event_card')
      .map((item: any) => JSON.parse(String(item.data || '{}')))
    expect(runCards.some((item: Record<string, unknown>) => item.eventType === 'routing.selected')).toBe(false)
  })

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

  it('websearch.decision 在未结束时应保持 running 以驱动 shimmer', () => {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: 'chat-websearch-decision',
      messages: [
        { role: 'user', content: '今日天气如何' },
      ],
      runtimeTraces: [
        { seq: 1, type: 'turn.started', payload: {} },
        { seq: 2, type: 'websearch.decision', payload: { enabled: true, reason: 'intent_required' } },
      ],
      assistantReply: '',
      topicHint: 'websearch decision',
    })

    const runCards = extractCardsByName(snapshot, 'pilot_run_event_card')
      .map((item: any) => JSON.parse(String(item.data || '{}')))
    const decisionCard = runCards.find((item: Record<string, unknown>) => item.eventType === 'websearch.decision')
    expect(decisionCard).toBeTruthy()
    expect(decisionCard?.status).toBe('running')
    expect(decisionCard?.title).toBe('联网检索')
  })

  it('intent_not_required 时不应重建 websearch 卡片', () => {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: 'chat-websearch-hidden',
      messages: [
        { role: 'user', content: '讲讲 Vue 响应式原理' },
      ],
      runtimeTraces: [
        { seq: 1, type: 'turn.started', payload: {} },
        { seq: 2, type: 'websearch.decision', payload: { enabled: false, reason: 'intent_not_required' } },
        { seq: 3, type: 'websearch.skipped', payload: { enabled: false, reason: 'intent_not_required' } },
      ],
      assistantReply: '',
      topicHint: 'websearch hidden',
    })

    const runCards = extractCardsByName(snapshot, 'pilot_run_event_card')
      .map((item: any) => JSON.parse(String(item.data || '{}')))
    expect(runCards.some((item: Record<string, unknown>) => item.cardType === 'websearch')).toBe(false)
  })

  it('websearch 决策与执行应收口为同一张卡', () => {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: 'chat-websearch-merged',
      messages: [
        { role: 'user', content: '请联网检索今日天气' },
      ],
      runtimeTraces: [
        { seq: 1, type: 'turn.started', payload: {} },
        { seq: 2, type: 'websearch.decision', payload: { enabled: true, reason: 'intent_required', turnId: 'turn-1' } },
        { seq: 3, type: 'websearch.executed', payload: { source: 'gateway', sourceCount: 3, turnId: 'turn-1' } },
      ],
      assistantReply: '',
      topicHint: 'websearch merged',
    })

    const runCards = extractCardsByName(snapshot, 'pilot_run_event_card')
      .map((item: any) => JSON.parse(String(item.data || '{}')))
    const websearchCards = runCards.filter((item: Record<string, unknown>) => item.cardType === 'websearch')
    expect(websearchCards).toHaveLength(1)
    expect(websearchCards[0]?.eventType).toBe('websearch.executed')
    expect(websearchCards[0]?.status).toBe('completed')
  })

  it('memory.updated 带新增 facts 时应保留可展开明细', () => {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: 'chat-memory-facts',
      messages: [
        { role: 'user', content: '记住我是男的。' },
      ],
      runtimeTraces: [
        { seq: 1, type: 'turn.started', payload: {} },
        {
          seq: 2,
          type: 'memory.updated',
          payload: {
            turnId: 'turn-memory-1',
            stored: true,
            addedCount: 1,
            reason: 'stored',
            facts: [
              { key: 'profile_gender', value: '你是男的。' },
            ],
          },
        },
      ],
      assistantReply: '',
      topicHint: 'memory facts',
    })

    const runCards = extractCardsByName(snapshot, 'pilot_run_event_card')
      .map((item: any) => JSON.parse(String(item.data || '{}')))
    const memoryCard = runCards.find((item: Record<string, unknown>) => item.cardType === 'memory')

    expect(memoryCard).toBeTruthy()
    expect(memoryCard?.summary).toBe('已沉淀 1 条记忆')
    expect(memoryCard?.detail).toEqual(expect.objectContaining({
      facts: [
        { key: 'profile_gender', value: '你是男的。' },
      ],
    }))
  })

  it('stored=false 的 memory.updated 不应重建 memory 卡', () => {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: 'chat-memory-skipped',
      messages: [
        { role: 'user', content: '这是一句临时需求。' },
      ],
      runtimeTraces: [
        { seq: 1, type: 'turn.started', payload: {} },
        {
          seq: 2,
          type: 'memory.updated',
          payload: {
            turnId: 'turn-memory-2',
            stored: false,
            addedCount: 0,
            reason: 'no_fact_extracted',
            facts: [],
          },
        },
      ],
      assistantReply: '',
      topicHint: 'memory skipped',
    })

    const runCards = extractCardsByName(snapshot, 'pilot_run_event_card')
      .map((item: any) => JSON.parse(String(item.data || '{}')))

    expect(runCards.some((item: Record<string, unknown>) => item.cardType === 'memory')).toBe(false)
  })

  it('run.audit 乱序/空来源场景下工具卡不回退且保留已有 sources', () => {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: 'chat-tool-status-guard',
      messages: [
        { role: 'user', content: '请联网检索并汇总' },
      ],
      runtimeTraces: [
        { seq: 1, type: 'turn.started', payload: {} },
        {
          seq: 2,
          type: 'run.audit',
          payload: {
            auditType: 'tool.call.completed',
            callId: 'call-guard-1',
            toolId: 'tool.websearch',
            toolName: 'websearch',
            status: 'completed',
            sources: [
              {
                id: 'src-1',
                title: '天气预报: 中国气象局',
                url: 'https://weather.cma.cn/',
              },
            ],
          },
        },
        {
          seq: 3,
          type: 'run.audit',
          payload: {
            auditType: 'tool.call.started',
            callId: 'call-guard-1',
            toolId: 'tool.websearch',
            toolName: 'websearch',
            status: 'started',
            sources: [],
          },
        },
        {
          seq: 4,
          type: 'run.audit',
          payload: {
            auditType: 'tool.call.completed',
            callId: 'call-guard-1',
            toolId: 'tool.websearch',
            toolName: 'websearch',
            status: 'completed',
            sources: [],
          },
        },
      ],
      assistantReply: '',
      topicHint: 'tool guard',
    })

    const toolCards = extractCardsByName(snapshot, 'pilot_tool_card')
    expect(toolCards.length).toBe(1)
    const payload = JSON.parse(String(toolCards[0]?.data || '{}')) as Record<string, any>
    expect(payload.callId).toBe('call-guard-1')
    expect(payload.status).toBe('completed')
    expect(Array.isArray(payload.sources)).toBe(true)
    expect(payload.sources).toHaveLength(1)
    expect(payload.sources[0]?.url).toBe('https://weather.cma.cn/')
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
