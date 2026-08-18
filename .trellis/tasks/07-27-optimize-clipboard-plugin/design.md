# Clipboard History Technical Design

## Direction

Keep Clipboard History as one focused history manager. Use the existing CoreBox input and Clipboard SDK for database-backed search, restore permission-gated image rendering, and project source-application identity through one bounded System SDK call. Do not introduce a generic SearchSDK, a second UI mode, or client-side full-history ranking.

## Data Flow

```text
CoreBox input -> FeatureSDK.onInputChange + existing filters
  -> debounce
  -> request generation increment
  -> clipboard.history.searchHistory({
       keyword, type/isFavorite, page, pageSize: 50, sortOrder: 'desc'
     })
  -> ignore stale generation
  -> replace page 1 or merge later pages by id
  -> preserve/select nearest valid item

selected image -> Clipboard SDK original tfile URL
  -> WebContentsView resource gate checks live fs.tfile permission
  -> existing tfile protocol path allowlist
  -> detail image; on load failure use persisted thumbnail

selected sourceApp id -> per-view cache -> system.resolveApplication(id)
  -> permission gate: system.applications
  -> existing app provider exact identifier/path lookup + icon self-healing
  -> bounded { identifier, displayName, icon } DTO
  -> detail icon/name; on failure keep original id
```

SQLite remains the clipboard source of truth. Existing host behavior performs `LIKE` filtering over content, raw HTML, and metadata, then orders by timestamp descending. The plugin does not fetch all rows or re-rank them. The existing app provider remains the application identity and icon owner; Clipboard History does not persist or decode native app icons.

## UI Changes

- Enable the host CoreBox input through the WebContent `showInput` / `allowInput` contract instead of adding a duplicate search field inside the plugin.
- Keep the current list/detail split and action bar.
- Search and filters are one query control group; changing either resets pagination.
- Show compact loading feedback without blurring the whole populated interface.
- Show a query-specific empty state and a retry action for failed reads.
- Render the selected image in the detail pane, with the existing thumbnail as a visible fallback.
- Resolve source application details lazily for the selected item, cache by exact source id, and display icon plus human name without blocking clipboard content.
- Do not label the search capability fuzzy, intelligent, semantic, or exhaustive beyond the database contract.

## State And Concurrency

- Add `searchQuery`, `debouncedQuery`, and monotonically increasing `requestGeneration` to the view orchestration.
- One function owns request construction for initial load, pagination, filter change, search change, retry, and history refresh.
- Each request captures its generation and only commits if still current.
- A history-change event restarts page 1 with the active query/filter.
- Later pages merge by id and retain timestamp-desc order.
- Source-application resolution is selected-item lazy, deduplicated by id, bounded to the view lifetime, and does not invalidate the clipboard result generation.

## Matching Boundary

- Text and raw HTML can match through existing columns.
- Image OCR text/keywords may match when present in metadata.
- File records match their persisted content/metadata representation.
- No client-side typo tolerance or custom scoring is added.

## Compatibility And Security

- Add only the permissions required by the displayed capabilities: `fs.tfile` for original image URLs and `system.applications` for exact source-app projection.
- WebContentsView may load `tfile:` only when the current plugin has a live `fs.tfile` grant; the existing tfile protocol path allowlist remains the final data-plane guard.
- `system.resolveApplication` accepts one exact identifier and returns only `identifier`, `displayName`, and a host-safe icon URL. It never exposes executable paths, native filesystem paths, or image bytes.
- Existing Clipboard SDK remains the clipboard data boundary; existing copy/paste/favorite/delete permission gates stay unchanged.
- Missing/denied new capabilities fail closed at the host and degrade in the plugin to the thumbnail or raw source id.

## Rollback

The plugin UI/manifest changes can roll back independently from the additive System SDK handler and the permission-aware `tfile:` resource rule. No persisted migration exists. Removing the SDK route requires first removing the plugin caller and `system.applications` declaration; removing the resource rule returns image detail to thumbnail-only behavior.
