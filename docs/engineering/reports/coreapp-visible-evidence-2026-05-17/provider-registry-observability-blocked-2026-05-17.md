# Provider Registry Observability Blocker Evidence

> Date: 2026-05-17
> Scope: Nexus Provider Registry Admin visible evidence attempt
> Result: blocked, not passed

## Boundary

This artifact is negative evidence only. It does not prove Provider Registry
observability because no real admin session, real Provider Registry data, or
stable Nexus Admin browser capture was available in this run.

The Provider Registry Admin surface must stay blocked until a real Dashboard
Admin session or a real local-binding API run can show provider health, usage
ledger entries, scene run state, attention filters, and degraded/unknown
next-action hints.

## Source Preconditions

- `apps/nexus/app/pages/dashboard/admin/provider-registry.vue` renders
  `LazyDashboardProviderRegistryProviderRegistryAdminPanel` inside `ClientOnly`.
- `apps/nexus/app/composables/useProviderRegistryAdmin.ts` redirects away when
  `useAuthUser().user.role !== 'admin'`.
- Provider Registry API routes call `requireAdmin(event)` before reading or
  mutating registry data.
- `server/utils/auth.ts` requires an active admin user for `requireAdmin`.

These are correct product constraints, but they mean a browser capture without
a real admin session cannot be counted as Provider Registry observability.

## Local Capture Attempts

Attempt 1:

```bash
pnpm -C "apps/nexus" run dev:pure
```

Observed result:

- Nuxt attempted to use `http://localhost:3200/`.
- Port fallback also printed `http://localhost:3001/`, but that port was already
  occupied by an existing Next.js service.
- The Nexus dev process repeatedly emitted `EMFILE: too many open files, watch`
  and restarted.
- `curl -I "http://localhost:3001/dashboard/admin/provider-registry"` returned a
  Next.js `404`, so that port could not be used as Nexus evidence.

Attempt 2:

```bash
env CHOKIDAR_USEPOLLING=true NUXT_DISABLE_SENTRY=true pnpm -C "apps/nexus" exec nuxt dev --port 3217 --host 127.0.0.1
```

Observed result:

- Nuxt started on `http://127.0.0.1:3217/`.
- The process still exited with `EMFILE: too many open files, watch` after the
  Nitro server warmed up.
- No stable browser screenshot or DOM capture was produced.

Playwright CLI wrapper prerequisite was also blocked by local npm cache
permissions:

```text
npm error code EPERM
npm error path /Users/talexdreamsoul/.npm/_cacache/tmp/e35ef055
npm error Your cache folder contains root-owned files
```

The available browser automation route was therefore not useful without a
stable Nexus dev server.

## Decision

Keep `provider-registry-observability` blocked.

Do not mark any required observability evidence as checked:

- Provider health and latest usage summaries were not captured.
- Scene latest run and recent failure summaries were not captured.
- Attention/healthy/degraded/unhealthy/unknown filters were not captured with
  real data.
- Next-action hints for degraded or unknown state were not captured.

## Required Follow-Up

Use one of these paths before marking the surface passed:

1. Run Nexus with stable local bindings and a real admin session, then capture
   `/dashboard/admin/provider-registry` in a real browser.
2. Use a deployed or preview Dashboard Admin session with real registry data,
   then capture health, usage, scene run state, filters, and next-action hints.
3. If running locally, first resolve the Nuxt dev watcher `EMFILE` failure and
   avoid ports already owned by non-Nexus services.
