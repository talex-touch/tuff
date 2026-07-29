# Add documentation quality gates

## Goal

Make documentation drift fail closed through one deterministic, read-only command that developers and CI run identically after the documentation source-of-truth, roadmap/release, peripheral-doc, and bilingual release-note contracts have converged.

## Confirmed facts

- The main CI workflow currently selects only added or modified root-level `*.md` files for Markdown lint and invokes `npx`, so nested Markdown/MDC and offline dependency determinism are not guaranteed.
- Product documentation contains more than one thousand Git-tracked Markdown/MDC files. Filesystem walks would also see untracked, generated, dependency, runtime, and evidence content that is not an authoritative validation scope.
- `mise run ai-docs:dev` currently checks a narrow set of literal AI-document assertions. It is an existing contract to reuse or refactor, not a second gate to copy.
- The current release version must be derived from matching root and CoreApp package metadata. User-facing notes are governed by `notes/RELEASE_NOTES_GUIDE.md` and owned by the concurrent bilingual task.
- Root `README.md` and `README.zh-CN.md` belong to the roadmap/release child. This child may validate them as tracked product docs after prerequisites converge, but it must not repair their prose.

## Prerequisites

Implementation starts only after the integration branch contains exact commits from:

1. `07-27-docs-sot-convergence`;
2. `07-27-roadmap-release-docs`;
3. `07-27-peripheral-docs-cleanup`;
4. the concurrent bilingual What's Changed/release-note task.

The draft PR must name each prerequisite PR URL and commit. Missing or superseded prerequisites block implementation and review rather than being approximated inside Batch D.

## Requirements

### R1 - One local and CI entrypoint

- Add one canonical `mise run docs:verify` command that runs the complete repository documentation contract and its focused regression suite.
- CI invokes that exact command. Remove or delegate the changed-only Markdown and standalone AI-doc definitions so rule logic is not duplicated in workflow YAML or another script.
- All parser, linter, and test dependencies are declared at fixed repository versions and installed through the existing package manager. The gate must not dynamically download tools with `npx`.
- The command is runnable from a clean checkout on every supported CI host after the normal frozen dependency install.

### R2 - Deterministic read-only execution

- Derive every source set from `git ls-files`; do not use an untracked recursive filesystem walk.
- Perform no network request, repository write, task mutation, formatter, generated-output update, or evidence recapture.
- Normalize diagnostics to repository-relative POSIX paths and sort by rule, source path, line, column, and message.
- Apply one documented diagnostic display cap while reporting both shown and total counts for every failing rule.
- Repeated runs on unchanged input produce byte-identical stdout/stderr and the same exit code.
- Every contract violation exits non-zero; a valid repository exits zero.

### R3 - Recursive Markdown and tracked-link contracts

- Lint all Git-tracked product-document `*.md` and `*.mdc` sources recursively under an explicit include/exclude policy.
- Exclude agent/platform instructions, `.trellis/` internals and archives, runtime/cache/generated/build/dependency trees, `.pen` content, and raw or immutable evidence from product-document parsing.
- Parse inline links and images through one Markdown AST implementation. Regex-only link parsing is forbidden.
- Skip external schemes and fragment-only URLs; decode and normalize relative paths, strip query/fragment for lookup, reject repository escapes, and require the resolved file or documented directory index to be Git-tracked.
- Preserve the exact scope and resolution behavior handed off by Batch C. A new false positive requires a focused fixture and an explicit scope decision, not a silent broad exclusion.

### R4 - Trellis, TODO, metadata, and completion contracts

- Parse every active and archived `task.json` as structured JSON and report malformed or duplicate task identities.
- Require active tasks to have exactly one assignee plus non-empty `meta.nextAction`, `meta.blocker`, and `meta.evidence`.
- Require active parent/child links to be bidirectionally consistent and free of dangling children.
- Fail when a completed task remains in the active task root, or when an archived task lacks completed status/date metadata required by the converged lifecycle.
- Enforce the machine-checkable TODO-to-task references and active/completed distinctions produced by Batch A. Do not infer completion from task age, merged branches, or unchecked prose.
- Never mutate or normalize task metadata while checking it.

### R5 - Current release-note coverage

