# After the cleanup (2026-10-02)

Same worktree, same local D1, same fixture data and same probe as `before.md`; the dev server was restarted with
the identical `/tmp/aiclean/start-dev.sh` environment after every edit (including the lockfile update) was in place.

## API parity

All **18 / 18** retained-endpoint probes are identical to the baseline after normalisation (status code, content
type, response shape, error code and the masked body, SSE event sequence included). The 10 probes of deleted routes
went from 200/400/410 JSON to 404 — the same generic Nuxt "Page not found" response any never-existing `/api` path
returns (`/api/definitely-not-a-route` answers identically).

| Probe | Request | Before | After | Error code / body | Normalised body identical |
|---|---|---|---|---|---|
| v1.invoke text.chat | POST `/api/v1/intelligence/invoke` | 502 | 502 | `NETWORK_FAILURE` | yes |
| v1.invoke missing capabilityId | POST `/api/v1/intelligence/invoke` | 400 | 400 | `INVALID_REQUEST` | yes |
| v1.invoke unscened capability | POST `/api/v1/intelligence/invoke` | 409 | 409 | `UNKNOWN` | yes |
| v1.invoke anonymous | POST `/api/v1/intelligence/invoke` | 401 | 401 | `NEXUS_AUTH_REQUIRED` | yes |
| v1.stream text.chat | POST `/api/v1/intelligence/stream` | 200 | 200 | SSE error(UNKNOWN) | yes |
| v1.stream non-chat capability | POST `/api/v1/intelligence/stream` | 200 | 200 | SSE error(INVALID_REQUEST) | yes |
| v1.stream missing capabilityId | POST `/api/v1/intelligence/stream` | 400 | 400 | body.error=true | yes |
| credits.models | GET `/api/credits/models` | 200 | 200 | — | yes |
| credits.models anonymous | GET `/api/credits/models` | 401 | 401 | body.error=true | yes |
| docs.assistant json | POST `/api/docs/assistant` | 200 | 200 | body.error="fetch failed" | yes |
| docs.assistant stream | POST `/api/docs/assistant` | 200 | 200 | SSE meta → status → status → error → done | yes |
| docs.assistant no messages | POST `/api/docs/assistant` | 200 | 200 | body.error="Messages are required." | yes |
| provider-registry.check | POST `/api/dashboard/provider-registry/providers/<provider>/check` | 200 | 200 | `PROVIDER_TIMEOUT` | yes |
| provider-registry.check unknown id | POST `/api/dashboard/provider-registry/providers/prv_missing/check` | 404 | 404 | body.error=true | yes |
| provider-registry.providers | GET `/api/dashboard/provider-registry/providers` | 200 | 200 | — | yes |
| admin.analytics summary | GET `/api/admin/analytics?days=30` | 200 | 200 | — | yes |
| dashboard.intelligence.audits | GET `/api/dashboard/intelligence/audits` | 200 | 200 | — | yes |
| dashboard.intelligence.ip-bans | GET `/api/dashboard/intelligence/ip-bans` | 404 | 404 | `NEXUS_FEATURE_DISABLED` | yes |

| Retired route | Request | Before | After |
|---|---|---|---|
| retired agent prompts | GET `/api/admin/intelligence-agent/prompts` | 200 json | 404 text/html (generic Nuxt 404 page) |
| retired agent prompt-bindings | GET `/api/admin/intelligence-agent/prompt-bindings` | 200 json | 404 text/html (generic Nuxt 404 page) |
| retired agent providers | GET `/api/admin/intelligence-agent/providers` | 200 json | 404 text/html (generic Nuxt 404 page) |
| retired agent session history | GET `/api/admin/intelligence-agent/session/history` | 200 json | 404 text/html (generic Nuxt 404 page) |
| retired agent session trace | GET `/api/admin/intelligence-agent/session/trace` | 400 json (sessionId is required) | 404 text/html (generic Nuxt 404 page) |
| retired agent orchestrator plan (410 stub) | POST `/api/admin/intelligence-agent/orchestrator/plan` | 410 json (Deprecated orchestrator endpoint. Use /api/admin/intelligenc) | 404 text/html (generic Nuxt 404 page) |
| retired lab session stream (410 stub) | POST `/api/admin/intelligence-lab/session/stream` | 410 json (Deprecated intelligence-lab endpoint. Use /api/admin/intelli) | 404 text/html (generic Nuxt 404 page) |
| retired lab providers (410 stub, anonymous) | GET `/api/admin/intelligence-lab/providers` | 410 json (Deprecated intelligence-lab endpoint. Use /api/admin/intelli) | 404 text/html (generic Nuxt 404 page) |
| retired chat probe (empty body) | POST `/api/admin/intelligence/chat` | 400 json (message is required) | 404 text/html (generic Nuxt 404 page) |
| retired analytics intelligence panel API | GET `/api/admin/analytics/intelligence?days=30` | 200 json | 404 text/html (generic Nuxt 404 page) |

`/admin/analytics`, `/admin/analytics?section=intelligence` and `/admin/analytics?section=docs` SSR-render 200 (the
session-checking shell; panels mount client-side). The fold of `?section=intelligence` into overview is asserted in
`analytics-page-performance.test.ts` (and fails when `intelligence` is put back into `ANALYTICS_SECTIONS`). Browser
verification of the six panels is left to the main session.

