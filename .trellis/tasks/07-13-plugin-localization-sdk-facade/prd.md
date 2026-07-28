# Implement plugin localization SDK facade

## Goal

Land R8-E: expose host-owned locale and Domain Lexicon capabilities to plugins through a typed, permission-gated SDK facade without exposing mutable official registries or allowing one plugin to affect another.

## Requirements

- Add a new supported `sdkapi` marker for the localization facade while preserving all currently supported markers and existing plugin behavior.
- Expose typed plugin APIs for `getLocale()`, localized text resolution, official/scoped lexicon `resolve()` / `search()`, and plugin-scoped `register()` from both renderer SDK imports and `context.utils` / `context.utils.plugin`.
- Route renderer and main plugin calls through the same typed transport events; derive identity from verified host transport context and forward the declared `sdkapi` marker.
- Add explicit `i18n.read`, `lexicon.read`, and `lexicon.register` permissions with localized permission/category labels. Calls must fail closed when identity, SDK version, permission runtime, declaration, or grant is missing.
- Keep official entries immutable. Registration accepts plugin-local IDs, assigns host-owned `plugin:<pluginId>:` canonical IDs and `plugin:<pluginId>` provenance, rejects official IDs/prefixed IDs, and never exposes another plugin's scoped entries.
- Keep plugin registrations in memory only and clear them when the plugin is disabled or unloaded. Registration must be atomic and bounded; failed validation must preserve the previous registry.
- Preserve Phase 3 unit conversion behavior and make the official unit registry the single shared read source. Do not add CatalogService, SQLite persistence, network downloads, currency/timezone data, or global third-party writes.

## Acceptance Criteria

- [x] Renderer and main plugin facades expose the same typed i18n/lexicon methods and send the current plugin `sdkapi` marker over typed events.
- [x] Host handlers require verified plugin context, enforce the R8-E minimum SDK marker, and fail closed against the three explicit permissions.
- [x] Official unit entries resolve/search with host locale; localized text uses the host locale unless an explicit valid locale is requested.
- [x] Plugin registration is bounded, atomic, host-namespaced/provenanced, cannot override official or other-plugin IDs, and is invisible to other plugins.
- [x] Disable/unload clears scoped registrations while official entries remain available.
- [x] Permission registry/UI labels, SDK exports/version docs, R8 planning docs, and focused developer examples match the implemented surface.
- [x] Focused SDK/service/channel/lifecycle tests, scoped lint, and CoreApp node/web typechecks pass.

## Notes

- Source requirements: `docs/plan-prd/03-features/i18n-lexicon-catalog-2.6.0-prd.md` Phase 4 and `docs/plan-prd/04-implementation/R8-R9-Next-Stage-Execution-Plan-2026-06-24.md` R8-E.
- Plugin registrations are runtime overlays only; CatalogService remains the future source for signed global catalog entries.
