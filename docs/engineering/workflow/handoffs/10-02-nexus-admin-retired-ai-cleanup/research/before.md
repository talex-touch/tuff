# Baseline before the cleanup (2026-10-02)

Recorded in the dedicated worktree `/Users/talexdreamsoul/Workspace/Worktrees/talex-touch-ai-cleanup`
(detached `ca6577bbb` = `origin/stage`, the commit the research line numbers refer to) before any edit.

## Environment

- Node `v26.0.0` (mise), pnpm `11.24.0`. The worktree's own install; workspace packages resolve to the worktree.
- `packages/tuffex/dist` built once in the worktree (gulp build, corepack shim → pnpm 11.24.0), needed for typecheck.
- The worktree's `better-sqlite3` binary had been compiled for Node 24 (`NODE_MODULE_VERSION 137`), so `nuxt dev`
  aborted under Node 26. Replaced the worktree copy (link count 1, not store-shared) with the Node-26 build from the
  main checkout; original kept at `/tmp/aiclean/better_sqlite3.node.node24-original`. Untracked `node_modules` only.
- Dev server (worktree only, never :3200): `/tmp/aiclean/start-dev.sh` =
  `NUXT_USE_CLOUDFLARE_DEV=true CLOUDFLARE_DEV_ENVIRONMENT=preview NUXT_TUFFEX_SOURCE=true nuxt dev --port 3201 --host 127.0.0.1`
  plus local-only credentials: `AUTH_SECRET=tuff-dev-secret`, `AUTH_ORIGIN=http://127.0.0.1:3201`,
  `APP_AUTH_JWT_SECRET` / `NUXT_INTELLIGENCE_ENCRYPT_KEY` set to their documented local-only defaults, and a throwaway
  `PROVIDER_REGISTRY_SECURE_STORE_KEY`. Without `AUTH_SECRET` every session read returns 500
  `NEXUS_RUNTIME_CREDENTIAL_INVALID` (the worktree has no `.env.local`).
- Local D1: the worktree's own `.wrangler/state/v3` (fresh).

## Fixture data (worktree D1 only)

- Session: `next-auth/jwt` `encode` with `tuff-dev-secret`, `ui-audit-bot@local.test`; `GET /api/auth/me` created the
  user (email verified), then `auth_users.role='admin'` via sqlite3.
- Provider `aiclean-parity` (`vendor=custom`, `adapterKey=openai-compatible`, model `parity-model`, capability
  `chat.completion`, endpoint `http://127.0.0.1:9/v1` — a closed port, so every upstream call fails deterministically),
  fake API key stored through `POST /api/dashboard/provider-registry/credentials`.
- Scene `nexus.intelligence.chat.completion` bound to that provider (readiness `ready`).

This makes the probes reach the trimmed module's live code (`invokeModel`, `invokeModelStream`,
`listIntelligenceLabProviders`, `resolveIntelligenceProviderRuntimeContexts`, `probeIntelligenceLabProvider`) instead
of stopping at an empty-registry guard.

## Probe

`/tmp/aiclean/probe.mjs` records status, content type, response shape, error code and the body with volatile values
masked (ISO timestamps, UUIDs, trace/session ids, latency numbers, stack). Two consecutive runs
(`/tmp/aiclean/before-1.json`, `before-2.json`) were identical after normalisation, so any after-run difference is
attributable to the change.

