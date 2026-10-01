# Tuff v2.4.14-beta.56 Release Notes

## Summary Notes

- Browser Open is bundled with the client, so copied URLs can open directly in a local browser from CoreBox.
- Application icons now load in lists and details after a cold start.
- Escape clears attachments without waiting for the main process, retains the query, and dismisses the overlay, attachments, and input in separate steps.
- CoreBox customization and detailed wallpaper controls are hidden by default and available under About → Advanced Settings.
- Right now keeps its heading and learning guidance while usage habits develop, without inventing frequently used items.

## What's Changed

- Browser Open is a client-managed built-in plugin updated with the app while preserving local settings and data; the marketplace no longer offers ordinary installation that would fail on its reserved name.
- Plugin details show the required SDK marker, the current client's supported marker, and compatibility; client-managed installation and SDK compatibility are explained separately.
- Local application icons load on the first visit to lists and details without a page reload.
- Escape closes the current window's action overlay first, clears image or text attachments next, and clears input afterward; dismissing an attachment retains the existing query.
- Escape in DivisionBox is unaffected by another window's action-overlay visibility.
- Advanced Settings is available in production builds; disabling it hides editors while saved layouts, wallpapers, and filters remain active.
- An empty habitual grid shows learning and pinning guidance that disappears when habitual or pinned tiles become available, without changing numbered shortcut positions.
- Update devalue to 5.9.3 to address security issues in shared-memory serialization, repeated-string expansion, and asynchronous rejection handling.
