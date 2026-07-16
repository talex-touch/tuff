# Fix download scheduling reliability

## Goal

Make download error outcomes and configured global concurrency deterministic.

## Requirements

- Classify HTTP 404/410 as terminal file-not-found before generic network handling.
- Use structured status/code data where available instead of ambiguous substring order.
- Log one terminal failure after retries, without duplicating the final attempt.
- Reserve global capacity atomically before asynchronous task startup.
- Treat scheduler saturation as queued work, not an operation failure.
- Keep cancellation, progress, retry broadcasts, and history behavior intact.

## Acceptance Criteria

- [x] 404/410 use one attempt, `file_not_found`, `canRetry=false`, and the correct user message.
- [x] Retryable network failures retain configured backoff.
- [x] Burst submissions never exceed configured global concurrency and do not emit maximum-concurrency failures.
- [x] Each failed task emits one terminal failure log/broadcast/status transition.
