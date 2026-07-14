import { effectScope, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeLocale, useLocaleOrchestrator } from '~/composables/useLocaleOrchestrator'

type Locale = 'en' | 'zh'

const fakes = vi.hoisted(() => ({
  preferredLocale: null as Locale | null,
  hasManualPreference: false,
  preferenceWrites: [] as Locale[],
  manualMarks: 0,
  profileMarks: 0,
  fetchedProfileLocale: null as string | null,
  profileWrites: [] as Array<{ locale?: string | null }>,
  fetchStarted: null as (() => void) | null,
}))
vi.mock('#imports', () => ({
  useCookie: () => ({ value: null }),
  useI18n: () => ({
    locale: activeLocale,
    setLocale,
    mergeLocaleMessage: vi.fn(),
  }),
  useNexusAuth: () => ({ status: authStatus }),
  useRequestHeaders: () => ({}),
  useRoute: () => ({ path: routePath }),
  useState: (key: string, init: () => unknown) => {
    const existing = nuxtState.get(key)
    if (existing)
      return existing

    const state = { value: init() }
    nuxtState.set(key, state)
    return state
  },
}))

vi.mock('~/composables/useLocalePreference', () => ({
  useLocalePreference: () => ({
    getPreferredLocale: () => fakes.preferredLocale,
    hasManualPreferredLocale: () => fakes.hasManualPreference,
    markManualPreferredLocale: () => {
      fakes.manualMarks += 1
    },
    markProfilePreferredLocale: () => {
      fakes.profileMarks += 1
    },
    persistPreferredLocale: (locale: Locale) => {
      fakes.preferredLocale = locale
      fakes.preferenceWrites.push(locale)
    }
  }),
}))

vi.mock('~/composables/useCurrentUserApi', () => ({
  fetchCurrentUserProfile: async () => {
    fakes.fetchStarted?.()
    return fakes.fetchedProfileLocale === null
      ? null
      : { locale: fakes.fetchedProfileLocale }
  },
  patchCurrentUserProfile: async (payload: { locale?: string | null }) => {
    fakes.profileWrites.push(payload)
    return null
  },
}))

let activeLocale = ref<string>('en')

let authStatus = ref('unauthenticated')
let routePath = '/settings'
let setLocale: (locale: Locale) => Promise<void>
const nuxtState = new Map<string, { value: unknown }>()
const localStorageValues = new Map<string, string>()

function resetFakes() {
  fakes.preferredLocale = null
  fakes.hasManualPreference = false
  fakes.preferenceWrites.length = 0
  fakes.manualMarks = 0
  fakes.profileMarks = 0
  fakes.fetchedProfileLocale = null
  fakes.profileWrites.length = 0
  fakes.fetchStarted = null
}

beforeEach(() => {
  resetFakes()
  nuxtState.clear()
  localStorageValues.clear()
  activeLocale = ref('en')
  authStatus = ref('unauthenticated')
  routePath = '/settings'
  setLocale = async (locale) => {
    activeLocale.value = locale
  }

  vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] })
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => localStorageValues.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageValues.set(key, value),
    },
    location: { pathname: '/settings' },
  })
  vi.stubGlobal('document', { cookie: '' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('locale contracts', () => {
  it.each([
    { input: ' zh-Hans ', expected: 'zh' },
    { input: 'EN_us', expected: 'en' },
    { input: 'fr-CA', expected: null },
    { input: '   ', expected: null },
    { input: null, expected: null },
  ])('normalizes $input into $expected', ({ input, expected }) => {
    expect(normalizeLocale(input)).toBe(expected)
  })

  it('persists a signed-out manual selection locally without writing a user profile', async () => {
    await useLocaleOrchestrator().saveUserLocale('zh-Hant')

    expect(fakes.preferenceWrites).toEqual(['zh'])
    expect(fakes.profileWrites).toEqual([])
  })

  it('persists normalized manual input through the locale preference boundary', () => {
    const persisted = useLocaleOrchestrator().persistLocale(' zh-Hant ', 'manual')

    expect(persisted).toBe('zh')
    expect(fakes.preferenceWrites).toEqual(['zh'])
    expect(fakes.manualMarks).toBe(1)
  })

  it('pulls a signed-in profile locale into the locale gateway without saving it back', async () => {
    authStatus.value = 'authenticated'
    fakes.fetchedProfileLocale = 'zh-Hans'

    let releaseFetchStart!: () => void
    const fetchStarted = new Promise<void>((resolve) => {
      releaseFetchStart = resolve
    })
    let releaseLocaleSet!: () => void
    const localeSet = new Promise<void>((resolve) => {
      releaseLocaleSet = resolve
    })
    fakes.fetchStarted = releaseFetchStart
    setLocale = async (locale) => {
      activeLocale.value = locale
      releaseLocaleSet()
    }

    const scope = effectScope()
    scope.run(() => useLocaleOrchestrator().syncLocaleChanges())
    await fetchStarted
    await localeSet
    scope.stop()

    expect(fakes.preferenceWrites).toEqual(['zh'])
    expect(fakes.profileMarks).toBe(1)
    expect(activeLocale.value).toBe('zh')
    expect(fakes.profileWrites).toEqual([])
  })

  it('serializes concurrent locale requests in invocation order', async () => {
    let signalFirstWrite!: () => void
    let releaseFirstWrite!: () => void
    const firstWriteStarted = new Promise<void>((resolve) => {
      signalFirstWrite = resolve
    })
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve
    })
    const localeWrites: Locale[] = []

    setLocale = async (locale) => {
      localeWrites.push(locale)
      if (locale === 'zh') {
        signalFirstWrite()
        await firstWriteGate
      }
      activeLocale.value = locale
    }

    const locale = useLocaleOrchestrator()
    const first = locale.setLocaleSerial('zh', 'manual')
    await firstWriteStarted
    const second = locale.setLocaleSerial('en', 'manual')

    expect(localeWrites).toEqual(['zh'])

    releaseFirstWrite()
    await Promise.all([first, second])

    expect(localeWrites).toEqual(['zh', 'en'])
    expect(activeLocale.value).toBe('en')
  })

  it('prefers an existing manual locale over a conflicting signed-in profile and saves the manual choice', async () => {
    authStatus.value = 'authenticated'
    fakes.preferredLocale = 'en'
    fakes.hasManualPreference = true

    await useLocaleOrchestrator().syncFromProfileOnAuth({
      status: 'authenticated',
      userId: 'user-42',
      profileLocale: 'zh-CN',
    })

    expect(fakes.profileWrites).toEqual([{ locale: 'en' }])
    expect(activeLocale.value).toBe('en')
  })

  it('does not issue duplicate i18n locale writes when reconciliation repeats the same profile locale', async () => {
    const localeWrites: Locale[] = []
    setLocale = async (locale) => {
      localeWrites.push(locale)
      activeLocale.value = locale
    }

    const locale = useLocaleOrchestrator()
    const input = { isAuthenticated: true, profileLocale: 'zh-CN' }

    await locale.reconcileClientLocale(input)
    await locale.reconcileClientLocale(input)

    expect(localeWrites).toEqual(['zh'])
    expect(activeLocale.value).toBe('zh')
  })
})
