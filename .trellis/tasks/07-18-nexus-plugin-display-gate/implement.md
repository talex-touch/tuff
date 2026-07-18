# Nexus Plugin Display Gate - Implementation Plan

## Ordered Checklist

1. [ ] Add shared eligibility types/reason codes and one pure projection with audience/channel rules.
2. [ ] Add an additive D1 migration and memory-fallback fields for artifact, policy, scan, publisher trust, Nexus attestation, revocation and eligibility revision.
3. [ ] Hydrate existing versions as not-evaluated/ineligible; add a backfill evaluator for current approved artifacts.
4. [ ] Replace status-only checks in Store list/search/detail/versions/latest selection with the projection.
5. [ ] Re-evaluate the exact version in download before object access; block missing/quarantined/revoked artifacts.
6. [ ] Expose safe reason codes to owner/admin Dashboard and keep internal reports/paths out of public payloads.
7. [ ] Recompute latest eligible version and append timeline events on review/policy/scan/signature/artifact/revocation transitions.
8. [ ] Add eligibility revision to cache keys/invalidation and prove immediate withdrawal.
9. [ ] Shadow-compare old/new visibility, backfill, then hard-cut all public endpoints together.

## Contract Tests

Matrix dimensions:

- plugin status × version status;
- RELEASE/BETA/SNAPSHOT × public/beta/owner/admin audience;
- policy/scan/publisher/attestation pass/fail/unavailable;
- artifact available/missing/quarantined and revoked/not revoked;
- old eligible release plus new pending/rejected release;
- D1 and memory fallback parity;
- list/search/detail/versions/download consistency;
- cache invalidation after revocation.

## Verification Commands

```bash
corepack pnpm -C apps/nexus exec vitest run server/utils/pluginsStore.test.ts server/utils/plugin-release-eligibility.test.ts test/api/store/plugins-list.api.test.ts test/api/store/plugin-download-gate.api.test.ts
corepack pnpm -C apps/nexus run check:api-routes
corepack pnpm -C apps/nexus run typecheck
corepack pnpm -C apps/nexus run build
corepack pnpm lint:changed
git diff --check
```

## Risky Files

- D1 migration and memory fallback parity.
- `pluginsStore.ts` latest-pointer updates and semantic-version selection.
- Public download route; never trust cached list eligibility.
- Admin review transitions and timeline audit.

## Rollback

Preserve additive columns and historical reports. A feature flag may select the previous projection during controlled rollback, but missing, quarantined or revoked artifacts remain blocked. Restore the previous eligible pointer transactionally if recomputation fails.
