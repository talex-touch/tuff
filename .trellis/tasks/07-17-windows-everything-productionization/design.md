# Windows Everything Productionization Design

## Architecture

Keep one runtime chain:

```text
CoreBox query
  -> EverythingProvider
  -> packaged @talex-touch/tuff-native/everything (sdk-napi)
  -> validated es.exe (cli fallback)
  -> explicit unavailable/degraded state
  -> existing FileProvider fallback only for query-time backend failure
```

No new provider, raw channel, database, or index is introduced.

## Packaged Native Contract

`packages/tuff-native/binding.gyp` builds both `tuff_native_ocr.node` and
`tuff_native_everything.node`. `build-target.js` must verify both exact outputs
after Electron native rebuild. The post-package verifier must inspect the
packaged `@talex-touch/tuff-native` wrapper and the unpacked native addon used by
`native-loader.js`; an unrelated `.node` file is never acceptable evidence.

The native addon is Windows-only in product behavior even though a stub-compatible
binary may compile elsewhere. Only Windows package/runtime evidence closes the
contract.

## Runtime Metrics

Add a bounded in-memory performance tracker owned by `EverythingProvider`.
Each completed backend attempt records only:

- backend (`sdk-napi` or `cli`)
- outcome (`success`, `timeout`, `error`, `aborted`)
- rounded duration
- whether the request crossed from SDK to CLI

The tracker exposes aggregate sample count, P50, P95, maximum, timeout/error
counts, backend counts, fallback count, and fallback ratio. It stores no query,
result path, filename, or result payload. Samples are capped and discarded FIFO.

`EverythingStatusResponse` and diagnostic evidence carry the aggregate. The
evidence verifier recomputes internal invariants and rejects impossible counts,
percentiles, ratios, or negative/non-finite values.

## Acceptance Evidence

The existing Windows acceptance manifest remains the owner. The Everything case
must bind:

1. packaged SDK evidence (`backend=sdk-napi`), including version and native
   self-check;
2. CLI recovery evidence (`backend=cli`) with an SDK attempt failure;
3. unavailable evidence proving a visible degraded reason;
4. at least 200 real Windows samples with P50/P95/fallback ratio;
5. normal, explicit `@file`, and structured-filter searches.

Synthetic and non-Windows artifacts may validate collectors/verifiers but cannot
close the Windows gate.

## Compatibility And Rollback

- Preserve current settings, portable installation, manual CLI selection,
  fallback chain, noise filtering, and FileProvider fallback.
- The performance contract is additive and in-memory only.
- Rollback removes the metric field/verifier gates and exact Everything package
  assertion; it requires no data migration.
