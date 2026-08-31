# Nexus docs page: skeleton loading state

## Background

`apps/nexus/app/pages/docs/[...slug].vue` renders a centered spinner + "正在获取文档…"
while `viewState === 'loading'`. Per the project-wide loading-state rule (skeleton is the
default, mirroring the loaded layout — see Hard Frontend Rules), this must become a
skeleton screen.

## Requirements

1. Replace the spinner block with a skeleton that mirrors the real doc layout: breadcrumb
   line → hero title → description lines → meta chip row → two prose sections (heading +
   paragraph lines + a block placeholder). Nothing may shift when content arrives, so the
   skeleton wrapper reuses the `docs-surface` column rhythm.
2. Compose from `TxSkeleton` (auto-resolved in nexus, shimmer owned by tuffex) — no
   hand-rolled shimmer/`@keyframes`. Delete the now-dead spinner CSS and its keyframes.
3. Accessibility: keep `role="status" aria-live="polite"` with the existing
   `t('docs.loading')` string visually hidden; skeleton bars stay `aria-hidden`.
4. No new i18n keys. Light and dark themes both correct (TxSkeleton owns its surface).

## Acceptance criteria

- [ ] Loading a doc route shows the skeleton (verified via CDP with the page-body request
      held), light + dark screenshots; no spinner remains in code.
- [ ] `docs.loading` message still announced for screen readers.
- [ ] nexus typecheck + eslint pass.

## Out of scope

- Other loading states on the docs page (outline, engagement panels, sidebar).
- The not-found / error states.
