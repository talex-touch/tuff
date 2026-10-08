import type { AdminFormat } from '~/composables/useAdminFormat'
import type { AdminListOptions } from '~/composables/useAdminList'
import type { ClientListFetcher } from '~/utils/admin-client-list'
import { createClientListFetcher } from '~/utils/admin-client-list'

/**
 * Updates & News (`/admin/updates`): the row shape, the filters and how a row is
 * matched against them. The endpoint returns every update at once, so the list
 * filters and pages on the client (`createClientListFetcher`) while the page, the
 * page size and every filter still live in the URL. Labels stay in the page,
 * where the i18n guards read them.
 */

export interface AdminUpdateText {
  zh: string
  en: string
}

export type AdminUpdateType = 'news' | 'release' | 'announcement' | 'config' | 'data'
export type AdminUpdateScope = 'web' | 'system' | 'both'

export interface AdminUpdate {
  id: string
  type: AdminUpdateType
  scope: AdminUpdateScope
  channels: string[]
  releaseTag: string | null
  title: AdminUpdateText
  timestamp: string
  summary: AdminUpdateText
  tags: string[]
  link: string
  payloadUrl?: string | null
  payloadVersion?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface AdminUpdateFilters extends Record<string, string> {
  q: string
  type: string
  channel: string
  scope: string
  source: string
  range: string
}

/** `all` is each select's "All …" entry; it never reaches the URL. */
export const ADMIN_UPDATE_FILTER_DEFAULTS: AdminUpdateFilters = {
  q: '',
  type: 'all',
  channel: 'all',
  scope: 'all',
  source: 'all',
  range: 'all',
}

export const ADMIN_UPDATE_PAGE_SIZES = [20, 50, 100]

export const ADMIN_UPDATE_TYPES: readonly AdminUpdateType[] = ['release', 'news', 'announcement', 'config', 'data']
export const ADMIN_UPDATE_SCOPES: readonly AdminUpdateScope[] = ['web', 'system', 'both']
export const ADMIN_UPDATE_CHANNELS = ['RELEASE', 'BETA', 'SNAPSHOT'] as const
export const ADMIN_UPDATE_RANGES = ['7d', '30d', '90d'] as const

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }
const DAY_MS = 24 * 60 * 60 * 1000

/** Release entries come from the release sync, and so does anything carrying a release tag. */
export function isAutoUpdate(update: Pick<AdminUpdate, 'type' | 'releaseTag'>): boolean {
  return update.type === 'release' || Boolean(update.releaseTag)
}

/**
 * A manual update is a calendar day, not an instant: the form writes the picked
 * `YYYY-MM-DD` as `T00:00:00.000Z` and reads it back with `slice(0, 10)`. So a
 * timestamp at exactly UTC midnight is read in UTC; anything else (a release
 * synced with its publish time) is an instant, shown in local time.
 */
export function isCalendarDayTimestamp(timestamp: string | null | undefined): boolean {
  if (!timestamp)
    return false
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime()))
    return false
  return date.getUTCHours() === 0 && date.getUTCMinutes() === 0
    && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
}

/**
 * The date column (`cell`) and its tooltip / the drawer's line (`full`). In
 * Los Angeles a day picked as 2026-09-26 printed 2026-09-25 when read locally.
 */
export function updateDateLabels(
  format: Pick<AdminFormat, 'tableDate' | 'date' | 'dateTimeTitle'>,
  timestamp: string,
): { cell: string, full: string } {
  if (isCalendarDayTimestamp(timestamp))
    return { cell: format.tableDate(timestamp, { timeZone: 'UTC' }), full: format.date(timestamp, { timeZone: 'UTC' }) }
  return { cell: format.tableDate(timestamp), full: format.dateTimeTitle(timestamp) }
}

/** Release entries belong to the release sync: the console neither edits nor deletes them. */
export function isEditableUpdate(update: Pick<AdminUpdate, 'type'>): boolean {
  return update.type !== 'release'
}

/** The reader's language first, the other one when that half was left blank. */
export function localizedUpdateText(text: Partial<AdminUpdateText> | null | undefined, locale: string): string {
  const zh = text?.zh?.trim() ?? ''
  const en = text?.en?.trim() ?? ''
  return locale.toLowerCase().startsWith('zh') ? (zh || en) : (en || zh)
}

/** Inside the range, counted back from `now`. An unreadable timestamp is never filtered out. */
export function matchesUpdateRange(timestamp: string, range: string, now: number): boolean {
  const days = RANGE_DAYS[range]
  if (days === undefined)
    return true
  const time = new Date(timestamp).getTime()
  if (Number.isNaN(time))
    return true
  return now - time <= days * DAY_MS
}

/**
 * Search runs over both languages at once — an administrator looking for an
 * update by its English title should find it from the Chinese console too —
 * plus the release tag, the tags and the channels.
 */
export function updateSearchText(update: AdminUpdate): string {
  return [
    update.title?.zh,
    update.title?.en,
    update.summary?.zh,
    update.summary?.en,
    update.releaseTag,
    ...(update.tags ?? []),
    ...(update.channels ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
}

export function matchesUpdateFilters(update: AdminUpdate, filters: AdminUpdateFilters, now: number): boolean {
  if (filters.type !== 'all' && update.type !== filters.type)
    return false
  if (filters.scope !== 'all' && update.scope !== filters.scope)
    return false
  if (filters.channel !== 'all') {
    const channels = (update.channels ?? []).map(channel => channel.toUpperCase())
    // An update that names no channel goes out on every channel, so it matches each one.
    if (channels.length > 0 && !channels.includes(filters.channel.toUpperCase()))
      return false
  }
  if (filters.source === 'auto' && !isAutoUpdate(update))
    return false
  if (filters.source === 'manual' && isAutoUpdate(update))
    return false
  if (!matchesUpdateRange(update.timestamp, filters.range, now))
    return false
  const keyword = filters.q.trim().toLowerCase()
  return !keyword || updateSearchText(update).includes(keyword)
}

export type UpdatesRequest = (path: string) => Promise<unknown>

export interface UpdatesListSource {
  /** `fetch` of `options`; `invalidate()` it before `list.refresh()` to load again. */
  fetch: ClientListFetcher<AdminUpdate, AdminUpdateFilters>
  options: AdminListOptions<AdminUpdate, AdminUpdateFilters>
}

/**
 * `useAdminList` options for the updates list. The page passes `requestJson`;
 * tests pass a fake and a fixed clock, so what they exercise is what ships.
 */
export function createUpdatesListSource(
  request: UpdatesRequest,
  errorFallback: () => string,
  now: () => number = Date.now,
): UpdatesListSource {
  const fetch = createClientListFetcher<AdminUpdate, AdminUpdateFilters>(
    async () => {
      const response = await request('/api/dashboard/updates') as { updates?: unknown } | null
      return Array.isArray(response?.updates) ? response.updates as AdminUpdate[] : []
    },
    (update, filters) => matchesUpdateFilters(update, filters, now()),
  )
  return {
    fetch,
    options: {
      fetch,
      defaults: ADMIN_UPDATE_FILTER_DEFAULTS,
      defaultLimit: 20,
      pageSizes: ADMIN_UPDATE_PAGE_SIZES,
      debounceKeys: ['q'],
      errorFallback,
    },
  }
}

/** `DELETE /api/dashboard/updates/:id`. */
export function updateItemPath(id: string): string {
  return `/api/dashboard/updates/${encodeURIComponent(id)}`
}
