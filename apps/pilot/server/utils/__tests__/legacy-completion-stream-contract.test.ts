import type { IChatBody, IChatConversation } from '../../../app/composables/api/base/v1/aigc/completion-types'
import { describe, expect, it } from 'vitest'
import { PersistStatus } from '../../../app/composables/api/base/v1/aigc/completion-types'
import {
  buildLegacyCompletionExecutorBody,
  buildLegacyCompletionStreamRequestPayload,
  resolveLegacyConversationSeqCursor,
  shouldDropLegacyCompletionStreamEvent,
} from '../../../app/composables/api/base/v1/aigc/completion/legacy-stream-contract'
import { handleLegacyCompletionExecutorResult } from '../../../app/composables/api/base/v1/aigc/completion/legacy-stream-sse'

function createConversation(): IChatConversation {
  return {
    id: 'chat_legacy',
    topic: 'legacy',
    messages: [],
    lastUpdate: Date.now(),
    sync: PersistStatus.SUCCESS,
    pilotMode: true,
  }
}

function createBody(overrides: Partial<IChatBody> = {}): IChatBody {
  return {
    chat_id: 'chat_legacy',
    index: 0,
    model: 'quota-auto',
    messages: [],
    temperature: 0.5,
    templateId: -1,
    ...overrides,
  } as IChatBody
}

function createReader(chunks: string[]): ReadableStreamDefaultReader<string> {
  const stream = new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })
  return stream.getReader()
}

describe('legacy completion stream contract', () => {
  it('默认 DeepAgent 主链不会从会话回填 pilotMode', () => {
    const body = buildLegacyCompletionExecutorBody({
      conversation: createConversation(),
      index: 0,
      model: 'quota-auto',
      meta: {
        internet: true,
        thinking: true,
        memoryEnabled: true,
      },
      signal: new AbortController().signal,
    })

    expect(body.pilotMode).toBeUndefined()
  })

  it('显式实验开关仍可按需透传 pilotMode=true', () => {
    const body = buildLegacyCompletionExecutorBody({
      conversation: createConversation(),
      index: 0,
      model: 'quota-auto',
      meta: {
        pilotMode: true,
      },
      signal: new AbortController().signal,
    })

    expect(body.pilotMode).toBe(true)
  })

  it('follow/replay 请求会保留 fromSeq 但默认不透传 pilotMode', () => {
    const payload = buildLegacyCompletionStreamRequestPayload({
      body: createBody({
        fromSeq: 42,
        follow: true,
      }),
      followOnly: true,
    })

    expect(payload).toMatchObject({
      fromSeq: 42,
      follow: true,
      metadata: {
        source: 'legacy-ui-completion-follow',
      },
    })
    expect(payload).not.toHaveProperty('pilotMode')
  })

  it('会从 markdown block extra.seq 与 card data.seq 中取最大游标', () => {
    const cursor = resolveLegacyConversationSeqCursor([
      {
        id: 'msg_1',
        page: 0,
        role: 'assistant',
        content: [{
          page: 0,
          model: 'quota-auto',
          status: 0,
          timestamp: Date.now(),
          meta: {},
          value: [
            {
              type: 'markdown',
              value: 'Hello',
              extra: {
                seq: 12,
              },
            },
            {
              type: 'card',
              value: '',
              data: JSON.stringify({
                seq: 18,
              }),
            },
          ],
        }],
      },
    ])

    expect(cursor).toBe(18)
  })

  it('只丢弃缺少 seq 的必需事件，保留 done/replay.started 豁免事件', () => {
    expect(shouldDropLegacyCompletionStreamEvent('assistant.delta', undefined)).toBe(true)
    expect(shouldDropLegacyCompletionStreamEvent('assistant.final', 0)).toBe(true)
    expect(shouldDropLegacyCompletionStreamEvent('done', undefined)).toBe(false)
    expect(shouldDropLegacyCompletionStreamEvent('replay.started', undefined)).toBe(false)
  })

  it('会按 SSE 分块持续解析 assistant.delta，而不是等到流结束再一次性返回', async () => {
    const events: Array<Record<string, unknown>> = []

    await handleLegacyCompletionExecutorResult(createReader([
      'data: {"type":"assistant.delta","seq":1,"delta":"Hel"}\n\n',
      'data: {"type":"assistant.delta","seq":2,"delta":"lo"}\n\ndata: {"type":"assistant.final","seq":3,"message":"Hello"}\n\n',
    ]), (data) => {
      events.push(data)
    }, value => String(value || ''))

    expect(events).toEqual([
      {
        done: false,
        type: 'assistant.delta',
        seq: 1,
        delta: 'Hel',
      },
      {
        done: false,
        type: 'assistant.delta',
        seq: 2,
        delta: 'lo',
      },
      {
        done: false,
        type: 'assistant.final',
        seq: 3,
        message: 'Hello',
      },
      {
        done: true,
      },
    ])
  })

  it('会保留 replay、run.audit、approval_required 与 done 事件形状', async () => {
    const events: Array<Record<string, unknown>> = []

    await handleLegacyCompletionExecutorResult(createReader([
      'data: {"type":"replay.started","fromSeq":8}\n\n',
      'data: {"type":"run.audit","seq":8,"auditType":"tool.call.started","toolName":"web_search"}\n\n',
      'data: {"type":"turn.approval_required","seq":9,"ticket":{"id":"ticket_1"}}\n\n',
      'data: {"type":"assistant.final","seq":10,"message":"done"}\n\n',
      'data: {"type":"done","status":"completed"}\n\n',
    ]), (data) => {
      events.push(data)
    }, value => String(value || ''))

    expect(events).toEqual([
      {
        done: false,
        type: 'replay.started',
        fromSeq: 8,
      },
      {
        done: false,
        type: 'run.audit',
        seq: 8,
        auditType: 'tool.call.started',
        toolName: 'web_search',
      },
      {
        done: false,
        type: 'turn.approval_required',
        seq: 9,
        ticket: {
          id: 'ticket_1',
        },
      },
      {
        done: false,
        type: 'assistant.final',
        seq: 10,
        message: 'done',
      },
      {
        done: false,
        type: 'done',
        status: 'completed',
      },
      {
        done: true,
      },
    ])
  })

  it('会按 error frame 解析错误事件并走错误归一化', async () => {
    const events: Array<Record<string, unknown>> = []

    await handleLegacyCompletionExecutorResult(createReader([
      'event: error\ndata: {"message":"raw failure","status":"failed","event":"error","data":{"reason":"network"}}\n\n',
      'event: error\ndata: plain-text-error\n\n',
    ]), (data) => {
      events.push(data)
    }, value => `normalized:${String(value || '')}`)

    expect(events).toEqual([
      {
        done: false,
        event: 'error',
        status: 'failed',
        id: 'assistant',
        data: {
          reason: 'network',
        },
        message: 'normalized:raw failure',
      },
      {
        done: false,
        error: true,
        e: 'normalized:plain-text-error',
      },
      {
        done: true,
      },
    ])
  })
})
