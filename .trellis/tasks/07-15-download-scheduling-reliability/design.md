# Design

## Error classification

Normalize known HTTP status codes before generic network markers. The normalized download error carries status/type/canRetry; 404/410 are file-not-found and terminal. RetryStrategy logs retry attempts, while DownloadCenter owns the single terminal failure log.

## Capacity

Use one global in-flight reservation count/set owned by DownloadCenter. `scheduleTasks` reserves before starting asynchronous status work. Worker instances perform one task each, or the worker pool size itself equals configured concurrency; do not multiply both dimensions. A reservation is released in exactly one `finally` path.

Saturated work remains pending in the priority queue and never enters RetryStrategy.
