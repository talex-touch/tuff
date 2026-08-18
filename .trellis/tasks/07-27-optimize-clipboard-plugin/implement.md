# Clipboard History Implementation Plan

1. Add focused RED coverage for CoreBox input request construction, debounce, query+filter composition, page reset, stale-response isolation, clear query, empty results, history-update refresh, and retry.
2. Add focused permission/resource-policy coverage proving `tfile:` is rejected without a live `fs.tfile` grant and accepted only through the existing protocol allowlist when granted.
3. Add the `system.applications` permission metadata and bounded `system.resolveApplication` SDK contract; cover exact-id validation, permission denial, safe DTO projection, not-found behavior, and absence of native paths/image bytes.
4. Implement the System SDK handler by reusing the existing app provider identifier/path lookup, icon self-healing, and host-safe icon projection; do not duplicate application indexing or icon extraction.
5. Enable `showInput` / `allowInput` in the plugin manifest and refactor the current load function just enough to consume `FeatureSDK.onInputChange`, centralize request generation, and ignore stale results.
6. Preserve the current list/detail/action layout; replace populated-state whole-page blur with restrained inline loading feedback and query-specific empty/error/retry states.
7. Render selected-image originals through the permission-gated `tfile:` path with thumbnail fallback; lazily resolve and cache selected source-app details, showing icon/name or the raw id fallback.
8. Verify keyboard selection, copy, paste, favorite, delete, image resolution/fallback, source-app resolution/fallback, pagination, and live history refresh while a query is active.
9. Run focused host/SDK/plugin tests, CoreApp and plugin typechecks, plugin build, manifest validation, scoped lint where available, then smoke the real plugin surface in light/dark and wide/narrow windows.

## Validation Commands

```bash
pnpm --filter @talex-touch/clipboard-history-plugin test
pnpm --filter @talex-touch/clipboard-history-plugin typecheck
pnpm --filter @talex-touch/clipboard-history-plugin build
pnpm plugins:validate
# Run the focused CoreApp SDK/resource-policy test files identified during implementation.
pnpm --filter @talex-touch/core-app typecheck:node
pnpm --filter @talex-touch/core-app typecheck:web
```

## Guardrails

- No SearchSDK, client-side full-history ranking, or duplicate application/icon provider.
- `tfile:` access must remain both permission-gated and path-allowlisted; never broaden plugin WebContentsView access to arbitrary custom/file schemes.
- `system.resolveApplication` is exact lookup only and returns a bounded host-safe projection; never return executable/native paths or raw image bytes.
- Keep clipboard persistence and capture unchanged; changes span only the plugin, additive System SDK/permission contract, existing app-provider projection, and the smallest necessary resource gate.

## Rollback Points

- Search request-state refactor before CoreBox input wiring.
- Additive System SDK route before the plugin caller and permission declaration.
- Permission-aware `tfile:` resource rule before relying on original-image rendering; thumbnail fallback remains independently usable.
- No data migration rollback is required.
