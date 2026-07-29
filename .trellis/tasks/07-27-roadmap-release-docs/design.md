# Design: roadmap and release documentation refresh

## 1. Document ownership

Primary owned surfaces:

- `README.md` and `README.zh-CN.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md`
- `docs/plan-prd/04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`
- `docs/plan-prd/04-implementation/Evidence-Matrix-Release-Integrity-2026-06-21.md`
- directly related active roadmap/evidence summaries discovered during the audit

The concurrent bilingual task owns user-facing What's Changed and stable release-note files. Findings in those paths are reported, not edited.

## 2. Evidence normalization

Use a four-column review ledger for every changed claim:

| Claim | Evidence class | Authoritative source | Allowed wording |
| --- | --- | --- | --- |
| Historical AI 13/13 | historical | dated manifest/report | "historical 13/13" only |
| Current AI gate | current source + packaged requirement | current package metadata and strict verifier | "recapture open" until exact pass |
| beta.19 Gate E | packaged/production as recorded | exact release assets, manifest, Nexus evidence | close only observed sub-gates |
| OTA | packaged/host/production lifecycle evidence | OTA task/evidence contract | remain open unless separately proven |

The ledger is PR evidence, not a new long-lived source of truth.

## 3. Version authority

At execution time, read stable/current version from repository package metadata. Documents may state the product release, but dependency/tool versions should not be copied into prose when manifests already own them.

Root README prerequisite text should use stable capability constraints or commands such as package-manager/corepack setup. It should not maintain an independent Electron/Vue/Router/builder version table.

## 4. R1 Gate E versus OTA

Gate E and OTA are separate dimensions:

- Gate E evaluates signed release asset/manifest/Nexus integrity evidence.
- OTA evaluates update discovery, download, integrity, handoff/install, health, recovery, compatibility, and platform classification.

The matrix may record beta.19 Gate E closure or progress without changing OTA to complete. Every status row links to its exact evidence and names unproven dimensions.

## 5. CHANGES and roadmap roles

- CHANGES: chronological completed facts and explicit residual risk.
- Roadmap: scoped program status and acceptance definitions.
- `TODO.md`: sole global execution order; this batch links to it and does not duplicate ordering.
- Evidence matrices: requirement-to-evidence mapping, not roadmap priority.

R6 collisions are resolved with labels such as "Roadmap R6 (UI/TuffEx)" or the owning program name. Existing IDs and historical references remain unchanged.

## 6. Language parity

Compare root README sections by semantic topic rather than line-for-line translation. Stable version, support boundaries, installation, prerequisites, and release status must agree. Product prose can remain idiomatic in each language.

## 7. Rollback

The PR is documentation-only. Revert the scoped commit if evidence sources are disputed. Never "fix" a failed verifier by weakening historical/current distinctions or editing raw evidence; correct the active summary or leave the claim open.
