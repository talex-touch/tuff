# Productionize Windows Everything Search

## Goal

Close SDK/CLI strategy, packaged native availability, diagnostics, Windows acceptance, and P50/P95 evidence for Everything search.

## Confirmed Decision

- Keep the production strategy `sdk-napi -> cli -> unavailable`. The bundled
  `@talex-touch/tuff-native/everything` addon is the preferred backend; `es.exe`
  remains an explicit recovery fallback instead of the primary product promise.
- Do not change FileProvider/FTS schema or silently treat an unavailable backend
  as a successful empty search.

## Requirements

1. Windows packaging MUST rebuild and verify the exact
   `tuff_native_everything.node` addon, not accept an arbitrary `.node` file as
   proof that Everything SDK support exists.
2. The packaged Windows application MUST contain the JS wrapper and unpacked
   native addon required by `@talex-touch/tuff-native/everything`, and the build
   must fail closed when either part is absent.
3. Runtime fallback order remains SDK, then validated `es.exe`, then explicit
   unavailable/degraded diagnostics. Abort never changes backend state or
   triggers a fallback.
4. Settings/evidence MUST expose backend, version, CLI path, fallback-chain
   attempts, health, path-filtering state, and bounded runtime performance:
   sample count, P50, P95, timeout/error counts, and SDK-to-CLI fallback ratio.
5. Performance accounting MUST use bounded in-memory samples, must not contain
   query text or file paths, and must distinguish SDK success, CLI success,
   fallback, abort, timeout, and error.
6. Windows acceptance MUST cover three backend states: packaged SDK available,
   SDK unavailable with CLI recovery, and fully unavailable. Ordinary search,
   explicit `@file`, and structured file filters must be exercised without
   bypassing existing CoreBox search contracts.
7. Existing watch-root/file-noise filtering, manual CLI selection, portable
   installation, diagnostics, and FileProvider degradation behavior remain
   compatible.

## Acceptance Criteria

- [x] Windows build preflight requires `tuff_native_ocr.node` and
      `tuff_native_everything.node` by exact filename.
- [x] Post-package verification proves the Everything wrapper, canonical
      resource manifest, and native addon exist at the paths used by the
      packaged runtime; removing any required file makes the verifier fail.
- [x] The existing explicit Download Center flow downloads the checksum-pinned
      Everything SDK archive, extracts the architecture-specific DLL, and
      configures the native loader without replacing an explicit override.
- [x] Focused runtime tests preserve `sdk-napi -> cli -> unavailable`, abort
      behavior, explicit degraded reasons, path/noise filtering, and CLI recovery.
- [x] Diagnostic evidence contains internally consistent performance samples,
      P50/P95, timeout/error counts, and fallback ratio without query/path content.
- [x] Windows SDK, CLI fallback, and unavailable evidence each pass the strict
      production collector for their declared expected state.
- [x] A packaged Windows self-check queries through the SDK backend, returns a
      real result, and records Everything `1.4.1.1032`.
- [ ] Normal, `@file`, and structured-filter CoreBox searches have packaged UI
      result/empty/degraded evidence rather than mock output.
- [x] P50/P95 and fallback evidence is collected from 200 Windows SDK samples
      and 200 Windows CLI samples without query/path content.
- [ ] The real backend evidence is attached to a completed Windows acceptance
      manifest and passes strict manifest verification.
- [x] CoreApp node/web typechecks, focused tests, and Windows snapshot package
      build pass.
- [ ] Strict packaged CoreBox Windows acceptance verification passes.

## Out of Scope

- Replacing Everything with FileProvider indexing or changing FTS schema.
- Removing the CLI fallback before packaged SDK evidence is stable.
- Installing Everything outside the existing explicit Download Center flow.
- Claiming Windows acceptance from macOS, mocks, or synthetic-only artifacts.

## Notes

- Real Windows package/runtime evidence is mandatory for final completion.
- `.github/workflows/windows-everything-production.yml` now defines a hosted
  `windows-2022` PR/manual gate. The release workflow runs the same verified
  runtime setup and real SDK/CLI/unavailable collector before packaging.
- The gate reads the canonical version/checksum manifest, requires 200 SDK and
  CLI samples, enforces SDK P95/max thresholds, builds the Windows snapshot,
  and uploads redacted evidence plus packaged-native proof.
- Hosted run `29628880312` passed all SDK/CLI/unavailable, focused-test,
  Windows package, packaged-native, artifact-upload, and cleanup steps.
- Artifact `windows-everything-production-evidence` records SDK P50/P95 `2/3ms`,
  CLI P50/P95 `8/9ms`, exact unavailable errors (SDK backend `2`, CLI `8`),
  and packaged wrapper/resource-manifest/native proof. Packaged CoreBox UI
  evidence remains open.
