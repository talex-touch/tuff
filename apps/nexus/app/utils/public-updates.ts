export interface LocalizedText {
  zh: string
  en: string
}

export interface DashboardUpdate {
  id: string
  type: 'news' | 'release' | 'announcement' | 'config' | 'data'
  scope: 'web' | 'system' | 'both'
  channels: string[]
  releaseTag: string | null
  title: LocalizedText
  timestamp: string
  summary: LocalizedText
  tags: string[]
  link: string
}

export interface PublicUpdatesPayload {
  updates: DashboardUpdate[]
}

export interface PublicUpdatesCacheSource {
  isHydrating?: boolean
  payload: {
    prerenderedAt?: unknown
    data: Record<string, unknown>
  }
  static: {
    data: Record<string, unknown>
  }
}

export interface PublicUpdatesRefreshState {
  payload: PublicUpdatesPayload | null | undefined
  prerenderedAt?: unknown
  liveLoaded: boolean
}

export function hasPopulatedUpdates(
  payload: { updates?: readonly unknown[] } | null | undefined,
): boolean {
  return Array.isArray(payload?.updates) && payload.updates.length > 0
}

/**
 * `listUpdates()` falls back to a hardcoded static announcement when D1 is
 * unbound during build-time prerender, so `{ updates: [announcement] }`
 * still lacks every release/update row from D1.
 */
export function hasNonAnnouncementUpdates(
  payload: { updates?: readonly Pick<DashboardUpdate, 'type'>[] } | null | undefined,
): boolean {
  return Array.isArray(payload?.updates)
    && payload.updates.some(update => update?.type !== 'announcement')
}

export function shouldRefreshPublicUpdates(
  state: PublicUpdatesRefreshState,
): boolean {
  if (state.liveLoaded && hasPopulatedUpdates(state.payload))
    return false
  if (state.prerenderedAt)
    return true
  return !hasNonAnnouncementUpdates(state.payload)
}

/**
 * `/updates` is prerendered at build time without D1 bound, so the prerendered
 * HTML payload carries only static fallback entries (`prerenderedAt` is set).
 * Keep that payload during initial client hydration so the first client VDOM
 * matches SSR HTML, then ignore stale/static payloads outside hydration until
 * live `/api/updates` has loaded.
 */
export function resolvePublicUpdatesCachedData(
  payload: PublicUpdatesPayload | undefined,
  options: {
    cause?: string
    isHydrating?: boolean
    prerenderedAt?: unknown
    liveLoaded: boolean
  },
): PublicUpdatesPayload | undefined {
  if (options.cause === 'refresh:manual' || options.cause === 'refresh:hook')
    return undefined
  if (options.isHydrating)
    return payload
  if (!hasPopulatedUpdates(payload))
    return undefined
  if (options.liveLoaded)
    return payload
  if (options.prerenderedAt || !hasNonAnnouncementUpdates(payload))
    return undefined
  return payload
}

export function resolvePublicUpdatesFromApp(
  nuxtApp: PublicUpdatesCacheSource,
  key: string,
  liveLoaded: boolean,
  cause?: string,
): PublicUpdatesPayload | undefined {
  const cached = (nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]) as PublicUpdatesPayload | undefined
  return resolvePublicUpdatesCachedData(cached, {
    cause,
    isHydrating: nuxtApp.isHydrating,
    prerenderedAt: nuxtApp.payload.prerenderedAt,
    liveLoaded,
  })
}

export async function hydratePrerenderedUpdates(
  options: PublicUpdatesRefreshState & {
    refresh: () => Promise<unknown>
    markLiveLoaded: () => void
  },
): Promise<boolean> {
  if (!shouldRefreshPublicUpdates(options))
    return false
  await options.refresh()
  options.markLiveLoaded()
  return true
}
