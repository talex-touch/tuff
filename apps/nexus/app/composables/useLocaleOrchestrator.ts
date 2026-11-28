import type { RouteLocaleChunkName } from '~/utils/route-locale-chunks'
import { tryUseNuxtApp, useI18n, useNexusAuth, useRequestHeaders, useRoute, useState } from '#imports'
import { watch } from 'vue'
import { useLocalePreference } from '~/composables/useLocalePreference'

import { ACTIVE_ROUTE_LOCALE_CHUNKS_STATE_KEY, ROUTE_LOCALE_CHUNK_REVISION_STATE_KEY, ensureRouteLocaleChunk } from '~/composables/useRouteLocaleChunks'
import { resolveAllRouteLocaleChunks } from '~/utils/route-locale-chunks'

export type SupportedLocale = 'en' | 'zh'
type LocaleSource = 'profile' | 'cookie' | 'browser' | 'manual'

interface LocaleQueueState {
  setQueue: Promise<void>
  requestSeq: number
  initQueue: Promise<SupportedLocale | null> | null
}

function createLocaleQueueState(): LocaleQueueState {
  return {
    setQueue: Promise.resolve(),
    requestSeq: 0,
    initQueue: null,
  }
}

const LOG_PREFIX = '[i18n/orchestrator]'

/**
 * SSR runs this composable for every render, so an unconditional `console.info` here
 * wrote one identical line per request — 16,654 of them in one dev log whose only
 * traffic was the supervisor's health probe. Report each (runtime, source, locale)
 * resolution once per process and drop the repeats.
 */
const loggedLocaleResolutions = new Set<string>()

function logLocaleInitialized(source: LocaleSource, locale: SupportedLocale, extra?: Record<string, unknown>) {
  const key = `${import.meta.server ? 'server' : 'client'}:${source}:${locale}`
  if (loggedLocaleResolutions.has(key))
    return

  loggedLocaleResolutions.add(key)
  console.info(`${LOG_PREFIX} initialized`, { source, locale, ...extra })
}

// Isolate mutable locale queues per NuxtApp instance (per SSR/prerender request) so concurrent
// `/en/docs/*` and `/zh/docs/*` prerenders can never increment each other's request sequence or
// share an `initQueue` and skip `setLocale('zh')`.
const nuxtAppLocaleQueueStates = new WeakMap<object, LocaleQueueState>()
const fallbackClientLocaleQueueState = createLocaleQueueState()

