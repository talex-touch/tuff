# Runtime verification — Nexus docs true SSG

Browser-level acceptance for the prerendered-doc-body task, run against a locally served
**production build** of `apps/nexus`. Nothing here builds, and nothing here writes into
`apps/nexus`.

| Check | Acceptance criterion |
|---|---|
| C1 | initial load issues **zero** `/api/docs/page` requests |
| C2 | the served HTML already contains the rendered body |
| C3 | hydration keeps that body, with no Vue hydration warnings |
| C4 | SPA navigation still lazy-loads the body over `/api/docs/page` |
| C5 | a blocked body fetch shows an error state with a working retry |

## Files

- `cdp-harness.mjs` — Chrome launch, pre-navigation CDP attach, request/console capture,
  PASS/FAIL reporter. The wire protocol client is **imported from
  `apps/nexus/scripts/audit-cdp-client.mjs`**, not reimplemented.
- `verify-docs-ssg.mjs` — the five checks. This is what you run.
- `self-test.mjs` — proves the harness discriminates before you trust a real result.

No dependencies beyond Node (v24 here) and a local Chrome. Chrome is found automatically;
override with `CHROME_PATH`.

## Run it, in order

```bash
cd /Users/talexdreamsoul/Workspace/Projects/talex-touch/.trellis/tasks/08-27-nexus-docs-body-ssg/verify

# 1. Prove the harness works (~3 min, no nexus server needed, safe during a build).
node self-test.mjs

# 2. Serve the built output — in a separate shell, from the REPO ROOT.
#    Picks up pages_build_output_dir=apps/nexus/dist and the nodejs_compat flags
#    from the root wrangler.toml, and persists local D1 to <repo root>/.wrangler/state.
./apps/nexus/node_modules/.bin/wrangler pages dev --port 8788 \
  --d1 DB --kv TUFF_INTELLIGENCE_RUNTIME --r2 R2 \
  --binding NEXUS_LOCAL_PAGES_PREVIEW=true \
  --binding AUTH_ORIGIN=http://127.0.0.1:8788 \
  --binding AUTH_SECRET=tuff-local-pages-preview-secret \
  --binding APP_AUTH_JWT_SECRET=tuff-local-app-auth-jwt-secret \
  --binding NUXT_INTELLIGENCE_ENCRYPT_KEY=tuff-local-intelligence-encrypt-key

# 3. Run the checks.
node verify-docs-ssg.mjs --base-url=http://127.0.0.1:8788
```

Exit codes: `0` all green, `1` a check failed, `3` only not-yet-implemented checks are
outstanding (C5 today).

### Which serve command, and why not the others

`apps/nexus/dist/nitro.json` declares `commands.preview = "npx wrangler pages dev ."`, and
`nuxt preview` runs that with cwd set to `dist` — so **`pnpm -C apps/nexus preview` does
not rebuild** and is a valid alternative. Two caveats: it listens on wrangler's default
port **8788, not 3000**, and it passes no bindings, so `/api/docs/page` cannot be served
and C4/C5 cannot run. The repo-root invocation above is preferred because it picks up the
root `wrangler.toml` and persists to the repo-root `.wrangler/state`, which is where this
project's local D1 lives (`apps/nexus/.wrangler` is a second, stale state dir; do not point
at it).

Note that `wrangler pages dev` in v4.107.1 has **no `--env` flag** — the `[env.preview]`
D1/KV/R2 bindings in `wrangler.toml` are therefore not picked up, which is why they are
passed explicitly as `--d1 DB --kv … --r2 …`. Those create empty local resources on first
run; `@nuxt/content` seeds the docs tables from `dist/dump.docs.sql` on the first query, so
an empty local D1 is fine. The `wrangler` bin shim under `apps/nexus/node_modules/.bin` is
verified working (4.107.1) — prefer it over `npx`, which resolves unreliably in this
checkout.

**Do not use `pnpm -C apps/nexus preview:cf` — it runs `pnpm build` first.**

C1/C2/C3 only need static files, so they also work against any plain static server rooted
at `apps/nexus/dist` that maps `/en/docs/x/` to `x/index.html`. C4 and C5 need the worker.
`verify-docs-ssg.mjs` probes `/api/docs/page` up front and prints `C0.body-api` so you know
which situation you are in before reading the rest.

### Useful flags

