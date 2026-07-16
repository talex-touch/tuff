# Implementation plan

1. Reorder/structure HTTP classification and keep retryable network cases unchanged.
2. Remove duplicate terminal error logging between RetryStrategy and DownloadCenter.
3. Make configured concurrency a single global budget and reserve synchronously in the scheduler.
4. Release reservations after every complete/fail/cancel path.
5. Exercise 404, timeout, burst scheduling, cancellation, and completion ordering.
