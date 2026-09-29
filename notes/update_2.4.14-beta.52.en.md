# Tuff v2.4.14-beta.52 Release Notes

## Summary Notes

- Deep macOS directory watching is now event-driven and no longer recursively enumerates the existing tree at startup.
- Cold full indexing now yields CPU between persisted batches, reducing sustained pressure and UI stalls.
- File changes reconcile only the affected subtree, while Python dependency and cache directories are consistently excluded.
- TuffEx is upgraded to 0.6.1 with the official release of the TxStatusHint operation-feedback component.

## What's Changed

- Deep macOS scan roots now use an event-only FSEvents stream; shallow application directories and Windows/Linux retain their existing watcher backends.
- Directory changes, event loss, queue overflow, and symlink changes enter a bounded subtree reconciliation queue that rescans only affected admitted scopes.
- Full-scan persistence yields for at least 100 ms after every batch, while slower batches retain proportional backoff to avoid monopolizing main-process resources.
- Full scans, incremental watching, and search reads share exclusions for generated `uvcache`, `__pycache__`, and `site-packages` trees.
- macOS build and packaging gates now verify that FSEvents remains external and its native module is present in the packaged application.
- `@talex-touch/tuffex` is upgraded to 0.6.1 with TxStatusHint support for light and dark themes, retrigger feedback, reduced motion, and an accessible live region.
