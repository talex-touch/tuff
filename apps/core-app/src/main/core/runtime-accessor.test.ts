import { afterEach, describe, expect, it } from 'vitest'
import {
  clearRegisteredMainRuntime,
  getRegisteredMainRuntime,
  maybeGetRegisteredMainRuntime,
  registerMainRuntime
} from './runtime-accessor'

const TEST_RUNTIME_KEY = 'runtime-accessor-test'

describe('runtime-accessor', () => {
  afterEach(() => {
    clearRegisteredMainRuntime(TEST_RUNTIME_KEY)
  })

  it('returns null when runtime is absent', () => {
    expect(maybeGetRegisteredMainRuntime(TEST_RUNTIME_KEY)).toBeNull()
    expect(() => getRegisteredMainRuntime(TEST_RUNTIME_KEY)).toThrow(
      `[RuntimeAccessor] Runtime "${TEST_RUNTIME_KEY}" not registered`
    )
  })

  it('returns the registered runtime when available', () => {
    const runtime = {
      app: {} as never,
      window: {} as never,
      channel: {},
      transport: {} as never
    }

    registerMainRuntime(TEST_RUNTIME_KEY, runtime)

    expect(maybeGetRegisteredMainRuntime(TEST_RUNTIME_KEY)).toBe(runtime)
    expect(getRegisteredMainRuntime(TEST_RUNTIME_KEY)).toBe(runtime)
  })
})
