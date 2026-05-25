# Nexus Data Governance Progress Snapshot

> Snapshot date: 2026-05-23
> Scope: Nexus data collection, plugin analytics, upload reliability, Intelligence/adapt uploads, storage governance, notification governance, operations dashboards, and provider quota controls.

## Executive Status

Current verdict: **in progress, not production-complete**. The local implementation has a broad code-backed baseline for the eight Nexus Data Governance areas, and the most recent focused validation covers the newly added search journey funnel, search local-time heatmap, upload reliability action queue, Scene asset upload health, storage governance action queue, local/memory write smoke artifact evidence, read-only D1 readiness diagnostics, notification action queue, plugin review rating trend/action queue, operations daily timeline, operations command board, read-only operations report snapshot, and admin hydration/i18n stabilization slices. The remaining blockers are evidence blockers rather than architecture unknowns: stable real browser screenshots/interactions, live notification sends, live R2/S3/OSS storage traces, production D1 migration/backfill execution, and real provider quota fail-closed calls.

| Roll-up | Current state |
| --- | --- |
| Scope breadth | 8/8 target areas have code or admin/API surface in the current worktree. |
| Local evidence | Search journey, search local-time heatmap, anonymous search frequency cohorts, provider quota drill-down/action queue/smoke evidence, provider model-channel token/request distribution, plugin owner analytics action queue, plugin review trend/action queue/comment quality buckets/moderation timing, upload retry/reason buckets, upload reliability action queue/recovered evidence, Scene asset upload health, storage pressure/action queue/smoke evidence, local/memory storage write/read/delete smoke artifact evidence, read-only D1 readiness diagnostics, notification profiles/action queue/delivery evidence/channel-test evidence, operations summary, operations daily timeline, operations command board, and read-only operations report snapshot all have focused test or contract-test coverage recorded in this snapshot. |
| Production evidence | Not complete. No stable authenticated admin browser pass, live send pass, live R2/S3/OSS object-storage pass, production D1 backfill, or real provider quota call evidence has been attached yet. Cloudflare Pages `tuff` has a later successful production deployment for `ad5f243`, but that proves deployment recovery only, not the remaining Data Governance evidence. |
| Release readiness | Not ready for completion sign-off. It can continue as a development/governance branch, but should not be reported as production closed. |

