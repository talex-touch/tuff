import type { AiMessagePart } from '@talex-touch/tuffex/ai-elements'
import type { StoredConversationMessage } from './conversation-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceMessageAssembler } from './workspace-message-assembler'

// Keep the real runtime sanitizer. Only its unused Electron/tool/network host boundaries are
// isolated, using the neighboring runtime-host test convention; no module registry escapes a file.
vi.mock('electron', () => ({ app: {}, utilityProcess: {} }))
vi.mock('../ai/agents', () => ({ agentManager: {}, toolRegistry: {} }))
vi.mock('../ai/intelligence-sdk', () => ({ tuffIntelligence: {} }))
vi.mock('../ai/intelligence-mcp-registry', () => ({ intelligenceMcpRegistry: {} }))

let assembler: WorkspaceMessageAssembler
beforeEach(() => {
  const message: StoredConversationMessage = {
    id: 'assistant',
    role: 'assistant',
    content: '',
    status: 'streaming',
    seq: 2,
    createdAt: 1,
    meta: { conversationId: 'thread' }
  }
  assembler = new WorkspaceMessageAssembler(message, 'turn')
})
afterEach(() => vi.restoreAllMocks())

function persisted() {
  // Cross the same JSON serialization boundary as conversation message metadata.
  return JSON.parse(JSON.stringify(assembler.snapshot())) as StoredConversationMessage & {
    meta: Record<string, unknown> & { parts: AiMessagePart[] }
  }
}
function result(callId: string, output = 'reviewed 3 files', isError = false) {
  assembler.part({ kind: 'tool-result', callId, name: 'file.review', output, isError })
}