## Reachability of `server/utils/tuffIntelligenceLabService.ts`

`reachability-script.mjs` (same edge rule as the research: any identifier equal to a top-level name is an edge, so the
live set is over-estimated), roots = the 6 surviving entry points:

| | Top-level declarations | Live (lines) | Unreachable (lines) | Dead imports |
|---|---|---|---|---|
| Before (`lab-service-reachability-before.txt`) | 131 | 73 (1,885) | 58 (2,900) | 23 |
| After (`lab-service-reachability-after.txt`) | 73 | 73 (1,885) | **0** | **0** |

File: 5,059 → 2,079 lines; the live-declaration line count is unchanged, i.e. nothing reachable was removed.
A precise check (TypeScript `noUnusedLocals` over the server tsconfig, positive control: a planted unused import and
function are both reported) finds 0 unused locals/imports in the trimmed `tuffIntelligenceLabService.ts` and
`intelligenceStore.ts`.

## Guards (negative controls, `guard-negative-controls.log`)

| Guard test | Injected into its frozen sample | Result | Restored |
|---|---|---|---|
| form-submit-button › accepts a button once native-type="submit" is added | removed `native-type="submit"` | 1 failed | 5/5 pass |
| page-toplevel-throw › clears the shipped route-meta redirect rewrite | top-level `throw createError({ statusCode: 410 })` | 1 failed | 5/5 pass |
| admin-route-reachability › recognises the shipped intelligence-lab redirect | replaced `redirect:` with `layout:` | 1 failed | 8/8 pass |
| both lab-fixture controls | fixture file moved away | 2 failed (ENOENT) | 18/18 pass |

The frozen samples are byte-exact (`git hash-object` = `d7fa8d8b…`, `7b46607c…`, the `5e6579e05^` blobs).

## Gates

- Nexus `./node_modules/.bin/vitest run`: **248 files / 1873 tests passed** (before: 255 / 1902; −7 deleted files /
  −22 tests, −6 dead-code policy cases, −1 net in the analytics test: two `intelligence` rows removed, one legacy-fold
  row added).
- Nexus typecheck (`build/check-typecheck-plugin-resolution.mjs`, which runs `nuxt typecheck`): exit 0, 0 errors.
  Positive control in the same run setup: planted errors in `app/utils/` and `server/utils/` were both reported (exit 2).
- `build/check-server-api-route-tree.mjs` ✔; `build/check-mdc-fences.mjs` ✔ (positive control: an unclosed fence fails);
  `build/check-doc-translation-parity.mjs` ✔; `check-icon-collections`, `check-demo-registry-orphans` ✔.
- Root gates: `scripts/check.mjs doc-metadata | orphan-tests | audit-report-claims` ✔; `scripts/docs/run-docs-verify.mjs` ✔.
- ESLint (`--max-warnings=0`, per workspace config) on every changed code file: 0 problems (positive control: `var` +
  `debugger` probe reports 2 errors).
- `git diff --check` ✔.
- `mise run intelligence:verify` equivalent, run step by step without the pnpm wrapper: diff-check on the gate paths ✔,
  tuff-intelligence resolver test 4/4 ✔, tuff-intelligence `tsc --noEmit` ✔, the 7 Nexus gate tests 115/115 ✔,
  `parity` ✔. The 3 core-app tests could not run: core-app dependencies are not installed in this worktree
  (`vitest.config.ts` fails with `MODULE_NOT_FOUND`); no file under `apps/core-app` is changed by this task.

## Lockfile

`pnpm install --filter @talex-touch/tuff-nexus --prefer-offline` (worktree only, 9 s, nothing downloaded):
`packages` 2853 → 2853, `snapshots` 2868 → 2868, no key added or removed. The only change is the two entries leaving
`importers['apps/nexus']` (66 → 64 deps): `@langchain/langgraph` is still required by `apps/core-app` and
`packages/tuff-intelligence` (same resolved snapshots), and `@talex-touch/intelligence-uikit` was a workspace link.
So neither dependency had Nexus-exclusive transitive packages.

## Residual scan (PRD acceptance command)

`rg -n "intelligence-agent|intelligence-lab|intelligence/chat|tuffIntelligenceRuntimeStore|intelligenceAgentGraphRunner|IntelligenceLabTools" apps/nexus --glob '!**/node_modules/**' --glob '!**/.nuxt/**'`

- Kept by verdict: guard fixtures (4 files, incl. the two new frozen fixes), guard tests/helper that load them
  (`admin-route-reachability`, `page-toplevel-throw`, `helpers/fixtures.ts`), AdminNav tombstones
  (`AdminNav.routing.test.ts`, 4), playbook link (`DocsSidebar.vue:477`, X2).
- Not anticipated by the research: `server/utils/tuffIntelligenceLabService.ts` ×6 — `source: payload.source || "intelligence-agent"`
  defaults inside the live `invokeModel` / `invokeModelStream`. All three remaining callers always pass a non-empty
  source (`audit.source`, which defaults to `"core-app"`, and `"intelligence-provider-probe"`), so the fallback is
  unreachable today; it was left untouched because it is a label inside live code, not code that only served the
  retired pages. Decision for the main session.
- Positive control: the same command finds the AdminNav tombstones.
