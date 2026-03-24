import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPilotStreamQuotaProjector } from '../pilot-stream-quota-projector'

function extractAssistantBlocksFromSnapshot(rawSnapshot: string): Array<Record<string, unknown>> {
  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(rawSnapshot) as Record<string, unknown>
  }
  catch {
    payload = {}
  }
  const payloadMessages = Array.isArray(payload.messages)
    ? payload.messages
    : []
  const assistant = [...payloadMessages]
    .reverse()
    .find((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return false
      }
      return String((item as Record<string, unknown>).role || '').trim().toLowerCase() === 'assistant'
    }) as Record<string, any> | undefined
  const content = Array.isArray(assistant?.content) ? assistant.content : []
  const inner = content.find((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false
    }
    return Array.isArray((item as Record<string, unknown>).value)
  }) as Record<string, any> | undefined
  return Array.isArray(inner?.value) ? inner.value : []
}

function extractMarkdownText(rawSnapshot: string): string {
  const blocks = extractAssistantBlocksFromSnapshot(rawSnapshot)
  const markdown = blocks.find(item => String(item?.type || '').trim().toLowerCase() === 'markdown')
  return String(markdown?.value || '')
}

function extractCardsByName(rawSnapshot: string, name: 'pilot_run_event_card' | 'pilot_tool_card') {
  const blocks = extractAssistantBlocksFromSnapshot(rawSnapshot)
  return blocks.filter(item => item?.type === 'card' && item?.name === name)
}

describe('pilot-stream-quota-projector', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('可在逐事件写入中保留 thinking 卡片并完成状态迁移', async () => {
    const historyWrites: string[] = []
    const projector = createPilotStreamQuotaProjector({
      chatId: 'chat-thinking',
      persist: true,
      storeRuntime: {
        async getSession() {
          return { title: 'thinking session' }
        },
        async listMessages() {
          return [{ role: 'user', content: '请先思考后回答' }]
        },
      },
      persistence: {
        async ensureSchemas() {},
        async getHistory() {
          return null
        },
        async upsertHistory(input) {
          historyWrites.push(input.value)
        },
        async upsertSession() {},
      },
    })

    await projector.apply({ type: 'turn.started', seq: 1, payload: {} })
    await projector.apply({ type: 'thinking.delta', seq: 2, delta: '第一段', payload: {} })
    await projector.apply({ type: 'thinking.delta', seq: 3, delta: '第二段', payload: {} })
    await projector.apply({ type: 'thinking.final', seq: 4, message: '第一段第二段（最终）', payload: {} })
    await projector.flush({ force: true })

    expect(historyWrites.length).toBeGreaterThan(0)
    const latest = historyWrites.at(-1) || ''
    const runCards = extractCardsByName(latest, 'pilot_run_event_card')
      .map(item => JSON.parse(String(item.data || '{}')) as Record<string, unknown>)
    const thinkingCard = runCards.find(item => item.cardType === 'thinking')
    expect(thinkingCard).toBeTruthy()
    expect(thinkingCard?.status).toBe('completed')
    expect(String(thinkingCard?.content || '')).toContain('最终')
  })

  it('run.audit 审批状态链路在 projector 中会写入最新工具卡', async () => {
    const historyWrites: string[] = []
    const projector = createPilotStreamQuotaProjector({
      chatId: 'chat-approval',
      persist: true,
      storeRuntime: {
        async getSession() {
          return { title: 'approval session' }
        },
        async listMessages() {
          return [{ role: 'user', content: '高风险查询' }]
        },
      },
      persistence: {
        async ensureSchemas() {},
        async getHistory() {
          return null
        },
        async upsertHistory(input) {
          historyWrites.push(input.value)
        },
        async upsertSession() {},
      },
    })

    await projector.apply({
      type: 'run.audit',
      seq: 10,
      payload: {
        audit_type: 'tool.call.approval_required',
        call_id: 'call-1',
        ticket_id: 'ticket-1',
        tool_name: 'websearch',
        status: 'approval_required',
      },
    })
    await projector.apply({
      type: 'run.audit',
      seq: 11,
      payload: {
        auditType: 'tool.call.approved',
        callId: 'call-1',
        ticketId: 'ticket-1',
        toolName: 'websearch',
        status: 'approved',
      },
    })
    await projector.apply({
      type: 'run.audit',
      seq: 12,
      payload: {
        auditType: 'tool.call.rejected',
        callId: 'call-1',
        ticketId: 'ticket-1',
        toolName: 'websearch',
        status: 'rejected',
      },
    })
    await projector.flush({ force: true })

    const latest = historyWrites.at(-1) || ''
    const toolCards = extractCardsByName(latest, 'pilot_tool_card')
    expect(toolCards.length).toBe(1)
    const payload = JSON.parse(String(toolCards[0]?.data || '{}')) as Record<string, unknown>
    expect(payload.callId).toBe('call-1')
    expect(payload.ticketId).toBe('ticket-1')
    expect(payload.auditType).toBe('tool.call.rejected')
    expect(payload.status).toBe('rejected')
  })

  it('assistant.delta 高频场景使用防抖并在 done 强制 flush', async () => {
    vi.useFakeTimers()
    const historyWrites: string[] = []
    const projector = createPilotStreamQuotaProjector({
      chatId: 'chat-delta',
      persist: true,
      assistantDeltaDebounceMs: 24,
      storeRuntime: {
        async getSession() {
          return { title: 'delta session' }
        },
        async listMessages() {
          return [{ role: 'user', content: 'hello' }]
        },
      },
      persistence: {
        async ensureSchemas() {},
        async getHistory() {
          return null
        },
        async upsertHistory(input) {
          historyWrites.push(input.value)
        },
        async upsertSession() {},
      },
    })

    await projector.apply({ type: 'assistant.delta', seq: 1, delta: 'a', payload: { text: 'a' } })
    await projector.apply({ type: 'assistant.delta', seq: 2, delta: 'b', payload: { text: 'b' } })
    await projector.apply({ type: 'assistant.delta', seq: 3, delta: 'c', payload: { text: 'c' } })

    expect(historyWrites.length).toBe(0)
    await vi.advanceTimersByTimeAsync(20)
    expect(historyWrites.length).toBe(0)
    await vi.advanceTimersByTimeAsync(4)
    expect(historyWrites.length).toBe(1)

    await projector.apply({ type: 'assistant.delta', seq: 4, delta: 'd', payload: { text: 'd' } })
    await projector.apply({ type: 'assistant.delta', seq: 5, delta: 'e', payload: { text: 'e' } })
    await projector.apply({ type: 'done', seq: 6, payload: { status: 'ok' } })
    await projector.flush({ force: true })

    expect(historyWrites.length).toBe(2)
    const latest = historyWrites.at(-1) || ''
    expect(extractMarkdownText(latest)).toBe('abcde')
  })
})
