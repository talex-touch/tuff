import type { PiEntriesSnapshot, PiSessionFileCapture } from './pi-native-session'
/**
 * Pi continuation is "the provider transcript is authoritative and Tuff only counts bytes its own run
 * appended to the exact file it captured". These cases drive verifyPiSessionAppend against real files,
 * because the contract is byte-level: a truncation, a rewrite that swaps the file out from under the
 * capture, a partial flush, or a second writer branching off the same head must all be rejected before
 * the stored head advances. A mocked reader could only re-assert the mock's own bytes.
 */
import {
  appendFile,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  truncate,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  capturePiSessionFile,
  parsePiEntriesResponse,
  parsePiStateResponse,
  verifyPiSessionAppend,
  verifyPiSessionFirstWrite
} from './pi-native-session'

const SESSION_ID = 'pi-native-1'
const BASE_LEAF = 'h2'

interface PiEntry {
  type: string
  id: string
  parentId: string | null
  message?: { role?: string; content?: unknown }
}

function messageEntry(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant',
  text: string
): PiEntry {
  return { type: 'message', id, parentId, message: { role, content: [{ type: 'text', text }] } }
}

function entryLine(entry: PiEntry): string {
  return `${JSON.stringify(entry)}\n`
}

const baseEntries: PiEntry[] = [
  messageEntry('h1', null, 'user', 'first question'),
  messageEntry('h2', 'h1', 'assistant', 'first answer')
]

const appendedUser = messageEntry('u3', BASE_LEAF, 'user', 'second question')
const appendedAssistant = messageEntry('a3', 'u3', 'assistant', 'second answer')
const siblingUser = messageEntry('u4', BASE_LEAF, 'user', 'competing question')
const siblingAssistant = messageEntry('a4', 'u4', 'assistant', 'competing answer')

const validAppend = entryLine(appendedUser) + entryLine(appendedAssistant)
const validPost: PiEntriesSnapshot = {
  entries: [...baseEntries, appendedUser, appendedAssistant],
  leafId: 'a3'
}

let root: string
let sessionFile: string

function sessionContent(entries: PiEntry[], cwd = root, sessionId = SESSION_ID): string {
  const header = `${JSON.stringify({ type: 'session', id: sessionId, cwd })}\n`
  return header + entries.map(entryLine).join('')
}

async function writeSession(
  entries: PiEntry[],
  overrides: { sessionId?: string; cwd?: string } = {}
): Promise<void> {
  await writeFile(sessionFile, sessionContent(entries, overrides.cwd ?? root, overrides.sessionId))
}

function verifyAppend(capture: PiSessionFileCapture, post: PiEntriesSnapshot): Promise<string> {
  return verifyPiSessionAppend({
    capture,
    capturedHead: BASE_LEAF,
    beforeEntryIds: new Set(baseEntries.map((entry) => entry.id)),
    post
  })
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'pi-native-session-')))
  sessionFile = join(root, 'session.jsonl')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('capturePiSessionFile', () => {
  it('rejects a header naming another session, another project root, or a file that is gone', async () => {
    await writeSession(baseEntries, { sessionId: 'someone-else' })
    await expect(capturePiSessionFile(sessionFile, SESSION_ID, root)).rejects.toThrow(
      'NATIVE_SESSION_CONFLICT'
    )

    const otherRoot = join(root, 'other-project')
    await mkdir(otherRoot, { recursive: true })
    await writeSession(baseEntries, { cwd: otherRoot })
    await expect(capturePiSessionFile(sessionFile, SESSION_ID, root)).rejects.toThrow(
      'NATIVE_SESSION_CONFLICT'
    )

    await rm(sessionFile)
    await expect(capturePiSessionFile(sessionFile, SESSION_ID, root)).rejects.toThrow(
      'NATIVE_SESSION_CONFLICT'
    )
  })

  it('pins the captured boundary to the exact bytes already on disk', async () => {
    await writeSession(baseEntries)

    const capture = await capturePiSessionFile(sessionFile, SESSION_ID, root)

    expect(capture.size).toBe(Buffer.byteLength(sessionContent(baseEntries)))
    expect(capture.path).toBe(await realpath(sessionFile))
  })
})