function resolveLocaleQueueState(nuxtApp: object | null | undefined): LocaleQueueState {
  if (nuxtApp && typeof nuxtApp === 'object') {
    let state = nuxtAppLocaleQueueStates.get(nuxtApp)
    if (!state) {
      state = createLocaleQueueState()
      nuxtAppLocaleQueueStates.set(nuxtApp, state)
    }
    return state
  }

  return import.meta.server ? createLocaleQueueState() : fallbackClientLocaleQueueState
}

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
  const nuxtApp = typeof tryUseNuxtApp === 'function' ? tryUseNuxtApp() : null
  const queueState = resolveLocaleQueueState(nuxtApp)
  const composer = useI18n()
  const { locale, setLocale } = composer
  const route = useRoute()
  const explicitDocsLocale = () => normalizeLocale(/^\/(en|zh)\/docs(?:\/|$)/.exec(route.path)?.[1])
  const { status } = useNexusAuth()
  const { getPreferredLocale, hasManualPreferredLocale, markManualPreferredLocale, markProfilePreferredLocale, persistPreferredLocale } = useLocalePreference()
  const initDone = useState<boolean>('nexus-locale-init-done', () => false)
  const clientInitDone = useState<boolean>('nexus-locale-client-init-done', () => false)
  const manualPreferenceActive = useState<boolean>('nexus-locale-manual-preference-active', () => false)
  const profileSyncKey = useState<string | null>('nexus-locale-profile-sync-key', () => null)
  const profileSyncPending = useState<boolean>('nexus-locale-profile-sync-pending', () => false)
  const normalizeHits = useState<Record<SupportedLocale, number>>('nexus-locale-normalize-hits', () => ({
    en: 0,
    zh: 0,
  }))
  const activeRouteLocaleChunks = useState<RouteLocaleChunkName[]>(ACTIVE_ROUTE_LOCALE_CHUNKS_STATE_KEY, () => [])
  const routeLocaleChunkRevision = useState<number>(ROUTE_LOCALE_CHUNK_REVISION_STATE_KEY, () => 0)

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

    if (source !== 'browser')
      persistPreferredLocale(normalized)
    if (source === 'manual') {
      manualPreferenceActive.value = true
      markManualPreferredLocale()
    }
    else if (source === 'profile') {
      markProfilePreferredLocale()
    }
    return normalized
  }

  const updateProfileLocale = async (input: unknown) => {
    const normalized = normalizeLocaleWithMetrics(input, 'manual')
    if (!normalized || import.meta.server || status.value !== 'authenticated')
      return null

    try {
      const { patchCurrentUserProfile } = await import('~/composables/useCurrentUserApi')
      await patchCurrentUserProfile({ locale: normalized })
      return normalized
    }
    catch (error) {
      console.error(`${LOG_PREFIX} profile locale update failed`, error)
      return null
    }
  }

  const setManualLocale = async (input: unknown, options?: { syncProfile?: boolean }) => {
    const normalized = normalizeLocaleWithMetrics(input, 'manual')
    if (!normalized)
      return normalizeLocale(locale.value)

    persistLocale(normalized, 'manual')
    await setLocaleSerial(normalized, 'manual')

    if (options?.syncProfile !== false)
      await updateProfileLocale(normalized)

    return normalizeLocale(locale.value) || normalized
  }

  const setLocaleSerial = async (input: unknown, source: LocaleSource = 'manual') => {
    const normalized = normalizeLocaleWithMetrics(input, source)
    if (!normalized)
      return normalizeLocale(locale.value)

    const initialDocsLocale = explicitDocsLocale()
    if (initialDocsLocale && initialDocsLocale !== normalized)
      return normalizeLocale(locale.value)

    const requestSeq = ++queueState.requestSeq
    const prefetchedChunks = resolveAllRouteLocaleChunks(route.path || '/', activeRouteLocaleChunks.value)
    try {
      await ensureRouteLocaleChunks(normalized, prefetchedChunks)
    }
    catch (error) {
      if (requestSeq === queueState.requestSeq)
        throw error
      await queueState.setQueue.catch(() => {})
      return normalizeLocale(locale.value) || normalized
    }

    if (requestSeq !== queueState.requestSeq) {
      await queueState.setQueue.catch(() => {})
      return normalizeLocale(locale.value) || normalized
    }

    queueState.setQueue = queueState.setQueue
      .catch(() => {})
      .then(async () => {
        if (requestSeq !== queueState.requestSeq)
          return

        const docsLocale = explicitDocsLocale()
        if (docsLocale && docsLocale !== normalized)
          return
        if (locale.value === normalized)
          return

        const loadedChunks = new Set<RouteLocaleChunkName>(prefetchedChunks)
        let missingChunks = resolveAllRouteLocaleChunks(route.path || '/', activeRouteLocaleChunks.value)
          .filter(chunk => !loadedChunks.has(chunk))
        while (missingChunks.length > 0) {
          await ensureRouteLocaleChunks(normalized, missingChunks)
          if (requestSeq !== queueState.requestSeq)
            return
          missingChunks.forEach(chunk => loadedChunks.add(chunk))
          missingChunks = resolveAllRouteLocaleChunks(route.path || '/', activeRouteLocaleChunks.value)
            .filter(chunk => !loadedChunks.has(chunk))
        }

        const postChunkDocsLocale = explicitDocsLocale()
        if (postChunkDocsLocale && postChunkDocsLocale !== normalized)
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

    await queueState.setQueue
    return normalizeLocale(locale.value) || normalized
  }

  const ensureRouteLocaleChunks = async (targetLocale: SupportedLocale, chunks: RouteLocaleChunkName[]) => {
    if (chunks.length === 0)
      return

    await Promise.all(chunks.map(chunk => ensureRouteLocaleChunk(
      composer,
      targetLocale,
      chunk,
      chunk === 'landing' ? activeRouteLocaleChunks : undefined,
      routeLocaleChunkRevision,
    )))
  }

  const reconcileClientLocale = async (input?: { isAuthenticated?: boolean, profileLocale?: string | null }) => {
    if (import.meta.server)
      return normalizeLocale(locale.value)

    const preferredLocale = normalizeLocaleWithMetrics(getPreferredLocale(), 'cookie')
    const profileLocale = input?.isAuthenticated
      ? normalizeLocaleWithMetrics(input.profileLocale, 'profile')
      : null
    const browserLocale = resolveBrowserLocale()
    const target = preferredLocale || profileLocale || browserLocale
    const source: LocaleSource = preferredLocale
      ? 'cookie'
      : profileLocale
        ? 'profile'
        : 'browser'

    persistLocale(target, source)
    await setLocaleSerial(target, source)
    clientInitDone.value = true
    initDone.value = true

    logLocaleInitialized(source, target, { clientReconciled: true })

    return target
  }

  const initLocale = async (input?: { isAuthenticated?: boolean, profileLocale?: string | null }) => {
    if (import.meta.client && !clientInitDone.value)
      return normalizeLocale(locale.value)

    if (initDone.value) {
      if (import.meta.client)
        clientInitDone.value = true
      return normalizeLocale(locale.value)
    }

    if (queueState.initQueue)
      return await queueState.initQueue

    const preferredLocale = normalizeLocaleWithMetrics(getPreferredLocale(), 'cookie')

    queueState.initQueue = (async () => {
      const profileLocale = input?.isAuthenticated
        ? normalizeLocaleWithMetrics(input.profileLocale, 'profile')
        : null
      const browserLocale = resolveBrowserLocale()
      const target = preferredLocale || profileLocale || browserLocale
      const source: LocaleSource = preferredLocale
        ? 'cookie'
        : profileLocale
          ? 'profile'
          : 'browser'

      persistLocale(target, source)
      await setLocaleSerial(target, source)
      initDone.value = true
      if (import.meta.client)
        clientInitDone.value = true

      logLocaleInitialized(source, target)

      return target
    })()

    try {
      return await queueState.initQueue
    }
    finally {
      queueState.initQueue = null
    }
  }

  const syncFromProfileOnAuth = async (input: {
    status: string
    userId?: string | null
    profileLocale?: string | null
  }) => {
    if (import.meta.server)
      return

    if (explicitDocsLocale())
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
        const { fetchCurrentUserProfile } = await import('~/composables/useCurrentUserApi')
        const profile = await fetchCurrentUserProfile()
        nextLocale = normalizeLocaleWithMetrics(profile?.locale ?? null, 'profile')
      }

      if (explicitDocsLocale())
        return

      const preferredLocale = normalizeLocaleWithMetrics(getPreferredLocale(), 'cookie')
      const hasManualPreference = manualPreferenceActive.value || hasManualPreferredLocale()
      if (hasManualPreference && preferredLocale && nextLocale && preferredLocale !== nextLocale) {
        console.info(`${LOG_PREFIX} profile sync skipped by local preference`, {
          userId: userId || null,
          profileLocale: nextLocale,
          preferredLocale,
        })
        await updateProfileLocale(preferredLocale)
        return
      }

      if (nextLocale) {
        persistLocale(nextLocale, 'profile')
        await setLocaleSerial(nextLocale, 'profile')
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

  const getSavedLocale = (): string | null => getPreferredLocale()

  const saveUserLocale = async (input: unknown) => {
    const normalized = normalizeLocaleWithMetrics(input, 'manual')
    if (!normalized)
      return null

    persistLocale(normalized, 'manual')
    await updateProfileLocale(normalized)
    return normalized
  }

  const syncLocaleChanges = () => {
    if (import.meta.server)
      return

    watch(
      () => status.value,
      (currentStatus) => {
        void syncFromProfileOnAuth({ status: currentStatus })
      },
      { immediate: true },
    )

    watch(locale, (newLocale) => {
      const normalized = normalizeLocale(newLocale)
      if (!normalized || normalized === getSavedLocale())
        return
      void saveUserLocale(normalized)
    })
  }

  return {
    normalizeLocale,
    initLocale,
    reconcileClientLocale,
    persistLocale,
    setLocaleSerial,
    setManualLocale,
    getSavedLocale,
    saveUserLocale,
    syncLocaleChanges,
    syncFromProfileOnAuth,
  }
}
