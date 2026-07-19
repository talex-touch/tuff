# Plugin Security Scan - Implementation Plan

## Ordered Checklist

1. [x] Define versioned scan report/finding/waiver contracts and stable decision codes in the owning shared package.
2. [x] Implement bounded inventory/text/binary readers that consume package-policy normalized entries without executing code.
3. [x] Implement initial rules for secrets/private keys, prod dev source, raw Electron/transport, dynamic execution, native binaries and permission-capability mismatch.
4. [x] Add deterministic reducer, timeout/limit handling and report sanitizer.
5. [x] Add CLI local scan command/path and JSON output bound to artifact SHA-256.
6. [x] Add Nexus authoritative scan before pending review, governance events and persisted report summary/digest.
7. [x] Add Nexus-owned waiver storage/authorization/expiry; package data cannot define waivers.
8. [x] Integrate scan decisions with the later eligibility projection without duplicating visibility logic.
9. [x] Document rule limits, false-positive review and evidence hygiene.

## Contract Tests

- clean official package;
- each rule category with one minimal fixture;
- same artifact produces stable ordered findings in CLI and Nexus;
- Critical/High block, Medium/Low review-required;
- timeout, parser error and unavailable rule set fail closed;
- valid/expired/malformed waiver behavior;
- report never includes known fixture secret or full source line;
- bounded file/byte/time behavior on adversarial inventory.

## Verification Commands

```bash
corepack pnpm -C packages/utils exec vitest run __tests__/plugin/security-scan.test.ts
corepack pnpm -C packages/tuff-cli-core exec vitest run src/__tests__/security-scan.test.ts
corepack pnpm -C apps/nexus exec vitest run server/utils/__tests__/plugin-security-scan.test.ts
corepack pnpm -C packages/utils run typecheck
corepack pnpm -C packages/tuff-cli-core run build
corepack pnpm -C apps/nexus run typecheck
corepack pnpm lint:changed
git diff --check
```

## Verification Results

- `packages/utils`: 13 focused scanner assertions passed.
- `packages/tuff-cli-core`: 2 artifact scanner assertions and DTS build passed.
- `apps/nexus`: 9 authoritative scan, waiver and publish/re-edit assertions plus Nuxt typecheck passed.
- `packages/tuff-cli`: CLI build passed; `tuff scan --json` returned `passed` for real quickops and authorized-shell archives.
- Repository gates: 23/23 plugin validation, `lint:changed` and `git diff --check` passed.

## Risky Files and Boundaries

- Any scanner reading untrusted archive content: enforce limits before decode/parse.
- Rule evidence serialization: never retain match values or complete source.
- Nexus upload governance/version persistence: scan failure must not create an eligible/published version.
- Permission detection is heuristic; it must not silently grant or revoke runtime permissions.

## Rollout/Rollback

Shadow-scan current approved artifacts and review findings before enforcement. Rule-set rollback is versioned and audited; scanner unavailable, package-policy violations and known secret/private-key findings remain fail closed.
