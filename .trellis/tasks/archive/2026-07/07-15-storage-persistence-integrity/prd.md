# Fix storage persistence integrity

## Goal

Make logical namespaced storage keys persist safely and prevent permanent persistence failures from poisoning the dirty queue.

## Requirements

- Accept `intelligence/prompt-library` and `division-box/preferences` as safe relative namespaced keys.
- Reject absolute paths, traversal, empty segments, NUL, and platform separator abuse before reading or mutating cache state.
- Preserve flat-key file locations and Sync logical identities.
- Return save failure synchronously for invalid keys.
- Prevent terminal persistence errors from retrying every polling interval.

## Acceptance Criteria

- [x] Both namespaced stores save under the config root and reload after cache/process reset.
- [x] Traversal inputs cannot escape the config root on POSIX or Windows path semantics.
- [x] Invalid save requests do not increment version, broadcast, or remain dirty.
- [x] A non-validation I/O failure remains observable without unbounded identical log spam.
