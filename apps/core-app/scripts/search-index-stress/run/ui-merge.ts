/**
 * Port of the row merge in `renderer/.../hooks/useSearch.ts` (`mergeRenderedItems`,
 * `rankArrivals`, `applyRenderedItemQuota`) over the fields it reads, so the rank the harness
 * reports is the rank a user sees. Change both together; `useSearch.rank.test.ts` holds the
 * reference cases this module's tests repeat.
 */

export interface RowItem {
  id: string
  kind: string
  title: string
  sourceId: string
  sourceType: string
  /** `meta.app.path` */
  appPath: string | null
  /** `meta.file.path` */
  filePath: string | null
  /** `scoring.final` when it is a number */
  score: number | null
  /** `scoring.pinned === true` */
  pinned: boolean
  /** `scoring.match_details.type` */
  matchType: string | null
}

export const MAX_RENDERED_RESULTS = 80
export const MIN_SLOTS_PER_SOURCE = 6
export const MAX_INCOMING_BATCH_ITEMS = 200

function pathKey(value: string | null | undefined): string {
  return value ? value.trim().replace(/\\/g, '/').toLowerCase() : ''
}

export function applyRenderedItemQuota(
  rankedItems: RowItem[],
  keepItemId: string | null = null
): RowItem[] {
  if (rankedItems.length <= MAX_RENDERED_RESULTS) return rankedItems

  const selectedIds = new Set<string>()
  for (let index = 0; index < MAX_RENDERED_RESULTS; index++) selectedIds.add(rankedItems[index].id)

  const sourceTotals = new Map<string, number>()
  const sourceSelected = new Map<string, number>()
  for (const item of rankedItems) {
    sourceTotals.set(item.sourceId, (sourceTotals.get(item.sourceId) ?? 0) + 1)
    if (selectedIds.has(item.id))
      sourceSelected.set(item.sourceId, (sourceSelected.get(item.sourceId) ?? 0) + 1)
  }

  let evictCursor = MAX_RENDERED_RESULTS - 1
  const evictLowestSpareSlot = (): boolean => {
    while (evictCursor >= 0) {
      const candidate = rankedItems[evictCursor]
      evictCursor -= 1
      if (!candidate || !selectedIds.has(candidate.id)) continue
      if (candidate.pinned || candidate.id === keepItemId) continue
      const selected = sourceSelected.get(candidate.sourceId) ?? 0
      if (selected <= Math.min(MIN_SLOTS_PER_SOURCE, sourceTotals.get(candidate.sourceId) ?? 0))
        continue
      selectedIds.delete(candidate.id)
      sourceSelected.set(candidate.sourceId, selected - 1)
      return true
    }
    return false
  }

  for (const [sourceId, total] of sourceTotals) {
    let deficit = Math.min(MIN_SLOTS_PER_SOURCE, total) - (sourceSelected.get(sourceId) ?? 0)
    if (deficit <= 0) continue
    for (const item of rankedItems) {
      if (deficit <= 0) break
      if (item.sourceId !== sourceId || selectedIds.has(item.id)) continue
      if (!evictLowestSpareSlot()) break
      selectedIds.add(item.id)
      sourceSelected.set(sourceId, (sourceSelected.get(sourceId) ?? 0) + 1)
      deficit -= 1
    }
  }

  return rankedItems.filter((item) => selectedIds.has(item.id))
}

export function rankArrivals(items: RowItem[]): RowItem[] {
  return items
    .map((item, index) => ({
      item,
      index,
      pinned: item.pinned,
      score: typeof item.score === 'number' ? item.score : 0
    }))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (b.score !== a.score) return b.score - a.score
      return a.index - b.index
    })
    .map((entry) => entry.item)
}

export function mergeRenderedItems(
  current: RowItem[],
  incoming: RowItem[],
  keepItemId: string | null = null
): RowItem[] {
  const renderedIndexById = new Map<string, number>()
  const appPaths = new Set<string>()

  current.forEach((item, index) => {
    renderedIndexById.set(item.id, index)
    if (item.kind === 'app' && item.appPath) appPaths.add(pathKey(item.appPath))
  })

  const merged = [...current]
  const arrivals: RowItem[] = []
  const arrivalIndexById = new Map<string, number>()
  for (const item of incoming) {
    const appPath = item.kind === 'app' ? item.appPath : null
    if (appPath) appPaths.add(pathKey(appPath))
    if (item.kind === 'file') {
      const filePath = pathKey(item.filePath || item.id)
      if (filePath.endsWith('.app') && appPaths.has(filePath)) continue
    }
    if (item.kind === 'app' && appPath) {
      const existingFileIndex = merged.findIndex(
        (existing) =>
          existing.kind === 'file' && pathKey(existing.filePath || existing.id) === pathKey(appPath)
      )
      if (existingFileIndex >= 0) {
        merged[existingFileIndex] = item
        continue
      }
    }
    const renderedIndex = renderedIndexById.get(item.id)
    if (renderedIndex !== undefined) {
      merged[renderedIndex] = item
      continue
    }
    const arrivalIndex = arrivalIndexById.get(item.id)
    if (arrivalIndex !== undefined) {
      arrivals[arrivalIndex] = item
      continue
    }
    arrivalIndexById.set(item.id, arrivals.length)
    arrivals.push(item)
  }
  if (arrivals.length === 0) return applyRenderedItemQuota(merged, keepItemId)

  const ranked = rankArrivals(arrivals)
  const firstUnpinned = ranked.findIndex((item) => !item.pinned)
  const pinnedArrivals = firstUnpinned === -1 ? ranked : ranked.slice(0, firstUnpinned)
  const unpinnedArrivals = firstUnpinned === -1 ? [] : ranked.slice(firstUnpinned)
  if (pinnedArrivals.length > 0) {
    let pinnedEnd = 0
    while (pinnedEnd < merged.length && merged[pinnedEnd].pinned) pinnedEnd += 1
    merged.splice(pinnedEnd, 0, ...pinnedArrivals)
  }
  for (const item of unpinnedArrivals) {
    const score = item.score
    if (
      !keepItemId &&
      item.matchType === 'semantic' &&
      typeof score === 'number' &&
      Number.isFinite(score) &&
      score > 0
    ) {
      let insertAt = 0
      for (let index = merged.length - 1; index >= 0; index -= 1) {
        const existing = merged[index]
        if (existing.pinned || score <= (typeof existing.score === 'number' ? existing.score : 0)) {
          insertAt = index + 1
          break
        }
      }
      if (insertAt < merged.length) {
        merged.splice(insertAt, 0, item)
        continue
      }
    }
    merged.push(item)
  }

  return applyRenderedItemQuota(merged, keepItemId)
}

/** What the CoreBox list holds for one query: the snapshot, then every streamed batch merged in. */
export class RenderedRows {
  private rows: RowItem[] = []

  applySnapshot(items: readonly RowItem[]): void {
    this.rows = applyRenderedItemQuota([...items])
  }

  applyUpdate(items: readonly RowItem[]): void {
    const batch =
      items.length > MAX_INCOMING_BATCH_ITEMS
        ? items.slice(0, MAX_INCOMING_BATCH_ITEMS)
        : [...items]
    if (batch.length === 0) return
    this.rows = mergeRenderedItems(this.rows, batch, null)
  }

  /** The first MAX_RENDERED_RESULTS rows, one per id, as the list renders them. */
  get visible(): RowItem[] {
    const byId = new Map<string, RowItem>()
    for (const item of this.rows) byId.set(item.id, item)
    return [...byId.values()].slice(0, MAX_RENDERED_RESULTS)
  }
}