describe('WorkspaceMessageAssembler durable consumer output', () => {
  it.each([false, true])(
    'replayed tool starts retain exactly one card and never downgrade the result (error=%s)',
    (isError) => {
      assembler.part({ kind: 'tool-start', callId: 'review-1', name: 'file.review' })
      assembler.part({ kind: 'tool-start', callId: 'review-1', name: 'file.review' })
      result('review-1', isError ? 'Permission denied' : 'reviewed 3 files', isError)
      assembler.part({ kind: 'tool-start', callId: 'review-1', name: 'file.review' })
      assembler.delta('Finished.')
      assembler.complete('Finished.')
      expect(persisted().meta.parts).toEqual([
        {
          type: 'tool-call',
          id: 'review-1',
          name: 'file.review',
          status: isError ? 'error' : 'done',
          ...(isError ? { error: 'Permission denied' } : { output: 'reviewed 3 files' })
        },
        { type: 'text', text: 'Finished.' }
      ])
    }
  )

  it('commit/reset preserves committed text and tool result while removing every provisional tail', () => {
    assembler.delta('Checked inputs. ')
    assembler.part({ kind: 'tool-start', callId: 'kept', name: 'file.review' })
    result('kept')
    assembler.delta('Recorded changes. ')
    assembler.part({ kind: 'message-commit' })
    assembler.delta('abandoned attempt')
    assembler.part({ kind: 'tool-start', callId: 'discarded', name: 'file.review' })
    assembler.part({ kind: 'reasoning-start' })
    assembler.part({ kind: 'reasoning-delta', delta: 'provisional reasoning' })
    assembler.part({ kind: 'text-reset' })
    assembler.delta('Final answer.')
    assembler.complete()
    const saved = persisted()
    expect(saved.content).toBe('Checked inputs. Recorded changes. Final answer.')
    expect(saved.meta.parts).toEqual([
      { type: 'text', text: 'Checked inputs. ' },
      {
        type: 'tool-call',
        id: 'kept',
        name: 'file.review',
        status: 'done',
        output: 'reviewed 3 files'
      },
      { type: 'text', text: 'Recorded changes. Final answer.' }
    ])
    expect(saved.status).toBe('complete')
    expect(saved.meta.outcome).toBe('completed')
  })

  it('a commit before parts exist still preserves the text when a provisional tool opens then resets', () => {
    assembler.delta('Committed prefix. ')
    assembler.part({ kind: 'message-commit' })
    assembler.delta('discarded')
    assembler.part({ kind: 'tool-start', callId: 'provisional', name: 'file.review' })
    assembler.part({ kind: 'text-reset' })
    assembler.delta('Replacement.')
    assembler.complete()
    expect(persisted().content).toBe('Committed prefix. Replacement.')
    expect(persisted().meta.parts).toEqual([
      { type: 'text', text: 'Committed prefix. Replacement.' }
    ])
  })

  it.each([
    { name: 'same whole answer', streamed: 'The answer.', final: 'The answer.' },
    { name: 'whole answer extends deltas', streamed: 'The ', final: 'The answer.' },
    {
      name: 'whole answer replaces provisional wording',
      streamed: 'Abandoned answer.',
      final: 'Correct answer.'
    }
  ])('$name appears once and retains a completed tool result', ({ streamed, final }) => {
    assembler.part({ kind: 'tool-start', callId: 'review-1', name: 'file.review' })
    result('review-1')
    assembler.delta(streamed)
    assembler.complete(final)
    const saved = persisted()
    expect(saved.content).toBe(final)
    expect(
      saved.meta.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('')
    ).toBe(final)
    expect(saved.meta.parts.filter((part) => part.type === 'tool-call')).toEqual([
      {
        type: 'tool-call',
        id: 'review-1',
        name: 'file.review',
        status: 'done',
        output: 'reviewed 3 files'
      }
    ])
    expect(saved.status).toBe('complete')
  })

  it('the invocation whole answer replaces only provisional text after a committed tool loop', () => {
    assembler.delta('Verified. ')
    result('review-1')
    assembler.part({ kind: 'message-commit' })
    assembler.delta('wrong tail')
    assembler.complete('Verified. Correct tail.')
    expect(persisted().content).toBe('Verified. Correct tail.')
    expect(persisted().meta.parts).toEqual([
      { type: 'text', text: 'Verified. ' },
      {
        type: 'tool-call',
        id: 'review-1',
        name: 'file.review',
        status: 'done',
        output: 'reviewed 3 files'
      },
      { type: 'text', text: 'Correct tail.' }
    ])
  })

  it('interruption closes only open reasoning/tools and preserves completed success and error evidence', () => {
    assembler.part({ kind: 'reasoning-start' })
    assembler.part({ kind: 'reasoning-delta', delta: 'Settled analysis' })
    assembler.part({ kind: 'reasoning-end', durationMs: 37 })
    result('completed')
    result('failed', 'Denied by policy', true)
    assembler.part({ kind: 'tool-start', callId: 'open', name: 'file.review' })
    assembler.part({ kind: 'reasoning-start' })
    assembler.part({ kind: 'reasoning-delta', delta: 'Unfinished analysis' })
    assembler.delta('Partial answer')
    assembler.part({ kind: 'compaction-start' })
    assembler.fail('RUN_INTERRUPTED', 'interrupted')
    const saved = persisted()
    expect(saved.content).toBe('Partial answer')
    expect(saved.status).toBe('failed')
    expect(saved.meta).toMatchObject({ outcome: 'interrupted', errorCode: 'RUN_INTERRUPTED' })
    expect(saved.meta.parts).toEqual([
      { type: 'reasoning', text: 'Settled analysis', done: true, durationMs: 37 },
      {
        type: 'tool-call',
        id: 'completed',
        name: 'file.review',
        status: 'done',
        output: 'reviewed 3 files'
      },
      {
        type: 'tool-call',
        id: 'failed',
        name: 'file.review',
        status: 'error',
        error: 'Denied by policy'
      },
      {
        type: 'tool-call',
        id: 'open',
        name: 'file.review',
        status: 'error',
        error: 'TOOL_EXECUTION_INTERRUPTED'
      },
      { type: 'reasoning', text: 'Unfinished analysis', done: true },
      { type: 'text', text: 'Partial answer' }
    ])
    expect(assembler.isCompacting).toBe(false)
  })

  it('SDK end fallback zero counters are not measured provider usage', () => {
    assembler.applyStream({
      type: 'end',
      capabilityId: 'text.chat',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    })
    const saved = persisted()
    for (const key of ['promptTokens', 'completionTokens', 'totalTokens', 'usageSource'])
      expect(saved.meta).not.toHaveProperty(key)
    expect(assembler.hasProviderActivity).toBe(false)
  })

  it('raw usage survives an SDK end fallback; provider-reported zero is measured, not unknown', () => {
    assembler.applyStream({
      type: 'usage',
      capabilityId: 'text.chat',
      usage: { promptTokens: 19, completionTokens: 0, totalTokens: 19 }
    })
    assembler.applyStream({
      type: 'end',
      capabilityId: 'text.chat',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    })
    expect(persisted().meta).toMatchObject({
      promptTokens: 19,
      completionTokens: 0,
      totalTokens: 19,
      usageSource: 'provider'
    })
    expect(assembler.hasProviderActivity).toBe(true)
  })

  it('invalid raw counters cannot replace previously measured usage', () => {
    assembler.applyStream({
      type: 'usage',
      capabilityId: 'text.chat',
      usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 }
    })
    assembler.applyStream({
      type: 'usage',
      capabilityId: 'text.chat',
      usage: { promptTokens: NaN, completionTokens: -1, totalTokens: Infinity }
    })
    expect(persisted().meta).toMatchObject({
      promptTokens: 7,
      completionTokens: 3,
      totalTokens: 10,
      usageSource: 'provider'
    })
  })

  it('persisted tool input redacts nested credential/path values while retaining non-sensitive results', () => {
    assembler.part({ kind: 'tool-start', callId: 'review-1', name: 'file.review' })
    assembler.part({
      kind: 'tool-input-end',
      callId: 'review-1',
      input: {
        count: 3,
        nested: {
          apiKey: 'synthetic-secret-canary',
          workspacePath: '/Users/private/project.txt',
          note: 'ready'
        }
      }
    })
    result('review-1')
    const tool = persisted().meta.parts.find((part) => part.type === 'tool-call')!
    expect(tool.type).toBe('tool-call')
    if (tool.type !== 'tool-call') throw new Error('Expected tool card')
    expect(JSON.parse(tool.input!)).toEqual({
      count: 3,
      nested: { apiKey: '[redacted]', workspacePath: '[redacted]', note: 'ready' }
    })
    expect(tool.output).toBe('reviewed 3 files')
  })

  it.each([
    {
      name: 'credential output',
      value: 'Authorization: Bearer synthetic-credential-canary',
      isError: false
    },
    {
      name: 'local path error',
      value: 'failed at /Users/private/native-stack.ts:42',
      isError: true
    }
  ])('$name is sanitized before the durable snapshot', ({ value, isError }) => {
    result('review-1', value, isError)
    expect(persisted().meta.parts).toEqual([
      {
        type: 'tool-call',
        id: 'review-1',
        name: 'file.review',
        status: isError ? 'error' : 'done',
        ...(isError ? { error: '[redacted]' } : { output: '[redacted]' })
      }
    ])
  })

  it('provisional tool-input logs cannot persist a credential before tool-input-end arrives', () => {
    assembler.part({ kind: 'tool-start', callId: 'review-1', name: 'file.review' })
    assembler.part({
      kind: 'tool-input-delta',
      callId: 'review-1',
      delta: 'Authorization: Bearer synthetic-provisional-canary'
    })
    assembler.fail('RUN_INTERRUPTED', 'interrupted')
    const tool = persisted().meta.parts.find((part) => part.type === 'tool-call')!
    if (tool.type !== 'tool-call') throw new Error('Expected tool card')
    expect(tool.logs).toBe('[redacted]')
    expect(tool.error).toBe('TOOL_EXECUTION_INTERRUPTED')
  })

  it('multibyte reasoning stays within the persisted 8 KiB byte budget', () => {
    assembler.part({ kind: 'reasoning-start' })
    assembler.part({ kind: 'reasoning-delta', delta: '中文🙂'.repeat(3000) })
    const reasoning = persisted().meta.parts[0]!
    if (reasoning.type !== 'reasoning') throw new Error('Expected reasoning span')
    expect(reasoning.text.startsWith('中文🙂')).toBe(true)
    expect(reasoning.text.endsWith('\n[truncated]')).toBe(true)
    expect(Buffer.byteLength(reasoning.text, 'utf8')).toBeLessThanOrEqual(8192)
    expect(reasoning.text).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
    )
  })

  it.each(['reasoning', 'input', 'output', 'error', 'logs'] as const)(
    '%s persisted text is bounded and explicitly reports truncation',
    (field) => {
      const text = 'safe prose '.repeat(1200)
      if (field === 'reasoning') {
        assembler.part({ kind: 'reasoning-start' })
        assembler.part({ kind: 'reasoning-delta', delta: text })
      } else {
        assembler.part({ kind: 'tool-start', callId: 'review-1', name: 'file.review' })
        if (field === 'input')
          assembler.part({ kind: 'tool-input-end', callId: 'review-1', input: text })
        else if (field === 'logs')
          assembler.part({ kind: 'tool-input-delta', callId: 'review-1', delta: text })
        else result('review-1', text, field === 'error')
      }
      const part = persisted().meta.parts[0]!
      const value =
        part.type === 'reasoning'
          ? part.text
          : part.type === 'tool-call' && field !== 'reasoning'
            ? part[field]
            : undefined
      expect(value).toBe(text.slice(0, 8192 - '\n[truncated]'.length) + '\n[truncated]')
      expect(Buffer.byteLength(value!)).toBeLessThanOrEqual(8192)
    }
  )
})
