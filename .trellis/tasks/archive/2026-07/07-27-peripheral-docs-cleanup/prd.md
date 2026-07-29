# Repair peripheral product documentation

## Goal

Make tracked product documentation navigable and accurate across CoreApp, Search, Nexus, DivisionBox, download API, and TuffEx surfaces without creating placeholder pages or overlapping root README ownership.

## Confirmed facts

- This repository contains hundreds of tracked Markdown/MDC files, while current CI only lints a narrow changed Markdown selection and does not validate relative target existence.
- Named repair surfaces include `apps/core-app/README.md`, the Search Engine README, Nexus release/download indexes, DivisionBox example README, bilingual download API pages, and `packages/tuffex/CONTRIBUTING.md`.
- `README.md` and `README.zh-CN.md` belong exclusively to Batch B.
- Agent instructions, Trellis internals, runtime state, generated/dependency output, `.pen` files, and raw evidence are not product-document cleanup scope.

## Requirements

### R1 - Deterministic link inventory

- Enumerate source files from `git ls-files`, not an untracked filesystem walk.
- Restrict the cleanup to product-document Markdown/MDC sources and record the exact include/exclude rules in the PR.
- Parse inline Markdown links and images through a Markdown parser; do not use a regex-only rewrite.
- Ignore external schemes, absolute web URLs, mail links, and fragment-only links for filesystem existence checks.
- Decode relative paths, strip query/fragment components for target lookup, resolve from the source document, and reject targets that escape the repository.
- Sort findings by source path and link position so repeated runs are stable.

### R2 - Repair strategy

For every broken relative target, choose one evidence-backed action:

1. point to an existing canonical document;
2. update a renamed/moved path while preserving the intended destination;
3. remove a stale link and its false promise when no maintained destination exists.

Do not create empty, redirect-only, or placeholder documents solely to make the audit pass. Do not silently replace a specific promise with an unrelated generic page.

### R3 - Named surface refresh

- Refresh `apps/core-app/README.md` for current package purpose, supported entrypoints, and canonical project links.
- Refresh `apps/core-app/src/main/modules/box-tool/search-engine/README.md` for current architecture and maintained search/index documentation links, without claiming unfinished search-split behavior.
- Repair Nexus release/download navigation and bilingual download API links against existing routes and canonical docs.
- Repair `apps/nexus/examples/division-box/README.md` so setup and referenced assets/examples exist.
- Refresh `packages/tuffex/CONTRIBUTING.md` to current package commands, contribution paths, and canonical guidance.

### R4 - Ownership boundaries

- Do not edit root `README.md` or `README.zh-CN.md`; report those findings to Batch B.
- Do not edit the concurrent bilingual task, its What's Changed/release-note files, or the OTA parent `task.json`.
- Do not rewrite archived/raw evidence, agent instructions, Trellis internals, runtime files, generated docs, dependencies, or `.pen` content.
- Do not edit production source merely because a document refers to it.

### R5 - Focused validation

- Rerun the same tracked relative-link inventory and require zero in-scope failures.
- Lint changed Markdown/MDC files and run `git diff --check`.
- Verify all newly selected canonical targets are Git-tracked.
- Skip formatters, project-wide lint, typecheck, build, and product test suites.

## Acceptance Criteria

- [ ] The PR contains a stable, Git-tracked inventory of all in-scope broken inline relative links found before repair.
- [ ] The rerun reports zero broken in-scope relative targets and no repository-escape target.
- [ ] CoreApp, Search, Nexus release/download, DivisionBox, download API, and TuffEx named surfaces reflect maintained paths and current behavior.
- [ ] Every repaired link points to a canonical existing tracked target, or the stale promise is removed with rationale.
- [ ] No placeholder document is created to satisfy the checker.
- [ ] Root READMEs, concurrent bilingual/What's Changed paths, OTA parent metadata, production source, and excluded evidence/runtime/generated scopes have no diff.
- [ ] Focused Markdown/MDC lint and `git diff --check` pass.
- [ ] A dedicated PR is open with branch, commit, before/after link counts, validation output, owned files, and planning-PR dependency.

## Out of Scope

- Root README stable/version/dependency wording.
- Creating the permanent repository documentation gate; Batch D owns it.
- Validating external websites or network availability.
- Broad editorial rewrites unrelated to broken navigation or named-surface accuracy.
