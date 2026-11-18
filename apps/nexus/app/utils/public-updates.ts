import { toRaw } from 'vue'

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

const LIVE_PUBLIC_UPDATES = Symbol('livePublicUpdates')

type MarkedPublicUpdatesPayload = PublicUpdatesPayload & {
  [LIVE_PUBLIC_UPDATES]?: true
}

export interface PublicUpdatesRefreshState {
  payload: PublicUpdatesPayload | null | undefined
  prerenderedAt?: unknown
  liveLoaded?: boolean
}

export function markLivePublicUpdatesPayload(
  payload: PublicUpdatesPayload,
): PublicUpdatesPayload {
  const raw = toRaw(payload)
  const committed: PublicUpdatesPayload = {
    updates: Array.isArray(raw?.updates) ? [...raw.updates] : [],
  }
  Object.defineProperty(committed, LIVE_PUBLIC_UPDATES, {
    value: true,
    enumerable: false,
  })
  return committed
}

export function isLivePublicUpdatesPayload(
  payload: PublicUpdatesPayload | null | undefined,
): boolean {
  if (!payload || typeof payload !== 'object')
    return false
  const raw = toRaw(payload) as MarkedPublicUpdatesPayload
  return Boolean(
    (payload as MarkedPublicUpdatesPayload)[LIVE_PUBLIC_UPDATES]
    || raw[LIVE_PUBLIC_UPDATES],
  )
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
  const liveLoaded = Boolean(state.liveLoaded || isLivePublicUpdatesPayload(state.payload))
  if (liveLoaded && hasPopulatedUpdates(state.payload))
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
 * a committed live `/api/updates` response is present.
 */
export function resolvePublicUpdatesCachedData(
  payload: PublicUpdatesPayload | undefined,
  options: {
    cause?: string
    isHydrating?: boolean
    prerenderedAt?: unknown
    liveLoaded?: boolean
  },
): PublicUpdatesPayload | undefined {
  if (options.cause === 'refresh:manual' || options.cause === 'refresh:hook')
    return undefined
  if (options.isHydrating)
    return payload
  if (!hasPopulatedUpdates(payload))
    return undefined
  const liveLoaded = Boolean(options.liveLoaded || isLivePublicUpdatesPayload(payload))
  if (liveLoaded)
    return payload
  if (options.prerenderedAt || !hasNonAnnouncementUpdates(payload))
    return undefined
  return payload
}

export function resolvePublicUpdatesFromApp(
  nuxtApp: PublicUpdatesCacheSource,
  key: string,
  cause?: string,
): PublicUpdatesPayload | undefined {
  const cached = (nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]) as PublicUpdatesPayload | undefined
  return resolvePublicUpdatesCachedData(cached, {
    cause,
    isHydrating: nuxtApp.isHydrating,
    prerenderedAt: nuxtApp.payload.prerenderedAt,
  })
}

export async function hydratePrerenderedUpdates(
  options: PublicUpdatesRefreshState & {
    refresh: () => Promise<unknown>
  },
): Promise<boolean> {
  if (!shouldRefreshPublicUpdates(options))
    return false
  await options.refresh()
  return true
}