- Read the current version from root `package.json` and `apps/core-app/package.json`; fail if they differ or are invalid.
- Classify the version with `notes/release-notes.config.json`: `RELEASE <= 2.4.13` and `BETA <= 2.4.13-beta.23` are Legacy and require no backfill; only a version above its channel threshold requires the exact non-empty bilingual note pair.
- For an enforced version, validate the versioned H1, allowed sections, non-empty highlight lists, and matching bilingual section/bullet shape from `notes/RELEASE_NOTES_GUIDE.md`.
- Do not generate, translate, or rewrite release notes. Findings return to the bilingual owner.

### R6 - AI evidence consistency

- Preserve one implementation of the existing AI documentation assertions. The canonical docs command may call a shared checker or make `ai-docs:dev` a thin subset wrapper, but it must not maintain duplicate literal lists.
- Resolve the current CoreApp version at execution time and keep historical report version, current source state, exact-version packaged evidence, and production evidence as distinct states.
- Fail active documents that promote a historical 13/13 snapshot to current packaged evidence or claim current recapture complete without strict exact-version evidence.
- Raw historical evidence remains read-only and is not rewritten to satisfy an active summary.

### R7 - Active PRD placeholder contract

- Define the active PRD set from the converged TODO/navigation and active Trellis references, excluding archives, templates, raw evidence, generated content, and dormant historical plans.
- Detect unresolved placeholder tokens such as empty template sections, `TBD`, `TODO: fill`, angle-bracket evidence values, and equivalent Chinese sentinels through explicit rules.
- Keep a narrow, reviewed allowlist for literal product examples and intentional backlog language. Every allowlist entry names a path, rule, and rationale.
- Do not treat ordinary UI `placeholder` terminology, template syntax, or historical quotations as unresolved work without a rule-specific match.

### R8 - Focused regression fixtures

- Provide a valid repository-shaped fixture plus isolated failing fixtures for Markdown lint, missing and escaping links, Trellis hierarchy/meta/completed state, TODO consistency, release-note identity/shape, AI historical/current promotion, and active PRD placeholders.
- Include poison files under every excluded scope to prove they are not accidentally parsed.
- Assert each invalid fixture returns non-zero with a stable rule ID and path, while the valid fixture returns zero.
- Assert repeated output identity and repository read-only behavior. Tests may use disposable OS temporary directories but leave the repository unchanged.

### R9 - Ownership and delivery

- Batch D owns only the verifier, focused fixtures, canonical local command, CI invocation, and dependency/lock metadata required for those surfaces.
- Do not edit prerequisite prose to make the new gate green. Report failures to the owning child and update the integration commit instead.
- Do not edit either root README, the concurrent bilingual task directory, its owned What's Changed/release-note prose, or `.trellis/tasks/07-17-unify-ota-update-flow/task.json`.
- Open a draft stacked PR with prerequisite links and keep it unmerged until all prerequisites land; then rebuild or rebase on current `master` and rerun the same command.

## Acceptance Criteria

- [x] A single `mise run docs:verify` command runs all fixtures and the complete repository gate locally and in CI without dynamic downloads.
- [x] Two unchanged runs have byte-identical diagnostics and exit codes, and Git tracked/untracked state is unchanged before and after.
- [x] Recursive tracked product Markdown/MDC lint and AST-based relative-link validation pass with the documented scope and zero repository-escape targets.
- [x] Active/archived Trellis hierarchy, owner/meta, TODO reference, and completed-state checks pass without mutating task files.
- [x] Root/CoreApp versions match; a legacy current version is accepted without notes, while an above-baseline version requires exact current bilingual notes satisfying the guide's version, section, and bullet-shape contract.
- [x] AI active documents distinguish historical, current source, packaged, and production evidence; the historical 13/13 snapshot is not promoted.
- [x] Active PRDs contain no unresolved placeholder under the explicit rules and reviewed allowlist.
- [x] Every rule family has a stable failing fixture, the valid and excluded-scope fixtures pass, and output-cap summaries retain total counts.
- [x] CI contains one invocation of the canonical docs command and no duplicated changed-only Markdown or AI rule implementation.
- [x] The draft PR records all four prerequisite PRs/commits, owned files, commands/output, and leaves prerequisite prose plus concurrent bilingual/OTA paths untouched.

## Out of Scope

- Repairing documentation content owned by Batches A, B, C, or the bilingual task.
- Network/external-link validation, anchor correctness beyond deterministic parser support, spelling, style rewriting, or generated documentation.
- Publishing release notes, creating artifacts, recapturing evidence, changing task status, or merging any PR.