| Area | Status | Current proof | Remaining proof needed |
| --- | --- | --- | --- |
| 1. Fine-grained anonymized app data | In progress | `platform_governance_events`, `/api/dashboard/governance/analytics`, Data Governance cockpit, app visit hotspot/heatmap/trend, search local hour/weekday/time-slot preference, weekday-by-hour heatmap, anonymous search frequency cohorts, context/plugin preference, selection matrix, search reliability and journey funnel aggregates. | Real browser screenshot/interaction evidence against the admin cockpit; broader production sample validation and retention/backfill policy evidence. |
| 2. Plugin comments and private plugin analytics | In progress | Plugin owner/private analytics covers downloads, installs, invocations, unique actors, location/channel/version/action trends, conversion, aggregate owner action queue, review status trend, rating distribution, rating trend, low-rating rate, comment coverage, aggregate comment quality buckets, aggregate moderation timing, aggregate review action queue, and timing buckets in plugin detail. | Authenticated click-through owner UI evidence and production privacy review for owner-scoped access. |
| 3. Upload reliability | In progress | Upload governance aggregates started/completed/failed/stuck attempts, retryable/scheduled/exhausted failures, recovered retries, recovered upload evidence, problem attempt hashes, pipeline summary, failure matrix, action queue priority, Scene asset upload health, stable reason buckets, and bounded storage retry metadata. | Calibration against live failed upload samples, S3/OSS/R2 live storage evidence, and production alert runbook evidence. |
| 4. Intelligence/adapt config merge and asset uploads | In progress | Scene Orchestrator merges adapter/upload/assets/constraints config from provider, capability, scene, and binding metadata; scene adapter assets go through shared storage object writes and private scene asset refs; Data Governance groups Scene asset upload health by scene, capability, provider, asset kind, resource type, and storage channel/provider. | Real adapter execution evidence for merged config precedence and asset-backed outputs; old provider table retirement evidence. |
| 5. Storage management, channels, limits, traffic analytics | In progress | Storage policies support local/memory/R2/S3-compatible/OSS style channels through governance configs, secure credential refs, per-channel pressure/trend, action queue, remaining/overage budgets, burn-rate forecast, alert queue, dry-run/write smoke, local/memory write/read/delete artifact test evidence, notify endpoint, and `docs/plan-prd/04-implementation/NexusStorageGovernanceRunbook-2026-05-24.md` for sizing/smoke/alert response. | Live R2/S3/OSS smoke artifacts, production D1 migration/backfill, authenticated operator cockpit evidence, and live alert-send evidence. |
| 6. Notification management | In progress | Browser inbox, Resend, SendGrid, Mailgun, Postmark, SMTP relay, HTTP email relay, Feishu/Lark bots, generic webhook, and Web Push relay profiles; delivery trend, delivery evidence, provider health, readiness/risk diagnostics, action queue, test panel, channel-test evidence, plugin moderation notification routing, auth email routing through notification channel configs, and `docs/plan-prd/04-implementation/NexusNotificationGovernanceRunbook-2026-05-24.md` for live-send/privacy evidence with sanitized governance audit metadata. | Real credentials/live send evidence, hosted SMTP relay proof, Web Push VAPID/relay production send evidence, and authenticated cockpit evidence. |
| 7. Reports, analytics, operations dashboard | In progress | Operations dashboard summary covers user growth, search trend quality, plugin installs, upload risk, storage/notification/provider risk, hot plugin leaderboard, top models/providers, provider token/model/channel distribution, provider model-by-channel token/request distribution, an aggregate daily operations timeline, a local-time search heatmap, compact command board, and admin-only read-only operations report snapshot with scorecards, evidence status, risk queue, leaderboards, and trend summary. | Stable real browser visual evidence, authenticated report snapshot click-through evidence, and longer production trend samples. |
| 8. Intelligence provider token/quota limits | In progress | `intelligence_provider_quota` configs enforce request/token budgets before direct invoke, Lab model, and Scene Orchestrator dispatch; Scene Orchestrator quota checks are scoped by capability channel; Provider Registry quota GET/POST exposes evaluations; governance analytics shows quota risk/action queue, remaining budget, burn rate, overage, nearest exhaustion, and model-by-channel token/request distribution for quota planning. | Live provider-call evidence with real quota policies and production registry-primary migration/backfill evidence. |

## Current Implementation Evidence

- Backend foundation:
  - `apps/nexus/server/utils/platformGovernanceStore.ts`
  - `apps/nexus/server/api/dashboard/governance/analytics.get.ts`
  - `apps/nexus/server/api/dashboard/governance/report.get.ts`
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

## 2026-05-25 Delta

- Admin hydration and i18n stability were tightened:
  - `useLocaleOrchestrator` now separates server/default init from client reconciliation, so profile/browser/cookie reconciliation runs after mount instead of during SSR setup.
  - `app.vue` gates profile-locale sync until the client is mounted, then runs client reconciliation and profile sync with the latest auth state.
  - `DashboardNav` gates user/team revalidation, unread notification refresh, and admin-derived navigation state behind the mounted flag to avoid SSR/client role drift.
  - `provider-registry.vue` now uses the ClientOnly lazy admin panel shell through `LazyDashboardProviderRegistryAdminPanel`, matching the existing Nexus heavy-admin-page pattern.
  - `governance.vue` replaces raw fallback translation usage with a guarded `tt()` helper, and English/Chinese locales now include the missing Provider Registry, Data Governance, common action, and dashboard menu labels used by the admin pages.
  - This improves operator page stability and translation completeness, but it is not authenticated browser evidence and does not close production blockers.
