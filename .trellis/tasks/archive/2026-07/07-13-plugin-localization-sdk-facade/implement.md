# Plugin Localization SDK Facade Execution

## Implementation Order

1. Extend Domain Lexicon entries with source provenance, export one official unit registry, and add an atomic `ScopedDomainLexiconRegistry` with host-owned plugin namespaces and bounds.
2. Add R8-E SDK marker, permission definitions/mappings, typed localization transport payloads/events, and localized permission/category labels.
3. Add `createPluginLocalizationSDK`, `usePluginI18n`, and `usePluginLexicon`; export and type them in the plugin SDK barrel/context surface.
4. Add CoreApp permission-gated localization channel registration using verified transport identity, host locale, loaded-plugin SDK version, and the scoped registry.
5. Wire channel registration, main plugin facade injection, and disable/unload cleanup.
6. Add focused tests and update SDK/R8 documentation after the behavioral path is green.

## Review Gates

- No handler accepts plugin identity from request payload.
- Main and renderer callers traverse the same typed events and authorization path.
- Official entries are never copied into mutable plugin state or shadowed by scoped IDs.
- Failed registration is atomic; another plugin cannot read, search, replace, or clear the caller's overlay.
- Permissions fail closed when the permission module, declaration, grant, verified identity, or minimum SDK is missing.
- No SQLite, file, network, CatalogService, or private sync side effect enters the slice.
- Existing unit conversion defaults and exact `KB` / `Kb` behavior remain unchanged.

## Validation

```bash
corepack pnpm --filter @talex-touch/utils exec vitest run <localization SDK/scoped lexicon/sdk-version/unit suites>
corepack pnpm --filter @talex-touch/core-app exec vitest run <plugin localization channel/lifecycle suites>
corepack pnpm --filter @talex-touch/core-app run typecheck:node
corepack pnpm --filter @talex-touch/core-app run typecheck:web
corepack pnpm --filter @talex-touch/utils exec eslint --quiet <touched utils files>
corepack pnpm --filter @talex-touch/core-app exec eslint --quiet <touched CoreApp files>
```

## Completion Evidence

- Utils focused suites: 7 files / 56 tests passed, including sdk version, official/scoped lexicon, localization facade, unit conversion and permission status.
- CoreApp localization/permission suites: 4 files / 29 tests passed; plugin facade/loader suites: 2 files / 41 tests passed.
- CoreApp `typecheck:node` and `typecheck:web` passed.
- Scoped utils/CoreApp ESLint passed; touched source/tests/docs were formatted with Prettier.
- Planning, quality baseline, changelog, project status and plugin SDK developer documentation now identify R8-E as complete and R8-F CatalogService MVP as next.

## Rollback

Remove the new event/facade/permission surface and scoped overlay service, restore the prior SDK marker, and point `unitLexiconRegistry` back to its local immutable construction. No schema, persisted data, network state, or user configuration requires migration rollback; newly granted permission IDs become inert if the API is removed.
