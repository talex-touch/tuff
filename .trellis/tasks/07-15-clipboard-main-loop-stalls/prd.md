# Eliminate clipboard main-loop stalls

## Goal

Prevent unchanged clipboard polling and heavy payload inspection from blocking the Electron main event loop.

## Requirements

- Use the native watcher/change sequence as the fast gate for payload reads.
- Do not call image, file, text, or HTML readers for an unchanged sequence.
- Preserve initial baseline capture, forced CoreBox refresh, freshness, dedupe, and plugin notifications.
- Move or defer heavyweight image transformation where Electron ownership permits.
- Keep diagnostics truthful about the actual blocking phase.

## Acceptance Criteria

- [x] Repeated unchanged polls perform no payload read.
- [x] New text, file, and image clipboard contents are still persisted once.
- [x] A forced baseline still captures current content.
- [x] The exercised large image/file scenario produces no multi-second event-loop lag.
