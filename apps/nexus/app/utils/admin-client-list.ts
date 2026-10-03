import type { AdminListFetchParams, AdminListFilters, AdminListPage } from '~/composables/useAdminList'

/**
 * `useAdminList`'s `fetch` for an endpoint that answers with every row at once
 * (`GET /api/dashboard/updates` has no paging of its own).
 *
 * The first call loads everything and keeps it; every later call filters and
 * slices that copy, so turning a page or changing a filter costs no request and
 * the page, the page size and the filters still live in the URL like any other
 * console list. A failed load is not kept: the next call — the table's retry —
 * asks again.
 *
 * `useAdminList.refresh()` calls `fetch` with the parameters it already has, which
 * would only re-slice the copy. To load again (the refresh button, after a save or
 * a delete), call `invalidate()` first:
 *
 * ```ts
 * fetchUpdates.invalidate()
 * await list.refresh()
 * ```
 */
export interface ClientListFetcher<Row, F extends AdminListFilters> {
  (params: AdminListFetchParams<F>): Promise<AdminListPage<Row>>
  /** Forget the loaded rows, so the next call loads them again. */
  invalidate: () => void
}

export function createClientListFetcher<Row, F extends AdminListFilters>(
  loadAll: () => Promise<Row[]>,
  filter: (row: Row, filters: F) => boolean,
): ClientListFetcher<Row, F> {
  // The load in flight or done, shared by every call until it is invalidated:
  // a filter change that lands while the first load is still running waits for
  // it instead of starting a second one.
  let rows: Promise<Row[]> | null = null

  function loadRows(): Promise<Row[]> {
    if (rows)
      return rows
    const load = Promise.resolve()
      .then(loadAll)
      .then(result => (Array.isArray(result) ? result : []))
    rows = load
    load.catch(() => {
      // Only forget this load: an invalidate + reload may already have replaced it.
      if (rows === load)
        rows = null
    })
    return load
  }

  const fetcher = (async (params: AdminListFetchParams<F>): Promise<AdminListPage<Row>> => {
    const all = await loadRows()
    const matching = all.filter(row => filter(row, params.filters))
    const start = (params.page - 1) * params.limit
    return {
      rows: matching.slice(start, start + params.limit),
      total: matching.length,
    }
  }) as ClientListFetcher<Row, F>

  fetcher.invalidate = () => {
    rows = null
  }

  return fetcher
}
