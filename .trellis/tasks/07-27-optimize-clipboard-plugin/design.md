# Clipboard History Technical Design

## Direction

Keep Clipboard History as one focused history manager. Add database-backed search to the existing surface without introducing a generic SearchSDK, a second UI mode, or client-side full-history ranking.

## Data Flow

```text
search input + existing filter
  -> debounce
  -> request generation increment
  -> clipboard.history.searchHistory({
       keyword, type/isFavorite, page, pageSize: 50, sortOrder: 'desc'
     })
  -> ignore stale generation
  -> replace page 1 or merge later pages by id
  -> preserve/select nearest valid item
```

SQLite remains the source of truth. Existing host behavior performs `LIKE` filtering over content, raw HTML, and metadata, then orders by timestamp descending. The plugin does not fetch all rows or re-rank them.

## UI Changes

- Add one search input near the existing type/favorite filters.
- Keep the current list/detail split and action bar.
- Search and filters are one query control group; changing either resets pagination.
- Show compact loading feedback without blurring the whole populated interface.
- Show a query-specific empty state and a retry action for failed reads.
- Do not label the capability fuzzy, intelligent, semantic, or exhaustive beyond the database contract.

## State And Concurrency

- Add `searchQuery`, `debouncedQuery`, and monotonically increasing `requestGeneration` to the view orchestration.
- One function owns request construction for initial load, pagination, filter change, search change, retry, and history refresh.
- Each request captures its generation and only commits if still current.
- A history-change event restarts page 1 with the active query/filter.
- Later pages merge by id and retain timestamp-desc order.

## Matching Boundary

- Text and raw HTML can match through existing columns.
- Image OCR text/keywords may match when present in metadata.
- File records match their persisted content/metadata representation.
- No client-side typo tolerance or custom scoring is added.

## Compatibility And Security

- No new permissions, transport events, database schema, or SDK contract.
- Existing Clipboard SDK is the only data boundary.
- Existing copy/paste/favorite/delete and image URL resolution remain intact.

## Rollback

The change is isolated to plugin state, UI, and tests. Removing the search control and keyword request field restores current behavior; no persisted migration exists.