describe('pi RPC snapshot parsing', () => {
  it('accepts only a successful get_state response carrying both id and file', () => {
    expect(
      parsePiStateResponse({
        type: 'response',
        command: 'get_state',
        success: true,
        data: { sessionId: 's-1', sessionFile: '/tmp/s.jsonl' }
      })
    ).toEqual({ sessionId: 's-1', sessionFile: '/tmp/s.jsonl' })
    expect(
      parsePiStateResponse({
        type: 'response',
        command: 'get_state',
        success: false,
        data: { sessionId: 's-1', sessionFile: '/tmp/s.jsonl' }
      })
    ).toBeNull()
    expect(
      parsePiStateResponse({
        type: 'response',
        command: 'get_state',
        success: true,
        data: { sessionId: 's-1' }
      })
    ).toBeNull()
    expect(
      parsePiStateResponse({
        type: 'response',
        command: 'get_entries',
        success: true,
        data: { entries: [], leafId: null }
      })
    ).toBeNull()
  })

  it('accepts only entry arrays whose ids and parents are well typed', () => {
    expect(
      parsePiEntriesResponse({
        type: 'response',
        command: 'get_entries',
        success: true,
        data: { entries: [], leafId: null }
      })
    ).toEqual({ entries: [], leafId: null })
    expect(
      parsePiEntriesResponse({
        type: 'response',
        command: 'get_entries',
        success: true,
        data: {
          entries: [{ type: 'message', id: 'a', parentId: BASE_LEAF, message: { role: 'user' } }],
          leafId: 'a'
        }
      })
    ).toEqual({
      entries: [{ type: 'message', id: 'a', parentId: BASE_LEAF, message: { role: 'user' } }],
      leafId: 'a'
    })
    expect(
      parsePiEntriesResponse({
        type: 'response',
        command: 'get_entries',
        success: true,
        data: { entries: [{ type: 'message', parentId: null }], leafId: null }
      })
    ).toBeNull()
    expect(
      parsePiEntriesResponse({
        type: 'response',
        command: 'get_entries',
        success: true,
        data: { entries: [], leafId: 7 }
      })
    ).toBeNull()
  })
})

describe('verifyPiSessionAppend', () => {
  it('accepts exactly one user/assistant pair appended to the captured head', async () => {
    await writeSession(baseEntries)
    const capture = await capturePiSessionFile(sessionFile, SESSION_ID, root)

    await appendFile(sessionFile, validAppend)

    // The pre-existing bytes include the `session` header, so a reader that started at offset 0
    // instead of the captured boundary could not return a head here.
    await expect(verifyAppend(capture, validPost)).resolves.toBe('a3')
  })

  it.each([
    {
      name: 'a second child branching off the captured head',
      append: validAppend + entryLine(siblingUser) + entryLine(siblingAssistant),
      post: {
        entries: [...validPost.entries, siblingUser, siblingAssistant],
        leafId: 'a4'
      } satisfies PiEntriesSnapshot
    },
    {
      name: 'an assistant entry the provider never wrote to the file',
      append: entryLine(appendedUser),
      post: validPost
    },
    {
      name: 'a leaf the appended bytes do not contain',
      append: validAppend,
      post: { ...validPost, leafId: BASE_LEAF } satisfies PiEntriesSnapshot
    },
    {
      name: 'a null leaf',
      append: validAppend,
      post: { ...validPost, leafId: null } satisfies PiEntriesSnapshot
    },
    {
      name: 'a duplicated entry id inside the appended bytes',
      append: validAppend + entryLine(appendedAssistant),
      post: {
        entries: [...validPost.entries, appendedAssistant],
        leafId: 'a3'
      } satisfies PiEntriesSnapshot
    },
    {
      name: 'an append that carries no entries at all',
      append: '\n',
      post: validPost
    },
    {
      name: 'a partially flushed line without a trailing newline',
      append: validAppend.trimEnd(),
      post: validPost
    },
    {
      name: 'a malformed JSONL line',
      append: '{not json\n',
      post: validPost
    },
    {
      name: 'a session header smuggled into the appended region',
      append: `${JSON.stringify({ type: 'session', id: 'rewritten', parentId: null })}\n${validAppend}`,
      post: validPost
    },
    {
      name: 'an append beyond the 1 MiB ceiling',
      append:
        entryLine(messageEntry('u3', BASE_LEAF, 'user', 'x'.repeat(1_048_576))) +
        entryLine(appendedAssistant),
      post: validPost
    }
  ])('rejects $name', async ({ append, post }) => {
    await writeSession(baseEntries)
    const capture = await capturePiSessionFile(sessionFile, SESSION_ID, root)

    await appendFile(sessionFile, append)

    await expect(verifyAppend(capture, post)).rejects.toThrow('NATIVE_SESSION_CONFLICT')
  })

  it('rejects a truncated file whose append region is gone', async () => {
    await writeSession(baseEntries)
    const capture = await capturePiSessionFile(sessionFile, SESSION_ID, root)

    await truncate(sessionFile, capture.size - 4)

    await expect(verifyAppend(capture, validPost)).rejects.toThrow('NATIVE_SESSION_CONFLICT')
  })

  it('rejects a file that was replaced after the capture', async () => {
    await writeSession(baseEntries)
    const capture = await capturePiSessionFile(sessionFile, SESSION_ID, root)

    // A concurrently created file has its own inode, so the swap is observable even though the
    // bytes at the captured path look like a legitimate append.
    const replacement = join(root, 'replacement.jsonl')
    await writeFile(replacement, sessionContent(baseEntries) + validAppend)
    await rename(replacement, sessionFile)

    await expect(verifyAppend(capture, validPost)).rejects.toThrow('NATIVE_SESSION_CONFLICT')
  })
})

