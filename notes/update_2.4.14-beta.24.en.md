# Tuff v2.4.14-beta.24 Release Notes

## Summary Notes

- Chunked downloads for large app updates now strictly respect the configured concurrency limit, avoiding bursts of Range requests against one official asset.
- After a chunk reaches terminal failure, active download lanes settle while queued chunks are not claimed, preventing retry overlap with background writes.
- This release is intended to revalidate official macOS OTA download, replacement, and startup health acknowledgement.

## What's Changed

- Replaced modulo-lane scheduling with a worker pool so each chunk download executes through a bounded lane.
- Terminal failure now establishes shared state before other lanes can claim more chunks, then reports the first error only after active lanes settle.
- Added deterministic concurrency and terminal-failure regression coverage for the download scheduler.
