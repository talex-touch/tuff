import { afterEach, describe, expect, it } from 'vitest'
import { getBooleanEnv, getEnv, parseBooleanFlag, setRuntimeEnv } from '../env'

const KEY = 'TUFF_ENV_FLAGS_TEST_FLAG'

afterEach(() => {
  delete process.env[KEY]
  const g = globalThis as { __TUFF_ENV?: Record<string, string | undefined> }
  if (g.__TUFF_ENV) delete g.__TUFF_ENV[KEY]
})

describe('parseBooleanFlag', () => {
  it.each(['1', 'true', 'TRUE', ' yes ', 'On'])('reads %j as on', (value) => {
    expect(parseBooleanFlag(value)).toBe(true)
    expect(parseBooleanFlag(value, true)).toBe(true)
  })

  it.each(['0', 'false', 'No', ' off '])('reads %j as off', (value) => {
    expect(parseBooleanFlag(value)).toBe(false)
    expect(parseBooleanFlag(value, true)).toBe(false)
  })

  it.each([undefined, '', '  ', 'maybe', '2'])('falls back on %j', (value) => {
    expect(parseBooleanFlag(value)).toBe(false)
    expect(parseBooleanFlag(value, true)).toBe(true)
  })
})

describe('getEnv / getBooleanEnv', () => {
  it('reads the process environment and lets it win over the runtime overlay', () => {
    setRuntimeEnv({ [KEY]: 'yes' })
    expect(getEnv(KEY)).toBe('yes')
    expect(getBooleanEnv(KEY)).toBe(true)

    process.env[KEY] = 'off'
    expect(getEnv(KEY)).toBe('off')
    expect(getBooleanEnv(KEY, true)).toBe(false)
  })

  it('returns the fallback for an unset key', () => {
    expect(getEnv(KEY)).toBeUndefined()
    expect(getBooleanEnv(KEY)).toBe(false)
    expect(getBooleanEnv(KEY, true)).toBe(true)
  })
})