- Release and CI evidence were refreshed:
  - `v2.4.11-beta.3` was published from `master` with release commit `0360271ec` and tag `v2.4.11-beta.3`.
  - Local beta packaging passed before release with `pnpm build:beta:mac`.
  - GitHub Actions `Build and Release` passed for the beta release, including Windows, Linux, macOS release jobs, GitHub release creation, and Nexus release sync.
  - Nexus release API returned a published prerelease record for `v2.4.11-beta.3`; the stable latest-release endpoint still points at the latest stable channel, which is expected.
- Focused validation for this slice:
  - `pnpm -C "apps/nexus" exec vitest run "app/pages/dashboard/admin/governance.test.ts"` passed with 17 tests.
  - File-scoped ESLint passed for the touched Nexus files.
  - `git diff --check` passed.
  - `pnpm nexus:build` passed locally; existing non-blocking warnings remain tracked as build-environment noise rather than completion evidence.

## 2026-05-24 Delta

- Scene asset upload health was added:
  - `uploads.sceneAssetHealth` now aggregates Scene adapter asset upload attempts by scene, capability, provider, asset kind, resource type, storage channel, and storage provider.
  - The Data Governance cockpit renders started/completed/failed counts, bytes, failure rate, average duration/size, latest sample time, top failure reason, and top status code for Scene adapter asset uploads.
  - Focused coverage: `server/utils/platformGovernanceStore.test.ts` and `app/pages/dashboard/admin/governance.test.ts` verify backend aggregation, UI contract exposure, and privacy boundaries. The payload remains aggregate-only and does not expose raw admin ids, attempt ids, resource ids, asset ids, object keys, filenames, base64 payloads, credential refs, or upload payload contents.
  - This improves item 3 and item 4 local auditability, but does not replace real adapter execution evidence, real S3/OSS/R2 object smoke artifacts, or production alert runbook evidence.
- Read-only operations report snapshot was added:
  - Added the admin-only `/api/dashboard/governance/report` route and `getPlatformGovernanceReportSnapshot`, reusing existing anonymized analytics to produce scorecards, evidence status, risk queue, hot plugin/model/provider leaderboards, and trend peaks without adding a new write path.
  - The Data Governance cockpit renders the report snapshot above the existing analytics cards so operators can see current risk posture, open evidence blockers, and prioritized cross-area risks without reading raw event rows.
  - Focused coverage: `server/utils/platformGovernanceStore.test.ts`, `test/api/dashboard/governance/report.api.test.ts`, and `app/pages/dashboard/admin/governance.test.ts` cover report generation, admin API wiring, UI contract exposure, and privacy boundaries. The payload remains aggregate/config-only and does not expose raw actor ids, emails, object keys, attempt ids, resource ids, `secure://` refs, provider secrets, or request payloads.
  - This improves item 7 local report/dashboard coverage, but does not replace authenticated browser visual evidence or longer production trend samples.
- Auth email helpers were routed through notification governance channels:
  - Register verification, email binding verification, password reset, and NextAuth magic-link emails now provide an event and action/resource tags to `sendEmail`, allowing configured notification email channels to deliver them in send mode. Resend is one such notification channel provider (`providerType: "resend"`), not a channel-bypassing fallback.
  - Notification email adapters use channel-configured subject/text/html first, then auth email payload subject/text/html, then generated notification text, preserving readable auth messages without bypassing channel routing.
  - The admin Users dashboard now exposes an admin-only support recovery control that generates bounded one-time password reset links for active users; the server clamps TTL to one day and writes admin audit metadata for expiry/TTL without storing the reset token in audit metadata.
  - Notification governance audit and browser inbox metadata sanitization now drop subject, text, HTML, body, URL, recipient, token, credential ref, endpoint key, and provider secret fields from stored telemetry. Provider requests still receive the required delivery payload, but governance records remain aggregate/config-only.
  - Focused coverage: `server/utils/notificationDispatcher.test.ts` proves auth email channel delivery does not audit recipient addresses, tokens, body HTML/text, credential refs, or API keys; `test/api/auth/auth-email-channel-contract.test.ts` statically guards auth handler action tags and event passing; `test/api/admin/users-password-reset-link.api.test.ts` covers active-only support recovery, TTL clamping, origin fallback, and token-free admin audit metadata.
  - This adds local implementation evidence for notification management, but does not replace live credential-backed send evidence.
