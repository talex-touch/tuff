# Nexus Data Governance Progress Snapshot

> Snapshot date: 2026-05-23
> Scope: Nexus data collection, plugin analytics, upload reliability, Intelligence/adapt uploads, storage governance, notification governance, operations dashboards, and provider quota controls.

## Executive Status

Current verdict: **in progress, not production-complete**. The local implementation has a broad code-backed baseline for the eight Nexus Data Governance areas, and the most recent focused validation covers the newly added search journey funnel, plugin review rating trend, operations daily timeline, and operations command board slices. The remaining blockers are evidence blockers rather than architecture unknowns: stable real browser screenshots/interactions, live notification sends, live local/S3/OSS storage traces, production D1 migration/backfill, and real provider quota fail-closed calls.

| Roll-up | Current state |
| --- | --- |
| Scope breadth | 8/8 target areas have code or admin/API surface in the current worktree. |
| Local evidence | Search journey, provider quota drill-down, plugin review trend, upload retry/reason buckets, storage pressure, notification profiles, operations summary, operations daily timeline, and operations command board all have focused test or contract-test coverage recorded in this snapshot. |
| Production evidence | Not complete. No stable live browser pass, live send pass, live object-storage pass, production D1 backfill, or real provider quota call evidence has been attached yet. The 2026-05-24 local browser attempt was blocked by Nuxt watcher `EMFILE: too many open files, watch`, so it is recorded as a validation gap rather than completion evidence. |
| Release readiness | Not ready for completion sign-off. It can continue as a development/governance branch, but should not be reported as production closed. |

| Area | Status | Current proof | Remaining proof needed |
| --- | --- | --- | --- |
| 1. Fine-grained anonymized app data | In progress | `platform_governance_events`, `/api/dashboard/governance/analytics`, Data Governance cockpit, app visit hotspot/heatmap/trend, search local hour/weekday/time-slot preference, context/plugin preference, selection matrix, search reliability and journey funnel aggregates. | Real browser screenshot/interaction evidence against the admin cockpit; broader production sample validation and retention/backfill policy evidence. |
| 2. Plugin comments and private plugin analytics | In progress | Plugin owner/private analytics covers downloads, installs, invocations, unique actors, location/channel/version/action trends, conversion, review status trend, rating distribution, rating trend, low-rating rate, comment coverage, and timing buckets in plugin detail. | Click-through owner UI evidence, comment/review drill-down coverage, and production privacy review for owner-scoped access. |
| 3. Upload reliability | In progress | Upload governance aggregates started/completed/failed/stuck attempts, retryable/scheduled/exhausted failures, recovered retries, problem attempt hashes, pipeline summary, failure matrix, stable reason buckets, and bounded storage retry metadata. | Calibration against live failed upload samples, S3/OSS/R2 live storage evidence, and production alert runbook evidence. |
| 4. Intelligence/adapt config merge and asset uploads | In progress | Scene Orchestrator merges adapter/upload/assets/constraints config from provider, capability, scene, and binding metadata; scene adapter assets go through shared storage object writes and private scene asset refs. | Real adapter execution evidence for merged config precedence and asset-backed outputs; old provider table retirement evidence. |
| 5. Storage management, channels, limits, traffic analytics | In progress | Storage policies support local/R2/S3-compatible/OSS style channels through governance configs, secure credential refs, per-channel pressure/trend, remaining/overage budgets, burn-rate forecast, alert queue, dry-run/write smoke, and notify endpoint. | Live local/S3/OSS smoke artifacts, production D1 migration/backfill, and operator docs for channel sizing and alert response. |
| 6. Notification management | In progress | Browser inbox, Resend, SendGrid, Mailgun, Postmark, SMTP relay, HTTP email relay, Feishu/Lark bots, generic webhook, and Web Push relay profiles; delivery trend, provider health, readiness/risk diagnostics, test panel, plugin moderation notification routing. | Real credentials/live send evidence, direct SMTP socket or hosted relay proof, Web Push VAPID/relay production send evidence. |
| 7. Reports, analytics, operations dashboard | In progress | Operations dashboard summary covers user growth, search trend quality, plugin installs, upload risk, storage/notification/provider risk, hot plugin leaderboard, top models/providers, provider token/model/channel distribution, an aggregate daily operations timeline, and a compact command board for latest search/plugin/provider/risk posture. | Stable real browser visual evidence and longer production trend samples. |
| 8. Intelligence provider token/quota limits | In progress | `intelligence_provider_quota` configs enforce request/token budgets before direct invoke, Lab model, and Scene Orchestrator dispatch; Provider Registry quota GET/POST exposes evaluations; governance analytics shows quota risk, remaining budget, burn rate, overage, and nearest exhaustion. | Live provider-call evidence with real quota policies and production registry-primary migration/backfill evidence. |

## Current Implementation Evidence

- Backend foundation:
  - `apps/nexus/server/utils/platformGovernanceStore.ts`
  - `apps/nexus/server/api/dashboard/governance/analytics.get.ts`
  - `apps/nexus/server/api/dashboard/storage/policies*.ts`
  - `apps/nexus/server/api/dashboard/notifications/*.ts`
  - `apps/nexus/server/api/dashboard/provider-registry/providers/[id]/quota.*.ts`
