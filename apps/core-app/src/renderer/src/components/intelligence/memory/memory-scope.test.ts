import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MEMORY_SCOPE,
  DEFAULT_MEMORY_TYPE,
  MEMORY_SCOPES,
  memoryScopeEffect
} from './memory-scope'

describe('memoryScopeEffect', () => {
  it('treats a global memory as effective, with or without a source session', () => {
    expect(memoryScopeEffect({ scope: 'global' })).toBe('effective')
    expect(memoryScopeEffect({ scope: 'global', sourceSessionId: 'session-1' })).toBe('effective')
  })

  it('limits a session memory with a source session to that session', () => {
    expect(memoryScopeEffect({ scope: 'session', sourceSessionId: 'session-1' })).toBe(
      'source-session-only'
    )
  })

  it('marks a session memory without a source session inactive', () => {
    expect(memoryScopeEffect({ scope: 'session' })).toBe('inactive')
    // Main checks `Boolean(sourceSessionId)`, so an empty id matches no session either.
    expect(memoryScopeEffect({ scope: 'session', sourceSessionId: '' })).toBe('inactive')
  })

  it('marks workspace memories inactive, even with a source session', () => {
    expect(memoryScopeEffect({ scope: 'workspace' })).toBe('inactive')
    expect(memoryScopeEffect({ scope: 'workspace', sourceSessionId: 'session-1' })).toBe('inactive')
  })

  it('marks project memories inactive, even with a source session', () => {
    expect(memoryScopeEffect({ scope: 'project' })).toBe('inactive')
    expect(memoryScopeEffect({ scope: 'project', sourceSessionId: 'session-1' })).toBe('inactive')
  })

  it('fails closed on a scope it does not know', () => {
    expect(memoryScopeEffect({ scope: 'team' as never, sourceSessionId: 'session-1' })).toBe(
      'inactive'
    )
  })
})

describe('memory defaults', () => {
  it('creates global preference memories, the one scope a hand-made memory is used in', () => {
    expect(DEFAULT_MEMORY_SCOPE).toBe('global')
    expect(DEFAULT_MEMORY_TYPE).toBe('preference')
    expect(memoryScopeEffect({ scope: DEFAULT_MEMORY_SCOPE })).toBe('effective')
  })

  it('offers every scope main stores, default first', () => {
    expect(MEMORY_SCOPES[0]).toBe(DEFAULT_MEMORY_SCOPE)
    expect([...MEMORY_SCOPES].sort()).toEqual(['global', 'project', 'session', 'workspace'])
  })
})

/**
 * `memoryScopeEffect` restates a rule that lives in main, which this test cannot import (it pulls
 * in the database module). Reading the source instead makes a change to main's rule fail here,
 * next to the copy that has to follow it. Formatting-only edits to these two statements will trip
 * it too; re-read both places, update the copy if the rule moved, and then the literals below.
 */
describe('main injection rule tripwire', () => {
  const hygienePath = path.resolve(
    __dirname,
    '../../../../../main/modules/ai/intelligence-context-hygiene.ts'
  )
  const source = readFileSync(hygienePath, 'utf8')

  it('reads the real hygiene module', () => {
    expect(source).toContain('private async listUsableMemories(')
  })

  it('still injects only global memories and session memories from their source session', () => {
    expect(source).toContain(
      "AND (m.scope = 'global' OR (m.scope = 'session' AND m.source_session_id = ?))"
    )
    expect(source).toContain(
      "memory.scope === 'session' &&\n    Boolean(memory.sourceSessionId) &&\n    memory.sourceSessionId === sessionId"
    )
  })
})
