import type { HerdrProjectedConversation } from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { HerdrProjectedSession } from './useHerdrRuntime'
import { describe, expect, it } from 'vitest'
import {
  arrayBufferToBase64,
  composeHerdrMessageWithAttachments,
  fileToHerdrBase64,
  formatHerdrProviderLabel,
  HERDR_ATTACHMENT_TOO_LARGE_CODE,
  HERDR_PUT_MAX_BYTES,
  herdrProjectionToConversationMessages,
  resolveHerdrRunStep,
  sanitizeHerdrUploadName,
  summarizeHerdrToolArgs
} from './herdr-conversation-adapter'

function makeSession(overrides: Partial<HerdrProjectedSession> = {}): HerdrProjectedSession {
  return {
    address: 't1',
    machine: null,
    name: 'claude-dev',
    title: 'Claude Code',
    argv: ['claude'],
    cwd: '/tmp/workspace',
    foregroundName: 'claude',
    foregroundCwd: '/tmp/workspace',
    foregroundPid: 100,
    state: 'live',
    status: { state: 'idle' },
    statusMs: 1_700_000_000_000,
    reported: true,
    turn: 2,
    keep: false,
    template: null,
    parent: null,
    labels: {},
    cols: 120,
    rows: 36,
    pid: 100,
    exitCode: null,
    signal: null,
    reason: null,
    screen: 'exact',
    createdMs: 1_700_000_000_000,
    finishedMs: null,
    projectId: 'p1',
    projectName: 'talex-touch',
    displayTitle: 'Claude Code',
    appName: 'claude',
    locationLabel: 'talex-touch',
    effectiveCwd: '/tmp/workspace',
    ...overrides
  }
}

describe('herdr-conversation-adapter', () => {
  it('maps chronological interleaved parts[] into AiMessagePart[] preserving exact order', () => {
    const projection: HerdrProjectedConversation = {
      address: 't1',
      provider: 'claude',
      nativeSessionId: 's1',
      filePath: '/tmp/s1.jsonl',
      available: true,
      truncated: false,
      updatedAt: 1_700_000_005_000,
      messages: [
        {
          id: 'u1',
          role: 'user',
          text: 'Check tests',
          timestamp: 1_700_000_001_000
        },
        {
          id: 'a1',
          role: 'assistant',
          text: 'Reading first\nAll fixed',
          reasoning: 'Plan step',
          toolCalls: [
            {
              id: 'tc-1',
              name: 'Read',
              status: 'completed',
              argsPreview: '{"path":"src/app.ts"}',
              outputPreview: 'export const ok = true'
            },
            {
              id: 'tc-2',
              name: 'Bash',
              status: 'failed',
              argsPreview: '{"command":"pnpm test"}',
              outputPreview: '1 failed',
              isError: true
            }
          ],
          parts: [
            { type: 'reasoning', text: 'Plan step' },
            { type: 'text', text: 'Reading first' },
            { type: 'tool-call', toolCallId: 'tc-1' },
            { type: 'text', text: 'All fixed' },
            { type: 'tool-call', toolCallId: 'tc-2' }
          ],
          timestamp: 1_700_000_002_000
        }
      ]
    }

    const result = herdrProjectionToConversationMessages(projection, makeSession())
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'u1',
      role: 'user',
      content: 'Check tests',
      status: 'complete'
    })
    expect(result[1]).toMatchObject({
      id: 'a1',
      role: 'assistant',
      status: 'complete',
      meta: { provider: 'Claude Code', coordinator: 'herdr' }
    })
    expect(result[1]?.parts).toEqual([
      { type: 'reasoning', text: 'Plan step', done: true },
      { type: 'text', text: 'Reading first' },
      {
        type: 'tool-call',
        id: 'tc-1',
        name: 'Read',
        status: 'done',
        summary: 'src/app.ts',
        input: '{"path":"src/app.ts"}',
        output: 'export const ok = true'
      },
      { type: 'text', text: 'All fixed' },
      {
        type: 'tool-call',
        id: 'tc-2',
        name: 'Bash',
        status: 'error',
        summary: 'pnpm test',
        input: '{"command":"pnpm test"}',
        error: '1 failed'
      }
    ])
  })

  it('falls back cleanly to reasoning -> text -> toolCalls when parts[] is absent', () => {
    const projection: HerdrProjectedConversation = {
      address: 't1',
      provider: 'codex',
      nativeSessionId: 'c1',
      filePath: '/tmp/c1.jsonl',
      available: true,
      truncated: false,
      updatedAt: 1_700_000_005_000,
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          text: 'Done.',
          reasoning: 'Checking diff',
          toolCalls: [{ id: 'tc-1', name: 'shell', status: 'running', argsPreview: 'git status' }],
          timestamp: 1_700_000_002_000
        }
      ]
    }

    const session = makeSession({ status: { state: 'working', msg: 'Running shell' } })
    const result = herdrProjectionToConversationMessages(projection, session)

    expect(result).toHaveLength(1)
    expect(result[0]?.status).toBe('streaming')
    expect(result[0]?.parts?.map((p) => p.type)).toEqual(['reasoning', 'text', 'tool-call'])
    expect(resolveHerdrRunStep(result, session)).toMatchObject({ kind: 'tool', name: 'shell' })
  })

  it('appends a streaming placeholder when session is working right after a user message', () => {
    const projection: HerdrProjectedConversation = {
      address: 't1',
      provider: 'pi',
      nativeSessionId: 'p1',
      filePath: '/tmp/p1.jsonl',
      available: true,
      truncated: false,
      updatedAt: 1_700_000_005_000,
      messages: [{ id: 'u1', role: 'user', text: 'Explain this', timestamp: 1_700_000_001_000 }]
    }

    const session = makeSession({ status: { state: 'working', msg: 'Analyzing files' } })
    const result = herdrProjectionToConversationMessages(projection, session)

    expect(result).toHaveLength(2)
    expect(result[1]).toMatchObject({
      role: 'assistant',
      status: 'streaming',
      content: ''
    })
    expect(resolveHerdrRunStep(result, session)).toEqual({
      kind: 'thinking',
      title: 'Analyzing files'
    })
  })

  it('formats providers, tool summaries, upload names, base64 payloads, and attachment messages safely', async () => {
    expect(formatHerdrProviderLabel('oh-my-pi')).toBe('Oh-My-Pi')
    expect(summarizeHerdrToolArgs('{"file_path":"/a/b/c.ts"}')).toBe('/a/b/c.ts')
    expect(sanitizeHerdrUploadName('../evil/dir/photo\u0000.png')).toBe('photo.png')

    const bytes = new TextEncoder().encode('hello herdr')
    expect(arrayBufferToBase64(bytes.buffer)).toBe(btoa('hello herdr'))

    const smallFile = new File([bytes], 'note.txt', { type: 'text/plain' })
    expect(await fileToHerdrBase64(smallFile)).toBe(btoa('hello herdr'))

    const hugeFile = {
      size: HERDR_PUT_MAX_BYTES + 1,
      arrayBuffer: async () => new ArrayBuffer(0)
    } as unknown as File
    await expect(fileToHerdrBase64(hugeFile)).rejects.toMatchObject({
      code: HERDR_ATTACHMENT_TOO_LARGE_CODE
    })

    expect(
      composeHerdrMessageWithAttachments('Please review', ['/tmp/a.png', '/tmp/my doc.pdf'])
    ).toBe('Please review\n\n/tmp/a.png\n"/tmp/my doc.pdf"')
    expect(composeHerdrMessageWithAttachments('   ', ['/tmp/a.png'])).toBe('/tmp/a.png')
  })
})