- Local Cloudflare Pages build evidence was refreshed:
  - `pnpm nexus:build` completed successfully on 2026-05-24 after the current notification/auth/provider quota/search governance slices and again after the Scene asset upload health slice, producing `apps/nexus/dist` and Nitro `_worker.js` for the `cloudflare-pages` preset.
  - Non-blocking warnings remain: duplicated auto-import names in billing/scene/telemetry/locale utilities, missing `en` i18n keys for parts of pricing/auth during prerender, Browserslist data age, OpenAI ESM top-level `this` rewrites, missing D1 binding fallback warnings during prerender, and large chunk warnings.
  - This proves the current local source can build for Pages, but it is not a live Cloudflare deployment proof and does not close the production evidence gaps above.
- Storage smoke auditability was restored:
  - Added the missing `/api/dashboard/storage/channels/smoke` admin route and wired it to the existing `runStorageChannelSmoke` utility, so the cockpit dry-run/write buttons now have a real backend endpoint.
  - `storage.smokeEvidence` now aggregates `storage.channel_smoke.ready`, `storage.channel_smoke.sent`, and `storage.channel_smoke.failed` events into latest status, policy/channel/provider, mode, reason, operations, bytes written/read, credential readiness flags, event counts, and unique actor counts.
  - The Data Governance cockpit renders recent smoke evidence before storage action queue rows so operators can inspect smoke history without reading raw event logs.
  - Focused coverage: `test/api/dashboard/storage/channels-smoke.api.test.ts`, `server/utils/platformGovernanceStore.test.ts`, and `app/pages/dashboard/admin/governance.test.ts` cover route wiring, dry-run audit creation, local/memory write/read/delete smoke artifact usage events, aggregate smoke evidence, and UI contract. The payload remains aggregate/config-only and does not expose raw admin ids, emails, object keys, diagnostic object key prefixes, credential refs, or storage payload contents.
  - This closes the local/memory smoke artifact test-evidence gap only; live S3/OSS/R2 object smoke artifacts are still open production evidence.
- Storage governance operator runbook was added:
  - `docs/plan-prd/04-implementation/NexusStorageGovernanceRunbook-2026-05-24.md` now records supported channel profiles, required policy fields, sizing defaults, smoke procedures, privacy checks, alert response matrix, notification flow, and focused verification commands.
  - The runbook explicitly keeps local/memory smoke as focused test evidence and keeps R2/S3/OSS live object-store smoke, authenticated cockpit screenshots, alert-send evidence, and production D1 backfill open.
- Notification governance operator runbook was added:
  - `docs/plan-prd/04-implementation/NexusNotificationGovernanceRunbook-2026-05-24.md` now records supported browser, email, Feishu/Lark, webhook, and Web Push channel profiles; required config and credential shapes; dry-run/send procedures; failure response; privacy boundaries; evidence checklist; and focused verification commands.
  - The runbook explicitly keeps local channel-test and delivery analytics as implementation evidence, while real email/chat/webhook live sends, Web Push VAPID/relay evidence, and authenticated admin cockpit proof remain open.