- Admin UI:
  - `apps/nexus/app/pages/dashboard/admin/governance.vue`
  - `apps/nexus/app/components/dashboard/PluginDetailDrawer.vue`
- Upload / assets:
  - `apps/nexus/server/utils/storageObjectStore.ts`
  - `apps/nexus/server/utils/sceneOrchestrator.ts`
  - `apps/nexus/server/utils/sceneAssetStorage.ts`
  - `apps/nexus/server/utils/updateAssetStorage.ts`
  - `apps/nexus/server/utils/pluginPackageStorage.ts`
  - `apps/nexus/server/utils/imageStorage.ts`
- Focused test evidence:
  - `apps/nexus/server/utils/platformGovernanceStore.test.ts`
  - `apps/nexus/app/pages/dashboard/admin/governance.test.ts`
  - `apps/nexus/app/components/dashboard/PluginDetailDrawer.test.ts`
  - Storage, notification, provider-registry, scene, sync, asset upload API tests under `apps/nexus/test` and `apps/nexus/server/utils`.

## 2026-05-24 Delta

- Operations command board was added to the governance admin cockpit:
  - Reuses `dashboard.trends.operationsTimeline` to show the latest daily searches, selection rate, plugin installs/calls, provider requests/tokens, search/upload risk, and compact trend bars.
  - Keeps the command board front-end derived from aggregate analytics only; it does not add raw data collection fields or expose raw actor/query/resource identifiers.
  - Adds focused static UI-contract coverage for the command board, derived latest sample, peak normalization, and trend bar binding.
- Browser evidence attempt:
  - Tried to run `pnpm -C "apps/nexus" run dev:pure` and open `/dashboard/admin/governance`.
  - Nuxt repeatedly restarted with `EMFILE: too many open files, watch`; the browser received `ERR_EMPTY_RESPONSE`.
  - This confirms that local visual evidence is still blocked by the dev watcher/file-descriptor environment and must not be counted as completed cockpit evidence.

## 2026-05-23 Delta

- Operations daily timeline was added to governance analytics and admin UI:
  - `dashboard.trends.operationsTimeline` merges existing anonymized daily aggregates for user signups, search selection/problem rate, plugin installs/invocations, provider requests/tokens, upload status/bytes, storage operations/bytes, and risk score.
  - The admin operations dashboard now renders the latest timeline rows as a compact review strip for daily operations scanning.
  - The timeline remains aggregate-only and does not expose raw queries, actor ids, resource ids, credential refs, attempt ids, or email identifiers.
- Current progress was written into the canonical docs:
  - This file now separates implementation coverage from production evidence blockers.
  - `docs/plan-prd/README.md`, `docs/plan-prd/TODO.md`, and `docs/INDEX.md` point to this snapshot as the current eight-area Data Governance status source.
  - `docs/plan-prd/01-project/CHANGES.md` records the document sync so later branch cleanup can distinguish documentation truth from unfinished code slices.
- Provider quota risk drill-down was added to governance analytics and admin UI:
  - Shows blocked/warning quota rows, utilization, risk reason, remaining request/token budget, overage, and projected exhaustion.
  - Keeps credential refs, provider secrets, raw actors, and account identifiers out of analytics payloads.
- Search journey funnel was added as aggregate-only search analytics:
  - Summary covers total searches, filters, with-results, selected, zero-result, provider-problem, provider error, provider timeout, and rates.
  - Segments combine anonymized context app category, context source, local time slot, session bucket, preference mode, entry point, and trigger type.
  - Segment drill-down only includes aggregate scenes/providers/plugins/selected plugins and unique actor counts; no raw query, email, actor id, context id, attempt id, or resource id is exposed.
- Plugin review rating trend was added to owner/private plugin analytics:
  - Review analytics now includes per-day approved rating count, average rating, low-rating count, and low-rating rate.
  - Plugin detail review quality now shows the latest rating trend and low-rating rate without exposing raw reviewer ids, author names, or comment bodies.

## Open Validation Gaps

1. Real browser evidence for the Data Governance cockpit and plugin owner analytics drawer; the 2026-05-24 local attempt hit Nuxt watcher `EMFILE: too many open files, watch` and did not produce a valid screenshot.
2. Real live-send evidence for Resend/SMTP or hosted email relay, Feishu/Lark/webhook, and Web Push production configuration.
3. Real S3/OSS/R2/local storage smoke artifacts with object write/read/delete traces and alert response.
4. Production D1 migration/backfill execution evidence for `platform_governance_events/configs`.
5. Real provider call evidence proving `intelligence_provider_quota` fail-closed behavior across direct invoke, Lab model, and Scene Orchestrator.
6. Larger operations dashboard/TV view with enough production trend samples for growth, search, install, upload, model, token, and leaderboard interpretation.

## Next Execution Order

1. Resolve the local/CI browser evidence path for Nexus admin pages, including the Nuxt watcher `EMFILE` failure, then produce a browser-visible Data Governance screenshot pass against representative seeded data.
2. Add live storage evidence for one local channel and one OSS/S3-compatible channel.
3. Add notification live-send evidence for at least one email provider and one chat/webhook provider.
4. Capture provider quota fail-closed evidence with a controlled low quota provider policy.
5. Run a production D1 migration/backfill dry-run or controlled execution report and attach the output to this progress snapshot.
6. Only after the evidence above exists, decide whether to mark any of the eight areas complete or keep them in development.