/**
 * A new session as pi 0.84.3 runs it: the model and thinking-level entries exist in memory before
 * the prompt, and the file appears, whole, with the first assistant reply.
 */
describe('verifyPiSessionFirstWrite', () => {
  const model: PiEntry = { type: 'model_change', id: 'm1', parentId: null }
  const thinking: PiEntry = { type: 'thinking_level_change', id: 't1', parentId: 'm1' }
  const user = messageEntry('u1', 't1', 'user', 'only reply OK')
  const assistant = messageEntry('a1', 'u1', 'assistant', 'OK')
  const before: PiEntriesSnapshot = { entries: [model, thinking], leafId: 't1' }
  const post: PiEntriesSnapshot = { entries: [user, assistant], leafId: 'a1' }

  function verifyFirstWrite(snapshot: PiEntriesSnapshot = post): Promise<string> {
    return verifyPiSessionFirstWrite({
      sessionFile,
      nativeSessionId: SESSION_ID,
      projectRoot: root,
      before,
      post: snapshot
    })
  }

  it('accepts the file pi wrote with the first reply, from its header on', async () => {
    await writeSession([model, thinking, user, assistant])

    await expect(verifyFirstWrite()).resolves.toBe('a1')
  })

  it.each([
    { name: 'a file pi never wrote', entries: null },
    {
      name: 'a header naming another session',
      entries: [model, thinking, user, assistant],
      overrides: { sessionId: 'someone-else' }
    },
    {
      name: 'a header from another workspace',
      entries: [model, thinking, user, assistant],
      overrides: { cwd: tmpdir() }
    },
    {
      name: 'entries other than the ones reported before the prompt',
      entries: [{ ...model, id: 'm9' }, { ...thinking, parentId: 'm9' }, user, assistant]
    },
    {
      name: 'a second branch off the captured head',
      entries: [model, thinking, user, assistant, messageEntry('u2', 't1', 'user', 'again')]
    },
    {
      name: 'a head get_entries does not report',
      entries: [model, thinking, user, assistant],
      post: { entries: [user], leafId: 'u1' } satisfies PiEntriesSnapshot
    }
  ])('rejects $name', async ({ entries, overrides, post: snapshot }) => {
    if (entries) await writeSession(entries, overrides)

    await expect(verifyFirstWrite(snapshot)).rejects.toThrow('NATIVE_SESSION_CONFLICT')
  })
})