| Probe | Request | Status | Kind | Error code | Message / SSE events |
|---|---|---|---|---|---|
| v1.invoke text.chat | POST `/api/v1/intelligence/invoke` | 502 | json | `NETWORK_FAILURE` | Request timeout after 45000ms |
| v1.invoke missing capabilityId | POST `/api/v1/intelligence/invoke` | 400 | json | `INVALID_REQUEST` | capabilityId is required. |
| v1.invoke unscened capability | POST `/api/v1/intelligence/invoke` | 409 | json | `UNKNOWN` | Scene is unavailable. |
| v1.invoke anonymous | POST `/api/v1/intelligence/invoke` | 401 | json | `NEXUS_AUTH_REQUIRED` | Unauthorized |
| v1.stream text.chat | POST `/api/v1/intelligence/stream` | 200 | sse | — | SSE: error(UNKNOWN) |
| v1.stream non-chat capability | POST `/api/v1/intelligence/stream` | 200 | sse | — | SSE: error(INVALID_REQUEST) |
| v1.stream missing capabilityId | POST `/api/v1/intelligence/stream` | 400 | json | — | capabilityId is required. |
| credits.models | GET `/api/credits/models` | 200 | json | — | — |
| credits.models anonymous | GET `/api/credits/models` | 401 | json | — | Unauthorized |
| docs.assistant json | POST `/api/docs/assistant` | 200 | json | — | body.error="fetch failed" |
| docs.assistant stream | POST `/api/docs/assistant` | 200 | sse | — | SSE: meta → status → status → error → done |
| docs.assistant no messages | POST `/api/docs/assistant` | 200 | json | — | body.error="Messages are required." |
| provider-registry.check | POST `/api/dashboard/provider-registry/providers/<provider>/check` | 200 | json | `PROVIDER_TIMEOUT` | body.error={"code":"PROVIDER_TIMEOUT","message":"Request timeout after <n>ms"} |
| provider-registry.check unknown id | POST `/api/dashboard/provider-registry/providers/prv_missing/check` | 404 | json | — | Provider registry entry not found. |
| provider-registry.providers | GET `/api/dashboard/provider-registry/providers` | 200 | json | — | — |
| admin.analytics summary | GET `/api/admin/analytics?days=30` | 200 | json | — | — |
| dashboard.intelligence.audits | GET `/api/dashboard/intelligence/audits` | 200 | json | — | — |
| dashboard.intelligence.ip-bans | GET `/api/dashboard/intelligence/ip-bans` | 404 | json | `NEXUS_FEATURE_DISABLED` | Feature not found. |

| Retired route probe | Request | Status | Kind | Error code | Message |
|---|---|---|---|---|---|
| retired agent prompts | GET `/api/admin/intelligence-agent/prompts` | 200 | json | — | — |
| retired agent prompt-bindings | GET `/api/admin/intelligence-agent/prompt-bindings` | 200 | json | — | — |
| retired agent providers | GET `/api/admin/intelligence-agent/providers` | 200 | json | — | — |
| retired agent session history | GET `/api/admin/intelligence-agent/session/history` | 200 | json | — | — |
| retired agent session trace | GET `/api/admin/intelligence-agent/session/trace` | 400 | json | — | sessionId is required |
| retired agent orchestrator plan (410 stub) | POST `/api/admin/intelligence-agent/orchestrator/plan` | 410 | json | — | Deprecated orchestrator endpoint. Use /api/admin/intelligence-agent/session/stream instead. |
| retired lab session stream (410 stub) | POST `/api/admin/intelligence-lab/session/stream` | 410 | json | — | Deprecated intelligence-lab endpoint. Use /api/admin/intelligence-agent/* instead. |
| retired lab providers (410 stub, anonymous) | GET `/api/admin/intelligence-lab/providers` | 410 | json | — | Deprecated intelligence-lab endpoint. Use /api/admin/intelligence-agent/* instead. |
| retired chat probe (empty body) | POST `/api/admin/intelligence/chat` | 400 | json | — | message is required |
| retired analytics intelligence panel API | GET `/api/admin/analytics/intelligence?days=30` | 200 | json | — | — |

Notes: the upstream failure is a 45 s timeout inside workerd rather than an immediate refusal, so the three provider
probes take ~45–55 s each; `docs.assistant` uses its own fetch and fails fast with `fetch failed`.
`dashboard.intelligence.ip-bans` is behind the risk-control feature gate (disabled locally), hence 404.

## Test and type baselines (this worktree, before any edit)

- `cd apps/nexus && ./node_modules/.bin/vitest run` → **255 files / 1902 tests passed**, exit 0 (14.1 s).
  Files this task deletes contribute 7 files / 22 tests (stream.post 2, trace.get 1, compat-retired 13,
  graph-runner 2, runtime-bridge 2, analytics/intelligence.get 1, runtime-audits 1); the policy test has 8 tests;
  `analytics-page-performance.test.ts` has 28.
- `PATH=./node_modules/.bin:$PATH node build/check-typecheck-plugin-resolution.mjs` (the package `typecheck` script)
  → exit 0, 0 `error TS`.
- Reachability of `server/utils/tuffIntelligenceLabService.ts` (`/tmp/aiclean/reach.mjs`, same rule as the research):
  131 top-level declarations, 73 live (1,885 lines), **58 unreachable (2,900 lines)** — matches the research.
- Lockfile snapshot: `/tmp/aiclean/pnpm-lock.before.yaml`.
