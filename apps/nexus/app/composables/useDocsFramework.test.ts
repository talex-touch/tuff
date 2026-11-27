import { describe, expect, it } from 'vitest'
import {
  buildQueryWithFramework,
  DOCS_FRAMEWORK_QUERY_KEY,
  DOCS_FRAMEWORK_STORAGE_KEY,
  readFrameworkFromQuery,
  readFrameworkFromStorage,
  resolveInitialClientFramework,
  scheduleAfterHydration,
  writeFrameworkToStorage,
} from './useDocsFramework'

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  }
}

describe('useDocsFramework helpers', () => {
  it('parses valid framework query parameters and ignores unknown values', () => {
    expect(readFrameworkFromQuery({ [DOCS_FRAMEWORK_QUERY_KEY]: 'react' })).toBe('react')
    expect(readFrameworkFromQuery({ [DOCS_FRAMEWORK_QUERY_KEY]: 'wc' })).toBe('wc')
    expect(readFrameworkFromQuery({ [DOCS_FRAMEWORK_QUERY_KEY]: 'web-components' })).toBe('wc')
    expect(readFrameworkFromQuery({ [DOCS_FRAMEWORK_QUERY_KEY]: ['vue', 'react'] })).toBe('vue')
    expect(readFrameworkFromQuery({ [DOCS_FRAMEWORK_QUERY_KEY]: 'angular' })).toBeNull()
    expect(readFrameworkFromQuery({})).toBeNull()
  })

  it('persists and reads framework preference via storage safely', () => {
    const storage = createMemoryStorage()
    expect(readFrameworkFromStorage(storage)).toBeNull()

    writeFrameworkToStorage('react', storage)
    expect(storage.getItem(DOCS_FRAMEWORK_STORAGE_KEY)).toBe('react')
    expect(readFrameworkFromStorage(storage)).toBe('react')

    writeFrameworkToStorage('wc', storage)
    expect(readFrameworkFromStorage(storage)).toBe('wc')

    const brokenStorage = {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('quota')
      },
    }
    expect(readFrameworkFromStorage(brokenStorage)).toBeNull()
    expect(() => writeFrameworkToStorage('react', brokenStorage)).not.toThrow()
  })

  it('prefers URL query parameter over localStorage and falls back to vue', () => {
    const storage = createMemoryStorage({ [DOCS_FRAMEWORK_STORAGE_KEY]: 'react' })

    expect(resolveInitialClientFramework({
      query: { [DOCS_FRAMEWORK_QUERY_KEY]: 'wc' },
      storage,
    })).toBe('wc')

    expect(resolveInitialClientFramework({
      query: {},
      storage,
    })).toBe('react')

    expect(resolveInitialClientFramework({
      query: {},
      storage: createMemoryStorage(),
    })).toBe('vue')
  })

  it('omits framework query param for vue default and preserves unrelated params', () => {
    expect(buildQueryWithFramework({ tab: 'api' }, 'react')).toEqual({
      tab: 'api',
      [DOCS_FRAMEWORK_QUERY_KEY]: 'react',
    })

    expect(buildQueryWithFramework({ tab: 'api', [DOCS_FRAMEWORK_QUERY_KEY]: 'wc' }, 'vue')).toEqual({
      tab: 'api',
    })
  })

  it('defers initial client framework application until app:suspense:resolve while hydrating', () => {
    const callbacks: Array<() => void> = []
    let applied = 0
    const deferred = scheduleAfterHydration(
      {
        isHydrating: true,
        hooks: {
          hookOnce(name, fn) {
            expect(name).toBe('app:suspense:resolve')
            callbacks.push(fn)
          },
        },
      },
      () => {
        applied += 1
      },
    )

    expect(deferred).toBe(true)
    expect(applied).toBe(0)
    expect(callbacks).toHaveLength(1)

    callbacks[0]!()
    expect(applied).toBe(1)

    const immediate = scheduleAfterHydration(
      { isHydrating: false, hooks: { hookOnce: () => {} } },
      () => {
        applied += 1
      },
    )
    expect(immediate).toBe(false)
    expect(applied).toBe(2)
  })
})
