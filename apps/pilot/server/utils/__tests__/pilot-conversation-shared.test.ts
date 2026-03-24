import {
  buildPilotConversationSnapshot,
  buildPilotTitleMessages,
  serializePilotExecutorMessages,
  shouldIncludePilotMessageInModelContext,
  shouldExecutePilotWebsearch,
} from '@talex-touch/tuff-intelligence/pilot'
import { normalizeLooseMarkdownForRender } from '@talex-touch/tuff-intelligence/pilot-conversation'
import { describe, expect, it } from 'vitest'

describe('pilot conversation shared utils', () => {
  it('serializePilotExecutorMessages 保留 card/tool block（即使 value 为空）', () => {
    const messages = serializePilotExecutorMessages([
      {
        id: 'u1',
        role: 'user',
        page: 0,
        content: [{
          page: 0,
          status: 0,
          value: [{ type: 'text', value: '查一下最新 AI 新闻' }],
        }],
      },
      {
        id: 'a1',
        role: 'assistant',
        page: 0,
        content: [{
          page: 0,
          status: 0,
          value: [
            { type: 'markdown', value: '这是结果' },
            { type: 'card', name: 'pilot_tool_card', value: '', data: '{"tool":"websearch"}' },
          ],
        }],
      },
    ], {
      assistantAvailableStatus: 0,
      skipUnavailableAssistant: true,
      keepNonTextWithoutValue: true,
    })

    expect(messages).toHaveLength(2)
    expect(messages[1]?.content).toEqual([
      { type: 'markdown', value: '这是结果', name: undefined, data: undefined },
      { type: 'card', value: '', name: 'pilot_tool_card', data: '{"tool":"websearch"}' },
    ])
  })

  it('buildPilotConversationSnapshot 保留结构化 block（含 card）', () => {
    const snapshot = buildPilotConversationSnapshot({
      chatId: 'chat-1',
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: [{ type: 'text', value: 'hello' }],
        },
        {
          id: 'a1',
          role: 'assistant',
          content: [
            { type: 'markdown', value: 'world' },
            { type: 'card', name: 'pilot_tool_card', value: '', data: '{"ok":true}' },
          ],
        },
      ],
      assistantReply: '',
      topicHint: '测试会话',
    })

    const payloadMessages = Array.isArray(snapshot.payload.messages) ? snapshot.payload.messages : []
    const assistant = payloadMessages[1] as Record<string, any>
    const valueBlocks = assistant?.content?.[0]?.value || []
    expect(valueBlocks).toEqual([
      { type: 'markdown', value: 'world' },
      { type: 'card', value: '', name: 'pilot_tool_card', data: '{"ok":true}' },
    ])
  })

  it('buildPilotTitleMessages 忽略附件与 card，只保留可读文本', () => {
    const messages = buildPilotTitleMessages([
      {
        role: 'user',
        content: [
          { type: 'text', value: '今天 AAPL 股价多少' },
          { type: 'image', value: 'https://example.com/demo.png' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'markdown', value: '这是回答' },
          { type: 'card', value: '', data: '{"tool":"websearch"}' },
        ],
      },
    ], '')

    expect(messages).toEqual([
      { role: 'user', content: '今天 AAPL 股价多少' },
      { role: 'assistant', content: '这是回答' },
    ])
  })

  it('buildPilotTitleMessages 仅纳入白名单 system 消息', () => {
    const messages = buildPilotTitleMessages([
      {
        role: 'user',
        content: [{ type: 'text', value: '帮我总结今天进展' }],
      },
      {
        role: 'system',
        metadata: {
          eventType: 'system.policy',
          contextPolicy: 'allow',
        },
        content: [{ type: 'text', value: '系统策略：优先简洁回答' }],
      },
      {
        role: 'system',
        metadata: {
          eventType: 'run.audit',
          contextPolicy: 'deny',
        },
        content: [{ type: 'text', value: '工具执行中...' }],
      },
    ], '')

    expect(messages).toEqual([
      { role: 'user', content: '帮我总结今天进展' },
      { role: 'system', content: '系统策略：优先简洁回答' },
    ])
  })

  it('shouldIncludePilotMessageInModelContext 正确过滤 system 消息', () => {
    expect(shouldIncludePilotMessageInModelContext({
      role: 'system',
      content: '运行日志',
      metadata: {
        eventType: 'run.audit',
        contextPolicy: 'deny',
      },
    })).toBe(false)

    expect(shouldIncludePilotMessageInModelContext({
      role: 'system',
      content: '策略提示',
      metadata: {
        eventType: 'system.policy',
        contextPolicy: 'allow',
      },
    })).toBe(true)

    expect(shouldIncludePilotMessageInModelContext({
      role: 'assistant',
      content: '正常回答',
    })).toBe(true)
  })

  it('serializePilotExecutorMessages 将 assistant 纯字符串映射为 markdown', () => {
    const messages = serializePilotExecutorMessages([
      {
        id: 'u1',
        role: 'user',
        content: '用户提问',
      },
      {
        id: 'a1',
        role: 'assistant',
        content: '```cpp\nint main() {}\n```',
      },
    ], {
      assistantAvailableStatus: 0,
      skipUnavailableAssistant: false,
      keepNonTextWithoutValue: true,
    })

    expect(messages).toHaveLength(2)
    expect(messages[0]?.content?.[0]?.type).toBe('text')
    expect(messages[1]?.content?.[0]?.type).toBe('markdown')
    expect(messages[1]?.content?.[0]?.value).toBe('```cpp\nint main() {}\n```')
  })

  it('normalizeLooseMarkdownForRender 仅修复 fence 智能引号并标准化换行', () => {
    const input = '“```cpp\r\nint main() {}\r\n```”\r\n中文“引号”保持'
    const output = normalizeLooseMarkdownForRender(input)
    expect(output).toBe('```cpp\nint main() {}\n```\n中文“引号”保持')
  })

  it('shouldExecutePilotWebsearch 意图 false 时必须强制关闭', () => {
    const byHeuristicWhenIntentFalse = shouldExecutePilotWebsearch({
      message: '帮我查一下今天苹果股价',
      intentType: 'chat',
      internetEnabled: true,
      builtinTools: ['write_todos', 'websearch'],
      intentWebsearchRequired: false,
    })
    expect(byHeuristicWhenIntentFalse.enabled).toBe(false)
    expect(byHeuristicWhenIntentFalse.reason).toBe('intent_not_required')

    const byHeuristic = shouldExecutePilotWebsearch({
      message: '帮我查一下今天苹果股价',
      intentType: 'chat',
      internetEnabled: true,
      builtinTools: ['write_todos', 'websearch'],
    })
    expect(byHeuristic.enabled).toBe(true)
    expect(byHeuristic.reason).toBe('heuristic_required')

    const byIntentRequired = shouldExecutePilotWebsearch({
      message: '帮我分析这段代码',
      intentType: 'chat',
      internetEnabled: true,
      builtinTools: ['write_todos', 'websearch'],
      intentWebsearchRequired: true,
    })
    expect(byIntentRequired).toEqual({
      enabled: true,
      reason: 'intent_required',
    })

    const byUserDisable = shouldExecutePilotWebsearch({
      message: '不要联网搜索，直接根据你已有知识回答',
      intentType: 'chat',
      internetEnabled: true,
      builtinTools: ['write_todos', 'websearch'],
      intentWebsearchRequired: false,
    })
    expect(byUserDisable).toEqual({
      enabled: false,
      reason: 'intent_not_required',
    })
  })
})
