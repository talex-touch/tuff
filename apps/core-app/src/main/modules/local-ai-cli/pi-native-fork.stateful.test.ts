import type { PreparedPiNativeFork } from './pi-native-fork'
import type { StoredLocalAiCliSession } from './session-store'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as discovery from './native-session-discovery'
import { nativeSessionLeaseRegistry } from './native-session-lease'
import { preparePiNativeFork } from './pi-native-fork'

const sourceId = '11111111-2222-4333-8444-555555555555'
const entries = [
  {
    type: 'model_change',
    id: 'model',
    parentId: null,
    provider: 'custom-provider',
    modelId: 'private-model',
    extension: { keep: true }
  },
  { type: 'thinking_level_change', id: 'thinking', parentId: 'model', thinkingLevel: 'high' },
  {
    type: 'message',
    id: 'user',
    parentId: 'thinking',
    message: { role: 'user', content: [{ type: 'text', text: '保留原始 bytes' }] }
  },
  {
    type: 'message',
    id: 'assistant',
    parentId: 'user',
    message: {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'call', name: 'read', arguments: { path: 'x' } }],
      stopReason: 'toolUse',
      provider: 'custom-provider',
      model: 'private-model'
    }
  },
  {
    type: 'message',
    id: 'result',
    parentId: 'assistant',
    message: { role: 'toolResult', toolCallId: 'call', content: [{ type: 'text', text: 'ok' }] }
  },
  {
    type: 'compaction',
    id: 'compact',
    parentId: 'result',
    firstKeptEntryId: 'user',
    summary: 'summary',
    tokensBefore: 42,
    details: { unknown: ['preserve'] }
  },
  {
    type: 'future_legal_entry',
    id: 'unknown',
    parentId: 'compact',
    references: { nativeEntryId: 'assistant' },
    extra: ['未知', 7]
  },
  {
    type: 'message',
    id: 'branch',
    parentId: 'user',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'branch answer' }],
      stopReason: 'stop'
    }
  }
]

let root: string
let archive: string
let sourceFile: string
let pointer: StoredLocalAiCliSession
let prepared: PreparedPiNativeFork[]
let releases: Array<() => void>

function content(rows: unknown[] = entries, header: Record<string, unknown> = {}): string {
  return (
    JSON.stringify({
      type: 'session',
      version: 3,
      id: sourceId,
      cwd: root,
      timestamp: '2026-01-02T03:04:05.000Z',
      customHeader: { preserved: 'yes' },
      ...header
    }) +
    '\n' +
    rows.map((row) => `  ${JSON.stringify(row)} \r\n`).join('')
  )
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'pi-native-fork-stateful-')))
  archive = join(root, 'sessions')
  await mkdir(archive)
  sourceFile = join(archive, `source_${sourceId}.jsonl`)
  pointer = {
    id: 'pointer',
    conversationId: 'parent',
    projectId: null,
    provider: 'pi',
    projectRoot: root,
    nativeSessionId: sourceId,
    title: 'native',
    state: 'available',
    origin: 'discovered',
    expectedHeadId: 'branch',
    createdAt: 1,
    updatedAt: 1,
    lastSeenAt: 1
  }
  prepared = []
  releases = []
  const find = discovery.findPiNativeSessionFile
  // Bind the real scanner to a private archive instead of changing HOME or process.env.
  vi.spyOn(discovery, 'findPiNativeSessionFile').mockImplementation((id) => find(id, archive))
  await writeFile(sourceFile, content())
})

afterEach(async () => {
  for (const fork of prepared) {
    try {
      await fork.cleanup()
    } finally {
      fork.release()
    }
  }
  for (const release of releases) release()
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})