- Read-only D1 readiness diagnostics were restored:
  - Added back the admin-only `/api/dashboard/governance/d1-readiness` route so the Data Governance cockpit's D1 migration readiness card has a real backend source again.
  - Focused coverage now verifies missing D1 binding, missing index/backfill warning, and ready seeded-schema states without running migrations or exposing raw admin ids, `secure://` refs, API keys, or secrets.
  - This is readiness-contract evidence only. It does not execute production D1 migrations or backfill production rows, so the production D1 evidence blocker remains open.
- Provider quota smoke evidence was added:
  - Added `/api/dashboard/provider-registry/providers/[id]/quota/smoke` so admins can dry-run a provider/channel quota or consume one synthetic request plus bounded token usage to prove the quota gate blocks subsequent calls.
  - `providers.quotaSmokeEvidence` aggregates `provider.quota_smoke.allowed`, `provider.quota_smoke.consumed`, `provider.quota_smoke.blocked`, and `provider.quota_smoke.failed` into provider/channel, mode, latest status, reason, request/token recording, counts, and unique actor count.
  - The Data Governance cockpit renders recent provider quota smoke evidence beside quota action/risk rows, while smoke audit events are kept out of normal provider usage/model/channel leaderboards.
  - Focused coverage: `server/utils/platformGovernanceStore.test.ts`, `test/api/dashboard/provider-registry/provider-registry.api.test.ts`, and `app/pages/dashboard/admin/governance.test.ts` cover analytics aggregation, provider-registry route wiring, synthetic consume fail-closed behavior, and UI contract. The payload remains aggregate/config-only and does not expose raw admin ids, provider credential refs, provider secrets, or request payloads.
  - This strengthens local fail-closed evidence for item 8, but real provider-call production evidence is still open.
- Recovered upload evidence was added:
  - `uploads.recoveredEvidence` now aggregates upload attempts that completed after retry recovery, exposing bounded attempt/resource hashes, storage channel/provider, content type, duration, size, retry count, attempt count, storage operation, and upstream storage status code.
  - The Data Governance cockpit renders recent recovered upload evidence so operators can inspect recovery samples without opening raw upload logs.
  - Focused coverage: `server/utils/platformGovernanceStore.test.ts` and `app/pages/dashboard/admin/governance.test.ts` verify recovered evidence aggregation, UI contract, and privacy boundaries. The payload remains hash/aggregate-only and does not expose raw admin ids, attempt ids, resource ids, object keys, credential refs, or upload payload contents.
  - This improves item 3 local upload-reliability auditability, but live failed-sample calibration, real S3/OSS/R2 object evidence, and production alert runbook evidence remain open.
- Notification channel test evidence was added:
  - `notifications.testEvidence` now aggregates sanitized channel-test delivery audit events whose context marks `test: true` or carries a `channelTestId`, grouping by notification channel config and notification action.
  - The Data Governance cockpit renders recent channel-test evidence with latest status, reason, provider/adapter, duration, status code, planned/sent/skipped/failed counts, and unique actor count so operators can audit dry-run/send tests without reading raw event logs.
  - Focused coverage: `server/utils/platformGovernanceStore.test.ts` and `app/pages/dashboard/admin/governance.test.ts` cover backend aggregation, UI contract, and privacy boundaries. The payload remains aggregate/config-only and does not expose raw admin ids, recipient emails, notification body/content, credential refs, endpoint keys, or provider secrets.
  - This closes local channel-test auditability for item 6, but it does not replace real credential-backed live send proof, direct SMTP/relay evidence, or Web Push VAPID/relay production evidence.
- Notification delivery evidence was separated from channel-test evidence:
  - `notifications.deliveryEvidence` now aggregates non-test notification delivery audit events by provider/config/action/resource type, while `notifications.testEvidence` remains scoped to admin channel-test audit events.
  - The Data Governance cockpit renders recent delivery evidence with latest status, reason, provider/adapter, action/resource type, duration, status code, planned/sent/skipped/failed counts, and unique actor count.
  - Focused coverage: `server/utils/platformGovernanceStore.test.ts` and `app/pages/dashboard/admin/governance.test.ts` verify aggregation, test/non-test separation, UI contract, and privacy boundaries. The payload remains aggregate/config-only and does not expose raw reviewer/admin ids, recipient emails, credential refs, endpoint keys, provider secrets, or delivery payloads.
  - This improves item 6 local auditability and prepares a visible slot for future live-send evidence, but real credentials/live send, direct SMTP/relay, and Web Push VAPID/relay production proof remain open.
