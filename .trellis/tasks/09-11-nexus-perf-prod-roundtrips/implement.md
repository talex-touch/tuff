# Implement — Nexus prod: cut serial round trips and make docs assets cacheable

Work in `apps/nexus/`. Run commands from that directory unless noted. One commit per numbered step.

## 0. Baseline capture

- [ ] `pnpm run build` is NOT run first (25 min); use the existing `dist/` from 2026-09-09 only for layout comparison. Baseline numbers are in the parent `prd.md`.

## 1. R1 — `.html` prerender layout

- [ ] `nuxt.config.ts`: add `autoSubfolderIndex: false` to `nitro.prerender` (both the disabled and enabled branches) with a comment naming the 308.
- [ ] `build/materialize-docs-index-aliases.mjs`: alias `<dir>/index.html` → `<dir>.html` (`en/docs/index.html` → `en/docs.html`); keep the throw-on-missing behaviour; update `materialize-docs-index-aliases.test.ts` fixtures.
- [ ] `build/check-worker-bundle.mjs`: `routeToDistPath` → `<route>.html`; `landingInitialHtmlFiles` → `.html` names; update `check-worker-bundle.test.ts` if it pins those strings.
- [ ] `pnpm exec vitest run build/materialize-docs-index-aliases.test.ts build/check-worker-bundle.test.ts build/docs-prerender-routes.test.ts`

## 2. R2 — i18n preload

- [ ] `nuxt.config.ts` `i18n.experimental = { preload: true, stripMessagesPayload: true }`.
- [ ] `app/pages/docs/docs-page-performance.test.ts`: extend the "lets Nuxt i18n lazy load locale messages" test to require the preload block.
- [ ] Dev smoke: `pnpm dev:pure`, open `/en/docs/dev/components/button`, confirm `<script type="application/json" data-nuxt-i18n>` in the HTML and no `/_i18n/` request before hydration; check console for `[intlify] Not found` warnings on docs + landing + dashboard sign-in shell.

## 3. R3 — navigation dedupe

- [ ] `app/pages/docs/[...slug].vue` and `app/components/DocsSidebar.vue`: add `dedupe: 'defer'` to the navigation `useTypedFetch` options.
- [ ] `app/utils/request.ts`: make sure `TypedFetchOptions` allows `dedupe`.
- [ ] Extend `docs-page-performance.test.ts` "requests prerenderable locale and scope-specific docs navigation" to match `dedupe: 'defer'` in both files.

## 4. R4 — session hint

- [ ] `shared/utils/session-hint.ts`: `SESSION_HINT_COOKIE`, `readSessionHint(cookieHeader | document.cookie)`.
- [ ] `server/api/auth/[...].ts`: `syncSessionHintCookie(event, response)` invoked from `normalizeAuthResponseResult` for `Response` results and from the `clearAuthCookies` path; unit test in `test/api/auth/session-hint.test.ts` (pure function over `set-cookie` header lists).
- [ ] `app/composables/useNexusAuth.ts`: export `hasSessionHint()`; `app.vue` `onMounted`: skip `getSession()` on public routes without a hint (`data.value = null`).
- [ ] `app/composables/useNexusAuth.test.ts`: add the two cases (no hint → no fetch, `unauthenticated`; hint → fetch once, `authenticated`).
- [ ] `docs-page-performance.test.ts` still expects `const { status, getSession } = useNexusAuth()` in `app.vue` — keep that line.

## 5. R5 — edge cache headers

- [ ] `nuxt.config.ts` `routeRules`: add the docs HTML, docs JSON, `/_i18n/**` header rules (constants in `build/nexus-static-routes.mjs` so the guard and the config share one list).
- [ ] `build/check-worker-bundle.mjs`: `checkStaticHeaders()` reads `dist/_headers`, asserts each pattern has `cache-control` with `s-maxage`; wire into the report; add a test in `check-worker-bundle.test.ts` against a fixture `_headers`.

## 6. R6 — demo chain

- [ ] `app/components/content/TuffDemoWrapper.vue`: module-scope `loadDemoRegistry()` (dynamic `import('./demo-registry')`), started in `activateDemo()`; pass `:registry-promise` to `LazyTuffDemoClientRenderer`.
- [ ] `TuffDemoClientRenderer.client.vue`: accept `registryPromise` prop; fall back to its own import when absent.
- [ ] `demo-client-boundary.test.ts`: change the SSR-boundary assertion to forbid a static import (`^import .*demo-registry`) while allowing the dynamic one; keep `TuffDemoClientRenderer` dynamic-import assertion.

## 7. R7 — entry gate components

- [ ] `app/app.vue`: `TxEmptyState` in the two auth gates → `LazyTxEmptyState`.
- [ ] `docs-page-performance.test.ts` / `useNexusAuth.test.ts`: nothing pins `TxEmptyState`; verify with grep.

## 8. Verification (full-scope 2.2)

- [ ] `pnpm run test`
- [ ] `pnpm run typecheck`
- [ ] `pnpm -C apps/nexus run lint` (or `pnpm lint:changed` from root)
- [ ] `pnpm run build` (≈25 min; run in background) then `pnpm run check:api-routes && pnpm run build:analyze-worker && node build/check-demo-registry-orphans.mjs`
- [ ] Layout evidence: `ls dist/en/docs/dev/components/button.html`, `dist/en/docs/dev.html`, `_routes.json` still excludes `/en/docs/*`, `_headers` has the new rules.
- [ ] Browser evidence (`pnpm preview` or `wrangler pages dev dist`): one navigation request, zero `/api/auth/session`, no `/_i18n` before hydration, registry request overlapping the renderer chunk request.
- [ ] Record before/after in `research/results.md`.

## Rollback points

Each step is its own commit; `git revert <sha>` restores that requirement only. R1 and R5 together define the static layout; revert both if Pages serves 404s for docs after deploy.
