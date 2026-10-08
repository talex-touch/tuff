import { describe, expect, it } from 'vitest'
import { isMemoryReplaceConflict, MEMORY_REPLACE_CONFLICT } from './memory-errors'

describe('isMemoryReplaceConflict', () => {
  it.each([
    [
      'the app’s shape',
      new Error('[MEMORY_REPLACE_CONFLICT] The memory changed after it was read.')
    ],
    ['a plugin’s shape', new Error('MEMORY_REPLACE_CONFLICT')],
    ['a bare code string', 'MEMORY_REPLACE_CONFLICT'],
    [
      'an error carrying the code',
      Object.assign(new Error('anything'), { code: MEMORY_REPLACE_CONFLICT })
    ]
  ])('reads %s as the replace conflict', (_shape, error) => {
    expect(isMemoryReplaceConflict(error)).toBe(true)
  })

  it.each([
    ['the public sentence', new Error('The operation failed. Please retry.')],
    ['an evaluation mismatch', new Error('MEMORY_REPLACE_EVALUATION_MISMATCH')],
    ['a secret refusal', new Error('MEMORY_POLICY_REJECTED_SECRET')],
    ['a longer code', new Error('MEMORY_REPLACE_CONFLICTED')],
    ['the code inside other words', new Error('saw MEMORY_REPLACE_CONFLICT earlier')],
    ['another code’s prefix', new Error('[USAGE_LIMIT_REACHED] limit reached')],
    ['nothing', undefined]
  ])('does not read %s as the replace conflict', (_shape, error) => {
    expect(isMemoryReplaceConflict(error)).toBe(false)
  })
})
