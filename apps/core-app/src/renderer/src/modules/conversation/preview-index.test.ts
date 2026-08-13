import type { AiMessagePart, AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { ConversationMessage } from './useHomeConversation'
import {
  CHART_RESULT_PREFIX,
  FORM_RESULT_PREFIX,
  WIDGET_RESULT_PREFIX
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { describe, expect, it } from 'vitest'
import { buildPreviewIndex } from './preview-index'

function tool(overrides: Partial<AiToolCallPart> & { name: string }): AiToolCallPart {
  return { type: 'tool-call', id: `${overrides.name}-1`, status: 'done', ...overrides }
}

function assistant(parts: AiMessagePart[]): ConversationMessage {
  return { id: 'a1', role: 'assistant', content: '', status: 'complete', parts }
}

function index(
  parts: AiMessagePart[],
  before: ConversationMessage[] = []
): ReturnType<typeof buildPreviewIndex> {
  return buildPreviewIndex([...before, assistant(parts)])
}

describe('buildPreviewIndex', () => {
  it('returns four empty lists for an empty conversation', () => {
    expect(buildPreviewIndex([])).toEqual({
      artifacts: [],
      widgets: [],
      toolCalls: [],
      sources: []
    })
  })

  describe('artifacts', () => {
    it('records a written file, split into name and directory', () => {
      const { artifacts } = index([
        tool({ name: 'tuff_write_file', output: 'Created /Users/me/Desktop/report.csv' })
      ])
      expect(artifacts).toEqual([
        {
          id: 'tuff_write_file-1',
          kind: 'created',
          name: 'report.csv',
          path: '/Users/me/Desktop/report.csv',
          dir: '/Users/me/Desktop',
          messageIndex: 0
        }
      ])
    })

    it('ignores a write that the tool refused', () => {
      // The refusal rides the same channel as the success; only `Created ` means a file exists.
      const { artifacts } = index([
        tool({
          name: 'tuff_write_file',
          output: 'File already exists — this tool never overwrites. Pick a new name.'
        })
      ])
      expect(artifacts).toEqual([])
    })

    it('ignores a write that has not settled', () => {
      const { artifacts } = index([
        tool({ name: 'tuff_write_file', status: 'running', output: 'Created /tmp/a.txt' })
      ])
      expect(artifacts).toEqual([])
    })

    it('lists uploads alongside written files, marked apart', () => {
      const { artifacts } = buildPreviewIndex([
        {
          id: 'u1',
          role: 'user',
          content: 'look',
          status: 'complete',
          attachments: [{ kind: 'file', id: 'att-1', name: 'notes.md' }]
        }
      ])
      expect(artifacts).toEqual([
        { id: 'att-1', kind: 'uploaded', name: 'notes.md', messageIndex: 0 }
      ])
    })
  })

  describe('widgets', () => {
    it('picks up charts and forms by their result prefix, with the spec title', () => {
      const { widgets } = index([
        tool({
          name: 'tuff_render_chart',
          id: 'c1',
          output: `${CHART_RESULT_PREFIX}${JSON.stringify({ title: '热度趋势', labels: [] })}`
        }),
        tool({
          name: 'tuff_render_form',
          id: 'f1',
          output: `${FORM_RESULT_PREFIX}${JSON.stringify({ title: '报名', fields: [] })}`
        })
      ])
      expect(widgets).toEqual([
        { id: 'c1', kind: 'chart', title: '热度趋势', messageIndex: 0 },
        { id: 'f1', kind: 'form', title: '报名', messageIndex: 0 }
      ])
    })

    it('marks a model-authored sandbox widget as its own kind', () => {
      // Not `form`: it used to fall through a chart/else ternary in the panel.
      const { widgets } = index([
        tool({
          name: 'tuff_render_widget',
          id: 'w1',
          output: `${WIDGET_RESULT_PREFIX}${JSON.stringify({ title: '计算器', source: 'x' })}`
        })
      ])
      expect(widgets).toEqual([{ id: 'w1', kind: 'sandbox', title: '计算器', messageIndex: 0 }])
    })

    it('still lists a widget whose spec will not parse', () => {
      // The transcript rendered something; dropping it from the index would lie about that.
      const { widgets } = index([
        tool({ name: 'tuff_render_chart', id: 'c1', output: `${CHART_RESULT_PREFIX}{broken` })
      ])
      expect(widgets).toEqual([{ id: 'c1', kind: 'chart', title: undefined, messageIndex: 0 }])
    })

    it('ignores an ordinary tool result', () => {
      expect(index([tool({ name: 'tuff_read_file', output: 'plain text' })]).widgets).toEqual([])
    })
  })

  describe('tool calls', () => {
    it('keeps every call with its status, running and failed included', () => {
      const { toolCalls } = index([
        tool({ name: 'tuff_read_file', id: 't1', summary: 'Read a.txt' }),
        tool({ name: 'tuff_write_file', id: 't2', status: 'error', error: 'nope' }),
        tool({ name: 'tuff_open_path', id: 't3', status: 'running' })
      ])
      expect(toolCalls.map((call) => [call.id, call.status])).toEqual([
        ['t1', 'done'],
        ['t2', 'error'],
        ['t3', 'running']
      ])
      expect(toolCalls[0]?.summary).toBe('Read a.txt')
      expect(toolCalls[1]?.error).toBe('nope')
    })
  })

  describe('sources', () => {
    it('derives a file source from the read tool arguments', () => {
      const { sources } = index([
        tool({
          name: 'tuff_read_file',
          input: JSON.stringify({ path: '/Users/me/a.txt' }),
          output: 'body'
        })
      ])
      expect(sources).toEqual([
        {
          id: 'tuff_read_file-1',
          kind: 'file',
          label: 'a.txt',
          detail: '/Users/me/a.txt',
          messageIndex: 0
        }
      ])
    })

    it('derives one source per search hit and skips the tool talking', () => {
      const { sources } = index([
        tool({
          name: 'tuff_search_files',
          output: 'a.txt\t/x/a.txt\nNo files matched.\nb.txt\t/x/b.txt'
        })
      ])
      expect(sources.map((source) => source.detail)).toEqual(['/x/a.txt', '/x/b.txt'])
      expect(sources.every((source) => source.kind === 'search')).toBe(true)
    })

    it('derives an MCP source from server and tool', () => {
      const { sources } = index([
        tool({ name: 'tuff_mcp_call', input: JSON.stringify({ server: 'ctx7', tool: 'query' }) })
      ])
      expect(sources[0]).toMatchObject({ kind: 'mcp', label: 'query', detail: 'ctx7 / query' })
    })

    it('survives an unparseable tool input instead of emptying the tab', () => {
      const { sources, toolCalls } = index([
        tool({ name: 'tuff_read_file', input: '{"path": "/x/a.tx' })
      ])
      expect(sources).toEqual([])
      // The call itself is still on the record — only the derived source is missing.
      expect(toolCalls).toHaveLength(1)
    })

    it('consumes a sources part directly when one ever arrives', () => {
      const { sources } = index([
        { type: 'sources', sources: [{ id: 's1', url: 'https://x.dev', title: 'X' }] }
      ])
      expect(sources).toEqual([
        { id: 's1', kind: 'web', label: 'X', detail: 'https://x.dev', messageIndex: 0 }
      ])
    })
  })

  it('carries the index of the message each entry came from', () => {
    const { widgets, toolCalls } = index(
      [tool({ name: 'tuff_render_chart', id: 'c1', output: `${CHART_RESULT_PREFIX}{}` })],
      [{ id: 'u1', role: 'user', content: 'hi', status: 'complete' }]
    )
    expect(widgets[0]?.messageIndex).toBe(1)
    expect(toolCalls[0]?.messageIndex).toBe(1)
  })
})
