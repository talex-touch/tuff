/**
 * The MainWindow surfaces that are not settings categories.
 *
 * Three readers have to agree on these paths: the router registers them, the destination catalog
 * points at them, and the conversation navigation service builds one of them from a stored id.
 * Written out three times, a renamed route turns into a search result that lands on a blank page,
 * which is invisible in review. Pure data — no Electron, no router, no storage — so main-process
 * code and cross-layer tests read the same table.
 */

export const APP_SURFACE_ROUTES = Object.freeze({
  home: '/home',
  /** The parameterised pattern, exactly as the router registers it under `/home`. */
  conversation: '/home/c/:id',
  store: '/store',
  storeInstalled: '/store/installed',
  downloads: '/downloads',
  /** The applications category, whose split page selects whatever {@link applicationRoute} names. */
  applications: '/setting/applications'
})

/**
 * The conversation route a search result opens, for one stored conversation id.
 *
 * The id is percent-encoded rather than interpolated: it comes from a database row today, and this
 * is the one function that decides how it becomes a path. Callers still validate the id's shape
 * first — this only guarantees the encoding, not the authority.
 */
export function conversationRoute(id: string): string {
  return `/home/c/${encodeURIComponent(id)}`
}

/** The query parameter the applications page reads the entry it must select from. */
export const APPLICATION_ROUTE_ENTRY_PARAM = 'entry'

/**
 * The applications page with one indexed application selected.
 *
 * The path is percent-encoded rather than interpolated: it is a filesystem path — a macOS bundle
 * directory, a Windows `shell:AppsFolder\…` id, a UNC share — and this is the one function that
 * decides how it becomes a query value. Callers still validate the path's shape first; this only
 * guarantees the encoding, not the authority.
 */
export function applicationRoute(path: string): string {
  return `${APP_SURFACE_ROUTES.applications}?${APPLICATION_ROUTE_ENTRY_PARAM}=${encodeURIComponent(path)}`
}
