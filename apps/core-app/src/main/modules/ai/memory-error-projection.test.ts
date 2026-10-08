import { describe, expect, it } from 'vitest'
import { isMemoryReplaceConflict } from '../../../shared/intelligence/memory-errors'
import {
  MEMORY_REPLACE_CONFLICT_REASON,
  projectMemoryReplaceError
} from './memory-error-projection'

describe('projectMemoryReplaceError', () => {
  it('names the replace conflict to the app, with its reason, in the form the page reads', () => {
    const projected = projectMemoryReplaceError(new Error('MEMORY_REPLACE_CONFLICT'), {
      host: true
    })

    expect(projected).toEqual({
      error: `[MEMORY_REPLACE_CONFLICT] ${MEMORY_REPLACE_CONFLICT_REASON}`,
      code: 'MEMORY_REPLACE_CONFLICT',
      retryable: true
    })
    expect(isMemoryReplaceConflict(new Error(projected!.error))).toBe(true)
  })

  it('gives a plugin the code alone', () => {
    expect(
      projectMemoryReplaceError(new Error('MEMORY_REPLACE_CONFLICT'), { host: false })
    ).toEqual({ error: 'MEMORY_REPLACE_CONFLICT' })
  })

  it.each([
    ['an evaluation mismatch', new Error('MEMORY_REPLACE_EVALUATION_MISMATCH')],
    ['a secret refusal', new Error('MEMORY_POLICY_REJECTED_SECRET')],
    ['an invalid request', new Error('Invalid memory replacement request')],
    ['a database failure', new Error('SQLITE_BUSY: database is locked at /Users/someone/tuff.db')],
    ['the code inside other words', new Error('wrapped: MEMORY_REPLACE_CONFLICT')],
    ['a host-only refusal', new Error('INTELLIGENCE_HOST_ONLY_CAPABILITY')],
    ['a thrown string', 'boom'],
    ['nothing', undefined]
  ])('leaves %s to the public sentence', (_case, error) => {
    expect(projectMemoryReplaceError(error, { host: true })).toBeUndefined()
    expect(projectMemoryReplaceError(error, { host: false })).toBeUndefined()
  })
})
