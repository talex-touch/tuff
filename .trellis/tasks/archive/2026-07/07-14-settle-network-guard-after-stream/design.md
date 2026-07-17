# Design: Stream-Lifecycle Network Guard Settlement

## Boundary

`executeWithPolicies()` keeps ownership of cooldown key/policy derivation, gate checks, fetch/open retries, and ordinary request settlement. It accepts an optional result-lifecycle attachment callback. Without that callback it records success exactly as today. With it, the executor returns the opened result without eager success and supplies idempotent `success()` / `failure()` callbacks tied to the same key and policy.

`requestStream()` uses that hook on the concrete Node `Readable`:

- `end` -> record one success;
- `error` -> record one failure;
- early `close` without either -> remove listeners and leave guard state unchanged.

The body stream remains the same object; no buffering, copying, replay, or consumer API change is introduced. Fetch/open failures still retry through the existing policy before a stream is returned. Body errors occur after handoff and therefore only affect health/cooldown; they are never retried.

## Invariants

- Settlement is at most once.
- An `error` remains observable by the consumer.
- Prior failures survive stream open and intentional cancellation.
- Full consumption honors `autoResetOnSuccess`.
- Ordinary `request()` behavior is unchanged.
