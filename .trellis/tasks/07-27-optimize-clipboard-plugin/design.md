# Clipboard History Technical Design

## Product Shape

Clipboard History remains one independent plugin. Its surface gains two views over one shared state model:

- **Quick**: search-first list optimized for keyboard selection, copy, and paste.
- **Detail**: current split inspector with preview, metadata, text tokens, colors, and OCR.

A compact segmented control switches views. First launch uses Quick; later launches restore the last view using view-scoped local preference storage, without adding a new privileged permission. Query, filter, selected id, candidate progress, and action state are shared.

## Data Flow

```text
Clipboard SDK pages (100/page, no keyword prefilter)
  -> generation guard + filter request
  -> plugin SearchSDK session.add(page)
  -> bounded, stable Top-K + match ranges + progress
  -> shared view model
  -> Quick list / Detail inspector
```

Empty query keeps the existing paginated recent-history flow. Non-empty query starts a new generation and progressively scans all pages for the active filter. Results from recent pages appear immediately while remaining pages continue in the background.

## Search Lifecycle

- Increment `searchGeneration` whenever query or filter changes.
- Debounce text input briefly; create a fresh AbortController and SearchSDK session.
- Fetch page size 100 sequentially to avoid request bursts and preserve deterministic first-seen order.
- After each page, publish current Top-K and `{ processed, total, complete }`.
- Ignore responses whose generation is stale, even if transport cancellation arrives late.
- Clipboard history updates invalidate the active generation and restart from page 1 while preserving query/filter/mode.
- Search result limit is bounded; the UI states that ranking covers all N records once complete, even though only Top-K is rendered.

## Candidate Fields

- Text/HTML: normalized visible content, plain text derived from HTML, source app, selected metadata labels.
- Files: file names and display paths; do not index raw serialized list punctuation as meaningful tokens.
- Images: OCR text, OCR keywords, source app, and safe metadata labels; binary/data URLs are excluded.
- Field weights prioritize visible content/file name/OCR text over metadata and source app.

## UI Structure

- Top toolbar: shared search input, type/favorite filter, Quick/Detail segmented control, truthful coverage status.
- Quick mode: one dense list with highlighted matches, source/type/time metadata, arrow navigation, Enter paste, Cmd/Ctrl+Enter copy.
- Detail mode: existing list + inspector, with the same highlighted result ordering and current selection.
- Bottom action area contains item commands only; filters move out of the footer.
- Loading uses stable list placeholders/progress, not whole-page blur. Errors preserve current results and expose retry.
- All controls have semantic buttons/inputs, focus-visible states, dark theme support, and reduced-motion behavior.

## State Ownership

Extract a focused composable for history/search orchestration instead of expanding `ClipboardManagerView.vue`. Components receive typed projections and emit commands; they do not call SDKs independently.

## Compatibility And Security

- Keep existing Clipboard permissions and SDK domain boundaries.
- No Search transport or new permission.
- SearchSDK receives only data already returned to this plugin.
- Existing copy/paste/favorite/delete behavior and manifest feature identity remain compatible.

## Risks And Mitigations

- Large histories: sequential pages, bounded Top-K, cancellation, and visible progress.
- Rapid mutation: generation guard plus restart prevents stale overwrite.
- Heavy image payloads: search fields exclude data URLs and resolved image bytes.
- Unicode highlights: SearchSDK owns ranges and tests.

## Rollback

Clipboard adoption is UI/state-only and stores one harmless view preference. Reverting restores existing pagination and layout; no database migration is required.
