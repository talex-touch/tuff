# Network Error Classification Contracts

Rules for deciding what a failed `NetworkService` call means. Three classifiers
share one error object and disagree about retry semantics, so a misfiled error
either strands a user on a dead source or retries work they cancelled.

## Scenario: Deciding whether a failure is worth retrying or falling back from

### 1. Scope / Trigger

Applies to any caller that branches on *why* a network call failed —
`release-fetch-service`'s `isOfficialFallbackEligible` / `isRetryable`,
`GithubUpdateProvider.isRetryableError`, and anything added alongside them.

### 2. Signatures

```ts
// packages/utils/network/core/errors.ts
NETWORK_ERROR_CODE.TRANSPORT_FAILED  // 'NETWORK_TRANSPORT_FAILED'

class NetworkTransportError extends Error {
  readonly code: 'NETWORK_TRANSPORT_FAILED'
  readonly netErrorCode?: string        // 'ERR_CONNECTION_CLOSED'
  constructor(originalMessage: string, options?: { cause?: unknown })
}

isTransportFailureError(error: unknown): boolean
isTimeoutLikeError(error: unknown): boolean
parseHttpStatusCode(error: unknown): number | null
```

### 3. Contracts

- **One error, one classifier.** `isTransportFailureError`, `isTimeoutLikeError`
  and `parseHttpStatusCode` must not both claim the same error.
  `TRANSPORT_FAILURE_MARKERS` therefore carries no timeout or
  `NETWORK_HTTP_STATUS_*` spelling — `etimedout` was listed once while the doc
  comment claimed otherwise, putting one error in two classifiers with different
  retry semantics (`f1f48bad1`). Chromium's `ERR_CONNECTION_TIMED_OUT` is the
  deliberate exception: it matches neither half of `/timeout|etimedout/i`, so the
  transport list owns it.

- **Callers OR the classifiers rather than replacing one.** Both
  `release-fetch-service` checks are
  `isTimeoutLikeError(error) || isTransportFailureError(error)`. Dropping the
  timeout half breaks the one official-source failure that reached GitHub before
  transport classification existed.

- **No blanket `net::err_` marker.** Chromium files user cancellation
  (`ERR_ABORTED`), permission and policy refusals (`ERR_ACCESS_DENIED`,
  `ERR_BLOCKED_BY_CLIENT`) and caller bugs (`ERR_INVALID_URL`,
  `ERR_UNSAFE_PORT`) under the same prefix; a substring catch-all claimed all
  five (`5072d9858`). The two failure modes are not symmetric — missing a novel
  transport code degrades to pre-fix behaviour for that one code, while matching
  a cancellation retries work the user just cancelled. Enumerate explicitly.
  `err_connection_` and `err_cert_` stay as prefixes because every member of
  those two families qualifies.

- **Three dialects, all live.** `session.fetch` (main) emits `net::ERR_*`; the
  global `fetch()` in `packages/utils/network/request.ts` emits `Failed to fetch`
  under Chromium and `fetch failed` under Node/undici. Matching one dialect is
  matching a spelling, not the property — the original bug matched only undici's,
  which is the only one of the three that never runs production OTA.

### 4. Normalization boundary

`projectNetworkRequestError` (`network-service.ts`) is where a raw transport
error becomes `NetworkTransportError`, in the order abort → timeout → transport.
Abort and timeout carry stronger semantics and must match first.

The wrapper **preserves `message` verbatim**. Roughly two dozen `NetworkService`
callers still match on message text (`network-log-noise.ts` among them), so
rewriting it to the code — as `NetworkTimeoutError` does — would silently change
their behaviour. `code` is the additive part new callers classify on.

### 5. Error identity degrades with distance

`isTransportFailureError` checks three tiers in order: `instanceof` → `.code` →
message substring. This is not redundancy. In-process the class survives; across
the transport SDK only `code` does; across a raw IPC hop that projects errors to
`error.message` (`transport/prelude.ts`), the renderer receives a plain `Error`
and the string is all that is left. `GithubUpdateProvider` lives on the far side
of that hop, so removing the message tier would make the classifier silently
useless at one of its three call sites.

### 6. Marker-list reuse

`network-log-noise.ts` spreads `TRANSPORT_FAILURE_MARKERS` rather than keeping a
copy — the copy had already drifted and was missing `err_connection_closed`, the
code the official update host actually produced. Log-noise suppression has no
one-classifier-per-error rule, so entries the shared list excludes for
classification reasons (timeout spellings, rate-limit and Cloudflare challenge
markers) are re-added locally.

### 7. Verification notes

Reproducing a transport failure by pointing a source at an unreachable address
requires care: `https://127.0.0.1:9` yields `ERR_UNSAFE_PORT` (a caller bug this
classifier deliberately rejects), not a transport failure. Use a closed but legal
port for `ERR_CONNECTION_REFUSED`, or a bogus hostname for
`ERR_NAME_NOT_RESOLVED`.

Negative cases carry the weight in tests here: a marker list that matches
everything passes every positive case while quietly stealing errors from the
timeout and HTTP-status classifiers.
