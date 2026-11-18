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
    data: Record<string, unknown>
  }
  static: {
    data: Record<string, unknown>
  }
}

export function hasPopulatedUpdates(
  payload: { updates?: readonly unknown[] } | null | undefined,
): boolean {
  return Array.isArray(payload?.updates) && payload.updates.length > 0
}

/**
 * `/updates` is prerendered at build time without D1 bound, so the prerendered
 * HTML payload carries `{ updates: [] }`. Keep that payload during initial
 * client hydration so the first client VDOM matches SSR HTML, then discard
 * empty static payloads outside hydration and refresh from live `/api/updates`
 * once mounted.
 */
export function resolvePublicUpdatesCachedData<T extends { updates?: readonly unknown[] }>(
  payload: T | undefined,
  isHydrating?: boolean,
): T | undefined {
  if (isHydrating)
    return payload
  return hasPopulatedUpdates(payload) ? payload : undefined
}

export function resolvePublicUpdatesFromApp(
  nuxtApp: PublicUpdatesCacheSource,
  key: string,
): PublicUpdatesPayload | undefined {
  const cached = (nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]) as PublicUpdatesPayload | undefined
  return resolvePublicUpdatesCachedData(cached, nuxtApp.isHydrating)
}

export async function hydratePrerenderedUpdates(
  payload: { updates?: readonly unknown[] } | null | undefined,
  refresh: () => Promise<unknown>,
): Promise<boolean> {
  if (hasPopulatedUpdates(payload))
    return false
  await refresh()
  return true
}