- Cloudflare Pages deployment status was rechecked for the actual `tuff` project:
  - `wrangler pages project list` shows `tuff` mapped to `tuff-dso.pages.dev` and `tuff.tagzxia.com`; the older `tuff-nexus` project is not the active target for this deployment check.
  - `wrangler pages deployment list --project-name tuff --environment production --json` shows the user-referenced deployment `b937459f-a069-44ed-8b6d-c686f8de0671` failed on `master` source `ffc0a4f`, while the later production deployment `c933f4f3-a786-4265-b64f-87a540523f79` succeeded on source `ad5f243`.
  - Public HTTP checks returned `200` for `https://c933f4f3.tuff-dso.pages.dev` and `https://tuff.tagzxia.com`, while the failed `https://b937459f.tuff-dso.pages.dev` deployment returned `404`.
  - Cloudflare Dashboard opened the failed deployment page but requested creating an Agent Lee read-only API token before exposing account details in-browser; no token was created. Wrangler's authenticated read-only deployment list is the recorded source of truth for this status.
  - The current local branch is still ahead of `origin/master` by two commits, so local governance command-board/timeline work is not represented by the latest successful Cloudflare deployment.
- Local Pages runtime preview was recovered:
  - Plain shell env and `--env-file .env/.env.local` were not enough for `wrangler pages dev`; both paths still started the Worker without `AUTH_ORIGIN` and failed with Sidebase `AUTH_NO_ORIGIN`.
  - Passing production-required values as Wrangler bindings started the local Worker successfully: `AUTH_ORIGIN`, `AUTH_SECRET`, `APP_AUTH_JWT_SECRET`, and `NUXT_INTELLIGENCE_ENCRYPT_KEY`.
  - Local HTTP checks against `http://127.0.0.1:8791/`, `/dashboard/admin/governance`, and `/api/v1/index` returned `200` after binding injection, and Playwright loaded the homepage title `Tuff Nexus` with `/api/auth/session` returning `200`.
  - The run does not close the admin cockpit visual gap because it was unauthenticated, and the homepage triggered existing external AI traffic; future browser evidence should use an authenticated seeded admin session and avoid landing-page network side effects.
- Scene Orchestrator provider quota checks were aligned with per-capability channels:
  - `runSceneOrchestrator` now passes the selected capability id into `assertIntelligenceProviderQuota`, matching the `provider.request` channel recorded by the same execution path.
  - Focused coverage proves an exhausted `text.translate` quota does not block a same-provider `image.translate` scene, while the image scene records its own request channel.
  - Provider Registry quota GET now also returns a backward-compatible `quotas[]` list so multiple channel-scoped quota configs for one provider remain visible alongside the legacy single `quota` field.
  - Provider Registry admin now renders the multi-channel quota list with configured channel count plus each channel's request/token/window limits, keeping the existing single-quota edit flow intact.
  - This strengthens local fail-closed behavior for provider channel quotas but does not replace real provider-call production evidence.
- Anonymous search frequency cohorts were added to governance analytics and admin UI:
  - `searches.frequencyCohorts` groups anonymized search actors into single/light/regular/power cohorts, with aggregate users, searches, quantity, active days, average searches/user, average active days/user, selection rate, zero-result rate, problem rate, local-time slot, preference mode, context app, seen plugin, and selected plugin buckets.
  - The Data Governance cockpit renders the cohorts before raw heatmap and bucket rows so operators can compare light and power-search behavior without exposing actor-level records.
  - The cohort response remains aggregate-only and does not expose raw query text, actor ids, emails, context ids, resource ids, attempt ids, credential refs, or actor/context hashes.
