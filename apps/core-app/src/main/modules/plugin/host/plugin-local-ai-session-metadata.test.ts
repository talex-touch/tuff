import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rm,
  symlink,
  truncate,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLocalAiSessionMetadataReader } from './plugin-local-ai-session-metadata'

const NOW = Date.parse('2026-09-01T12:00:00.000Z')
const CLAUDE_SESSION_ID = '123e4567-e89b-12d3-a456-426614174000'
const CODEX_SESSION_ID = '223e4567-e89b-12d3-a456-426614174000'

let fixtureRoot = ''
let homeDirectory = ''

async function writeSession(relativePath: string, firstRecord: unknown): Promise<string> {
  const filePath = join(homeDirectory, relativePath)
  await mkdir(join(filePath, '..'), { recursive: true })
  await writeFile(
    filePath,
    `${JSON.stringify(firstRecord)}\n${JSON.stringify({ role: 'assistant', text: 'TRANSCRIPT_SECRET_MUST_NOT_ESCAPE' })}\n`,
    'utf8'
  )
  return filePath
}

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'tuff-local-ai-sessions-'))
  homeDirectory = join(fixtureRoot, 'home')
})

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true })
})

describe('createLocalAiSessionMetadataReader', () => {
  it('discovers Claude and Codex sessions while exposing only basename metadata', async () => {
    const claude = await writeSession(
      `.claude/projects/encoded-project/session-${CLAUDE_SESSION_ID}.jsonl`,
      { cwd: '/private/worktrees/claude-project', transcript: 'CLAUDE_TRANSCRIPT_SECRET' }
    )
    const codex = await writeSession(
      `.codex/sessions/2026/09/01/rollout-${CODEX_SESSION_ID}.jsonl`,
      {
        payload: {
          session_meta: { cwd: '/private/worktrees/codex-project' },
          content: 'CODEX_TRANSCRIPT_SECRET'
        }
      }
    )
    await utimes(claude, new Date('2026-09-01T11:45:00.000Z'), new Date('2026-09-01T11:45:00.000Z'))
    await utimes(codex, new Date('2026-09-01T11:59:00.000Z'), new Date('2026-09-01T11:59:00.000Z'))

    const entries = await createLocalAiSessionMetadataReader({
      homeDirectory,
      now: () => NOW
    })(new AbortController().signal)

    expect(entries).toEqual({
      entries: [
        {
          platform: 'codex',
          project: 'codex-project',
          updatedAt: '2026-09-01T11:59:00.000Z',
          state: 'active',
          turnCount: null,
          sourceId: CODEX_SESSION_ID
        },
        {
          platform: 'claude',
          project: 'claude-project',
          updatedAt: '2026-09-01T11:45:00.000Z',
          state: 'completed',
          turnCount: null,
          sourceId: CLAUDE_SESSION_ID
        }
      ],
      incomplete: false
    })
    const serialized = JSON.stringify(entries)
    expect(serialized).not.toContain('/private/worktrees')
    expect(serialized).not.toContain('TRANSCRIPT_SECRET')
  })

  it('ignores symbolic, oversized, non-UUID, and escaped session paths', async () => {
    const safe = await writeSession(`.claude/projects/project/safe-${CLAUDE_SESSION_ID}.jsonl`, {
      cwd: '/private/worktrees/safe-project'
    })
    const projectDirectory = join(homeDirectory, '.claude/projects/project')
    const outsideSession = join(fixtureRoot, 'outside-session.jsonl')
    await writeFile(
      outsideSession,
      `${JSON.stringify({ cwd: '/private/worktrees/escaped-project' })}\n`,
      'utf8'
    )
    await symlink(outsideSession, join(projectDirectory, `link-${CODEX_SESSION_ID}.jsonl`))
    await writeSession('.claude/projects/project/not-a-session.jsonl', {
      cwd: '/private/worktrees/non-uuid'
    })
    const oversized = await writeSession(
      `.claude/projects/project/oversized-${CODEX_SESSION_ID}.jsonl`,
      { cwd: '/private/worktrees/oversized' }
    )
    await truncate(oversized, 64 * 1024 * 1024 + 1)

    const escapedCodexRoot = join(fixtureRoot, 'escaped-codex-sessions')
    const escapedCodexSession = join(escapedCodexRoot, `escaped-${CODEX_SESSION_ID}.jsonl`)
    await mkdir(escapedCodexRoot, { recursive: true })
    await writeFile(
      escapedCodexSession,
      `${JSON.stringify({ cwd: '/private/worktrees/escaped-codex' })}\n`,
      'utf8'
    )
    await mkdir(join(homeDirectory, '.codex'), { recursive: true })
    await symlink(escapedCodexRoot, join(homeDirectory, '.codex/sessions'))
    await utimes(safe, new Date('2026-09-01T11:59:00.000Z'), new Date('2026-09-01T11:59:00.000Z'))

    const entries = await createLocalAiSessionMetadataReader({
      homeDirectory,
      now: () => NOW
    })(new AbortController().signal)

    expect(entries).toEqual({
      entries: [
        {
          platform: 'claude',
          project: 'safe-project',
          updatedAt: '2026-09-01T11:59:00.000Z',
          state: 'active',
          turnCount: null,
          sourceId: CLAUDE_SESSION_ID
        }
      ],
      incomplete: false
    })
  })

  it('rejects an already-aborted scan before reading the local session directories', async () => {
    await writeSession(`.claude/projects/project/session-${CLAUDE_SESSION_ID}.jsonl`, {
      cwd: '/private/worktrees/project'
    })
    let scanned = false
    const reader = createLocalAiSessionMetadataReader({
      homeDirectory,
      filesystem: {
        readdir: async (directory) => {
          scanned = true
          return await readdir(directory, { withFileTypes: true })
        }
      }
    })
    const controller = new AbortController()
    controller.abort()

    await expect(reader(controller.signal)).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_CANCELLED'
    })
    expect(scanned).toBe(false)
  })

  it('distinguishes an unreadable allowed session root from an absent source', async () => {
    await mkdir(join(homeDirectory, '.claude', 'projects'), { recursive: true })
    const reader = createLocalAiSessionMetadataReader({
      homeDirectory,
      filesystem: {
        lstat: async (target) => {
          if (target.endsWith(join('.claude', 'projects'))) {
            throw Object.assign(new Error('denied'), { code: 'EACCES' })
          }
          return await lstat(target)
        }
      }
    })

    await expect(reader(new AbortController().signal)).rejects.toThrow('index-unavailable')
  })
  it('marks a bounded directory scan incomplete instead of reporting a complete snapshot', async () => {
    await writeSession(`.claude/projects/project/session-${CLAUDE_SESSION_ID}.jsonl`, {
      cwd: '/private/worktrees/project'
    })
    const projectsRoot = join(homeDirectory, '.claude', 'projects')
    await writeFile(join(projectsRoot, 'ignored.txt'), '', 'utf8')
    const reader = createLocalAiSessionMetadataReader({
      homeDirectory,
      now: () => NOW,
      filesystem: {
        readdir: async (directory) => {
          const entries = await readdir(directory, { withFileTypes: true })
          if (!directory.endsWith(join('.claude', 'projects'))) return entries
          const ignored = entries.find((entry) => entry.name === 'ignored.txt')!
          return [...entries, ...Array.from({ length: 1_999 }, () => ignored)]
        }
      }
    })

    const snapshot = await reader(new AbortController().signal)
    expect(snapshot.incomplete).toBe(true)
    expect(snapshot.entries).toHaveLength(1)
    expect(JSON.stringify(snapshot)).not.toContain('/private/worktrees')
  })
  it('marks directory-only trees incomplete when the global pending budget is exhausted', async () => {
    const root = join(homeDirectory, '.codex', 'sessions')
    await mkdir(join(root, 'branch'), { recursive: true })
    const reader = createLocalAiSessionMetadataReader({
      homeDirectory,
      now: () => NOW,
      filesystem: {
        readdir: async (directory) => {
          const entries = await readdir(directory, { withFileTypes: true })
          if (!directory.includes(`${join('.codex', 'sessions')}`)) return entries
          const branch = entries.find((entry) => entry.isDirectory())
          return branch ? Array.from({ length: 2_000 }, () => branch) : []
        }
      }
    })

    const snapshot = await reader(new AbortController().signal)
    expect(snapshot).toEqual({ entries: [], incomplete: true })
  })
  it('returns the cached snapshot without rescanning a removed session', async () => {
    const session = await writeSession(
      `.claude/projects/project/session-${CLAUDE_SESSION_ID}.jsonl`,
      { cwd: '/private/worktrees/cached-project' }
    )
    await utimes(
      session,
      new Date('2026-09-01T11:59:00.000Z'),
      new Date('2026-09-01T11:59:00.000Z')
    )
    let directoryReads = 0
    const reader = createLocalAiSessionMetadataReader({
      homeDirectory,
      now: () => NOW,
      filesystem: {
        readdir: async (directory) => {
          directoryReads += 1
          return await readdir(directory, { withFileTypes: true })
        }
      }
    })

    await reader(new AbortController().signal)
    const readsAfterFirstSnapshot = directoryReads
    await rm(session)
    const second = await reader(new AbortController().signal)

    expect(second).toEqual({
      entries: [
        {
          platform: 'claude',
          project: 'cached-project',
          updatedAt: '2026-09-01T11:59:00.000Z',
          state: 'active',
          turnCount: null,
          sourceId: CLAUDE_SESSION_ID
        }
      ],
      incomplete: false
    })
    expect(directoryReads).toBe(readsAfterFirstSnapshot)
  })

  it('rejects cancellation after the final header read without caching fallback metadata', async () => {
    const claude = await writeSession(
      `.claude/projects/project/session-${CLAUDE_SESSION_ID}.jsonl`,
      { cwd: '/private/worktrees/claude-project' }
    )
    const codex = await writeSession(
      `.codex/sessions/2026/09/01/session-${CODEX_SESSION_ID}.jsonl`,
      { payload: { session_meta: { cwd: '/private/worktrees/codex-project' } } }
    )
    await utimes(claude, new Date('2026-09-01T11:58:00.000Z'), new Date('2026-09-01T11:58:00.000Z'))
    await utimes(codex, new Date('2026-09-01T11:59:00.000Z'), new Date('2026-09-01T11:59:00.000Z'))

    const controller = new AbortController()
    let cancelledHeaderReads = 0
    let signalAbortInjected!: () => void
    const abortInjected = new Promise<void>((resolve) => {
      signalAbortInjected = resolve
    })
    const reader = createLocalAiSessionMetadataReader({
      homeDirectory,
      now: () => NOW,
      filesystem: {
        open: async (filePath, flags) => {
          const handle = await open(filePath, flags)
          const read = handle.read.bind(handle) as (
            ...arguments_: unknown[]
          ) => Promise<{ bytesRead: number }>
          handle.read = (async (...arguments_: unknown[]) => {
            const result = await read(...arguments_)
            if (filePath.endsWith(`session-${CLAUDE_SESSION_ID}.jsonl`)) {
              cancelledHeaderReads += 1
              controller.abort()
              signalAbortInjected()
            }
            return result
          }) as typeof handle.read
          return handle
        }
      }
    })

    const cancelledScan = reader(controller.signal)
    await abortInjected
    expect(cancelledHeaderReads).toBe(1)
    await expect(cancelledScan).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_CANCELLED'
    })

    const snapshot = await reader(new AbortController().signal)

    expect(snapshot).toEqual({
      entries: [
        {
          platform: 'codex',
          project: 'codex-project',
          updatedAt: '2026-09-01T11:59:00.000Z',
          state: 'active',
          turnCount: null,
          sourceId: CODEX_SESSION_ID
        },
        {
          platform: 'claude',
          project: 'claude-project',
          updatedAt: '2026-09-01T11:58:00.000Z',
          state: 'active',
          turnCount: null,
          sourceId: CLAUDE_SESSION_ID
        }
      ],
      incomplete: false
    })
    expect(cancelledHeaderReads).toBe(2)
  })
})
