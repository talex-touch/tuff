# Unit Domain Lexicon V1 Execution

## Implementation Order

1. Add generic read-only Domain Lexicon contracts and deterministic indexes in `packages/utils/i18n/lexicon.ts`; export them from the i18n barrel.
2. Add the serializable unit baseline in `packages/utils/i18n/unit-lexicon.ts`, preserving every existing unit with canonical IDs and both locale labels/aliases.
3. Replace the unit conversion file's private label/alias table with registry-backed resolution and a canonical-ID conversion map. Keep existing exports and default behavior.
4. Thread optional `AppLocale` through `PreviewAbilityContext`, UnitConversionAbility, CoreApp PreviewProvider, and QuickOps developer preview.
5. Update focused tests for registry invariants, locale behavior, conversion compatibility, and case-sensitive data symbols.

## Review Gates

- Lexicon metadata contains no functions and survives `JSON.stringify` / parse.
- Conversion functions exist only in the conversion core.
- All-locale aliases parse regardless of current locale; locale changes display/ranking only.
- Exact symbol lookup precedes folded aliases; no alias collision uses last-write-wins.
- Existing callers compile without passing locale.
- No Plugin SDK registration, permission, CatalogService, SQLite, currency, or timezone work enters this slice.

## Validation

```bash
corepack pnpm --filter @talex-touch/utils exec vitest run __tests__/i18n/lexicon.test.ts __tests__/core-box/unit-conversion-core.test.ts __tests__/core-box/preview-sdk.test.ts
corepack pnpm --filter @talex-touch/core-app exec vitest run src/main/modules/box-tool/addon/preview/preview-provider.test.ts src/main/modules/quick-ops/index.test.ts
corepack pnpm --filter @talex-touch/core-app run typecheck:node
corepack pnpm --filter @talex-touch/core-app run typecheck:web
corepack pnpm --filter @talex-touch/utils exec eslint --quiet <touched utils files>
corepack pnpm --filter @talex-touch/core-app exec eslint --quiet <touched CoreApp files>
```

Observed 2026-07-13: utils focused tests 31/31, PreviewProvider 8/8, QuickOps 114/114, CoreApp node/web typechecks, and both scoped ESLint runs passed. The utils Vitest config only discovers `__tests__/**/*.test.ts`; focused tests live under that tree.

## Rollback

Revert the registry/data additions and restore the prior private unit definition table. No schema, persisted data, network state, or user configuration changes require migration rollback.