describe('preparePiNativeFork real archive ownership', () => {
  it('copies the full v3 graph byte-for-byte below an independent header and cleans only its child', async () => {
    const original = await readFile(sourceFile)
    const fork = await preparePiNativeFork(pointer, root)
    prepared.push(fork)
    const child = await readFile(fork.sessionFile)
    const newline = child.indexOf(0x0a)
    const header = JSON.parse(child.subarray(0, newline).toString('utf8'))

    expect(fork.nativeSessionId).not.toBe(sourceId)
    expect(fork.expectedHeadId).toBe('branch')
    expect(header).toMatchObject({
      type: 'session',
      version: 3,
      id: fork.nativeSessionId,
      cwd: root,
      parentSession: sourceFile,
      customHeader: { preserved: 'yes' }
    })
    expect(child.subarray(newline + 1)).toEqual(original.subarray(original.indexOf(0x0a) + 1))
    expect(
      child
        .subarray(newline + 1)
        .toString('utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    ).toEqual(entries)
    await fork.verifySource()
    expect(await readFile(sourceFile)).toEqual(original)

    await fork.cleanup()
    await fork.cleanup()
    expect(await readdir(archive)).toEqual([`source_${sourceId}.jsonl`])
    expect(await readFile(sourceFile)).toEqual(original)
  })

  it('a mapped completed assistant anchor copies only its prefix without rewriting tool references', async () => {
    const original = await readFile(sourceFile)
    const fork = await preparePiNativeFork(pointer, root, 'assistant')
    prepared.push(fork)
    const child = await readFile(fork.sessionFile, 'utf8')
    expect(fork.expectedHeadId).toBe('assistant')
    expect(child.slice(child.indexOf('\n') + 1)).toBe(
      entries
        .slice(0, 4)
        .map((row) => `  ${JSON.stringify(row)} \r\n`)
        .join('')
    )
    expect(await readFile(sourceFile)).toEqual(original)
  })

  it('same-size source drift after preparation invalidates verification and child cleanup leaves the edited source alone', async () => {
    const fork = await preparePiNativeFork(pointer, root)
    prepared.push(fork)
    const original = await readFile(sourceFile, 'utf8')
    const drifted = original.replace('branch answer', 'edited answer')
    expect(Buffer.byteLength(drifted)).toBe(Buffer.byteLength(original))
    await writeFile(sourceFile, drifted)
    await expect(fork.verifySource()).rejects.toThrow('WORKSPACE_FORK_NATIVE_UNSAFE')
    await fork.cleanup()
    expect(await readFile(sourceFile, 'utf8')).toBe(drifted)
    expect(await readdir(archive)).toEqual([`source_${sourceId}.jsonl`])
  })

  it('an active native lease fails closed with the workspace busy error and publishes nothing', async () => {
    const release = nativeSessionLeaseRegistry.acquire({
      provider: 'pi',
      projectRoot: root,
      nativeSessionId: sourceId
    })
    releases.push(release)
    const original = await readFile(sourceFile)
    const failure = await preparePiNativeFork(pointer, root).then(
      (unexpected) => {
        prepared.push(unexpected)
        return undefined
      },
      (error) => error
    )
    expect(await readdir(archive)).toEqual([`source_${sourceId}.jsonl`])
    expect(await readFile(sourceFile)).toEqual(original)
    release()
    const fork = await preparePiNativeFork(pointer, root)
    prepared.push(fork)
    expect(fork.expectedHeadId).toBe('branch')
    expect(fork.nativeSessionId).not.toBe(sourceId)
    expect(failure).toMatchObject({ message: 'WORKSPACE_FORK_BUSY' })
  })

  it.each([
    { name: 'wrong protocol version', make: () => content(entries, { version: 4 }) },
    { name: 'missing protocol version', make: () => content(entries, { version: undefined }) },
    {
      name: 'duplicate entry identity',
      make: () => content([...entries.slice(0, -1), { ...entries.at(-1), id: 'user' }])
    },
    {
      name: 'parent outside the graph',
      make: () => content([...entries.slice(0, -1), { ...entries.at(-1), parentId: 'missing' }])
    },
    {
      name: 'forward parent reference',
      make: () => content([{ type: 'custom', id: 'early', parentId: 'branch' }, ...entries])
    },
    {
      name: 'compaction outside the graph',
      make: () =>
        content(
          entries.map((row) =>
            row.type === 'compaction' ? { ...row, firstKeptEntryId: 'missing' } : row
          )
        )
    },
    {
      name: 'unfinished assistant',
      make: () =>
        content([
          ...entries.slice(0, -1),
          { ...entries.at(-1), message: { role: 'assistant', stopReason: 'pending' } }
        ])
    },
    {
      name: 'nested session header',
      make: () =>
        content([...entries.slice(0, -1), { type: 'session', id: 'branch', parentId: 'unknown' }])
    },
    { name: 'partial final JSONL record', make: () => content().trimEnd() },
    { name: 'blank JSONL record', make: () => content().replace('\n', '\n\n') },
    {
      name: 'invalid UTF-8',
      make: () => Buffer.concat([Buffer.from(content()), Buffer.from([0xff, 0x0a])])
    }
  ])('rejects $name without publishing a child or retaining the native lease', async ({ make }) => {
    const bytes = make()
    await writeFile(sourceFile, bytes)
    const original = await readFile(sourceFile)
    await expect(preparePiNativeFork(pointer, root)).rejects.toThrow('WORKSPACE_FORK_NATIVE_UNSAFE')
    expect(await readFile(sourceFile)).toEqual(original)
    expect(await readdir(archive)).toEqual([`source_${sourceId}.jsonl`])
    await writeFile(sourceFile, content())
    const fork = await preparePiNativeFork(pointer, root)
    prepared.push(fork)
    expect(fork.expectedHeadId).toBe('branch')
  })

  it.each(['unknown-anchor', 'user', 'compact', 'unknown'])(
    'rejects non-assistant anchor %s without creating a native child',
    async (anchor) => {
      const original = await readFile(sourceFile)
      await expect(preparePiNativeFork(pointer, root, anchor)).rejects.toThrow(
        'WORKSPACE_FORK_NATIVE_UNSAFE'
      )
      expect(await readFile(sourceFile)).toEqual(original)
      expect(await readdir(archive)).toEqual([`source_${sourceId}.jsonl`])
    }
  )
})
