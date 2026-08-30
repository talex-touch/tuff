# Nexus sidebar: aggregate component family docs into expandable entries

## Background

In the components sidebar (`apps/nexus/app/components/DocsSidebar.vue`), same-family docs
render as flat sibling links inside a category — today `Avatar` and `Avatar Variants` sit
next to each other under `Basic`. The user wants such families collapsed into one
aggregate entry that expands on click:

```
Avatar            ← family entry (click = expand, not navigate)
| Basic Avatar    ← the base avatar doc
| Avatar Variants
```

## Requirements

1. **Family mechanism, not a one-off.** A path-keyed family map in `DocsSidebar.vue`
   (head doc path → ordered member paths + optional per-member label override). Adding a
   future family (e.g. Button) must be a one-entry change.
2. **Initial family: Avatar.** Head `/docs/dev/components/avatar`, members `avatar` +
   `avatar-variants`. Family label comes from the head doc's title ("Avatar" /
   "Avatar 头像").
3. **Interaction.** The family row is a toggle (chevron), collapsed by default; clicking
   expands/collapses the member list. It never navigates. Members are ordinary
   `docs-nav-link` items (active state, prefetch handlers, sync badges preserved).
4. **Route awareness.** When the current route is a family member: the family
   auto-expands (default state, manual collapse still possible) and the family row shows
   an active treatment. Scroll-into-view of the active link keeps working.
5. **Labels.** Base member is relabeled "Basic Avatar" (en) / "基础头像" (zh) via new
   `docsSidebar.*` i18n keys in `i18n/locales/{en,zh}.ts`; the variants member keeps its
   doc title. `itemTitle` CJK stripping must keep applying to doc-title-derived labels.
6. **Visual.** Member list indented with a subtle left rail (the "|" in the sketch);
   expand/collapse animated the same way as `DocSection` (grid-template-rows). Dark mode
   parity for all new styles.
7. **No regressions.** Components metadata is a client-only lazy fetch — family
   rendering derives from it, so no SSR/hydration divergence. Other categories, suites,
   the misc canary bucket, and non-component sections stay byte-identical in behavior.

## Acceptance criteria

- [ ] On `/docs/dev/components/*` (en and zh), the `Basic` category shows one `Avatar`
      family entry instead of two flat links; all other entries unchanged.
- [ ] Clicking the family entry toggles the member list ("Basic Avatar" /
      "Avatar Variants"); each member navigates to its doc.
- [ ] Direct navigation to `/docs/dev/components/avatar-variants` renders the family
      expanded with the member link active.
- [ ] Collapsing manually while on a member page works; navigating between suites/routes
      resets to route-driven default.
- [ ] `misc` canary bucket stays empty; no new i18n keys outside `docsSidebar.*`.
- [ ] nexus vue-tsc typecheck and eslint pass; visual check via CDP screenshot (light +
      dark) on the components docs route.

## Out of scope

- Grouping any other family (button/icon etc.) — mechanism only.
- The components hub specimen grid page.
- `SECTION_ORDER` / taxonomy / recategorize-script changes (family grouping is a render-
  time fold, member order already correct there).
