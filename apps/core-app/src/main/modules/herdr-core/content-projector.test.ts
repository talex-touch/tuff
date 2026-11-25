import type {
  HerdrProjectedConversation,
  HerdrSessionView
} from '@talex-touch/utils/transport/events/herdr'
import type { FSWatcher } from 'node:fs'
import type { NativeSessionDiscoveryRoots } from '../local-ai-cli/native-session-discovery'
import { EventEmitter } from 'node:events'
import { appendFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  detectProjectedProvider,
  HerdrNativeSessionProjector,
  parseNativeSessionJsonlLines
} from './content-projector'

let tempDir: string
let projectRoot: string
let roots: NativeSessionDiscoveryRoots

async function writeJsonl(filePath: string, lines: readonly unknown[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8')
}

function makeSession(overrides: Partial<HerdrSessionView> = {}): HerdrSessionView {
  return {
    address: 't1',
    machine: null,
    name: null,
    title: '',
    argv: ['claude'],
    cwd: projectRoot,
    foregroundName: 'claude',
    foregroundCwd: projectRoot,
    foregroundPid: 100,
    state: 'live',
    status: null,
    statusMs: null,
    reported: false,
    turn: 0,
    keep: false,
    template: null,
    parent: null,
    labels: {},
    cols: 80,
    rows: 24,
    pid: 100,
    exitCode: null,
    signal: null,
    reason: null,
    screen: 'exact',
    createdMs: Date.parse('2026-03-01T10:00:00.000Z'),
    finishedMs: null,
    ...overrides
  }
}

beforeEach(async () => {
  tempDir = await realpath(await mkdtemp(join(tmpdir(), 'herdr-projector-')))
  const proj = join(tempDir, 'workspace')
  await mkdir(proj, { recursive: true })
  projectRoot = await realpath(proj)

  const rootsBase = join(tempDir, 'roots')
  roots = {
    pi: join(rootsBase, 'pi'),
    'oh-my-pi': join(rootsBase, 'omp'),
    claude: join(rootsBase, 'claude'),
    codex: join(rootsBase, 'codex')
  }
  await Promise.all(Object.values(roots).map((dir) => mkdir(dir, { recursive: true })))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('HerdrNativeSessionProjector', () => {
  it('detects claude, codex, pi, and oh-my-pi providers and returns null for plain shells', () => {
    expect(
      detectProjectedProvider(makeSession({ foregroundName: 'claude', argv: ['/bin/zsh'] }))
    ).toBe('claude')
    expect(detectProjectedProvider(makeSession({ foregroundName: 'codex', argv: [] }))).toBe(
      'codex'
    )
    expect(detectProjectedProvider(makeSession({ foregroundName: 'omp', argv: [] }))).toBe(
      'oh-my-pi'
    )
    expect(
      detectProjectedProvider(
        makeSession({ foregroundName: 'node', argv: ['node', '/usr/bin/pi'] })
      )
    ).toBe('pi')
    expect(
      detectProjectedProvider(makeSession({ foregroundName: 'zsh', argv: ['/bin/zsh'] }))
    ).toBeNull()
  })

  it('correlates and parses Claude Code JSONL with thinking, tool_use, and tool_result correlation', async () => {
    const claudeId = '11111111-2222-3333-4444-555555555555'
    await writeJsonl(join(roots.claude, `${claudeId}.jsonl`), [
      {
        type: 'user',
        uuid: 'u1',
        sessionId: claudeId,
        cwd: projectRoot,
        timestamp: '2026-03-01T10:00:01.000Z',
        message: { role: 'user', content: 'Fix the failing test' }
      },
      {
        type: 'assistant',
        uuid: 'a1',
        sessionId: claudeId,
        cwd: projectRoot,
        timestamp: '2026-03-01T10:00:02.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Checking the test file first' },
            { type: 'text', text: 'Let me read the test.' },
            { type: 'tool_use', id: 'tu-1', name: 'Read', input: { path: 'app.test.ts' } }
          ]
        }
      },
      {
        type: 'user',
        uuid: 'u2',
        sessionId: claudeId,
        cwd: projectRoot,
        timestamp: '2026-03-01T10:00:03.000Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'expect(1).toBe(2)' }]
        }
      }
    ])

    const session = makeSession({ address: 't1', foregroundName: 'claude' })
    const projector = new HerdrNativeSessionProjector({
      getSession: (addr) => (addr === 't1' ? session : null),
      roots
    })

    const conv = await projector.projectAddress('t1')
    expect(conv.available).toBe(true)
    expect(conv.provider).toBe('claude')
    expect(conv.nativeSessionId).toBe(claudeId)
    expect(conv.messages).toHaveLength(2)
    expect(conv.messages[0]).toMatchObject({ role: 'user', text: 'Fix the failing test' })
    expect(conv.messages[1]).toMatchObject({
      role: 'assistant',
      text: 'Let me read the test.',
      reasoning: 'Checking the test file first',
      toolCalls: [
        {
          id: 'tu-1',
          name: 'Read',
          status: 'completed',
          argsPreview: '{"path":"app.test.ts"}',
          outputPreview: 'expect(1).toBe(2)'
        }
      ]
    })
  })

  it('correlates and parses Codex, Pi, and OMP JSONL formats with tool results', async () => {
    await writeJsonl(join(roots.codex, 'codex-abc.jsonl'), [
      {
        type: 'session_meta',
        payload: { id: 'codex-abc', cwd: projectRoot, timestamp: '2026-03-01T10:00:00.000Z' }
      },
      {
        type: 'response_item',
        timestamp: '2026-03-01T10:00:01.000Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Run tests' }]
        }
      },
      {
        type: 'response_item',
        timestamp: '2026-03-01T10:00:02.000Z',
        payload: { type: 'reasoning', summary: [{ text: 'Need vitest' }] }
      },
      {
        type: 'response_item',
        timestamp: '2026-03-01T10:00:03.000Z',
        payload: {
          type: 'function_call',
          call_id: 'fc-1',
          name: 'shell',
          arguments: '{"cmd":"vitest"}'
        }
      },
      {
        type: 'response_item',
        timestamp: '2026-03-01T10:00:04.000Z',
        payload: { type: 'function_call_output', call_id: 'fc-1', output: 'All passed' }
      }
    ])

    await writeJsonl(join(roots.pi, 'pi-sess.jsonl'), [
      {
        type: 'session',
        version: 3,
        id: 'pi-sess',
        cwd: projectRoot,
        timestamp: '2026-03-01T10:00:00.000Z'
      },
      { type: 'message', id: 'm1', message: { role: 'user', content: 'Inspect build' } },
      {
        type: 'message',
        id: 'm2',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Checking package.json' },
            { type: 'toolCall', id: 'pc-1', name: 'read', arguments: { path: 'package.json' } }
          ]
        }
      },
      {
        type: 'message',
        id: 'm3',
        message: {
          role: 'toolResult',
          toolCallId: 'pc-1',
          toolName: 'read',
          isError: true,
          content: 'ENOENT'
        }
      }
    ])

    const sessions = new Map<string, HerdrSessionView>([
      ['t-codex', makeSession({ address: 't-codex', foregroundName: 'codex', argv: ['codex'] })],
      ['t-pi', makeSession({ address: 't-pi', foregroundName: 'pi', argv: ['pi'] })]
    ])
    const projector = new HerdrNativeSessionProjector({
      getSession: (addr) => sessions.get(addr) ?? null,
      roots
    })

    const codexConv = await projector.projectAddress('t-codex')
    expect(codexConv.available).toBe(true)
    expect(codexConv.provider).toBe('codex')
    expect(codexConv.messages[1]).toMatchObject({
      role: 'assistant',
      reasoning: 'Need vitest',
      toolCalls: [{ id: 'fc-1', name: 'shell', status: 'completed', outputPreview: 'All passed' }]
    })

    const piConv = await projector.projectAddress('t-pi')
    expect(piConv.available).toBe(true)
    expect(piConv.provider).toBe('pi')
    expect(piConv.messages[1]).toMatchObject({
      role: 'assistant',
      reasoning: 'Checking package.json',
      toolCalls: [
        { id: 'pc-1', name: 'read', status: 'failed', isError: true, outputPreview: 'ENOENT' }
      ]
    })
  })

  it('gracefully returns available: false for remote machines and non-agent shells without errors', async () => {
    const sessions = new Map<string, HerdrSessionView>([
      ['vps/t1', makeSession({ address: 'vps/t1', machine: 'vps', foregroundName: 'claude' })],
      ['t-sh', makeSession({ address: 't-sh', foregroundName: 'zsh', argv: ['/bin/zsh'] })]
    ])
    const projector = new HerdrNativeSessionProjector({
      getSession: (addr) => sessions.get(addr) ?? null,
      roots
    })

    const remote = await projector.projectAddress('vps/t1')
    expect(remote).toMatchObject({
      address: 'vps/t1',
      provider: 'claude',
      available: false,
      messages: []
    })

    const shell = await projector.projectAddress('t-sh')
    expect(shell).toMatchObject({ address: 't-sh', provider: null, available: false, messages: [] })
  })

  it('bounds tail reads to maxTailBytes, ignores malformed lines, watches updates with debounce, and cleans up watchers', async () => {
    const piFile = join(roots.pi, 'pi-watch.jsonl')
    const fillerLines = Array.from({ length: 40 }, (_, i) => ({
      type: 'message',
      id: `m-${i}`,
      message: { role: 'user', content: `message ${i} ${'x'.repeat(200)}` }
    }))
    await writeJsonl(piFile, [
      {
        type: 'session',
        version: 3,
        id: 'pi-watch',
        cwd: projectRoot,
        timestamp: '2026-03-01T10:00:00.000Z'
      },
      ...fillerLines
    ])

    const watchListeners: Array<() => void> = []
    const closeSpy = vi.fn()
    const fakeWatch = vi.fn((_path: string, listener: () => void) => {
      watchListeners.push(listener)
      const watcher = new EventEmitter() as EventEmitter & { close: () => void }
      watcher.close = closeSpy
      return watcher as unknown as FSWatcher
    })

    const session = makeSession({ address: 't-watch', foregroundName: 'pi', argv: ['pi'] })
    const projector = new HerdrNativeSessionProjector({
      getSession: (addr) => (addr === 't-watch' ? session : null),
      roots,
      maxTailBytes: 2048,
      debounceMs: 25,
      watchFile: fakeWatch
    })

    const updates: HerdrProjectedConversation[] = []
    const initial = await projector.watch('t-watch', 77, {
      limit: 5,
      onUpdate: (conv) => updates.push(conv)
    })

    expect(initial.available).toBe(true)
    expect(initial.truncated).toBe(true)
    expect(initial.messages).toHaveLength(5)
    expect(fakeWatch).toHaveBeenCalledTimes(1)

    // Append malformed JSON + valid new assistant message, then fire fs.watch event.
    await appendFile(
      piFile,
      `{not-valid-json\n${JSON.stringify({
        type: 'message',
        id: 'm-new',
        message: { role: 'assistant', content: 'Fresh reply' }
      })}\n`,
      'utf8'
    )
    watchListeners[0]?.()

    await vi.waitFor(() => {
      expect(updates.length).toBeGreaterThanOrEqual(1)
    })
    expect(updates[updates.length - 1]!.messages.at(-1)).toMatchObject({
      role: 'assistant',
      text: 'Fresh reply'
    })

    // Unwatching owner tears down fs.watch handle cleanly.
    projector.unwatchOwner(77)
    expect(closeSpy).toHaveBeenCalledTimes(1)
    expect(projector.watchedAddressCount).toBe(0)
  })

  it('preserves chronological interleaved parts across Claude, Codex, and Pi turns without breaking legacy fields', () => {
    const claudeResult = parseNativeSessionJsonlLines('claude', [
      JSON.stringify({
        type: 'assistant',
        uuid: 'a-interleaved',
        timestamp: '2026-03-01T10:00:02.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Step 1 thought' },
            { type: 'text', text: 'Inspecting file' },
            { type: 'tool_use', id: 'tu-1', name: 'Read', input: { path: 'a.ts' } },
            { type: 'text', text: 'Running tests now' },
            { type: 'tool_use', id: 'tu-2', name: 'Bash', input: { cmd: 'pnpm test' } }
          ]
        }
      }),
      JSON.stringify({
        type: 'user',
        uuid: 'u-results',
        timestamp: '2026-03-01T10:00:03.000Z',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu-1', content: 'x'.repeat(1000) },
            { type: 'tool_result', tool_use_id: 'tu-2', content: 'PASS' }
          ]
        }
      })
    ])

    expect(claudeResult.messages).toHaveLength(1)
    expect(claudeResult.messages[0]).toMatchObject({
      role: 'assistant',
      text: 'Inspecting file\nRunning tests now',
      reasoning: 'Step 1 thought',
      parts: [
        { type: 'reasoning', text: 'Step 1 thought' },
        { type: 'text', text: 'Inspecting file' },
        { type: 'tool-call', toolCallId: 'tu-1' },
        { type: 'text', text: 'Running tests now' },
        { type: 'tool-call', toolCallId: 'tu-2' }
      ]
    })
    // Wider preview keeps 1000-char tool output untruncated.
    expect(claudeResult.messages[0]?.toolCalls?.[0]?.outputPreview).toBe('x'.repeat(1000))

    const codexResult = parseNativeSessionJsonlLines('codex', [
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-03-01T10:00:01.000Z',
        payload: { type: 'reasoning', summary: [{ text: 'Think 1' }] }
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-03-01T10:00:02.000Z',
        payload: { type: 'function_call', call_id: 'fc-1', name: 'read', arguments: '{"p":1}' }
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-03-01T10:00:03.000Z',
        payload: { type: 'reasoning', summary: [{ text: 'Think 2' }] }
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-03-01T10:00:04.000Z',
        payload: { type: 'function_call', call_id: 'fc-2', name: 'edit', arguments: '{"p":2}' }
      })
    ])

    expect(codexResult.messages).toHaveLength(1)
    expect(codexResult.messages[0]?.parts).toEqual([
      { type: 'reasoning', text: 'Think 1' },
      { type: 'tool-call', toolCallId: 'fc-1' },
      { type: 'reasoning', text: 'Think 2' },
      { type: 'tool-call', toolCallId: 'fc-2' }
    ])

    const piResult = parseNativeSessionJsonlLines('oh-my-pi', [
      JSON.stringify({
        type: 'message',
        id: 'omp-1',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Plan' },
            { type: 'toolCall', id: 'tc-1', name: 'grep', arguments: { q: 'herdr' } },
            { type: 'text', text: 'Found 3 matches.' }
          ]
        }
      })
    ])

    expect(piResult.messages[0]?.parts).toEqual([
      { type: 'reasoning', text: 'Plan' },
      { type: 'tool-call', toolCallId: 'tc-1' },
      { type: 'text', text: 'Found 3 matches.' }
    ])
  })
})
