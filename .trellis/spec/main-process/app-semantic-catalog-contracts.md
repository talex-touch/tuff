# App Semantic Catalog Contracts (category vocabulary / locale aliases)

## Scenario: adding vocabulary, languages, or catalog entries to app-semantic-catalog.ts

### 1. Scope / Trigger

Any edit to category alias groups, per-app entries, or the derivation rules in
`modules/box-tool/addon/apps/app-semantic-catalog.ts`. Introduced 2026-08-06
(08-06-semantic-catalog-i18n-aliases), catalog version 5.

### 2. Signatures

```ts
const SEMANTIC_ALIAS_LOCALES = ['en', 'zh'] as const  // union type derives from this array
type LocalizedAliasGroup = Partial<Record<SemanticAliasLocale, readonly string[]>>
function compileAliasGroup(group: LocalizedAliasGroup): readonly string[]
export function expandEnglishPlural(alias: string): readonly string[]
const LOCALE_ALIAS_EXPANSIONS: Record<SemanticAliasLocale, (alias: string) => readonly string[]>
export const APP_SEMANTIC_ALIAS_CATALOG_VERSION: number
```

### 3. Contracts

- **New language** = add the locale to `SEMANTIC_ALIAS_LOCALES` + one rule in
  `LOCALE_ALIAS_EXPANSIONS` (identity is fine) + per-group keys as needed. Never scatter
  another language's words into an existing locale array.
- **Category groups are localized vocabulary; per-app aliases are flat proper nouns**
  (`wechat`, `figma`) — do not localize names.
- **English pluralization is automatic** (s/x/z/ch/sh→es, consonant+y→ies, else +s).
  Structural skips (≤2 chars, digits, multi-word, non-ASCII, trailing-s) are code, not
  table; `NON_PLURALIZABLE_ALIASES` lists only words whose plural is unnatural or
  changes meaning (`codes`, `securities`, `works`) — **never add trailing-s words to the
  table** (dead entries; the structural rule returns first).
- **Match needle semantics** (app-catalog-matching.ts): single Latin token = token
  EQUALITY (not substring); multi-token = consecutive run within one identity field;
  CJK = Han-run containment. A bare generic token (`mail`) matches every app whose name
  yields that standalone token — prefer bundleId needles (`com.apple.mail`) for
  proper-noun aliases plus a basename needle (`mail.app`) carrying category words only.
- **Version bump ≠ instant refresh**: bumping `APP_SEMANTIC_ALIAS_CATALOG_VERSION`
  makes the sync maintenance task log + write the new version; stored keywords refresh
  on the NEXT runtime scan (app-provider `resolveScannedAppSemanticAliases` path).
  New vocabulary is searchable after that scan, not at version write-back.
- **Zero-runtime-dep section**: vocabulary + `compileAliasGroup` + expansion rules may
  reference only pure helpers (`normalizeStringList`) and type-only imports, so a future
  lift into `@talex-touch/utils` is mechanical. Gotcha for that lift:
  `normalizeStringList` lives in `app-utils.ts`, which imports chalk at module scope —
  move or split the function first. Matcher stays behind (couples to app identity).

### 4. Validation & error matrix

| Condition | Outcome |
|---|---|
| word placed in wrong locale array | wrong derivation rule applied (e.g. `+s` on CJK never fires, but zh words in `en` would get pluralized) |
| trailing-s word added to NON_PLURALIZABLE | dead entry, contradicts table doc |
| bare generic single-token needle | category words leak onto unrelated apps |
| restructuring groups without set-diff check | silent vocabulary loss |

### 5. Tests required

`app-semantic-catalog.test.ts` anchors: rule unit tests on `expandEnglishPlural`
(es/ies/+s + skips), end-to-end plural resolution per category, dedupe against
hand-written plurals, EMAIL/DOWNLOAD hits with negative controls (Mailchimp/Spark AR
must resolve empty), version pin. **When restructuring groups, verify zero word loss
mechanically**: extract old arrays from `git show HEAD:<path>`, assert old-set ⊆
compiled-new-set per group (the 2026-08-06 check ran this at source level AND through
the live resolver).
