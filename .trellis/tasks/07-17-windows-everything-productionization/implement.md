# Windows Everything Productionization Implementation Plan

## Implementation

1. Replace OCR-only native preflight with exact required-addon verification;
   require Everything on Windows and retain OCR requirements on every packaged
   platform where currently required.
2. Add a post-package Everything runtime verifier covering the JS wrapper,
   unpacked `tuff_native_everything.node`, and packaged resolution path; wire it
   into `build-target.js` for Windows.
3. Add the bounded Everything performance tracker and expose its aggregate in
   `EverythingStatusResponse` and Settings diagnostic evidence.
4. Extend the diagnostic verifier with performance invariants and optional
   thresholds/sample requirements used by Windows acceptance.
5. Extend the Windows Everything acceptance case to require packaged SDK, CLI
   recovery, unavailable, search-mode, and performance evidence without
   weakening existing global acceptance gates.
6. Preserve `sdk-napi -> cli -> unavailable`, abort semantics, path/noise
   filtering, explicit degraded status, and FileProvider query fallback.

## Validation

- Focused native/build-target verifier tests.
- Focused Everything provider, evidence builder, diagnostic verifier, and
  Windows acceptance tests.
- `corepack pnpm -C apps/core-app run typecheck:node`
- `corepack pnpm -C apps/core-app run typecheck:web`
- `corepack pnpm -C apps/core-app run build`
- `corepack pnpm lint:changed`
- On Windows: native self-check, beta/release package build, SDK/CLI/unavailable
  collection, at least 200 searches, then strict Windows acceptance verification.

## Risk And Rollback Points

- Never accept another native addon as proof of Everything availability.
- Do not log query text or paths in performance evidence.
- Abort is not an error or fallback and must not corrupt backend health.
- SDK failure may select CLI; CLI failure must remain visible even if the query
  degrades to FileProvider.
- Windows package/runtime evidence cannot be substituted by a Darwin build.
