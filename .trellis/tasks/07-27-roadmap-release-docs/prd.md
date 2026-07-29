# Refresh roadmap and release documentation

## Goal

Align active roadmap, evidence, change history, and both root READMEs with stable `2.4.13` while keeping historical, current source, packaged, and production claims independently auditable.

## Confirmed facts

- Root and CoreApp package metadata currently resolve to stable `2.4.13`; execution must still read authoritative metadata rather than rely on this planning snapshot.
- The AI evidence matrix records a historical 13/13 snapshot and a current-version mismatch/open recapture. Other active text still collapses those states into a generic "passed" claim.
- The release-integrity matrix currently records an older Gate E failure. This batch must incorporate exact beta.19 Gate E evidence while leaving OTA acceptance open unless its separate lifecycle criteria are proven.
- `README.zh-CN.md` contains hand-maintained Electron, Vue, Router, Node, and builder versions that can drift from package metadata.
- The concurrent bilingual task owns What's Changed and stable release-note files; this batch must not edit or absorb them.

## Requirements

### R1 - Evidence classification

Every edited claim must use one of these meanings:

- **historical**: exact dated/versioned evidence remains valid only for that snapshot;
- **current source**: repository state resolved from package/config metadata at execution time;
- **packaged**: an exact-version packaged artifact was executed or inspected;
- **production**: a published GitHub/Nexus/deployed surface was directly observed.

A historical 13/13 AI snapshot must remain historical. Current-version recapture stays open until an exact current package passes `--requireCurrentVersion`.

### R2 - R1 release matrix

- Update the R1 release-integrity matrix with beta.19 Gate E evidence and its exact source.
- Close only the Gate E assertions actually proven by signed assets, manifest metadata, Nexus signature/download surfaces, or equivalent recorded evidence.
- Keep OTA open when lifecycle, N/N-1, platform, or production acceptance is still incomplete.
- Do not infer production readiness from focused tests, local manifests, static-only evidence, or an unrelated stable tag.

### R3 - High-signal CHANGES

Add concise completed-fact entries for:

- Windows Everything productionization evidence;
- macOS app-icon self-healing and resource-boundary evidence;
- release integrity/signing status;
- OTA lifecycle/release-acceptance status with unresolved boundaries explicit.

CHANGES records completed facts and remaining caveats. It must not become a second live priority list.

### R4 - Root README contract

- Align `README.md` and `README.zh-CN.md` on stable `2.4.13` status, supported surfaces, and release wording.
- Remove hand-maintained dependency version numbers when package metadata is authoritative; link to manifests or state prerequisites without duplicating versions.
- Preserve language parity for facts owned by these READMEs without copying What's Changed content.
- Do not add marketing claims for unproven OTA, platform, packaging, or production behavior.

### R5 - R6 scope labels

- Qualify ambiguous `R6` labels by their local program or document scope.
- Do not renumber existing local requirements or rewrite historical identifiers.
- Keep cross-document links and matrices stable while making collisions understandable.

### R6 - Ownership and validation

- Own Roadmap/Evidence/CHANGES and both root READMEs only.
- Do not edit `.trellis/tasks/07-27-bilingual-whats-changed/`, stable release-note/What's Changed files owned by that task, or `.trellis/tasks/07-17-unify-ota-update-flow/task.json`.
- Run the AI docs verifier plus focused Markdown, relative-link, and whitespace checks only; skip formatters, project-wide lint, and product suites.

## Acceptance Criteria

- [x] Active AI documents consistently label historical 13/13 and current-version recapture-open states without contradiction.
- [x] The R1 matrix records exact beta.19 Gate E evidence and leaves OTA open wherever separate acceptance remains unmet.
- [x] CHANGES contains high-signal Everything, icon, release, and OTA facts with accurate caveats and no competing priority list.
- [x] Both root READMEs agree on stable `2.4.13`, contain no stale hand-maintained dependency versions, and avoid unproven release claims.
- [x] Ambiguous active R6 labels are locally scoped without renumbering requirements or history.
- [x] What's Changed, stable release-note files, the bilingual task, and the OTA parent `task.json` have no diff.
- [x] `mise run ai-docs:dev`, focused changed-Markdown/link checks, and `git diff --check` pass.
- [x] A dedicated PR is open with branch, commit, validation output, owned files, exclusions, and planning-PR dependency.

## Out of Scope

- Writing What's Changed or release notes owned by the bilingual task.
- Publishing, signing, uploading, or testing a release.
- Closing OTA based solely on Gate E or beta.19 signing evidence.
- Rewriting archived reports to match current wording.