```
--doc-path=/zh/docs/guide/start/   the doc to load first (default /en/docs/dev/components/button/)
--target-path=/en/docs/guide/start/   SPA-nav destination (default: discovered from the page's own links)
--only=C1,C2                       run a subset
--settle-ms=8000                   quiet window before asserting "no request" (default 5000)
--error-wait-ms=20000              how long C5 waits for an error state (default 12000)
--port=9333                        chrome remote debugging port
```

Env equivalents: `NEXUS_VERIFY_URL`, `NEXUS_VERIFY_DOC`, `NEXUS_VERIFY_TARGET_DOC`,
`NEXUS_VERIFY_SETTLE_MS`, `NEXUS_VERIFY_ERROR_WAIT_MS`, `NEXUS_VERIFY_CDP_PORT`.

The default doc is `/en/docs/dev/components/button/` because it is demo-heavy, which is
where the design flags hydration-mismatch risk. Re-run with `--doc-path=/en/docs/guide/start/`
and a couple of `/zh/` routes for the spot-check the PRD asks for.

## Positive controls

Every check has one, because the dangerous failure here is a harness that observes nothing
and calls it a pass. Each control is reported as its own line, so a broken harness goes red
instead of quiet.

| Check | Control |
|---|---|
| C1 | `C1.capture-live`: the capture recorded a non-zero number of requests at all. Then `C1.control`: the page is made to `fetch()` `/api/docs/page` on purpose (tagged `__harness_control`, excluded from the assertion) and the **same capture with the same matcher** must record it. If it does not, C1's pass is declared void. |
| C2 | `C2.control`: the same `<h2>` counter is run over the same HTML with every `<h2>` stripped and must return `0`. A counter that cannot report absence cannot report presence. The DOM half is read with **JavaScript disabled** (`Emulation.setScriptExecutionDisabled`), so it cannot be satisfied by client rendering, and the two independent methods are cross-checked. |
| C3 | `C3.control`: a synthetic `console.warn('[Vue warn]: …')` is injected and must be captured — otherwise "no hydration warnings" just means the console listener is dead. |
| C4 | `C4.spa-nav`: a `window` sentinel set before the click must survive, proving a client-side route change rather than a document reload. `C4.control`: the rendered headings must **differ** from the previous doc, so a stale DOM cannot pass as a freshly fetched body. C1 having shown zero such requests in the same session is what makes the request that appears here meaningful. |
| C5 | `C5.control`: a `Network.loadingFailed` event for `/api/docs/page` must be observed, proving the block took effect. Without it the check reports failure rather than judging whatever the page happens to show. |

`self-test.mjs` is the control for the harness as a whole: it serves a synthetic docs-shaped
site twice — once with the body in the HTML, once as a shell that fetches its body on load —
and asserts the opposite verdicts, with all controls green in both runs. Verified
2026-08-27: `ssg` → 18 pass / 0 fail, `shell` → C1.no-body-fetch, C2.raw-html, C2.no-js-dom,
C2.no-skeleton and C3.body-survived all red. The shell run is what found the raw-HTML
counter miscounting `<h2` inside inline `<script>` bodies — relevant because nexus builds
with `payloadExtraction: false`, so the doc record is inlined in `__NUXT_DATA__`; the
counter now strips script and style content first.

## Two things to know before reading a result

**C3's console assertion is weak on a production build.** Vue strips hydration warnings in
production unless the build sets `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__`, so a clean
console is close to guaranteed and proves little. The load-bearing assertion is
`C3.body-survived`: the `<h2>` sequence read with JS disabled must equal the sequence after
hydration. That catches the regression the design actually fears — a payload-key mismatch
discarding the SSR body into a skeleton — and it works in production. If you want real Vue
warnings, that requires a temporary `vite.define` in `apps/nexus/nuxt.config.ts`, which is
out of scope here.

**C5 is expected to report `PEND` until R4 lands.** `app/pages/docs/[...slug].vue` has no
`fullDocError` state and no retry control today (grep confirms), so the check reports
"no error state and no retry affordance — the page is stuck on the body skeleton" and the
run exits `3`. That is the correct reading of an unimplemented requirement, not a harness
crash. Once a retry affordance exists, C5 finds it by text (`retry` / `try again` /
`reload` / `重试` / `重新加载` / `再试一次`), `aria-label`, or a `data-testid` containing
`retry`; if it is labelled some other way, add the selector to `ERROR_PROBE` and the retry
click in `checkFailurePath`.