- Plugin owner/private analytics action queue was added to the owner analytics payload:
  - `analytics.actionQueue` derives prioritized owner actions from aggregate install conversion, invocation conversion, invocation failure rate, retention rate, and country concentration signals.
  - The plugin detail analytics panel renders the queue before review quality so owners can triage install conversion, activation, runtime failures, retention, and location coverage before drilling into detailed charts.
  - The queue remains aggregate-only and does not expose raw actor ids, emails, reviewer ids, resource ids, attempt ids, or raw plugin usage events.
- Plugin review action queue was added to owner/private plugin analytics:
  - `reviews.actionQueue` derives prioritized owner actions from aggregate pending/rejected review backlog, low-rating signals, and title/comment coverage quality.
  - The plugin detail review quality panel renders the queue before rating distribution so owners can triage moderation backlog, rejected review patterns, low-rating spikes, and weak review prompt coverage first.
  - The queue remains aggregate-only and does not expose raw reviewer ids, author names, emails, review ids, comment bodies, or raw review content.
- Plugin review comment quality buckets were added to owner/private plugin analytics:
  - `reviews.comments.qualityBuckets` groups review comments into empty, short, medium, and long buckets with aggregate status counts, average rating, low-rating rate, title coverage, comment coverage, and average content length.
  - The plugin detail review quality panel renders the buckets after comment coverage/trend so owners can inspect prompt quality and low-rating concentration without opening raw review text.
  - The bucket payload remains aggregate-only and does not expose raw reviewer ids, author names, emails, review ids, comment bodies, or raw review content.
- Plugin review moderation timing was added to owner/private plugin analytics:
  - `reviews.moderationTiming` aggregates pending review age and processed review turnaround into under-1-hour, 1-24-hour, 1-7-day, and over-7-day buckets with status counts, average hours, and max hours.
  - The plugin detail review quality panel renders pending age and processed turnaround summaries plus bucket rows so owners can identify moderation backlog without exposing raw reviewer identities or comment text.
  - The timing payload remains aggregate-only and does not expose raw reviewer ids, author names, emails, review ids, comment bodies, or raw review content.
- Owner analytics access contract coverage was tightened:
  - `/api/dashboard/plugins/:id/analytics` now has focused API coverage for owner reads, admin cross-owner reads, and non-owner rejection before governance/review aggregate queries run.
  - This strengthens local access-boundary evidence for owner/private analytics, but does not replace authenticated browser click-through evidence or production privacy review.
- Provider model-by-channel distribution was added to governance analytics:
  - `providers.modelChannelDistribution` groups Intelligence provider usage by model and channel with aggregate requests, tokens, quantity, unique actors, provider mix, and provider type mix.
  - The Data Governance provider cockpit renders the breakdown beside the existing model and channel views so operators can inspect token burn by model/channel without reading request payloads.
  - The payload remains aggregate-only and does not expose raw actors, prompts, request bodies, credential refs, provider secrets, account ids, or per-request identifiers.
- Provider quota action queue was added to governance analytics and admin UI:
  - `providers.quotaActionQueue` derives prioritized operator actions from aggregate provider quota evaluations, including overage, exhausted budgets, warning thresholds, disabled quotas, missing hard limits, and projected exhaustion.
  - The admin Data Governance cockpit renders the queue before raw quota risk rows so operators can triage provider token/request limits and burn-rate pressure first.
  - The queue remains aggregate/config-only and does not expose raw actor ids, emails, credential refs, provider secrets, attempt ids, account ids, or per-request payloads.
