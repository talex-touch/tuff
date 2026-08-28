# Admin regression guards

Seven classes of bug reached production in the nexus admin console, and all seven
shared a property: **the failure was silent**. A component that does not resolve
renders nothing. A button with the wrong native type does nothing on click but
still submits on Enter. A missing translation key renders its fallback. None of
them threw, and none of them failed a test — so they were only found by a human
opening the page and noticing that something was not there.

Each guard here turns one of those classes into something that fails in CI.

## Running

```bash
cd apps/nexus
node test/guards/run-guards.mjs          # all seven, with an inventory header
node test/guards/run-guards.mjs --list   # inventory only
npx vitest run test/guards               # equivalent, no header
```

They are ordinary vitest files matched by the existing `test/**/*.test.ts`
include, so `npx vitest run` picks them up with everything else.

## The guards

| File | Asserts |
| --- | --- |
| `component-auto-import.test.ts` | A component in a nested `app/components/` directory is never used under its bare file name. Nuxt registers `dashboard/admin/AccountTabs.vue` as `DashboardAdminAccountTabs`; `<AccountTabs />` resolves to nothing. |
| `form-submit-button.test.ts` | A `TxButton`/`TxIconButton` inside `<form @submit>` declares `native-type` or `@click`. Both default `nativeType` to `'button'`, so otherwise the button is inert on click. |
| `feature-flag-coercion.test.ts` | Boolean runtime config is read through `isFeatureFlagEnabled`. Nitro's env override turns `NUXT_PUBLIC_X=1` into the number `1`, which `=== true` rejects. Also unit-tests the helper's truth table and pins `nuxt.config.ts`'s build-time copy to it. |
| `page-toplevel-throw.test.ts` | No page throws unconditionally at `<script setup>` top level. On client navigation that rejects the suspended setup and paints nothing. Conditional throws (the idiomatic Nuxt 404) are deliberately allowed. |
| `i18n-key-existence.test.ts` | Every literal `t('…')` key exists in both locales, and an inline fallback is not wildly unlike the message its key holds. |
| `admin-route-reachability.test.ts` | Every `app/pages/dashboard/admin/*.vue` is linked from somewhere, forwards elsewhere, or is a recorded orphan. |
| `sfc-size-budget.test.ts` | An SFC over 3000 lines keeps its `<style>` in a sibling file, and no SFC passes 4500 lines. |

## Rules for adding or changing a guard

**Every guard carries a positive control.** A scan that silently matches nothing
reports a clean repo, which is indistinguishable from a healthy one. Each guard
therefore proves it fails on the code that shipped the bug, using a byte-exact
copy in `fixtures/` rather than `git show HEAD:…` — the moment the fixes land,
`HEAD` stops containing the bug and a `HEAD`-based control proves nothing.

Controls have caught these guards being wrong four times now:

- The component-name derivation had no idea `@nuxt/content` registers
  `app/components/content/` without a path prefix. Caught by cross-checking every
  derived name against `.nuxt/components.d.ts`.
- The i18n loader was missing the two lazily-merged route chunks, which made 1301
  healthy call sites look broken. Caught by probing one key per message source.
- **The i18n key pattern was anchored on `t(` and could not see a local alias.**
  `governance.vue` declares `const tt = (key, fallback) => te(key) ? t(key) : fallback`
  and calls it 359 times; in `tt(`, the character before the matching `t` is
  another `t`, so the `(?<![\w$.])` lookbehind rejected every one. 332 keys — the
  largest i18n hole in the repo, and none of them defined in either locale — were
  invisible to this guard *and* to `i18n-cjk-fallback-coverage.test.ts`, which is
  anchored the same way. The guard reported the governance console clean.
  `findTranslationAliases` now detects proxies whose first parameter is handed
  straight to `t`/`te`, and the control states it as before/after: the old pattern
  must find zero of these keys and the new one must find them all.
- **The inert-region mask applied JavaScript string rules to a whole `.vue` file.**
  In a template, `:text="t('a.b', 'x')"` is an expression wrapped in the
  attribute's own double quotes, so blanking "string bodies" erased it: 257 calls
  across the admin surface were dropped as if they were commented out.
  `maskInertRegions` now masks per block — JavaScript rules in `<script>`, HTML
  comments in `<template>`, `<style>` blanked outright.

Two of those four were scans that reported a *clean* result, which is the failure
mode worth fearing: a broken guard and a healthy repo look identical.

**Every guard carries a negative control too.** Assert that the shipped *fix*
clears the rule, so "flags the bug" cannot pass because the scanner flags
everything.

**Pre-existing violations are waived explicitly, never by lowering the bar.**
`KNOWN_UNFIXED` / `KNOWN_WRONG_KEYS` / `KNOWN_ORPHANS` list each one with the
user-visible consequence, and a companion `no waiver has gone stale` test fails
when an entry stops matching. A waiver cannot outlive the problem it describes,
and the guard still fails on anything new.

Where a single defect spans hundreds of call sites, waive it as one block with a
ceiling rather than as hundreds of entries — see
`GOVERNANCE_PENDING_TRANSLATION`, which records 332 untranslated
`dashboard.governance.*` keys, names the owners, and fails if the number grows.

**Thresholds come from the repo's own distribution.** The 3000-line style limit
and the 0.20 fallback-similarity cutoff both sit in a measured empty band between
the healthy population and the known failure, and each says so where it is
defined.
