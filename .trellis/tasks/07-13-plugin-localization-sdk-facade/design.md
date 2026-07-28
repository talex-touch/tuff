# Plugin Localization SDK Facade Design

## Scope

Implement R8-E only: a typed plugin facade for host locale, localized text resolution, official Domain Lexicon reads, and in-memory plugin-scoped registration. Catalog persistence, signed packs, new official domains, and global third-party writes remain out of scope.

## Boundaries

- `packages/utils/i18n` owns official immutable entries, generic registry behavior, provenance, and reusable plugin-scoped overlay composition.
- `packages/utils/plugin/sdk/localization.ts` owns the plugin-facing TypeScript facade and typed transport projection. It contains no host state or permission decisions.
- `packages/utils/transport/events` owns request/response contracts and the `plugin:i18n:*` / `plugin:lexicon:*` event catalog.
- `apps/core-app/src/main/modules/plugin/plugin-localization-channels.ts` owns verified plugin identity, minimum-SDK checks, permission-gated handler registration, and host locale selection.
- `apps/core-app/src/main/modules/plugin/plugin-module.ts` registers/disposes handlers and clears scoped state on disable/unload.
- `apps/core-app/src/main/modules/plugin/plugin.ts` exposes the same transport-backed facade through `context.utils` and `context.utils.plugin`.
- `packages/utils/permission` and CoreApp permission UI/locales own the three explicit permission definitions and user-visible labels.

## Public Contracts

```ts
interface PluginI18nSDK {
  getLocale(): Promise<AppLocale>
  resolveText(value: LocalizedTextValue, locale?: AppLocale): Promise<string>
}

interface PluginLexiconSDK {
  resolve(id: string, options?: { locale?: AppLocale; domain?: DomainLexiconDomain }): Promise<ResolvedDomainLexiconEntry | null>
  search(query: string, options?: DomainLexiconSearchOptions): Promise<DomainLexiconMatch[]>
  register(entries: readonly PluginDomainLexiconEntryInput[], options?: { replace?: boolean }): Promise<PluginLexiconRegisterResponse>
}

interface PluginLocalizationSDK {
  i18n: PluginI18nSDK
  lexicon: PluginLexiconSDK
}
```

Renderer consumers use `usePluginI18n()` / `usePluginLexicon()` or `createPluginLocalizationSDK(...)`. Main plugin lifecycles receive the same `i18n` and `lexicon` objects at both `context.utils.*` and `context.utils.plugin.*`.

## SDK Version And Permissions

- Add `SdkApi.V260713` and set it as `CURRENT_SDK_VERSION`; retain every older marker in `SUPPORTED_SDK_VERSIONS`.
- Add `LOCALIZATION_FACADE_MIN_VERSION = SdkApi.V260713`.
- `plugin:i18n:get-locale` and `plugin:i18n:resolve-text` require `i18n.read`.
- `plugin:lexicon:resolve` and `plugin:lexicon:search` require `lexicon.read`.
- `plugin:lexicon:register` requires `lexicon.register`.
- Every handler uses `withPermission({ failClosedForPlugin: true, requireVerifiedPlugin: true })`, then resolves the loaded plugin and enforces its declared SDK marker. Payload identity is never accepted.

## Scoped Registry Rules

- Official entries use explicit `source: 'builtin'`; later signed packs may use `catalog:<id>`.
- Registration inputs use plugin-local IDs only. The host rejects blank IDs, IDs that already resolve officially, and IDs beginning with `plugin:`.
- Effective IDs are `plugin:<pluginId>:<localId>` and source is `plugin:<pluginId>`; the host overwrites caller-provided provenance.
- Each plugin has an independent immutable registry. Resolve/search compose only the official registry and that caller's registry.
- A registration call stages the full next map, validates/builds a new immutable registry, and commits only after success. `replace: true` replaces that plugin's entire overlay; otherwise entries upsert by local ID.
- Hard bounds: at most 100 entries per plugin, 50 entries per call, and 256 KiB serialized input per call. Registry validation remains the canonical validation for localized labels/aliases and serializable metadata.
- Disable/unload deletes the plugin overlay. No disk/network writes occur.

## Data Flow

```text
plugin facade
  -> typed PluginEvents + declared _sdkapi
  -> verified plugin transport context
  -> minimum SDK + permission guard
  -> host locale / ScopedDomainLexiconRegistry
  -> serializable localized result
```

Main-process plugin lifecycles use the same event path through a host transport adapter; there is one authorization and behavior contract for renderer and main callers.

## Compatibility And Failure Rules

- Existing SDK markers and APIs remain supported.
- Existing unit conversion imports keep `unitLexiconRegistry`; it becomes an alias of the official singleton rather than a second registry.
- Missing/invalid locale falls back only through the shared locale normalizer; malformed localized values fail instead of producing a naked object/key.
- Permission, identity, minimum-SDK, namespace, size, and registry validation failures are explicit and preserve existing scoped state.
- Plugins cannot enumerate or resolve another plugin's overlays.

## Verification

- Utils tests: provenance/official singleton, scoped namespace/isolation/upsert/replace/atomic failure/bounds, and renderer SDK typed event payloads.
- CoreApp tests: verified identity, minimum SDK, each permission boundary, host locale projection, registration/search/resolve, and lifecycle clear.
- Existing unit lexicon/conversion/PreviewSDK suites remain green.
- Run scoped ESLint and CoreApp node/web typechecks.