- Notification governance action queue was added to governance analytics and admin UI:
  - `notifications.actionQueue` merges notification channel readiness risks with delivery provider health into priority, suggested action, reason, send/failure/skipped counts, rates, duration, and latest failure context.
  - The admin Data Governance cockpit renders the queue before provider mix and raw channel risks so operators can triage missing credentials, missing runtime/relay config, disabled channels, failed deliveries, and skipped delivery patterns first.
  - The queue remains aggregate/config-only and does not expose raw actor ids, recipient addresses, credential refs, endpoint keys, provider secrets, or delivery payload contents.
- Storage governance action queue was added to governance analytics and admin UI:
  - `storage.actionQueue` derives priority, suggested action, reason, remaining budget, overage, burn rate, and projected exhaustion context from aggregate storage channel pressure and policy evaluation rows.
  - The admin Data Governance cockpit renders the queue before raw channel pressure so operators can triage blocked, warning, projected exhaustion, and unmanaged storage channels first.
  - The queue remains aggregate-only and does not expose raw actor ids, emails, storage object keys, resource ids, package ids, credential refs, or storage payload contents.
- Upload reliability action queue was added to governance analytics and admin UI:
  - `uploads.actionQueue` derives priority, suggested action, retry state, calibration state, age, next retry delay, and bounded evidence hashes from existing aggregate failure matrix rows and failed/stuck problem attempts.
  - The admin Data Governance cockpit renders the queue before the raw failure matrix so operators can triage critical stuck or retry-exhausted upload issues first.
  - The queue response remains aggregate/hash-only and does not expose raw actor ids, emails, attempt ids, resource ids, credential refs, object keys, or upload payload contents.
- Search local-time heatmap was added to governance analytics and admin UI:
  - `searches.timeHeatmap` aggregates existing anonymized local weekday and local hour metadata into weekday-by-hour cells with search count, selection rate, zero-result rate, provider problem rate, top context app/source buckets, plugin seen buckets, and selected plugin buckets.
  - The admin Data Governance cockpit renders the heatmap plus top time windows for operator scanning, keeping it derived from aggregate governance events only.
  - The heatmap response does not expose raw query text, actor ids, emails, context ids, raw resource ids, credential refs, or per-search attempt identifiers.
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

1. Authenticated real browser evidence for the Data Governance cockpit and plugin owner analytics drawer. The Cloudflare Pages runtime can start locally with explicit Wrangler bindings, but the latest browser pass was unauthenticated and should not be counted as cockpit completion evidence.
2. Real live-send evidence for Resend/SMTP or hosted email relay, Feishu/Lark/webhook, and Web Push production configuration.
3. Real S3/OSS/R2 storage smoke artifacts with object write/read/delete traces. Local/memory write/read/delete has focused test evidence, and the storage governance runbook now covers alert response; authenticated browser/operator and live alert-send evidence are still required before counting cockpit evidence complete.
4. Production D1 migration/backfill execution evidence for `platform_governance_events/configs`. The read-only readiness route and local Mock D1 contracts are restored, but no production migration/backfill has been executed in this slice.
5. Real provider call evidence proving `intelligence_provider_quota` fail-closed behavior across direct invoke, Lab model, and Scene Orchestrator.
6. Larger operations dashboard/TV view with enough production trend samples for growth, search, install, upload, model, token, and leaderboard interpretation.

## Next Execution Order

1. Resolve the local/CI browser evidence path for Nexus admin pages, including the Nuxt watcher `EMFILE` failure, then produce a browser-visible Data Governance screenshot pass against representative seeded data.
2. Add live storage evidence for one R2/S3/OSS-compatible channel, then capture an authenticated cockpit run for the local/memory smoke button if operator-visible evidence is required.
3. Add notification live-send evidence for at least one email provider and one chat/webhook provider.
4. Capture provider quota fail-closed evidence with a controlled low quota provider policy.
5. Run a production D1 migration/backfill dry-run or controlled execution report and attach the output to this progress snapshot.
6. Only after the evidence above exists, decide whether to mark any of the eight areas complete or keep them in development.
