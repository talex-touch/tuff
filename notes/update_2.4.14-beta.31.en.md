# Tuff v2.4.14-beta.31 Release Notes

## Summary Notes

- The macOS realtime file watcher now matches the full scanner through 24 levels below each configured root, so deep creates, edits, renames, and deletes no longer wait for a later rebuild.
- CoreBox now switches immediately from the recommendation grid to search results when result motion is disabled or low-power mode is active, instead of leaving an empty content area above the footer.
- The main process registers the clipboard change stream before creating the CoreBox renderer, eliminating startup `clipboard:monitor:change:stream:start` missing-handler errors.
- Grid shortcut badges now belong to the card's top-right corner, and the build uses UnoCSS's declared aggregate entry so a clean install no longer misses undeclared subpackages.

## What's Changed

- Added the shared `FILE_SCAN_MAX_DEPTH=24` contract and exercised realtime `files` plus `search_index` ingestion at depths 0, 1, 4, 8, 9, 12, 16, and 24 across text, data, image, document, and archive formats; depth 25, hidden files, and temporary files remain excluded.
- Reordered foreground modules so Clipboard handlers register before CoreBox prewarms its renderer, with a startup-order regression.
- Applied Vue `out-in` mode only while result motion is enabled, allowing the low-power path to replace grid and list content directly; a real-Transition regression covers the switch.
- Anchored `⌘1`–`⌘6` to grid card corners while preserving the compact hint below the icon and `⌘7`–`⌘0` at the right edge of list rows.
