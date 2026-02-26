import { fetchCurrentUserProfile } from '~/composables/useCurrentUserApi'

export type SupportedLocale = 'en' | 'zh'
type LocaleSource = 'profile' | 'cookie' | 'browser' | 'legacy-query' | 'manual'

const LOCALE_SYNC_STORAGE_KEY = 'tuff_locale_sync'
const LOG_PREFIX = '[i18n/orchestrator]'

let localeSetQueue: Promise<void> = Promise.resolve()
let localeInitQueue: Promise<SupportedLocale | null> | null = null

export function normalizeLocale(value?: string | null): SupportedLocale | null {
  if (!value || typeof value !== 'string')
    return null

  const normalized = value.trim().toLowerCase()
  if (!normalized)
    return null

  if (normalized === 'zh' || normalized.startsWith('zh-') || normalized.startsWith('zh_'))
    return 'zh'
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.startsWith('en_'))
    return 'en'
  return null
}

function resolveBrowserLocale(): SupportedLocale {
  if (import.meta.server) {
    const headers = useRequestHeaders(['accept-language'])
    const acceptLanguage = headers['accept-language']
    if (acceptLanguage) {
      const tags = acceptLanguage.split(',')
      for (const tag of tags) {
        const candidate = normalizeLocale(tag.split(';')[0]?.trim() || '')
        if (candidate)
          return candidate
      }
    }
    return 'en'
  }

  const browserLang = navigator.language || navigator.languages?.[0] || 'en'
  return normalizeLocale(browserLang) || 'en'
}

export function useLocaleOrchestrator() {
  const route = useRoute()
  const router = useRouter()
  const { locale, setLocale } = useI18n()
  const { getPreferredLocale, persistPreferredLocale } = useLocalePreference()
  const initDone = useState<boolean>('nexus-locale-init-done', () => false)
  const legacyCleanupPending = useState<boolean>('nexus-locale-legacy-cleanup-pending', () => false)
  const profileSyncKey = useState<string | null>('nexus-locale-profile-sync-key', () => null)
  const profileSyncPending = useState<boolean>('nexus-locale-profile-sync-pending', () => false)
  const normalizeHits = useState<Record<SupportedLocale, number>>('nexus-locale-normalize-hits', () => ({
    en: 0,
    zh: 0,
  }))

  const normalizeLocaleWithMetrics = (value: unknown, source: LocaleSource): SupportedLocale | null => {
    const text = typeof value === 'string' ? value : null
    const normalized = normalizeLocale(text)

    if (!normalized) {
      if (text && text.trim().length > 0) {
        console.warn(`${LOG_PREFIX} invalid locale input`, {
          source,
          value: text,
        })
      }
      return null
    }

    normalizeHits.value[normalized] += 1
    if (text && text.trim().toLowerCase() !== normalized) {
      console.info(`${LOG_PREFIX} normalized locale`, {
        source,
        from: text,
        to: normalized,
        hits: normalizeHits.value[normalized],
      })
    }

    return normalized
  }

  const persistLocale = (input: unknown, source: LocaleSource = 'manual') => {
    const normalized = normalizeLocaleWithMetrics(input, source)
    if (!normalized)
      return null

    persistPreferredLocale(normalized)
    if (import.meta.client)
      window.localStorage.setItem(LOCALE_SYNC_STORAGE_KEY, normalized)
    return normalized
  }

  const setLocaleSerial = async (input: unknown, source: LocaleSource = 'manual') => {
    const normalized = normalizeLocaleWithMetrics(input, source)
    if (!normalized)
      return normalizeLocale(locale.value)

    localeSetQueue = localeSetQueue
      .catch(() => {})
      .then(async () => {
        if (locale.value === normalized)
          return

        try {
          await setLocale(normalized)
        }
        catch (error) {
          console.error(`${LOG_PREFIX} setLocale failed`, {
            source,
            locale: normalized,
            error,
          })
        }
      })

    await localeSetQueue
    return normalizeLocale(locale.value) || normalized
  }

  const initLocale = async (input?: { isAuthenticated?: boolean, profileLocale?: string | null }) => {
    if (initDone.value)
      return normalizeLocale(locale.value)

    if (localeInitQueue)
      return await localeInitQueue

    localeInitQueue = (async () => {
      const profileLocale = input?.isAuthenticated
        ? normalizeLocaleWithMetrics(input.profileLocale, 'profile')
        : null
      const preferredLocale = normalizeLocaleWithMetrics(getPreferredLocale(), 'cookie')
      const browserLocale = resolveBrowserLocale()
      const target = profileLocale || preferredLocale || browserLocale
      const source: LocaleSource = profileLocale
        ? 'profile'
        : preferredLocale
          ? 'cookie'
          : 'browser'

      await setLocaleSerial(target, source)
      persistLocale(target, source)
      initDone.value = true

      console.info(`${LOG_PREFIX} initialized`, {
        source,
        locale: target,
      })

      return target
    })()

    try {
      return await localeInitQueue
    }
    finally {
      localeInitQueue = null
    }
  }

  const applyLegacyLangQueryOnce = async () => {
    if (import.meta.server || legacyCleanupPending.value)
      return false

    const raw = route.query.lang
    if (!raw)
      return false

    const value = Array.isArray(raw) ? raw[0] : raw
    const normalized = normalizeLocaleWithMetrics(value, 'legacy-query')
    if (normalized) {
      await setLocaleSerial(normalized, 'legacy-query')
      persistLocale(normalized, 'legacy-query')
    }

    const nextQuery = { ...route.query } as Record<string, string | string[] | undefined>
    delete nextQuery.lang

    legacyCleanupPending.value = true
    try {
      await router.replace({
        path: route.path,
        query: nextQuery,
        hash: route.hash,
      })
      return true
    }
    finally {
      legacyCleanupPending.value = false
    }
  }

  const syncFromProfileOnAuth = async (input: {
    status: string
    userId?: string | null
    profileLocale?: string | null
  }) => {
    if (import.meta.server)
      return

    if (input.status !== 'authenticated') {
      profileSyncKey.value = null
      return
    }

    const userId = typeof input.userId === 'string' ? input.userId.trim() : ''
    const syncKey = userId || '__auth__'
    if (profileSyncPending.value || profileSyncKey.value === syncKey)
      return

    profileSyncPending.value = true
    try {
      let nextLocale = normalizeLocaleWithMetrics(input.profileLocale, 'profile')
      if (!nextLocale) {
        const profile = await fetchCurrentUserProfile()
        nextLocale = normalizeLocaleWithMetrics(profile?.locale ?? null, 'profile')
      }

      if (nextLocale) {
        await setLocaleSerial(nextLocale, 'profile')
        persistLocale(nextLocale, 'profile')
      }

      console.info(`${LOG_PREFIX} profile sync`, {
        userId: userId || null,
        locale: nextLocale || null,
      })
    }
    catch (error) {
      console.error(`${LOG_PREFIX} profile sync failed`, error)
    }
    finally {
      profileSyncKey.value = syncKey
      profileSyncPending.value = false
    }
  }

  return {
    normalizeLocale,
    initLocale,
    persistLocale,
    setLocaleSerial,
    applyLegacyLangQueryOnce,
    syncFromProfileOnAuth,
  }
}
