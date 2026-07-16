# Design

## Key contract

Keep logical keys unchanged. Resolve them as slash-separated relative paths under the configured storage root. Validate every segment before resolution and retain a final containment check. Backslashes are rejected so POSIX logical keys behave identically on Windows. Flat keys resolve exactly as before.

Validation is called at every transport read/write/delete entry before cache access. A validation failure returns/throws immediately and cannot increment a version, broadcast, or mark dirty.

## Dirty failures

Persistence failures are classified as permanent validation failures or retryable I/O failures. Validation should be impossible after ingress; if encountered from internal state, quarantine that key and log once. Retryable I/O failures remain dirty but use per-key exponential backoff and rate-limited diagnostics instead of every polling tick.

## Migration

No logical-key migration. Existing namespaced paths are loaded in place. `fs-extra.ensureFile` creates parent directories on first persist.
